// server/oidc/flowState.js
//
// The state an OpenID Connect sign-in carries between its steps (see
// routes/oidcRoutes.js): the pending attempts and the one-time tickets,
// kept in memory, and the HttpOnly cookie that ties both to the browser
// they started in.

const crypto = require("crypto");
const { safeEqual } = require("../services/safeEqual");

const FLOW_TTL_MS = 10 * 60 * 1000;
const TICKET_TTL_MS = 60 * 1000;
const MAX_PENDING = 5000;
const BINDING_COOKIE = "gk_oidc";
const BINDING_COOKIE_PATH = "/api/auth/oidc";
const BINDING_RE = /^[A-Za-z0-9_-]{43}$/;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

// Pending sign-ins and tickets live in memory only: a restart simply
// asks people to click the button again. Both maps are bounded so a
// stream of anonymous requests cannot grow them without limit.
function createExpiringMap(ttlMs) {
  const entries = new Map();
  const prune = () => {
    const now = Date.now();
    for (const [key, value] of entries) {
      if (value.expiresAt <= now) entries.delete(key);
    }
    while (entries.size >= MAX_PENDING) entries.delete(entries.keys().next().value);
  };
  return {
    put(key, value) {
      prune();
      entries.set(key, { ...value, expiresAt: Date.now() + ttlMs });
    },
    // Single use: reading an entry removes it.
    take(key) {
      if (typeof key !== "string") return null;
      const value = entries.get(key);
      entries.delete(key);
      return value && value.expiresAt > Date.now() ? value : null;
    },
  };
}

function readBindingCookie(req) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === BINDING_COOKIE) {
      const value = rest.join("=");
      return BINDING_RE.test(value) ? value : null;
    }
  }
  return null;
}

// Returns the digest of this browser's binding value, setting the cookie
// when the browser does not have one yet.
function bindBrowser(req, res, publicOrigin) {
  const value = readBindingCookie(req) || crypto.randomBytes(32).toString("base64url");
  res.cookie(BINDING_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: publicOrigin.startsWith("https:"),
    path: BINDING_COOKIE_PATH,
    maxAge: FLOW_TTL_MS,
  });
  return sha256(value);
}

function browserMatches(req, bindingDigest) {
  const value = readBindingCookie(req);
  return !!value && safeEqual(sha256(value), bindingDigest);
}

// The Android app's own secret for an attempt, as stored: its digest, or
// null when the value is not one the app would send.
function appBindingOf(appSecret) {
  return typeof appSecret === "string" && BINDING_RE.test(appSecret) ? sha256(appSecret) : null;
}

// Whether the secret the app presents is the one its attempt started with.
function appMatches(appSecret, appBinding) {
  return typeof appSecret === "string" && safeEqual(sha256(appSecret), appBinding);
}

function forgetBrowser(res) {
  res.clearCookie(BINDING_COOKIE, { path: BINDING_COOKIE_PATH });
}

module.exports = {
  FLOW_TTL_MS,
  TICKET_TTL_MS,
  createExpiringMap,
  bindBrowser,
  browserMatches,
  appBindingOf,
  appMatches,
  forgetBrowser,
};
