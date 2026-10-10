// server/routes/federationRoutes.js
//
// HTTP surface for cross-server collaboration ("federation"). Two
// distinct groups of endpoints:
//
//   1. SERVER-TO-SERVER (/api/federation/*) — called by the OTHER
//      GlassKeep server, never by a browser. No JWT. The pairing
//      handshake is gated by a human admin accepting + a nonce; every
//      post-pairing call is HMAC-signed with the shared secret. These
//      stay reachable even when the instance is at-rest-locked, because
//      the health probe must be able to answer "I'm up but locked".
//
//   2. ADMIN (/api/admin/federation/*) — the Federation panel. JWT +
//      adminOnly. Create/accept/refuse invitations, repair a peer's
//      address after it moves, rename, unpair, force a re-check.
//
// The pairing flow, end to end:
//   A.admin enters B's address  → A creates an OUTGOING_PENDING link
//   tick on A  → POST B /pair/invite (retried until B is reachable, so
//                an invite sent while B was down still lands later)
//   B receives → INCOMING_PENDING link + SSE toast to B's admins; it is
//                durable, so B's admin sees it even if they were offline
//                when it arrived (the panel lists it on next open)
//   B.admin accepts → B generates the shared secret, goes ACCEPTING
//   tick on B  → POST A /pair/accept (carries the secret, to the exact
//                address A advertised — so only the real A receives it)
//   A receives → verifies the nonce it issued, stores the secret, ACTIVE
//   B's tick confirms A's 200 → ACTIVE
//   both ticks → POST /federation/health periodically → live state.
//
// Each group of endpoints has its own file, federationPeerRoutes.js and
// federationAdminRoutes.js. This one builds what they share (the store,
// the tick, the note engine) and attaches them, in that order.

const pkg = require("../../package.json");
const runtime = require("../encryption/runtimeUnlockState");
const protocol = require("../federation/protocol");
const peer = require("../federation/peer");
const { createFederationStore } = require("../federation/store");
const { createNoteFederation } = require("../federation/notes");
const { attachFederationPeerRoutes } = require("./federationPeerRoutes");
const { attachFederationAdminRoutes } = require("./federationAdminRoutes");

function attachFederationRoutes(
  app,
  { db, auth, adminOnly, log = console, broadcastToAdmins, noteDeps } = {},
) {
  const store = createFederationStore(db);
  // Friendly host (no scheme) for labels/log lines when a link has no
  // admin-given peer_label yet.
  const hostOf = (url) => String(url || "").replace(/^https?:\/\//i, "");
  // Note-level federation (sharing notes across a paired link). Only
  // wired when the host passes the note helpers it needs.
  const noteFederation = noteDeps
    ? createNoteFederation({ db, store, peer, deps: noteDeps, log })
    : null;
  const getLabelStmt = db.prepare(
    `SELECT federation_self_name, custom_app_name FROM app_settings WHERE id = 1`,
  );
  const setSelfNameStmt = db.prepare(
    `UPDATE app_settings SET federation_self_name = ? WHERE id = 1`,
  );
  // Friendly names must fit the collaborator badge; keep them short.
  const MAX_LABEL_LEN = 24;

  function localLabel() {
    try {
      const row = getLabelStmt.get() || {};
      // Prefer the dedicated federation name; fall back to the app's
      // display name so an existing pairing keeps a sensible label.
      const name = (row.federation_self_name || row.custom_app_name || "").trim();
      return name || null;
    } catch {
      return null;
    }
  }

  // Local user search for the federation share UI (real names, never
  // shadow rows). `ref` is what the peer passes back to share with them.
  const searchLocalUsersStmt = db.prepare(`
    SELECT name, email, avatar_url FROM users
    WHERE (name LIKE ? OR email LIKE ?) AND federated_origin IS NULL
    ORDER BY name ASC LIMIT 100
  `);
  // "Locked" = at-rest encryption is enabled but hasn't been unlocked,
  // so this instance currently can't read or write note content.
  // Reported truthfully to peers so they show the precise "reachable
  // but locked" state rather than a vague "offline".
  function isLocked() {
    return runtime.isEnabled() && !runtime.isUnlocked();
  }
  function selfReport(extra) {
    return {
      ok: true,
      label: localLabel(),
      appVersion: pkg.version,
      protocol: protocol.PROTOCOL_VERSION,
      protocolMin: protocol.PROTOCOL_MIN_SUPPORTED,
      ...extra,
    };
  }

  // Server-sent notice to every admin. Best-effort: a failed broadcast
  // never fails the request or the tick that triggered it.
  function notifyAdmins(event) {
    try {
      broadcastToAdmins?.(event);
    } catch {
      /* SSE best-effort */
    }
  }

  // Proactively tell every admin the moment a link's connectivity flips
  // (so they don't have to be staring at the panel to learn the peer went
  // down or came back), and re-broadcast the notes riding the link so
  // every open copy flips to/from read-only at once. Shared by the
  // periodic tick AND the on-demand "Re-check".
  function onLinkStateFlip(link, previousState, state) {
    notifyAdmins({
      type: "federation_link_state",
      linkId: link.id,
      peerBaseUrl: link.peer_base_url,
      peerLabel: link.peer_label || null,
      state,
      previousState,
    });
    try {
      noteFederation?.onLinkStateChanged(link.id);
    } catch {
      /* best-effort */
    }
    // Reconnect: the peer was offline and just came back. Re-push every
    // local user's current profile so shadow stand-ins on the peer catch
    // up on any avatar / name changes that were missed while it was down.
    if (previousState === "offline" && (state === "online" || state === "locked")) {
      try {
        noteFederation?.pushProfilesToLink?.(link);
      } catch { /* best-effort */ }
    }
  }

  // The peer removed this link (detected via a 404 "unknown link" health
  // probe, i.e. we were offline when they unpaired). The store row is
  // already gone; resolve what rode the link, then tell our admins so the
  // panel drops it and they learn.
  function onLinkDissociated(link) {
    try {
      noteFederation?.onLinkRemoved(link.id);
    } catch {
      /* the sync tick sweeps whatever is left */
    }
    notifyAdmins({
      type: "federation_dissociated",
      linkId: link.id,
      peerBaseUrl: link.peer_base_url,
      peerLabel: link.peer_label || hostOf(link.peer_base_url),
    });
  }

  // Single-flight tick: the interval and the on-demand kicks share one
  // in-flight guard so a slow network round can't pile up overlapping
  // runs.
  let tickRunning = false;
  async function tick() {
    if (tickRunning) return;
    tickRunning = true;
    try {
      await peer.runTick({
        store,
        label: localLabel(),
        log,
        onStateChange: onLinkStateFlip,
        onDissociated: onLinkDissociated,
      });
      // After connectivity is refreshed, reconcile federated note
      // content with each reachable peer (push our changed copies).
      if (noteFederation) await noteFederation.syncTick();
    } finally {
      tickRunning = false;
    }
  }
  function kickTick() {
    setTimeout(() => tick().catch(() => {}), 150);
  }

  // Ping every active peer so they re-probe US right away (instead of
  // waiting for their periodic health poll). Called when our own state
  // changes in a way peers can't otherwise learn promptly — e.g. the
  // instance was just locked or unlocked. Best-effort: if a peer is
  // unreachable, their periodic poll remains the fallback.
  async function notifyPeersStateChanged() {
    let links;
    try { links = store.listActive(); } catch { return; }
    await Promise.all(links.map(async (link) => {
      try {
        await peer.postSigned(link, "/api/federation/peer-changed", { linkId: link.id });
      } catch { /* best-effort */ }
    }));
  }

  // Strip secrets; expose the derived state the UI keys off.
  function publicLink(link) {
    return {
      id: link.id,
      role: link.role,
      status: link.status,
      state: protocol.deriveLinkState(link),
      writable: protocol.isLinkWritable(link),
      peerBaseUrl: link.peer_base_url,
      peerLabel: link.peer_label || null,
      localBaseUrl: link.local_base_url || null,
      peerReachable: link.peer_reachable,
      peerLocked: link.peer_locked,
      peerAppVersion: link.peer_app_version || null,
      peerProtocol: link.peer_protocol,
      protocolCompatible: link.protocol_compatible,
      agreedProtocol: link.agreed_protocol,
      lastSeenAt: link.last_seen_at || null,
      lastAttemptAt: link.last_attempt_at || null,
      lastError: link.last_error || null,
      createdAt: link.created_at,
      updatedAt: link.updated_at || null,
      localProtocol: protocol.PROTOCOL_VERSION,
      localAppVersion: pkg.version,
    };
  }

  // Our own still-unanswered invitation to a given peer origin, if there is
  // one. Deliberately not store.getByPeerUrl, which returns the most recent
  // row for the address whatever its status: once the peer's own invitation
  // has landed, that is the row it hands back, and our outgoing one would be
  // missed.
  function ourOutgoingTo(peerUrl, exceptId) {
    return store
      .listByStatus(protocol.STATUS.OUTGOING_PENDING)
      .filter((l) => l.peer_base_url === peerUrl && l.id !== exceptId);
  }

  const ctx = {
    auth,
    adminOnly,
    log,
    store,
    noteFederation,
    hostOf,
    maxLabelLen: MAX_LABEL_LEN,
    searchLocalUsersStmt,
    setSelfNameStmt,
    localLabel,
    isLocked,
    selfReport,
    publicLink,
    tick,
    kickTick,
    onLinkStateFlip,
    notifyAdmins,
    ourOutgoingTo,
  };
  attachFederationPeerRoutes(app, ctx);
  attachFederationAdminRoutes(app, ctx);

  if (log && typeof log.log === "function") {
    log.log("[federation] routes ready (protocol v" + protocol.PROTOCOL_VERSION + ")");
  }

  return { store, tick, kickTick, notifyPeersStateChanged, noteFederation };
}

module.exports = { attachFederationRoutes };
