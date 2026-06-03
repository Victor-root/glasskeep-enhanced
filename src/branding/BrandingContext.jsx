import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";

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
// replaces the favicon. We capture the page's original icon links once
// so clearing the custom logo restores the bundled favicons exactly.
const ICON_SELECTOR = 'link[rel~="icon"], link[rel="apple-touch-icon"]';
const FAVICON_KEY = "gk:favicon";
let originalIconLinksHTML = null;

function applyDocumentTitle(appName) {
  document.title = appName || DEFAULT_APP_NAME;
}

function getOriginalIconLinksHTML() {
  if (originalIconLinksHTML !== null) return originalIconLinksHTML;
  // Prefer the snapshot the index.html boot script took BEFORE it may
  // have swapped in a cached custom logo — that's the only place the
  // bundled defaults still exist verbatim. Fall back to the live DOM
  // when the boot script didn't run (e.g. SSR/tests).
  if (typeof window !== "undefined" && typeof window.__GK_DEFAULT_ICONS__ === "string") {
    originalIconLinksHTML = window.__GK_DEFAULT_ICONS__;
  } else {
    originalIconLinksHTML = Array.from(document.head.querySelectorAll(ICON_SELECTOR))
      .map((l) => l.outerHTML)
      .join("");
  }
  return originalIconLinksHTML;
}

// Browsers force a favicon into a square slot, so a non-square logo gets
// flattened. We draw the logo "contain"-fitted onto a square transparent
// canvas first, keeping its aspect ratio in the tab.
function makeSquareFavicon(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const scale = Math.min(size / img.width, size / img.height);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function setIconLinks(href) {
  const head = document.head;
  head.querySelectorAll(ICON_SELECTOR).forEach((l) => l.remove());
  const icon = document.createElement("link");
  icon.rel = "icon";
  icon.href = href;
  head.appendChild(icon);
  const apple = document.createElement("link");
  apple.rel = "apple-touch-icon";
  apple.href = href;
  head.appendChild(apple);
}

async function applyFavicon(logo) {
  const head = document.head;
  const originals = getOriginalIconLinksHTML();
  if (!logo) {
    head.querySelectorAll(ICON_SELECTOR).forEach((l) => l.remove());
    if (originals) head.insertAdjacentHTML("beforeend", originals);
    try { localStorage.removeItem(FAVICON_KEY); } catch { /* ignore */ }
    return;
  }
  let favicon = logo;
  try { favicon = await makeSquareFavicon(logo); } catch { /* fall back to raw */ }
  setIconLinks(favicon);
  // Cache the square favicon so the index.html boot script can apply it
  // (already square) on the next load without recomputing.
  try { localStorage.setItem(FAVICON_KEY, favicon); } catch { /* quota */ }
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
        };
        setBranding(next);
        writeCachedBranding(next);
      }
    } catch (e) {
      // Non-fatal — the app keeps the cached / bundled default branding.
      console.error("Failed to load branding:", e);
    }
  }, []);

  useEffect(() => {
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

export function useBranding() {
  return useContext(BrandingContext);
}
