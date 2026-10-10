// server/services/noteUserState.js
//
// What each participant keeps to themselves on a note: their tags, their
// icon and their pin/position. Tags and icons are encrypted at rest like
// note content.

const noteCipher = require("../encryption/noteCipher");

function createNoteUserState({ db, getNoteById }) {
  // Per-user tags
  // Schema also carries (is_encrypted, enc_payload) so the rows can be
  // stored encrypted at rest. The plaintext tags_json column is kept as
  // a placeholder ("[]") on encrypted rows to satisfy the NOT NULL
  // default and to keep any reader outside these helpers from seeing
  // real tag names.
  const getUserTagsRowStmt = db.prepare(
    "SELECT tags_json, is_encrypted, enc_payload FROM note_user_tags WHERE note_id = ? AND user_id = ?"
  );
  const upsertUserTagsPlainStmt = db.prepare(
    `INSERT INTO note_user_tags (note_id, user_id, tags_json, is_encrypted, enc_payload)
     VALUES (?, ?, ?, 0, NULL)
     ON CONFLICT(note_id, user_id) DO UPDATE SET
       tags_json = excluded.tags_json,
       is_encrypted = 0,
       enc_payload = NULL`
  );
  const upsertUserTagsEncStmt = db.prepare(
    `INSERT INTO note_user_tags (note_id, user_id, tags_json, is_encrypted, enc_payload)
     VALUES (?, ?, '[]', 1, ?)
     ON CONFLICT(note_id, user_id) DO UPDATE SET
       tags_json = '[]',
       is_encrypted = 1,
       enc_payload = excluded.enc_payload`
  );

  // Read the per-user tag list for (noteId, userId): transparently
  // decrypts when the row is stored encrypted. Returns '[]' when no row
  // exists or when decryption fails (the latter is logged so a corrupted
  // AAD is investigable instead of silently swallowed).
  function getUserTags(noteId, userId) {
    const row = getUserTagsRowStmt.get(noteId, userId);
    if (!row) return "[]";
    if (!row.is_encrypted) return row.tags_json || "[]";
    if (!row.enc_payload) return "[]";
    try {
      return noteCipher.decryptTagsPayload(row.enc_payload, { noteId, userId });
    } catch (e) {
      console.warn(`[encrypt] failed to decrypt tags for note=${noteId} user=${userId}: ${e.message}`);
      return "[]";
    }
  }

  // Persist the per-user tag list for (noteId, userId). Uses the
  // encrypted statement when the instance is unlocked and encryption is
  // active; falls back to the plaintext statement otherwise.
  function runUpsertUserTags(noteId, userId, tagsJson) {
    if (noteCipher.isActive()) {
      const enc = noteCipher.encryptTagsJson(tagsJson, { noteId, userId });
      upsertUserTagsEncStmt.run(noteId, userId, enc);
    } else {
      upsertUserTagsPlainStmt.run(noteId, userId, tagsJson);
    }
  }

  // ── Per-user note icon (logo) ────────────────────────────────────────
  // Mirrors the per-user tag helpers above: a personal, never-synced icon
  // stored per (noteId, userId), encrypted at rest with the same primitives
  // as tags (an icon can be a custom uploaded image, so it gets the same
  // at-rest protection note content has).
  const getUserIconRowStmt = db.prepare(
    "SELECT icon_json, is_encrypted, enc_payload FROM note_user_icons WHERE note_id = ? AND user_id = ?"
  );
  const upsertUserIconPlainStmt = db.prepare(
    `INSERT INTO note_user_icons (note_id, user_id, icon_json, is_encrypted, enc_payload)
     VALUES (?, ?, ?, 0, NULL)
     ON CONFLICT(note_id, user_id) DO UPDATE SET
       icon_json = excluded.icon_json,
       is_encrypted = 0,
       enc_payload = NULL`
  );
  const upsertUserIconEncStmt = db.prepare(
    `INSERT INTO note_user_icons (note_id, user_id, icon_json, is_encrypted, enc_payload)
     VALUES (?, ?, '', 1, ?)
     ON CONFLICT(note_id, user_id) DO UPDATE SET
       icon_json = '',
       is_encrypted = 1,
       enc_payload = excluded.enc_payload`
  );
  const deleteUserIconStmt = db.prepare(
    "DELETE FROM note_user_icons WHERE note_id = ? AND user_id = ?"
  );

  // Returns the user's icon object for a note, or null. Transparently
  // decrypts an encrypted row; returns null on missing row / decrypt failure.
  function getUserIcon(noteId, userId) {
    if (!userId) return null;
    const row = getUserIconRowStmt.get(noteId, userId);
    if (!row) return null;
    let raw;
    if (!row.is_encrypted) {
      raw = row.icon_json || "";
    } else if (!row.enc_payload) {
      return null;
    } else {
      try {
        raw = noteCipher.decryptTagsPayload(row.enc_payload, { noteId, userId });
      } catch (e) {
        console.warn(`[encrypt] failed to decrypt icon for note=${noteId} user=${userId}: ${e.message}`);
        return null;
      }
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  // Set or clear the user's personal icon for a note. `icon` is the icon
  // object ({id,src,name}) or null/undefined to remove it.
  function runSetUserIcon(noteId, userId, icon) {
    if (!icon) {
      deleteUserIconStmt.run(noteId, userId);
      return;
    }
    const iconJson = JSON.stringify(icon);
    if (noteCipher.isActive()) {
      const enc = noteCipher.encryptTagsJson(iconJson, { noteId, userId });
      upsertUserIconEncStmt.run(noteId, userId, enc);
    } else {
      upsertUserIconPlainStmt.run(noteId, userId, iconJson);
    }
  }

  // Per-user position/pinned override for shared notes.
  // Each participant (owner or collaborator) keeps their own ordering state here;
  // the notes row only holds the initial default.
  const getUserPositionForNote = db.prepare(
    "SELECT position, pinned FROM note_user_positions WHERE note_id = ? AND user_id = ?"
  );
  const upsertUserPosition = db.prepare(`
    INSERT INTO note_user_positions (note_id, user_id, position, pinned)
    VALUES (@note_id, @user_id, @position, @pinned)
    ON CONFLICT(note_id, user_id) DO UPDATE SET
      position = excluded.position,
      pinned = excluded.pinned
  `);

  // Highest effective position across a user's visible (active) notes:
  // owned or collaborated. Used to seed a freshly shared note at the top
  // of the recipient's list so it doesn't bury under their existing notes.
  const getMaxUserEffectivePosition = db.prepare(`
    SELECT COALESCE(MAX(COALESCE(nup.position, n.position)), 0) AS max_pos
    FROM notes n
    LEFT JOIN note_user_positions nup ON nup.note_id = n.id AND nup.user_id = ?
    LEFT JOIN note_collaborators nc ON n.id = nc.note_id AND nc.user_id = ?
    WHERE (n.user_id = ? OR nc.user_id = ?) AND n.trashed = 0 AND n.archived = 0
  `);

  function getUserPosition(noteId, userId) {
    return getUserPositionForNote.get(noteId, userId) || null;
  }

  // Write a partial per-user position/pinned update without losing the
  // other field. Seeds a row from the note's defaults on first write so
  // collaborators can pin or reorder before they've ever touched the note.
  function setUserPinOrPosition(noteId, userId, { pinned, position }) {
    const note = getNoteById.get(noteId);
    if (!note) return;
    const existing = getUserPositionForNote.get(noteId, userId);
    const nextPinned =
      typeof pinned === "boolean"
        ? (pinned ? 1 : 0)
        : existing
          ? existing.pinned
          : note.pinned;
    const nextPosition =
      typeof position === "number"
        ? position
        : existing
          ? existing.position
          : note.position;
    upsertUserPosition.run({
      note_id: noteId,
      user_id: userId,
      position: nextPosition,
      pinned: nextPinned,
    });
  }

  return {
    getUserTags,
    runUpsertUserTags,
    getUserIcon,
    runSetUserIcon,
    deleteUserIconStmt,
    getUserPosition,
    setUserPinOrPosition,
    upsertUserPosition,
    getMaxUserEffectivePosition,
  };
}

module.exports = { createNoteUserState };
