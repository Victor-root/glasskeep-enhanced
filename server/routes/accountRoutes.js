// server/routes/accountRoutes.js
//
// The signed-in account: its avatar, a fresh copy of its profile, and
// the renewal of its session token.

function attachAccountRoutes(app, deps) {
  const {
    db,
    auth,
    getUserById,
    sendEventToUser,
    signToken,
    pushProfileToPeers,
  } = deps;

  // ---------- Profile Avatar & Visibility ----------
  // Upload / replace avatar (authenticated)
  app.put("/api/user/avatar", auth, (req, res) => {
    const { avatar_url } = req.body || {};
    if (!avatar_url || typeof avatar_url !== "string") {
      return res.status(400).json({ error: "avatar_url is required (data URL)." });
    }
    // Accept only image/png, image/jpeg, image/webp data URLs
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(avatar_url)) {
      return res.status(400).json({ error: "avatar_url must be a valid image data URL (png, jpeg or webp)." });
    }
    // Limit to ~1.5MB base64 data URL (~2MB decoded)
    if (avatar_url.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: "Avatar image too large (max ~1.5MB)." });
    }
    db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(avatar_url, req.user.id);
    pushProfileToPeers(req.user.id, avatar_url);
    sendEventToUser(req.user.id, {
      type: "user_profile_updated",
      profile: { avatar_url },
      originClientId: req.headers["x-client-id"] || req.headers["X-Client-Id"] || null,
    });
    res.json({ ok: true, avatar_url });
  });

  // Delete avatar (authenticated)
  app.delete("/api/user/avatar", auth, (req, res) => {
    db.prepare("UPDATE users SET avatar_url = NULL WHERE id = ?").run(req.user.id);
    pushProfileToPeers(req.user.id, null);
    sendEventToUser(req.user.id, {
      type: "user_profile_updated",
      profile: { avatar_url: null },
      originClientId: req.headers["x-client-id"] || req.headers["X-Client-Id"] || null,
    });
    res.json({ ok: true });
  });

  // Current user's profile, fresh from the DB. The client caches the user
  // object from login in localStorage and otherwise never re-reads it, so a
  // profile change made on ANOTHER device (e.g. a new avatar) never showed
  // up here. The client calls this on boot/focus to refresh its cache.
  app.get("/api/user/me", auth, (req, res) => {
    const u = getUserById.get(req.user.id);
    if (!u) return res.status(404).json({ error: "User not found" });
    res.json({
      id: u.id,
      name: u.name,
      email: u.email,
      is_admin: !!u.is_admin,
      avatar_url: u.avatar_url || null,
      language: u.language || null,
    });
  });

  // Re-issue a fresh 7-day JWT for an already-authenticated session.
  // The client calls this proactively when the current token is older than
  // 24h, so the 7-day expiry cliff is never hit in practice as long as
  // the user opens the app at least once a week.
  app.get("/api/auth/renew", auth, (req, res) => {
    const user = getUserById.get(req.user.id);
    if (!user || user.federated_origin) return res.status(401).json({ error: "No account found." });
    const token = signToken(user, "renew");
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        is_admin: !!user.is_admin,
        avatar_url: user.avatar_url || null,
        language: user.language || null,
      },
    });
  });
}

module.exports = { attachAccountRoutes };
