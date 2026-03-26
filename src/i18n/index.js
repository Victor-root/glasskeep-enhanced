import { en } from "./locales/en";
import { fr } from "./locales/fr";

function detectLanguage() {
  const lang = (navigator.language || "en").toLowerCase();
  if (lang.startsWith("fr")) return "fr";
  return "en";
}

const locale = detectLanguage();
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
