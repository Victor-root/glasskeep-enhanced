// server/routes/pushRoutes.js
//
// Web Push subscriptions for the PWA's system notifications.

const pushService = require("../services/pushNotifications");

function attachPushRoutes(app, deps) {
  const { db, auth } = deps;

  // The public VAPID key is needed by the browser to subscribe. It is NOT
  // a secret (it's the applicationServerKey). Returns { key: null } when
  // push isn't configured so the client can hide the toggle gracefully.
  app.get("/api/push/vapid-public-key", auth, (req, res) => {
    res.json({ key: pushService.getPublicKey() });
  });

  // Register (or refresh) this device's push subscription.
  app.post("/api/push/subscribe", auth, (req, res) => {
    if (!pushService.isConfigured()) {
      return res.status(503).json({ error: "Push notifications are not configured on this server" });
    }
    const { subscription, lang } = req.body || {};
    try {
      pushService.saveSubscription(db, req.user.id, subscription, req.headers["user-agent"], lang);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e?.message || "Invalid subscription" });
    }
  });

  // Drop this device's push subscription (toggle off / sign-out).
  app.post("/api/push/unsubscribe", auth, (req, res) => {
    const { endpoint } = req.body || {};
    pushService.removeSubscription(db, endpoint);
    res.json({ ok: true });
  });
}

module.exports = { attachPushRoutes };
