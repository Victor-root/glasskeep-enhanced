// server/federation/notesSchema.js
//
// Storage for note-level federation (see federation/notes.js): the
// additive schema migrations, and every prepared statement the note
// federation modules share.

function migrateSchema(db, log) {
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
  //   NULL          : no teardown pending
  //   'destroy'     : the mirror must go, content and all
  //   'keep_copies' : the share is over, but every remote recipient keeps
  //                   their own standalone copy of the content
  //
  // WHY PERSIST the intent instead of inferring it when we push: only the
  // action itself knows whether this is "delete for everyone" or "delete
  // just for me", yet the push may not happen until minutes later (the
  // tick retries once an offline peer returns). reconcileMapping used to
  // infer "destroy" from the note merely being trashed, which cannot tell
  // those two apart, so a retry destroyed content the owner meant to
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
}

// Runs the migrations, then prepares the statements against the result.
function createNoteFederationQueries(db, log) {
  migrateSchema(db, log);
  return {
    // All mappings for a note: a home note can ride several peer links.
    listByNote: db.prepare(`SELECT * FROM federated_notes WHERE note_id = ?`),
    // The mapping for one specific (note, link) pair.
    getMappingForLink: db.prepare(`SELECT * FROM federated_notes WHERE note_id = ? AND link_id = ?`),
    // A note's MIRROR mapping, if any. A note is the mirror of at most one
    // home, so this is unambiguous (unlike home notes shared to many peers).
    getMirrorMapping: db.prepare(`SELECT * FROM federated_notes WHERE note_id = ? AND role = 'mirror' LIMIT 1`),
    // Any one mapping for a note: UI fallback when the peer is irrelevant.
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
    // Re-point a stand-in at the remote user's new address (see the
    // previousRef handling in applyRemoteProfile, notesProfiles.js).
    rekeyShadow: db.prepare(`UPDATE users SET federated_origin = ?, email = ? WHERE id = ?`),
    renameOwnerRef: db.prepare(
      `UPDATE federated_notes SET remote_owner_ref = ? WHERE link_id = ? AND remote_owner_ref = ?`,
    ),
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
    // Every note a (shadow) user takes part in, as a collaborator or as the
    // owner, so a profile refresh can repaint exactly those notes' open views.
    notesForUser: db.prepare(`
      SELECT note_id AS id FROM note_collaborators WHERE user_id = ?
      UNION
      SELECT id FROM notes WHERE user_id = ?
    `),
    // All real (non-shadow) local users: used to re-push profiles on reconnect.
    allRealUsers: db.prepare(`SELECT id, name, email, avatar_url FROM users WHERE federated_origin IS NULL`),
    deleteNoteRow: db.prepare(`DELETE FROM notes WHERE id = ?`),
    // Per-user leftovers on a note a removed recipient no longer collaborates
    // on: mirrors the local remove-collaborator route's own cleanup so a
    // federated removal doesn't leave orphaned rows behind.
    deleteUserTags: db.prepare(`DELETE FROM note_user_tags WHERE note_id = ? AND user_id = ?`),
    deleteUserPosition: db.prepare(`DELETE FROM note_user_positions WHERE note_id = ? AND user_id = ?`),
  };
}

module.exports = { createNoteFederationQueries };
