// server/routes/oidcRoutes.js
//
// Sign-in through an OpenID Connect provider (Authentik, Keycloak,
// Authelia, Pocket ID, …). The admin decides whether the instance allows
// it, and which providers count:
//
//   "admin"     only the instance's provider, set up by an admin in the
//               admin panel. Every user may link their account to it, no
//               one may declare their own.
//   "personal"  the same, and each user may also declare their own
//               provider in their settings and link to that instead.
//
// Linking happens while signed in, from the settings: the user signs in
// at the provider once (POST /api/auth/oidc/link). That round trip is the
// proof that the identity is theirs; nothing is ever joined on a matching
// email. An account holds one linked identity at most.
//
// Signing in is identifier first. The login screen sends the account's
// username or email (or the profile picked on screen), the server looks
// up the provider that account linked, and the whole flow runs on the
// server; the browser only follows redirects and never sees the client
// secret or a provider token:
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
// The Android app is the exception. Its WebView cannot run a provider's
// page (no passkeys there, and the page must stay away from the app's
// bridges), so the provider opens in the phone's browser, which does not
// share the app's cookies. The app then starts the flow with a secret of
// its own (`appSecret`), the callback sends the browser back to the app
// (ANDROID_RETURN) instead of the web app, and only that secret redeems
// the ticket. The browser may refuse to open an app without a fresh tap,
// so that return is a page with a button, which also tries on its own. It plays the cookie's part: a ticket issued for someone
// else's attempt is useless to an app that does not hold their secret.
//
// A provider never creates an account and never grants admin rights: it
// only opens the account that linked it.
//
// The pending attempts, the tickets and the browser cookie live in
// oidc/flowState.js.

const SSO_POLICIES = new Set(["admin", "personal"]);

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { t } = require("../i18n");
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
const {
  FLOW_TTL_MS,
  TICKET_TTL_MS,
  createExpiringMap,
  bindBrowser,
  browserMatches,
  appBindingOf,
  appMatches,
  forgetBrowser,
} = require("../oidc/flowState");

const MAX_DISPLAY_NAME_LEN = 40;
// The Android app's own scheme, registered by SsoReturnActivity.
const ANDROID_RETURN = "com.glasskeep.app:/oidc";

// A provider as the one configuring it sees it: never its secret.
function providerView(provider) {
  return provider ? {
    displayName: provider.display_name,
    issuer: provider.issuer,
    clientId: provider.client_id,
    publicOrigin: provider.public_origin,
    callbackUrl: callbackUrlFor(provider.public_origin),
  } : null;
}

function attachOidcRoutes(app, deps) {
  const {
    db,
    auth,
    adminOnly,
    getUserById,
    getUserByEmail,
    ssoSettings,
    signInOnHold,
    denySignIn,
    sessionResponse,
    log = console,
  } = deps;
  const store = createOidcStore(db);
  const flows = createExpiringMap(FLOW_TTL_MS);
  const tickets = createExpiringMap(TICKET_TTL_MS);

  const personalAllowed = () => ssoSettings().policy === "personal";

  // Whether `provider` may open, or be linked to, this account now: the
  // instance's for everyone, an account's own for that account only and
  // only while the policy allows personal providers.
  function usableBy(provider, userId) {
    if (!provider || !ssoSettings().allowed) return false;
    if (provider.owner_user_id == null) return true;
    return personalAllowed() && provider.owner_user_id === userId;
  }

  // Where a provider may make the server connect, by who owns it: anywhere
  // for the instance's (`null`) and an admin's, public addresses only for
  // anyone else's unless an admin allowed the local network.
  const accessFor = (ownerId) => ({
    allowPrivate: ownerId == null
      || ssoSettings().allowPrivateNetwork
      || !!getUserById.get(ownerId)?.is_admin,
  });

  const requireAllowed = (_req, res, next) => (
    ssoSettings().allowed ? next() : res.status(403).json({ error: "oidc_not_allowed" })
  );
  const requirePersonal = (_req, res, next) => (
    !ssoSettings().allowed ? res.status(403).json({ error: "oidc_not_allowed" })
      : personalAllowed() ? next() : res.status(403).json({ error: "oidc_personal_not_allowed" })
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
  const backToAndroidApp = (res, params) => {
    const lang = res.req.acceptsLanguages("en", "fr") || "en";
    const target = `${ANDROID_RETURN}?${new URLSearchParams(params)}`.replace(/&/g, "&amp;");
    res.type("html").send(`<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GlassKeep</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#f0e8ff;color:#1a1a1a}
@media (prefers-color-scheme:dark){body{background:#1a1a1a;color:#f0e8ff}}
a{padding:14px 28px;border-radius:999px;background:#4f46e5;color:#fff;font-weight:600;text-decoration:none}
</style></head>
<body><a id="back" href="${target}">${t(lang, "oidcBackToApp")}</a>
<script>location.replace(document.getElementById("back").href)</script></body></html>`);
  };

  // The provider sends the browser back to the address the configuration
  // was saved from, and the cookie tying the attempt to this browser lives
  // on the address it starts from. A mismatch can only end in an expired
  // attempt, so it is said up front.
  async function startFlow(req, res, provider, purpose, userId) {
    if (req.headers.origin && req.headers.origin !== provider.public_origin) {
      return res.status(409).json({ error: "oidc_wrong_origin" });
    }
    try {
      const { url, state, nonce, codeVerifier } = await beginAuthorization(provider, accessFor(provider.owner_user_id));
      const binding = bindBrowser(req, res, provider.public_origin);
      const appBinding = appBindingOf(req.body?.appSecret);
      flows.put(state, { providerId: provider.id, state, nonce, codeVerifier, binding, appBinding, purpose, userId });
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
    res.json({ available: ssoSettings().allowed && store.anyUsableIdentity({ personal: personalAllowed() }) });
  });

  // Identifier first. Every miss answers the same thing and costs the
  // same throttle as a wrong password, so the button cannot be used to
  // sort accounts with a provider from the rest at speed.
  app.post("/api/auth/oidc/login", safely((req, res) => {
    if (!ssoSettings().allowed) return res.status(404).json({ error: "oidc_unavailable" });
    const { email, userId } = req.body || {};
    const user = Number.isInteger(userId)
      ? getUserById.get(userId)
      : (typeof email === "string" && email.trim() ? getUserByEmail.get(email.trim()) : null);
    const candidate = user && !user.federated_origin ? user : null;
    if (signInOnHold(req, res, candidate?.id)) return;
    const identity = candidate ? store.getIdentityForUser(candidate.id) : null;
    const provider = identity ? store.getProvider(identity.provider_id) : null;
    if (!usableBy(provider, candidate?.id)) {
      return denySignIn(req, res, { accountId: candidate?.id, error: "oidc_not_configured" });
    }
    return startFlow(req, res, provider, "login", candidate.id);
  }));

  app.get("/api/auth/oidc/callback", safely(async (req, res) => {
    const flow = flows.take(req.query.state);
    res.locals.oidcReturn = flow?.appBinding ? backToAndroidApp : backToApp;
    const back = (params) => res.locals.oidcReturn(res, params);
    if (!flow || (!flow.appBinding && !browserMatches(req, flow.binding))) {
      return back({ oidc_error: "oidc_expired" });
    }
    if (typeof req.query.error === "string") {
      return back({ oidc_error: req.query.error === "access_denied" ? "oidc_denied" : "oidc_failed" });
    }
    const provider = store.getProvider(flow.providerId);
    if (!usableBy(provider, flow.userId)) {
      return back({ oidc_error: "oidc_unavailable" });
    }

    let identity;
    try {
      identity = await completeAuthorization(provider, req.query, flow, accessFor(provider.owner_user_id));
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
    tickets.put(ticket, { userId: flow.userId, providerId: provider.id, binding: flow.binding, appBinding: flow.appBinding });
    log.info?.(`[oidc] sign-in user=${flow.userId}`);
    return back({ oidc_ticket: ticket });
  }, (res) => (res.locals.oidcReturn ?? backToApp)(res, { oidc_error: "oidc_failed" })));

  app.post("/api/auth/oidc/exchange", (req, res) => {
    const ticket = tickets.take(req.body?.ticket);
    const bound = ticket?.appBinding
      ? appMatches(req.body?.appSecret, ticket.appBinding)
      : !!ticket && browserMatches(req, ticket.binding);
    if (!bound
        || !usableBy(store.getProvider(ticket.providerId), ticket.userId)) {
      return res.status(401).json({ error: "oidc_expired" });
    }
    const user = getUserById.get(ticket.userId);
    if (!user || user.federated_origin) return res.status(401).json({ error: "oidc_expired" });
    forgetBrowser(res);
    res.json(sessionResponse(user, "login-oidc"));
  });

  // ── What the settings show ─────────────────────────────────────────
  // The account's own provider, the instance's (to link to, without its
  // configuration), and the identity the account linked, if any.
  function accountView(userId) {
    const { allowed } = ssoSettings();
    const own = store.getOwnedProvider(userId);
    const instance = store.getOwnedProvider(null);
    const identity = store.getIdentityForUser(userId);
    const via = !identity ? null
      : identity.provider_id === instance?.id ? "instance"
        : identity.provider_id === own?.id ? "personal" : null;
    return {
      allowed,
      personalAllowed: personalAllowed(),
      privateNetworkAllowed: accessFor(userId).allowPrivate,
      instance: instance ? { displayName: instance.display_name, publicOrigin: instance.public_origin } : null,
      provider: providerView(own),
      identity: via ? {
        via,
        email: identity.email || null,
        linkedAt: identity.created_at,
        lastLoginAt: identity.last_login_at,
      } : null,
    };
  }

  function instanceView() {
    const instance = store.getOwnedProvider(null);
    return {
      provider: providerView(instance),
      linkedAccounts: instance ? store.countIdentitiesForProvider(instance.id) : 0,
    };
  }

  // ── Configuring a provider ─────────────────────────────────────────
  // Two places, one set of rules: an account's settings for its own
  // provider, the admin panel for the instance's. `ownerOf` says whose
  // provider a request is about (`null` for the instance's).
  function attachProviderConfig(path, { guards, writeGuards, ownerOf, view }) {
    // The secret is write-only: an empty one keeps what is stored. The
    // provider has to answer before it is saved, so no configuration that
    // cannot work is ever held.
    app.put(path, auth, ...guards, ...writeGuards, safely(async (req, res) => {
      const owner = ownerOf(req);
      const body = req.body || {};
      const current = store.getOwnedProvider(owner);
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
        await testIssuer(issuer, clientId, accessFor(owner));
      } catch (err) {
        return res.status(400).json({ error: asProviderError(err).code });
      }

      store.saveProvider(owner, {
        display_name: displayName,
        issuer,
        client_id: clientId,
        client_secret: clientSecret,
        public_origin: publicOrigin,
      });
      log.info?.(`[oidc] ${owner == null ? "instance provider" : "provider"} saved by user=${req.user.id}`);
      res.json(view(req));
    }));

    app.delete(path, auth, ...guards, (req, res) => {
      const provider = store.getOwnedProvider(ownerOf(req));
      if (provider) store.deleteProvider(provider.id);
      res.json(view(req));
    });

    // A diagnosis rather than an action: a provider that does not answer
    // is a result to show, with the details needed to fix it.
    app.post(`${path}/test`, auth, ...guards, ...writeGuards, safely(async (req, res) => {
      const issuer = normalizeIssuer(req.body?.issuer);
      const clientId = typeof req.body?.clientId === "string" ? req.body.clientId.trim() : "";
      if (!issuer) return res.status(400).json({ error: "oidc_issuer_invalid" });
      if (!clientId) return res.status(400).json({ error: "oidc_incomplete" });
      try {
        res.json({ ok: true, ...(await testIssuer(issuer, clientId, accessFor(ownerOf(req)))) });
      } catch (err) {
        const e = asProviderError(err);
        res.json({ ok: false, error: e.code, detail: e.detail, advertisedIssuer: e.advertisedIssuer || null });
      }
    }));
  }

  // ── The signed-in user's side ──────────────────────────────────────
  app.get("/api/auth/oidc/me", auth, (req, res) => res.json(accountView(req.user.id)));

  // Removing one's own provider stays possible whatever the policy.
  attachProviderConfig("/api/auth/oidc/me", {
    guards: [],
    writeGuards: [requirePersonal],
    ownerOf: (req) => req.user.id,
    view: (req) => accountView(req.user.id),
  });

  // Linking adds a way into the account, so it asks for the password, as
  // changing the password does: a stolen session alone must not be able
  // to plant its own provider identity and keep a door open after the
  // password is changed. 403, not 401: the session itself is fine.
  // `provider` says which one: the instance's or the account's own.
  app.post("/api/auth/oidc/link", auth, requireAllowed, safely((req, res) => {
    const provider = store.getOwnedProvider(req.body?.provider === "instance" ? null : req.user.id);
    if (!usableBy(provider, req.user.id)) return res.status(404).json({ error: "oidc_not_configured" });
    const user = getUserById.get(req.user.id);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!user?.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(403).json({ error: "Current password is incorrect." });
    }
    return startFlow(req, res, provider, "link", req.user.id);
  }));

  app.delete("/api/auth/oidc/me/identity", auth, (req, res) => {
    store.unlinkUser(req.user.id);
    res.json(accountView(req.user.id));
  });

  // ── The instance's provider, from the admin panel ──────────────────
  app.get("/api/admin/oidc", auth, adminOnly, (_req, res) => res.json(instanceView()));

  attachProviderConfig("/api/admin/oidc", {
    guards: [adminOnly],
    writeGuards: [requireAllowed],
    ownerOf: () => null,
    view: () => instanceView(),
  });
}

module.exports = { attachOidcRoutes, SSO_POLICIES };
