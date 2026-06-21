// server/federation/peer.js
//
// Network layer for cross-server collaboration: address normalisation,
// request signing between paired servers, the outbound calls a server
// makes to its peer, and the periodic "tick" that (a) keeps retrying an
// in-flight pairing handshake until it settles — so an invitation sent
// while the peer was offline still lands when it comes back — and
// (b) health-checks every active link so the UI always knows whether
// the peer is reachable / locked / version-compatible.
//
// SECURITY
//   - Transport is HTTPS only and certificates are verified by Node's
//     default fetch. A self-signed peer therefore fails by design: note
//     content crosses this link in the clear (re-encrypted on each side
//     under that side's own key), so an unverifiable peer must not be
//     trusted. The TLS error surfaces in the link's last_error.
//   - Once paired, every server-to-server call is signed with the
//     shared secret (HMAC-SHA256 over method+path+timestamp+body) and
//     carries a fresh timestamp, rejecting replays outside a short
//     window.
//   - The pairing invite/accept exchange predates the shared secret and
//     is therefore unsigned; it is protected instead by (1) the
//     accepting admin visibly confirming the initiator's address and
//     (2) a random nonce from the invite that the acceptance must echo,
//     so only a server that actually received the invite can complete
//     it, and the secret only ever travels to the address the admin saw.

const crypto = require("crypto");
const protocol = require("./protocol");

// Hysteresis: track consecutive probe failures per link in memory so a
// single transient timeout (e.g. the peer's event-loop blocked by a
// SQLite VACUUM at unlock time) does not immediately flip the link to
// OFFLINE and spam state-change notifications. Two consecutive failures
// in a row are required before we actually declare the peer unreachable.
const _failCounts = new Map();
const OFFLINE_THRESHOLD = 2;

const REQUEST_TIMEOUT_MS = 8000;
const SIGNATURE_WINDOW_MS = 2 * 60 * 1000; // accept timestamps within ±2 min

// Force a bare "host:port" or "https://host" into a clean https origin.
// Returns null for anything we refuse to talk to (notably plain http —
// federation requires verified TLS).
function normalizeBaseUrl(input) {
  if (!input || typeof input !== "string") return null;
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (!u.hostname) return null;
  return u.origin; // protocol + host (+ non-default port), no path/query
}

// ── Request signing ──────────────────────────────────────────────────
function signaturePayload(method, path, ts, bodyString) {
  return `${String(method).toUpperCase()}\n${path}\n${ts}\n${bodyString || ""}`;
}

function computeSignature(secret, method, path, ts, bodyString) {
  return crypto
    .createHmac("sha256", Buffer.from(String(secret), "utf8"))
    .update(signaturePayload(method, path, ts, bodyString), "utf8")
    .digest("base64");
}

// Verify an inbound signed request. `link` is the row matched from the
// x-gk-fed-link header; headers carry the timestamp + signature.
function verifySignedRequest(link, { method, path, headers, rawBody }) {
  if (!link || !link.shared_secret) return false;
  const ts = Number(headers["x-gk-fed-ts"]);
  const sig = headers["x-gk-fed-sig"];
  if (!Number.isFinite(ts) || !sig) return false;
  if (Math.abs(Date.now() - ts) > SIGNATURE_WINDOW_MS) return false;
  const expected = computeSignature(link.shared_secret, method, path, ts, rawBody);
  const a = Buffer.from(String(sig));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ── Outbound calls ───────────────────────────────────────────────────
async function httpJson(url, { method = "POST", body, secret, linkId, path } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const bodyString = body == null ? "" : JSON.stringify(body);
  const headers = { "content-type": "application/json", accept: "application/json" };
  // Signed (active-link) calls carry the link id, a timestamp and the
  // HMAC. Handshake calls (no secret yet) go without.
  if (secret && linkId && path) {
    const ts = Date.now();
    headers["x-gk-fed-link"] = linkId;
    headers["x-gk-fed-ts"] = String(ts);
    headers["x-gk-fed-sig"] = computeSignature(secret, method, path, ts, bodyString);
  }
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : bodyString,
      signal: ctrl.signal,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON or empty body */
    }
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

// Deliver the pairing invitation to the peer. Unsigned (no secret yet).
function sendInvite(link, { label }) {
  const path = "/api/federation/pair/invite";
  return httpJson(link.peer_base_url + path, {
    method: "POST",
    body: {
      linkId: link.id,
      initiatorBaseUrl: link.local_base_url,
      initiatorLabel: label || null,
      nonce: link.nonce,
      protocol: protocol.PROTOCOL_VERSION,
      protocolMin: protocol.PROTOCOL_MIN_SUPPORTED,
    },
  });
}

// Deliver our acceptance (and the freshly generated shared secret) back
// to the initiator, at the exact address it advertised in the invite.
function sendAccept(link, { label }) {
  const path = "/api/federation/pair/accept";
  return httpJson(link.peer_base_url + path, {
    method: "POST",
    body: {
      linkId: link.id,
      acceptorBaseUrl: link.local_base_url,
      acceptorLabel: label || null,
      sharedSecret: link.shared_secret,
      nonce: link.nonce,
      protocol: protocol.PROTOCOL_VERSION,
      protocolMin: protocol.PROTOCOL_MIN_SUPPORTED,
    },
  });
}

// Signed health probe of an active link. Returns the peer's self-report
// so the tick can fold it into the link's live state.
function probeHealth(link) {
  const path = "/api/federation/health";
  return httpJson(link.peer_base_url + path, {
    method: "POST",
    body: { linkId: link.id },
    secret: link.shared_secret,
    linkId: link.id,
    path,
  });
}

// ── The tick ─────────────────────────────────────────────────────────
// Drives every link that still needs outbound work. Safe to call as
// often as we like; it only touches links in a non-terminal state.
// `onStateChange(link, prevState, nextState)` fires whenever an active
// link's live state flips (e.g. online → offline), so the caller can
// proactively tell the admins instead of waiting for them to look.
async function runTick({ store, label, log = console, onStateChange, onDissociated }) {
  let links;
  try {
    links = [...store.listHandshakePending(), ...store.listActive()];
  } catch (e) {
    log.warn?.("[federation] tick: list failed:", e?.message);
    return;
  }

  for (const link of links) {
    try {
      if (link.status === protocol.STATUS.OUTGOING_PENDING) {
        if (!link.invite_delivered) {
          const r = await sendInvite(link, { label });
          if (r.ok) store.markInviteDelivered(link.id);
        }
        continue;
      }
      if (link.status === protocol.STATUS.ACCEPTING) {
        const r = await sendAccept(link, { label });
        if (r.ok) store.setStatus(link.id, protocol.STATUS.ACTIVE);
        continue;
      }
      if (link.status === protocol.STATUS.ACTIVE) {
        await healthCheckOne(link, store, log, onStateChange, onDissociated);
      }
    } catch (e) {
      log.warn?.(`[federation] tick: link ${link.id} failed:`, e?.message);
    }
  }
}

async function healthCheckOne(link, store, log = console, onStateChange, onDissociated) {
  const prevState = protocol.deriveLinkState(link);
  const attemptedAt = new Date().toISOString();
  const host = link.peer_base_url;
  try {
    const r = await probeHealth(link);

    // Durable dissociation detection: a clean 404 "unknown link" means the
    // peer deliberately removed this link (unpaired) — distinct from a
    // generic outage. Drop our side too and let the caller notify, so a
    // unpair that happened while WE were offline is still picked up here.
    if (r.status === 404 && r.json && r.json.error === "unknown link") {
      _failCounts.delete(link.id);
      log.log?.(`[federation] health ${host} → DISSOCIATED (peer unpaired us)`);
      try { store.remove(link.id); } catch { /* best-effort */ }
      if (typeof onDissociated === "function") {
        try { onDissociated(link); } catch (e) { log.warn?.("[federation] onDissociated failed:", e?.message); }
      }
      return;
    }

    // A health check only counts as "online" when we get our OWN signed
    // 200 with { ok:true } back. Anything else — a 5xx from a reverse
    // proxy whose GlassKeep backend is actually DOWN, a proxy "service
    // unavailable" HTML page (200 but no JSON), a 403/404 because the
    // link/secret no longer matches — means the peer GlassKeep is not
    // healthily answering, so we must treat it as unreachable. (This is
    // the fix for "proxy up + LXC down still showed Online".)
    if (!r.ok || !r.json || r.json.ok !== true) {
      const err = r.json?.error || `http ${r.status || "no-response"}`;
      const fails = (_failCounts.get(link.id) || 0) + 1;
      _failCounts.set(link.id, fails);
      log.log?.(
        `[federation] health ${host} → DOWN (${fails}/${OFFLINE_THRESHOLD}, status=${r.status || "none"}, err=${err})`,
      );
      store.updateHealth(link.id, {
        last_attempt_at: attemptedAt,
        // Only flip to unreachable after OFFLINE_THRESHOLD consecutive failures;
        // on the first failure keep the last-known health values so a brief
        // timeout does not immediately trigger an "offline" notification.
        peer_reachable: fails >= OFFLINE_THRESHOLD ? 0 : link.peer_reachable,
        peer_locked: fails >= OFFLINE_THRESHOLD ? null : link.peer_locked,
        protocol_compatible: fails >= OFFLINE_THRESHOLD ? null : link.protocol_compatible,
        agreed_protocol: fails >= OFFLINE_THRESHOLD ? null : link.agreed_protocol,
        last_error: err,
      });
    } else {
      _failCounts.delete(link.id);
      const body = r.json;
      const neg = protocol.negotiateProtocol(body.protocol, body.protocolMin);
      log.log?.(
        `[federation] health ${host} → OK (locked=${!!body.locked}, ver=${body.appVersion || "?"}, proto=${body.protocol}, compatible=${neg.compatible})`,
      );
      store.updateHealth(link.id, {
        last_attempt_at: attemptedAt,
        last_seen_at: attemptedAt,
        peer_reachable: 1,
        peer_locked: body.locked ? 1 : 0,
        peer_app_version: body.appVersion || null,
        peer_protocol: Number.isInteger(body.protocol) ? body.protocol : null,
        protocol_compatible: neg.compatible ? 1 : 0,
        agreed_protocol: neg.agreed,
        last_error: neg.compatible ? null : "protocol-incompatible",
      });
      // Adopt the peer's self-chosen name as our label for it when we
      // don't have one yet — so the cross-server badge shows a real name
      // even on links paired before the name became mandatory. A manual
      // rename (non-empty label) is left untouched.
      if (body.label && !link.peer_label) {
        try {
          store.updatePeerLabel(link.id, String(body.label).slice(0, 24));
        } catch { /* best-effort */ }
      }
    }
  } catch (e) {
    // Network / TLS failure → peer is offline (or its certificate can't
    // be verified). Keep the message so the panel can explain it.
    const err = tlsAwareMessage(e);
    const fails = (_failCounts.get(link.id) || 0) + 1;
    _failCounts.set(link.id, fails);
    log.log?.(`[federation] health ${host} → UNREACHABLE (${fails}/${OFFLINE_THRESHOLD}, ${err})`);
    store.updateHealth(link.id, {
      last_attempt_at: attemptedAt,
      peer_reachable: fails >= OFFLINE_THRESHOLD ? 0 : link.peer_reachable,
      peer_locked: fails >= OFFLINE_THRESHOLD ? null : link.peer_locked,
      protocol_compatible: fails >= OFFLINE_THRESHOLD ? null : link.protocol_compatible,
      agreed_protocol: fails >= OFFLINE_THRESHOLD ? null : link.agreed_protocol,
      last_error: err,
    });
  }

  // Did the live state flip? If so, let the caller notify the admins.
  const updated = store.getById(link.id);
  const nextState = updated ? protocol.deriveLinkState(updated) : prevState;
  if (updated && nextState !== prevState) {
    log.log?.(`[federation] state change ${host}: ${prevState} → ${nextState}`);
    if (typeof onStateChange === "function") {
      try {
        onStateChange(updated, prevState, nextState);
      } catch (e) {
        log.warn?.("[federation] onStateChange failed:", e?.message);
      }
    }
  }
}

function tlsAwareMessage(e) {
  const msg = e?.cause?.code || e?.code || e?.message || "unreachable";
  if (/CERT|SELF_SIGNED|ALT_NAME|UNABLE_TO_VERIFY/i.test(String(msg))) {
    return "tls-certificate-invalid";
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(String(msg))) return "dns-not-found";
  if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET|aborted|abort/i.test(String(msg))) {
    return "connection-refused";
  }
  return String(msg).slice(0, 120);
}

module.exports = {
  normalizeBaseUrl,
  computeSignature,
  verifySignedRequest,
  httpJson,
  sendInvite,
  sendAccept,
  probeHealth,
  runTick,
  healthCheckOne,
  tlsAwareMessage,
  REQUEST_TIMEOUT_MS,
  SIGNATURE_WINDOW_MS,
};
