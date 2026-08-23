import { t } from "../i18n";

/** ---------- API Helpers ---------- */
export const API_BASE = "/api";
export const AUTH_KEY = "glass-keep-auth";

// One-per-tab id used to identify the origin of a write so SSE
// broadcasts triggered by THIS tab's mutations can be ignored on the
// way back (avoids an echo-and-re-PATCH loop on the user-settings
// sync). Surfaced via getClientId() so the SSE listener can match
// against incoming events. Format is opaque.
const CLIENT_ID = `cid_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
export function getClientId() {
  return CLIENT_ID;
}

export const getAuth = () => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
  } catch (e) {
    return null;
  }
};
export const setAuth = (obj) => {
  if (obj) localStorage.setItem(AUTH_KEY, JSON.stringify(obj));
  else localStorage.removeItem(AUTH_KEY);
};
export async function api(path, { method = "GET", body, token, timeoutMs } = {}) {
  const headers = { "Content-Type": "application/json", "X-Client-Id": CLIENT_ID };
  if (token) headers.Authorization = `Bearer ${token}`;

  // Default to 6s — enough for the local-LAN note/sync endpoints. AI
  // chat requests pass an explicit, much larger timeout because real
  // model inference can easily exceed several seconds.
  const effectiveTimeout =
    typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 6000;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.status === 204) return null;
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }

    // Handle "instance locked" — the server is up, encryption is
    // enabled, but no admin has unlocked the DEK yet. The app reacts
    // by rendering the unlock screen instead of the normal UI.
    if (res.status === 423) {
      window.dispatchEvent(new CustomEvent("instance-locked"));
      const err = new Error(data?.error || t("instanceLockedTitle"));
      err.status = 423;
      err.isLocked = true;
      throw err;
    }

    // Handle token expiration (401 Unauthorized)
    //
    // A 401 only means "your session is over" when we actually presented
    // a session. Several endpoints answer 401 to say something entirely
    // different, and they are all called WITHOUT a token: the unlock
    // screen (wrong passphrase), the recovery-key form, the login form
    // (wrong password). Treating those as an expired session had two
    // consequences, both wrong: the stored credentials were wiped, so
    // mistyping the instance passphrase signed the user out of an
    // otherwise valid session; and the real reason was replaced by
    // "session expired, please log in again", which is not what
    // happened.
    //
    // So the teardown is gated on having sent a token. Without one, a
    // 401 is the endpoint's answer about the secret that was typed, and
    // it is handed to the caller untouched.
    //
    // And when the server's reason does not reach us at all — an empty
    // body, or one a proxy replaced on the way — we invent nothing. A
    // generic "an error occurred" is never the truth here, and worse, it
    // masks the calling screen's own fallback, which knows what it just
    // submitted. An empty message lets that fallback speak instead.
    if (res.status === 401) {
      if (token) {
        try {
          localStorage.removeItem(AUTH_KEY);
        } catch (e) {
          console.error("Error clearing auth:", e);
        }
        window.dispatchEvent(new CustomEvent("auth-expired"));
      }

      const err = new Error(data?.error || (token ? t("sessionExpired") : ""));
      err.status = res.status;
      err.isAuthError = true;
      throw err;
    }

    // A bodyless 502 / 503 / 504 does not come from GlassKeep: it is the
    // reverse proxy in front of it answering because the backend is down
    // or restarting. Say so plainly instead of surfacing a bare
    // "HTTP 503", and flag it like any other network failure so the sync
    // engine stops hammering a server it would otherwise consider
    // reachable, and resumes once it is back.
    //
    // Only when the response carries no error of its own: an application
    // 503 (e.g. "Push notifications are not configured") is a real,
    // deliberate answer and keeps its message.
    if ((res.status === 502 || res.status === 503 || res.status === 504) && !data?.error) {
      const err = new Error(t("serverUnreachable"));
      err.status = res.status;
      err.isNetworkError = true;
      throw err;
    }

    if (!res.ok) {
      const err = new Error(data?.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (error) {
    // Handle network errors, timeouts, etc.
    if (error.name === "AbortError") {
      const err = new Error(t("requestTimeout"));
      err.status = 408;
      err.isNetworkError = true;
      throw err;
    }

    // Re-throw auth errors as-is
    if (error.isAuthError) {
      throw error;
    }

    // Handle fetch failures (network errors, CORS, etc.)
    if (error instanceof TypeError && error.message.includes("fetch")) {
      const err = new Error(t("networkError"));
      err.status = 0;
      err.isNetworkError = true;
      throw err;
    }

    // Re-throw other errors
    throw error;
  }
}
