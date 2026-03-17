import { en } from "./locales/en";
import { fr } from "./locales/fr";

function detectLanguage() {
  const lang = (navigator.language || "en").toLowerCase();
  if (lang.startsWith("fr")) return "fr";
  return "en";
}

const locale = detectLanguage();
const dict = locale === "fr" ? fr : en;

export function t(key, fallback) {
  return dict[key] ?? fallback ?? key;
}
