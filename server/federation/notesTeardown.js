// server/federation/notesTeardown.js
//
// How a federated note share ends (see federation/notes.js): a mirror
// torn down by its authority, a single recipient removed on either side,
// a link that disappears with notes still riding it, and the "keep a
// copy" outcome that leaves each local participant a standalone note.

function createNoteTeardown({ q, store, peer, deps, log, findRealUser, splitOrigin, unreachable, onNoteChangedLocally }) {
  // ── Inbound: the peer removed/unshared a note we mirror ─────────────
  // keepCopies: the share ended WITHOUT the content being deleted (the
  // owner left the note, or removed its last recipient while granting a
  // copy). Every real local participant keeps a standalone copy instead of
  // losing the note.
  //
  // Doing this here, rather than only in the separate unshare-recipient
  // call, is what makes the two race-free: whichever of the two arrives
  // first finds the recipient still present and makes the copy, and the
  // other then finds nothing left to do. Exactly one copy either way.
  function handleIncomingRemove({ linkId, noteId, keepCopies = false }) {
    const m = q.getMappingForLink.get(noteId, linkId);
    if (!m || m.role !== "mirror") {
      q.deleteMappingForLink.run(noteId, linkId); // tidy any stray mapping for this link
      return { ok: true };
    }
    // Identify the local participants + the remote owner (a shadow user)
    // BEFORE deleting, so we can both drop the note and tell them why,
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

  // ── A link is gone for good ─────────────────────────────────────────
  // Unpaired here, unpaired by the peer, or a dissociation the health probe
  // detected. Whatever hung off the link has to be resolved now: a mirror
  // whose authority no longer exists can never be edited again (isReadOnly
  // has no writable link to consult), and a home note keeps listing
  // stand-ins for people it can no longer reach. Mirrors end exactly like a
  // share that ends without a deletion: every local participant keeps a
  // standalone copy of the content rather than a note frozen forever.
  function onLinkRemoved(linkId) {
    // Copies need the content, which we can't read while locked. The sweep
    // below re-runs this once the instance is unlocked, so nothing is lost
    // by waiting, where destroying the mirror now would lose it for good.
    if (deps.isLocked?.()) return;
    let mappings;
    try {
      mappings = q.listByLink.all(linkId);
    } catch (e) {
      log.warn?.("[federation/notes] link cleanup:", e?.message);
      return;
    }
    for (const m of mappings) {
      try {
        if (m.role === "mirror") {
          handleIncomingRemove({ linkId, noteId: m.note_id, keepCopies: true });
          continue;
        }
        // Home side: the note stays ours; only the peer's stand-ins go.
        for (const row of q.listShadowCollabsForNote.all(m.note_id, `${linkId}|%`)) {
          deps.removeCollaborator?.run(m.note_id, row.id);
        }
        q.deleteMappingForLink.run(m.note_id, linkId);
        deps.broadcastNoteUpdated?.(m.note_id);
      } catch (e) {
        log.warn?.(`[federation/notes] link cleanup ${m.note_id}:`, e?.message);
      }
    }
  }

  // Mappings whose link no longer exists. Normally onLinkRemoved handles
  // them the instant the link goes, so this only catches what it could not:
  // a teardown that landed while the instance was locked, and databases
  // unpaired by a build that predates this cleanup.
  function sweepOrphanedMappings() {
    let rows;
    try {
      rows = q.listAll.all();
    } catch {
      return;
    }
    const dead = new Set();
    for (const m of rows) {
      if (!store.getById(m.link_id)) dead.add(m.link_id);
    }
    for (const linkId of dead) onLinkRemoved(linkId);
  }

  // ── Outbound: the owner removed a single federated recipient ─────────
  // Tell that recipient's peer to drop just THAT user from the note, leaving
  // any other recipients on the same peer (and the mirror itself) intact.
  // `shadow` is our local stand-in for the removed recipient
  // (federated_origin = `${linkId}|${remoteRef}`).
  async function unshareFromRemote({ shadow, noteId, withCopy = false }) {
    const origin = splitOrigin(shadow);
    if (!origin) return { ok: false, error: "not_federated" };
    const link = store.getById(origin.linkId);
    if (!link || link.status !== "active") return { ok: false, error: "peer_not_paired" };
    try {
      const resp = await peer.postSigned(link, "/api/federation/notes/unshare-recipient", {
        linkId: link.id, noteId, targetRef: origin.ref, withCopy,
      });
      return { ok: !!(resp.ok && resp.json && resp.json.ok === true) };
    } catch (e) {
      return { ok: false, error: unreachable(e) };
    }
  }

  // Give a local user their own standalone (non-federated) note carrying
  // this mirror's current content: what "keep a copy" means on THIS side
  // of the link. Built here, from the already-synced mirror row, and owned
  // by the recipient's REAL account: a copy made on the owner's server
  // could only ever belong to the powerless shadow user standing in for
  // them there. Field-for-field the same shape as the local
  // remove-collaborator "keep a copy" flow in server/routes/collaborationRoutes.js.
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
    const target = findRealUser(targetRef);
    if (!target) return { ok: true }; // already gone: nothing to do
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
  // Record how this note's share must end on every peer carrying it, and
  // kick the push now (the tick retries it until it lands). Called by the
  // delete routes at the moment the owner's intent is known: see the
  // teardown column (notesSchema.js) for why it has to be persisted rather
  // than inferred.
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
  // per-recipient unshare and, when that was the LAST recipient on this
  // link, so the whole mirror is about to come down, records how that
  // teardown must behave, instead of letting it default to "destroy" and
  // wipe out the copy the owner meant to leave.
  //
  // Call this BEFORE broadcasting: the teardown write has to land before
  // the reconcile that reads it.
  function onRemoteRecipientRemoved({ shadow, noteId, withCopy = false }) {
    const origin = splitOrigin(shadow);
    if (!origin) return;
    const { linkId } = origin;
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
    handleIncomingRemove,
    handleIncomingUnshareRecipient,
    onLinkRemoved,
    sweepOrphanedMappings,
    markShareEnding,
    onRemoteRecipientRemoved,
  };
}

module.exports = { createNoteTeardown };
