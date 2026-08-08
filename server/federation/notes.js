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
  // federated_notes intentionally has NO "ON DELETE CASCADE": when a home
  // note is deleted the mapping must SURVIVE so the next sync can tell the
  // peer to remove its mirror, then drop the mapping itself. Early builds
  // shipped a cascade; migrate it away in place.
  // Composite (note_id, link_id) key: one note can be federated to MANY
  // peers at once, so it carries one mapping row PER peer link. (The old
  // schema used note_id alone as the PRIMARY KEY, which meant sharing the
  // same note with a second server overwrote the first peer's mapping and
  // silently severed that peer's sync.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS federated_notes (
      note_id TEXT NOT NULL,
      link_id TEXT NOT NULL,
      role TEXT NOT NULL,                 -- 'home' (we own) | 'mirror' (peer owns)
      remote_owner_ref TEXT,              -- the owner's identity on the peer
      last_pushed_cua TEXT,               -- client_updated_at last pushed to the peer
      created_at TEXT NOT NULL,
      PRIMARY KEY (note_id, link_id)
    );
    CREATE INDEX IF NOT EXISTS idx_federated_notes_link ON federated_notes(link_id);
    CREATE INDEX IF NOT EXISTS idx_federated_notes_note ON federated_notes(note_id);
  `);
  try {
    const def = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='federated_notes'")
      .get();
    // Rebuild any pre-composite table: either an early build with an
    // ON DELETE CASCADE foreign key, or the single-column-PK schema that
    // capped a note to one peer. Both lack the (note_id, link_id) key.
    if (def && !/PRIMARY KEY\s*\(\s*note_id\s*,\s*link_id\s*\)/i.test(def.sql)) {
      db.exec(`
        CREATE TABLE federated_notes_new (
          note_id TEXT NOT NULL, link_id TEXT NOT NULL, role TEXT NOT NULL,
          remote_owner_ref TEXT, last_pushed_cua TEXT, created_at TEXT NOT NULL,
          PRIMARY KEY (note_id, link_id)
        );
        INSERT INTO federated_notes_new
          SELECT note_id, link_id, role, remote_owner_ref, last_pushed_cua, created_at FROM federated_notes;
        DROP TABLE federated_notes;
        ALTER TABLE federated_notes_new RENAME TO federated_notes;
        CREATE INDEX IF NOT EXISTS idx_federated_notes_link ON federated_notes(link_id);
        CREATE INDEX IF NOT EXISTS idx_federated_notes_note ON federated_notes(note_id);
      `);
    }
  } catch (e) {
    log.warn?.("[federation/notes] schema migration:", e?.message);
  }
  // How this share must END on the peer, recorded at the instant the local
  // admin decides it:
  //   NULL          — no teardown pending
  //   'destroy'     — the mirror must go, content and all
  //   'keep_copies' — the share is over, but every remote recipient keeps
  //                   their own standalone copy of the content
  //
  // WHY PERSIST the intent instead of inferring it when we push: only the
  // action itself knows whether this is "delete for everyone" or "delete
  // just for me", yet the push may not happen until minutes later (the
  // tick retries once an offline peer returns). reconcileMapping used to
  // infer "destroy" from the note merely being trashed, which cannot tell
  // those two apart — so a retry destroyed content the owner meant to
  // leave behind. Runs AFTER the rebuild above, whose fixed column list
  // would otherwise drop this column again on a legacy database.
  try {
    const cols = db.prepare(`PRAGMA table_info(federated_notes)`).all();
    if (!cols.some((c) => c.name === "teardown")) {
      db.exec(`ALTER TABLE federated_notes ADD COLUMN teardown TEXT`);
    }
  } catch (e) {
    log.warn?.("[federation/notes] teardown migration:", e?.message);
  }

  const q = {
    // All mappings for a note — a home note can ride several peer links.
    listByNote: db.prepare(`SELECT * FROM federated_notes WHERE note_id = ?`),
    // The mapping for one specific (note, link) pair.
    getMappingForLink: db.prepare(`SELECT * FROM federated_notes WHERE note_id = ? AND link_id = ?`),
    // A note's MIRROR mapping, if any. A note is the mirror of at most one
    // home, so this is unambiguous (unlike home notes shared to many peers).
    getMirrorMapping: db.prepare(`SELECT * FROM federated_notes WHERE note_id = ? AND role = 'mirror' LIMIT 1`),
    // Any one mapping for a note — UI fallback when the peer is irrelevant.
    getAnyMapping: db.prepare(`SELECT * FROM federated_notes WHERE note_id = ? LIMIT 1`),
    listByLink: db.prepare(`SELECT * FROM federated_notes WHERE link_id = ?`),
    listAll: db.prepare(`SELECT * FROM federated_notes`),
    insertMapping: db.prepare(`
      INSERT INTO federated_notes (note_id, link_id, role, remote_owner_ref, last_pushed_cua, created_at)
      VALUES (@note_id, @link_id, @role, @remote_owner_ref, @last_pushed_cua, @created_at)
      ON CONFLICT(note_id, link_id) DO UPDATE SET role=excluded.role
    `),
    // last_pushed_cua is per-peer, so the echo-guard is scoped to the link.
    setPushed: db.prepare(`UPDATE federated_notes SET last_pushed_cua = ? WHERE note_id = ? AND link_id = ?`),
    // Record how this note's share must end, on every peer carrying it.
    setTeardownForNote: db.prepare(`UPDATE federated_notes SET teardown = ? WHERE note_id = ?`),
    setTeardownForLink: db.prepare(`UPDATE federated_notes SET teardown = ? WHERE note_id = ? AND link_id = ?`),
    deleteMappingForLink: db.prepare(`DELETE FROM federated_notes WHERE note_id = ? AND link_id = ?`),
    deleteAllForNote: db.prepare(`DELETE FROM federated_notes WHERE note_id = ?`),
    getShadowByOrigin: db.prepare(`SELECT * FROM users WHERE federated_origin = ?`),
    insertShadow: db.prepare(`
      INSERT INTO users (name, email, password_hash, created_at, is_admin, federated_origin, avatar_url)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `),
    // Keep a shadow's display name + avatar fresh with the remote user.
    updateShadow: db.prepare(`UPDATE users SET name = ?, avatar_url = ? WHERE id = ?`),
    // The authority server's friendly name for a stand-in's origin server,
    // so a third-server participant badges correctly on a mirror that has no
    // direct link to resolve it. NULL means "resolve via our own link".
    setShadowServerLabel: db.prepare(`UPDATE users SET federated_server_label = ? WHERE id = ?`),
    // Does this note still carry the shadow collaborator that represents
    // the peer side of the given link? (i.e. is it still shared there?)
    hasShadowCollab: db.prepare(`
      SELECT 1 FROM note_collaborators nc
      JOIN users u ON nc.user_id = u.id
      WHERE nc.note_id = ? AND u.federated_origin LIKE ?
      LIMIT 1
    `),
    // Is there at least one READ-WRITE shadow collaborator for this link on
    // the note? The home side uses it to refuse an edit pushed on behalf of
    // a remote recipient the owner limited to read-only.
    hasWritableShadowCollab: db.prepare(`
      SELECT 1 FROM note_collaborators nc
      JOIN users u ON nc.user_id = u.id
      WHERE nc.note_id = ? AND u.federated_origin LIKE ? AND nc.can_write = 1
      LIMIT 1
    `),
    // Real (non-shadow) participants of a note, to notify on removal.
    realParticipants: db.prepare(`
      SELECT nc.user_id FROM note_collaborators nc
      JOIN users u ON nc.user_id = u.id
      WHERE nc.note_id = ? AND u.federated_origin IS NULL
    `),
    // Shadow collaborator rows on a note that belong to a given link
    // (federated_origin LIKE "<linkId>|%"). Used by roster sync to prune
    // display stand-ins for participants who have left the note.
    listShadowCollabsForNote: db.prepare(`
      SELECT u.id, u.federated_origin FROM note_collaborators nc
      JOIN users u ON nc.user_id = u.id
      WHERE nc.note_id = ? AND u.federated_origin LIKE ?
    `),
    // Every note a (shadow) user takes part in — as a collaborator or as the
    // owner — so a profile refresh can repaint exactly those notes' open views.
    notesForUser: db.prepare(`
      SELECT note_id AS id FROM note_collaborators WHERE user_id = ?
      UNION
      SELECT id FROM notes WHERE user_id = ?
    `),
    // All real (non-shadow) local users — used to re-push profiles on reconnect.
    allRealUsers: db.prepare(`SELECT id, name, email, avatar_url FROM users WHERE federated_origin IS NULL`),
    deleteNoteRow: db.prepare(`DELETE FROM notes WHERE id = ?`),
    // Per-user leftovers on a note a removed recipient no longer collaborates
    // on — mirrors the local remove-collaborator route's own cleanup so a
    // federated removal doesn't leave orphaned rows behind.
    deleteUserTags: db.prepare(`DELETE FROM note_user_tags WHERE note_id = ? AND user_id = ?`),
    deleteUserPosition: db.prepare(`DELETE FROM note_user_positions WHERE note_id = ? AND user_id = ?`),
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
  // `avatarUrl` (when provided) is carried over so the cross-server
  // collaborator shows their real avatar, and is refreshed on re-share.
  function ensureShadowUser(linkId, ref, displayName, peerHost, avatarUrl) {
    const origin = `${linkId}|${ref}`;
    const existing = q.getShadowByOrigin.get(origin);
    if (existing) {
      // Refresh the display name / avatar if they changed on the peer.
      const nextName = displayName || existing.name;
      const nextAvatar = avatarUrl !== undefined ? avatarUrl || null : existing.avatar_url;
      if (nextName !== existing.name || nextAvatar !== existing.avatar_url) {
        try {
          q.updateShadow.run(nextName, nextAvatar, existing.id);
        } catch { /* best-effort */ }
      }
      return q.getShadowByOrigin.get(origin);
    }
    const email = `${ref}@${peerHost}`;
    // An unusable password hash (random, not derived from any input) so
    // even if the login guard were bypassed the row could never match.
    const junk = crypto.randomBytes(24).toString("base64");
    try {
      q.insertShadow.run(displayName || ref, email, junk, deps.nowISO(), origin, avatarUrl || null);
    } catch {
      // email clash with an unrelated row → fall back to an origin-tagged
      // address that cannot collide.
      q.insertShadow.run(displayName || ref, `${origin}@federated.invalid`, junk, deps.nowISO(), origin, avatarUrl || null);
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
      // Carry the "last edited by / at" so the peer's mirror shows who really
      // made the latest edit and when, instead of freezing on whoever last
      // touched their own local copy. Older peers simply ignore these fields.
      last_edited_by: note.last_edited_by ?? null,
      last_edited_at: note.last_edited_at ?? null,
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

  // ── Mirror: reconcile the displayed participant list ────────────────
  // The home server (the authority) sends the full roster of a note's
  // participants alongside every share/apply. We mirror it locally as
  // display-only stand-ins so this peer's user sees EVERY active
  // collaborator — the owner, this server's own collaborators, and people
  // who live on a third server we aren't directly linked to. Edits still
  // hub through the home server; these rows are purely for visibility.
  //
  // Stand-ins are keyed under the home link (federated_origin
  // "<homeLinkId>|<ref>"), so they badge as "via the home server" and are
  // pruned here the moment the roster no longer lists them (someone left).
  // The owner is the note's user_id (not a collaborator row) and real
  // local users (this server's own recipients) are left untouched.
  function applyRoster(noteId, linkId, roster) {
    if (!Array.isArray(roster) || roster.length === 0) return;
    const link = store.getById(linkId);
    const peerHost = link ? hostOf(link.peer_base_url) : "";
    // The mirror's own name for the home server — used to badge participants
    // who live on the home (the owner and home-local collaborators).
    const homeLabel = link ? (link.peer_label || hostOf(link.peer_base_url)) : null;
    // Heal the shadow owner's badge to our name for the home link. applyRoster
    // skips owner entries, so this is where a stale label (left by older
    // versions where two same-named participants shared the owner row) gets
    // corrected on the next sync — no re-share required.
    try {
      const note = deps.getNoteById.get(noteId);
      const ownerRow = note ? deps.getUserById?.get(note.user_id) : null;
      if (ownerRow?.federated_origin && homeLabel) {
        q.setShadowServerLabel.run(homeLabel, ownerRow.id);
      }
    } catch { /* best-effort */ }
    // Origins of the display stand-ins the roster says should exist on this
    // link. We reconcile ONLY shadow stand-ins here — never real local users.
    // Real recipients are managed exclusively by share / unshare messages, so
    // a roster quirk (e.g. two people sharing a name) can never strip a real
    // collaborator and make their note vanish.
    const expectedShadowOrigins = new Set();
    for (const p of roster) {
      if (!p || !p.ref) continue;
      if (p.isOwner) continue; // owner is the mirror's note owner, not a collab row
      // Is this entry one of OUR OWN recipients (owned by the share /
      // unshare flow, so the display roster must leave it alone)? Decide it
      // from the uid, NEVER by matching the name or address against our
      // accounts: a roster entry's ref lives in whatever server that person
      // is on, and two independent servers can each have a "Victor" — with
      // the same email address, even, since nothing is unique across
      // servers. Looking it up locally made us mistake the authority's
      // Victor for our own and silently drop them from the note.
      //
      // The authority represents someone living on OUR side of THIS link as
      // a shadow whose origin is `<thisLinkId>|<their ref here>`, and the
      // link id is the same on both ends (agreed once at pairing, see
      // federation/store.js). So that exact shape — and only it — means
      // "this person is ours". `local:<id>` means they live on the
      // authority, and any other link id means a third server; both of
      // those are remote to us and need a display stand-in.
      const isOneOfOurs = p.uid
        ? p.uid === `${linkId}|${p.ref}`
        // A peer too old to send uid gives us nothing better than the old
        // heuristic — still better than duplicating our own user's row.
        : !!(deps.getRealUserByEmail?.get(p.ref) || deps.getRealUserByName?.get(p.ref));
      if (isOneOfOurs) {
        // WHO our own recipients are belongs to the share / unshare
        // messages, but WHAT THEY MAY DO is the authority's call, and the
        // direct permission push is fire-once: when it fails because this
        // server was down at the moment the owner flipped it, nothing else
        // ever corrected it and the user kept editing a note the owner had
        // set to read-only. The roster is re-pushed until it lands (see
        // onParticipantsChangedLocally), so heal the access from here.
        //
        // Only on the precise uid path, and only when the entry actually
        // carries an access: on the legacy fallback above the match is
        // itself a name/address guess, and a wrong guess would change the
        // wrong person's access, while an older peer sending no access at
        // all must not silently demote everyone to read-only.
        if (p.uid && p.canWrite != null) {
          const mine =
            deps.getRealUserByEmail?.get(p.ref) || deps.getRealUserByName?.get(p.ref);
          if (mine) {
            try {
              deps.setCollaboratorCanWrite.run(p.canWrite ? 1 : 0, noteId, mine.id);
            } catch { /* best-effort */ }
          }
        }
        continue;
      }
      // Remote participant → display stand-in. Key it by the participant's
      // globally-unique uid (not their name) so two different people who share
      // a name never collapse into one row — nor collide with the shadow owner.
      const key = p.uid || p.ref;
      const shadow = ensureShadowUser(linkId, key, p.name || p.ref, peerHost, p.avatar_url ?? null);
      expectedShadowOrigins.add(`${linkId}|${key}`);
      // Explicit badge: the authority's name for a third server, or the home
      // label for a home-local participant. Always set, so display never
      // depends on fragile origin-link resolution.
      try { q.setShadowServerLabel.run(p.serverLabel || homeLabel || null, shadow.id); } catch { /* best-effort */ }
      try {
        deps.addCollaborator.run(noteId, shadow.id, shadow.id, deps.nowISO());
      } catch (e) {
        if (e.code !== "SQLITE_CONSTRAINT_UNIQUE") throw e;
      }
      try { deps.setCollaboratorCanWrite.run(p.canWrite ? 1 : 0, noteId, shadow.id); } catch { /* best-effort */ }
    }
    // Prune ONLY shadow stand-ins on this link that are no longer in the
    // roster (e.g. a participant left, or a stale ref-keyed stand-in from an
    // older version). The shadow owner is the note's user_id, not a collab
    // row, so it is never returned here; real recipients are never touched.
    try {
      for (const row of q.listShadowCollabsForNote.all(noteId, `${linkId}|%`)) {
        if (!expectedShadowOrigins.has(row.federated_origin)) {
          deps.removeCollaborator?.run(noteId, row.id);
        }
      }
    } catch (e) {
      log.warn?.("[federation/notes] roster prune:", e?.message);
    }
  }

  // ── Outbound: share a local note with a remote user ─────────────────
  // Returns { ok, error?, collaborator? }. Called by the host's
  // /collaborate route when the target looks like user@peer-host.
  async function shareWithRemote({ note, owner, targetRef, peerHost, canWrite = 1 }) {
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
          ownerAvatar: owner.avatar_url || null, // so the peer shows our avatar
          canWrite: canWrite ? 1 : 0,        // read-only vs read-write share
          note: contentFromNote(note),
          roster: deps.getNoteRoster?.(note.id, owner.id) || null,
        },
      });
    } catch (e) {
      return { ok: false, error: peer.tlsAwareMessage ? peer.tlsAwareMessage(e) : "unreachable" };
    }
    if (!resp.ok || !resp.json || resp.json.ok !== true) {
      return { ok: false, error: resp.json?.error || `http ${resp.status}` };
    }

    // The peer accepted and told us the matched user's name + avatar.
    const remote = resp.json.user || {};
    const shadow = ensureShadowUser(
      link.id,
      targetRef,
      remote.name || targetRef,
      peerHost,
      remote.avatar_url ?? null,
    );
    try {
      deps.addCollaborator.run(note.id, shadow.id, owner.id, deps.nowISO());
    } catch (e) {
      if (e.code !== "SQLITE_CONSTRAINT_UNIQUE") throw e;
    }
    // Mirror the chosen access onto our shadow collaborator row so the
    // owner-side read-only enforcement + UI reflect it from the start.
    if (canWrite === 0) {
      try { deps.setCollaboratorCanWrite.run(0, note.id, shadow.id); } catch { /* best-effort */ }
    }
    q.insertMapping.run({
      note_id: note.id,
      link_id: link.id,
      role: "home",
      remote_owner_ref: null,
      last_pushed_cua: note.client_updated_at || null,
      created_at: deps.nowISO(),
    });
    return {
      ok: true,
      collaborator: {
        id: shadow.id,
        name: shadow.name,
        email: shadow.email,
        serverLabel: link.peer_label || hostOf(link.peer_base_url),
      },
    };
  }

  // ── Inbound: a peer shares a note with one of our users ─────────────
  function handleIncomingShare({ linkId, targetRef, ownerRef, ownerName, ownerAvatar, note, canWrite = 1, roster = null }) {
    // Can't read/write encrypted note content while this instance is
    // locked. Tell the peer to retry once we're unlocked.
    if (deps.isLocked?.()) return { ok: false, error: "locked" };
    const link = store.getById(linkId);
    if (!link || link.status !== "active") return { ok: false, error: "unknown_link" };
    const peerHost = hostOf(link.peer_base_url);

    // Resolve the local recipient. Real accounts only — never a shadow row,
    // even one that happens to share a name with the target.
    const target =
      deps.getRealUserByEmail?.get(targetRef) || deps.getRealUserByName?.get(targetRef);
    if (!target) {
      return { ok: false, error: "user_not_found" };
    }

    // The remote owner becomes a local shadow user that OWNS the mirror.
    const shadowOwner = ensureShadowUser(linkId, ownerRef, ownerName, peerHost, ownerAvatar);
    // Badge the owner with OUR name for the home link, authoritatively. This
    // also heals any stale label left on the owner row by older versions
    // (applyRoster skips owners, so it would otherwise never be corrected).
    try {
      const homeLabel = link.peer_label || hostOf(link.peer_base_url);
      q.setShadowServerLabel.run(homeLabel, shadowOwner.id);
    } catch { /* best-effort */ }

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
      // Honour the owner's chosen access: a read-only recipient can open
      // the mirror but not edit it (enforced locally like any read-only
      // collaborator).
      if (canWrite === 0) deps.setCollaboratorCanWrite.run(0, note.id, target.id);
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

    // Mirror the full participant roster so the recipient sees every active
    // collaborator from the start. applyRoster only manages display stand-ins
    // for remote participants; the recipient we just added is a real local
    // user and is left untouched, so no special injection is needed.
    try { applyRoster(note.id, linkId, roster); } catch (e) { log.warn?.("[federation/notes] share roster:", e?.message); }

    try {
      // Seed the mirror's "Modifié le … par …" from the real last-edit info the
      // owner sent, falling back to owner + now for older peers that omit it.
      const shareStampAt = note.last_edited_at || note.client_updated_at || deps.nowISO();
      deps.updateNoteWithEditor.run(shareStampAt, note.last_edited_by || ownerName || ownerRef, shareStampAt, note.id);
      deps.createShareNotification({
        recipientId: target.id,
        senderId: shadowOwner.id,
        senderName: ownerName || ownerRef || "",
        noteId: note.id,
        noteTitle: note.title || "",
        readOnly: canWrite === 0,
      });
      deps.broadcastNoteUpdated(note.id);
    } catch (e) {
      log.warn?.("[federation/notes] post-share:", e?.message);
    }
    return {
      ok: true,
      user: { name: target.name, email: target.email, avatar_url: target.avatar_url || null },
    };
  }

  // ── Inbound: a peer pushes an updated copy of a federated note ──────
  function handleIncomingApply({ linkId, note, roster = null }) {
    if (deps.isLocked?.()) return { ok: false, error: "locked" };
    const mapping = q.getMappingForLink.get(note.id, linkId);
    if (!mapping) return { ok: false, error: "unknown_note" };
    const existing = deps.getNoteById.get(note.id);
    if (!existing) return { ok: false, error: "unknown_note" };

    // Sync the participant roster first, regardless of the content LWW
    // outcome below — a collaborator can be added/removed without the note
    // body changing, and a mirror only ever receives the roster here.
    if (mapping.role === "mirror") {
      try { applyRoster(note.id, linkId, roster); } catch (e) { log.warn?.("[federation/notes] apply roster:", e?.message); }
    }

    // Defense-in-depth: when WE are the authority (home), an incoming edit
    // is made on behalf of a remote recipient. If every remote recipient on
    // this link is read-only, refuse it — a read-only collaborator must
    // never change the note even if their server tried to push it. (The
    // mirror already blocks them locally; this guards a misbehaving peer.)
    // ok:true so the peer stops retrying; its divergent copy reconciles on
    // our next authoritative push.
    if (mapping.role === "home" &&
        !q.hasWritableShadowCollab.get(note.id, `${linkId}|%`)) {
      return { ok: true, readOnly: true };
    }

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
    // Carry the authoritative "last edited by / at" from the peer so our
    // mirror's "Modifié le … par …" reflects who actually made this edit on
    // the owning side — not whoever last touched our local copy. The content
    // UPDATE above never writes these columns. Older peers omit the fields, so
    // we skip in that case rather than wiping a good local stamp with nulls.
    try {
      if (note.last_edited_by != null || note.last_edited_at != null) {
        const stampAt = note.last_edited_at || note.client_updated_at || deps.nowISO();
        deps.updateNoteWithEditor.run(stampAt, note.last_edited_by ?? null, stampAt, note.id);
      }
    } catch (e) { log.warn?.("[federation/notes] editor stamp:", e?.message); }
    // Mark this exact version as "already in sync" for THIS peer so our own
    // tick never bounces it straight back (echo-loop guard). Other peers
    // keep their own last_pushed_cua and still receive the update.
    q.setPushed.run(note.client_updated_at, note.id, linkId);
    try {
      deps.broadcastNoteUpdated(note.id);
    } catch { /* SSE best-effort */ }
    return { ok: true };
  }

  // Push one note's current content to its peer (LWW on the other side).
  async function pushNoteContent(link, note) {
    const path = "/api/federation/notes/apply";
    const resp = await peer.httpJson(link.peer_base_url + path, {
      method: "POST",
      secret: link.shared_secret,
      linkId: link.id,
      path,
      body: {
        linkId: link.id,
        note: contentFromNote(note),
        // Keep the peer's participant list in sync with ours (the authority).
        roster: deps.getNoteRoster?.(note.id, note.user_id) || null,
      },
    });
    if (resp.ok && resp.json && resp.json.ok === true) {
      q.setPushed.run(note.client_updated_at, note.id, link.id);
      return true;
    }
    return false;
  }

  // Tell the peer to tear down its mirror of a note we no longer share.
  // keepCopies carries the "…but leave each recipient their content"
  // intent recorded on the mapping (see the teardown column).
  async function pushRemoval(link, noteId, keepCopies = false) {
    const path = "/api/federation/notes/remove";
    const resp = await peer.httpJson(link.peer_base_url + path, {
      method: "POST",
      secret: link.shared_secret,
      linkId: link.id,
      path,
      body: { linkId: link.id, noteId, keepCopies },
    });
    return !!(resp.ok && resp.json && resp.json.ok === true);
  }

  // Has a HOME note's share been revoked locally? (the note was deleted,
  // trashed, or the remote participant removed) → the mirror must go.
  // An explicitly recorded teardown always wins: it knows WHICH kind of
  // ending this is, where the checks below can only guess "destroy".
  function homeShareRevoked(m, note) {
    if (m.teardown) return true;
    if (!note) return true;
    if (note.trashed) return true;
    return !q.hasShadowCollab.get(m.note_id, `${m.link_id}|%`);
  }

  // Teardown pushes in flight, keyed by note|link. A single delete can
  // legitimately reach reconcile twice (the intent is recorded, then the
  // route broadcasts), and the tick can overlap either; without this the
  // same mirror gets torn down twice over the wire. Only the teardown
  // branch is guarded — a duplicate content push is already a no-op via
  // last_pushed_cua.
  const teardownsInFlight = new Set();

  async function reconcileMapping(m) {
    const link = store.getById(m.link_id);
    if (!link || link.status !== "active" || link.peer_reachable !== 1) return;
    const note = deps.getNoteById.get(m.note_id);

    // Revoked home share → remove this peer's mirror, then forget only
    // THIS link's mapping (other peers sharing the same note are untouched).
    // Until that push succeeds the mapping (and its teardown intent) stays
    // put, so an offline peer simply gets it on a later tick.
    if (m.role === "home" && homeShareRevoked(m, note)) {
      const key = `${m.note_id}|${m.link_id}`;
      if (teardownsInFlight.has(key)) return;
      teardownsInFlight.add(key);
      try {
        if (await pushRemoval(link, m.note_id, m.teardown === "keep_copies")) {
          q.deleteMappingForLink.run(m.note_id, m.link_id);
        }
      } finally {
        teardownsInFlight.delete(key);
      }
      return;
    }
    if (!note) return;
    if (note.client_updated_at && note.client_updated_at === m.last_pushed_cua) return; // unchanged
    await pushNoteContent(link, note);
  }

  // ── Tick: reconcile every federated note with its peer ──────────────
  // While locked we can't decrypt our own notes to push them; resume
  // automatically once unlocked.
  async function syncTick() {
    if (deps.isLocked?.()) return;
    let rows;
    try {
      rows = q.listAll.all();
    } catch {
      return;
    }
    for (const m of rows) {
      try {
        await reconcileMapping(m);
      } catch (e) {
        log.warn?.(`[federation/notes] reconcile ${m.note_id} failed:`, e?.message);
      }
    }
  }

  // Instant path: an edit just landed on a federated note → push it now
  // (the tick stays the retry/safety net). Fire-and-forget; loop-safe via
  // last_pushed_cua (an applied incoming write records its version first).
  function onNoteChangedLocally(noteId) {
    if (deps.isLocked?.()) return;
    // A note may be shared with several peers — reconcile every mapping so
    // the edit fans out to all of them, not just the first one.
    const mappings = q.listByNote.all(noteId);
    if (!mappings.length) return;
    for (const m of mappings) {
      Promise.resolve()
        .then(() => reconcileMapping(m))
        .catch((e) => log.warn?.("[federation/notes] instant push:", e?.message));
    }
  }

  // The participant list changed on a HOME note (collaborator added/removed
  // or an access toggle) without necessarily touching the body. Push the
  // current content + roster to every peer so their displayed roster updates
  // even when the LWW content is unchanged (a same-cua apply is a content
  // no-op on the peer, but the roster is always applied).
  function onParticipantsChangedLocally(noteId) {
    if (deps.isLocked?.()) return;
    const note = deps.getNoteById.get(noteId);
    if (!note) return;
    for (const m of q.listByNote.all(noteId)) {
      if (m.role !== "home") continue;
      // A roster change (collaborator added/removed, access toggled, or a
      // whole user deleted) does NOT bump the note's client_updated_at, so the
      // reconcile tick's "content unchanged" guard (client_updated_at ===
      // last_pushed_cua) would skip re-pushing it. Clear this peer's push
      // watermark FIRST so the change is guaranteed to be delivered: the
      // instant push below restores the watermark on success, but if the peer
      // is unreachable right now (or the push fails) the watermark stays empty
      // and the tick keeps retrying until it lands — making roster changes
      // self-healing across reconnects, exactly like content edits already are.
      // Without this, a roster change pushed while the peer is down (or made
      // before the peer ran this code) is lost forever, leaving a deleted
      // collaborator stuck on the peer's mirror.
      try { q.setPushed.run(null, m.note_id, m.link_id); } catch { /* best-effort */ }
      const link = store.getById(m.link_id);
      if (!link || link.status !== "active" || link.peer_reachable !== 1) continue;
      Promise.resolve()
        .then(() => pushNoteContent(link, note))
        .catch((e) => log.warn?.("[federation/notes] roster push:", e?.message));
    }
  }

  // ── Inbound: a peer's user changed their display profile (name/avatar) ─
  // Refresh every local shadow stand-in for that user on THIS link so their
  // new avatar/name shows on already-shared notes at once — without waiting
  // for a note edit. Scoped to the calling link (a shadow's federated_origin
  // is "<linkId>|<ref>"), so a peer can only ever touch the stand-ins it is
  // the origin of. Touches only the `users` row, so it works while locked.
  function applyRemoteProfile({ linkId, ref, uid, name, avatarUrl }) {
    const link = store.getById(linkId);
    if (!link) return { ok: false, error: "unknown_link" };
    // A stand-in may be keyed by the participant's clean ref (an owner or a
    // direct recipient) or by the home server's uid for them (a third-server
    // roster stand-in); try both so the refresh lands either way.
    const origins = [];
    if (ref) origins.push(`${linkId}|${ref}`);
    if (uid && uid !== ref) origins.push(`${linkId}|${uid}`);
    const touched = [];
    for (const origin of origins) {
      const shadow = q.getShadowByOrigin.get(origin);
      if (!shadow) continue;
      const nextName = name || shadow.name;
      // avatarUrl is sent as a string (new image) or null (cleared);
      // undefined means "unknown" and leaves the stored value untouched.
      const nextAvatar = avatarUrl === undefined ? shadow.avatar_url : (avatarUrl || null);
      if (nextName !== shadow.name || nextAvatar !== shadow.avatar_url) {
        try { q.updateShadow.run(nextName, nextAvatar, shadow.id); } catch { /* best-effort */ }
      }
      touched.push(shadow.id);
    }
    if (touched.length === 0) return { ok: true };
    // Repaint every note these stand-ins appear on so open footers /
    // collaborator lists re-fetch and show the new avatar immediately.
    try {
      const seen = new Set();
      for (const sid of touched) {
        for (const row of q.notesForUser.all(sid, sid)) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          try { deps.broadcastNoteUpdated?.(row.id); } catch { /* per-note best-effort */ }
        }
      }
    } catch { /* ignore */ }
    return { ok: true };
  }

  // ── Outbound: tell every paired peer OUR user changed their profile ──
  // Fire-and-forget; a peer that's momentarily down just misses this live
  // refresh and re-learns the avatar on the next share. `ref` is our user's
  // stable identity on us (email||name) and `uid` our local key for them, so
  // the peer can match a stand-in keyed either way.
  function broadcastProfileToPeers({ ref, uid, name, avatarUrl }) {
    if (!ref && !uid) return;
    const path = "/api/federation/profile";
    let links;
    try { links = store.listActive(); } catch { return; }
    for (const link of links) {
      Promise.resolve()
        .then(() =>
          peer.httpJson(link.peer_base_url + path, {
            method: "POST",
            secret: link.shared_secret,
            linkId: link.id,
            path,
            body: {
              linkId: link.id,
              ref: ref || null,
              uid: uid || null,
              name: name || null,
              avatar_url: avatarUrl ?? null,
            },
          }),
        )
        .catch((e) => log.warn?.("[federation/notes] profile push:", e?.message));
    }
  }

  // ── Reconnect heal: push all local profiles to a single link ────────
  // Called when a peer that was offline comes back. Sends every real
  // local user's current name + avatar so the peer's shadow stand-ins
  // catch up on any changes that were missed while it was down.
  // Scoped to ONE link so we don't spam every peer on each reconnect.
  function pushProfilesToLink(link) {
    if (!link) return;
    const path = "/api/federation/profile";
    let users;
    try { users = q.allRealUsers.all(); } catch { return; }
    for (const u of users) {
      const ref = u.email || u.name;
      if (!ref) continue;
      Promise.resolve()
        .then(() =>
          peer.httpJson(link.peer_base_url + path, {
            method: "POST",
            secret: link.shared_secret,
            linkId: link.id,
            path,
            body: {
              linkId: link.id,
              ref,
              uid: `local:${u.id}`,
              name: u.name || null,
              avatar_url: u.avatar_url ?? null,
            },
          }),
        )
        .catch((e) => log.warn?.("[federation/notes] profile reconnect:", e?.message));
    }
  }

  // ── Inbound: the peer removed/unshared a note we mirror ─────────────
  // keepCopies: the share ended WITHOUT the content being deleted (the
  // owner left the note, or removed its last recipient while granting a
  // copy). Every real local participant keeps a standalone copy instead of
  // losing the note.
  //
  // Doing this here — rather than only in the separate unshare-recipient
  // call — is what makes the two race-free: whichever of the two arrives
  // first finds the recipient still present and makes the copy, and the
  // other then finds nothing left to do. Exactly one copy either way.
  function handleIncomingRemove({ linkId, noteId, keepCopies = false }) {
    const m = q.getMappingForLink.get(noteId, linkId);
    if (!m || m.role !== "mirror") {
      q.deleteMappingForLink.run(noteId, linkId); // tidy any stray mapping for this link
      return { ok: true };
    }
    // Identify the local participants + the remote owner (a shadow user)
    // BEFORE deleting, so we can both drop the note and tell them why —
    // exactly like a normal "owner deleted the shared note" notice. The
    // shadow lookup avoids needing to decrypt the note (works while
    // locked); the title is best-effort.
    let recipients = [];
    try {
      recipients = q.realParticipants.all(noteId).map((r) => r.user_id);
    } catch { /* ignore */ }
    const shadow = q.getShadowByOrigin.get(`${linkId}|${m.remote_owner_ref}`);
    let note = null;
    try {
      note = deps.getNoteById.get(noteId) || null;
    } catch { /* locked: no content, still remove */ }
    const title = note?.title || "";

    // Copies FIRST, while the mirror row is still readable.
    const copyByUser = new Map();
    if (keepCopies && note) {
      for (const uid of recipients) {
        const copyId = makeStandaloneCopy(note, uid);
        if (copyId) copyByUser.set(uid, copyId);
      }
    }

    try {
      // A mirror note has exactly one mapping (this link); drop it and the
      // note row. deleteAllForNote is belt-and-suspenders against strays.
      q.deleteAllForNote.run(noteId);
      q.deleteNoteRow.run(noteId); // cascades collaborators / positions / tags
    } catch (e) {
      log.warn?.("[federation/notes] remove mirror:", e?.message);
    }
    for (const uid of recipients) {
      const copyNoteId = copyByUser.get(uid) || null;
      // Drop it from the open view immediately… or, when a copy was kept,
      // swap the copy in for it in one atomic client-side update (the same
      // event the local remove-collaborator flow sends).
      try {
        deps.sendEventToUser?.(
          uid,
          copyNoteId
            ? { type: "note_access_revoked", noteId, copyNoteId }
            : { type: "note_deleted", noteId },
        );
      } catch { /* SSE best-effort */ }
      // …and leave a persisted notice so it reads like a local deletion
      // (and an offline participant still learns about it on reconnect).
      try {
        if (shadow) {
          deps.createSharedNoteDeletedNotification?.({
            recipientId: uid,
            senderId: shadow.id,
            senderName: shadow.name || m.remote_owner_ref || "",
            noteTitle: title,
            // Point "Open" at the copy they actually still have, and pick
            // the wording that says the content was kept.
            noteId: copyNoteId,
            notificationType: copyNoteId ? "shared_note_deleted_with_copy" : "shared_note_deleted",
          });
        }
      } catch { /* notification best-effort */ }
    }
    return { ok: true };
  }

  // ── Outbound: tell the peer a remote collaborator's access changed ───
  // The owner toggled a federated recipient between read-only / read-write;
  // push it so their mirror copy flips immediately. `shadow` is our local
  // stand-in for that recipient (federated_origin = `${linkId}|${ref}`).
  async function setRemotePermission({ note, shadow, canWrite }) {
    const origin = shadow?.federated_origin || "";
    const sep = origin.indexOf("|");
    if (sep < 0) return { ok: false, error: "not_federated" };
    const linkId = origin.slice(0, sep);
    const targetRef = origin.slice(sep + 1);
    const link = store.getById(linkId);
    if (!link || link.status !== "active") return { ok: false, error: "peer_not_paired" };
    const path = "/api/federation/notes/permission";
    try {
      const resp = await peer.httpJson(link.peer_base_url + path, {
        method: "POST",
        secret: link.shared_secret,
        linkId: link.id,
        path,
        body: { linkId: link.id, noteId: note.id, targetRef, canWrite: canWrite ? 1 : 0 },
      });
      return { ok: !!(resp.ok && resp.json && resp.json.ok === true) };
    } catch (e) {
      return { ok: false, error: peer.tlsAwareMessage ? peer.tlsAwareMessage(e) : "unreachable" };
    }
  }

  // ── Inbound: the peer changed a recipient's access on a note we mirror ─
  // Flip the local recipient's read/write bit; no note content is touched,
  // so this works even while the instance is locked.
  function handleIncomingPermission({ linkId, noteId, targetRef, canWrite }) {
    const m = q.getMappingForLink.get(noteId, linkId);
    if (!m || m.role !== "mirror") {
      return { ok: false, error: "unknown_note" };
    }
    const target =
      deps.getRealUserByEmail?.get(targetRef) || deps.getRealUserByName?.get(targetRef);
    if (!target) return { ok: false, error: "user_not_found" };
    try {
      deps.setCollaboratorCanWrite.run(canWrite ? 1 : 0, noteId, target.id);
      // Re-broadcast for any non-open surfaces, plus a dedicated access
      // event that flips the recipient's OPEN editor instantly (the generic
      // patch is suppressed while they hold a local lease / pending edits).
      deps.broadcastNoteUpdated(noteId);
      deps.sendEventToUser?.(target.id, {
        type: "note_access_changed",
        noteId,
        access: canWrite ? "write" : "read",
      });
    } catch (e) {
      log.warn?.("[federation/notes] apply permission:", e?.message);
      return { ok: false, error: "apply_failed" };
    }
    return { ok: true };
  }

  // ── Outbound: the owner removed a single federated recipient ─────────
  // Tell that recipient's peer to drop just THAT user from the note, leaving
  // any other recipients on the same peer (and the mirror itself) intact.
  // `shadow` is our local stand-in for the removed recipient
  // (federated_origin = `${linkId}|${remoteRef}`).
  async function unshareFromRemote({ shadow, noteId, withCopy = false }) {
    const origin = shadow?.federated_origin || "";
    const sep = origin.indexOf("|");
    if (sep < 0) return { ok: false, error: "not_federated" };
    const linkId = origin.slice(0, sep);
    const targetRef = origin.slice(sep + 1);
    const link = store.getById(linkId);
    if (!link || link.status !== "active") return { ok: false, error: "peer_not_paired" };
    const path = "/api/federation/notes/unshare-recipient";
    try {
      const resp = await peer.httpJson(link.peer_base_url + path, {
        method: "POST",
        secret: link.shared_secret,
        linkId: link.id,
        path,
        body: { linkId: link.id, noteId, targetRef, withCopy },
      });
      return { ok: !!(resp.ok && resp.json && resp.json.ok === true) };
    } catch (e) {
      return { ok: false, error: peer.tlsAwareMessage ? peer.tlsAwareMessage(e) : "unreachable" };
    }
  }

  // Give a local user their own standalone (non-federated) note carrying
  // this mirror's current content — what "keep a copy" means on THIS side
  // of the link. Built here, from the already-synced mirror row, and owned
  // by the recipient's REAL account: a copy made on the owner's server
  // could only ever belong to the powerless shadow user standing in for
  // them there. Field-for-field the same shape as the local
  // remove-collaborator "keep a copy" flow in server/index.js.
  // Returns the new note id, or null if it could not be created.
  function makeStandaloneCopy(note, userId) {
    try {
      const copyNoteId = deps.uid?.();
      if (!copyNoteId) return null;
      deps.runInsertNote?.({
        id: copyNoteId,
        user_id: userId,
        type: note.type,
        title: note.title,
        content: note.content,
        items_json: note.items_json,
        // Their own personal tags on the mirror, not the shared default.
        tags_json: deps.getUserTags?.(note.id, userId) || "[]",
        images_json: note.images_json,
        color: note.color,
        pinned: 0,
        position: note.position,
        timestamp: note.timestamp,
        client_updated_at: deps.nowISO?.(),
      });
      const maxPosRow = deps.getMaxUserEffectivePosition?.get(userId, userId, userId, userId);
      deps.upsertUserPosition?.run({
        note_id: copyNoteId,
        user_id: userId,
        position: (typeof maxPosRow?.max_pos === "number" ? maxPosRow.max_pos : 0) + 1,
        pinned: 0,
      });
      return copyNoteId;
    } catch (e) {
      log.warn?.("[federation/notes] standalone copy:", e?.message);
      return null;
    }
  }

  // ── Inbound: the authority removed one of our local users from a note ─
  // Drop just that recipient's collaborator row (not the whole mirror) and
  // tell their open session so the note disappears without a manual refresh.
  // withCopy: the owner chose "keep a copy".
  function handleIncomingUnshareRecipient({ linkId, noteId, targetRef, withCopy = false }) {
    const m = q.getMappingForLink.get(noteId, linkId);
    if (!m || m.role !== "mirror") return { ok: false, error: "unknown_note" };
    const target =
      deps.getRealUserByEmail?.get(targetRef) || deps.getRealUserByName?.get(targetRef);
    if (!target) return { ok: true }; // already gone — nothing to do
    try {
      const note = deps.getNoteById?.get(noteId);
      const copyNoteId = withCopy && note ? makeStandaloneCopy(note, target.id) : null;
      deps.removeCollaborator?.run(noteId, target.id);
      q.deleteUserTags.run(noteId, target.id);
      q.deleteUserPosition.run(noteId, target.id);
      // Same event the local flow sends: with no copyNoteId it behaves
      // exactly like a plain note_deleted; with one, the client swaps the
      // fetched copy in for the removed note in one atomic update.
      deps.sendEventToUser?.(target.id, { type: "note_access_revoked", noteId, copyNoteId });
      // A real notification too -- the live event above only makes the
      // note vanish (or swaps in the copy); without this the removed user
      // gets no explanation of what happened, unlike a same-server
      // removal. The remote owner is represented locally by the mirror's
      // shadow user (its user_id -- see ensureShadowUser in
      // handleIncomingShare), so no extra data needs to travel over the
      // wire to name them.
      if (note) {
        const owner = deps.getUserById?.get(note.user_id);
        deps.createAccessRevokedNotification?.({
          recipientId: target.id,
          senderId: note.user_id,
          senderName: owner?.name || owner?.email || "",
          noteId: copyNoteId || noteId,
          noteTitle: note.title || "",
          withCopy: !!copyNoteId,
        });
      }
    } catch (e) {
      log.warn?.("[federation/notes] unshare recipient:", e?.message);
      return { ok: false, error: "apply_failed" };
    }
    return { ok: true };
  }

  // A federated MIRROR note is read-only while its home link can't be
  // trusted to accept the write (offline / locked / out of date). The
  // host write path consults this so an edit is refused server-side, and
  // the client shows the matching banner.
  function isReadOnly(noteId) {
    const m = q.getMirrorMapping.get(noteId);
    if (!m) return false;
    const link = store.getById(m.link_id);
    return !link || !require("./protocol").isLinkWritable(link);
  }

  // Record how this note's share must end on every peer carrying it, and
  // kick the push now (the tick retries it until it lands). Called by the
  // delete routes at the moment the owner's intent is known — see the
  // teardown column for why it has to be persisted rather than inferred.
  // Applies to every peer the note rides, since the whole note is ending.
  //   mode: 'destroy' | 'keep_copies'
  //
  // The DB write is synchronous on purpose: callers broadcast immediately
  // afterwards, and that broadcast triggers the reconcile which reads it.
  function markShareEnding(noteId, mode) {
    if (mode !== "destroy" && mode !== "keep_copies") return;
    try {
      q.setTeardownForNote.run(mode, noteId);
    } catch (e) {
      log.warn?.("[federation/notes] mark share ending:", e?.message);
      return;
    }
    onNoteChangedLocally(noteId);
  }

  // A federated recipient was just removed from a HOME note locally (the
  // owner removed them, with or without leaving them a copy). Pushes the
  // per-recipient unshare and — when that was the LAST recipient on this
  // link, so the whole mirror is about to come down — records how that
  // teardown must behave, instead of letting it default to "destroy" and
  // wipe out the copy the owner meant to leave.
  //
  // Call this BEFORE broadcasting: the teardown write has to land before
  // the reconcile that reads it.
  function onRemoteRecipientRemoved({ shadow, noteId, withCopy = false }) {
    const origin = shadow?.federated_origin || "";
    const sep = origin.indexOf("|");
    if (sep < 0) return;
    const linkId = origin.slice(0, sep);
    let stillShared = true;
    try {
      stillShared = !!q.hasShadowCollab.get(noteId, `${linkId}|%`);
    } catch { /* on a read error assume it is: never tear down on a guess */ }
    if (!stillShared) {
      try {
        q.setTeardownForLink.run(withCopy ? "keep_copies" : "destroy", noteId, linkId);
      } catch (e) {
        log.warn?.("[federation/notes] mark recipient teardown:", e?.message);
      }
    }
    Promise.resolve()
      .then(() => unshareFromRemote({ shadow, noteId, withCopy }))
      .catch((e) => log.warn?.("[federation/notes] unshareFromRemote failed:", e?.message));
  }

  return {
    handleIncomingShare,
    handleIncomingApply,
    handleIncomingRemove,
    handleIncomingPermission,
    handleIncomingUnshareRecipient,
    markShareEnding,
    onRemoteRecipientRemoved,
    applyRemoteProfile,
    broadcastProfileToPeers,
    pushProfilesToLink,
    shareWithRemote,
    setRemotePermission,
    syncTick,
    onNoteChangedLocally,
    onParticipantsChangedLocally,
    // A link's connectivity flipped → nudge every note riding it so each
    // participant's OPEN copy re-fetches and reflects the new state at
    // once (e.g. authority went offline → mirror goes read-only now, not
    // only once the user tries to type).
    onLinkStateChanged(linkId) {
      try {
        for (const m of q.listByLink.all(linkId)) {
          try {
            deps.broadcastNoteUpdated?.(m.note_id);
          } catch { /* per-note best-effort */ }
        }
      } catch { /* ignore */ }
    },
    isReadOnly,
    // Federation status of a note, for serialization to the client: the
    // role, the live link state, whether it's currently read-only (a
    // MIRROR whose authority link isn't writable), and the peer's name —
    // everything the note UI needs to show the right banner.
    noteFederationInfo(noteId) {
      // A note is either a mirror (one home) or a home shared to >=1 peers.
      // Prefer the mirror mapping (drives the read-only banner); otherwise
      // any home mapping reflects that the note is federated outward.
      const m = q.getMirrorMapping.get(noteId) || q.getAnyMapping.get(noteId);
      if (!m) return null;
      const link = store.getById(m.link_id);
      const writable = link ? require("./protocol").isLinkWritable(link) : false;
      return {
        role: m.role,
        state: require("./protocol").deriveLinkState(link),
        readOnly: m.role === "mirror" && !writable,
        peerLabel: link ? link.peer_label || hostOf(link.peer_base_url) : null,
      };
    },
    isPeerHost: (host) => !!activeLinkForHost(host),
    getMapping: (noteId) => q.getAnyMapping.get(noteId),
    // Friendly name of the server a shadow user belongs to, for badges.
    // Resolves by the (stable) link id embedded in federated_origin, and
    // falls back to matching an active link by host — so a re-paired link
    // (new id) still resolves the name. `hostHint` is the peer host, e.g.
    // recovered from the shadow's synthetic email.
    serverLabelForOrigin(federatedOrigin, hostHint) {
      if (!federatedOrigin) return null;
      const linkId = String(federatedOrigin).split("|")[0];
      let link = store.getById(linkId);
      if (!link && hostHint) {
        link =
          store.listAll().find((l) => hostOf(l.peer_base_url) === hostHint) || null;
      }
      if (!link) return null;
      return link.peer_label || hostOf(link.peer_base_url);
    },
  };
}

module.exports = { createNoteFederation, CONTENT_FIELDS };
