// server/services/realtime.js
//
// Server-sent events: the open streams of each user, and the helpers
// that push an event to one user, to the admins, to everyone, or to
// every participant of a note that just changed.

function createRealtime({ db, getNoteById, getCollaboratorUserIdsForNote, getNoteFederation }) {
  // Map of userId (integer) -> Set of response streams.
  // All access goes through parseSseKey() which rejects non-integer values,
  // preventing NaN keys and string/number mismatch bugs.
  const sseClients = new Map();

  // Parse a userId to a valid integer key, or null if invalid.
  // Prevents NaN from entering sseClients as a Map key.
  function parseSseKey(id) {
    const n = Number(id);
    return Number.isInteger(n) ? n : null;
  }

  function addSseClient(userId, res) {
    const key = parseSseKey(userId);
    if (key === null) { console.warn("[SSE] addSseClient: invalid userId", userId); return; }
    let set = sseClients.get(key);
    if (!set) {
      set = new Set();
      sseClients.set(key, set);
    }
    set.add(res);
  }

  function removeSseClient(userId, res) {
    const key = parseSseKey(userId);
    if (key === null) return;
    const set = sseClients.get(key);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) sseClients.delete(key);
  }

  // Drop every open event stream belonging to an account. Called when the
  // password changes: the streams were accepted with tokens that are no
  // longer valid, and a stream stays open for as long as the client keeps
  // it, so revoking the token alone would leave note updates flowing to a
  // session that is supposed to be shut out.
  //
  // The device that just changed its password is disconnected too, and
  // that is fine: its client reopens a stream as soon as it takes the new
  // token, and the reconnection path runs an unauthenticated health check,
  // so nothing mistakes this for an expired session.
  function closeSseClientsFor(userId) {
    const key = parseSseKey(userId);
    if (key === null) return;
    const set = sseClients.get(key);
    if (!set) return;
    for (const res of set) {
      try { res.end(); } catch { /* already gone */ }
    }
    sseClients.delete(key);
  }

  function sendEventToUser(userId, event) {
    const key = parseSseKey(userId);
    if (key === null) { console.warn("[SSE] sendEventToUser: invalid userId", userId); return; }
    const set = sseClients.get(key);
    if (!set || set.size === 0) return;
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    const toRemove = [];
    for (const res of set) {
      try {
        res.write(payload);
      } catch {
        // Remove dead connections
        toRemove.push(res);
      }
    }
    // Clean up dead connections
    for (const res of toRemove) {
      removeSseClient(userId, res);
    }
  }

  function broadcastToAdmins(event) {
    try {
      const admins = db.prepare("SELECT id FROM users WHERE is_admin = 1").all();
      for (const a of admins) sendEventToUser(a.id, event);
    } catch (e) {
      console.warn("[SSE] broadcastToAdmins failed:", e?.message);
    }
  }

  // Push an event to every connected SSE client, regardless of user.
  // Used by the lock route so other admins/users who are currently
  // online drop straight to the unlock screen instead of finding out at
  // the next request or the next 30-second status poll.
  function broadcastToAll(event) {
    for (const userId of sseClients.keys()) {
      sendEventToUser(userId, event);
    }
  }

  function broadcastNoteUpdated(noteId) {
    try {
      const note = getNoteById.get(noteId);
      if (!note) return;
      const recipientIds = new Set([note.user_id, ...getCollaboratorUserIdsForNote(noteId)]);
      const evt = { type: "note_updated", noteId };
      for (const uid of recipientIds) sendEventToUser(uid, evt);
    } catch { /* best-effort live refresh: never disturb the note operation */ }
    // If this note is shared across a federation link, push the change to
    // the peer immediately (the periodic tick remains the retry/safety
    // net). Guarded + fire-and-forget so it can never disturb the local
    // note operation that triggered this broadcast.
    try { getNoteFederation()?.onNoteChangedLocally(noteId); } catch { /* fire-and-forget, see above */ }
  }

  return {
    addSseClient,
    removeSseClient,
    closeSseClientsFor,
    sendEventToUser,
    broadcastToAdmins,
    broadcastToAll,
    broadcastNoteUpdated,
  };
}

module.exports = { createRealtime };
