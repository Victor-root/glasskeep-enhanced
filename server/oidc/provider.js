// server/oidc/provider.js
//
// Everything that talks to an identity provider goes through here, and
// everything here goes through openid-client: discovery, the PKCE and
// nonce material, the token exchange and the validation of the ID token
// (signature against the provider's JWKS, issuer, audience, expiry,
// nonce, state). Nothing in GlassKeep parses or checks a token by hand.
//
// The flow is always Authorization Code with PKCE S256, a state and a
// nonce, whatever the provider advertises: a provider that does not know
// PKCE ignores the extra parameters, one that does gets the protection.

const oidc = require("openid-client");

const SCOPES = "openid profile email";
const HTTP_TIMEOUT_S = 10;
const CONFIG_TTL_MS = 60 * 60 * 1000;

// What an admin may type as an issuer: an http(s) URL with no
// credentials, query or fragment. The path is kept as typed, trailing
// slash included, because discovery compares it exactly with the issuer
// the provider advertises (Authentik's ends with a slash, Keycloak's
// does not).
function normalizeIssuer(input) {
  if (typeof input !== "string" || !input.trim()) return null;
  let u;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!u.hostname || u.username || u.password || u.search || u.hash) return null;
  return u.href;
}

// The GlassKeep origin the browser reaches us at, as the admin panel
// reports it from window.location.origin.
function normalizeOrigin(input) {
  if (typeof input !== "string" || !input.trim()) return null;
  let u;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!u.hostname || u.username || u.password) return null;
  return u.origin;
}

function callbackUrlFor(publicOrigin) {
  return `${publicOrigin}/api/auth/oidc/callback`;
}

// client_secret_basic is the OAuth default; client_secret_post is used
// only when the provider says it is the one it accepts. Both come from
// openid-client, this only picks between them per request.
function negotiatedClientAuth(clientSecret) {
  const basic = oidc.ClientSecretBasic(clientSecret);
  const post = oidc.ClientSecretPost(clientSecret);
  return (as, client, body, headers) => {
    const methods = as.token_endpoint_auth_methods_supported;
    const usePost = Array.isArray(methods)
      && !methods.includes("client_secret_basic")
      && methods.includes("client_secret_post");
    return (usePost ? post : basic)(as, client, body, headers);
  };
}

// openid-client trusts an ID token received straight from the token
// endpoint on the strength of TLS alone, as OIDC Core allows. GlassKeep
// also checks its signature against the provider's published keys, so a
// provider reached over plain http, or a proxy in between, cannot hand
// over a forged identity.
function discoveryOptions(issuer) {
  const execute = [oidc.enableNonRepudiationChecks];
  if (new URL(issuer).protocol === "http:") execute.push(oidc.allowInsecureRequests);
  return { timeout: HTTP_TIMEOUT_S, execute };
}

// A failure, reduced to a code the UI can translate plus the library's
// own message for the admin's diagnosis.
class OidcProviderError extends Error {
  constructor(code, detail, extra = {}) {
    super(code);
    this.code = code;
    this.detail = detail || null;
    Object.assign(this, extra);
  }
}

function asProviderError(err) {
  if (err instanceof OidcProviderError) return err;
  if (err?.code === "OAUTH_JSON_ATTRIBUTE_COMPARISON_FAILED" && err?.cause?.attribute === "issuer") {
    return new OidcProviderError("oidc_issuer_mismatch", err.message, {
      advertisedIssuer: typeof err.cause?.body?.issuer === "string" ? err.cause.body.issuer : null,
    });
  }
  return new OidcProviderError("oidc_discovery_failed", err?.cause?.message || err?.message);
}

async function discover(issuer, clientId, clientSecret) {
  try {
    return await oidc.discovery(
      new URL(issuer),
      clientId,
      undefined,
      clientSecret ? negotiatedClientAuth(clientSecret) : oidc.None(),
      discoveryOptions(issuer),
    );
  } catch (err) {
    throw asProviderError(err);
  }
}

// Discovery result per provider row, rebuilt when the row changes (its
// updated_at moves) or after an hour so key rotation and endpoint moves
// are picked up. Concurrent sign-ins share one in-flight discovery.
const configCache = new Map();

function getConfiguration(provider) {
  const cached = configCache.get(provider.id);
  if (cached && cached.version === provider.updated_at && Date.now() - cached.at < CONFIG_TTL_MS) {
    return cached.promise;
  }
  const promise = discover(provider.issuer, provider.client_id, provider.client_secret);
  const entry = { version: provider.updated_at, at: Date.now(), promise };
  configCache.set(provider.id, entry);
  promise.catch(() => {
    if (configCache.get(provider.id) === entry) configCache.delete(provider.id);
  });
  return promise;
}

// Starts a sign-in: returns the URL to send the browser to, and the
// secrets the callback will need to finish it.
async function beginAuthorization(provider) {
  const config = await getConfiguration(provider);
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrlFor(provider.public_origin),
    scope: SCOPES,
    code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: "S256",
    state,
    nonce,
  });
  return { url: url.href, state, nonce, codeVerifier };
}

// Finishes a sign-in from the callback's query string. Returns the
// validated identity. The profile claims are read from the ID token and,
// when it carries no email (Authelia's default), from the userinfo
// endpoint, whose answer openid-client checks against the same subject.
async function completeAuthorization(provider, query, { state, nonce, codeVerifier }) {
  const config = await getConfiguration(provider);
  const currentUrl = new URL(callbackUrlFor(provider.public_origin));
  for (const [k, v] of Object.entries(query || {})) {
    if (typeof v === "string") currentUrl.searchParams.set(k, v);
  }
  const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState: state,
    expectedNonce: nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  let profile = claims;
  if (!claims.email && tokens.access_token && config.serverMetadata().userinfo_endpoint) {
    const info = await oidc.fetchUserInfo(config, tokens.access_token, claims.sub);
    profile = { ...info, ...claims };
  }
  return {
    issuer: claims.iss,
    subject: claims.sub,
    email: typeof profile.email === "string" ? profile.email.trim() : "",
    name: [profile.name, profile.preferred_username, profile.nickname]
      .find((v) => typeof v === "string" && v.trim())?.trim() || "",
  };
}

// The admin panel's "Test the configuration": discovery from the issuer,
// then the signing keys, which is everything that can be checked without
// a person signing in. The client credentials are only proven by the
// first real sign-in.
async function testIssuer(issuer, clientId) {
  const config = await discover(issuer, clientId);
  const meta = config.serverMetadata();
  let keyCount = 0;
  try {
    const res = await fetch(meta.jwks_uri, { signal: AbortSignal.timeout(HTTP_TIMEOUT_S * 1000) });
    const body = await res.json();
    keyCount = Array.isArray(body?.keys) ? body.keys.length : 0;
  } catch (err) {
    throw new OidcProviderError("oidc_jwks_failed", err?.message);
  }
  if (!keyCount) throw new OidcProviderError("oidc_jwks_failed", "no signing keys published");
  const warnings = [];
  if (new URL(meta.issuer).protocol === "http:") warnings.push("issuer_not_https");
  if (!meta.supportsPKCE("S256")) warnings.push("pkce_not_advertised");
  return {
    issuer: meta.issuer,
    authorizationEndpoint: meta.authorization_endpoint,
    tokenEndpoint: meta.token_endpoint,
    userinfoEndpoint: meta.userinfo_endpoint || null,
    keyCount,
    warnings,
  };
}

module.exports = {
  normalizeIssuer,
  normalizeOrigin,
  callbackUrlFor,
  beginAuthorization,
  completeAuthorization,
  testIssuer,
  asProviderError,
};
