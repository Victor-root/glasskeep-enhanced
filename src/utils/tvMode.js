// TV mode detection.
//
// The native Android wrapper plants `window.__isAndroidTV = true` on the
// WebView before React boots (see WebViewActivity.kt). We honour that
// signal first — it's authoritative.
//
// As a courtesy for users running the webapp in a browser on a TV (or
// previewing the layout in dev), we also accept a hash override
// `#tv` / `?tv=1`, and fall back to a couple of UA heuristics for
// Chromecast / Fire TV / Google TV browsers that don't go through the
// APK.
//
// All of this is read once, synchronously, before render so the first
// paint already lands on the right layout.

const STORAGE_KEY = "glass-keep-tv-mode";

function readUrlOverride() {
  try {
    const hash = String(window.location.hash || "");
    const search = String(window.location.search || "");
    if (/(^|[#&?])tv(=1|=true|$|&)/i.test(hash)) return true;
    if (/(^|[?&])tv=(1|true)\b/i.test(search)) return true;
    if (/(^|[#&?])phone(=1|=true|$|&)/i.test(hash)) return false;
  } catch { /* override unreadable — fall through to next check */ }
  return null;
}

function readUaHeuristic() {
  try {
    const ua = String(navigator.userAgent || "").toLowerCase();
    if (!ua) return false;
    // Common TV-browser user-agent fragments. Conservative on purpose —
    // we'd rather miss a TV and render the phone UI than mistakenly hide
    // editing on a tablet.
    return (
      ua.includes("android tv") ||
      ua.includes("googletv") ||
      ua.includes("google tv") ||
      ua.includes("crkey") || // Chromecast
      ua.includes("aftt") || ua.includes("afts") || ua.includes("aftm") || // Fire TV
      ua.includes("bravia") ||
      ua.includes("nvidia shield") ||
      ua.includes("smart-tv") ||
      ua.includes("smarttv")
    );
  } catch {
    return false;
  }
}

function readStoredOverride() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
  } catch { /* override unreadable — fall through to next check */ }
  return null;
}

/** Persist a manual override (used by the "exit TV mode" button so the
 *  user can fall back to the regular layout from the same device). */
export function setTvModeOverride(enabled) {
  try {
    if (enabled === null || enabled === undefined) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    }
  } catch { /* override unreadable — fall through to next check */ }
}

/** Synchronous, side-effect-free check used at module init time. */
export function detectTvMode() {
  if (typeof window === "undefined") return false;
  const stored = readStoredOverride();
  if (stored !== null) return stored;
  const urlOverride = readUrlOverride();
  if (urlOverride !== null) return urlOverride;
  if (window.__isAndroidTV === true) return true;
  return readUaHeuristic();
}
