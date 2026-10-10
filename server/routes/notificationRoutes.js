// server/routes/notificationRoutes.js
//
// The notification centre: pending and delivered notices, acknowledging,
// clearing and removing them, and the admin-only test notice.

const { nowISO } = require("../utils/timestamps");

function attachNotificationRoutes(app, deps) {
  const {
    db,
    auth,
    adminOnly,
    getUserByEmail,
    insertNotification,
    sendEventToUser,
  } = deps;

  const getPendingNotificationsForUser = db.prepare(`
    SELECT id, sender_user_id, type, note_id, note_title, sender_name,
           variant, message, persistent, icon, created_at
    FROM notifications
    WHERE recipient_user_id = ? AND delivered_at IS NULL
    ORDER BY created_at ASC
  `);
  const getHistoryNotificationsForUser = db.prepare(`
    SELECT id, sender_user_id, type, note_id, note_title, sender_name,
           variant, message, persistent, icon, created_at, delivered_at
    FROM notifications
    WHERE recipient_user_id = ? AND delivered_at IS NOT NULL
    ORDER BY delivered_at DESC
    LIMIT 100
  `);
  const markNotificationDelivered = db.prepare(`
    UPDATE notifications
    SET delivered_at = ?
    WHERE id = ? AND recipient_user_id = ? AND delivered_at IS NULL
  `);

  // Pending = not yet shown to the user on any device. The client fetches
  // these right after auth and shows a toast for each, then marks them
  // delivered. Live notifications also flow over SSE; the client marks
  // those delivered immediately so a quick reload doesn't replay them.
  app.get("/api/notifications/pending", auth, (req, res) => {
    const rows = getPendingNotificationsForUser.all(req.user.id) || [];
    res.json({ notifications: rows });
  });

  // Delivered notifications: used to populate the history panel on any
  // device at login time so every session sees the same notification
  // history regardless of which device originally received each item.
  // Returns the 100 most-recently-delivered rows (newest-first).
  app.get("/api/notifications/history", auth, (req, res) => {
    const rows = getHistoryNotificationsForUser.all(req.user.id) || [];
    res.json({ notifications: rows });
  });

  app.post("/api/notifications/mark-delivered", auth, (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids required" });
    }
    const now = nowISO();
    const actuallyMarked = [];
    const tx = db.transaction((rawIds) => {
      for (const raw of rawIds) {
        const n = Number(raw);
        if (!Number.isFinite(n)) continue;
        const result = markNotificationDelivered.run(now, n, req.user.id);
        // Only broadcast ids the UPDATE actually changed (the row was
        // still pending). Re-acking an already-delivered row is a no-op
        // and shouldn't pollute the SSE channel.
        if (result.changes > 0) actuallyMarked.push(n);
      }
    });
    tx(ids);
    // Cross-device sync: tell every other tab / device this user
    // has open that these rows are no longer pending, so any active
    // card displaying them gets dismissed locally without waiting for
    // a manual reload. The originating client also receives it but
    // dismissing an already-dismissed notification is idempotent.
    if (actuallyMarked.length > 0) {
      sendEventToUser(req.user.id, {
        type: "notification_delivered",
        ids: actuallyMarked,
      });
    }
    res.json({ ok: true });
  });

  // Cross-device "Clear all": when the user wipes the notification
  // centre on one device, every other tab / device for the same user
  // should reflect that wipe without waiting for a refresh. We DELETE
  // the rows outright (both pending and already-delivered) so the
  // /history endpoint doesn't bring them back at the next reload.
  app.post("/api/notifications/clear", auth, (req, res) => {
    try {
      db.prepare(
        "DELETE FROM notifications WHERE recipient_user_id = ?",
      ).run(req.user.id);
    } catch (e) {
      console.warn("[notifications] clear DELETE failed:", e?.message);
    }
    sendEventToUser(req.user.id, { type: "notifications_cleared" });
    res.json({ ok: true });
  });

  // Per-item remove: DELETE one or more notifications from this user's
  // row in a single call. Broadcasts `notification_removed { ids }` so
  // every other connected tab / device drops the matching cards from
  // its in-memory state too. Used when the user clicks the X on a
  // single history entry in the notification centre panel.
  app.post("/api/notifications/remove", auth, (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids required" });
    }
    const removed = [];
    const stmt = db.prepare(
      "DELETE FROM notifications WHERE id = ? AND recipient_user_id = ?",
    );
    const tx = db.transaction((rawIds) => {
      for (const raw of rawIds) {
        const n = Number(raw);
        if (!Number.isFinite(n)) continue;
        const info = stmt.run(n, req.user.id);
        if (info.changes > 0) removed.push(n);
      }
    });
    try {
      tx(ids);
    } catch (e) {
      console.warn("[notifications] remove failed:", e?.message);
      return res.status(500).json({ error: "remove failed" });
    }
    if (removed.length > 0) {
      sendEventToUser(req.user.id, {
        type: "notification_removed",
        ids: removed,
      });
    }
    res.json({ ok: true, ids: removed });
  });

  // Dev/test endpoint: synthesise a notification and push it via SSE
  // the same way a real event would arrive. Admin-only because there's
  // no reason a regular user should be able to make arbitrary toasts
  // appear on their own session, and the script that drives this lives
  // outside the app (scripts/test-notification.cjs). Accepts an
  // optional `recipientEmail` so the admin can target other users.
  app.post("/api/notifications/test", auth, adminOnly, (req, res) => {
    const {
      variant = "info",
      title = null,
      message = "",
      persistent = false,
      icon = null,
      recipientEmail = null,
    } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message required" });
    }
    if (!["info", "success", "warning", "error"].includes(variant)) {
      return res.status(400).json({ error: "invalid variant" });
    }

    let recipient = req.user;
    if (recipientEmail && typeof recipientEmail === "string") {
      const found = getUserByEmail.get(recipientEmail);
      if (!found) return res.status(404).json({ error: "recipient not found" });
      recipient = found;
    }

    const createdAt = nowISO();
    // Test notifications fully serialise variant/message/persistent/icon
    // so an offline recipient sees the exact same payload on next
    // login that they would have seen live over SSE.
    const result = insertNotification.run(
      recipient.id,
      req.user.id,
      "test",
      null,
      title || "",
      req.user.name || req.user.email || "test",
      variant,
      message,
      persistent ? 1 : 0,
      icon || null,
      createdAt,
    );

    // Mirror the SSE shape the live `note_shared` path uses so the
    // client renders this with the same code, with a distinct `type`
    // so the App-level handler routes it through a generic toast
    // instead of the share-specific deduper.
    sendEventToUser(recipient.id, {
      type: "test_notification",
      notificationId: result.lastInsertRowid,
      variant,
      title: title || null,
      message,
      persistent: !!persistent,
      icon: icon || null,
      createdAt,
    });

    res.json({
      ok: true,
      notificationId: result.lastInsertRowid,
      recipient: { id: recipient.id, email: recipient.email },
    });
  });
}

module.exports = { attachNotificationRoutes };
