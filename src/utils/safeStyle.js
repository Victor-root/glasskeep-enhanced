// src/utils/safeStyle.js
//
// Filters the `style` attribute that survives HTML sanitization.
//
// WHY. Note content is stripped of scripts, but `style` is kept so the
// rich editor's colours, alignment and fonts render. DOMPurify does not
// look inside that attribute: a declaration like
//
//     style="background-image:url(https://someone-else.example/p.png)"
//
// goes through untouched, and the browser fetches it the moment the note
// is displayed. On a federated note that is a beacon: the author of the
// note learns the reader's IP address and the exact time they opened it.
// Nothing of the note's content leaks, but the reader does.
//
// The markdown renderer already refuses images for exactly this reason
// (see src/utils/markdown.jsx, where `img` is deliberately absent from
// the allow-list). Letting the rich editor keep an unfiltered `style`
// undid that decision by another route.
//
// THE RULE. A declaration survives only when its property is one the
// editor can actually produce, and its value cannot reach the network.
// Reaching the network always needs a function call in CSS: `url()`,
// `image-set()`, `-moz-binding`, `expression()`. Values may therefore only
// contain the handful of colour functions, and nothing else with
// parentheses. Allowing shapes rather than forbidding names means a CSS
// feature invented next year is refused by default instead of quietly
// admitted.

// Everything the Tiptap extensions in richTextSchema.js can emit:
// Color, Highlight, FontFamily, FontSize, TextAlign, Indent and
// UnderlineVariant. Nothing here can load anything.
export const ALLOWED_STYLE_PROPS = new Set([
  "color",
  "background-color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "text-align",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-color",
  "margin-inline-start",
  "margin-left",
  "white-space",
]);

// Colour functions are the only calls a value may contain.
const ALLOWED_FUNCTIONS = /^(rgb|rgba|hsl|hsla)$/i;

// Anything longer is not a real declaration from the editor.
const MAX_VALUE_LENGTH = 120;

/** True when a declaration value cannot cause the browser to fetch anything. */
export function isInertStyleValue(value) {
  const v = String(value || "").trim();
  if (!v || v.length > MAX_VALUE_LENGTH) return false;
  // Comments can hide a call from a naive reader of this code and from
  // the split below; a real declaration never needs one.
  if (v.includes("/*") || v.includes("\\") || v.includes("@")) return false;
  // Every function call in the value has to be one of the colour ones.
  for (const match of v.matchAll(/([A-Za-z-]*)\(/g)) {
    if (!ALLOWED_FUNCTIONS.test(match[1])) return false;
  }
  return true;
}

/**
 * Rewrite a `style` attribute, keeping only declarations that are both
 * expected and inert. Returns "" when nothing survives, which is the
 * caller's signal to drop the attribute entirely.
 */
export function sanitizeStyleAttribute(style) {
  const raw = String(style || "");
  if (!raw) return "";
  const kept = [];
  for (const declaration of raw.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 1) continue;
    const prop = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (!ALLOWED_STYLE_PROPS.has(prop)) continue;
    if (!isInertStyleValue(value)) continue;
    kept.push(`${prop}: ${value}`);
  }
  return kept.join("; ");
}

/**
 * Register the filter on a DOMPurify instance. Idempotent, and safe to
 * call from every module that sanitizes: the app shares one DOMPurify
 * instance, so one registration covers note content, legacy Markdown and
 * the changelog alike. Putting it here rather than in a per-caller
 * config is deliberate; a second sanitizing call site added later should
 * not have to remember this.
 */
const INSTALLED = new WeakSet();

export function installStyleGuard(purify) {
  if (!purify || INSTALLED.has(purify)) return purify;
  INSTALLED.add(purify);
  purify.addHook("afterSanitizeAttributes", (node) => {
    if (!node.getAttribute || !node.hasAttribute("style")) return;
    const cleaned = sanitizeStyleAttribute(node.getAttribute("style"));
    if (cleaned) node.setAttribute("style", cleaned);
    else node.removeAttribute("style");
  });
  return purify;
}
