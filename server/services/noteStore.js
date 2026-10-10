// server/services/noteStore.js
//
// Reading and writing note rows. Reads come back decrypted and writes are
// encrypted at rest while the instance is unlocked, so the routes never
// handle ciphertext.

const noteCipher = require("../encryption/noteCipher");

function createNoteStore(db) {
  // Notes statements
  // Reads are wrapped with `wrapNoteRead*` so encrypted rows come back as
  // plaintext to the rest of the app. Writes go through `runInsertNote`
  // and `runUpdateNoteFullCollab` / `runPatchNoteSensitiveCollab` so the
  // sensitive columns are encrypted at rest when the instance is unlocked.
  function wrapNoteReadStmt(stmt) {
    return {
      get: (...args) => noteCipher.decryptRowInPlace(stmt.get(...args)),
      all: (...args) => stmt.all(...args).map(noteCipher.decryptRowInPlace),
      raw: stmt,
    };
  }
  function decryptRows(rows) {
    if (!Array.isArray(rows)) return rows;
    return rows.map(noteCipher.decryptRowInPlace);
  }

  const listNotes = wrapNoteReadStmt(db.prepare(
    `SELECT * FROM notes WHERE user_id = ? AND archived = 0 AND trashed = 0 ORDER BY pinned DESC, position DESC, timestamp DESC`
  ));
  const listArchivedNotes = wrapNoteReadStmt(db.prepare(
    `SELECT * FROM notes WHERE user_id = ? AND archived = 1 AND trashed = 0 ORDER BY timestamp DESC`
  ));
  const listTrashedNotes = wrapNoteReadStmt(db.prepare(
    `SELECT * FROM notes WHERE user_id = ? AND trashed = 1 ORDER BY timestamp DESC`
  ));
  const getNoteById = wrapNoteReadStmt(db.prepare("SELECT * FROM notes WHERE id = ?"));
  const getNote = wrapNoteReadStmt(db.prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?"));
  const getNoteWithCollaboration = wrapNoteReadStmt(db.prepare(`
    SELECT n.* FROM notes n
    LEFT JOIN note_collaborators nc ON n.id = nc.note_id AND nc.user_id = ?
    WHERE n.id = ? AND (n.user_id = ? OR nc.user_id IS NOT NULL)
  `));

  const insertNoteStmt = db.prepare(`
    INSERT INTO notes (id,user_id,type,title,content,items_json,tags_json,images_json,color,pinned,position,timestamp,archived,trashed,client_updated_at,is_server_encrypted,enc_version,enc_payload)
    VALUES (@id,@user_id,@type,@title,@content,@items_json,@tags_json,@images_json,@color,@pinned,@position,@timestamp,0,0,@client_updated_at,@is_server_encrypted,@enc_version,@enc_payload)
  `);
  const updateNoteFullCollabStmt = db.prepare(`
    UPDATE notes SET
      type=@type, title=@title, content=@content, items_json=@items_json, tags_json=@tags_json,
      images_json=@images_json, color=@color, pinned=@pinned, position=@position, timestamp=@timestamp,
      client_updated_at=@client_updated_at,
      is_server_encrypted=@is_server_encrypted, enc_version=@enc_version, enc_payload=@enc_payload
    WHERE id=@id AND (user_id=@user_id OR EXISTS(
      SELECT 1 FROM note_collaborators nc
      WHERE nc.note_id=@id AND nc.user_id=@user_id
    ))
  `);
  const patchNoteSensitiveCollabStmt = db.prepare(`
    UPDATE notes SET
      title=@title, content=@content, items_json=@items_json, tags_json=@tags_json,
      images_json=@images_json, color=@color,
      type=COALESCE(@type,type),
      pinned=COALESCE(@pinned,pinned),
      timestamp=COALESCE(@timestamp,timestamp),
      client_updated_at=COALESCE(@client_updated_at,client_updated_at),
      is_server_encrypted=@is_server_encrypted, enc_version=@enc_version, enc_payload=@enc_payload
    WHERE id=@id AND (user_id=@user_id OR EXISTS(
      SELECT 1 FROM note_collaborators nc
      WHERE nc.note_id=@id AND nc.user_id=@user_id
    ))
  `);

  // Build a row that's safe to feed to insertNoteStmt: encrypts the
  // sensitive fields if the instance is unlocked, leaves them in the
  // clear with is_server_encrypted=0 otherwise.
  //
  // The AAD context (noteId, ownerUserId) is what binds a v2 ciphertext
  // to its row; without it a thief could swap one note's enc_payload
  // onto another row and the swap would be undetectable. The owner's
  // user_id, NOT the requester's, is used so a collaborator's edit
  // produces a payload that the owner can still read.
  function buildWriteRow(fields, ctx) {
    return noteCipher.prepareRowForWrite({
      title: fields.title ?? "",
      content: fields.content ?? "",
      items_json: fields.items_json ?? "[]",
      tags_json: fields.tags_json ?? "[]",
      images_json: fields.images_json ?? "[]",
      color: fields.color ?? "default",
    }, ctx);
  }

  function runInsertNote(n) {
    const w = buildWriteRow(n, { noteId: n.id, userId: n.user_id });
    return insertNoteStmt.run({
      id: n.id,
      user_id: n.user_id,
      type: n.type,
      title: w.title,
      content: w.content,
      items_json: w.items_json,
      tags_json: w.tags_json,
      images_json: w.images_json,
      color: w.color,
      pinned: n.pinned,
      position: n.position,
      timestamp: n.timestamp,
      client_updated_at: n.client_updated_at,
      is_server_encrypted: w.is_server_encrypted,
      enc_version: w.enc_version,
      enc_payload: w.enc_payload,
    });
  }

  // `ownerUserId` is the user_id of the row that gets updated, taken
  // from the existing row (NOT from the requester) so a collaborator
  // edit re-encrypts under the owner's AAD and the owner can still
  // read the result.
  function runUpdateNoteFullCollab(updated, ownerUserId) {
    const w = buildWriteRow(updated, { noteId: updated.id, userId: ownerUserId });
    return updateNoteFullCollabStmt.run({
      id: updated.id,
      user_id: updated.user_id,
      type: updated.type,
      title: w.title,
      content: w.content,
      items_json: w.items_json,
      tags_json: w.tags_json,
      images_json: w.images_json,
      color: w.color,
      pinned: updated.pinned,
      position: updated.position,
      timestamp: updated.timestamp,
      client_updated_at: updated.client_updated_at,
      is_server_encrypted: w.is_server_encrypted,
      enc_version: w.enc_version,
      enc_payload: w.enc_payload,
    });
  }

  // Read-merge-write pattern: with encryption on, partial PATCH on a
  // sensitive column is impossible at the SQL layer because the entire
  // payload is encrypted as a single blob. We merge the partial fields
  // with the (already-decrypted) existing row and rewrite the blob.
  // With encryption off, we still go through the same merge so the
  // behaviour is identical from the route's perspective.
  function runPatchNoteSensitiveCollab(id, userId, partial) {
    const existing = getNoteWithCollaboration.get(userId, id, userId);
    if (!existing) return { changes: 0 };
    const merged = {
      title: partial.title != null ? partial.title : (existing.title ?? ""),
      content: partial.content != null ? partial.content : (existing.content ?? ""),
      items_json: partial.items_json != null ? partial.items_json : (existing.items_json ?? "[]"),
      tags_json: partial.tags_json != null ? partial.tags_json : (existing.tags_json ?? "[]"),
      images_json: partial.images_json != null ? partial.images_json : (existing.images_json ?? "[]"),
      color: partial.color != null ? partial.color : (existing.color ?? "default"),
    };
    // existing.user_id is the OWNER (not the requesting userId, which
    // can be a collaborator). The AAD must be tied to the owner so the
    // re-encrypted blob still verifies for the owner on read.
    const w = buildWriteRow(merged, { noteId: id, userId: existing.user_id });
    return patchNoteSensitiveCollabStmt.run({
      id,
      user_id: userId,
      title: w.title,
      content: w.content,
      items_json: w.items_json,
      tags_json: w.tags_json,
      images_json: w.images_json,
      color: w.color,
      // Le type n'est pas chiffré, il ne passe donc pas par buildWriteRow.
      // Absent, il ne change pas: la colonne est laissée telle quelle.
      type: partial.type ?? null,
      pinned: partial.pinned ?? null,
      timestamp: partial.timestamp ?? null,
      client_updated_at: partial.client_updated_at ?? null,
      is_server_encrypted: w.is_server_encrypted,
      enc_version: w.enc_version,
      enc_payload: w.enc_payload,
    });
  }
  const deleteNote = db.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?");
  const updateNoteWithEditor = db.prepare(`
    UPDATE notes SET
      updated_at = ?,
      last_edited_by = ?,
      last_edited_at = ?
    WHERE id = ?
  `);

  return {
    decryptRows,
    listNotes,
    listArchivedNotes,
    listTrashedNotes,
    getNoteById,
    getNote,
    getNoteWithCollaboration,
    runInsertNote,
    runUpdateNoteFullCollab,
    runPatchNoteSensitiveCollab,
    deleteNote,
    updateNoteWithEditor,
  };
}

module.exports = { createNoteStore };
