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

  // Proactively tell every admin the moment a link's connectivity flips
  // (so they don't have to be staring at the panel to learn the peer went
  // down or came back), and re-broadcast the notes riding the link so
  // every open copy flips to/from read-only at once. Shared by the
  // periodic tick AND the on-demand "Re-check".
  function onLinkStateFlip(link, previousState, state) {
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
  // already gone; just tell our admins so the panel drops it and they learn.
  function onLinkDissociated(link) {
    try {
      broadcastToAdmins?.({
        type: "federation_dissociated",
        linkId: link.id,
        peerBaseUrl: link.peer_base_url,
        peerLabel: link.peer_label || hostOf(link.peer_base_url),
      });
    } catch {
      /* SSE best-effort */
    }
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
    let links = [];
    try { links = store.listActive(); } catch { return; }
    const path = "/api/federation/peer-changed";
    await Promise.all(links.map(async (link) => {
      try {
        await peer.httpJson(link.peer_base_url + path, {
          method: "POST",
          secret: link.shared_secret,
          linkId: link.id,
          path,
          body: { linkId: link.id },
        });
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
    // Anti-spam only — caps UNACCEPTED incoming invitations, never the
    // number of servers you can actually pair with (active links are
    // unlimited). Set high so it's effectively invisible in normal use.
    if (store.listByStatus(protocol.STATUS.INCOMING_PENDING).length > 500) {
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
      broadcastToAdmins?.({
        type: "federation_linked",
        linkId,
        peerBaseUrl: peerUrl,
        peerLabel: acceptorLabel || link.peer_label || hostOf(peerUrl),
      });
    } catch {
      /* best-effort */
    }
    kickTick(); // health-check the freshly active link promptly
    res.json(selfReport());
  });

  // The peer refused (or cancelled) a pending pairing. Resolve our side to
  // REFUSED and tell our admins, instead of retrying the invite forever.
  // Unsigned — a pending link has no shared secret; validated by linkId +
  // nonce, exactly like /pair/accept.
  app.post("/api/federation/pair/refused", (req, res) => {
    const { linkId, nonce, refusedByLabel } = req.body || {};
    if (!linkId || !nonce) {
      return res.status(400).json({ error: "missing fields" });
    }
    const link = store.getById(linkId);
    if (
      !link ||
      (link.status !== protocol.STATUS.OUTGOING_PENDING &&
        link.status !== protocol.STATUS.INCOMING_PENDING)
    ) {
      return res.status(409).json({ error: "no matching pending invitation" });
    }
    if (!timingSafeEqualStr(nonce, link.nonce)) {
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
    try {
      broadcastToAdmins?.({
        type: "federation_refused",
        linkId: link.id,
        peerBaseUrl: link.peer_base_url,
        peerLabel: refusedByLabel || link.peer_label || hostOf(link.peer_base_url),
        cancelled: !weWereInviter,
      });
    } catch {
      /* SSE best-effort */
    }
    res.json({ ok: true });
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

  // A peer tells us its own state just changed (locked/unlocked, etc.) and
  // asks us to re-probe it now rather than at our next periodic poll. We
  // kick the tick; the resulting health handshake refreshes the link and,
  // if its derived state flipped, onLinkStateFlip notifies our admins.
  app.post("/api/federation/peer-changed", (req, res) => {
    const link = verifyS2S(req);
    if (!link) return res.status(403).json({ ok: false, error: "bad signature" });
    kickTick();
    res.json({ ok: true });
  });

  // The peer unpaired from us. Drop our side too and tell our admins, so
  // the link doesn't linger forever showing "offline". Signed with the
  // (still valid) shared secret — only the real peer can trigger this.
  app.post("/api/federation/pair/unpair", (req, res) => {
    const link = verifyS2S(req);
    if (!link) return res.status(403).json({ ok: false, error: "bad signature" });
    const peerLabel = link.peer_label || hostOf(link.peer_base_url);
    try { store.remove(link.id); } catch { /* best-effort */ }
    try {
      broadcastToAdmins?.({
        type: "federation_dissociated",
        linkId: link.id,
        peerBaseUrl: link.peer_base_url,
        peerLabel,
      });
    } catch { /* SSE best-effort */ }
    log.log?.(`[federation] peer ${peerLabel} unpaired from us; link removed`);
    res.json({ ok: true });
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
      ownerAvatar: b.ownerAvatar || null,
      note: b.note || {},
      canWrite: b.canWrite === 0 ? 0 : 1,
      roster: Array.isArray(b.roster) ? b.roster : null,
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
      roster: Array.isArray((req.body || {}).roster) ? req.body.roster : null,
    });
    res.status(result.ok ? 200 : 409).json(result);
  });

  // A peer unshared/deleted a note we mirror → tear down the mirror.
  app.post("/api/federation/notes/remove", (req, res) => {
    const link = verifyS2S(req);
    if (!link) return res.status(403).json({ ok: false, error: "bad signature" });
    if (!noteFederation) return res.status(501).json({ ok: false, error: "notes disabled" });
    const result = noteFederation.handleIncomingRemove({
      linkId: link.id,
      noteId: (req.body || {}).noteId,
    });
    res.status(result.ok ? 200 : 409).json(result);
  });

  // A peer removed ONE of our local users from a note we mirror → drop just
  // that recipient's access (leaving the rest of the mirror intact).
  app.post("/api/federation/notes/unshare-recipient", (req, res) => {
    const link = verifyS2S(req);
    if (!link) return res.status(403).json({ ok: false, error: "bad signature" });
    if (!noteFederation) return res.status(501).json({ ok: false, error: "notes disabled" });
    const b = req.body || {};
    const result = noteFederation.handleIncomingUnshareRecipient({
      linkId: link.id,
      noteId: b.noteId,
      targetRef: b.targetRef,
      withCopy: !!b.withCopy,
    });
    res.status(result.ok ? 200 : 409).json(result);
  });

  // A peer changed a remote collaborator's access on a note WE mirror →
  // flip the local recipient's read-only / read-write state instantly.
  app.post("/api/federation/notes/permission", (req, res) => {
    const link = verifyS2S(req);
    if (!link) return res.status(403).json({ ok: false, error: "bad signature" });
    if (!noteFederation) return res.status(501).json({ ok: false, error: "notes disabled" });
    const b = req.body || {};
    const result = noteFederation.handleIncomingPermission({
      linkId: link.id,
      noteId: b.noteId,
      targetRef: b.targetRef,
      canWrite: b.canWrite ? 1 : 0,
    });
    res.status(result.ok ? 200 : 409).json(result);
  });

  // A peer tells us one of ITS users changed their display profile (name /
  // avatar). Refresh our shadow stand-ins for that user so their new avatar
  // shows on already-shared notes immediately, without waiting for an edit.
  app.post("/api/federation/profile", (req, res) => {
    const link = verifyS2S(req);
    if (!link) return res.status(403).json({ ok: false, error: "bad signature" });
    if (!noteFederation) return res.status(501).json({ ok: false, error: "notes disabled" });
    const b = req.body || {};
    const result = noteFederation.applyRemoteProfile({
      linkId: link.id,
      ref: typeof b.ref === "string" ? b.ref : null,
      uid: typeof b.uid === "string" ? b.uid : null,
      name: typeof b.name === "string" ? b.name : null,
      // null clears the avatar; a string sets it; anything else = "unknown".
      avatarUrl: b.avatar_url === null ? null : (typeof b.avatar_url === "string" ? b.avatar_url : undefined),
    });
    res.status(result.ok ? 200 : 409).json(result);
  });

  // Active paired peers, for the share UI — ANY signed-in user (not just
  // admins) needs this to offer "share with <user> on <server>". Exposes
  // only the friendly label + host, never a secret or pairing detail.
  app.get("/api/federation/peers", auth, (_req, res) => {
    const peers = store.listActive().map((l) => {
      let host = l.peer_base_url;
      try {
        host = new URL(l.peer_base_url).host;
      } catch {
        /* keep raw */
      }
      return { host, label: l.peer_label || host };
    });
    res.json({ peers });
  });

  // A peer searches OUR users for its share UI (real users, never shadow
  // rows). `ref` is the identity it passes back to actually share.
  app.post("/api/federation/users/search", (req, res) => {
    const link = verifyS2S(req);
    if (!link) return res.status(403).json({ ok: false, error: "bad signature" });
    const query = String((req.body || {}).query || "").trim().slice(0, 100);
    const term = `%${query}%`;
    let users = [];
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
          const path = "/api/federation/users/search";
          const r = await peer.httpJson(link.peer_base_url + path, {
            method: "POST",
            secret: link.shared_secret,
            linkId: link.id,
            path,
            body: { query },
          });
          if (r.ok && r.json && Array.isArray(r.json.users)) {
            let host = link.peer_base_url;
            try {
              host = new URL(link.peer_base_url).host;
            } catch {
              /* keep raw */
            }
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

  // ─────────────────────────────────────────────────────────────────
  //  ADMIN PANEL
  // ─────────────────────────────────────────────────────────────────

  // This server's own federation display name (mandatory before pairing,
  // since it becomes the badge the peer's users see).
  app.put("/api/admin/federation/self-name", auth, adminOnly, (req, res) => {
    const name =
      typeof req.body?.name === "string" ? req.body.name.trim().slice(0, MAX_LABEL_LEN) : "";
    if (!name) return res.status(400).json({ error: "name_required" });
    setSelfNameStmt.run(name);
    res.json({ ok: true, selfName: name });
  });

  app.get("/api/admin/federation/links", auth, adminOnly, (_req, res) => {
    res.json({
      links: store.listAll().map(publicLink),
      selfName: localLabel(),
      maxLabelLen: MAX_LABEL_LEN,
      localProtocol: protocol.PROTOCOL_VERSION,
      localAppVersion: pkg.version,
    });
  });

  // Start pairing. The browser supplies localBaseUrl (its own
  // window.location.origin) — the public address THIS server is reached
  // at — so we never have to guess it behind a reverse proxy.
  app.post("/api/admin/federation/invite", auth, adminOnly, (req, res) => {
    // A self-name is mandatory: it becomes the badge the peer's users see.
    if (!localLabel()) return res.status(400).json({ error: "self_name_required" });
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
    if (!localLabel()) return res.status(400).json({ error: "self_name_required" });
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
    // The "pairing request" notification (FederationInviteWatcher) is a
    // separate UI surface from this panel and has no other way to learn
    // the invite was just handled here -- without this it lingers,
    // offering Accept/Decline on a link that's already moving on.
    try {
      broadcastToAdmins?.({ type: "federation_invitation_resolved", linkId: link.id });
    } catch {
      /* SSE best-effort */
    }
    kickTick();
    res.json({ ok: true, link: publicLink(store.getById(link.id)) });
  });

  // Decline an incoming invitation, or cancel one we sent -- distinct
  // outcomes (see protocol.STATUS) even though a single endpoint and a
  // single confirm-dialog flow (FederationLinkCard) covers both.
  app.post("/api/admin/federation/links/:id/refuse", auth, adminOnly, (req, res) => {
    const link = store.getById(req.params.id);
    if (!link) return res.status(404).json({ error: "not_found" });
    const wasIncoming = link.status === protocol.STATUS.INCOMING_PENDING;
    if (!wasIncoming && link.status !== protocol.STATUS.OUTGOING_PENDING) {
      return res.status(409).json({ error: "not_pending" });
    }
    store.setStatus(link.id, wasIncoming ? protocol.STATUS.REFUSED : protocol.STATUS.CANCELLED);
    // Same as accept above -- only an incoming request ever has a
    // "pairing request" notification to clear.
    if (wasIncoming) {
      try {
        broadcastToAdmins?.({ type: "federation_invitation_resolved", linkId: link.id });
      } catch {
        /* SSE best-effort */
      }
    }
    // Tell the other side, so its pending request resolves instead of the
    // initiator retrying the invite forever (and never learning the
    // outcome). Unsigned — a pending link has no shared secret yet; the
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
    res.json({ ok: true, link: publicLink(store.getById(link.id)) });
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
    if (!localLabel()) return res.status(400).json({ error: "self_name_required" });
    const link = store.getById(req.params.id);
    if (!link) return res.status(404).json({ error: "not_found" });
    const isTerminal =
      link.status === protocol.STATUS.REFUSED ||
      link.status === protocol.STATUS.CANCELLED ||
      link.status === protocol.STATUS.REVOKED;
    if (!isTerminal) return res.status(409).json({ error: "not_terminal" });
    const localUrl = peer.normalizeBaseUrl(req.body?.localBaseUrl);
    if (!localUrl) return res.status(400).json({ error: "invalid_local_url" });
    store.remove(link.id);
    const id = store.newId();
    store.insert({
      id,
      role: "initiator",
      status: protocol.STATUS.OUTGOING_PENDING,
      peer_base_url: link.peer_base_url,
      peer_label: link.peer_label,
      local_base_url: localUrl,
      nonce: store.newNonce(),
      created_by: req.user.id,
      created_at: store.nowIso(),
    });
    kickTick();
    res.json({ ok: true, link: publicLink(store.getById(id)) });
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
    // Tell the peer we're unpairing BEFORE we forget the secret, so it can
    // drop its side too instead of being left with a dead link that just
    // shows "offline" forever. Best-effort + fire-and-forget — if the peer
    // is down, its own health probe will get a 404 "unknown link" from us
    // and treat that as a dissociation (see healthCheckOne). Only active
    // links have a shared secret to sign with.
    if (link.status === protocol.STATUS.ACTIVE && link.shared_secret) {
      const path = "/api/federation/pair/unpair";
      Promise.resolve()
        .then(() => peer.httpJson(link.peer_base_url + path, {
          method: "POST",
          secret: link.shared_secret,
          linkId: link.id,
          path,
          body: { linkId: link.id },
        }))
        .catch(() => { /* best-effort; durable 404 detection is the fallback */ });
    }
    store.remove(link.id);
    res.json({ ok: true });
  });

  // Force an immediate health re-check (the "is it back yet?" button).
  app.post("/api/admin/federation/links/:id/recheck", auth, adminOnly, async (req, res) => {
    const link = store.getById(req.params.id);
    if (!link) return res.status(404).json({ error: "not_found" });
    // Probe THIS link directly instead of going through the shared tick.
    // tick() is single-flight, so while a periodic run is mid-probe (up to
    // the 8 s timeout when a peer is unreachable) "Re-check" would no-op
    // and hand back the STALE state — which is exactly why the button felt
    // like it did nothing. An active link gets its own fresh health
    // handshake now; a still-pending one rides the handshake tick.
    if (link.status === protocol.STATUS.ACTIVE) {
      await peer.healthCheckOne(link, store, log, onLinkStateFlip);
    } else {
      await tick();
    }
    res.json({ ok: true, link: publicLink(store.getById(link.id)) });
  });

  if (log && typeof log.log === "function") {
    log.log("[federation] routes ready (protocol v" + protocol.PROTOCOL_VERSION + ")");
  }

  return { store, tick, kickTick, notifyPeersStateChanged, noteFederation };
}

module.exports = { attachFederationRoutes };
