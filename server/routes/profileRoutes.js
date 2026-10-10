// server/routes/profileRoutes.js
//
// The user's own profile preferences and password change.

const bcrypt = require("bcryptjs");

function attachProfileRoutes(app, deps) {
  const {
    db,
    auth,
    getUserById,
    sendEventToUser,
    signToken,
    closeSseClientsFor,
  } = deps;

  // Get current user profile info (authenticated)
  app.get("/api/user/profile", auth, (req, res) => {
    const user = getUserById.get(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      is_admin: !!user.is_admin,
      avatar_url: user.avatar_url || null,
      show_on_login: user.show_on_login !== 0,
      language: user.language || null,
    });
  });

  // Update profile preferences (authenticated). Currently accepts
  // show_on_login and language; both are optional so the client can patch
  // one at a time.
  app.patch("/api/user/profile", auth, (req, res) => {
    const body = req.body || {};
    const updates = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(body, "show_on_login")) {
      if (typeof body.show_on_login !== "boolean") {
        return res.status(400).json({ error: "show_on_login must be a boolean." });
      }
      updates.push("show_on_login = ?");
      params.push(body.show_on_login ? 1 : 0);
    }

    if (Object.prototype.hasOwnProperty.call(body, "language")) {
      const lang = body.language;
      if (lang !== null && lang !== "" && lang !== "fr" && lang !== "en") {
        return res.status(400).json({ error: "language must be null, \"fr\" or \"en\"." });
      }
      updates.push("language = ?");
      params.push(lang ? lang : null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No supported field provided." });
    }
    params.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...params);

    const user = getUserById.get(req.user.id);

    // Live-sync to every connected session of this user, the same way
    // /api/user/settings does: only the fields that were actually
    // patched, tagged with the originating tab so it can ignore its own
    // echo instead of re-applying (and re-broadcasting) its own write.
    const originClientId =
      req.headers["x-client-id"] || req.headers["X-Client-Id"] || null;
    const profile = {};
    if (Object.prototype.hasOwnProperty.call(body, "show_on_login")) {
      profile.show_on_login = user.show_on_login !== 0;
    }
    if (Object.prototype.hasOwnProperty.call(body, "language")) {
      profile.language = user.language || null;
    }
    sendEventToUser(req.user.id, {
      type: "user_profile_updated",
      profile,
      originClientId,
    });

    res.json({
      ok: true,
      show_on_login: user.show_on_login !== 0,
      language: user.language || null,
    });
  });

  // ---------- Change Password (authenticated, any user) ----------
  app.post("/api/user/change-password", auth, (req, res) => {
    const { current_password, new_password } = req.body || {};
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters." });
    }

    const user = getUserById.get(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    // If user must change password (first login with temp password), skip current password check
    if (!user.must_change_password) {
      if (!current_password || !bcrypt.compareSync(current_password, user.password_hash)) {
        // 403, not 401: the session is valid, and clients end it on a 401.
        return res.status(403).json({ error: "Current password is incorrect." });
      }
    }

    const hash = bcrypt.hashSync(new_password, 10);
    // Bumping the version in the same statement is what cuts the sessions
    // opened with the old password. The device asking for the change is
    // handed a fresh token below, so it stays signed in; every other one
    // stops at its next request.
    db.prepare(
      "UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?",
    ).run(hash, user.id);
    closeSseClientsFor(user.id);

    // Return a fresh token + full user object. The client REPLACES its
    // entire user state with whatever this returns (not a merge), so
    // omitting language would wipe the user's language preference from
    // session state on every password change.
    const updatedUser = getUserById.get(user.id);
    const token = signToken(updatedUser, "password-change");
    res.json({
      ok: true,
      token,
      user: { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email, is_admin: !!updatedUser.is_admin, avatar_url: updatedUser.avatar_url || null, language: updatedUser.language || null },
      must_change_password: !!updatedUser.must_change_password,
    });
  });
}

module.exports = { attachProfileRoutes };
