// server/services/noteParticipants.js
//
// Who shares a note: the collaborator rows and their access level, the
// participant list each user is shown, and the full roster the
// federation engine propagates to peers.

function createNoteParticipants({ db, getUserById, getNoteFederation }) {
  const addCollaborator = db.prepare(`
    INSERT INTO note_collaborators (note_id, user_id, added_by, added_at)
    VALUES (?, ?, ?, ?)
  `);
  const getNoteCollaborators = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_url, u.federated_origin, u.federated_server_label, nc.added_at, nc.added_by, nc.can_write
    FROM note_collaborators nc
    JOIN users u ON nc.user_id = u.id
    WHERE nc.note_id = ?
  `);
  // Per-collaborator write permission. `can_write` defaults to 1 (read-write);
  // 0 means read-only: they can open the note but not change shared content.
  const setCollaboratorCanWrite = db.prepare(`
    UPDATE note_collaborators SET can_write = ? WHERE note_id = ? AND user_id = ?
  `);
  // Drop a single collaborator from a note. Used by the federation roster
  // sync to prune display stand-ins for participants who have left.
  const removeCollaboratorRow = db.prepare(
    "DELETE FROM note_collaborators WHERE note_id = ? AND user_id = ?"
  );
  const getCollaboratorAccess = db.prepare(
    "SELECT can_write FROM note_collaborators WHERE note_id = ? AND user_id = ?"
  );
  // True when `userId` is a collaborator on `noteId` who has been limited to
  // read-only. The owner never has a collaborator row, so this is false for
  // them (owners always keep write). Used to gate the shared-content write
  // path exactly like the federation read-only check.
  function isCollabReadOnly(noteId, userId) {
    const row = getCollaboratorAccess.get(noteId, userId);
    return !!row && row.can_write === 0;
  }
  // The requesting user's access level on a note: "owner" (their own note),
  // "write" (a read-write collaborator) or "read" (a read-only collaborator).
  // The client uses this to lock the editor for non-writers.
  function noteAccessFor(noteId, ownerId, userId) {
    if (!userId || ownerId === userId) return "owner";
    const row = getCollaboratorAccess.get(noteId, userId);
    return row && row.can_write === 0 ? "read" : "write";
  }

  // Build participant list for a note: shows the OTHER users, not the requesting user.
  // For the owner: shows collaborators. For a collaborator: shows the owner + other collaborators.
  // Federation badge info for a participant: whether they're a stand-in
  // for a remote-server user and, if so, that server's friendly name.
  function participantFedInfo(u) {
    const federatedOrigin = u && u.federated_origin;
    if (!federatedOrigin) return { federated: false, serverLabel: null, remoteRef: null };
    // federated_origin is "<linkId>|<remoteRef>"; the remoteRef is the
    // participant's own identity on the peer (clean: no server URL).
    const idx = String(federatedOrigin).indexOf("|");
    const remoteRef = idx >= 0 ? String(federatedOrigin).slice(idx + 1) : null;
    // The shadow's synthetic email ends in the peer host: a robust hint
    // for resolving the server name even if the link id changed.
    const hostHint = u.email ? String(u.email).split("@").pop() : null;
    return {
      federated: true,
      // A stored label wins: it's the authority server's name for a participant
      // whose origin server we can't resolve via our own links (a third server
      // in a multi-peer share). Otherwise resolve it from the link we share.
      serverLabel:
        u.federated_server_label ||
        getNoteFederation()?.serverLabelForOrigin(federatedOrigin, hostHint) ||
        null,
      remoteRef,
    };
  }

  // Build a participant object for collaborator lists. For a remote
  // stand-in, the secondary line shows their clean identity on the peer
  // (remoteRef), NOT the synthetic local email that embeds the server URL.
  function participantObj(u, extra = {}) {
    const fed = participantFedInfo(u);
    return {
      id: u.id,
      name: u.name,
      email: fed.federated ? fed.remoteRef || u.email : u.email,
      avatar_url: u.avatar_url || null,
      federated: fed.federated,
      serverLabel: fed.serverLabel,
      canWrite: u.can_write === 0 ? 0 : 1,
      ...extra,
    };
  }

  function getNoteParticipants(noteId, noteOwnerId, requestingUserId) {
    const collabList = getNoteCollaborators.all(noteId);
    if (collabList.length === 0) return null;
    const others = collabList
      .filter((c) => c.id !== requestingUserId)
      .map((c) => participantObj(c));
    if (noteOwnerId !== requestingUserId) {
      const owner = getUserById.get(noteOwnerId);
      if (owner) others.unshift(participantObj(owner));
    }
    return others.length > 0 ? others : null;
  }

  // Flat roster of EVERY participant on a note (owner + all collaborators),
  // for the federation engine to propagate to mirrors so each peer can show
  // the complete active-collaborator list, including participants who live
  // on a third server it isn't directly linked to. Each entry carries a
  // stable `ref` (the participant's own identity on their home server, so a
  // shadow stand-in is keyed by its clean remoteRef, never the synthetic
  // local email) plus the display fields a mirror needs.
  function rosterRefFor(u) {
    const origin = u && u.federated_origin;
    if (origin) {
      const i = String(origin).indexOf("|");
      if (i >= 0) return String(origin).slice(i + 1); // clean remote identity
    }
    return u.email || u.name;
  }
  // The friendly name of the server a participant lives on, as known to THIS
  // (home/authority) server: propagated so every mirror can badge that person
  // with their true origin server, even one the mirror isn't linked to.
  //   - real local user (no federated_origin) → null: they live on us, the home,
  //     and each mirror already knows us by its own name for the shared link.
  //   - shadow collaborator → our friendly name for their origin server.
  function rosterServerLabelFor(u) {
    if (!u || !u.federated_origin) return null;
    const hostHint = u.email ? String(u.email).split("@").pop() : null;
    return getNoteFederation()?.serverLabelForOrigin(u.federated_origin, hostHint) || null;
  }
  // A key that is unique PER PARTICIPANT from this (home) server's point of
  // view, so a mirror can key each stand-in distinctly and never collapse two
  // different people who happen to share a name. For a shadow it's their
  // federated origin (already globally distinct); for a real local user it's
  // their local id, which is unique here. `ref` stays the human identity used
  // to match a real local recipient on the mirror.
  function rosterUidFor(u) {
    return (u && u.federated_origin) || `local:${u.id}`;
  }
  function getNoteRoster(noteId, noteOwnerId) {
    const out = [];
    const owner = getUserById.get(noteOwnerId);
    if (owner) {
      out.push({
        ref: rosterRefFor(owner),
        uid: rosterUidFor(owner),
        name: owner.name,
        avatar_url: owner.avatar_url || null,
        canWrite: 1,
        isOwner: true,
        serverLabel: rosterServerLabelFor(owner),
      });
    }
    for (const c of getNoteCollaborators.all(noteId)) {
      out.push({
        ref: rosterRefFor(c),
        uid: rosterUidFor(c),
        name: c.name,
        avatar_url: c.avatar_url || null,
        canWrite: c.can_write === 0 ? 0 : 1,
        isOwner: false,
        serverLabel: rosterServerLabelFor(c),
      });
    }
    return out;
  }

  function getCollaboratorUserIdsForNote(noteId) {
    try {
      const rows = getNoteCollaborators.all(noteId) || [];
      return rows.map((r) => r.id);
    } catch {
      return [];
    }
  }

  return {
    addCollaborator,
    getNoteCollaborators,
    setCollaboratorCanWrite,
    removeCollaboratorRow,
    getCollaboratorAccess,
    isCollabReadOnly,
    noteAccessFor,
    participantObj,
    getNoteParticipants,
    getNoteRoster,
    getCollaboratorUserIdsForNote,
  };
}

module.exports = { createNoteParticipants };
