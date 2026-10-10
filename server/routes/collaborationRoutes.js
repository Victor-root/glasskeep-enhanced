// server/routes/collaborationRoutes.js
//
// Sharing a note: adding a collaborator (on this server or a paired
// one), listing them, changing their access, removing them, and the
// list of notes others share with the user.
//
// The list is attached on its own (attachCollaboratedNotesRoutes) to
// keep its place in the route order.

const { uid } = require("../utils/ids");
const { nowISO } = require("../utils/timestamps");

function attachCollaborationRoutes(app, deps) {
  const {
    db,
    auth,
    getUserById,
    getRealUserByEmail,
    getRealUserByName,
    getNote,
    getNoteWithCollaboration,
    runInsertNote,
    markEditedBy,
    getUserTags,
    runUpsertUserTags,
    getUserIcon,
    runSetUserIcon,
    deleteUserIconStmt,
    getMaxUserEffectivePosition,
    upsertUserPosition,
    addCollaborator,
    getNoteCollaborators,
    setCollaboratorCanWrite,
    getCollaboratorAccess,
    participantObj,
    insertNotification,
    createShareNotification,
    createAccessRevokedNotification,
    sendEventToUser,
    broadcastNoteUpdated,
    noteFederation,
  } = deps;

  app.post("/api/notes/:id/collaborate", auth, async (req, res) => {
    const noteId = req.params.id;
    const { username } = req.body || {};
    // Access level chosen at add time. Absent means "write" (read-write),
    // pour ne pas changer le comportement d'un client qui ne le précise pas.
    //
    // Toute autre valeur est refusée au lieu d'être devinée. Comparer à
    // "read" et retomber sur "write" échouait dans le mauvais sens: un
    // « READ » ou un « readonly » donnait silencieusement tous les droits
    // d'écriture à quelqu'un qu'on croyait limiter à la lecture. La route
    // jumelle qui change le droit d'un collaborateur validait déjà ainsi.
    if (req.body?.access !== undefined
        && req.body.access !== "read" && req.body.access !== "write") {
      return res.status(400).json({ error: "access must be 'read' or 'write'" });
    }
    const access = req.body?.access === "read" ? "read" : "write";

    if (!username || typeof username !== "string") {
      return res.status(400).json({ error: "Username is required" });
    }

    // Check if note exists and user owns it
    const note = getNote.get(noteId, req.user.id);
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    // Cross-server share: "user@peer-host" where peer-host (incl. :port if
    // non-standard) is a currently-paired server. Route to the federation
    // engine, which mirrors the note onto the peer and adds a stand-in
    // collaborator here. Anything else falls through to the local lookup.
    const atIdx = username.lastIndexOf("@");
    if (atIdx > 0 && noteFederation) {
      const peerHost = username.slice(atIdx + 1).trim().toLowerCase();
      if (noteFederation.isPeerHost(peerHost)) {
        const targetRef = username.slice(0, atIdx).trim();
        try {
          const owner = getUserById.get(req.user.id);
          const result = await noteFederation.shareWithRemote({
            note, owner, targetRef, peerHost,
            canWrite: access === "write" ? 1 : 0,
          });
          if (!result.ok) {
            const codeMap = { peer_not_paired: 400, user_not_found: 404 };
            return res
              .status(codeMap[result.error] || 502)
              .json({ error: result.error || "federation_failed" });
          }
          // Same post-share housekeeping as the local path, so the owner's
          // open card/list refresh over SSE and pick up the new (avatar-
          // bearing) collaborator without a manual reload.
          markEditedBy(noteId, req.user);
          broadcastNoteUpdated(noteId);
          // Tell the OTHER peers about the new participant so their rosters
          // update too (the new peer already got the roster via the share).
          try { noteFederation?.onParticipantsChangedLocally(noteId); } catch { /* best-effort */ }
          return res.json({
            ok: true,
            message: `Shared with ${result.collaborator?.name || targetRef}`,
            collaborator: result.collaborator,
          });
        } catch (e) {
          console.warn("[federation/notes] shareWithRemote failed:", e?.message);
          return res.status(500).json({ error: "federation_failed" });
        }
      }
    }

    // Find user to collaborate with (by email or name). Real accounts only:
    // the federation stand-ins are matched by the cross-server branch above,
    // and picking one up here would attach a collaborator who can never
    // receive the note (and would confirm, to whoever guessed the name, that
    // that person exists on the paired server).
    const collaborator = getRealUserByEmail.get(username) || getRealUserByName.get(username);
    if (!collaborator) {
      return res.status(404).json({ error: "User not found" });
    }

    // Don't allow self-collaboration
    if (collaborator.id === req.user.id) {
      return res.status(400).json({ error: "Cannot collaborate with yourself" });
    }

    try {
      // Add collaborator (defaults to read-write); downgrade to read-only
      // immediately if the owner chose that at add time.
      addCollaborator.run(noteId, collaborator.id, req.user.id, nowISO());
      if (access === "read") {
        setCollaboratorCanWrite.run(0, noteId, collaborator.id);
      }

      // Seed the collaborator's per-user position so the shared note lands
      // at the top of their list instead of inheriting the owner's (possibly
      // very old) position via COALESCE fallback.
      const { max_pos } = getMaxUserEffectivePosition.get(
        collaborator.id,
        collaborator.id,
        collaborator.id,
        collaborator.id,
      );
      upsertUserPosition.run({
        note_id: noteId,
        user_id: collaborator.id,
        position: (typeof max_pos === "number" ? max_pos : 0) + 1,
        pinned: 0,
      });

      // Update note with editor info
      markEditedBy(noteId, req.user);
      broadcastNoteUpdated(noteId);
      // Propagate the new local collaborator to any federated peers so their
      // displayed roster includes them.
      try { noteFederation?.onParticipantsChangedLocally(noteId); } catch { /* best-effort */ }

      // Persist + push a "note_shared" notification for the new
      // collaborator. Only runs on a fresh insert above: the 409
      // duplicate path below skips it, so re-sharing an already-shared
      // note never produces a duplicate toast.
      createShareNotification({
        recipientId: collaborator.id,
        senderId: req.user.id,
        senderName: req.user.name || req.user.email || "",
        noteId,
        noteTitle: note.title || "",
        readOnly: access === "read",
      });

      res.json({
        ok: true,
        message: `Added ${collaborator.name} as collaborator`,
        collaborator: {
          id: collaborator.id,
          name: collaborator.name,
          email: collaborator.email
        }
      });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: "User is already a collaborator" });
      }
      return res.status(500).json({ error: "Failed to add collaborator" });
    }
  });

  app.get("/api/notes/:id/collaborators", auth, (req, res) => {
    const noteId = req.params.id;

    // Check if note exists and user owns it or is a collaborator
    const note = getNoteWithCollaboration.get(req.user.id, noteId, req.user.id);
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    const collaborators = getNoteCollaborators.all(noteId);
    const result = collaborators.map((c) =>
      participantObj(c, { added_at: c.added_at, added_by: c.added_by }),
    );

    const owner = getUserById.get(note.user_id);
    if (owner) {
      result.unshift(participantObj(owner, { isOwner: true }));
    }

    res.json(result);
  });

  // Change a collaborator's access level. Owner-only. `access` is
  // "read" (read-only) or "write" (read-write). For a federated stand-in
  // the change is also pushed to the peer so the remote user's mirror flips
  // read-only/read-write instantly; locally we re-broadcast so the
  // collaborator's open sessions re-fetch and lock/unlock their editor.
  app.patch("/api/notes/:id/collaborate/:userId", auth, async (req, res) => {
    const noteId = req.params.id;
    const userIdToSet = Number(req.params.userId);
    if (!Number.isInteger(userIdToSet)) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    const access = req.body?.access;
    if (access !== "read" && access !== "write") {
      return res.status(400).json({ error: "access must be 'read' or 'write'" });
    }

    // Owner-only, mais dit de la même façon que la route jumelle qui retire
    // un collaborateur: on résout d'abord la note comme la voit le
    // demandeur, puis on refuse le geste. Chercher la note en propriétaire
    // seul répondait « note introuvable » à un collaborateur qui la voit
    // pourtant très bien, ce qui est faux et oblige un client à traiter deux
    // codes pour une seule situation.
    const note = getNoteWithCollaboration.get(req.user.id, noteId, req.user.id);
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }
    if (note.user_id !== req.user.id) {
      return res.status(403).json({ error: "Only note owner can change collaborator access" });
    }

    // Must already be a collaborator on this note.
    const target = getUserById.get(userIdToSet);
    const current = getCollaboratorAccess.get(noteId, userIdToSet);
    if (!target || !current) {
      return res.status(404).json({ error: "Collaborator not found" });
    }

    const canWrite = access === "write" ? 1 : 0;
    setCollaboratorCanWrite.run(canWrite, noteId, userIdToSet);

    // Federated stand-in (a shadow user): tell the peer so the remote
    // recipient's mirror copy flips immediately.
    if (target.federated_origin && noteFederation?.setRemotePermission) {
      // Federated stand-in: the real user lives on the peer, which relays the
      // change to them over its own SSE. A courtesy push so their copy flips
      // at once: deliberately NOT awaited. The decision is already recorded
      // above, while holding the owner's request for a peer round trip (a
      // second and a half for a sluggish peer, the full 8s timeout for one
      // that has gone away) left BOTH halves of the access toggle disabled
      // for that whole time, so clicks during it did nothing at all. The
      // roster pushed just below carries the same access and is retried
      // until it lands, so nothing is lost when this push fails.
      Promise.resolve()
        .then(() => noteFederation.setRemotePermission({ note, shadow: target, canWrite }))
        .catch((e) => console.warn("[federation/notes] setRemotePermission failed:", e?.message));
    } else {
      // Local collaborator: push a dedicated access-change event so their open
      // note flips read-only/read-write instantly: even mid-edit, where the
      // generic note_updated patch is suppressed because they hold a local
      // lease / have pending changes.
      sendEventToUser(userIdToSet, { type: "note_access_changed", noteId, access });
    }

    broadcastNoteUpdated(noteId);
    // An access toggle changes a participant's canWrite in the roster: push
    // it so every peer's displayed roster reflects the new permission.
    try { noteFederation?.onParticipantsChangedLocally(noteId); } catch { /* best-effort */ }
    res.json({ ok: true, access });
  });

  app.delete("/api/notes/:id/collaborate/:userId", auth, (req, res) => {
    const noteId = req.params.id;
    const userIdToRemove = Number(req.params.userId);

    if (!Number.isInteger(userIdToRemove)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    // Check if note exists
    const note = getNoteWithCollaboration.get(req.user.id, noteId, req.user.id);
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    // Check if user is the owner (can remove anyone) or is removing themselves
    const isOwner = note.user_id === req.user.id;
    const isRemovingSelf = userIdToRemove === req.user.id;

    if (!isOwner && !isRemovingSelf) {
      return res.status(403).json({ error: "Only note owner can remove other collaborators" });
    }

    // Optional mode "keep_copy": give the removed collaborator a standalone
    // (non-collab) copy of the note so they don't lose it entirely. Only the
    // owner may grant this; a collaborator leaving themselves keeps the current
    // behavior (clean exit, no copy).
    const mode = typeof req.body?.mode === "string" ? req.body.mode : null;
    const shouldGrantCopy = isOwner && !isRemovingSelf && mode === "keep_copy";
    // Needed up front: a federated removal skips the LOCAL copy below
    // entirely (see that call's own comment for why) and instead asks the
    // recipient's own server to make the copy.
    const removedUser = getUserById.get(userIdToRemove);
    const isFederatedRemoval = !!removedUser?.federated_origin;
    let copyNoteId = null;

    if (shouldGrantCopy && !isFederatedRemoval) {
      copyNoteId = uid();
      // Preserve the removed user's own per-user tags on the copy instead of
      // inheriting the shared default: those tags are personal to them.
      //
      // Elles doivent aller dans note_user_tags, pas dans la colonne
      // partagée: toute lecture passe par getUserTags, qui ne consulte que
      // cette table. Recopiées dans la colonne, elles étaient bien écrites
      // mais plus jamais lues, et le retiré récupérait une note nue.
      const userTagsJson = getUserTags(noteId, userIdToRemove);
      // Same reasoning for the icon, one line below: it is personal too, and
      // was being wiped everywhere (including on this fresh copy) instead of
      // following its owner onto it.
      const userIcon = getUserIcon(noteId, userIdToRemove);
      runInsertNote({
        id: copyNoteId,
        user_id: userIdToRemove,
        type: note.type,
        title: note.title,
        content: note.content,
        items_json: note.items_json,
        tags_json: "[]",
        images_json: note.images_json,
        color: note.color,
        pinned: 0,
        position: note.position,
        timestamp: note.timestamp,
        client_updated_at: nowISO(),
      });
      if (userTagsJson && userTagsJson !== "[]") {
        runUpsertUserTags(copyNoteId, userIdToRemove, userTagsJson);
      }
      if (userIcon) {
        runSetUserIcon(copyNoteId, userIdToRemove, userIcon);
      }
      // Seed the removed user's per-user position for the copy so it appears
      // at the top of their list, matching the share-to-collaborator UX.
      const { max_pos } = getMaxUserEffectivePosition.get(
        userIdToRemove,
        userIdToRemove,
        userIdToRemove,
        userIdToRemove,
      );
      upsertUserPosition.run({
        note_id: copyNoteId,
        user_id: userIdToRemove,
        position: (typeof max_pos === "number" ? max_pos : 0) + 1,
        pinned: 0,
      });
    }

    // Remove collaborator
    const removeCollaborator = db.prepare(`
      DELETE FROM note_collaborators
      WHERE note_id = ? AND user_id = ?
    `);

    const result = removeCollaborator.run(noteId, userIdToRemove);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Collaborator not found" });
    }

    // Clean up per-user tags, positions and icon for the removed collaborator.
    //
    // L'icône était oubliée: sa ligne survivait au retrait, sur une note à
    // laquelle la personne n'a plus accès, et ressuscitait telle quelle au
    // repartage. Les trois états personnels doivent partir ensemble.
    db.prepare("DELETE FROM note_user_tags WHERE note_id = ? AND user_id = ?").run(noteId, userIdToRemove);
    db.prepare("DELETE FROM note_user_positions WHERE note_id = ? AND user_id = ?").run(noteId, userIdToRemove);
    deleteUserIconStmt.run(noteId, userIdToRemove);

    // If the removed collaborator was a FEDERATED stand-in, tell their peer to
    // drop that specific recipient from the mirror: an explicit, deterministic
    // signal (the display roster never removes real recipients on its own).
    // withCopy tells the peer to create the standalone copy itself, from its
    // own already-synced mirror content and owned by the recipient's real
    // local account: a copy made HERE would only ever be reachable by the
    // powerless shadow user that stands in for them on this server.
    // Called BEFORE the broadcast below: when this was the peer's last
    // recipient the whole mirror comes down, and this is what tells that
    // teardown to preserve the copy rather than destroy it.
    if (isFederatedRemoval) {
      noteFederation?.onRemoteRecipientRemoved?.({
        shadow: removedUser,
        noteId,
        withCopy: shouldGrantCopy,
      });
    } else {
      // The mirror side of the same event: a real local user stopped
      // collaborating on a note whose authority is a peer. Only that peer can
      // drop the stand-in representing them, and nothing else tells it.
      noteFederation?.onLocalParticipantLeft?.(
        noteId,
        removedUser?.email || removedUser?.name,
      );
    }

    // Notify the removed user FIRST: they are no longer in the collaborator list
    // so broadcastNoteUpdated won't reach them. Send a dedicated event so their
    // client can remove the note immediately without a full reload. If a copy
    // was granted, the payload also carries its id so the client fetches it in.
    sendEventToUser(userIdToRemove, { type: "note_access_revoked", noteId, copyNoteId });

    // Persist + push a notification on BOTH sides: the ex-collaborator
    // gets a "your access was removed" toast, the owner gets a "you
    // removed X" confirmation toast. Variant suffix tells the client
    // whether a copy was kept so the i18n message picks the right
    // phrasing. Skipped when the user removed themselves: they
    // already know, and notifying the owner about their own action
    // would be circular.
    if (!isRemovingSelf) {
      // -- Ex-collaborator notification --
      // When a copy was granted, persist the COPY's id in note_id so the
      // recipient's "Ouvrir" action targets the note they actually still
      // have access to. Plain revoke (no copy) keeps the original id for
      // historical context: the action falls back to null on the client
      // side. Best-effort: a failure here shouldn't block the owner's own
      // confirmation below.
      const revokeCreatedAt = createAccessRevokedNotification({
        recipientId: userIdToRemove,
        senderId: req.user.id,
        senderName: req.user.name || req.user.email || "",
        // copyNoteId is only ever set when a copy was actually made HERE
        // (shouldGrantCopy is true but a federated removal leaves it null,
        // see above): falling back to noteId keeps this notification
        // pointing at a real note either way.
        noteId: copyNoteId || noteId,
        noteTitle: note.title || "",
        withCopy: !!copyNoteId,
      }) || nowISO();

      // -- Owner confirmation notification --
      // The owner is the one driving the removal, so the sender of the row
      // is the removed user (for the i18n {sender} slot to resolve to
      // their name). removedUser was already fetched above for the
      // isFederatedRemoval check, and nothing since has touched that row.
      try {
        const removedName =
          (removedUser && (removedUser.name || removedUser.email)) || "";
        const ownerType = shouldGrantCopy
          ? "collaborator_removed_with_copy"
          : "collaborator_removed";
        const ownerRow = insertNotification.run(
          req.user.id,
          userIdToRemove,
          ownerType,
          noteId,
          note.title || "",
          removedName,
          null,
          null,
          0,
          null,
          revokeCreatedAt,
        );
        sendEventToUser(req.user.id, {
          type: "note_access_revoked_notification",
          notificationType: ownerType,
          notificationId: ownerRow.lastInsertRowid,
          senderName: removedName,
          noteId,
          noteTitle: note.title || "",
          withCopy: shouldGrantCopy,
          createdAt: revokeCreatedAt,
        });
      } catch (e) {
        console.warn("[notifications] owner confirmation notification failed:", e?.message);
      }
    } else if (!isOwner) {
      // Collaborator left the note voluntarily: notify the owner so
      // they know who walked away. Owner-self-removal is a no-op
      // notification-wise (would be circular).
      try {
        const leftCreatedAt = nowISO();
        const owner = getUserById.get(note.user_id);
        if (owner) {
          const leftRow = insertNotification.run(
            owner.id,
            req.user.id,
            "collaborator_left",
            noteId,
            note.title || "",
            req.user.name || req.user.email || "",
            null,
            null,
            0,
            null,
            leftCreatedAt,
          );
          sendEventToUser(owner.id, {
            type: "note_access_revoked_notification",
            notificationType: "collaborator_left",
            notificationId: leftRow.lastInsertRowid,
            senderName: req.user.name || req.user.email || "",
            noteId,
            noteTitle: note.title || "",
            createdAt: leftCreatedAt,
          });
        }
      } catch (e) {
        console.warn("[notifications] collaborator_left notification failed:", e?.message);
      }
    }

    // Update note with editor info and notify remaining participants
    markEditedBy(noteId, req.user);
    broadcastNoteUpdated(noteId);
    // Removing a participant shrinks the roster: push it so every peer prunes
    // the departed collaborator from their displayed list.
    try { noteFederation?.onParticipantsChangedLocally(noteId); } catch { /* best-effort */ }

    res.json({ ok: true, message: "Collaborator removed", copyNoteId });
  });
}

function attachCollaboratedNotesRoutes(app, deps) {
  const { db, auth, decryptRows, serializeNote } = deps;

  app.get("/api/notes/collaborated", auth, (req, res) => {
    const rows = decryptRows(db.prepare(`
      SELECT n.*,
        COALESCE(nup.pinned, n.pinned) AS eff_pinned,
        COALESCE(nup.position, n.position) AS eff_position
      FROM notes n
      JOIN note_collaborators nc ON n.id = nc.note_id
      LEFT JOIN note_user_positions nup
        ON nup.note_id = n.id AND nup.user_id = ?
      WHERE nc.user_id = ? AND n.trashed = 0
      ORDER BY eff_pinned DESC, eff_position DESC, n.timestamp DESC
    `).all(req.user.id, req.user.id));
    res.json(rows.map((r) => serializeNote(r, req.user.id)));
  });
}

module.exports = { attachCollaborationRoutes, attachCollaboratedNotesRoutes };
