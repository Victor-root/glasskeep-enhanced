// server/routes/userSettingsRoutes.js
//
// The user's synced settings blob, live-synced to their other sessions.

function attachUserSettingsRoutes(app, deps) {
  const { db, auth, getUserById, sendEventToUser } = deps;

  const getUserSettings = db.prepare("SELECT settings_json FROM user_settings WHERE user_id = ?");
  const upsertUserSettings = db.prepare(
    `INSERT INTO user_settings (user_id, settings_json) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET settings_json = excluded.settings_json`
  );

  app.get("/api/user/settings", auth, (req, res) => {
    const row = getUserSettings.get(req.user.id);
    const settings = row ? JSON.parse(row.settings_json) : {};
    // Include language from the users table so the client can apply it at
    // boot without a separate profile fetch (cross-device language sync).
    const user = getUserById.get(req.user.id);
    if (user?.language) settings.language = user.language;
    res.json(settings);
  });

  app.patch("/api/user/settings", auth, (req, res) => {
    const incoming = req.body;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      return res.status(400).json({ error: "Invalid settings object" });
    }
    // Merge with existing settings
    const row = getUserSettings.get(req.user.id);
    const current = row ? JSON.parse(row.settings_json) : {};
    const merged = { ...current, ...incoming };
    upsertUserSettings.run(req.user.id, JSON.stringify(merged));

    // Live-sync the change to every connected session of this user.
    // originClientId lets the originating tab/device ignore its own
    // echo so the apply-on-receive doesn't trigger another PATCH back.
    const originClientId =
      req.headers["x-client-id"] || req.headers["X-Client-Id"] || null;
    sendEventToUser(req.user.id, {
      type: "user_settings_updated",
      settings: incoming,
      originClientId,
    });

    res.json(merged);
  });
}

module.exports = { attachUserSettingsRoutes };
