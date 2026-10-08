// src/auth/oidcClient.js
//
// Browser side of the OpenID Connect sign-in. An admin sets up the
// instance's provider, users link to it or, when the admin allows it,
// declare their own; the server runs the whole flow. This module only
// asks it where to go, follows the redirect, and on the way back trades
// the one-time ticket for a GlassKeep session.
// See server/routes/oidcRoutes.js.

import { api } from "../utils/api";
import { t } from "../i18n";
import { localizeServerError } from "../utils/serverErrors.js";

const REDIRECT_PARAMS = ["oidc_ticket", "oidc_error", "oidc_linked"];
const APP_SECRET_KEY = "glass-keep-oidc-app-secret";

// Whether the login screen should offer the button at all.
export async function fetchOidcAvailable() {
  const data = await api("/auth/oidc/status");
  return !!data?.available;
}

// The Android app opens the provider in the phone's browser, which does
// not share the app's cookies: the attempt is tied to a secret kept here
// instead, and the app brings the result back. See server/routes/oidcRoutes.js.
const androidApp = () => typeof window.AndroidTheme?.openSingleSignOn === "function";

function appBinding() {
  if (!androidApp()) return {};
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const appSecret = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  localStorage.setItem(APP_SECRET_KEY, appSecret);
  return { appSecret };
}

// Resolves true when the app took over (the page stays where it is),
// false when the page itself is leaving for the provider. Older Android
// apps load the provider in a WebView of their own, announced first.
function goToProvider(authorizationUrl) {
  if (androidApp()) {
    window.AndroidTheme.openSingleSignOn(authorizationUrl);
    return true;
  }
  window.AndroidTheme?.beginSingleSignOn?.(authorizationUrl);
  window.location.assign(authorizationUrl);
  return false;
}

// `who` is { email } typed on the login screen, or { userId } of the
// profile picked there.
export async function startOidcSignIn(who) {
  const { authorizationUrl } = await api("/auth/oidc/login", { method: "POST", body: { ...who, ...appBinding() } });
  return goToProvider(authorizationUrl);
}

// Linking adds a way into the account, so the server asks for the
// password first. `provider` is "instance" or "personal".
export async function startOidcLink(token, password, provider) {
  const { authorizationUrl } = await api("/auth/oidc/link", { method: "POST", token, body: { password, provider, ...appBinding() } });
  return goToProvider(authorizationUrl);
}

export function exchangeOidcTicket(ticket) {
  const appSecret = localStorage.getItem(APP_SECRET_KEY) || undefined;
  localStorage.removeItem(APP_SECRET_KEY);
  return api("/auth/oidc/exchange", { method: "POST", body: { ticket, appSecret } });
}

export function getMyOidc(token) {
  return api("/auth/oidc/me", { token });
}

export function saveMyOidc(token, body) {
  return api("/auth/oidc/me", { method: "PUT", token, timeoutMs: 30000, body });
}

export function deleteMyOidc(token) {
  return api("/auth/oidc/me", { method: "DELETE", token });
}

export function testMyOidc(token, body) {
  return api("/auth/oidc/me/test", { method: "POST", token, timeoutMs: 30000, body });
}

export function unlinkMyOidc(token) {
  return api("/auth/oidc/me/identity", { method: "DELETE", token });
}

// The instance's provider, from the admin panel.
export function getInstanceOidc(token) {
  return api("/admin/oidc", { token });
}

export function saveInstanceOidc(token, body) {
  return api("/admin/oidc", { method: "PUT", token, timeoutMs: 30000, body });
}

export function deleteInstanceOidc(token) {
  return api("/admin/oidc", { method: "DELETE", token });
}

export function testInstanceOidc(token, body) {
  return api("/admin/oidc/test", { method: "POST", token, timeoutMs: 30000, body });
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
  oidc_failed: "oidcErrFailed",
  oidc_expired: "oidcErrExpired",
  oidc_denied: "oidcErrDenied",
  oidc_unavailable: "oidcErrUnavailable",
  oidc_not_allowed: "oidcErrUnavailable",
  oidc_personal_not_allowed: "oidcErrPersonalNotAllowed",
  oidc_not_configured: "oidcErrNotConfigured",
  oidc_wrong_origin: "oidcErrWrongOrigin",
  oidc_identity_mismatch: "oidcErrIdentityMismatch",
  oidc_identity_in_use: "oidcErrIdentityInUse",
  oidc_issuer_invalid: "oidcErrIssuerInvalid",
  oidc_origin_invalid: "oidcErrOriginInvalid",
  oidc_incomplete: "oidcErrIncomplete",
  oidc_issuer_mismatch: "oidcErrIssuerMismatch",
  oidc_discovery_failed: "oidcErrDiscoveryFailed",
  oidc_jwks_failed: "oidcErrJwksFailed",
  oidc_private_forbidden: "oidcErrPrivateForbidden",
};

// A server error code, as left in the address or thrown by api() as
// err.message, turned into a sentence. Network and lock failures keep the
// message api() already localized; anything else the server says (the
// sign-in throttle, say) goes through the shared server-error mapping.
export function oidcErrorMessage(errOrCode) {
  if (errOrCode?.isNetworkError || errOrCode?.isLocked) return errOrCode.message;
  const code = typeof errOrCode === "string" ? errOrCode : errOrCode?.message;
  return ERROR_KEYS[code] ? t(ERROR_KEYS[code]) : localizeServerError(code, "oidcErrFailed");
}
