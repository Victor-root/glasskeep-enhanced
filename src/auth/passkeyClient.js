// src/auth/passkeyClient.js
//
// Thin layer between @simplewebauthn/browser and the GlassKeep API.
// Owns the conventions specific to this app:
//
//   - challenges go round-trip via {options, challengeId} pairs
//   - PRF output gets serialised as base64url for the verify body
//   - browser feature detection lives here so the calling components
//     can short-circuit before opening dialogs
//
// Every call is async and throws on failure with a server-safe
// `error` message (already localized server-side via serverErrors.js
// — callers should still pass results through localizeServerError).

import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from "@simplewebauthn/browser";
import { t } from "../i18n";

// ── Android native passkey bridge ─────────────────────────────────────
//
// The native Android app injects a polyfill (see WebAuthnBridge.kt)
// that exposes `window.GlassKeepAndroidPasskey` whenever Credential
// Manager is reachable on the device. When present, we route the
// registration / authentication ceremonies through Credential Manager
// instead of @simplewebauthn/browser — the WebView's own WebAuthn
// implementation is gimped on Android and would otherwise fail with
// `NotSupportedError` no matter what the user does.
//
// The bridge produces the same WebAuthn-shaped JSON
// (RegistrationResponseJSON / AuthenticationResponseJSON) the rest of
// the client + server already speak, so callers don't need to care.
function getAndroidBridge() {
  if (typeof window === "undefined") return null;
  const b = window.GlassKeepAndroidPasskey;
  return b && b.available ? b : null;
}

async function performRegistration(optionsJSON) {
  const bridge = getAndroidBridge();
  if (bridge) {
    return await bridge.register(optionsJSON);
  }
  return await startRegistration({ optionsJSON });
}

async function performAuthentication(optionsJSON, { withPrf = false } = {}) {
  const bridge = getAndroidBridge();
  if (bridge) {
    // Credential Manager parses PRF eval bytes from the JSON directly,
    // so we forward the options untouched — preparePrfOptions() is a
    // workaround for @simplewebauthn/browser v13 and doesn't apply
    // here.
    return await bridge.authenticate(optionsJSON);
  }
  const prepared = withPrf ? preparePrfOptions(optionsJSON) : optionsJSON;
  return await startAuthentication({ optionsJSON: prepared });
}

const API = "/api";

function authHeaders(token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

// Mirror api.js's behaviour on 401: clear the cached auth and fire the
// auth-expired event so App.jsx's centralised cleanup runs once. Without
// this, a stale token sitting in localStorage would keep producing 401s
// every time the settings panel re-fetched the passkey list.
function _handleAuthExpired() {
  try { localStorage.removeItem("glass-keep-auth"); } catch {}
  try { window.dispatchEvent(new CustomEvent("auth-expired")); } catch {}
}

async function postJSON(path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (res.status === 401 && token) _handleAuthExpired();
  if (!res.ok) {
    const e = new Error((data && data.error) || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data || {};
}

async function getJSON(path, token) {
  const res = await fetch(`${API}${path}`, { headers: authHeaders(token) });
  let data = null;
  try { data = await res.json(); } catch {}
  if (res.status === 401 && token) _handleAuthExpired();
  if (!res.ok) {
    const e = new Error((data && data.error) || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data || {};
}

// Decode a base64url string to Uint8Array (browser-side only).
function base64UrlToUint8Array(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - b64.length % 4) : "";
  return Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0));
}

// @simplewebauthn/browser v13's startAuthentication just does
// `{ ...optionsJSON, challenge: decode(…) }` — it never converts
// extensions. Pass any PRF eval salt as a base64url string in the
// options JSON and it reaches navigator.credentials.get() still as a
// string, which the browser rejects ("not ArrayBuffer or ArrayBufferView").
//
// This helper converts prf.eval.first/second from base64url strings to
// Uint8Arrays in-place so that the spread inside startAuthentication
// produces the correct ArrayBufferView the WebAuthn API requires.
function preparePrfOptions(optionsJSON) {
  const eval_ = optionsJSON?.extensions?.prf?.eval;
  if (!eval_) return optionsJSON;
  const patched = { ...optionsJSON, extensions: { ...optionsJSON.extensions, prf: { ...optionsJSON.extensions.prf, eval: { ...eval_ } } } };
  const e = patched.extensions.prf.eval;
  if (typeof e.first === "string")  e.first  = base64UrlToUint8Array(e.first);
  if (typeof e.second === "string") e.second = base64UrlToUint8Array(e.second);
  return patched;
}

// Pull the PRF "first" output from the assertion's client extension
// results. Returns base64url-encoded bytes ready for the verify body
// or null if the authenticator didn't return one.
//
// @simplewebauthn/browser v13 resolves PRF output as an ArrayBuffer
// inside clientExtensionResults.prf.results.first. However, different
// platform authenticators and polyfills may hand us a Uint8Array, a
// DataView, another typed-array view, or (rarely) a base64url string.
// We normalise all cases rather than returning a false null.
function extractPrfOutput(assertion) {
  try {
    const ext = assertion.clientExtensionResults
      || (typeof assertion.getClientExtensionResults === "function"
            ? assertion.getClientExtensionResults() : null);
    if (!ext) return null;
    const first = ext.prf?.results?.first;
    if (first == null) return null;

    let bytes;
    if (first instanceof Uint8Array) {
      bytes = first;
    } else if (first instanceof ArrayBuffer) {
      bytes = new Uint8Array(first);
    } else if (ArrayBuffer.isView(first)) {
      // DataView, Int8Array, Float32Array, etc.
      bytes = new Uint8Array(first.buffer, first.byteOffset, first.byteLength);
    } else if (typeof first === "string" && first.length > 0) {
      // Rare: some environments return the PRF output already base64url-
      // encoded. Pass it through after normalising padding.
      const b64 = first.replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4 ? "=".repeat(4 - b64.length % 4) : "";
      bytes = Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0));
    } else {
      return null;
    }

    if (bytes.length === 0) return null;

    // bytes → base64url
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    return null;
  }
}

// ── Feature detection ─────────────────────────────────────────────────
export function isWebAuthnSupported() {
  if (getAndroidBridge()) return true;
  try { return browserSupportsWebAuthn(); } catch { return false; }
}

export async function isPlatformAuthenticatorAvailable() {
  if (getAndroidBridge()) return true;
  try { return await platformAuthenticatorIsAvailable(); } catch { return false; }
}

/** True when this runtime can drive WebAuthn ceremonies via the
 *  Android native passkey bridge (Credential Manager). False in regular
 *  browsers and in older app builds that predate the bridge. Used by
 *  PasskeySettingsSection to decide whether to render the management
 *  UI inside the Android WebView. */
export function hasAndroidPasskeyBridge() {
  return !!getAndroidBridge();
}

// ── User passkey list / management ────────────────────────────────────
export async function listPasskeys(token) {
  const r = await getJSON("/passkeys", token);
  return r.passkeys || [];
}

export async function renamePasskey(token, credentialId, name) {
  const res = await fetch(`${API}/passkeys/${encodeURIComponent(credentialId)}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
}

export async function deletePasskey(token, credentialId) {
  const res = await fetch(`${API}/passkeys/${encodeURIComponent(credentialId)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
}

// ── Registration ──────────────────────────────────────────────────────
//
// Returns the saved metadata so the caller (settings panel) can
// immediately reflect prfSupported in the UI without re-fetching.
export async function registerPasskey(token, label) {
  const { options, challengeId } = await postJSON("/passkeys/register/options", {}, token);
  const response = await performRegistration(options);
  const verify = await postJSON("/passkeys/register/verify", {
    response,
    challengeId,
    name: label || null,
  }, token);
  return verify; // { ok, credentialId, prfSupported, backedUp }
}

// ── Login ─────────────────────────────────────────────────────────────
//
// Returns { token, user, must_change_password } on success, mirroring
// /api/login's response shape so App.jsx's existing completeLogin
// helper can consume it unchanged. We strip the `ok` field the server
// adds — it's redundant once we got a 200 back, and leaving it on the
// payload pollutes the in-memory session object with a stray boolean
// that downstream code might read.
export async function loginWithPasskey() {
  const { options, challengeId } = await postJSON("/passkeys/login/options", {});
  const response = await performAuthentication(options);
  const verify = await postJSON("/passkeys/login/verify", { response, challengeId });
  const { ok: _ok, ...session } = verify || {};
  return session;
}

// ── Promote passkey to instance unlock ────────────────────────────────
//
// Two ceremonies in one helper:
//   1. ask the server for an authentication options blob with the PRF
//      eval extension on
//   2. drive startAuthentication() — the authenticator returns an
//      assertion AND the PRF output as an extension result
//   3. ship both to /verify so the server can wrap the live DEK
//
// If the authenticator silently dropped the PRF output (rare but
// happens with some hardware keys that advertised support but don't
// actually evaluate it), we surface a clear error rather than letting
// the server return an opaque "PRF output too short".
export async function enableInstanceUnlock(token, credentialId) {
  const { options, challengeId } = await postJSON(
    `/passkeys/${encodeURIComponent(credentialId)}/instance-unlock/options`,
    {},
    token,
  );
  const response = await performAuthentication(options, { withPrf: true });
  const prfOutput = extractPrfOutput(response);
  if (!prfOutput) {
    throw new Error(t("passkeyNoPrfOutput"));
  }
  return await postJSON(
    `/passkeys/${encodeURIComponent(credentialId)}/instance-unlock/verify`,
    { response, challengeId, prfOutput },
    token,
  );
}

// ── Test a passkey (no side-effects beyond counter update) ────────────
export async function testPasskey(token, credentialId) {
  const { options, challengeId } = await postJSON(
    `/passkeys/${encodeURIComponent(credentialId)}/test/options`,
    {},
    token,
  );
  const response = await performAuthentication(options);
  return await postJSON(
    `/passkeys/${encodeURIComponent(credentialId)}/test/verify`,
    { response, challengeId },
    token,
  );
}

export async function disableInstanceUnlock(token, credentialId) {
  return await postJSON(
    `/passkeys/${encodeURIComponent(credentialId)}/instance-unlock/disable`,
    {},
    token,
  );
}

// ── Unlock instance via passkey (no auth, returns admin session) ──────
export async function unlockInstanceWithPasskey() {
  const { options, challengeId, alreadyUnlocked } = await postJSON(
    "/instance/unlock-passkey/options",
    {},
  );
  if (alreadyUnlocked) return { alreadyUnlocked: true };
  const response = await performAuthentication(options, { withPrf: true });
  const prfOutput = extractPrfOutput(response);
  if (!prfOutput) {
    throw new Error(t("passkeyNoPrfOutput"));
  }
  const verify = await postJSON("/instance/unlock-passkey/verify", {
    response, challengeId, prfOutput,
  });
  // Strip `ok` like loginWithPasskey() does, so App.jsx's completeLogin
  // sees the same shape as the password login response.
  const { ok: _ok, ...session } = verify || {};
  return session;
}
