// server/services/reminderDispatch.js
//
// Delivers a reminder the scheduler (reminderScheduler.js) found due.

const pushService = require("./pushNotifications");
const { t: serverT } = require("../i18n");
const { nowISO } = require("../utils/timestamps");
const { notePreviewText } = require("../utils/notePreview");

function createReminderDispatch({
  db,
  getNoteById,
  getCollaboratorUserIdsForNote,
  getUserLanguage,
  insertNotification,
  sendEventToUser,
}) {
  // Deliver a due reminder: one in-app notification (persisted + live SSE)
  // and one Web Push per recipient (owner + collaborators). Reuses the
  // existing notification pipeline so the card, history and unread badge
  // all work unchanged. Called by the scheduler once per reminder.
  async function dispatchReminder(noteId) {
    const note = getNoteById.get(noteId);
    if (!note) {
      console.log(`[reminders] dispatch skipped — note ${noteId} not found (deleted?)`);
      return;
    }
    const recipientIds = new Set([
      note.user_id,
      ...getCollaboratorUserIdsForNote(noteId),
    ]);
    const createdAt = nowISO();
    const preview = notePreviewText(note);
    console.log(
      `[reminders] dispatching note ${noteId} to ${recipientIds.size} recipient(s); push=${pushService.isConfigured() ? "on" : "off"}`,
    );

    for (const uid of recipientIds) {
      const lang = getUserLanguage(uid);
      const title = serverT(lang, "reminderNotificationTitle");
      const message = preview || serverT(lang, "reminderNotificationUntitled");

      // Persist so the reminder survives the recipient being offline: the
      // /notifications/pending replay (generic branch) renders it from
      // note_title (→ card title) + message + variant + icon. persistent=1
      // so it stays until the user closes it (a reminder shouldn't auto-
      // dismiss the way a transient "saved" toast does).
      let notificationId = null;
      try {
        const r = insertNotification.run(
          uid,
          note.user_id,
          "reminder",
          noteId,
          title,
          "",
          "info",
          message,
          1,
          "reminder",
          createdAt,
        );
        notificationId = r.lastInsertRowid;
      } catch (e) {
        console.warn("[reminders] persist failed:", e?.message);
      }

      // Live in-app card for any currently-connected session. persistent so
      // it stays on screen (no timer bar) until manually dismissed.
      sendEventToUser(uid, {
        type: "reminder_due",
        notificationId,
        variant: "info",
        persistent: true,
        title,
        message,
        noteId,
        icon: "reminder",
        createdAt,
      });

      // System push for installed PWAs (fires even when the app is closed).
      // Best-effort: a push failure must never break the in-app reminder.
      pushService
        .sendToUser(
          db,
          uid,
          { title, body: message, noteId: String(noteId), tag: `reminder-${noteId}` },
          console,
        )
        .then((n) => {
          if (n > 0) console.log(`[reminders] push sent to user ${uid} (${n} device(s))`);
        })
        .catch((e) => console.warn("[reminders] push failed:", e?.message));
    }
  }

  return { dispatchReminder };
}

module.exports = { createReminderDispatch };
