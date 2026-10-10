// server/routes/archiveRoutes.js
//
// Archiving and unarchiving a note, and the list of archived notes.

const { nowISO, validateLwwTimestamp, isNewerOrEqual } = require("../utils/timestamps");

function attachArchiveRoutes(app, deps) {
  const {
    db,
    auth,
    getNote,
    getNoteById,
    listArchivedNotes,
    updateNoteWithEditor,
    serializeNote,
    broadcastNoteUpdated,
  } = deps;

  // Archive/Unarchive notes
  app.post("/api/notes/:id/archive", auth, (req, res) => {
    const id = req.params.id;
    const { archived } = req.body || {};
    if (!req.body?.client_updated_at) {
      return res.status(400).json({ error: "client_updated_at is required" });
    }
    // Sans ce champ, `archived ? 1 : 0` lisait undefined et DÉSARCHIVAIT la
    // note en répondant que tout allait bien: une requête tronquée faisait
    // exactement l'inverse de son intention. Le sens de la demande doit
    // être dit, il ne se devine pas.
    if (typeof archived !== "boolean") {
      return res.status(400).json({ error: "archived must be a boolean" });
    }
    const tsResult = validateLwwTimestamp(req.body.client_updated_at);
    if (tsResult.error) {
      return res.status(400).json({ error: tsResult.error });
    }

    const existing = getNote.get(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: "Note not found" });
    }

    // LWW: reject stale writes (compare milliseconds)
    if (!isNewerOrEqual(tsResult.ms, existing.client_updated_at)) {
      return res.json({ ok: true, stale: true, note: serializeNote(existing, req.user.id) });
    }

    const updateArchived = db.prepare(`
      UPDATE notes SET archived = ?, client_updated_at = ? WHERE id = ? AND user_id = ?
    `);

    const result = updateArchived.run(archived ? 1 : 0, tsResult.iso, id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Note not found or access denied" });
    }

    updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
    broadcastNoteUpdated(id);
    const fresh = getNoteById.get(id);
    res.json({ ok: true, note: serializeNote(fresh || existing, req.user.id) });
  });

  // Get archived notes
  app.get("/api/notes/archived", auth, (req, res) => {
    const rows = listArchivedNotes.all(req.user.id);
    res.json(rows.map((r) => serializeNote(r, req.user.id)));
  });
}

module.exports = { attachArchiveRoutes };
