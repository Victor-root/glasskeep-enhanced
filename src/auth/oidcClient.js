// src/auth/oidcClient.js
//
// Browser side of the OpenID Connect sign-in. The server runs the whole
// flow; this module only asks it where to go, follows the redirect, and
// on the way back trades the one-time ticket for a GlassKeep session.
// See server/routes/oidcRoutes.js.

import { api } from "../utils/api";
import { t } from "../i18n";

const REDIRECT_PARAMS = ["oidc_ticket", "oidc_error", "oidc_linked"];

export async function fetchOidcProviders() {
  const data = await api("/auth/oidc/providers");
  return Array.isArray(data?.providers) ? data.providers : [];
}

// The provider sends the browser back to the address the admin saved the
// configuration from, and the cookie tying the attempt to this browser
// lives on the address it started from. Both have to be the same.
export function isOnProviderOrigin(provider) {
  return provider?.origin === window.location.origin;
}

// The Android app opens other sites in a browser tab. The provider has to
// load inside the app instead, where the cookie tying the attempt to this
// browser lives, so the app is told which URL is coming.
function goToProvider(authorizationUrl) {
  window.AndroidTheme?.beginSingleSignOn?.(authorizationUrl);
  window.location.assign(authorizationUrl);
}

export async function startOidcSignIn(providerId) {
  const { authorizationUrl } = await api("/auth/oidc/login", {
    method: "POST",
    body: { providerId },
  });
  goToProvider(authorizationUrl);
}

export async function startOidcLink(token, providerId) {
  const { authorizationUrl } = await api("/auth/oidc/link", {
    method: "POST",
    token,
    body: { providerId },
  });
  goToProvider(authorizationUrl);
}

export function exchangeOidcTicket(ticket) {
  return api("/auth/oidc/exchange", { method: "POST", body: { ticket } });
}

export function listOidcIdentities(token) {
  return api("/auth/oidc/identities", { token });
}

export function unlinkOidcIdentity(token, identityId) {
  return api(`/auth/oidc/identities/${encodeURIComponent(identityId)}`, {
    method: "DELETE",
    token,
  });
}

// What the callback left in the address bar, removed at once so a reload
// or a shared link never replays it.
export function takeOidcRedirectResult() {
  const url = new URL(window.location.href);
  const result = {
    ticket: url.searchParams.get("oidc_ticket"),
    error: url.searchParams.get("oidc_error"),
    linked: url.searchParams.get("oidc_linked") === "1",
  };
  if (REDIRECT_PARAMS.some((k) => url.searchParams.has(k))) {
    for (const k of REDIRECT_PARAMS) url.searchParams.delete(k);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  return result;
}

const ERROR_KEYS = {
  oidc_expired: "oidcErrExpired",
  oidc_denied: "oidcErrDenied",
  oidc_unavailable: "oidcErrUnavailable",
  oidc_account_exists: "oidcErrAccountExists",
  oidc_no_account: "oidcErrNoAccount",
  oidc_email_missing: "oidcErrEmailMissing",
  oidc_identity_in_use: "oidcErrIdentityInUse",
  oidc_password_required: "oidcErrPasswordRequired",
  oidc_issuer_invalid: "oidcErrIssuerInvalid",
  oidc_origin_invalid: "oidcErrOriginInvalid",
  oidc_incomplete: "oidcErrIncomplete",
  oidc_issuer_mismatch: "oidcErrIssuerMismatch",
  oidc_discovery_failed: "oidcErrDiscoveryFailed",
  oidc_jwks_failed: "oidcErrJwksFailed",
};

// A server error code, as left in the address or thrown by api() as
// err.message, turned into a sentence. Network and lock failures keep
// the message api() already localized; anything unknown is a generic
// failure rather than a raw code.
export function oidcErrorMessage(errOrCode) {
  if (errOrCode?.isNetworkError || errOrCode?.isLocked) return errOrCode.message;
  const code = typeof errOrCode === "string" ? errOrCode : errOrCode?.message;
  return t(ERROR_KEYS[code] || "oidcErrFailed");
}
