// server/ai/endpointGuard.js
//
// Guards the one place where GlassKeep connects to an address somebody
// typed: the OpenAI-compatible AI endpoint.
//
// THE TENSION, because it decides everything here. Pointing at a model on
// your own machine or LAN is not an accident to be blocked, it is the setup
// the README recommends for privacy ("prefer a local setup such as Ollama +
// Open WebUI on your LAN"). Refusing private addresses outright would break
// the most private way to use the feature.
//
// So the line is drawn at WHO typed the address, not at which address it is:
//
//   - The admin configures the server AI. Reaching the LAN is their job, and
//     they already hold enough privilege to do far worse. Unrestricted.
//   - A regular user configuring their OWN endpoint is a different matter.
//     Without a limit, any account on the instance can make the server
//     connect anywhere on the network it sits in and report back what
//     answered, which turns a note-taking app into a probe of the operator's
//     home network. Private destinations are refused unless the admin has
//     explicitly allowed them.
//
// The check happens at the moment of connection, not before it. Validating a
// hostname and then handing it to fetch leaves a window where DNS answers
// one address to the check and another to the connection; resolving through
// this module's lookup closes it, because the socket goes to the very
// address that was inspected.

const dns = require("dns");
const net = require("net");
const { Agent } = require("undici");

// Reasons are machine tokens: the client maps them to a localized string.
const REASON = Object.freeze({
  MALFORMED: "ai_url_malformed",
  SCHEME: "ai_url_scheme",
  CREDENTIALS: "ai_url_credentials",
  PRIVATE: "ai_url_private_forbidden",
  UNRESOLVABLE: "ai_url_unresolvable",
});

// Accept only what an HTTP API can live at. Anything else (file:, ftp:,
// data:, …) has no business here and has historically been the interesting
// half of this bug class.
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function normalizeProviderUrl(raw) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { ok: false, reason: REASON.MALFORMED };
  let u;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, reason: REASON.MALFORMED };
  }
  if (!ALLOWED_PROTOCOLS.has(u.protocol)) return { ok: false, reason: REASON.SCHEME };
  if (!u.hostname) return { ok: false, reason: REASON.MALFORMED };
  // user:pass@host smuggles credentials into a value that gets logged and
  // shown back in settings; there is no reason for one here.
  if (u.username || u.password) return { ok: false, reason: REASON.CREDENTIALS };
  return { ok: true, url: u, href: u.href };
}

// Everything that is not reachable from the public internet, plus the ranges
// whose whole point is to name something local.
function isPrivateAddress(addr) {
  const ip = String(addr || "").replace(/^\[|\]$/g, "");
  const v = net.isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p[0] === 10) return true;                                  // 10/8
    if (p[0] === 127) return true;                                 // loopback
    if (p[0] === 0) return true;                                   // "this network"
    if (p[0] === 169 && p[1] === 254) return true;                 // link-local
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;     // 172.16/12
    if (p[0] === 192 && p[1] === 168) return true;                 // 192.168/16
    if (p[0] === 192 && p[1] === 0 && p[2] === 0) return true;     // IETF protocol
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;    // CGNAT
    if (p[0] >= 224) return true;                                  // multicast + reserved
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80")) return true;                     // link-local
    if (/^f[cd]/.test(lower)) return true;                         // unique-local
    // IPv4 written the IPv6 way still points where it points.
    const mapped = lower.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  // Not an address at all: treat as private rather than guess.
  return true;
}

// dns.lookup with a verdict attached. Used both for the pre-flight message
// and, below, as the resolver the connection itself goes through.
function lookupAll(hostname) {
  return new Promise((resolve) => {
    if (net.isIP(hostname)) return resolve([hostname]);
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err || !addresses?.length) return resolve(null);
      resolve(addresses.map((a) => a.address));
    });
  });
}

// A dispatcher that refuses to connect to a private address, whatever DNS
// says at the moment of connecting. One instance, reused: agents pool
// sockets and creating one per request would leak them.
let guardedAgent = null;
function publicOnlyDispatcher() {
  if (guardedAgent) return guardedAgent;
  guardedAgent = new Agent({
    connect: {
      lookup(hostname, options, callback) {
        if (net.isIP(hostname)) {
          if (isPrivateAddress(hostname)) {
            return callback(Object.assign(new Error(REASON.PRIVATE), { code: "GK_PRIVATE_ADDRESS" }));
          }
          return callback(null, hostname, net.isIP(hostname));
        }
        dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
          if (err) return callback(err);
          const list = Array.isArray(addresses) ? addresses : [addresses];
          // One private answer is enough to refuse: a name that resolves to
          // both is exactly the shape a rebinding attempt takes.
          if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
            return callback(Object.assign(new Error(REASON.PRIVATE), { code: "GK_PRIVATE_ADDRESS" }));
          }
          if (options?.all) return callback(null, list);
          return callback(null, list[0].address, list[0].family);
        });
      },
    },
  });
  return guardedAgent;
}

// Pre-flight, so the caller gets "that address is not allowed" instead of a
// bare connection error. The dispatcher above is what actually enforces it.
async function checkDestination(rawUrl, { allowPrivate }) {
  const parsed = normalizeProviderUrl(rawUrl);
  if (!parsed.ok) return parsed;
  if (allowPrivate) return { ok: true, url: parsed.url };
  const addresses = await lookupAll(parsed.url.hostname);
  if (!addresses) return { ok: false, reason: REASON.UNRESOLVABLE };
  if (addresses.some(isPrivateAddress)) return { ok: false, reason: REASON.PRIVATE };
  return { ok: true, url: parsed.url };
}

module.exports = {
  REASON,
  normalizeProviderUrl,
  isPrivateAddress,
  checkDestination,
  publicOnlyDispatcher,
};
