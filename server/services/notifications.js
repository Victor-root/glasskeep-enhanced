// server/services/notifications.js
//
// Persisted notifications: the statement every notice is stored with,
// and the share / access-revoked / deleted-note notices raised from
// several routes and from the federation engine.

const { nowISO } = require("../utils/timestamps");

function createNotifications({ db, sendEventToUser }) {
  const insertNotification = db.prepare(`
    INSERT INTO notifications
      (recipient_user_id, sender_user_id, type, note_id, note_title, sender_name,
       variant, message, persistent, icon, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Persist a "note_shared" notification and push it over SSE if the
  // recipient is currently connected. The frontend marks pending rows
  // delivered after showing the toast, so a row only fires once across
  // reloads even though it lives in the DB until then.
  function createShareNotification({ recipientId, senderId, senderName, noteId, noteTitle, readOnly = false }) {
    try {
      const createdAt = nowISO();
      // Share notifications regenerate their text client-side from
      // sender_name + note_title via i18n. The `variant` column carries
      // "read_only" when the share is read-only so the pending-replay and
      // history paths pick the right wording (the live SSE also sends a
      // `readOnly` flag). is_persistent=0 because the client (showShareToast)
      // defers duration to the user's notification-duration pref.
      const result = insertNotification.run(
        recipientId,
        senderId,
        "note_shared",
        noteId,
        noteTitle || "",
        senderName || "",
        readOnly ? "read_only" : null,
        null,
        0,
        null,
        createdAt,
      );
      sendEventToUser(recipientId, {
        type: "note_shared",
        notificationId: result.lastInsertRowid,
        senderName: senderName || "",
        noteId,
        noteTitle: noteTitle || "",
        readOnly: !!readOnly,
        createdAt,
      });
    } catch (e) {
      console.warn("[notifications] createShareNotification failed:", e?.message);
    }
  }

  // Persist + push a "shared_note_deleted" notification: the owner deleted a
  // note that was shared with this collaborator. The transient note_deleted
  // SSE event only removes the note from a CONNECTED client's view and leaves
  // no trace, so an offline collaborator never learns the shared note is
  // gone. This persisted row fixes that: it replays on reconnect and lands in
  // the notification history. By default note_id is null (no note to open after
  // a full delete, and it keeps the FK happy when the row outlives a permanent
  // delete); the owner-left-with-copy case passes noteId so the recipient can
  // open the note they kept. It rides the same envelope as revoke notices so the
  // client routes it via showRevokeToast.
  function createSharedNoteDeletedNotification({
    recipientId,
    senderId,
    senderName,
    noteTitle,
    noteId = null,
    notificationType = "shared_note_deleted",
  }) {
    try {
      const createdAt = nowISO();
      const row = insertNotification.run(
        recipientId,
        senderId,
        notificationType,
        noteId,
        noteTitle || "",
        senderName || "",
        null,
        null,
        0,
        null,
        createdAt,
      );
      sendEventToUser(recipientId, {
        type: "note_access_revoked_notification",
        notificationType,
        notificationId: row.lastInsertRowid,
        senderName: senderName || "",
        noteTitle: noteTitle || "",
        noteId: noteId ?? undefined,
        createdAt,
      });
    } catch (e) {
      console.warn("[notifications] createSharedNoteDeletedNotification failed:", e?.message);
    }
  }

  // Persist + push the "your access to this note was removed" notification
  // for a removed collaborator. Shared by the local remove-collaborator
  // route (server/routes/collaborationRoutes.js) and the federation
  // unshare-recipient handler -- a
  // federated mirror recipient is a REAL local user on their own server,
  // reached the same way as a same-server removal once the caller resolves
  // who removed them (locally: the acting admin; over federation: the
  // mirror's shadow owner, which already satisfies notifications.
  // sender_user_id's real-row requirement) and their display name.
  function createAccessRevokedNotification({
    recipientId,
    senderId,
    senderName,
    noteId,
    noteTitle,
    withCopy = false,
  }) {
    try {
      const createdAt = nowISO();
      const notificationType = withCopy ? "note_access_revoked_with_copy" : "note_access_revoked";
      const row = insertNotification.run(
        recipientId,
        senderId,
        notificationType,
        noteId,
        noteTitle || "",
        senderName || "",
        null,
        null,
        0,
        null,
        createdAt,
      );
      sendEventToUser(recipientId, {
        type: "note_access_revoked_notification",
        notificationType,
        notificationId: row.lastInsertRowid,
        senderName: senderName || "",
        noteId,
        noteTitle: noteTitle || "",
        withCopy,
        createdAt,
      });
      return createdAt;
    } catch (e) {
      console.warn("[notifications] createAccessRevokedNotification failed:", e?.message);
      return null;
    }
  }

  return {
    insertNotification,
    createShareNotification,
    createSharedNoteDeletedNotification,
    createAccessRevokedNotification,
  };
}

module.exports = { createNotifications };
