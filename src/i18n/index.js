import { en } from "./locales/en";
import { fr } from "./locales/fr";

export const SUPPORTED_LANGUAGES = ["fr", "en"];
const LANG_STORAGE_KEY = "gk:lang";

// Auto-detect language from the user's prioritized list.
// `navigator.languages` reflects the user's content-language preferences
// (e.g. Firefox's "Preferred languages" panel), which can differ from the
// browser UI language exposed by `navigator.language`. Fall back to
// `navigator.language` and then "en" if nothing usable is set.
export function detectBrowserLanguage() {
  const candidates = [];
  if (typeof navigator !== "undefined") {
    if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
    if (navigator.language) candidates.push(navigator.language);
  }
  for (const raw of candidates) {
    if (!raw) continue;
    const tag = String(raw).toLowerCase();
    if (tag.startsWith("fr")) return "fr";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

// Read the user's explicit override (set via the settings panel). Returns
// "fr" / "en" if pinned, or null when the user wants automatic detection.
export function getLanguageOverride() {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    return SUPPORTED_LANGUAGES.includes(v) ? v : null;
  } catch {
    return null;
  }
}

// Determine the effective locale used to render the app. Priority:
//   1. explicit user override stored on this device
//   2. browser/OS preferences (navigator.languages)
// The server-stored preference is only used to populate the settings
// picker — it never overrides the browser at boot. Cross-device users
// are expected to set their language on each device once.
export function detectLanguage() {
  return getLanguageOverride() || detectBrowserLanguage();
}

// Persist the user's choice locally and reload so module-level `dict`
// picks up the change. `lang` may be "fr", "en", or null/undefined for
// "automatic" (delete the override).
export function setLanguageOverride(lang) {
  try {
    if (lang && SUPPORTED_LANGUAGES.includes(lang)) {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } else {
      localStorage.removeItem(LANG_STORAGE_KEY);
    }
  } catch {}
}

// Sync server-side language preference to the local override. Returns
// true if the locale changed (caller should reload). Pass null to mean
// "automatic" on the server side.
export function syncLanguageFromServer(serverLang) {
  const normalized = SUPPORTED_LANGUAGES.includes(serverLang) ? serverLang : null;
  const currentOverride = getLanguageOverride();
  if (currentOverride === normalized) return false;
  setLanguageOverride(normalized);
  return detectLanguage() !== locale;
}

export const locale = detectLanguage();
document.documentElement.lang = locale;
const dict = locale === "fr" ? fr : en;

export function t(key, params) {
  let str = dict[key] ?? (typeof params === "string" ? params : key);
  if (params && typeof params === "object") {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}
