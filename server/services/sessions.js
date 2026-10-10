// server/services/sessions.js
//
// JSON Web Token sessions: minting, revocation through the account's
// token version, and the auth / adminOnly middlewares the protected
// routes go through.

const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config");

function createSessions({ db, getUserById }) {
  // Changing a password has to cut the sessions opened with the old one,
  // otherwise the one gesture meant to lock an intruder out leaves their
  // token working for another month. There is no token blacklist: the
  // account carries a counter, every token carries the counter it was
  // minted with, and a token whose counter has fallen behind is refused.
  // One counter per account, so one bump revokes every device at once.
  const getTokenVersionStmt = db.prepare("SELECT token_version FROM users WHERE id = ?");

  function currentTokenVersion(userId) {
    return getTokenVersionStmt.get(userId)?.token_version ?? 0;
  }

  // A token is still current when its version matches the account's, and
  // when the account still exists at all. Tokens minted before this
  // mechanism existed carry no version; they count as 0, which is the
  // default every account starts at.
  function tokenStillValid(payload) {
    const row = getTokenVersionStmt.get(payload?.uid);
    if (!row) return false;
    return (payload.tv ?? 0) === row.token_version;
  }

  function signToken(user, reason = "issue") {
    const token = jwt.sign(
      {
        uid: user.id,
        email: user.email,
        name: user.name,
        is_admin: !!user.is_admin,
        // Read from the database rather than from the row handed in: this
        // function is called from six places (password, recovery key, QR
        // pairing, passkeys, renewal, password change) and some of them
        // pass a partial row. Stamping a stale or missing version would
        // mint a token that dies at the next request, or one that outlives
        // the revocation it was supposed to respect.
        tv: currentTokenVersion(user.id),
      },
      JWT_SECRET,
      // 30-day ceiling: an actively-used session is renewed well before this
      // (see the client's sliding-renewal on focus), so this only bounds how
      // long a device can sit UNUSED before it must sign in again.
      { expiresIn: "30d" }
    );
    // ── TEMP DIAGNOSTIC (logout investigation) ─────────────────────────
    // Record every token mint with its creation time + why. Lets us watch
    // a token be born at login on a device, then get RENEWED (reason=renew)
    // on each app open, proving the 7-day window keeps sliding and is
    // never reached. Remove once the renewal fix is confirmed in the wild.
    try {
      console.log(
        `[auth-debug] token-issued reason=${reason} uid=${user.id}` +
        ` at=${new Date().toISOString()}`,
      );
    } catch { /* ignore: diagnostic only */ }
    return token;
  }

  // What a successful sign-in answers with. The client stores it as its
  // whole auth state, so every sign-in method must return the same fields.
  function sessionResponse(user, reason) {
    return {
      token: signToken(user, reason),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_admin: !!user.is_admin,
        avatar_url: user.avatar_url || null,
        language: user.language || null,
      },
      must_change_password: !!user.must_change_password,
    };
  }

  // ── TEMP DIAGNOSTIC (logout investigation) ───────────────────────────
  // Explain EVERY genuine auth failure so we can confirm whether a logout
  // is a real 7-day expiry (reason=TokenExpiredError, tokenAgeH≈168) or
  // something else (JsonWebTokenError = the JWT secret changed → bad
  // signature). Never logs the token or the secret: only its claims and
  // timing. Only fires on a present-but-invalid token (a missing token is
  // just an unauthenticated request and isn't logged). Remove once the
  // renewal fix is verified.
  function logAuthFailure(req, token, err) {
    try {
      const nowMs = Date.now();
      let claims = null;
      try { claims = jwt.decode(token); } catch { /* malformed */ }
      const iat = claims?.iat ? claims.iat * 1000 : null;
      const exp = claims?.exp ? claims.exp * 1000 : null;
      console.warn(
        `[auth-debug] 401 ${req.method} ${req.path}` +
        ` reason=${err?.name || "VERIFY_FAIL"}` +
        ` uid=${claims?.uid ?? "?"}` +
        ` tokenAgeH=${iat ? ((nowMs - iat) / 3600000).toFixed(1) : "?"}` +
        ` expiredAgoS=${exp ? ((nowMs - exp) / 1000).toFixed(0) : "?"}` +
        (err?.name === "JsonWebTokenError" ? " ⚠️SECRET-MISMATCH/BAD-SIGNATURE" : "") +
        ` serverNow=${new Date(nowMs).toISOString()}`,
      );
    } catch { /* never let diagnostics break auth */ }
  }

  // Verify a token and fill req.user, or throw. Two things are checked:
  // the signature, and whether the session behind it is still current.
  // The caller answers the same way for both, so a revoked session is
  // indistinguishable from a forged one from the outside.
  function acceptToken(req, token) {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!tokenStillValid(payload)) {
      throw Object.assign(new Error("Session revoked"), { name: "SessionRevokedError" });
    }
    req.user = {
      id: payload.uid,
      email: payload.email,
      name: payload.name,
      is_admin: !!payload.is_admin,
    };
  }

  // Lets the request through with `token`'s session, or answers 401.
  function authWithToken(req, res, next, token) {
    if (!token) return res.status(401).json({ error: "Missing token" });
    try {
      acceptToken(req, token);
      next();
    } catch (e) {
      logAuthFailure(req, token, e);
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  function auth(req, res, next) {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    return authWithToken(req, res, next, token);
  }

  // Auth that also supports token in query string for EventSource
  function authFromQueryOrHeader(req, res, next) {
    const h = req.headers.authorization || "";
    const headerToken = h.startsWith("Bearer ") ? h.slice(7) : null;
    const queryToken = req.query && typeof req.query.token === "string" ? req.query.token : null;
    return authWithToken(req, res, next, headerToken || queryToken);
  }

  // Next to auth() so the unlock routes, registered before the bulk of
  // the API, can rely on it too.
  function adminOnly(req, res, next) {
    const row = getUserById.get(req.user.id);
    if (!row || !row.is_admin) return res.status(403).json({ error: "Admin only" });
    next();
  }

  return { signToken, sessionResponse, auth, authFromQueryOrHeader, adminOnly };
}

module.exports = { createSessions };
