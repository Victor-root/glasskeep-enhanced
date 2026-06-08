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

const crypto = require("crypto");
const pkg = require("../../package.json");
const runtime = require("../encryption/runtimeUnlockState");
const protocol = require("../federation/protocol");
const peer = require("../federation/peer");
const { createFederationStore } = require("../federation/store");
const { createNoteFederation } = require("../federation/notes");

const NON_TERMINAL = new Set([
  protocol.STATUS.ACTIVE,
  protocol.STATUS.OUTGOING_PENDING,
  protocol.STATUS.INCOMING_PENDING,
  protocol.STATUS.ACCEPTING,
]);

function attachFederationRoutes(
  app,
  { db, auth, adminOnly, log = console, broadcastToAdmins, noteDeps } = {},
) {
  const store = createFederationStore(db);
  // Note-level federation (sharing notes across a paired link). Only
  // wired when the host passes the note helpers it needs.
  const noteFederation = noteDeps
    ? createNoteFederation({ db, store, peer, deps: noteDeps, log })
    : null;
  const getLabelStmt = db.prepare(`SELECT custom_app_name FROM app_settings WHERE id = 1`);

  function localLabel() {
    try {
      const name = (getLabelStmt.get()?.custom_app_name || "").trim();
      return name || null;
    } catch {
      return null;
    }
  }
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
        // Proactively tell every admin the moment a link's connectivity
        // flips, so they don't have to be staring at the panel to learn
        // the peer went down (or came back).
        onStateChange: (link, previousState, state) => {
          try {
            broadcastToAdmins?.({
              type: "federation_link_state",
              linkId: link.id,
              peerBaseUrl: link.peer_base_url,
              peerLabel: link.peer_label || null,
              state,
              previousState,
            });
          } catch {
            /* SSE best-effort */
          }
        },
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

  function timingSafeEqualStr(a, b) {
    const ba = Buffer.from(String(a || ""));
    const bb = Buffer.from(String(b || ""));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  }

  // ─────────────────────────────────────────────────────────────────
  //  SERVER-TO-SERVER
  // ─────────────────────────────────────────────────────────────────

  // The peer asks to pair with us. Unsigned (no shared secret yet) — the
  // real gate is our admin recognising the initiator's address and
  // accepting. Idempotent: a retried invite (the peer kept trying while
  // we were down) just re-acknowledges.
  app.post("/api/federation/pair/invite", (req, res) => {
    const { linkId, initiatorBaseUrl, initiatorLabel, nonce } = req.body || {};
    const peerProto = req.body?.protocol;
    if (!linkId || !nonce || !initiatorBaseUrl) {
      return res.status(400).json({ error: "missing invite fields" });
    }
    const peerUrl = peer.normalizeBaseUrl(initiatorBaseUrl);
    if (!peerUrl) {
      return res.status(400).json({ error: "initiator url must be https" });
    }
    const existing = store.getById(linkId);
    if (existing) {
      return res.json(selfReport({ status: existing.status }));
    }
    // Flood guard: never let an unauthenticated caller grow the table
    // without bound.
    if (store.listByStatus(protocol.STATUS.INCOMING_PENDING).length > 50) {
      return res.status(429).json({ error: "too many pending invitations" });
    }
    const now = store.nowIso();
    store.insert({
      id: linkId,
      role: "acceptor",
      status: protocol.STATUS.INCOMING_PENDING,
      peer_base_url: peerUrl,
      peer_label: initiatorLabel || null,
      nonce,
      created_at: now,
    });
    // Record the peer's protocol so the admin sees compatibility on the
    // invitation card before deciding to accept.
    const neg = protocol.negotiateProtocol(peerProto, req.body?.protocolMin);
    store.updateHealth(linkId, {
      peer_reachable: null,
      peer_protocol: Number.isInteger(peerProto) ? peerProto : null,
      protocol_compatible: neg.compatible ? 1 : 0,
      agreed_protocol: neg.agreed,
      last_error: neg.compatible ? null : "protocol-incompatible",
    });
    try {
      broadcastToAdmins?.({
        type: "federation_invitation",
        linkId,
        peerBaseUrl: peerUrl,
        peerLabel: initiatorLabel || null,
      });
    } catch {
      /* SSE best-effort */
    }
    res.json(selfReport({ status: protocol.STATUS.INCOMING_PENDING }));
  });

  // The peer accepted OUR invitation and hands us the shared secret.
  // We only honour it for an invitation we actually issued (matching id
  // + nonce) — so a blind accept with a guessed id fails, and the secret
  // is bound to the original exchange.
  app.post("/api/federation/pair/accept", (req, res) => {
    const { linkId, acceptorBaseUrl, acceptorLabel, sharedSecret, nonce } = req.body || {};
    if (!linkId || !sharedSecret || !nonce || !acceptorBaseUrl) {
      return res.status(400).json({ error: "missing accept fields" });
    }
    const link = store.getById(linkId);
    if (!link || link.status !== protocol.STATUS.OUTGOING_PENDING || link.role !== "initiator") {
      return res.status(409).json({ error: "no matching pending invitation" });
    }
    if (!timingSafeEqualStr(nonce, link.nonce)) {
      return res.status(403).json({ error: "nonce mismatch" });
    }
    const peerUrl = peer.normalizeBaseUrl(acceptorBaseUrl);
    if (!peerUrl) {
      return res.status(400).json({ error: "acceptor url must be https" });
    }
    store.activate({
      id: linkId,
      shared_secret: String(sharedSecret),
      peer_base_url: peerUrl,
      peer_label: acceptorLabel || link.peer_label || null,
    });
    try {
      broadcastToAdmins?.({ type: "federation_linked", linkId, peerBaseUrl: peerUrl });
    } catch {
      /* best-effort */
    }
    kickTick(); // health-check the freshly active link promptly
    res.json(selfReport());
  });

  // Signed liveness probe. Answers even while locked — that's the whole
  // point: the peer needs to tell "offline" apart from "up but locked".
  app.post("/api/federation/health", (req, res) => {
    const linkId = req.headers["x-gk-fed-link"];
    if (!linkId) return res.status(401).json({ ok: false, error: "missing link" });
    const link = store.getById(String(linkId));
    if (!link || link.status !== protocol.STATUS.ACTIVE) {
      return res.status(404).json({ ok: false, error: "unknown link" });
    }
    const valid = peer.verifySignedRequest(link, {
      method: "POST",
      path: req.path,
      headers: req.headers,
      rawBody: req.rawBody ?? "",
    });
    if (!valid) return res.status(403).json({ ok: false, error: "bad signature" });
    res.json(selfReport({ locked: isLocked() }));
  });

  // Verify a signed server-to-server request; returns the active link or
  // null. Shared by the note endpoints below.
  function verifyS2S(req) {
    const linkId = req.headers["x-gk-fed-link"];
    if (!linkId) return null;
    const link = store.getById(String(linkId));
    if (!link || link.status !== protocol.STATUS.ACTIVE) return null;
    const ok = peer.verifySignedRequest(link, {
      method: "POST",
      path: req.path,
      headers: req.headers,
      rawBody: req.rawBody ?? "",
    });
    return ok ? link : null;
  }

  // A peer shares one of its notes with one of OUR users → create the
  // local mirror.
  app.post("/api/federation/notes/share", (req, res) => {
    const link = verifyS2S(req);
    if (!link) return res.status(403).json({ ok: false, error: "bad signature" });
    if (!noteFederation) return res.status(501).json({ ok: false, error: "notes disabled" });
    const b = req.body || {};
    const result = noteFederation.handleIncomingShare({
      linkId: link.id,
      targetRef: b.targetRef,
      ownerRef: b.ownerRef,
      ownerName: b.ownerName,
      note: b.note || {},
    });
    res.status(result.ok ? 200 : 409).json(result);
  });

  // A peer pushes an updated copy of a note we both share → LWW-apply.
  app.post("/api/federation/notes/apply", (req, res) => {
    const link = verifyS2S(req);
    if (!link) return res.status(403).json({ ok: false, error: "bad signature" });
    if (!noteFederation) return res.status(501).json({ ok: false, error: "notes disabled" });
    const result = noteFederation.handleIncomingApply({
      linkId: link.id,
      note: (req.body || {}).note || {},
    });
    res.status(result.ok ? 200 : 409).json(result);
  });

  // ─────────────────────────────────────────────────────────────────
  //  ADMIN PANEL
  // ─────────────────────────────────────────────────────────────────

  app.get("/api/admin/federation/links", auth, adminOnly, (_req, res) => {
    res.json({
      links: store.listAll().map(publicLink),
      localProtocol: protocol.PROTOCOL_VERSION,
      localAppVersion: pkg.version,
    });
  });

  // Start pairing. The browser supplies localBaseUrl (its own
  // window.location.origin) — the public address THIS server is reached
  // at — so we never have to guess it behind a reverse proxy.
  app.post("/api/admin/federation/invite", auth, adminOnly, (req, res) => {
    const peerUrl = peer.normalizeBaseUrl(req.body?.peerBaseUrl);
    const localUrl = peer.normalizeBaseUrl(req.body?.localBaseUrl);
    const label = typeof req.body?.label === "string" ? req.body.label.trim() || null : null;
    if (!peerUrl) return res.status(400).json({ error: "invalid_peer_url" });
    if (!localUrl) return res.status(400).json({ error: "invalid_local_url" });
    if (peerUrl === localUrl) return res.status(400).json({ error: "cannot_pair_with_self" });

    const existing = store.getByPeerUrl(peerUrl);
    if (existing && NON_TERMINAL.has(existing.status)) {
      return res.status(409).json({ error: "already_linked_or_pending", link: publicLink(existing) });
    }
    const id = store.newId();
    store.insert({
      id,
      role: "initiator",
      status: protocol.STATUS.OUTGOING_PENDING,
      peer_base_url: peerUrl,
      peer_label: label,
      local_base_url: localUrl,
      nonce: store.newNonce(),
      created_by: req.user.id,
      created_at: store.nowIso(),
    });
    kickTick();
    res.json({ ok: true, link: publicLink(store.getById(id)) });
  });

  // Accept an incoming invitation. We mint the shared secret here and
  // record the address the initiator should reach us at.
  app.post("/api/admin/federation/links/:id/accept", auth, adminOnly, (req, res) => {
    const link = store.getById(req.params.id);
    if (!link) return res.status(404).json({ error: "not_found" });
    if (link.status !== protocol.STATUS.INCOMING_PENDING) {
      return res.status(409).json({ error: "not_pending", link: publicLink(link) });
    }
    const localUrl = peer.normalizeBaseUrl(req.body?.localBaseUrl);
    if (!localUrl) return res.status(400).json({ error: "invalid_local_url" });
    const label = typeof req.body?.label === "string" ? req.body.label.trim() || null : null;
    store.setAccepting({
      id: link.id,
      shared_secret: store.newSecret(),
      local_base_url: localUrl,
      peer_label: label || link.peer_label,
    });
    kickTick();
    res.json({ ok: true, link: publicLink(store.getById(link.id)) });
  });

  // Decline an incoming invitation (or cancel one we sent).
  app.post("/api/admin/federation/links/:id/refuse", auth, adminOnly, (req, res) => {
    const link = store.getById(req.params.id);
    if (!link) return res.status(404).json({ error: "not_found" });
    if (link.status !== protocol.STATUS.INCOMING_PENDING && link.status !== protocol.STATUS.OUTGOING_PENDING) {
      return res.status(409).json({ error: "not_pending" });
    }
    store.setStatus(link.id, protocol.STATUS.REFUSED);
    res.json({ ok: true, link: publicLink(store.getById(link.id)) });
  });

  // Repair a peer's address after it moved (new domain / port). The link
  // id — and every shared note hanging off it — is untouched; only the
  // address changes, and syncing resumes at it. This is the answer to
  // "what if a server changes domain: are the notes lost?" — they're not.
  app.post("/api/admin/federation/links/:id/address", auth, adminOnly, (req, res) => {
    const link = store.getById(req.params.id);
    if (!link) return res.status(404).json({ error: "not_found" });
    const peerUrl = peer.normalizeBaseUrl(req.body?.peerBaseUrl);
    if (!peerUrl) return res.status(400).json({ error: "invalid_peer_url" });
    store.updatePeerUrl(link.id, peerUrl);
    kickTick();
    res.json({ ok: true, link: publicLink(store.getById(link.id)) });
  });

  // Rename the peer (display label only).
  app.patch("/api/admin/federation/links/:id", auth, adminOnly, (req, res) => {
    const link = store.getById(req.params.id);
    if (!link) return res.status(404).json({ error: "not_found" });
    if (typeof req.body?.label === "string") {
      store.updatePeerLabel(link.id, req.body.label.trim() || null);
    }
    res.json({ ok: true, link: publicLink(store.getById(link.id)) });
  });

  // Unpair. Local removal is authoritative for this side; the peer will
  // see the link go unreachable and its admin can remove it too.
  app.delete("/api/admin/federation/links/:id", auth, adminOnly, (req, res) => {
    const link = store.getById(req.params.id);
    if (!link) return res.status(404).json({ error: "not_found" });
    store.remove(link.id);
    res.json({ ok: true });
  });

  // Force an immediate health re-check (the "is it back yet?" button).
  app.post("/api/admin/federation/links/:id/recheck", auth, adminOnly, async (req, res) => {
    const link = store.getById(req.params.id);
    if (!link) return res.status(404).json({ error: "not_found" });
    await tick();
    res.json({ ok: true, link: publicLink(store.getById(link.id)) });
  });

  if (log && typeof log.log === "function") {
    log.log("[federation] routes ready (protocol v" + protocol.PROTOCOL_VERSION + ")");
  }

  return { store, tick, kickTick, noteFederation };
}

module.exports = { attachFederationRoutes };
