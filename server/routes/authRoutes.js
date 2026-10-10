// server/routes/authRoutes.js
//
// Account requests and the password / recovery-key sign-ins, plus the
// public list of profiles shown on the login screen.

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const loginThrottle = require("../services/loginThrottle");
const { MIN_PASSWORD_LENGTH, clientIp, denySignIn, signInOnHold } = require("../services/signIn");
const { nowISO } = require("../utils/timestamps");

// ---------- Secret Key (Recovery) ----------
function generateSecretKey(bytes = 32) {
  const buf = crypto.randomBytes(bytes);
  try {
    return buf.toString("base64url");
  } catch {
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
}

function attachAuthRoutes(app, deps) {
  const {
    db,
    auth,
    getUserById,
    getUserByEmail,
    insertNotification,
    sendEventToUser,
    signToken,
    getAdminSettings,
  } = deps;

  // Sign-in answers must not leak whether an email is registered, neither
  // through the wording nor through the time taken. A miss therefore
  // spends a bcrypt comparison against a throwaway hash, exactly like a
  // hit does, and every rejection carries the same sentence.
  const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(24).toString("hex"), 10);

  const getPendingByEmail = db.prepare("SELECT * FROM pending_users WHERE lower(email)=lower(?)");
  const insertPendingUser = db.prepare(
    "INSERT INTO pending_users (name,email,password_hash,created_at) VALUES (?,?,?,?)"
  );

  app.post("/api/register", (req, res) => {
    // Check if new account creation is allowed
    if (!getAdminSettings().allowNewAccounts) {
      return res.status(403).json({ error: "New account creation is currently disabled." });
    }

    const { name, email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required." });
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH)
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    if (getUserByEmail.get(email))
      return res.status(409).json({ error: "Email already registered." });
    if (getPendingByEmail.get(email))
      return res.status(409).json({ error: "A registration request for this email is already pending." });

    const hash = bcrypt.hashSync(password, 10);
    const info = insertPendingUser.run(name?.trim() || "User", email.trim(), hash, nowISO());

    // Persist a notification row per admin AND deliver the live SSE event
    // each with its own row id, so the recipient's client can ack /
    // remove the right row when the admin acts. Stored values:
    //   - sender_user_id = recipient's own id (the row has no human
    //     sender: the schema requires sender_user_id NOT NULL so we
    //     self-reference; the client reads sender_name, not the FK).
    //   - note_id        = NULL (note_id has a FK to notes(id) so we
    //     can't reuse it for a pending_users id; the pendingId lives
    //     in `message` instead, which is free for this type since the
    //     body is rendered client-side from sender_name + note_title).
    //   - note_title     = registrant email (rendered in the message)
    //   - sender_name    = registrant name (rendered in the message)
    //   - message        = String(pending_users.id): target of the
    //                      approve / reject actions.
    try {
      const admins = db.prepare("SELECT id FROM users WHERE is_admin = 1").all();
      const createdAt = nowISO();
      for (const a of admins) {
        const row = insertNotification.run(
          a.id,
          a.id,
          "pending_user_registered",
          null,
          email.trim(),
          name?.trim() || "User",
          "info",
          String(info.lastInsertRowid),
          0,
          "user-clock",
          createdAt,
        );
        sendEventToUser(a.id, {
          type: "pending_user_registered",
          pendingId: info.lastInsertRowid,
          name: name?.trim() || "User",
          email: email.trim(),
          notificationId: row.lastInsertRowid,
          createdAt,
        });
      }
    } catch (e) {
      console.warn("[notifications] pending_user_registered persist failed:", e?.message);
    }

    res.status(202).json({ pending: true });
  });

  app.post("/api/login", async (req, res) => {
    const { email, password, user_id } = req.body || {};
    // Support login by user_id (profile selection) or by email (manual login)
    let user;
    if (user_id) {
      user = getUserById.get(user_id);
    } else {
      user = email ? getUserByEmail.get(email) : null;
    }
    // Federation stand-in accounts (local mirrors of a remote server's
    // users) must never authenticate: they exist only to own/participate
    // in mirrored notes, so as far as sign-in goes they are no account.
    const candidate = user && !user.federated_origin ? user : null;

    if (signInOnHold(req, res, candidate?.id)) return;

    const ok = bcrypt.compareSync(password || "", candidate?.password_hash || DUMMY_PASSWORD_HASH);
    if (!candidate || !ok) return denySignIn(req, res, { accountId: candidate?.id });

    loginThrottle.recordSuccess({ ip: clientIp(req), accountId: candidate.id });
    const token = signToken(candidate, "login-password");
    // Always include must_change_password as a boolean for parity with
    // the passkey + QR sign-in responses. Field-presence parity matters
    // because the client stores the response straight into auth state.
    const response = {
      token,
      user: { id: candidate.id, name: candidate.name, email: candidate.email, is_admin: !!candidate.is_admin, avatar_url: candidate.avatar_url || null, language: candidate.language || null },
      must_change_password: !!candidate.must_change_password,
    };
    res.json(response);
  });

  const updateSecretForUser = db.prepare(
    "UPDATE users SET secret_key_hash = ?, secret_key_created_at = ? WHERE id = ?"
  );
  const getUsersWithSecret = db.prepare(
    "SELECT id, name, email, is_admin, secret_key_hash FROM users WHERE secret_key_hash IS NOT NULL"
  );

  // Create/rotate a user's secret key
  app.post("/api/secret-key", auth, (req, res) => {
    const key = generateSecretKey(32);
    const hash = bcrypt.hashSync(key, 10);
    updateSecretForUser.run(hash, nowISO(), req.user.id);
    res.json({ key });
  });

  // Login with secret key
  // Same throttle as the password route: this one compares the submitted
  // key against every stored hash, so an unthrottled run is both a
  // guessing attempt and a way to keep the server busy.
  app.post("/api/login/secret", async (req, res) => {
    if (signInOnHold(req, res)) return;
    const { key } = req.body || {};
    if (!key || typeof key !== "string" || key.length < 16) {
      return res.status(400).json({ error: "Invalid key." });
    }
    const rows = getUsersWithSecret.all();
    for (const u of rows) {
      if (u.secret_key_hash && bcrypt.compareSync(key, u.secret_key_hash)) {
        const fullUser = getUserById.get(u.id);
        loginThrottle.recordSuccess({ ip: clientIp(req), accountId: u.id });
        const token = signToken(u, "login-secret-key");
        const response = {
          token,
          user: { id: u.id, name: u.name, email: u.email, is_admin: !!u.is_admin, avatar_url: fullUser?.avatar_url || null, language: fullUser?.language || null },
          must_change_password: !!fullUser?.must_change_password,
        };
        return res.json(response);
      }
    }
    return denySignIn(req, res, { error: "Secret key not recognized." });
  });

  // ---------- Login Profiles (public) ----------
  // Returns only visible profiles with minimal safe info for the login screen
  app.get("/api/login/profiles", (_req, res) => {
    const rows = db.prepare(
      "SELECT id, name, avatar_url FROM users WHERE show_on_login = 1 ORDER BY name ASC"
    ).all();
    res.json(rows.map((r) => ({
      id: r.id,
      name: r.name,
      avatar_url: r.avatar_url || null,
    })));
  });
}

module.exports = { attachAuthRoutes };
