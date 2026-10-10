import { t } from "../i18n";

export function trColorName(name) {
  const v = String(name || "").trim().toLowerCase();
  const map = {
    "default": "colorDefault",
    "red": "colorRed",
    "orange": "colorOrange",
    "yellow": "colorYellow",
    "green": "colorGreen",
    "teal": "colorTeal",
    "cyan": "colorCyan",
    "blue": "colorBlue",
    "dark blue": "colorDarkBlue",
    "darkblue": "colorDarkBlue",
    "indigo": "colorIndigo",
    "purple": "colorPurple",
    "deep purple": "colorDeepPurple",
    "deeppurple": "colorDeepPurple",
    "pink": "colorPink",
    "brown": "colorBrown",
    "gray": "colorGray",
    "grey": "colorGray",
    "light gray": "colorLightGray",
    "light grey": "colorLightGray",
    "dark gray": "colorDarkGray",
    "dark grey": "colorDarkGray",
    "black": "colorBlack",
    "white": "colorWhite",
    "peach": "colorPeach",
    "sage": "colorSage",
    "mint": "colorMint",
    "sky": "colorSky",
    "sand": "colorSand",
    "mauve": "colorMauve",
  };
  return map[v] ? t(map[v]) : name;
}

/** ---------- Colors ---------- */
/* Added 6 pastel boho colors + two-line picker layout via grid-cols-6 */
export const LIGHT_COLORS = {
  default: "rgba(255, 255, 255, 0.85)",
  red: "rgba(242, 139, 130, 0.85)",
  yellow: "rgba(255, 214, 51, 0.85)",
  green: "rgba(124, 233, 157, 0.85)",
  blue: "rgba(120, 180, 255, 0.85)",
  purple: "rgba(180, 160, 255, 0.85)",

  peach: "rgba(249, 160, 140, 0.85)",
  sage: "rgba(167, 205, 170, 0.85)",
  mint: "rgba(140, 225, 190, 0.85)",
  sky: "rgba(150, 210, 255, 0.85)",
  sand: "rgba(230, 200, 150, 0.85)",
  mauve: "rgba(210, 175, 218, 0.85)",
};
const DARK_COLORS = {
  default: "rgba(40, 40, 40, 0.85)",
  red: "rgba(140, 36, 36, 0.85)",
  yellow: "rgba(140, 110, 25, 0.85)",
  green: "rgba(28, 110, 58, 0.85)",
  blue: "rgba(35, 72, 165, 0.85)",
  purple: "rgba(82, 38, 140, 0.85)",

  peach: "rgba(170, 80, 62, 0.85)",
  sage: "rgba(55, 90, 65, 0.85)",
  mint: "rgba(35, 108, 82, 0.85)",
  sky: "rgba(35, 95, 145, 0.85)",
  sand: "rgba(135, 105, 60, 0.85)",
  mauve: "rgba(100, 72, 115, 0.85)",
};
export const COLOR_ORDER = [
  "default",
  "red",
  "yellow",
  "green",
  "blue",
  "purple",
  "peach",
  "sage",
  "mint",
  "sky",
  "sand",
  "mauve",
];
export const solid = (rgba) =>
  typeof rgba === "string" ? rgba.replace("0.6", "1") : rgba;
export const bgFor = (colorKey, dark) =>
  (dark ? DARK_COLORS : LIGHT_COLORS)[colorKey] ||
  (dark ? DARK_COLORS.default : LIGHT_COLORS.default);

/** ---------- Modal light boost ---------- */
export const parseRGBA = (str) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/.exec(
    str || "",
  );
  if (!m) return { r: 255, g: 255, b: 255, a: 0.85 };
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] ? +m[4] : 1 };
};
/** Convert any rgba(...) or hex string to #rrggbb */
export const toHex = (str) => {
  if (!str) return "#ffffff";
  if (str.startsWith("#")) return str.length <= 7 ? str : str.slice(0, 7);
  const { r, g, b } = parseRGBA(str);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
};
/** #rrggbb of a translucent colour laid over an opaque one. */
export const compositeOver = (top, bottom) => {
  const t = parseRGBA(top);
  const b = parseRGBA(bottom);
  const mix = (x, y) => Math.round(x * t.a + y * (1 - t.a));
  return toHex(`rgb(${mix(t.r, b.r)}, ${mix(t.g, b.g)}, ${mix(t.b, b.b)})`);
};
const mixWithWhite = (rgbaStr, whiteRatio = 0.8, outAlpha = 0.92) => {
  const { r, g, b } = parseRGBA(rgbaStr);
  const rr = Math.round(255 * whiteRatio + r * (1 - whiteRatio));
  const gg = Math.round(255 * whiteRatio + g * (1 - whiteRatio));
  const bb = Math.round(255 * whiteRatio + b * (1 - whiteRatio));
  return `rgba(${rr}, ${gg}, ${bb}, ${outAlpha})`;
};
export const modalBgFor = (colorKey, dark) => {
  const base = bgFor(colorKey, dark);
  if (dark) return base.replace(/,\s*[\d.]+\)$/, ', 1)');
  return mixWithWhite(solid(base), 0.8, 1);
};

// High-contrast accent derived from the note color. Used by the audio
// player so its play button, scrubber fill, and chrome stay visible
// against the modal background — `solid(bgFor(...))` IS the modal bg in
// dark mode, so reusing it as a button colour produced invisible UI.
//
// Strategy:
//  - default (no colour): violet, matches the rest of the app's accents.
//  - dark mode: lighten the note colour by mixing with white. Buttons sit
//    on top of a dark coloured background, so a brighter hue pops.
//  - light mode: darken the note colour by mixing with black. Buttons sit
//    on top of a pastel background, so a deeper hue pops.
export const audioAccentColor = (colorKey, dark) => {
  if (!colorKey || colorKey === "default") return dark ? "#a78bfa" : "#7c3aed";
  const base = bgFor(colorKey, dark);
  const { r, g, b } = parseRGBA(base);
  if (dark) {
    const lr = Math.min(255, Math.round(r + (255 - r) * 0.55));
    const lg = Math.min(255, Math.round(g + (255 - g) * 0.55));
    const lb = Math.min(255, Math.round(b + (255 - b) * 0.55));
    return `rgb(${lr}, ${lg}, ${lb})`;
  }
  const dr = Math.round(r * 0.45);
  const dg = Math.round(g * 0.45);
  const db = Math.round(b * 0.45);
  return `rgb(${dr}, ${dg}, ${db})`;
};

export const scrollColorsFor = (colorKey, dark) => {
  // A note with no colour of its own wears the workspace theme's scrollbar,
  // the one the rest of the app uses (mode-aware tokens, see globalCSS).
  if (!colorKey || colorKey === "default")
    return { thumb: "var(--gk-scroll-thumb)", track: "var(--gk-scroll-track)" };
  const base = solid(bgFor(colorKey, dark));
  if (dark) {
    const { r, g, b } = parseRGBA(base);
    // Lighten thumb so it stands out against the dark modal background
    const lr = Math.min(255, Math.round(r + (255 - r) * 0.45));
    const lg = Math.min(255, Math.round(g + (255 - g) * 0.45));
    const lb = Math.min(255, Math.round(b + (255 - b) * 0.45));
    return {
      thumb: `rgba(${lr},${lg},${lb},0.9)`,
      track: `rgba(${Math.min(255, Math.round(r * 0.55))},${Math.min(255, Math.round(g * 0.55))},${Math.min(255, Math.round(b * 0.55))},0.5)`,
    };
  }
  return { thumb: mixWithWhite(base, 0.1, 0.85), track: mixWithWhite(base, 0.55, 0.4) };
};
