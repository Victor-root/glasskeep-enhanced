// server/encryption/atRestMigrations.js
//
// The bulk rewrites behind the at-rest encryption routes
// (routes/unlockRoutes.js): encrypting every existing row on activation,
// decrypting them all back on deactivation, upgrading older formats after
// an unlock, and purging the freed pages each of those leaves behind.

const noteCipher = require("./noteCipher");
const vault = require("./instanceVault");

// SQLite marks the pages a rewrite replaced as free but does NOT zero
// them, so a thief reading the raw .db file could still grep the old
// contents. WAL mode keeps an even longer trail.
//
// Three steps to physically purge:
//   1. checkpoint(TRUNCATE): flush WAL into the main file and
//      drop the WAL.
//   2. VACUUM: copy live pages to a fresh file, freed pages
//      (still containing the old contents) are dropped on the floor.
//   3. checkpoint(TRUNCATE) again: VACUUM itself ran through
//      the WAL on a still-open connection, so we drain it once
//      more. Without this final pass the freshly-purged file
//      coexists with a WAL that holds the very pages we just
//      tried to discard.
// VACUUM cannot run inside a transaction, hence the separate calls.
// Throws on failure; each caller decides how loudly to report it.
function purgeFreedPages(db) {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.exec("VACUUM");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
}

// Run after every successful unlock. Two upgrade paths:
//   - notes encrypted in the v1 format (no AAD) get re-encrypted as
//     v2 (AAD bound to noteId+ownerUserId) so a stolen ciphertext
//     can no longer be moved between rows undetected.
//   - per-user tag rows that pre-date the tag-encryption hardening
//     get encrypted in place.
// Both run in a single transaction; failure logs and falls through:
// the user is still unlocked, the migration will simply retry on the
// next unlock. After both passes finish we VACUUM (with the same
// triple-pass as activation) so freed pages don't leak the previous
// formats.
function runUpgradeMigrations(db, log) {
  let touchedNotes = 0;
  let touchedTags = 0;

  try {
    const v1Notes = db.prepare(
      "SELECT id, user_id, enc_payload FROM notes WHERE is_server_encrypted = 1 AND (enc_version IS NULL OR enc_version < ?)"
    ).all(noteCipher.NOTE_VERSION_LATEST);
    const updNote = db.prepare(
      "UPDATE notes SET enc_version = ?, enc_payload = ? WHERE id = ?"
    );
    const noteTx = db.transaction(() => {
      for (const r of v1Notes) {
        const fields = noteCipher.decryptPayload(r.enc_payload, {
          noteId: r.id,
          userId: r.user_id,
        });
        const payload = noteCipher.encryptFields(fields, {
          noteId: r.id,
          userId: r.user_id,
        });
        updNote.run(noteCipher.NOTE_VERSION_LATEST, payload, r.id);
        touchedNotes++;
      }
    });
    noteTx();
  } catch (e) {
    log.warn?.(`[encrypt] note v1->v2 migration aborted: ${e.message}`);
  }

  try {
    const plainTags = db.prepare(
      "SELECT note_id, user_id, tags_json FROM note_user_tags WHERE is_encrypted = 0 AND tags_json IS NOT NULL AND tags_json != '[]' AND tags_json != ''"
    ).all();
    const updTag = db.prepare(
      "UPDATE note_user_tags SET tags_json = '[]', is_encrypted = 1, enc_payload = ? WHERE note_id = ? AND user_id = ?"
    );
    const tagTx = db.transaction(() => {
      for (const r of plainTags) {
        const enc = noteCipher.encryptTagsJson(r.tags_json, {
          noteId: r.note_id,
          userId: r.user_id,
        });
        updTag.run(enc, r.note_id, r.user_id);
        touchedTags++;
      }
    });
    tagTx();
  } catch (e) {
    log.warn?.(`[encrypt] tag encryption migration aborted: ${e.message}`);
  }

  // Safety net: encrypt any per-user icon rows that are still plaintext
  // (e.g. created while the instance was briefly unlocked-but-not-yet-
  // re-encrypted). Mirrors the tag pass above.
  try {
    const plainIcons = db.prepare(
      "SELECT note_id, user_id, icon_json FROM note_user_icons WHERE is_encrypted = 0 AND icon_json IS NOT NULL AND icon_json != ''"
    ).all();
    const updIcon = db.prepare(
      "UPDATE note_user_icons SET icon_json = '', is_encrypted = 1, enc_payload = ? WHERE note_id = ? AND user_id = ?"
    );
    const iconTx = db.transaction(() => {
      for (const r of plainIcons) {
        const enc = noteCipher.encryptTagsJson(r.icon_json, {
          noteId: r.note_id,
          userId: r.user_id,
        });
        updIcon.run(enc, r.note_id, r.user_id);
        touchedTags++;
      }
    });
    iconTx();
  } catch (e) {
    log.warn?.(`[encrypt] icon encryption migration aborted: ${e.message}`);
  }

  if (touchedNotes > 0 || touchedTags > 0) {
    log.info?.(`[encrypt] upgrade migration: notes=${touchedNotes} tags=${touchedTags}`);
    try {
      purgeFreedPages(db);
    } catch (e) {
      log.warn?.(`[encrypt] post-migration VACUUM failed: ${e.message}`);
    }
  }
}

// Activation: every existing note is read, encrypted, and rewritten in
// one transaction, with the per-user tags and icons. If anything fails
// the transaction rolls back and the rows stay plaintext. The runtime
// must already hold the new DEK.
function encryptAllRows(db) {
  const migrate = db.transaction(() => {
    const rows = db.prepare("SELECT * FROM notes").all();
    const upd = db.prepare(`
      UPDATE notes SET
        title = @title, content = @content,
        items_json = @items_json, tags_json = @tags_json,
        images_json = @images_json, color = @color,
        is_server_encrypted = @is_server_encrypted,
        enc_version = @enc_version,
        enc_payload = @enc_payload
      WHERE id = @id
    `);
    for (const row of rows) {
      if (row.is_server_encrypted) continue; // already encrypted
      const prepared = noteCipher.prepareRowForWrite({
        title: row.title,
        content: row.content,
        items_json: row.items_json,
        tags_json: row.tags_json,
        images_json: row.images_json,
        color: row.color,
      }, { noteId: row.id, userId: row.user_id });
      upd.run({
        id: row.id,
        title: prepared.title,
        content: prepared.content,
        items_json: prepared.items_json,
        tags_json: prepared.tags_json,
        images_json: prepared.images_json,
        color: prepared.color,
        is_server_encrypted: prepared.is_server_encrypted,
        enc_version: prepared.enc_version,
        enc_payload: prepared.enc_payload,
      });
    }
    // Encrypt the per-user tag rows in the same transaction so a
    // partial activation can't leave readable tags on disk.
    const tagRows = db.prepare(
      "SELECT note_id, user_id, tags_json FROM note_user_tags WHERE is_encrypted = 0"
    ).all();
    const updTag = db.prepare(
      "UPDATE note_user_tags SET tags_json = '[]', is_encrypted = 1, enc_payload = ? WHERE note_id = ? AND user_id = ?"
    );
    for (const r of tagRows) {
      if (!r.tags_json || r.tags_json === "[]") continue;
      const enc = noteCipher.encryptTagsJson(r.tags_json, {
        noteId: r.note_id,
        userId: r.user_id,
      });
      updTag.run(enc, r.note_id, r.user_id);
    }
    // Encrypt per-user note icons in the same transaction (an icon can
    // be a custom image: same at-rest protection as tags/content).
    const iconRows = db.prepare(
      "SELECT note_id, user_id, icon_json FROM note_user_icons WHERE is_encrypted = 0"
    ).all();
    const updIcon = db.prepare(
      "UPDATE note_user_icons SET icon_json = '', is_encrypted = 1, enc_payload = ? WHERE note_id = ? AND user_id = ?"
    );
    for (const r of iconRows) {
      if (!r.icon_json) continue;
      const enc = noteCipher.encryptTagsJson(r.icon_json, {
        noteId: r.note_id,
        userId: r.user_id,
      });
      updIcon.run(enc, r.note_id, r.user_id);
    }
    vault.markMigrated(db);
  });
  migrate();
}

// Deactivation: the reverse, every encrypted note, tag and icon row back
// to plaintext columns and the vault disabled, all in one transaction so
// a half-disabled state is impossible. The runtime must still hold the DEK.
function decryptAllRows(db, log) {
  const migrate = db.transaction(() => {
    const rows = db.prepare("SELECT * FROM notes WHERE is_server_encrypted = 1").all();
    const upd = db.prepare(`
      UPDATE notes SET
        title = @title, content = @content,
        items_json = @items_json, tags_json = @tags_json,
        images_json = @images_json, color = @color,
        is_server_encrypted = 0,
        enc_version = NULL,
        enc_payload = NULL
      WHERE id = @id
    `);
    for (const row of rows) {
      // decryptRowInPlace mutates row.title / row.content / etc.
      // back to their plaintext form; we then write them straight
      // into the canonical columns.
      noteCipher.decryptRowInPlace(row);
      upd.run({
        id: row.id,
        title: row.title ?? "",
        content: row.content ?? "",
        items_json: row.items_json ?? "[]",
        tags_json: row.tags_json ?? "[]",
        images_json: row.images_json ?? "[]",
        color: row.color ?? "default",
      });
    }
    // Tag rows symmetrically: decrypt back into tags_json. We do
    // it in the same transaction as the note decryption so a half-
    // disabled state is impossible (either everything is plaintext
    // again or nothing is, and the vault row stays "enabled").
    const encTagRows = db.prepare(
      "SELECT note_id, user_id, enc_payload FROM note_user_tags WHERE is_encrypted = 1"
    ).all();
    const updTag = db.prepare(
      "UPDATE note_user_tags SET tags_json = ?, is_encrypted = 0, enc_payload = NULL WHERE note_id = ? AND user_id = ?"
    );
    for (const r of encTagRows) {
      let plain = "[]";
      if (r.enc_payload) {
        try {
          plain = noteCipher.decryptTagsPayload(r.enc_payload, {
            noteId: r.note_id,
            userId: r.user_id,
          });
        } catch (err) {
          log.warn?.(`[encrypt] could not decrypt tags during deactivation note=${r.note_id} user=${r.user_id}: ${err.message}`);
        }
      }
      updTag.run(plain, r.note_id, r.user_id);
    }
    // Per-user icons symmetrically: decrypt back into icon_json.
    const encIconRows = db.prepare(
      "SELECT note_id, user_id, enc_payload FROM note_user_icons WHERE is_encrypted = 1"
    ).all();
    const updIcon = db.prepare(
      "UPDATE note_user_icons SET icon_json = ?, is_encrypted = 0, enc_payload = NULL WHERE note_id = ? AND user_id = ?"
    );
    for (const r of encIconRows) {
      let plain = "";
      if (r.enc_payload) {
        try {
          plain = noteCipher.decryptTagsPayload(r.enc_payload, {
            noteId: r.note_id,
            userId: r.user_id,
          });
        } catch (err) {
          log.warn?.(`[encrypt] could not decrypt icon during deactivation note=${r.note_id} user=${r.user_id}: ${err.message}`);
        }
      }
      updIcon.run(plain, r.note_id, r.user_id);
    }
    vault.disable(db);
  });
  migrate();
}

module.exports = { purgeFreedPages, runUpgradeMigrations, encryptAllRows, decryptAllRows };
