// server/federation/notes.js
//
// Note-level federation: sharing a note with a user on a PAIRED peer
// server, and keeping the two copies in sync.
//
// MODEL (primary-replica, authority = the owner's server)
//   - The note's canonical copy lives on its owner's server ("home").
//   - The peer keeps a local mirror so its user sees the note and can
//     edit it. The mirror note is owned by a non-loginable "shadow user"
//     standing in for the remote owner; the real local user is added as
//     a collaborator — so ALL the existing collaboration machinery
//     (lists, permissions, per-user tags/positions, notifications) keeps
//     working unchanged on both sides.
//
// SYNC — deliberately NOT hooked into the hot note write path. Each
// server's federation tick pushes any federated note whose
// client_updated_at moved since we last pushed it to the peer's
// /api/federation/notes/apply, which applies it under the SAME
// last-write-wins rule the rest of the app uses. This keeps normal note
// editing completely untouched, makes the sync self-healing across
// reconnects (a push that failed while the peer was down simply retries
// on the next tick), and avoids any echo loop (an applied incoming write
// updates last_pushed_cua so it is never bounced back).
//
// ENCRYPTION — federated note content travels as plaintext over the
// verified-TLS link and is re-encrypted on each side under that side's
// own key, via the host app's encryption-aware write helpers (passed in
// as deps). Nothing decryptable to the peer's key ever leaves a server.

const crypto = require("crypto");

const CONTENT_FIELDS = ["type", "title", "content", "items_json", "images_json", "color", "timestamp"];

function createNoteFederation(ctx) {
  const { db, store, peer, deps, log = console } = ctx;

  // ── Schema (additive) ───────────────────────────────────────────────
  // Mark a user row as a federation stand-in. NULL = a real local user.
  try {
    const cols = db.prepare(`PRAGMA table_info(users)`).all();
    if (!cols.some((c) => c.name === "federated_origin")) {
      db.exec(`ALTER TABLE users ADD COLUMN federated_origin TEXT`);
    }
  } catch (e) {
    log.warn?.("[federation/notes] users migration:", e?.message);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS federated_notes (
      note_id TEXT PRIMARY KEY,
      link_id TEXT NOT NULL,
      role TEXT NOT NULL,                 -- 'home' (we own) | 'mirror' (peer owns)
      remote_owner_ref TEXT,              -- the owner's identity on the peer
      last_pushed_cua TEXT,               -- client_updated_at last pushed to the peer
      created_at TEXT NOT NULL,
      FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_federated_notes_link ON federated_notes(link_id);
  `);

  const q = {
    getMapping: db.prepare(`SELECT * FROM federated_notes WHERE note_id = ?`),
    listByLink: db.prepare(`SELECT * FROM federated_notes WHERE link_id = ?`),
    listAll: db.prepare(`SELECT * FROM federated_notes`),
    insertMapping: db.prepare(`
      INSERT INTO federated_notes (note_id, link_id, role, remote_owner_ref, last_pushed_cua, created_at)
      VALUES (@note_id, @link_id, @role, @remote_owner_ref, @last_pushed_cua, @created_at)
      ON CONFLICT(note_id) DO UPDATE SET link_id=excluded.link_id, role=excluded.role
    `),
    setPushed: db.prepare(`UPDATE federated_notes SET last_pushed_cua = ? WHERE note_id = ?`),
    deleteMapping: db.prepare(`DELETE FROM federated_notes WHERE note_id = ?`),
    getShadowByOrigin: db.prepare(`SELECT * FROM users WHERE federated_origin = ?`),
    insertShadow: db.prepare(`
      INSERT INTO users (name, email, password_hash, created_at, is_admin, federated_origin)
      VALUES (?, ?, ?, ?, 0, ?)
    `),
  };

  // ── Helpers ─────────────────────────────────────────────────────────
  function hostOf(baseUrl) {
    try {
      return new URL(baseUrl).host;
    } catch {
      return String(baseUrl || "").replace(/^https?:\/\//i, "");
    }
  }

  // Find-or-create the non-loginable shadow user that represents a remote
  // participant. `ref` is the participant's stable identity on the peer
  // (their email or username); the synthetic local email keeps the row
  // unique without ever colliding with a real account that could log in
  // (the login path refuses any row with federated_origin set).
  function ensureShadowUser(linkId, ref, displayName, peerHost) {
    const origin = `${linkId}|${ref}`;
    const existing = q.getShadowByOrigin.get(origin);
    if (existing) return existing;
    const email = `${ref}@${peerHost}`;
    // An unusable password hash (random, not derived from any input) so
    // even if the login guard were bypassed the row could never match.
    const junk = crypto.randomBytes(24).toString("base64");
    try {
      q.insertShadow.run(displayName || ref, email, junk, deps.nowISO(), origin);
    } catch {
      // email clash with an unrelated row → fall back to an origin-tagged
      // address that cannot collide.
      q.insertShadow.run(displayName || ref, `${origin}@federated.invalid`, junk, deps.nowISO(), origin);
    }
    return q.getShadowByOrigin.get(origin);
  }

  function activeLinkForHost(host) {
    return store
      .listActive()
      .find((l) => hostOf(l.peer_base_url) === host) || null;
  }

  function contentFromNote(note) {
    return {
      id: note.id,
      type: note.type,
      title: note.title ?? "",
      content: note.content ?? "",
      items_json: note.items_json ?? "[]",
      images_json: note.images_json ?? "[]",
      color: note.color ?? "default",
      timestamp: note.timestamp,
      client_updated_at: note.client_updated_at,
    };
  }

  // Seed a collaborator's per-user position so a freshly shared note
  // lands at the top of their list (mirrors the local share flow).
  function seedPosition(noteId, userId) {
    try {
      const { max_pos } = deps.getMaxUserEffectivePosition.get(userId, userId, userId, userId);
      deps.upsertUserPosition.run({
        note_id: noteId,
        user_id: userId,
        position: (typeof max_pos === "number" ? max_pos : 0) + 1,
        pinned: 0,
      });
    } catch (e) {
      log.warn?.("[federation/notes] seedPosition:", e?.message);
    }
  }

  // ── Outbound: share a local note with a remote user ─────────────────
  // Returns { ok, error?, collaborator? }. Called by the host's
  // /collaborate route when the target looks like user@peer-host.
  async function shareWithRemote({ note, owner, targetRef, peerHost }) {
    const link = activeLinkForHost(peerHost);
    if (!link) return { ok: false, error: "peer_not_paired" };
    if (!peer && false) return { ok: false, error: "internal" };

    const path = "/api/federation/notes/share";
    let resp;
    try {
      resp = await peer.httpJson(link.peer_base_url + path, {
        method: "POST",
        secret: link.shared_secret,
        linkId: link.id,
        path,
        body: {
          linkId: link.id,
          targetRef,                         // who on the peer to share with
          ownerRef: owner.email || owner.name, // who we are (the note owner)
          ownerName: owner.name || owner.email,
          note: contentFromNote(note),
        },
      });
    } catch (e) {
      return { ok: false, error: peer.tlsAwareMessage ? peer.tlsAwareMessage(e) : "unreachable" };
    }
    if (!resp.ok || !resp.json || resp.json.ok !== true) {
      return { ok: false, error: resp.json?.error || `http ${resp.status}` };
    }

    // The peer accepted and told us the matched user's display name.
    const remote = resp.json.user || {};
    const shadow = ensureShadowUser(link.id, targetRef, remote.name || targetRef, peerHost);
    try {
      deps.addCollaborator.run(note.id, shadow.id, owner.id, deps.nowISO());
    } catch (e) {
      if (e.code !== "SQLITE_CONSTRAINT_UNIQUE") throw e;
    }
    q.insertMapping.run({
      note_id: note.id,
      link_id: link.id,
      role: "home",
      remote_owner_ref: null,
      last_pushed_cua: note.client_updated_at || null,
      created_at: deps.nowISO(),
    });
    return { ok: true, collaborator: { id: shadow.id, name: shadow.name, email: shadow.email } };
  }

  // ── Inbound: a peer shares a note with one of our users ─────────────
  function handleIncomingShare({ linkId, targetRef, ownerRef, ownerName, note }) {
    // Can't read/write encrypted note content while this instance is
    // locked. Tell the peer to retry once we're unlocked.
    if (deps.isLocked?.()) return { ok: false, error: "locked" };
    const link = store.getById(linkId);
    if (!link || link.status !== "active") return { ok: false, error: "unknown_link" };
    const peerHost = hostOf(link.peer_base_url);

    // Resolve the local recipient. Never match a shadow row.
    const target =
      deps.getUserByEmail.get(targetRef) || deps.getUserByName.get(targetRef);
    if (!target || target.federated_origin) {
      return { ok: false, error: "user_not_found" };
    }

    // The remote owner becomes a local shadow user that OWNS the mirror.
    const shadowOwner = ensureShadowUser(linkId, ownerRef, ownerName, peerHost);

    const cua = note.client_updated_at || deps.nowISO();
    const row = {
      id: note.id,
      user_id: shadowOwner.id,
      type: note.type || "text",
      title: String(note.title || ""),
      content: note.type === "checklist" ? "" : String(note.content || ""),
      items_json: typeof note.items_json === "string" ? note.items_json : "[]",
      tags_json: "[]",
      images_json: typeof note.images_json === "string" ? note.images_json : "[]",
      color: note.color || "default",
      pinned: 0,
      position: Date.now(),
      timestamp: note.timestamp || deps.nowISO(),
      client_updated_at: cua,
    };

    const existing = deps.getNoteById.get(note.id);
    if (!existing) {
      deps.runInsertNote(row);
    } else {
      // Already mirrored — fold in via LWW like any other update.
      if (deps.isNewerOrEqual(deps.parseIsoTimestamp(cua)?.ms, existing.client_updated_at)) {
        deps.runUpdateNoteFullCollab({ ...row, position: existing.position }, shadowOwner.id);
      }
    }

    try {
      deps.addCollaborator.run(note.id, target.id, shadowOwner.id, deps.nowISO());
      seedPosition(note.id, target.id);
    } catch (e) {
      if (e.code !== "SQLITE_CONSTRAINT_UNIQUE") {
        log.warn?.("[federation/notes] addCollaborator:", e?.message);
      }
    }

    q.insertMapping.run({
      note_id: note.id,
      link_id: linkId,
      role: "mirror",
      remote_owner_ref: ownerRef,
      last_pushed_cua: cua, // we just received this exact version; don't echo it
      created_at: deps.nowISO(),
    });

    try {
      deps.updateNoteWithEditor.run(deps.nowISO(), ownerName || ownerRef, deps.nowISO(), note.id);
      deps.createShareNotification({
        recipientId: target.id,
        senderId: shadowOwner.id,
        senderName: ownerName || ownerRef || "",
        noteId: note.id,
        noteTitle: note.title || "",
      });
      deps.broadcastNoteUpdated(note.id);
    } catch (e) {
      log.warn?.("[federation/notes] post-share:", e?.message);
    }
    return { ok: true, user: { name: target.name, email: target.email } };
  }

  // ── Inbound: a peer pushes an updated copy of a federated note ──────
  function handleIncomingApply({ linkId, note }) {
    if (deps.isLocked?.()) return { ok: false, error: "locked" };
    const mapping = q.getMapping.get(note.id);
    if (!mapping || mapping.link_id !== linkId) return { ok: false, error: "unknown_note" };
    const existing = deps.getNoteById.get(note.id);
    if (!existing) return { ok: false, error: "unknown_note" };

    const incomingMs = deps.parseIsoTimestamp(note.client_updated_at)?.ms;
    if (!deps.isNewerOrEqual(incomingMs, existing.client_updated_at)) {
      return { ok: true, stale: true }; // our copy is newer; nothing to do
    }
    const row = {
      id: note.id,
      user_id: existing.user_id,
      type: note.type || existing.type,
      title: String(note.title ?? existing.title ?? ""),
      content: note.type === "checklist" ? "" : String(note.content ?? existing.content ?? ""),
      items_json: typeof note.items_json === "string" ? note.items_json : existing.items_json,
      tags_json: "[]",
      images_json: typeof note.images_json === "string" ? note.images_json : existing.images_json,
      color: note.color || existing.color,
      pinned: existing.pinned,
      position: existing.position,
      timestamp: note.timestamp || existing.timestamp,
      client_updated_at: note.client_updated_at,
    };
    deps.runUpdateNoteFullCollab(row, existing.user_id);
    // Mark this exact version as "already in sync" so our own tick never
    // bounces it straight back to the peer (echo-loop guard).
    q.setPushed.run(note.client_updated_at, note.id);
    try {
      deps.broadcastNoteUpdated(note.id);
    } catch { /* SSE best-effort */ }
    return { ok: true };
  }

  // ── Tick: push our changed federated notes to each peer ─────────────
  async function syncTick() {
    // While locked we can't decrypt our own notes to push them; resume
    // automatically once unlocked.
    if (deps.isLocked?.()) return;
    let rows;
    try {
      rows = q.listAll.all();
    } catch {
      return;
    }
    for (const m of rows) {
      try {
        const link = store.getById(m.link_id);
        if (!link || link.status !== "active" || link.peer_reachable !== 1) continue;
        const note = deps.getNoteById.get(m.note_id);
        if (!note) continue;
        if (note.client_updated_at && note.client_updated_at === m.last_pushed_cua) continue; // unchanged

        const path = "/api/federation/notes/apply";
        const resp = await peer.httpJson(link.peer_base_url + path, {
          method: "POST",
          secret: link.shared_secret,
          linkId: link.id,
          path,
          body: { linkId: link.id, note: contentFromNote(note) },
        });
        if (resp.ok && resp.json && resp.json.ok === true) {
          q.setPushed.run(note.client_updated_at, note.id);
        }
      } catch (e) {
        log.warn?.(`[federation/notes] push ${m.note_id} failed:`, e?.message);
      }
    }
  }

  // A federated MIRROR note is read-only while its home link can't be
  // trusted to accept the write (offline / locked / out of date). The
  // host write path consults this so an edit is refused server-side, and
  // the client shows the matching banner.
  function isReadOnly(noteId) {
    const m = q.getMapping.get(noteId);
    if (!m || m.role !== "mirror") return false;
    const link = store.getById(m.link_id);
    return !link || !require("./protocol").isLinkWritable(link);
  }

  return {
    handleIncomingShare,
    handleIncomingApply,
    shareWithRemote,
    syncTick,
    isReadOnly,
    isPeerHost: (host) => !!activeLinkForHost(host),
    getMapping: (noteId) => q.getMapping.get(noteId),
  };
}

module.exports = { createNoteFederation, CONTENT_FIELDS };
