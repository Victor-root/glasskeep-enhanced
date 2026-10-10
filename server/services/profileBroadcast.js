// server/services/profileBroadcast.js
//
// Sends a local account's new name or avatar to every paired server.

function createProfileBroadcast({ getUserById, noteFederation }) {
  // Push a just-changed profile (display name and/or avatar) to every paired
  // server so a cross-server collaborator's stand-in (and the note footers
  // showing it) refresh at once instead of staying frozen at the value
  // snapshotted when the note was shared. Fire-and-forget and fully optional:
  // federation may be off.
  function pushProfileToPeers(userId, avatarUrl, previousRef) {
    try {
      const u = getUserById.get(userId);
      if (!u) return;
      noteFederation?.broadcastProfileToPeers?.({
        ref: u.email || u.name,
        uid: `local:${userId}`,
        name: u.name || null,
        avatarUrl: avatarUrl ?? null,
        previousRef: previousRef || null,
      });
    } catch { /* federation optional */ }
  }

  return { pushProfileToPeers };
}

module.exports = { createProfileBroadcast };
