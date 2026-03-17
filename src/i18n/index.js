import { en } from "./locales/en";
import { fr } from "./locales/fr";

function detectLanguage() {
  // Server-injected default (set via DEFAULT_LANG env var at install time)
  const serverLang = (typeof window !== "undefined" && window.__GLASSKEEP_LANG) || "";
  const lang = (serverLang || navigator.language || "en").toLowerCase();
  if (lang.startsWith("fr")) return "fr";
  return "en";
}

const locale = detectLanguage();
const dict = locale === "fr" ? fr : en;

export function t(key, fallback) {
  return dict[key] ?? fallback ?? key;
}
