// server/routes/oidcRoutes.js
//
// Sign-in with an external OpenID Connect provider (Authentik, Keycloak,
// Authelia, …), configured once by an admin for the whole instance.
//
// The whole flow runs on the server; the browser only ever follows
// redirects and never sees the client secret or a provider token:
//
//   1. POST /api/auth/oidc/login     the login screen asks for a sign-in.
//      The server prepares state, nonce and PKCE verifier, keeps them in
//      memory, and answers with the provider URL to navigate to. The same
//      response sets an HttpOnly cookie that ties the attempt to this
//      browser.
//   2. The provider authenticates the person and redirects to
//      GET /api/auth/oidc/callback. openid-client exchanges the code and
//      validates the ID token. The identity (issuer + subject) is mapped
//      to a GlassKeep account, and the browser is sent back to the app
//      with a one-time ticket.
//   3. POST /api/auth/oidc/exchange  the app trades the ticket for the
//      usual GlassKeep session. From there on nothing knows OIDC was used.
//
// Why the browser cookie: without it, someone could start a sign-in with
// their own provider account and get a victim to open the callback link,
// signing the victim into the attacker's account. The state, the ticket
// and the cookie must all come from the same browser.
//
// An account is never matched on email. A known identity opens the
// account it is linked to; an unknown one creates an account when the
// admin allows it and the email is free. When an account already uses
// that email, its owner links the identity from their settings while
// signed in (POST /api/auth/oidc/link), which proves they own both.
// Admin rights never come from the provider: accounts are created as
// regular users, whatever claims or groups the token carries.

const crypto = require("crypto");
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
const MAX_ACCOUNT_NAME_LEN = 80;
const BINDING_COOKIE = "gk_oidc";
const BINDING_COOKIE_PATH = "/api/auth/oidc";
const BINDING_RE = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

function nowIso() {
  return new Date().toISOString();
}

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

function isUsable(provider) {
  return !!(provider && provider.enabled && provider.issuer && provider.client_id
    && provider.client_secret && provider.public_origin);
}

function adminView(provider) {
  if (!provider) return null;
  return {
    id: provider.id,
    displayName: provider.display_name,
    issuer: provider.issuer,
    clientId: provider.client_id,
    hasClientSecret: !!provider.client_secret,
    publicOrigin: provider.public_origin,
    callbackUrl: provider.public_origin ? callbackUrlFor(provider.public_origin) : null,
    enabled: !!provider.enabled,
    autoCreateAccounts: !!provider.auto_create_accounts,
    updatedAt: provider.updated_at,
  };
}

function publicView(provider) {
  return { id: provider.id, name: provider.display_name, origin: provider.public_origin };
}

function attachOidcRoutes(app, deps) {
  const {
    db,
    auth,
    adminOnly,
    getUserById,
    insertUser,
    isEmailTaken,
    isAdminEmail,
    sessionResponse,
    log = console,
  } = deps;
  const store = createOidcStore(db);
  const flows = createExpiringMap(FLOW_TTL_MS);
  const tickets = createExpiringMap(TICKET_TTL_MS);

  const createAccount = db.transaction((provider, identity) => {
    const name = (identity.name || identity.email.split("@")[0] || "User").slice(0, MAX_ACCOUNT_NAME_LEN);
    // An empty password hash matches no password: the account signs in
    // through its provider until someone gives it a password.
    const info = insertUser.run(name, identity.email, "", nowIso());
    const userId = Number(info.lastInsertRowid);
    store.linkIdentity({ userId, providerId: provider.id, ...identity });
    return getUserById.get(userId);
  });

  // Which account a sign-in opens, or why it opens none.
  function resolveSignIn(provider, identity) {
    const linked = store.getIdentity(identity.issuer, identity.subject);
    if (linked) {
      const user = getUserById.get(linked.user_id);
      if (!user || user.federated_origin) return { error: "oidc_failed" };
      store.touchIdentity(linked.id, identity.email);
      return { user };
    }
    if (!provider.auto_create_accounts) return { error: "oidc_no_account" };
    if (!EMAIL_RE.test(identity.email)) return { error: "oidc_email_missing" };
    // ADMIN_EMAILS promotes matching accounts at every boot, so an
    // account created here under one of those addresses would become an
    // admin on the provider's word. It has to be created and linked by
    // hand instead, like any address that is already taken.
    if (isEmailTaken(identity.email) || isAdminEmail(identity.email)) {
      return { error: "oidc_account_exists" };
    }
    try {
      return { user: createAccount(provider, identity), created: true };
    } catch (err) {
      log.warn?.(`[oidc] account creation failed: ${err.message}`);
      return { error: "oidc_account_exists" };
    }
  }

  function resolveLink(flow, identity) {
    const user = getUserById.get(flow.userId);
    if (!user) return { error: "oidc_failed" };
    const linked = store.getIdentity(identity.issuer, identity.subject);
    if (linked && linked.user_id !== user.id) return { error: "oidc_identity_in_use" };
    if (linked) store.touchIdentity(linked.id, identity.email);
    else store.linkIdentity({ userId: user.id, providerId: flow.providerId, ...identity });
    return { user };
  }

  async function startFlow(req, res, provider, purpose, userId = null) {
    try {
      const { url, state, nonce, codeVerifier } = await beginAuthorization(provider);
      const binding = bindBrowser(req, res, provider.public_origin);
      flows.put(state, { providerId: provider.id, state, nonce, codeVerifier, binding, purpose, userId });
      res.json({ authorizationUrl: url });
    } catch (err) {
      const e = asProviderError(err);
      log.warn?.(`[oidc] cannot start sign-in with ${provider.issuer}: ${e.code} ${e.detail || ""}`);
      res.status(502).json({ error: e.code });
    }
  }

  // ── Public: what the login screen offers ───────────────────────────
  app.get("/api/auth/oidc/providers", (_req, res) => {
    res.json({ providers: store.listEnabledInstanceProviders().filter(isUsable).map(publicView) });
  });

  app.post("/api/auth/oidc/login", (req, res) => {
    const provider = store.getProvider(req.body?.providerId);
    if (!isUsable(provider) || provider.owner_user_id !== null) {
      return res.status(404).json({ error: "oidc_unavailable" });
    }
    return startFlow(req, res, provider, "login");
  });

  // A signed-in user attaches a provider identity to their account. The
  // only path that joins an identity to an existing account.
  app.post("/api/auth/oidc/link", auth, (req, res) => {
    const provider = store.getProvider(req.body?.providerId);
    const reachable = provider
      && (provider.owner_user_id === null || provider.owner_user_id === req.user.id);
    if (!isUsable(provider) || !reachable) {
      return res.status(404).json({ error: "oidc_unavailable" });
    }
    return startFlow(req, res, provider, "link", req.user.id);
  });

  app.get("/api/auth/oidc/callback", async (req, res) => {
    const back = (params) => res.redirect(`/?${new URLSearchParams(params)}`);
    const flow = flows.take(req.query.state);
    if (!flow || !browserMatches(req, flow.binding)) {
      return back({ oidc_error: "oidc_expired" });
    }
    if (typeof req.query.error === "string") {
      return back({ oidc_error: req.query.error === "access_denied" ? "oidc_denied" : "oidc_failed" });
    }
    const provider = store.getProvider(flow.providerId);
    if (!isUsable(provider)) return back({ oidc_error: "oidc_unavailable" });

    let identity;
    try {
      identity = await completeAuthorization(provider, req.query, flow);
    } catch (err) {
      const cause = err?.error ? ` (${err.error})` : err?.cause?.message ? ` (${err.cause.message})` : "";
      log.warn?.(`[oidc] callback rejected for ${provider.issuer}: ${err?.code || err?.name} ${err?.message}${cause}`);
      return back({ oidc_error: "oidc_failed" });
    }

    const outcome = flow.purpose === "link"
      ? resolveLink(flow, identity)
      : resolveSignIn(provider, identity);
    if (outcome.error) {
      log.warn?.(`[oidc] ${flow.purpose} refused (${outcome.error}) for subject from ${identity.issuer}`);
      return back({ oidc_error: outcome.error });
    }
    if (flow.purpose === "link") {
      log.info?.(`[oidc] identity linked user=${outcome.user.id} provider=${provider.id}`);
      return back({ oidc_linked: "1" });
    }
    const ticket = crypto.randomBytes(32).toString("base64url");
    tickets.put(ticket, { userId: outcome.user.id, binding: flow.binding });
    log.info?.(`[oidc] sign-in user=${outcome.user.id}${outcome.created ? " (account created)" : ""}`);
    return back({ oidc_ticket: ticket });
  });

  app.post("/api/auth/oidc/exchange", (req, res) => {
    const ticket = tickets.take(req.body?.ticket);
    if (!ticket || !browserMatches(req, ticket.binding)) {
      return res.status(401).json({ error: "oidc_expired" });
    }
    const user = getUserById.get(ticket.userId);
    if (!user || user.federated_origin) return res.status(401).json({ error: "oidc_expired" });
    res.clearCookie(BINDING_COOKIE, { path: BINDING_COOKIE_PATH });
    res.json(sessionResponse(user, "login-oidc"));
  });

  // ── The signed-in user's own identities ────────────────────────────
  app.get("/api/auth/oidc/identities", auth, (req, res) => {
    const user = getUserById.get(req.user.id);
    res.json({
      identities: store.listIdentitiesForUser(req.user.id).map((i) => ({
        id: i.id,
        providerId: i.provider_id,
        providerName: i.provider_name || null,
        email: i.email || null,
        linkedAt: i.created_at,
        lastLoginAt: i.last_login_at,
      })),
      providers: store.listEnabledInstanceProviders().filter(isUsable).map(publicView),
      hasPassword: !!user?.password_hash,
    });
  });

  // Unlinking an account that has no password would leave it with no
  // way in, so it is refused until the account has one.
  app.delete("/api/auth/oidc/identities/:id", auth, (req, res) => {
    const user = getUserById.get(req.user.id);
    if (!user?.password_hash) return res.status(409).json({ error: "oidc_password_required" });
    if (!store.deleteIdentity(Number(req.params.id), req.user.id)) {
      return res.status(404).json({ error: "oidc_identity_not_found" });
    }
    res.json({ ok: true });
  });

  // ── Admin: the instance-wide provider ──────────────────────────────
  app.get("/api/admin/oidc", auth, adminOnly, (_req, res) => {
    res.json({ provider: adminView(store.getInstanceProvider()) });
  });

  app.put("/api/admin/oidc", auth, adminOnly, async (req, res) => {
    const body = req.body || {};
    const current = store.getInstanceProvider();
    const displayName = typeof body.displayName === "string"
      ? body.displayName.trim().slice(0, MAX_DISPLAY_NAME_LEN)
      : "";
    const rawIssuer = typeof body.issuer === "string" ? body.issuer.trim() : "";
    const issuer = rawIssuer ? normalizeIssuer(rawIssuer) : "";
    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const clientSecret = typeof body.clientSecret === "string" && body.clientSecret
      ? body.clientSecret
      : current?.client_secret || null;
    const publicOrigin = normalizeOrigin(body.publicOrigin);
    const enabled = body.enabled === true;
    const autoCreateAccounts = body.autoCreateAccounts !== false;

    if (issuer === null) return res.status(400).json({ error: "oidc_issuer_invalid" });
    if (!publicOrigin) return res.status(400).json({ error: "oidc_origin_invalid" });
    if (enabled && (!displayName || !issuer || !clientId || !clientSecret)) {
      return res.status(400).json({ error: "oidc_incomplete" });
    }
    // Switching on means the login screen will offer the button, so the
    // provider has to answer first.
    if (enabled) {
      try {
        await testIssuer(issuer, clientId);
      } catch (err) {
        return res.status(400).json({ error: asProviderError(err).code });
      }
    }

    const saved = store.saveInstanceProvider({
      display_name: displayName || "SSO",
      issuer,
      client_id: clientId,
      client_secret: clientSecret,
      public_origin: publicOrigin,
      enabled: enabled ? 1 : 0,
      auto_create_accounts: autoCreateAccounts ? 1 : 0,
    }, req.user.id);
    log.info?.(`[oidc] provider ${saved.id} saved by admin=${req.user.id} enabled=${enabled}`);
    res.json({ provider: adminView(saved) });
  });

  // A diagnosis rather than an action: a provider that does not answer
  // is a result to show the admin, with the details needed to fix it.
  app.post("/api/admin/oidc/test", auth, adminOnly, async (req, res) => {
    const issuer = normalizeIssuer(req.body?.issuer);
    const clientId = typeof req.body?.clientId === "string" ? req.body.clientId.trim() : "";
    if (!issuer) return res.status(400).json({ error: "oidc_issuer_invalid" });
    if (!clientId) return res.status(400).json({ error: "oidc_incomplete" });
    try {
      res.json({ ok: true, ...(await testIssuer(issuer, clientId)) });
    } catch (err) {
      const e = asProviderError(err);
      res.json({ ok: false, error: e.code, detail: e.detail, advertisedIssuer: e.advertisedIssuer || null });
    }
  });
}

module.exports = { attachOidcRoutes };
