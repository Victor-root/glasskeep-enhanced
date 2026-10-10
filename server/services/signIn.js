// server/services/signIn.js
//
// What every sign-in route shares: one wording for every rejection, and
// the throttle that slows down password guessing (see loginThrottle.js).

const loginThrottle = require("./loginThrottle");

const INVALID_CREDENTIALS = "Invalid email or password.";
const MIN_PASSWORD_LENGTH = 6;

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || "0.0.0.0";
}

// Answers a failed sign-in: charges the throttle, waits out whatever
// penalty has accumulated, then replies. accountId is optional: an
// unknown email has no account to charge, only an address.
async function denySignIn(req, res, { accountId = null, error = INVALID_CREDENTIALS } = {}) {
  const ip = clientIp(req);
  loginThrottle.recordFailure({ ip, accountId });
  await loginThrottle.sleep(loginThrottle.penaltyMs({ ip, accountId }));
  return res.status(401).json({ error });
}

// Returns true (after answering) when the caller is on hold.
function signInOnHold(req, res, accountId = null) {
  const held = loginThrottle.blockedForSeconds({ ip: clientIp(req), accountId });
  if (held <= 0) return false;
  res.setHeader("Retry-After", String(held));
  res.status(429).json({ error: "Too many sign-in attempts. Please try again later." });
  return true;
}

module.exports = { MIN_PASSWORD_LENGTH, clientIp, denySignIn, signInOnHold };
