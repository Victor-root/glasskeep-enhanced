// server/routes/federationPeerRoutes.js
//
// The SERVER-TO-SERVER half of the federation surface (see
// federationRoutes.js): /api/federation/*, called by the OTHER GlassKeep
// server, never by a browser. No JWT. The pairing handshake is gated by
// a human admin accepting + a nonce; every post-pairing call is
// HMAC-signed with the shared secret. These stay reachable even when the
// instance is at-rest-locked, because the health probe must be able to
// answer "I'm up but locked".
//
// Also here: the two routes a signed-in user's share UI calls to list the
// paired peers and search their users.

const protocol = require("../federation/protocol");
const peer = require("../federation/peer");
const { safeEqual } = require("../services/safeEqual");

// A link id is minted by store.newId(), i.e. crypto.randomUUID(). Peers
// only ever echo one back, so requiring that exact shape costs nothing on
// the wire and keeps the value safe everywhere it travels: as a PRIMARY
// KEY, inside a URL path segment, and inside a SQL LIKE pattern.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidLinkId(v) {
  return typeof v === "string" && UUID_RE.test(v);
}
// store.newNonce() is 16 random bytes in base64url, so 22 characters. Accept
// a little either way for peers that pick a different length, but keep it a
// bounded string from a fixed alphabet.
function isValidNonce(v) {
  return typeof v === "string" && v.length >= 16 && v.length <= 128 && /^[A-Za-z0-9_-]+$/.test(v);
}

// The body sent when a signed request is refused. A clock disagreement
// is named as such rather than lumped in with a wrong secret, and only
// that case carries our own time, so the caller can report by how much
// the two servers differ. It reveals nothing: every HTTP response
// already carries this server's clock in its Date header.
function signatureRefusal(reason) {
  const body = { ok: false, error: reason === "clock-skew" ? "clock-skew" : "bad signature" };
  if (reason === "clock-skew") body.serverTime = Date.now();
  return body;
}

// The host (and port) of a peer address, or the address itself when it
// does not parse.
function displayHost(baseUrl) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

function attachFederationPeerRoutes(app, ctx) {
  const {
    auth,
    log,
    store,
    noteFederation,
    hostOf,
    maxLabelLen,
    searchLocalUsersStmt,
    isLocked,
    selfReport,
    kickTick,
    notifyAdmins,
    ourOutgoingTo,
  } = ctx;

  // Peer-supplied display names are shown next to a decision an admin is
  // about to take, so bound them like the health handshake already does.
  function cleanLabel(v) {
    return typeof v === "string" ? v.trim().slice(0, maxLabelLen) || null : null;
  }

  // The peer asks to pair with us. Unsigned (no shared secret yet): the
  // real gate is our admin recognising the initiator's address and
  // accepting. Idempotent: a retried invite (the peer kept trying while
  // we were down) just re-acknowledges.
  app.post("/api/federation/pair/invite", (req, res) => {
    const { linkId, initiatorBaseUrl, initiatorLabel, nonce } = req.body || {};
    const peerProto = req.body?.protocol;
    if (!linkId || !nonce || !initiatorBaseUrl) {
      return res.status(400).json({ error: "missing invite fields" });
    }
    // Shape checks BEFORE anything is read from or written to the store.
    // This body is anonymous: the caller has proved nothing about who it is,
    // so every field it supplies has to look like what a GlassKeep peer
    // actually sends before it is allowed anywhere near the database.
    //
    // The id in particular becomes a PRIMARY KEY and lands in URL paths
    // (/api/admin/federation/links/:id) and in SQL LIKE patterns
    // ("<linkId>|%"). Left unchecked it accepted a slash, which Express
    // cannot match in a path segment, so the row could never be removed
    // from the panel again; and it accepted non-strings, which the SQLite
    // binding rejects with an uncaught throw and a 500.
    if (!isValidLinkId(linkId)) {
      return res.status(400).json({ error: "invalid link id" });
    }
    if (!isValidNonce(nonce)) {
      return res.status(400).json({ error: "invalid nonce" });
    }
    const peerUrl = peer.normalizeBaseUrl(initiatorBaseUrl);
    if (!peerUrl) {
      return res.status(400).json({ error: "initiator url must be https" });
    }
    const existing = store.getById(linkId);
    if (existing) {
      return res.json(selfReport({ status: existing.status }));
    }
    // Both admins invited each other before either invitation landed, so
    // each side is sitting on its own outgoing invite to the other. Nothing
    // downstream merges them and both would go active: two links between
    // the same pair, each with its own health probe and its own stand-ins.
    // Simply refusing would deadlock: both sides would refuse the other's
    // invite and neither pairing would ever complete. Both ends can see the
    // same two ids though, so both can pick the same survivor without
    // agreeing on anything: the smaller id wins, and the loser stands down.
    //
    // WHY THE LOSER NO LONGER STANDS DOWN HERE. Nothing authenticates this
    // request, so "the peer also invited us" is a claim, not a fact: anyone
    // who knows the address our admin is pairing with could send an id that
    // sorts first and have our real invitation cancelled, in one anonymous
    // request, with no notification. The tie-break is kept, because the
    // deadlock it avoids is real, but standing down is deferred to the
    // moment OUR admin accepts the incoming card (see the accept route).
    // Until then both rows simply coexist, and an anonymous caller can add
    // a card an admin has to look at, never remove one they were relying on.
    const ours = ourOutgoingTo(peerUrl, linkId);
    if (ours.some((l) => l.id < linkId)) {
      return res.status(409).json({ error: "pairing already in progress" });
    }
    // Flood guard: never let an unauthenticated caller grow the table
    // without bound.
    // Anti-spam only: caps UNACCEPTED incoming invitations, never the
    // number of servers you can actually pair with (active links are
    // unlimited). Set high so it's effectively invisible in normal use.
    //
    // Counted per claimed origin as well as globally: with a single global
    // ceiling, one caller filling it locked every OTHER server out of
    // inviting us, turning an anti-spam measure into the outage it was
    // meant to prevent.
    const pending = store.listByStatus(protocol.STATUS.INCOMING_PENDING);
    if (pending.length > 500) {
      return res.status(429).json({ error: "too many pending invitations" });
    }
    if (pending.filter((l) => l.peer_base_url === peerUrl).length >= 5) {
      return res.status(429).json({ error: "too many pending invitations from this server" });
    }
    const now = store.nowIso();
    store.insert({
      id: linkId,
      role: "acceptor",
      status: protocol.STATUS.INCOMING_PENDING,
      peer_base_url: peerUrl,
      peer_label: cleanLabel(initiatorLabel),
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
    notifyAdmins({
      type: "federation_invitation",
      linkId,
      peerBaseUrl: peerUrl,
      peerLabel: cleanLabel(initiatorLabel),
    });
    res.json(selfReport({ status: protocol.STATUS.INCOMING_PENDING }));
  });

  // The peer accepted OUR invitation and hands us the shared secret.
  // We only honour it for an invitation we actually issued (matching id
  // + nonce), so a blind accept with a guessed id fails, and the secret
  // is bound to the original exchange.
  app.post("/api/federation/pair/accept", (req, res) => {
    const { linkId, acceptorBaseUrl, acceptorLabel, sharedSecret, nonce } = req.body || {};
    if (!linkId || !sharedSecret || !nonce || !acceptorBaseUrl) {
      return res.status(400).json({ error: "missing accept fields" });
    }
    // Same shape checks as /pair/invite: this body is anonymous too, and
    // linkId reaches the SQLite binding directly.
    if (!isValidLinkId(linkId) || !isValidNonce(nonce)) {
      return res.status(400).json({ error: "invalid link id or nonce" });
    }
    // F-09: the secret becomes the only thing standing between this link and
    // a forged signed request, so refuse one that cannot carry real entropy.
    // store.newSecret() is 32 random bytes in base64, i.e. 44 characters.
    if (typeof sharedSecret !== "string" || sharedSecret.length < 32 || sharedSecret.length > 512) {
      return res.status(400).json({ error: "invalid shared secret" });
    }
    const link = store.getById(linkId);
    if (!link || link.status !== protocol.STATUS.OUTGOING_PENDING || link.role !== "initiator") {
      return res.status(409).json({ error: "no matching pending invitation" });
    }
    if (!safeEqual(nonce, link.nonce)) {
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
    notifyAdmins({
      type: "federation_linked",
      linkId,
      peerBaseUrl: peerUrl,
      peerLabel: acceptorLabel || link.peer_label || hostOf(peerUrl),
    });
    kickTick(); // health-check the freshly active link promptly
    res.json(selfReport());
  });

  // The peer refused (or cancelled) a pending pairing. Resolve our side to
  // REFUSED and tell our admins, instead of retrying the invite forever.
  // Unsigned: a pending link has no shared secret; validated by linkId +
  // nonce, exactly like /pair/accept.
  app.post("/api/federation/pair/refused", (req, res) => {
    const { linkId, nonce, refusedByLabel } = req.body || {};
    if (!linkId || !nonce) {
      return res.status(400).json({ error: "missing fields" });
    }
    if (!isValidLinkId(linkId) || !isValidNonce(nonce)) {
      return res.status(400).json({ error: "invalid link id or nonce" });
    }
    const link = store.getById(linkId);
    if (
      !link ||
      (link.status !== protocol.STATUS.OUTGOING_PENDING &&
        link.status !== protocol.STATUS.INCOMING_PENDING)
    ) {
      return res.status(409).json({ error: "no matching pending invitation" });
    }
    if (!safeEqual(nonce, link.nonce)) {
      return res.status(403).json({ error: "nonce mismatch" });
    }
    // Our link's status right before this notice tells us which side of
    // the pairing we were on: if WE had sent the invite (outgoing), the
    // peer just declined OUR request -- a real refusal. If WE were the
    // recipient (incoming), the peer is withdrawing the invite THEY sent
    // us, before we ever accepted or declined it -- that's a
    // cancellation, not a refusal, and "declined your request" would be
    // backwards for it.
    const weWereInviter = link.status === protocol.STATUS.OUTGOING_PENDING;
    store.setStatus(link.id, weWereInviter ? protocol.STATUS.REFUSED : protocol.STATUS.CANCELLED);
    notifyAdmins({
      type: "federation_refused",
      linkId: link.id,
      peerBaseUrl: link.peer_base_url,
      peerLabel: refusedByLabel || link.peer_label || hostOf(link.peer_base_url),
      cancelled: !weWereInviter,
    });
    res.json({ ok: true });
  });

  // Signed liveness probe. Answers even while locked: that's the whole
  // point, the peer needs to tell "offline" apart from "up but locked".
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
    if (!valid.ok) return res.status(403).json(signatureRefusal(valid.reason));
    res.json(selfReport({ locked: isLocked() }));
  });

  // A peer tells us its own state just changed (locked/unlocked, etc.) and
  // asks us to re-probe it now rather than at our next periodic poll. We
  // kick the tick; the resulting health handshake refreshes the link and,
  // if its derived state flipped, onLinkStateFlip notifies our admins.
  app.post("/api/federation/peer-changed", (req, res) => {
    const link = verifyS2S(req, res);
    if (!link) return;
    kickTick();
    res.json({ ok: true });
  });

  // The peer unpaired from us. Drop our side too and tell our admins, so
  // the link doesn't linger forever showing "offline". Signed with the
  // (still valid) shared secret: only the real peer can trigger this.
  app.post("/api/federation/pair/unpair", (req, res) => {
    const link = verifyS2S(req, res);
    if (!link) return;
    const peerLabel = link.peer_label || hostOf(link.peer_base_url);
    try { store.remove(link.id); } catch { /* best-effort */ }
    try { noteFederation?.onLinkRemoved(link.id); } catch { /* swept by the tick */ }
    notifyAdmins({
      type: "federation_dissociated",
      linkId: link.id,
      peerBaseUrl: link.peer_base_url,
      peerLabel,
    });
    log.log?.(`[federation] peer ${peerLabel} unpaired from us; link removed`);
    res.json({ ok: true });
  });

  // Verify a signed server-to-server request. Returns the active link, or
  // ANSWERS the refusal itself and returns null, so every note endpoint
  // below reads the same two lines, and the refusal (including telling a
  // clock disagreement apart from a wrong secret, see verifySignedRequest)
  // is worded in exactly one place instead of ten.
  function verifyS2S(req, res) {
    const deny = (reason) => {
      res.status(403).json(signatureRefusal(reason));
      return null;
    };
    const linkId = req.headers["x-gk-fed-link"];
    if (!linkId) return deny();
    const link = store.getById(String(linkId));
    if (!link || link.status !== protocol.STATUS.ACTIVE) return deny();
    const v = peer.verifySignedRequest(link, {
      method: "POST",
      path: req.path,
      headers: req.headers,
      rawBody: req.rawBody ?? "",
    });
    return v.ok ? link : deny(v.reason);
  }

  // A signed note-federation message from the peer: `handle` turns the
  // verified link and the body into the note engine's verdict, answered as
  // 200 when it went through and 409 when it was refused.
  function noteRoute(path, handle) {
    app.post(path, (req, res) => {
      const link = verifyS2S(req, res);
      if (!link) return;
      if (!noteFederation) return res.status(501).json({ ok: false, error: "notes disabled" });
      const result = handle(link, req.body || {});
      res.status(result.ok ? 200 : 409).json(result);
    });
  }

  // A peer shares one of its notes with one of OUR users → create the
  // local mirror.
  noteRoute("/api/federation/notes/share", (link, b) => noteFederation.handleIncomingShare({
    linkId: link.id,
    targetRef: b.targetRef,
    ownerRef: b.ownerRef,
    ownerName: b.ownerName,
    ownerAvatar: b.ownerAvatar || null,
    note: b.note || {},
    canWrite: b.canWrite === 0 ? 0 : 1,
    roster: Array.isArray(b.roster) ? b.roster : null,
  }));

  // A peer pushes an updated copy of a note we both share → LWW-apply.
  noteRoute("/api/federation/notes/apply", (link, b) => noteFederation.handleIncomingApply({
    linkId: link.id,
    note: b.note || {},
    roster: Array.isArray(b.roster) ? b.roster : null,
  }));

  // A peer unshared/deleted a note we mirror → tear down the mirror.
  noteRoute("/api/federation/notes/remove", (link, b) => noteFederation.handleIncomingRemove({
    linkId: link.id,
    noteId: b.noteId,
    // The share ended without the content being deleted: each local
    // recipient keeps a standalone copy rather than losing the note.
    keepCopies: !!b.keepCopies,
  }));

  // A peer removed ONE of our local users from a note we mirror → drop just
  // that recipient's access (leaving the rest of the mirror intact).
  noteRoute("/api/federation/notes/unshare-recipient", (link, b) => noteFederation.handleIncomingUnshareRecipient({
    linkId: link.id,
    noteId: b.noteId,
    targetRef: b.targetRef,
    withCopy: !!b.withCopy,
  }));

  // A peer tells us one of ITS users left a note we own → drop just that
  // stand-in. The mirror side of "remove a recipient": only the authority
  // holds the participant list, so this is the only way a departure made
  // over there reaches it.
  noteRoute("/api/federation/notes/leave", (link, b) => noteFederation.handleIncomingLeave({
    linkId: link.id,
    noteId: b.noteId,
    ref: typeof b.ref === "string" ? b.ref : null,
  }));

  // A peer changed a remote collaborator's access on a note WE mirror →
  // flip the local recipient's read-only / read-write state instantly.
  noteRoute("/api/federation/notes/permission", (link, b) => noteFederation.handleIncomingPermission({
    linkId: link.id,
    noteId: b.noteId,
    targetRef: b.targetRef,
    canWrite: b.canWrite ? 1 : 0,
  }));

  // A peer tells us one of ITS users changed their display profile (name /
  // avatar). Refresh our shadow stand-ins for that user so their new avatar
  // shows on already-shared notes immediately, without waiting for an edit.
  noteRoute("/api/federation/profile", (link, b) => noteFederation.applyRemoteProfile({
    linkId: link.id,
    ref: typeof b.ref === "string" ? b.ref : null,
    uid: typeof b.uid === "string" ? b.uid : null,
    name: typeof b.name === "string" ? b.name : null,
    // null clears the avatar; a string sets it; anything else = "unknown".
    avatarUrl: b.avatar_url === null ? null : (typeof b.avatar_url === "string" ? b.avatar_url : undefined),
    // Set only when the peer's user changed address, so we can re-key the
    // stand-in we still hold under the old one.
    previousRef: typeof b.previousRef === "string" ? b.previousRef : null,
  }));

  // Active paired peers, for the share UI: ANY signed-in user (not just
  // admins) needs this to offer "share with <user> on <server>". Exposes
  // only the friendly label + host, never a secret or pairing detail.
  app.get("/api/federation/peers", auth, (_req, res) => {
    const peers = store.listActive().map((l) => {
      const host = displayHost(l.peer_base_url);
      return { host, label: l.peer_label || host };
    });
    res.json({ peers });
  });

  // A peer searches OUR users for its share UI (real users, never shadow
  // rows). `ref` is the identity it passes back to actually share.
  app.post("/api/federation/users/search", (req, res) => {
    const link = verifyS2S(req, res);
    if (!link) return;
    const query = String((req.body || {}).query || "").trim().slice(0, 100);
    const term = `%${query}%`;
    let users;
    try {
      users = searchLocalUsersStmt.all(term, term).map((u) => ({
        name: u.name,
        ref: u.email,
        avatar: u.avatar_url || null,
      }));
    } catch {
      users = [];
    }
    res.json({ ok: true, users });
  });

  // Proxy: aggregate REAL users from every paired peer for the share UI,
  // so the dropdown shows actual people on the other server (not an echo
  // of whatever was typed). One signed call per peer, run in parallel;
  // an unreachable peer is simply skipped.
  app.get("/api/federation/users/search", auth, async (req, res) => {
    const query = String(req.query.q || "").trim();
    const links = store.listActive();
    const results = [];
    await Promise.all(
      links.map(async (link) => {
        try {
          const r = await peer.postSigned(link, "/api/federation/users/search", { query });
          if (r.ok && r.json && Array.isArray(r.json.users)) {
            const host = displayHost(link.peer_base_url);
            const label = link.peer_label || host;
            for (const u of r.json.users) {
              results.push({
                name: u.name,
                ref: u.ref,
                avatar: u.avatar || null,
                host,
                serverLabel: label,
              });
            }
          }
        } catch {
          /* peer unreachable: skip its results */
        }
      }),
    );
    res.json({ users: results });
  });
}

module.exports = { attachFederationPeerRoutes };
