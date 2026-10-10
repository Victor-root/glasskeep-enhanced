// server/services/unlockGuard.js
//
// The checks every route that accepts an unlock secret without a JWT runs
// first (unlockRoutes.js, and the passkey unlock in
// passkeyUnlockRoutes.js): the secret must not cross the network in
// plain HTTP, and each client gets a bounded number of attempts.

const runtime = require("../encryption/runtimeUnlockState");

function getClientIp(req) {
  // Express's req.ip is good enough; keep a fallback so we never crash
  // the rate limiter when behind an unusual proxy setup.
  return req.ip || req.connection?.remoteAddress || "0.0.0.0";
}

function isLocalhost(req) {
  const ip = getClientIp(req);
  if (!ip) return false;
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

// Refuse unlock attempts that would send the secret over plain HTTP,
// so nobody accidentally types their passphrase across the network
// without transport encryption.
//
// Three trust paths, in order:
//   1. Localhost: the CLI script (scripts/unlock-instance.cjs) and any
//      reverse-proxy back-end on the same box come in via 127.0.0.1.
//      Loopback is always exempt.
//   2. req.secure === true: Express's view of the connection. True
//      when Node terminates TLS itself (HTTPS_ENABLED=true with a
//      cert), OR when `app.set('trust proxy', ...)` is set AND the
//      reverse proxy forwarded `X-Forwarded-Proto: https`. This is
//      the cleanest signal: when nginx is configured to send XFP, we
//      can verify the upstream scheme without taking the operator's
//      word for it.
//   3. An EXPLICIT TRUST_PROXY set by the operator. That is an assertion
//      from a person that TLS is terminated upstream, and it is honoured
//      even when the proxy forgets to forward X-Forwarded-Proto, which is
//      a common enough oversight that refusing outright would strand
//      people whose browser-to-proxy hop really is encrypted. The
//      boundary that matters is browser to proxy, which the operator owns
//      and has asserted; proxy to Node is loopback or a private network
//      where the body is no worse off than every other API call already
//      crossing it.
//
//      HTTPS_ENABLED=false used to reach the same conclusion, and no
//      longer does. install.sh always writes TRUST_PROXY explicitly, so
//      that inference only ever fired for the Docker image, which ships
//      HTTPS_ENABLED=false on its own: an operator who simply published
//      the port with nothing in front had this check switched off without
//      ever asking for it. Behind a correctly configured proxy nothing
//      changes, because path 2 already covers it.
//
// What we deliberately do NOT do: inspect raw X-Forwarded-Proto /
// X-Forwarded-Ssl / Front-End-Https headers without `trust proxy`
// being configured. Without trust proxy, any client can send those
// headers and bypass the check. Express's req.secure is the only
// trustworthy view of "did this come over HTTPS upstream".
function isSecureRequest(req) {
  // req.secure is true when Node terminated TLS itself, and also when a
  // TRUSTED hop forwarded X-Forwarded-Proto: https. Since trust is now
  // scoped to the addresses a proxy actually sits on (see server/index.js),
  // that second case is a statement from the proxy, not from the client.
  if (req.secure === true) return true;

  // What used to be here: "the operator declared a proxy, so assume https".
  // That assumption was made for the operator rather than by them. The
  // Docker image ships HTTPS_ENABLED=false, which the code read as the
  // declaration, so an operator who simply published the port with nothing
  // in front had the check silently switched off while believing it was on.
  //
  // An explicit TRUST_PROXY is different: the operator typed it. Honour it,
  // because a reverse proxy that forgets X-Forwarded-Proto is a common
  // enough misconfiguration that refusing outright would strand people whose
  // browser-to-proxy hop really is encrypted. What is no longer accepted is
  // the same conclusion drawn from a value the image set on its own.
  const declared = (process.env.TRUST_PROXY || "").trim();
  if (declared !== "" && declared !== "false") return true;

  return false;
}

function transportOk(req) {
  return isSecureRequest(req) || isLocalhost(req);
}

function setRetryAfter(res, ms) {
  if (ms > 0) res.setHeader("Retry-After", String(Math.ceil(ms / 1000)));
}

function clientIdentifier(req) {
  // Localhost requests share the same /loopback bucket on purpose: we
  // don't want an admin running the CLI to accidentally lock themselves
  // out from a separate web tab on the same host.
  return isLocalhost(req) ? "localhost" : getClientIp(req);
}

// Answers 429 and returns true when this client has used up its unlock
// attempts for the current window.
function refuseOverLimit(res, id) {
  if (!runtime.attemptOverLimit(id)) return false;
  setRetryAfter(res, 5 * 60 * 1000);
  res.status(429).json({ error: "Too many unlock attempts. Try again later." });
  return true;
}

// Small wait so we don't leak timing info on bad guesses. Combined with
// the per-IP rate limiter, this is enough friction for our threat model.
async function paceFailure(ms) {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  getClientIp,
  transportOk,
  clientIdentifier,
  refuseOverLimit,
  paceFailure,
};
