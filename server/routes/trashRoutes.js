// server/routes/trashRoutes.js
//
// The trash: sending a note there (including leaving or ending a shared
// note), restoring it, listing it, and deleting for good.

const { uid } = require("../utils/ids");
const { nowISO, validateLwwTimestamp, isNewerOrEqual } = require("../utils/timestamps");

function attachTrashRoutes(app, deps) {
  const {
    db,
    auth,
    getNote,
    getNoteById,
    getNoteWithCollaboration,
    listTrashedNotes,
    runInsertNote,
    deleteNote,
    updateNoteWithEditor,
    getUserTags,
    runUpsertUserTags,
    getUserIcon,
    runSetUserIcon,
    deleteUserIconStmt,
    getNoteCollaborators,
    getCollaboratorUserIdsForNote,
    serializeNote,
    insertNotification,
    createSharedNoteDeletedNotification,
    sendEventToUser,
    broadcastNoteUpdated,
    noteFederation,
  } = deps;

  // Trash/Restore notes
  app.post("/api/notes/:id/trash", auth, (req, res) => {
    const id = req.params.id;
    if (!req.body?.client_updated_at) {
      return res.status(400).json({ error: "client_updated_at is required" });
    }
    const tsResult = validateLwwTimestamp(req.body.client_updated_at);
    if (tsResult.error) {
      return res.status(400).json({ error: tsResult.error });
    }
    // Optional mode for collaborative notes:
    //   - "remove_self" (default): current behavior, owner leaves via ownership
    //     transfer, collaborator leaves the collaboration.
    //   - "delete_for_all": owner-only, hard-deletes the note for every
    //     participant (server broadcasts note_deleted).
    const mode = typeof req.body?.mode === "string" ? req.body.mode : null;

    const existing = getNote.get(id, req.user.id);
    // Not the owner: check if user is a collaborator
    const collabNote = existing ? null : getNoteWithCollaboration.get(req.user.id, id, req.user.id);
    const cible = existing || collabNote;
    if (!cible) return res.status(404).json({ error: "Note not found" });
    // Only owners may request delete_for_all
    if (!existing && mode === "delete_for_all") {
      return res.status(403).json({ error: "Only owner can delete for all collaborators" });
    }

    // Le départage entre appareils vaut pour toutes les branches, pas
    // seulement pour la note sans collaborateur. Il n'était appliqué qu'à
    // celle-là, tout en bas de la route, donc les deux gestes les plus
    // destructifs, quitter une note partagée et la retirer à tout le monde,
    // n'étaient protégés par rien: un appareil resté hors ligne pouvait
    // rejouer la commande une heure plus tard et elle s'appliquait.
    if (!isNewerOrEqual(tsResult.ms, cible.client_updated_at)) {
      return res.json({ ok: true, stale: true, note: serializeNote(cible, req.user.id) });
    }

    if (!existing) {
      // Collaborator "delete", mirroring the owner branch below: the user
      // gets a personal, trashed copy of the note in their own corbeille,
      // and the collaboration row is dropped so the live shared note is
      // no longer in their active view. Without the personal copy, the
      // note would just vanish without any restore path, which is what
      // the user reported as "supprimée définitivement" instead of
      // "envoyée à la corbeille".
      // Les étiquettes du partant sont personnelles: elles doivent aller
      // dans note_user_tags sur la copie, la seule table que la lecture
      // consulte. Recopiées dans la colonne partagée, elles étaient bien
      // écrites mais plus jamais lues, et la copie de corbeille arrivait
      // nue. Même erreur que le retrait avec copie, deux routes plus loin.
      const userTagsJson = getUserTags(id, req.user.id);
      // Icon is personal too, same as the tags above.
      const userIcon = getUserIcon(id, req.user.id);
      const trashedCopyId = uid();
      runInsertNote({
        id: trashedCopyId,
        user_id: req.user.id,
        type: collabNote.type,
        title: collabNote.title,
        content: collabNote.content,
        items_json: collabNote.items_json,
        tags_json: "[]",
        images_json: collabNote.images_json,
        color: collabNote.color,
        pinned: 0,
        position: collabNote.position,
        timestamp: collabNote.timestamp,
        client_updated_at: tsResult.iso,
      });
      db.prepare("UPDATE notes SET trashed = 1 WHERE id = ?").run(trashedCopyId);
      if (userTagsJson && userTagsJson !== "[]") {
        runUpsertUserTags(trashedCopyId, req.user.id, userTagsJson);
      }
      if (userIcon) {
        runSetUserIcon(trashedCopyId, req.user.id, userIcon);
      }
      db.prepare("DELETE FROM note_collaborators WHERE note_id = ? AND user_id = ?").run(id, req.user.id);
      db.prepare("DELETE FROM note_user_tags WHERE note_id = ? AND user_id = ?").run(id, req.user.id);
      db.prepare("DELETE FROM note_user_positions WHERE note_id = ? AND user_id = ?").run(id, req.user.id);
      broadcastNoteUpdated(id);
      // On a mirrored note the owner lives on a peer, so the notice below
      // cannot reach them: tell their server instead, which drops the
      // stand-in standing for this user (see onLocalParticipantLeft).
      try {
        noteFederation?.onLocalParticipantLeft?.(id, req.user.email || req.user.name);
      } catch { /* best-effort */ }
      // Notify the note owner that this collaborator walked away on
      // their own. Symmetric with the owner-removes-collaborator path
      // in DELETE /:id/collaborate/:userId: there the owner gets a
      // "you removed X" toast; here the owner gets a "X left" toast.
      try {
        const leftCreatedAt = nowISO();
        const ownerId = collabNote.user_id;
        if (ownerId && ownerId !== req.user.id) {
          const leftRow = insertNotification.run(
            ownerId,
            req.user.id,
            "collaborator_left",
            id,
            collabNote.title || "",
            req.user.name || req.user.email || "",
            null,
            null,
            0,
            null,
            leftCreatedAt,
          );
          sendEventToUser(ownerId, {
            type: "note_access_revoked_notification",
            notificationType: "collaborator_left",
            notificationId: leftRow.lastInsertRowid,
            senderName: req.user.name || req.user.email || "",
            noteId: id,
            noteTitle: collabNote.title || "",
            createdAt: leftCreatedAt,
          });
        }
      } catch (e) {
        console.warn("[notifications] collaborator_left notification failed:", e?.message);
      }
      const trashedCopy = getNoteById.get(trashedCopyId);
      return res.json({
        ok: true,
        left: true,
        trashedCopy: trashedCopy ? serializeNote(trashedCopy, req.user.id) : null,
      });
    }

    // Owner: check if the note has collaborators
    const collaborators = getNoteCollaborators.all(id);
    if (collaborators.length > 0) {
      if (mode === "delete_for_all") {
        // Revoke access for every collaborator, but keep the note in the
        // owner's trash so they can still restore it if it was a mistake.
        const collabIds = collaborators.map((c) => c.id);
        // Say so explicitly rather than leaving the federation layer to infer
        // it from the note being trashed: "trashed" alone cannot tell this
        // apart from the owner merely leaving the note (below), where the
        // remote copies must survive.
        noteFederation?.markShareEnding?.(id, "destroy");
        for (const cid of collabIds) {
          db.prepare("DELETE FROM note_collaborators WHERE note_id = ? AND user_id = ?").run(id, cid);
          db.prepare("DELETE FROM note_user_tags WHERE note_id = ? AND user_id = ?").run(id, cid);
          db.prepare("DELETE FROM note_user_positions WHERE note_id = ? AND user_id = ?").run(id, cid);
        }
        db.prepare("UPDATE notes SET trashed = 1, client_updated_at = ? WHERE id = ?").run(tsResult.iso, id);
        updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
        // Push the revocation to a federation peer right away: the note is now
        // trashed, so its mirror must go. Every other deletion path calls this;
        // without it "delete for all" only reached the peer on the next sync
        // tick (~10s), lagging visibly behind "remove collaborator".
        broadcastNoteUpdated(id);
        // Collaborators lose access entirely: they must drop the note locally
        // without it landing in their trash view.
        const evt = { type: "note_deleted", noteId: id };
        for (const cid of collabIds) sendEventToUser(cid, evt);
        // ...and a persisted notice so each collaborator actually learns the
        // shared note was removed (the note_deleted event above is transient:
        // an offline collaborator would otherwise never find out).
        const ownerName = req.user.name || req.user.email || "";
        for (const cid of collabIds) {
          createSharedNoteDeletedNotification({
            recipientId: cid,
            senderId: req.user.id,
            senderName: ownerName,
            noteTitle: existing.title || "",
          });
        }
        const fresh = getNoteById.get(id);
        return res.json({ ok: true, deletedForAll: true, note: serializeNote(fresh || existing, req.user.id) });
      }
      // Default "remove_self": owner leaves the collaboration but keeps a
      // trashed copy of the note so they can restore it later. The live note
      // is handed over to the first REAL collaborator so it stays available
      // for remaining participants.
      //
      // Federated shadow stand-ins (federated_origin set) must never inherit:
      // they are not loginable users, so handing the note to one orphans it:
      // getNoteWithCollaboration then returns null for every real participant,
      // the note 404s and vanishes on reload, and the federation engine tears
      // the mirror down. Skip shadows and pick the first real local collaborator.
      const newOwner = collaborators.find((c) => !c.federated_origin) || null;

      if (!newOwner) {
        // Only federated shadow collaborators remain: there is no real local
        // user to hand the note to (ownership can't cross a server boundary
        // the way it can to a same-server collaborator, above). The remote
        // recipients must still KEEP the content: this is "delete for me",
        // not "delete for everyone". Record that intent on the share before
        // trashing, so the teardown push carries it: trashing alone is
        // indistinguishable from delete_for_all and would wipe their copies.
        noteFederation?.markShareEnding?.(id, "keep_copies");
        for (const c of collaborators) {
          db.prepare("DELETE FROM note_collaborators WHERE note_id = ? AND user_id = ?").run(id, c.id);
        }
        db.prepare("UPDATE notes SET trashed = 1, client_updated_at = ? WHERE id = ?").run(tsResult.iso, id);
        updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
        // Ici la note n'est transmise à personne: elle reste au propriétaire,
        // simplement à la corbeille. Effacer ses étiquettes lui ferait perdre
        // son classement sur une note qu'il peut encore restaurer. Seul son
        // rangement est remis à zéro, la note quittant la liste active.
        db.prepare("DELETE FROM note_user_positions WHERE note_id = ? AND user_id = ?").run(id, req.user.id);
        broadcastNoteUpdated(id);
        const trashedSelf = getNoteById.get(id);
        return res.json({ ok: true, left: true, trashedCopy: trashedSelf ? serializeNote(trashedSelf, req.user.id) : null });
      }

      // Idem pour le propriétaire qui s'en va: ses étiquettes vivent dans
      // note_user_tags, pas dans la colonne partagée de la note. Recopier
      // cette colonne ne recopiait donc rien du tout, et il repartait avec
      // une copie de corbeille sans aucune de ses étiquettes.
      const tagsProprietaire = getUserTags(id, req.user.id);
      // Icon is personal too, same as the tags above.
      const iconProprietaire = getUserIcon(id, req.user.id);
      const trashedCopyId = uid();
      runInsertNote({
        id: trashedCopyId,
        user_id: req.user.id,
        type: existing.type,
        title: existing.title,
        content: existing.content,
        items_json: existing.items_json,
        tags_json: "[]",
        images_json: existing.images_json,
        color: existing.color,
        pinned: 0,
        position: existing.position,
        timestamp: existing.timestamp,
        client_updated_at: tsResult.iso,
      });
      db.prepare("UPDATE notes SET trashed = 1 WHERE id = ?").run(trashedCopyId);
      if (tagsProprietaire && tagsProprietaire !== "[]") {
        runUpsertUserTags(trashedCopyId, req.user.id, tagsProprietaire);
      }
      if (iconProprietaire) {
        runSetUserIcon(trashedCopyId, req.user.id, iconProprietaire);
      }
      db.prepare("UPDATE notes SET user_id = ? WHERE id = ?").run(newOwner.id, id);
      db.prepare("DELETE FROM note_collaborators WHERE note_id = ? AND user_id = ?").run(id, newOwner.id);
      db.prepare("DELETE FROM note_user_tags WHERE note_id = ? AND user_id = ?").run(id, req.user.id);
      db.prepare("DELETE FROM note_user_positions WHERE note_id = ? AND user_id = ?").run(id, req.user.id);
      // Same leftover-icon risk as a plain collaborator removal: without
      // this, the departing owner's icon row survives on a note they no
      // longer have any access to, and would resurface unchanged if they
      // were ever added back as a collaborator on it.
      deleteUserIconStmt.run(id, req.user.id);
      broadcastNoteUpdated(id);
      // The note was handed over to this collaborator (they keep it / become its
      // owner). Persist a notice so they actually learn the owner deleted the
      // shared note and left them a copy: broadcastNoteUpdated above is
      // transient (an offline collaborator would otherwise never find out).
      createSharedNoteDeletedNotification({
        recipientId: newOwner.id,
        senderId: req.user.id,
        senderName: req.user.name || req.user.email || "",
        noteTitle: existing.title || "",
        noteId: id,
        notificationType: "shared_note_deleted_with_copy",
      });
      const trashedCopy = getNoteById.get(trashedCopyId);
      return res.json({ ok: true, left: true, trashedCopy: trashedCopy ? serializeNote(trashedCopy, req.user.id) : null });
    }

    // Non-collaborative note: normal trash. Le départage a déjà été fait
    // plus haut, pour toutes les branches.
    const updateTrashed = db.prepare(`
      UPDATE notes SET trashed = 1, client_updated_at = ? WHERE id = ? AND user_id = ?
    `);

    const result = updateTrashed.run(tsResult.iso, id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Note not found or access denied" });
    }

    updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
    broadcastNoteUpdated(id);
    const fresh = getNoteById.get(id);
    res.json({ ok: true, note: serializeNote(fresh || existing, req.user.id) });
  });

  app.post("/api/notes/:id/restore", auth, (req, res) => {
    const id = req.params.id;
    if (!req.body?.client_updated_at) {
      return res.status(400).json({ error: "client_updated_at is required" });
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

    // Restaurer une note qui n'est pas à la corbeille n'a rien à faire, et
    // surtout pas à lui recalculer sa position: un simple rejeu de la file
    // de synchronisation faisait alors remonter la note en tête de liste
    // sans que personne ne l'ait demandé. On répond sans rien toucher,
    // plutôt que par une erreur: rejouer une restauration déjà appliquée
    // est normal pour un appareil qui rattrape son retard.
    if (!existing.trashed) {
      return res.json({ ok: true, note: serializeNote(existing, req.user.id) });
    }

    // Calculate a position that places the restored note among active notes
    // at the chronologically correct spot (by creation timestamp).
    // Without this, notes restored after a reorder end up at the bottom because
    // all active notes received new (higher) positions during the reorder while
    // the trashed note kept its old (lower) position.
    const noteTs = new Date(existing.timestamp).getTime() || 0;
    const activeNotes = db.prepare(`
      SELECT position, timestamp FROM notes
      WHERE user_id = ? AND trashed = 0 AND archived = 0 AND id != ?
      ORDER BY position DESC
    `).all(req.user.id, id);

    let restoredPosition = existing.position;
    if (activeNotes.length > 0) {
      // Find insertion point: where does this note's creation time fit
      // among active notes sorted by position (highest first)?
      let insertIdx = activeNotes.length; // default: after all (bottom)
      for (let i = 0; i < activeNotes.length; i++) {
        const ts = new Date(activeNotes[i].timestamp).getTime() || 0;
        if (noteTs >= ts) {
          insertIdx = i;
          break;
        }
      }
      if (insertIdx === 0) {
        restoredPosition = activeNotes[0].position + 1;
      } else if (insertIdx >= activeNotes.length) {
        restoredPosition = activeNotes[activeNotes.length - 1].position - 1;
      } else {
        restoredPosition = (activeNotes[insertIdx - 1].position + activeNotes[insertIdx].position) / 2;
      }
    }

    // Restaurer remet la note dans la liste active, y compris si elle avait
    // été archivée avant d'être jetée. Laisser le drapeau d'archivage en
    // place la renvoyait dans les archives: vu de l'utilisateur, il cliquait
    // sur « Restaurer » depuis la corbeille et la note disparaissait sans
    // explication. L'écran ne propose qu'une action, elle doit rendre la
    // note visible là où on la cherche.
    const updateTrashed = db.prepare(`
      UPDATE notes SET trashed = 0, archived = 0, position = ?, client_updated_at = ? WHERE id = ? AND user_id = ?
    `);

    const result = updateTrashed.run(restoredPosition, tsResult.iso, id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Note not found or access denied" });
    }

    updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
    broadcastNoteUpdated(id);
    const fresh = getNoteById.get(id);
    res.json({ ok: true, note: serializeNote(fresh || existing, req.user.id) });
  });

  // Get trashed notes
  app.get("/api/notes/trashed", auth, (req, res) => {
    const rows = listTrashedNotes.all(req.user.id);
    res.json(rows.map((r) => serializeNote(r, req.user.id)));
  });

  // Permanently delete a note (only from trash, LWW-protected)
  app.delete("/api/notes/:id/permanent", auth, (req, res) => {
    const id = req.params.id;

    if (!req.body?.client_updated_at) {
      return res.status(400).json({ error: "client_updated_at is required" });
    }
    const tsResult = validateLwwTimestamp(req.body.client_updated_at);
    if (tsResult.error) {
      return res.status(400).json({ error: tsResult.error });
    }

    const existing = getNote.get(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: "Note not found" });
    }
    if (!existing.trashed) {
      return res.status(400).json({ error: "Note must be in trash to permanently delete" });
    }

    // LWW: reject if a newer restore/update already applied
    if (!isNewerOrEqual(tsResult.ms, existing.client_updated_at)) {
      return res.json({ ok: true, stale: true, note: serializeNote(existing, req.user.id) });
    }

    const recipientIds = new Set([existing.user_id, ...getCollaboratorUserIdsForNote(id)]);
    deleteNote.run(id, req.user.id);

    const evt = { type: "note_deleted", noteId: id };
    for (const uid of recipientIds) sendEventToUser(uid, evt);

    // Any collaborator still attached at permanent-delete time (rare: a
    // delete-for-all usually detaches them first) gets a persisted notice so
    // the removal survives offline rather than vanishing with a transient sync
    // event. Self-deletion of one's own (non-shared) note notifies nobody.
    const ownerName = req.user.name || req.user.email || "";
    for (const uid of recipientIds) {
      if (uid !== existing.user_id) {
        createSharedNoteDeletedNotification({
          recipientId: uid,
          senderId: req.user.id,
          senderName: ownerName,
          noteTitle: existing.title || "",
        });
      }
    }

    res.json({ ok: true });
  });
}

module.exports = { attachTrashRoutes };
