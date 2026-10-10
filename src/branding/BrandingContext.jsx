import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";
import { applyFavicon } from "./favicon.js";

// Instance-wide login/app branding (custom app name, logo, login
// background image + blur). Configured by an admin in the "Login page
// settings" section and served, unauthenticated, from GET /api/branding
// so the login screen can read it before any token exists.
//
// Everything is optional: when a field is empty/null the consuming
// component falls back to the bundled default, so an instance that never
// touches branding renders exactly as before.

// Default app name — the historical hard-coded wordmark. Kept in one
// place so every consumer falls back to the same string.
export const DEFAULT_APP_NAME = "Glass Keep";

const DEFAULT_BRANDING = {
  appName: "",
  logo: null,
  loginBackground: null,
  loginBackgroundColor: null,
  loginBackgroundHash: null,
  loginBackgroundBlur: 0,
  loginTheme: null,
};

// Last-known branding is cached in localStorage so a reload paints the
// correct name/logo (and favicon/tab title) on the very first render,
// instead of flashing the bundled defaults until GET /api/branding
// resolves. The login background IMAGE is never cached (it can be several
// MB — localStorage quota), but its tiny placeholders are: the image URL is
// just a versioned path, and the mean colour + BlurHash are a few bytes.
// Caching those lets the boot script repaint the right backdrop instantly
// on reload (and offline, when the service worker serves a non-injected
// index.html), then the browser-cached image loads over it.
const CACHE_KEY = "gk:branding";

function readCachedBranding() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT_BRANDING;
    const c = JSON.parse(raw);
    return {
      appName: typeof c.appName === "string" ? c.appName : "",
      logo: c.logo || null,
      loginBackground: c.loginBackground || null,
      loginBackgroundColor: c.loginBackgroundColor || null,
      loginBackgroundHash: c.loginBackgroundHash || null,
      loginBackgroundBlur: Number.isFinite(c.loginBackgroundBlur) ? c.loginBackgroundBlur : 0,
      loginTheme: typeof c.loginTheme === "string" ? c.loginTheme : null,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}

function writeCachedBranding(b) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        appName: b.appName || "",
        logo: b.logo || null,
        loginBackground: b.loginBackground || null,
        loginBackgroundColor: b.loginBackgroundColor || null,
        loginBackgroundHash: b.loginBackgroundHash || null,
        loginBackgroundBlur: b.loginBackgroundBlur || 0,
        loginTheme: b.loginTheme || null,
      }),
    );
  } catch {
    // Quota exceeded or storage disabled — caching is best-effort.
  }
}

const BrandingContext = createContext({
  branding: DEFAULT_BRANDING,
  refreshBranding: () => {},
});

// --- Document <head> branding (tab title + favicon) -------------------
// The custom app name drives the browser tab title and the custom logo
// replaces the favicon (favicon.js).
function applyDocumentTitle(appName) {
  document.title = appName || DEFAULT_APP_NAME;
}

export function BrandingProvider({ children }) {
  // Lazy init from the cache so the first render already has the right
  // branding (no flash of the default name/logo on reload).
  const [branding, setBranding] = useState(readCachedBranding);

  const refreshBranding = useCallback(async () => {
    try {
      // The background can be a multi-MB data URL, so give this fetch
      // more headroom than the 6 s default used for the small endpoints.
      const data = await api("/branding", { timeoutMs: 15000 });
      if (data && typeof data === "object") {
        const next = {
          appName: typeof data.appName === "string" ? data.appName : "",
          logo: data.logo || null,
          loginBackground: data.loginBackground || null,
          loginBackgroundColor: data.loginBackgroundColor || null,
          loginBackgroundHash: data.loginBackgroundHash || null,
          loginBackgroundBlur: Number.isFinite(data.loginBackgroundBlur)
            ? data.loginBackgroundBlur
            : 0,
          loginTheme: typeof data.loginTheme === "string" ? data.loginTheme : null,
        };
        setBranding(next);
        writeCachedBranding(next);
        // Keep the boot global in sync so AuthShell's fallback
        // (branding.loginBackground || bootBg.url) always reflects the
        // current state. Without this, removing or replacing the
        // background and then logging out would show the stale URL that
        // was server-injected at page-load time.
        if (typeof window !== "undefined") {
          window.__GK_LOGIN_BG__ = next.loginBackground
            ? { ...(window.__GK_LOGIN_BG__ || {}), url: next.loginBackground, color: next.loginBackgroundColor || null }
            : null;
        }
      }
    } catch (e) {
      // Non-fatal — the app keeps the cached / bundled default branding.
      console.error("Failed to load branding:", e);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches branding from the server; state is only set once the request resolves
    refreshBranding();
  }, [refreshBranding]);

  // Reflect the custom name/logo in the browser tab (title + favicon).
  useEffect(() => {
    applyDocumentTitle(branding.appName);
  }, [branding.appName]);
  useEffect(() => {
    applyFavicon(branding.logo);
  }, [branding.logo]);

  return (
    <BrandingContext.Provider value={{ branding, refreshBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- context hook shares the module-private BrandingContext with its provider
export function useBranding() {
  return useContext(BrandingContext);
}
