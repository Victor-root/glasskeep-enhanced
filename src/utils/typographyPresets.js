// Per-user typography presets for the rich-text editor.
//
// We keep the block types (paragraph, h1 .. h5) untouched in the
// ProseMirror schema — only their VISUAL rendering is parameterised, via
// CSS custom properties set on the document root. That way every note,
// every card preview and every modal view picks up the user's preferred
// look without needing a migration.
//
// Each block carries five configurable properties:
//   size       — rem string (e.g. "1.5rem")
//   weight     — CSS font-weight number (400 / 500 / 600 / 700)
//   color      — hex / rgb / "inherit"-keyword / null (null = inherit)
//   italic     — boolean (font-style: italic when true)
//   underline  — boolean (text-decoration: underline when true)

export const DEFAULT_TYPOGRAPHY_PRESETS = Object.freeze({
  // Paragraph stays neutral — user's body text keeps the ambient font / colour.
  p:  { size: "1rem",    weight: 400, color: null,       italic: false, underline: false },
  // H1 .. H5 each carry a unique visual identity so the gallery actually
  // shows DIFFERENT styles, not just different sizes.
  h1: { size: "1.75rem", weight: 800, color: "#4f46e5", italic: false, underline: false }, // indigo-600
  h2: { size: "1.35rem", weight: 700, color: "#059669", italic: false, underline: false }, // emerald-600
  h3: { size: "1.15rem", weight: 600, color: "#0284c7", italic: false, underline: true  }, // sky-600 underlined
  h4: { size: "1.05rem", weight: 600, color: "#d97706", italic: true,  underline: false }, // amber-600 italic
  h5: { size: "0.95rem", weight: 500, color: "#db2777", italic: true,  underline: true  }, // pink-600 italic+underlined
});

export const TYPOGRAPHY_SIZE_PRESETS = [
  { value: "0.875rem", label: "14" },
  { value: "1rem",     label: "16" },
  { value: "1.125rem", label: "18" },
  { value: "1.25rem",  label: "20" },
  { value: "1.5rem",   label: "24" },
  { value: "1.75rem",  label: "28" },
  { value: "2rem",     label: "32" },
  { value: "2.25rem",  label: "36" },
  { value: "2.5rem",   label: "40" },
];

export const TYPOGRAPHY_WEIGHT_PRESETS = [
  { value: 400, labelKey: "typographyWeightNormal" },
  { value: 500, labelKey: "typographyWeightMedium" },
  { value: 600, labelKey: "typographyWeightSemibold" },
  { value: 700, labelKey: "typographyWeightBold" },
];

// Swatches offered in the per-block colour picker. Kept short enough to sit
// in one row inside the settings row without wrapping.
export const TYPOGRAPHY_COLOR_PRESETS = [
  "#111827", // slate
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#10b981", // emerald
  "#0ea5e9", // sky
  "#6366f1", // indigo
  "#a855f7", // violet
  "#ec4899", // pink
];

// Keys iterated in fixed order so (normalize / apply / isDefault) always
// stay in lockstep if we ever add h6 later.
const BLOCKS = ["p", "h1", "h2", "h3", "h4", "h5"];

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgb|hsl|inherit|transparent)/;

function sanitize(value, fallback) {
  if (!value || typeof value !== "object") return { ...fallback };
  const size = typeof value.size === "string" ? value.size : fallback.size;
  const weightNum = Number(value.weight);
  const weight = Number.isFinite(weightNum) && weightNum >= 100 && weightNum <= 900
    ? weightNum
    : fallback.weight;
  // Colour: accept a valid-looking CSS colour string or the explicit null
  // (= inherit). Anything else falls back so an odd saved value can't break
  // the editor.
  let color;
  if (value.color === null) color = null;
  else if (typeof value.color === "string" && COLOR_RE.test(value.color)) color = value.color;
  else color = fallback.color;
  const italic = typeof value.italic === "boolean" ? value.italic : fallback.italic;
  const underline = typeof value.underline === "boolean" ? value.underline : fallback.underline;
  return { size, weight, color, italic, underline };
}

export function normalizeTypographyPresets(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const k of BLOCKS) {
    out[k] = sanitize(input[k], DEFAULT_TYPOGRAPHY_PRESETS[k]);
  }
  return out;
}

export function isDefaultTypography(presets) {
  const n = normalizeTypographyPresets(presets);
  return BLOCKS.every((k) => {
    const a = n[k];
    const b = DEFAULT_TYPOGRAPHY_PRESETS[k];
    return (
      a.size === b.size &&
      a.weight === b.weight &&
      a.color === b.color &&
      a.italic === b.italic &&
      a.underline === b.underline
    );
  });
}

/**
 * Push each block style onto the document root as CSS variables.
 * CSS (globalCSS) then consumes them on both the editor and the preview /
 * view-mode markup so edit-mode and read-mode stay in sync.
 */
export function applyTypographyPresets(presets) {
  if (typeof document === "undefined") return;
  const n = normalizeTypographyPresets(presets);
  const root = document.documentElement;
  for (const k of BLOCKS) {
    const p = n[k];
    root.style.setProperty(`--gk-type-${k}-size`,      p.size);
    root.style.setProperty(`--gk-type-${k}-weight`,    String(p.weight));
    // `inherit` keyword means "use the surrounding note-content colour"
    // — effectively a sentinel for "no explicit colour".
    root.style.setProperty(`--gk-type-${k}-color`,     p.color || "inherit");
    root.style.setProperty(`--gk-type-${k}-italic`,    p.italic ? "italic" : "normal");
    root.style.setProperty(`--gk-type-${k}-underline`, p.underline ? "underline" : "none");
  }
}

export const TYPOGRAPHY_STORAGE_KEY = "typographyPresets";
