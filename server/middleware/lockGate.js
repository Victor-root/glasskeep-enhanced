// server/middleware/lockGate.js
//
// While at-rest encryption is enabled and the instance is still locked,
// every API call outside a short allow-list is answered with HTTP 423.
// Registered after the unlock routes and before the bulk of the API
// (see server/index.js).

const runtimeUnlock = require("../encryption/runtimeUnlockState");

const LOCK_ALLOW_PATHS = [
  /^\/api\/instance(\/|$)/,
  /^\/api\/passkeys\/login(\/|$)/,
  /^\/api\/health(\/|$)/,
  /^\/api\/admin\/login-slogan(\/|$)/,
  /^\/api\/admin\/allow-registration(\/|$)/,
  /^\/api\/login\/profiles(\/|$)/,
];

function attachLockGate(app) {
  app.use((req, res, next) => {
    if (!runtimeUnlock.isEnabled()) return next();
    if (runtimeUnlock.isUnlocked()) return next();
    if (!req.path.startsWith("/api/")) return next();
    for (const r of LOCK_ALLOW_PATHS) if (r.test(req.path)) return next();
    return res.status(423).json({
      error: "Instance is locked",
      locked: true,
      enabled: true,
    });
  });
}

module.exports = { attachLockGate };
