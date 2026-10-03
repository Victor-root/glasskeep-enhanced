// server/routes/oidcRoutes.js
//
// Sign-in through an OpenID Connect provider (Authentik, Keycloak,
// Authelia, …) that each user declares for their own account. The admin
// only decides whether the instance allows it at all.
//
// Setting it up happens while signed in, from the settings: the user
// enters their provider, then links their account by signing in there
// once (POST /api/auth/oidc/link). That round trip is the proof that the
// identity is theirs; nothing is ever joined on a matching email.
//
// Signing in is identifier first. The login screen sends the account's
// username or email (or the profile picked on screen), the server looks up the
// provider that account declared, and the whole flow runs on the server;
// the browser only follows redirects and never sees the client secret or
// a provider token:
//
//   1. POST /api/auth/oidc/login     state, nonce and PKCE verifier are
//      kept in memory, the answer is the provider URL to navigate to, and
//      an HttpOnly cookie ties the attempt to this browser.
//   2. GET  /api/auth/oidc/callback  openid-client exchanges the code and
//      validates the ID token. The identity must be the one linked to
//      that account through that provider, nothing else opens it. The
//      browser goes back to the app with a one-time ticket.
//   3. POST /api/auth/oidc/exchange  the ticket becomes the usual
//      GlassKeep session. From there on nothing knows OIDC was used.
//
// Why the browser cookie: without it, someone could start a flow and get
// a victim to open the callback link, signing the victim in as someone
// else. The state, the ticket and the cookie must come from one browser.
//
// A provider never creates an account and never grants admin rights: it
// only opens the account that linked it.

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const {
  normalizeIssuer,
  normalizeOrigin,
  callbackUrlFor,
  beginAuthorization,
  completeAuthorization,
  testIssuer,
  asProviderError,
} = require("../oidc/provider");
const { createOidcStore } = require("../oidc/store");

const FLOW_TTL_MS = 10 * 60 * 1000;
const TICKET_TTL_MS = 60 * 1000;
const MAX_PENDING = 5000;
const MAX_DISPLAY_NAME_LEN = 40;
const BINDING_COOKIE = "gk_oidc";
const BINDING_COOKIE_PATH = "/api/auth/oidc";
const BINDING_RE = /^[A-Za-z0-9_-]{43}$/;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function sameDigest(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
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
  return !!value && sameDigest(sha256(value), bindingDigest);
}

function ownerView(provider, identity) {
  return {
    provider: provider ? {
      displayName: provider.display_name,
      issuer: provider.issuer,
      clientId: provider.client_id,
      publicOrigin: provider.public_origin,
      callbackUrl: callbackUrlFor(provider.public_origin),
    } : null,
    identity: identity ? {
      email: identity.email || null,
      linkedAt: identity.created_at,
      lastLoginAt: identity.last_login_at,
    } : null,
  };
}

function attachOidcRoutes(app, deps) {
  const {
    db,
    auth,
    getUserById,
    getUserByEmail,
    isSsoAllowed,
    signInOnHold,
    denySignIn,
    sessionResponse,
    log = console,
  } = deps;
  const store = createOidcStore(db);
  const flows = createExpiringMap(FLOW_TTL_MS);
  const tickets = createExpiringMap(TICKET_TTL_MS);

  // Where a provider may make the server connect: anywhere for an
  // admin's, public addresses only for anyone else's.
  const accessForUser = (userId) => ({ allowPrivate: !!getUserById.get(userId)?.is_admin });

  const requireAllowed = (_req, res, next) => (
    isSsoAllowed() ? next() : res.status(403).json({ error: "oidc_not_allowed" })
  );

  // Express 4 does not catch a rejected promise, and an unhandled
  // rejection stops the whole server. Every async handler here goes
  // through this, so a database error mid-flow fails one request only.
  const safely = (handler, fail = (res) => res.status(500).json({ error: "oidc_failed" })) =>
    (req, res, next) => Promise.resolve(handler(req, res, next)).catch((err) => {
      log.error?.(`[oidc] ${req.method} ${req.path} failed: ${err?.message}`);
      if (!res.headersSent) fail(res);
    });
  const backToApp = (res, params) => res.redirect(`/?${new URLSearchParams(params)}`);

  // The provider sends the browser back to the address the configuration
  // was saved from, and the cookie tying the attempt to this browser lives
  // on the address it starts from. A mismatch can only end in an expired
  // attempt, so it is said up front.
  async function startFlow(req, res, provider, purpose) {
    const userId = provider.owner_user_id;
    if (req.headers.origin && req.headers.origin !== provider.public_origin) {
      return res.status(409).json({ error: "oidc_wrong_origin" });
    }
    try {
      const { url, state, nonce, codeVerifier } = await beginAuthorization(provider, accessForUser(userId));
      const binding = bindBrowser(req, res, provider.public_origin);
      flows.put(state, { providerId: provider.id, state, nonce, codeVerifier, binding, purpose, userId });
      res.json({ authorizationUrl: url });
    } catch (err) {
      const e = asProviderError(err);
      log.warn?.(`[oidc] cannot start ${purpose} for user=${userId}: ${e.code} ${e.detail || ""}`);
      res.status(502).json({ error: e.code });
    }
  }

  // The identity the provider vouched for must be the very one this
  // account linked through this provider. Linking records it; signing in
  // only checks it.
  function settleSignIn(flow, provider, identity) {
    const linked = store.getIdentity(identity.issuer, identity.subject);
    if (!linked || linked.provider_id !== provider.id || linked.user_id !== flow.userId) {
      return { error: "oidc_identity_mismatch" };
    }
    store.touchIdentity(linked.id, identity.email);
    return {};
  }

  function settleLink(flow, provider, identity) {
    const linked = store.getIdentity(identity.issuer, identity.subject);
    if (linked && linked.user_id !== flow.userId) return { error: "oidc_identity_in_use" };
    store.linkIdentity({ userId: flow.userId, providerId: provider.id, ...identity });
    return {};
  }

  // ── Public: what the login screen offers ───────────────────────────
  app.get("/api/auth/oidc/status", (_req, res) => {
    res.json({ available: isSsoAllowed() && store.anyLinkedProvider() });
  });

  // Identifier first. Every miss answers the same thing and costs the
  // same throttle as a wrong password, so the button cannot be used to
  // sort accounts with a provider from the rest at speed.
  app.post("/api/auth/oidc/login", safely((req, res) => {
    if (!isSsoAllowed()) return res.status(404).json({ error: "oidc_unavailable" });
    const { email, userId } = req.body || {};
    const user = Number.isInteger(userId)
      ? getUserById.get(userId)
      : (typeof email === "string" && email.trim() ? getUserByEmail.get(email.trim()) : null);
    const candidate = user && !user.federated_origin ? user : null;
    if (signInOnHold(req, res, candidate?.id)) return;
    const provider = candidate ? store.getProviderForUser(candidate.id) : null;
    if (!provider || !store.getIdentityForProvider(provider.id)) {
      return denySignIn(req, res, { accountId: candidate?.id, error: "oidc_not_configured" });
    }
    return startFlow(req, res, provider, "login");
  }));

  app.get("/api/auth/oidc/callback", safely(async (req, res) => {
    const back = (params) => backToApp(res, params);
    const flow = flows.take(req.query.state);
    if (!flow || !browserMatches(req, flow.binding)) {
      return back({ oidc_error: "oidc_expired" });
    }
    if (typeof req.query.error === "string") {
      return back({ oidc_error: req.query.error === "access_denied" ? "oidc_denied" : "oidc_failed" });
    }
    const provider = store.getProvider(flow.providerId);
    if (!isSsoAllowed() || !provider || provider.owner_user_id !== flow.userId) {
      return back({ oidc_error: "oidc_unavailable" });
    }

    let identity;
    try {
      identity = await completeAuthorization(provider, req.query, flow, accessForUser(flow.userId));
    } catch (err) {
      const cause = err?.error ? ` (${err.error})` : err?.cause?.message ? ` (${err.cause.message})` : "";
      log.warn?.(`[oidc] callback rejected for user=${flow.userId}: ${err?.code || err?.name} ${err?.message}${cause}`);
      return back({ oidc_error: "oidc_failed" });
    }

    const outcome = flow.purpose === "link"
      ? settleLink(flow, provider, identity)
      : settleSignIn(flow, provider, identity);
    if (outcome.error) {
      log.warn?.(`[oidc] ${flow.purpose} refused (${outcome.error}) for user=${flow.userId}`);
      return back({ oidc_error: outcome.error });
    }
    if (flow.purpose === "link") {
      log.info?.(`[oidc] identity linked user=${flow.userId}`);
      return back({ oidc_linked: "1" });
    }
    const ticket = crypto.randomBytes(32).toString("base64url");
    tickets.put(ticket, { userId: flow.userId, binding: flow.binding });
    log.info?.(`[oidc] sign-in user=${flow.userId}`);
    return back({ oidc_ticket: ticket });
  }, (res) => backToApp(res, { oidc_error: "oidc_failed" })));

  app.post("/api/auth/oidc/exchange", (req, res) => {
    const ticket = tickets.take(req.body?.ticket);
    if (!isSsoAllowed() || !ticket || !browserMatches(req, ticket.binding)) {
      return res.status(401).json({ error: "oidc_expired" });
    }
    const user = getUserById.get(ticket.userId);
    if (!user || user.federated_origin) return res.status(401).json({ error: "oidc_expired" });
    res.clearCookie(BINDING_COOKIE, { path: BINDING_COOKIE_PATH });
    res.json(sessionResponse(user, "login-oidc"));
  });

  // ── The signed-in user's own provider ──────────────────────────────
  app.get("/api/auth/oidc/me", auth, (req, res) => {
    const provider = store.getProviderForUser(req.user.id);
    const identity = provider ? store.getIdentityForProvider(provider.id) : null;
    res.json({ allowed: isSsoAllowed(), ...ownerView(provider, identity) });
  });

  // The secret is write-only: an empty one keeps what is stored. The
  // provider has to answer before it is saved, so the account never holds
  // a configuration that cannot work.
  app.put("/api/auth/oidc/me", auth, requireAllowed, safely(async (req, res) => {
    const body = req.body || {};
    const current = store.getProviderForUser(req.user.id);
    const displayName = typeof body.displayName === "string"
      ? body.displayName.trim().slice(0, MAX_DISPLAY_NAME_LEN)
      : "";
    const issuer = normalizeIssuer(body.issuer);
    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const clientSecret = typeof body.clientSecret === "string" && body.clientSecret
      ? body.clientSecret
      : current?.client_secret || "";
    const publicOrigin = normalizeOrigin(body.publicOrigin);

    if (!issuer) return res.status(400).json({ error: "oidc_issuer_invalid" });
    if (!publicOrigin) return res.status(400).json({ error: "oidc_origin_invalid" });
    if (!displayName || !clientId || !clientSecret) return res.status(400).json({ error: "oidc_incomplete" });
    try {
      await testIssuer(issuer, clientId, accessForUser(req.user.id));
    } catch (err) {
      return res.status(400).json({ error: asProviderError(err).code });
    }

    const saved = store.saveProviderForUser(req.user.id, {
      display_name: displayName,
      issuer,
      client_id: clientId,
      client_secret: clientSecret,
      public_origin: publicOrigin,
    });
    log.info?.(`[oidc] provider saved by user=${req.user.id}`);
    res.json(ownerView(saved, store.getIdentityForProvider(saved.id)));
  }));

  app.delete("/api/auth/oidc/me", auth, (req, res) => {
    const provider = store.getProviderForUser(req.user.id);
    if (provider) store.deleteProvider(provider.id);
    res.json(ownerView(null, null));
  });

  // A diagnosis rather than an action: a provider that does not answer
  // is a result to show the user, with the details needed to fix it.
  app.post("/api/auth/oidc/me/test", auth, requireAllowed, safely(async (req, res) => {
    const issuer = normalizeIssuer(req.body?.issuer);
    const clientId = typeof req.body?.clientId === "string" ? req.body.clientId.trim() : "";
    if (!issuer) return res.status(400).json({ error: "oidc_issuer_invalid" });
    if (!clientId) return res.status(400).json({ error: "oidc_incomplete" });
    try {
      res.json({ ok: true, ...(await testIssuer(issuer, clientId, accessForUser(req.user.id))) });
    } catch (err) {
      const e = asProviderError(err);
      res.json({ ok: false, error: e.code, detail: e.detail, advertisedIssuer: e.advertisedIssuer || null });
    }
  }));

  // Linking adds a way into the account, so it asks for the password, as
  // changing the password does: a stolen session alone must not be able
  // to plant its own provider identity and keep a door open after the
  // password is changed. 403, not 401: the session itself is fine.
  app.post("/api/auth/oidc/link", auth, requireAllowed, safely((req, res) => {
    const provider = store.getProviderForUser(req.user.id);
    if (!provider) return res.status(404).json({ error: "oidc_not_configured" });
    const user = getUserById.get(req.user.id);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!user?.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(403).json({ error: "Current password is incorrect." });
    }
    return startFlow(req, res, provider, "link");
  }));

  app.delete("/api/auth/oidc/me/identity", auth, (req, res) => {
    const provider = store.getProviderForUser(req.user.id);
    if (provider) store.unlinkProvider(provider.id);
    res.json(ownerView(provider, null));
  });
}

module.exports = { attachOidcRoutes };
