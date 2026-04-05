import { t } from "../i18n";

/** ---------- API Helpers ---------- */
export const API_BASE = "/api";
export const AUTH_KEY = "glass-keep-auth";

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
export async function api(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout (self-hosted LAN)

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

    // Handle token expiration (401 Unauthorized)
    if (res.status === 401) {
      // Clear auth from localStorage
      try {
        localStorage.removeItem(AUTH_KEY);
      } catch (e) {
        console.error("Error clearing auth:", e);
      }

      // Dispatch a custom event so the app can handle it
      window.dispatchEvent(new CustomEvent("auth-expired"));

      const err = new Error(
        data?.error || t("sessionExpired"),
      );
      err.status = res.status;
      err.isAuthError = true;
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
