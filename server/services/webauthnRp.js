// server/services/webauthnRp.js
//
// Decides which domain a passkey belongs to.
//
// WebAuthn ties every credential to a "relying party ID", normally the
// bare hostname. Both ends check it: the browser refuses to hand a
// credential to a page whose domain does not match, and the server
// checks the same thing again when it verifies the signature. Two
// independent checks, on purpose.
//
// The second one was not independent. With no explicit configuration
// the server took the domain from the request's own Host header, and
// from X-Forwarded-Host as soon as any proxy was declared. Both are
// written by whoever sends the request, so the server was checking the
// answer against a value the caller had just supplied. What remained
// was the browser's check alone.
//
// The order below only ever uses sources the caller cannot write:
//
//   1. WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN. The operator said it. Done.
//   2. The domain an admin declared from the admin panel, stored in
//      app_settings and pushed here by setDeclaredRpId(). An admin
//      typing their own domain is the same act as the operator setting
//      the variable: a deliberate statement by someone who already runs
//      the instance, not a header a stranger wrote.
//   3. The names in the server's own TLS certificate, when it
//      terminates TLS itself. The browser reached us through one of
//      them or the connection would not exist.
//   4. The request host, and only when it names something local: a
//      loopback or private address, or a name that has no meaning
//      outside the local network. Forging it buys an attacker a domain
//      they already had to be inside the network to use, and it keeps
//      development and LAN installs working with no configuration.
//   5. Otherwise the ceremony is refused, pointing at the panel.
//      A public deployment has to say its own domain once.
//
// Note that step 5 is not the drama it looks like. A forged domain has
// never been enough to steal an account: the authenticator signs over
// the domain the browser gave it, so a mismatched expectation makes
// verification fail rather than succeed. What was lost is the second
// check, and this puts it back.

const fs = require("fs");
const net = require("net");
const crypto = require("crypto");
const { isPrivateAddress } = require("../ai/endpointGuard");

const REASON = Object.freeze({
  UNDECIDABLE: "webauthn_rp_undecidable",
});

// Names that cannot mean anything outside the local network.
const LOCAL_SUFFIXES = [".local", ".lan", ".home", ".home.arpa", ".internal", ".localdomain"];

// What the admin panel accepts as a domain: a dotted host name, nothing
// else. No scheme, no port, no path: those are the shapes people paste
// out of a browser bar, and silently trimming them would store a domain
// the admin never checked. WebAuthn forbids an IP address as a relying
// party id, so one is refused here rather than at ceremony time.
const RP_ID_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

function isValidRpId(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v || net.isIP(v)) return false;
  return RP_ID_RE.test(v);
}

// The domain an admin declared in the panel. index.js seeds this at boot
// from app_settings and rewrites it on every change, the same way it
// mirrors the other admin settings in memory.
let declaredRpId = "";

function setDeclaredRpId(value) {
  declaredRpId = isValidRpId(value) ? String(value).trim().toLowerCase() : "";
  return declaredRpId;
}

function getDeclaredRpId() {
  return declaredRpId;
}

function isLocalHostname(hostname) {
  const h = String(hostname || "").trim().replace(/^\[|\]$/g, "").toLowerCase();
  if (!h) return false;
  if (net.isIP(h)) return isPrivateAddress(h);
  if (h === "localhost") return true;
  // A single label has no public namespace to belong to.
  if (!h.includes(".")) return true;
  return LOCAL_SUFFIXES.some((s) => h.endsWith(s));
}

// ── The server's own certificate ─────────────────────────────────────
// Read once and remembered, keyed by path and modification time so a
// renewed certificate is picked up without a code change.
let certCache = { path: null, mtimeMs: 0, names: [] };

function certificateNames(env) {
  const file = env.SSL_CERT;
  if (!file || env.HTTPS_ENABLED === "false") return [];
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return [];
  }
  if (certCache.path === file && certCache.mtimeMs === stat.mtimeMs) return certCache.names;

  const names = [];
  try {
    const cert = new crypto.X509Certificate(fs.readFileSync(file));
    // subjectAltName reads "DNS:a.example, DNS:b.example, IP Address:10.0.0.1".
    for (const entry of String(cert.subjectAltName || "").split(",")) {
      const [kind, ...rest] = entry.trim().split(":");
      const value = rest.join(":").trim();
      if (!value) continue;
      if (kind === "DNS" || kind === "IP Address") names.push(value.toLowerCase());
    }
    if (!names.length) {
      const cn = /CN=([^,/]+)/.exec(cert.subject || "");
      if (cn) names.push(cn[1].trim().toLowerCase());
    }
  } catch {
    // An unreadable or unparseable certificate simply contributes
    // nothing; the next step in the order takes over.
  }
  certCache = { path: file, mtimeMs: stat.mtimeMs, names };
  return names;
}

// Wraps a hostname for use inside a URL: an IPv6 literal needs brackets.
function forUrl(hostname) {
  return net.isIP(hostname) === 6 && !hostname.startsWith("[") ? `[${hostname}]` : hostname;
}

// The port the browser reached us on is not knowable when something
// else terminates TLS, so both the bare origin and the one carrying our
// listening port are offered. Every candidate still comes from a source
// the caller cannot write, which is what matters.
function originsFor(hostname, proto, port) {
  const host = forUrl(hostname);
  const list = [`${proto}://${host}`];
  const isDefault = (proto === "https" && String(port) === "443")
    || (proto === "http" && String(port) === "80");
  if (port && !isDefault) list.push(`${proto}://${host}:${port}`);
  return list;
}

// A declared origin that does not parse is treated as not declared, so
// a typo falls through to the next source instead of turning every
// passkey call into an opaque failure.
function parseOrigin(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

// The origins this request appears to come from. Used only where the
// caller's host has already been vouched for by something else, never
// on its own.
function requestOrigins(req, listenPort) {
  const authority = String(req?.headers?.host || "");
  const hostname = String(req?.hostname || authority.split(":")[0] || "").toLowerCase();
  if (!hostname) return [];
  const port = authority.includes(":") ? authority.split(":").pop() : listenPort;
  const proto = req?.protocol === "https" || req?.secure ? "https" : "http";
  return originsFor(hostname, proto, port);
}

// An id declared with no origin beside it: WEBAUTHN_RP_ID on its own, or
// the domain an admin typed in the panel. WebAuthn lets a credential
// registered for "example.com" be used on "notes.example.com", and that
// split is a normal way to configure this, so the request's own host is
// accepted as an origin when the spec itself would allow it for the
// declared id. A forged host fails that test, which is the point.
function fromDeclaredId(rpId, req, listenPort, source) {
  const origins = originsFor(rpId, "https", listenPort);
  for (const candidate of requestOrigins(req, listenPort)) {
    const host = new URL(candidate).hostname.toLowerCase();
    if ((host === rpId || host.endsWith(`.${rpId}`)) && !origins.includes(candidate)) {
      origins.push(candidate);
    }
  }
  return { ok: true, rpId, origins, source };
}

/**
 * Resolve the relying party for this request.
 * Returns { ok: true, rpId, origins, source } or { ok: false, reason }.
 */
function resolveRp(req, env = process.env) {
  const listenPort = env.API_PORT || env.PORT || "";

  // 1. What the operator declared.
  const declaredOrigin = parseOrigin(env.WEBAUTHN_ORIGIN);
  if (env.WEBAUTHN_RP_ID || declaredOrigin) {
    const rpId = env.WEBAUTHN_RP_ID || declaredOrigin.hostname.replace(/^\[|\]$/g, "");
    if (declaredOrigin) {
      return {
        ok: true,
        rpId,
        origins: [declaredOrigin.origin],
        source: "configured",
      };
    }
    return fromDeclaredId(rpId, req, listenPort, "configured");
  }

  // 2. What an admin declared in the panel.
  if (declaredRpId) {
    return fromDeclaredId(declaredRpId, req, listenPort, "admin");
  }

  // 3. What our own certificate says. Preferred over anything in the
  //    request: the browser reached one of these names or there would
  //    be no connection to answer.
  const hostname = String(req?.hostname || "").toLowerCase()
    || String(req?.headers?.host || "").split(":")[0].toLowerCase();
  const certNames = certificateNames(env);
  if (certNames.length) {
    // A certificate usually carries several names. Pick the one the
    // request claims when it is among them, so a server whose SAN list
    // starts with "localhost" still answers with the real domain to a
    // browser that came in on it. The choice stays confined to the
    // certificate, so a forged host cannot introduce a name of its own.
    const rpId = certNames.includes(hostname) ? hostname : certNames[0];
    const origins = certNames.flatMap((n) => originsFor(n, "https", listenPort));
    return { ok: true, rpId, origins, source: "certificate" };
  }

  // 4. The request host, only when it names something local. Express
  //    has already applied the operator's proxy policy to it, so
  //    X-Forwarded-Host only counts when it came from a hop the
  //    operator trusts.
  if (isLocalHostname(hostname)) {
    return {
      ok: true,
      rpId: hostname,
      origins: requestOrigins(req, listenPort),
      source: "local-request",
    };
  }

  // 5. Nothing trustworthy to go on.
  return { ok: false, reason: REASON.UNDECIDABLE };
}

// One line at boot so the operator knows which case applies to them,
// before a passkey fails rather than after.
function describeConfig(env = process.env) {
  if (env.WEBAUTHN_RP_ID || env.WEBAUTHN_ORIGIN) {
    return `[passkeys] relying party from configuration (${env.WEBAUTHN_RP_ID || env.WEBAUTHN_ORIGIN})`;
  }
  if (declaredRpId) {
    return `[passkeys] relying party from the admin panel (${declaredRpId})`;
  }
  const certNames = certificateNames(env);
  if (certNames.length) {
    return `[passkeys] relying party from the TLS certificate (${certNames.join(", ")})`;
  }
  return "[passkeys] no relying party configured: passkeys will work on a local address, "
    + "and are refused on a public domain until an admin sets the passkey domain in the "
    + "admin panel (or WEBAUTHN_RP_ID is set). The request's Host header is not trusted "
    + "for this, it is written by the caller.";
}

module.exports = {
  REASON,
  resolveRp,
  describeConfig,
  isLocalHostname,
  isValidRpId,
  setDeclaredRpId,
  getDeclaredRpId,
};
