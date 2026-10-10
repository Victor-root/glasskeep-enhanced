// server/routes/notesRoutes.js
//
// Notes: the active list, creation, full and partial edits, the
// per-user icon and the reorder of a user's own list.
//
// GET /api/notes/:id is attached on its own (attachNoteByIdRoutes),
// after every literal /api/notes/<name> GET route, so it never shadows
// them.

const { uid } = require("../utils/ids");
const { validateAudioContent } = require("../utils/audioContent");
const {
  nowISO,
  parseIsoTimestamp,
  validateLwwTimestamp,
  readClientUpdatedAt,
  normalizeDisplayTimestamp,
  isNewerOrEqual,
} = require("../utils/timestamps");

function attachNotesRoutes(app, deps) {
  const {
    db,
    auth,
    decryptRows,
    serializeNote,
    getNoteParticipants,
    getNoteById,
    getNoteWithCollaboration,
    runInsertNote,
    runUpdateNoteFullCollab,
    runPatchNoteSensitiveCollab,
    markEditedBy,
    runUpsertUserTags,
    setUserPinOrPosition,
    runSetUserIcon,
    getUserIcon,
    upsertUserPosition,
    isCollabReadOnly,
    sendEventToUser,
    broadcastNoteUpdated,
    noteFederation,
  } = deps;

  const getLastReorderAt = db.prepare("SELECT last_reorder_at FROM user_reorder_state WHERE user_id = ?");
  const upsertReorderAt = db.prepare(`
    INSERT INTO user_reorder_state (user_id, last_reorder_at) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET last_reorder_at = excluded.last_reorder_at
  `);

  app.get("/api/notes", auth, (req, res) => {
    const off = Number(req.query.offset ?? 0);
    const lim = Number(req.query.limit ?? 0);
    const usePaging = Number.isFinite(lim) && lim > 0 && Number.isFinite(off) && off >= 0;

    // Get all notes (own + collaborated) in a single query to avoid duplicates.
    // Sort by each user's own pinned/position (note_user_positions) with the
    // note's stored column as the fallback default.
    const allNotesQuery = db.prepare(`
      SELECT DISTINCT n.*,
        COALESCE(nup.pinned, n.pinned) AS eff_pinned,
        COALESCE(nup.position, n.position) AS eff_position
      FROM notes n
      LEFT JOIN note_user_positions nup
        ON nup.note_id = n.id AND nup.user_id = ?
      WHERE (n.user_id = ? OR EXISTS(
        SELECT 1 FROM note_collaborators nc
        WHERE nc.note_id = n.id AND nc.user_id = ?
      )) AND n.archived = 0 AND n.trashed = 0
      ORDER BY eff_pinned DESC, eff_position DESC, n.timestamp DESC
    `);

    const allNotesWithPagingQuery = db.prepare(`
      SELECT DISTINCT n.*,
        COALESCE(nup.pinned, n.pinned) AS eff_pinned,
        COALESCE(nup.position, n.position) AS eff_position
      FROM notes n
      LEFT JOIN note_user_positions nup
        ON nup.note_id = n.id AND nup.user_id = ?
      WHERE (n.user_id = ? OR EXISTS(
        SELECT 1 FROM note_collaborators nc
        WHERE nc.note_id = n.id AND nc.user_id = ?
      )) AND n.archived = 0 AND n.trashed = 0
      ORDER BY eff_pinned DESC, eff_position DESC, n.timestamp DESC
      LIMIT ? OFFSET ?
    `);

    const rows = decryptRows(usePaging
      ? allNotesWithPagingQuery.all(req.user.id, req.user.id, req.user.id, lim, off)
      : allNotesQuery.all(req.user.id, req.user.id, req.user.id));

    // Une note a une seule forme, celle que serializeNote produit: cette
    // liste la reconstruisait à la main et en sortait une variante à qui il
    // manquait `trashed`. Deux formes pour le même objet obligeaient le
    // client à savoir d'où il venait. Seul le trombinoscope s'ajoute, parce
    // qu'il n'appartient pas à la note mais à sa lecture.
    res.json(
      rows.map((r) => ({
        ...serializeNote(r, req.user.id),
        collaborators: getNoteParticipants(r.id, r.user_id, req.user.id),
      }))
    );
  });

  app.post("/api/notes", auth, (req, res) => {
    const body = req.body || {};
    const noteId = body.id || uid();
    const rawClientTs = body.client_updated_at || body.timestamp || nowISO();
    const parsedClientTs = parseIsoTimestamp(rawClientTs);
    const clientTs = parsedClientTs ? parsedClientTs.iso : nowISO();
    const userTags = JSON.stringify(Array.isArray(body.tags) ? body.tags : []);
    const normalizedType =
      body.type === "checklist" ? "checklist"
        : body.type === "draw" ? "draw"
          : body.type === "audio" ? "audio"
            : "text";
    if (normalizedType === "audio") {
      const err = validateAudioContent(String(body.content || ""));
      if (err) return res.status(400).json({ error: err });
    }
    const tsAffichage = normalizeDisplayTimestamp(body.timestamp);
    if (tsAffichage.error) return res.status(400).json({ error: tsAffichage.error });

    const n = {
      id: noteId,
      user_id: req.user.id,
      type: normalizedType,
      title: String(body.title || ""),
      content: normalizedType === "checklist" ? "" : String(body.content || ""),
      items_json: JSON.stringify(Array.isArray(body.items) ? body.items : []),
      tags_json: "[]",
      images_json: JSON.stringify(Array.isArray(body.images) ? body.images : []),
      color: body.color && typeof body.color === "string" ? body.color : "default",
      pinned: body.pinned ? 1 : 0,
      position: typeof body.position === "number" ? body.position : Date.now(),
      timestamp: tsAffichage.iso || nowISO(),
      client_updated_at: clientTs,
    };

    // Idempotent creation: if client provides an ID that already exists,
    // return the existing note instead of failing with a UNIQUE constraint error.
    if (body.id) {
      const existing = getNoteById.get(body.id);
      if (existing && existing.user_id === req.user.id) {
        return res.status(200).json(serializeNote(existing, req.user.id));
      }
      // L'identifiant est la clé primaire de toutes les notes, pas seulement
      // des vôtres: s'il appartient à quelqu'un d'autre, l'insertion violait
      // la contrainte d'unicité et Express répondait une page HTML d'erreur.
      // La note visée n'était ni écrasée ni divulguée, ce qui est le bon
      // résultat, mais la file de synchronisation ne pouvait rien faire
      // d'une réponse qu'elle ne sait pas lire. Un conflit se dit en JSON,
      // et le client sait déjà le traiter comme définitif sur une création.
      if (existing) {
        return res.status(409).json({ error: "Note id already in use" });
      }
    }

    runInsertNote(n);
    if (userTags !== "[]") runUpsertUserTags(noteId, req.user.id, userTags);
    markEditedBy(n.id, req.user);
    broadcastNoteUpdated(n.id);
    // Re-read to get updated_at/last_edited_* set by markEditedBy
    const created = getNoteById.get(n.id);
    res.status(201).json(serializeNote(created || n, req.user.id));
  });

  app.put("/api/notes/:id", auth, (req, res) => {
    const id = req.params.id;
    const existing = getNoteWithCollaboration.get(req.user.id, id, req.user.id);
    if (!existing) return res.status(404).json({ error: "Note not found" });

    // Read-only gate: (a) a mirror note is read-only while its authority
    // peer can't be reached, so an edit made there can't diverge; (b) a
    // collaborator the owner limited to read-only may not change shared
    // content. Either way mirror the LWW "stale" shape so the client just
    // reconciles to the server's copy (it already shows the read-only
    // banner). Avoid 423: that triggers the global instance-locked flow.
    if (noteFederation?.isReadOnly(id) || isCollabReadOnly(id, req.user.id)) {
      return res.json({ ok: true, readOnly: true, note: serializeNote(existing, req.user.id) });
    }

    const b = req.body || {};
    const tsResult = readClientUpdatedAt(b);
    if (tsResult.error) {
      return res.status(400).json({ error: tsResult.error });
    }

    // LWW: reject stale writes (compare milliseconds)
    if (!isNewerOrEqual(tsResult.ms, existing.client_updated_at)) {
      return res.json({ ok: true, stale: true, note: serializeNote(existing, req.user.id) });
    }

    // Save tags to per-user table (not on the note itself)
    if (Array.isArray(b.tags)) {
      runUpsertUserTags(id, req.user.id, JSON.stringify(b.tags));
    }
    const updatedType =
      b.type === "checklist" ? "checklist"
        : b.type === "draw" ? "draw"
          : b.type === "audio" ? "audio"
            : "text";
    if (updatedType === "audio") {
      const err = validateAudioContent(String(b.content || ""));
      if (err) return res.status(400).json({ error: err });
    }
    const tsAffichageMaj = normalizeDisplayTimestamp(b.timestamp);
    if (tsAffichageMaj.error) return res.status(400).json({ error: tsAffichageMaj.error });

    const updated = {
      id,
      user_id: req.user.id,
      type: updatedType,
      title: String(b.title || ""),
      content: updatedType === "checklist" ? "" : String(b.content || ""),
      items_json: JSON.stringify(Array.isArray(b.items) ? b.items : []),
      tags_json: existing.tags_json,
      images_json: JSON.stringify(Array.isArray(b.images) ? b.images : []),
      color: b.color && typeof b.color === "string" ? b.color : "default",
      // Pinned/position are per-user: keep the shared columns untouched and
      // write the requester's state to note_user_positions below.
      pinned: existing.pinned,
      position: existing.position,
      timestamp: tsAffichageMaj.iso || existing.timestamp,
      client_updated_at: tsResult.iso,
    };
    // existing.user_id is the note's owner: it doesn't change on edit,
    // even when the editor is a collaborator. AAD binds to the owner.
    const result = runUpdateNoteFullCollab(updated, existing.user_id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Note not found or access denied" });
    }

    if (typeof b.pinned === "boolean" || typeof b.position === "number") {
      setUserPinOrPosition(id, req.user.id, {
        pinned: typeof b.pinned === "boolean" ? b.pinned : undefined,
        position: typeof b.position === "number" ? b.position : undefined,
      });
    }

    markEditedBy(id, req.user);
    broadcastNoteUpdated(id);
    const fresh = getNoteById.get(id);
    res.json({ ok: true, note: serializeNote(fresh || existing, req.user.id) });
  });

  app.patch("/api/notes/:id", auth, (req, res) => {
    const id = req.params.id;
    const existing = getNoteWithCollaboration.get(req.user.id, id, req.user.id);
    if (!existing) return res.status(404).json({ error: "Note not found" });

    // Pin-only toggle: purely per-user state. Skip LWW/timestamp bumps,
    // shared-column writes, and cross-user broadcasts so other participants
    // see nothing move when someone else pins/unpins their shared copy.
    //
    // `type` only counts when it actually differs from the stored type: the
    // client's metadata autosave always resends the note's current type
    // alongside tags/color/images, even when nothing about the type changed,
    // so treating its mere presence as a change made every one of those
    // patches look like a shared edit.
    const hasSharedChange = (
      typeof req.body.title === "string" ||
      typeof req.body.content === "string" ||
      (typeof req.body.type === "string" && req.body.type !== existing.type) ||
      Array.isArray(req.body.items) ||
      Array.isArray(req.body.images) ||
      Array.isArray(req.body.tags) ||
      typeof req.body.color === "string" ||
      typeof req.body.timestamp === "string"
    );
    if (!hasSharedChange && typeof req.body.pinned === "boolean") {
      setUserPinOrPosition(id, req.user.id, { pinned: req.body.pinned });
      // Notify only the requester's other sessions so multi-device stays in sync.
      sendEventToUser(req.user.id, { type: "notes_reordered", noteIds: [id] });
      return res.json({ ok: true, note: serializeNote(existing, req.user.id) });
    }

    // Read-only gate for SHARED CONTENT: blocked when the mirror's authority
    // peer is unreachable OR when the owner limited this collaborator to
    // read-only (per-user tags / pin stay editable either way). The client
    // already shows the read-only banner.
    //
    // Same `type` refinement as hasSharedChange above: the autosave path
    // always resends the current type on a tags-only or colour-only patch,
    // and an unchanged type must not turn that into a blocked content edit.
    const hasContentChange = (
      typeof req.body.title === "string" ||
      typeof req.body.content === "string" ||
      (typeof req.body.type === "string" && req.body.type !== existing.type) ||
      Array.isArray(req.body.items) ||
      Array.isArray(req.body.images) ||
      typeof req.body.color === "string" ||
      typeof req.body.timestamp === "string"
    );
    if (hasContentChange && (noteFederation?.isReadOnly(id) || isCollabReadOnly(id, req.user.id))) {
      return res.json({ ok: true, readOnly: true, note: serializeNote(existing, req.user.id) });
    }

    const tsResult = readClientUpdatedAt(req.body);
    if (tsResult.error) {
      return res.status(400).json({ error: tsResult.error });
    }

    // LWW: reject stale writes (compare milliseconds)
    if (!isNewerOrEqual(tsResult.ms, existing.client_updated_at)) {
      return res.json({ ok: true, stale: true, note: serializeNote(existing, req.user.id) });
    }

    // Convertir une note d'un type à l'autre passait à la trappe: la colonne
    // était absente de l'instruction de mise à jour partielle, alors que le
    // client envoie bien `type` quand il transforme une note en liste à
    // cocher ou en dessin. La note gardait donc ses éléments tout en
    // s'affichant comme du texte, et seule une réécriture complète la
    // convertissait vraiment.
    //
    // Un type inconnu est refusé au lieu d'être ramené à "text" comme le
    // font la création et la réécriture complète: là c'est un défaut de
    // départ, ici cela détruirait le type d'une note existante.
    let typeVoulu = null;
    if (req.body.type !== undefined) {
      if (!["text", "checklist", "draw", "audio"].includes(req.body.type)) {
        return res.status(400).json({ error: "Invalid note type" });
      }
      typeVoulu = req.body.type;
    }
    const typeApres = typeVoulu || existing.type;

    const tsAffichagePatch = normalizeDisplayTimestamp(req.body.timestamp);
    if (tsAffichagePatch.error) return res.status(400).json({ error: tsAffichagePatch.error });

    // Save tags to per-user table (not on the note itself)
    if (Array.isArray(req.body.tags)) {
      runUpsertUserTags(id, req.user.id, JSON.stringify(req.body.tags));
    }
    // Audio content patches must still pass the same shape/size guards as
    // creates and full updates: otherwise a malicious client could rewrite
    // the audio_data of an existing audio note with anything.
    if (typeApres === "audio") {
      const contenuAudio = typeof req.body.content === "string"
        ? req.body.content : (existing.content || "");
      if (typeof req.body.content === "string" || typeVoulu === "audio") {
        const err = validateAudioContent(String(contenuAudio));
        if (err) return res.status(400).json({ error: err });
      }
    }
    const p = {
      id,
      user_id: req.user.id,
      type: typeVoulu,
      title: typeof req.body.title === "string" ? String(req.body.title) : null,
      // Une liste à cocher ne porte pas de texte libre: son contenu vit dans
      // ses éléments. La création et la réécriture complète le vident déjà,
      // la conversion doit faire pareil sous peine de laisser un ancien
      // paragraphe accroché à une note devenue liste.
      //
      // Uniquement au moment de la conversion: vider à chaque modification
      // d'une liste existante effacerait le contenu d'une vieille note qui
      // en porterait encore un, ce que personne n'a demandé.
      content: typeVoulu === "checklist" ? ""
        : (typeof req.body.content === "string" ? String(req.body.content) : null),
      items_json: Array.isArray(req.body.items) ? JSON.stringify(req.body.items) : null,
      tags_json: null,
      images_json: Array.isArray(req.body.images) ? JSON.stringify(req.body.images) : null,
      color: typeof req.body.color === "string" ? req.body.color : null,
      // Pinned state is per-user; route it to note_user_positions below instead
      // of mutating the shared notes.pinned column.
      pinned: null,
      timestamp: tsAffichagePatch.iso,
      client_updated_at: tsResult.iso,
    };
    const result = runPatchNoteSensitiveCollab(id, req.user.id, p);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Note not found or access denied" });
    }

    if (typeof req.body.pinned === "boolean") {
      setUserPinOrPosition(id, req.user.id, { pinned: req.body.pinned });
    }

    markEditedBy(id, req.user);
    broadcastNoteUpdated(id);
    const fresh = getNoteById.get(id);
    res.json({ ok: true, note: serializeNote(fresh || existing, req.user.id) });
  });

  // Legacy soft-delete route: disabled.
  // Bypassed LWW (stamped nowISO() without client_updated_at check).
  // Modern client uses POST /api/notes/:id/trash with LWW protection instead.
  app.delete("/api/notes/:id", auth, (req, res) => {
    return res.status(410).json({ error: "Deprecated: use POST /api/notes/:id/trash with client_updated_at" });
  });

  // ---------- Per-user note icon (logo) ----------
  // The icon is personal to each participant and never shared, so it has its
  // own endpoints (rather than riding the synced note body). Any participant
  // (owner or collaborator) may set/clear THEIR OWN icon for a note.
  app.put("/api/notes/:id/icon", auth, (req, res) => {
    const noteId = req.params.id;
    const note = getNoteWithCollaboration.get(req.user.id, noteId, req.user.id);
    if (!note) return res.status(404).json({ error: "Note not found" });
    const icon = req.body?.icon;
    if (icon != null && (typeof icon !== "object" || typeof icon.src !== "string" || !icon.src)) {
      return res.status(400).json({ error: "Invalid icon" });
    }
    runSetUserIcon(noteId, req.user.id, icon || null);
    // No broadcast: this is a private, per-user marker, nobody else sees it.
    res.json({ ok: true, icon: getUserIcon(noteId, req.user.id) });
  });

  app.delete("/api/notes/:id/icon", auth, (req, res) => {
    const noteId = req.params.id;
    const note = getNoteWithCollaboration.get(req.user.id, noteId, req.user.id);
    if (!note) return res.status(404).json({ error: "Note not found" });
    runSetUserIcon(noteId, req.user.id, null);
    res.json({ ok: true });
  });

  // Reorder within sections (LWW-protected)
  app.post("/api/notes/reorder", auth, (req, res) => {
    const { pinnedIds = [], otherIds = [], client_reordered_at } = req.body || {};

    if (!client_reordered_at) {
      return res.status(400).json({ error: "client_reordered_at is required" });
    }
    const reorderTsResult = validateLwwTimestamp(client_reordered_at);
    if (reorderTsResult.error) {
      return res.status(400).json({ error: reorderTsResult.error });
    }

    // Access check: every noteId must be visible to the requesting user
    // (either owned or shared). Rejecting the whole payload on a stray id
    // keeps the client and server state consistent.
    const reorderIds = [...pinnedIds, ...otherIds];
    for (const nid of reorderIds) {
      const visible = getNoteWithCollaboration.get(req.user.id, nid, req.user.id);
      if (!visible) {
        return res.status(403).json({ error: "Reorder payload contains notes you cannot access" });
      }
    }

    // LWW stale check: reject if a newer reorder already applied (compare milliseconds)
    const stored = getLastReorderAt.get(req.user.id);
    if (stored) {
      const storedReorder = parseIsoTimestamp(stored.last_reorder_at);
      if (storedReorder && reorderTsResult.ms < storedReorder.ms) {
        console.warn(`[LWW] Stale reorder from user ${req.user.id}: client=${client_reordered_at} < stored=${stored.last_reorder_at}`);
        return res.json({ ok: true, stale: true });
      }
    }

    // Per-user reorder: write to note_user_positions so each participant
    // (owner or collaborator) keeps an independent ordering/pin state.
    const base = Date.now();
    const step = 1;
    const reorder = db.transaction(() => {
      for (let i = 0; i < pinnedIds.length; i++) {
        upsertUserPosition.run({
          note_id: pinnedIds[i],
          user_id: req.user.id,
          position: base + step * (pinnedIds.length - i),
          pinned: 1,
        });
      }
      for (let i = 0; i < otherIds.length; i++) {
        upsertUserPosition.run({
          note_id: otherIds[i],
          user_id: req.user.id,
          position: base - step * (i + 1),
          pinned: 0,
        });
      }
      // Record normalized timestamp for future LWW checks
      upsertReorderAt.run(req.user.id, reorderTsResult.iso);
    });
    reorder();

    // Reorder is local to this user: only notify their own sessions so
    // other participants don't refetch unnecessarily.
    const allIds = [...pinnedIds, ...otherIds];
    const evt = { type: "notes_reordered", noteIds: allIds };
    sendEventToUser(req.user.id, evt);

    res.json({ ok: true });
  });
}

function attachNoteByIdRoutes(app, deps) {
  const {
    auth,
    serializeNote,
    getNoteParticipants,
    getNoteWithCollaboration,
  } = deps;

  // Get single note by ID (for targeted SSE patching)
  // MUST be after all literal /api/notes/xxx GET routes to avoid shadowing
  app.get("/api/notes/:id", auth, (req, res) => {
    const r = getNoteWithCollaboration.get(req.user.id, req.params.id, req.user.id);
    if (!r) return res.status(404).json({ error: "Note not found" });
    // Même forme que la liste, au trombinoscope près: une seule définition
    // de ce qu'est une note, pas trois recopies qui divergent.
    res.json({
      ...serializeNote(r, req.user.id),
      collaborators: getNoteParticipants(r.id, r.user_id, req.user.id),
    });
  });
}

module.exports = { attachNotesRoutes, attachNoteByIdRoutes };
