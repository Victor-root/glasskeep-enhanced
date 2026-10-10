// server/routes/federationAdminRoutes.js
//
// The ADMIN half of the federation surface (see federationRoutes.js):
// /api/admin/federation/*, the Federation panel. JWT + adminOnly.
// Create/accept/refuse invitations, repair a peer's address after it
// moves, rename, unpair, force a re-check.

const protocol = require("../federation/protocol");
const peer = require("../federation/peer");
const pkg = require("../../package.json");

const NON_TERMINAL = new Set([
  protocol.STATUS.ACTIVE,
  protocol.STATUS.OUTGOING_PENDING,
  protocol.STATUS.INCOMING_PENDING,
  protocol.STATUS.ACCEPTING,
]);

function attachFederationAdminRoutes(app, ctx) {
  const {
    auth,
    adminOnly,
    log,
    store,
    noteFederation,
    hostOf,
    maxLabelLen,
    setSelfNameStmt,
    localLabel,
    publicLink,
    tick,
    kickTick,
    onLinkStateFlip,
    notifyAdmins,
    ourOutgoingTo,
  } = ctx;

  // The link named in the URL, or a 404 already answered (and null).
  function findLink(req, res) {
    const link = store.getById(req.params.id);
    if (!link) res.status(404).json({ error: "not_found" });
    return link;
  }

  // A self-name is mandatory before any pairing step: it becomes the badge
  // the peer's users see. Answers the refusal itself and returns false.
  function hasSelfName(res) {
    if (localLabel()) return true;
    res.status(400).json({ error: "self_name_required" });
    return false;
  }

  function sendLink(res, id) {
    res.json({ ok: true, link: publicLink(store.getById(id)) });
  }

  // A fresh outgoing invitation, then a tick to deliver it.
  function inviteAnew(req, res, { peerUrl, label, localUrl }) {
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
    sendLink(res, id);
  }

  // This server's own federation display name (mandatory before pairing,
  // since it becomes the badge the peer's users see).
  app.put("/api/admin/federation/self-name", auth, adminOnly, (req, res) => {
    const name =
      typeof req.body?.name === "string" ? req.body.name.trim().slice(0, maxLabelLen) : "";
    if (!name) return res.status(400).json({ error: "name_required" });
    setSelfNameStmt.run(name);
    res.json({ ok: true, selfName: name });
  });

  app.get("/api/admin/federation/links", auth, adminOnly, (_req, res) => {
    res.json({
      links: store.listAll().map(publicLink),
      selfName: localLabel(),
      maxLabelLen,
      localProtocol: protocol.PROTOCOL_VERSION,
      localAppVersion: pkg.version,
    });
  });

  // Start pairing. The browser supplies localBaseUrl (its own
  // window.location.origin), the public address THIS server is reached
  // at, so we never have to guess it behind a reverse proxy.
  app.post("/api/admin/federation/invite", auth, adminOnly, (req, res) => {
    if (!hasSelfName(res)) return;
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
    inviteAnew(req, res, { peerUrl, label, localUrl });
  });

  // Accept an incoming invitation. We mint the shared secret here and
  // record the address the initiator should reach us at.
  app.post("/api/admin/federation/links/:id/accept", auth, adminOnly, (req, res) => {
    if (!hasSelfName(res)) return;
    const link = findLink(req, res);
    if (!link) return;
    if (link.status !== protocol.STATUS.INCOMING_PENDING) {
      return res.status(409).json({ error: "not_pending", link: publicLink(link) });
    }
    const localUrl = peer.normalizeBaseUrl(req.body?.localBaseUrl);
    if (!localUrl) return res.status(400).json({ error: "invalid_local_url" });
    const label = typeof req.body?.label === "string" ? req.body.label.trim() || null : null;
    // Crossed invitations: we had our own invite out to this same address
    // when theirs arrived, and an admin has just picked theirs. Stand our
    // own one down now, so the pair ends up with exactly one link. This is
    // the half of the tie-break that /pair/invite deliberately no longer
    // performs: doing it here means it takes an authenticated admin choice
    // to retire an invitation, never an anonymous claim over the network.
    for (const ours of ourOutgoingTo(link.peer_base_url, link.id)) {
      store.setStatus(ours.id, protocol.STATUS.CANCELLED);
      log.log?.(
        `[federation] crossed invitations with ${hostOf(link.peer_base_url)}; ` +
        `standing down our outgoing link ${ours.id} in favour of ${link.id}`,
      );
    }
    store.setAccepting({
      id: link.id,
      shared_secret: store.newSecret(),
      local_base_url: localUrl,
      peer_label: label || link.peer_label,
    });
    // The "pairing request" notification (FederationInviteWatcher) is a
    // separate UI surface from this panel and has no other way to learn
    // the invite was just handled here -- without this it lingers,
    // offering Accept/Decline on a link that's already moving on.
    notifyAdmins({ type: "federation_invitation_resolved", linkId: link.id });
    kickTick();
    sendLink(res, link.id);
  });

  // Decline an incoming invitation, or cancel one we sent -- distinct
  // outcomes (see protocol.STATUS) even though a single endpoint and a
  // single confirm-dialog flow (FederationLinkCard) covers both.
  app.post("/api/admin/federation/links/:id/refuse", auth, adminOnly, (req, res) => {
    const link = findLink(req, res);
    if (!link) return;
    const wasIncoming = link.status === protocol.STATUS.INCOMING_PENDING;
    if (!wasIncoming && link.status !== protocol.STATUS.OUTGOING_PENDING) {
      return res.status(409).json({ error: "not_pending" });
    }
    store.setStatus(link.id, wasIncoming ? protocol.STATUS.REFUSED : protocol.STATUS.CANCELLED);
    // Same as accept above -- only an incoming request ever has a
    // "pairing request" notification to clear.
    if (wasIncoming) {
      notifyAdmins({ type: "federation_invitation_resolved", linkId: link.id });
    }
    // Tell the other side, so its pending request resolves instead of the
    // initiator retrying the invite forever (and never learning the
    // outcome). Unsigned: a pending link has no shared secret yet; the
    // peer validates by linkId + nonce. Best-effort.
    if (link.peer_base_url && link.nonce) {
      const path = "/api/federation/pair/refused";
      Promise.resolve()
        .then(() => peer.httpJson(link.peer_base_url + path, {
          method: "POST",
          body: { linkId: link.id, nonce: link.nonce, refusedByLabel: localLabel() || null },
        }))
        .catch(() => { /* best-effort */ });
    }
    sendLink(res, link.id);
  });

  // Resend an invitation after it ended in a terminal state (refused,
  // cancelled, or unpaired). A fresh row -- new id, new nonce, a clean
  // OUTGOING_PENDING status -- replaces the old one so the terminal row
  // doesn't linger as a dead duplicate for the same address (/invite's
  // NON_TERMINAL guard only ever protects non-terminal rows, not these).
  // role is always "initiator": /pair/accept only matches a row back to
  // the peer's acceptance when it is, regardless of which side the old
  // (possibly acceptor) row belonged to.
  app.post("/api/admin/federation/links/:id/resend", auth, adminOnly, (req, res) => {
    if (!hasSelfName(res)) return;
    const link = findLink(req, res);
    if (!link) return;
    const isTerminal =
      link.status === protocol.STATUS.REFUSED ||
      link.status === protocol.STATUS.CANCELLED ||
      link.status === protocol.STATUS.REVOKED;
    if (!isTerminal) return res.status(409).json({ error: "not_terminal" });
    const localUrl = peer.normalizeBaseUrl(req.body?.localBaseUrl);
    if (!localUrl) return res.status(400).json({ error: "invalid_local_url" });
    store.remove(link.id);
    inviteAnew(req, res, { peerUrl: link.peer_base_url, label: link.peer_label, localUrl });
  });

  // Repair a peer's address after it moved (new domain / port). The link
  // id, and every shared note hanging off it, is untouched; only the
  // address changes, and syncing resumes at it. This is the answer to
  // "what if a server changes domain: are the notes lost?": they're not.
  app.post("/api/admin/federation/links/:id/address", auth, adminOnly, (req, res) => {
    const link = findLink(req, res);
    if (!link) return;
    const peerUrl = peer.normalizeBaseUrl(req.body?.peerBaseUrl);
    if (!peerUrl) return res.status(400).json({ error: "invalid_peer_url" });
    store.updatePeerUrl(link.id, peerUrl);
    kickTick();
    sendLink(res, link.id);
  });

  // Rename the peer (display label only).
  app.patch("/api/admin/federation/links/:id", auth, adminOnly, (req, res) => {
    const link = findLink(req, res);
    if (!link) return;
    if (typeof req.body?.label === "string") {
      store.updatePeerLabel(link.id, req.body.label.trim() || null);
    }
    sendLink(res, link.id);
  });

  // Unpair. Local removal is authoritative for this side; the peer will
  // see the link go unreachable and its admin can remove it too.
  app.delete("/api/admin/federation/links/:id", auth, adminOnly, (req, res) => {
    const link = findLink(req, res);
    if (!link) return;
    // Tell the peer we're unpairing BEFORE we forget the secret, so it can
    // drop its side too instead of being left with a dead link that just
    // shows "offline" forever. Best-effort + fire-and-forget: if the peer
    // is down, its own health probe will get a 404 "unknown link" from us
    // and treat that as a dissociation (see healthCheckOne). Only active
    // links have a shared secret to sign with.
    if (link.status === protocol.STATUS.ACTIVE && link.shared_secret) {
      Promise.resolve()
        .then(() => peer.postSigned(link, "/api/federation/pair/unpair", { linkId: link.id }))
        .catch(() => { /* best-effort; durable 404 detection is the fallback */ });
    }
    store.remove(link.id);
    // Resolve what rode the link before answering: our own notes drop the
    // peer's stand-ins, and any mirror we held becomes a standalone copy for
    // each local participant instead of a note nobody can ever edit again.
    try { noteFederation?.onLinkRemoved(link.id); } catch { /* swept by the tick */ }
    res.json({ ok: true });
  });

  // Force an immediate health re-check (the "is it back yet?" button).
  app.post("/api/admin/federation/links/:id/recheck", auth, adminOnly, async (req, res) => {
    const link = findLink(req, res);
    if (!link) return;
    // Probe THIS link directly instead of going through the shared tick.
    // tick() is single-flight, so while a periodic run is mid-probe (up to
    // the 8 s timeout when a peer is unreachable) "Re-check" would no-op
    // and hand back the STALE state, which is exactly why the button felt
    // like it did nothing. An active link gets its own fresh health
    // handshake now; a still-pending one rides the handshake tick.
    if (link.status === protocol.STATUS.ACTIVE) {
      await peer.healthCheckOne(link, store, log, onLinkStateFlip);
    } else {
      await tick();
    }
    sendLink(res, link.id);
  });
}

module.exports = { attachFederationAdminRoutes };
