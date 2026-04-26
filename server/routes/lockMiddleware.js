// server/routes/lockMiddleware.js
// Express middleware that returns HTTP 423 (Locked) for routes that
// touch user data when the instance is at-rest-encryption enabled but
// not yet unlocked. The middleware is opt-in per route — the unlock
// endpoints, the lock-status endpoint, the static assets, and the
// public login-info endpoints all stay reachable so the frontend can
// render the unlock screen and an admin can recover.

const runtime = require("../encryption/runtimeUnlockState");

function requireUnlocked(req, res, next) {
  if (!runtime.isEnabled()) return next();
  if (runtime.isUnlocked()) return next();
  return res.status(423).json({
    error: "Instance is locked",
    locked: true,
    enabled: true,
  });
}

module.exports = { requireUnlocked };
