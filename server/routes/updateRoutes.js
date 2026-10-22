// server/routes/updateRoutes.js
//
// The "a new version is available" check for admins: what the update
// channel offers (services/updateChannel.js), and how many times each
// admin has been shown the notification for it.

function attachUpdateRoutes(app, { db, auth, adminOnly, updateChannel, build, log = console } = {}) {
  // Per-admin view counter for the "new version available" notification.
  // Keyed by (user_id, version) so a freshly published version starts
  // every admin's counter back at zero. Stored server-side so the cap
  // (3 displays) holds across every device the admin signs in on, not
  // just the browser that incremented the counter.
  if (db) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS update_notification_views (
          user_id INTEGER NOT NULL,
          version TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, version)
        );
      `);
    } catch (err) {
      if (log && typeof log.warn === "function") {
        log.warn("update-notification-views table init failed:", err.message);
      }
    }
  }

  const getViewCount = (userId, version) => {
    if (!db || !userId || !version) return 0;
    try {
      const row = db
        .prepare(
          `SELECT count FROM update_notification_views WHERE user_id = ? AND version = ?`,
        )
        .get(userId, version);
      return row ? Number(row.count) || 0 : 0;
    } catch {
      return 0;
    }
  };

  // `latestVersion` is what would be installed (a beta's label carries
  // its commit), else the latest stable release.
  app.get("/api/update-check", auth, adminOnly, async (req, res) => {
    const currentVersion = build.label;
    let result;
    try {
      result = await updateChannel.check();
    } catch {
      return res.json({
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: null,
        publishedAt: null,
        channel: updateChannel.getChannel(),
        notificationShownCount: 0,
        checkedAt: new Date().toISOString(),
        stale: true,
      });
    }
    const offer = result.target || result.stable;
    const latestVersion = offer?.label || null;
    return res.json({
      currentVersion,
      latestVersion,
      updateAvailable: !!result.target,
      targetKind: result.target?.kind || null,
      releaseUrl: offer?.url || null,
      publishedAt: offer?.publishedAt || null,
      channel: result.channel,
      notificationShownCount: result.target ? getViewCount(req.user && req.user.id, latestVersion) : 0,
      checkedAt: new Date(result.checkedAt).toISOString(),
      stale: result.stale,
    });
  });

  // Increment the per-admin "I have shown the update notification for
  // version X" counter. The client calls this every time it renders the
  // card; the cap (3 displays) is enforced client-side by reading
  // notificationShownCount from /update-check and skipping notify() at
  // or above the threshold. Storing the raw counter (rather than a
  // boolean "dismissed") lets future tuning of the cap reuse the same
  // table without a migration.
  app.post("/api/update-check/mark-shown", auth, adminOnly, (req, res) => {
    const userId = req.user && req.user.id;
    const version = req.body && req.body.version;
    if (!db || !userId || !version || typeof version !== "string") {
      return res.status(400).json({ error: "missing version" });
    }
    try {
      db.prepare(
        `INSERT INTO update_notification_views (user_id, version, count)
         VALUES (?, ?, 1)
         ON CONFLICT(user_id, version)
         DO UPDATE SET count = count + 1`,
      ).run(userId, version);
      const count = getViewCount(userId, version);
      return res.json({ count });
    } catch (err) {
      if (log && typeof log.warn === "function") {
        log.warn("update-check mark-shown failed:", err.message);
      }
      return res.status(500).json({ error: "internal error" });
    }
  });
}

module.exports = { attachUpdateRoutes };
