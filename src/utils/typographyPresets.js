// Per-user typography presets for the rich-text editor.
//
// We keep the block types (paragraph, h1 .. h5) untouched in the
// ProseMirror schema — only their VISUAL rendering is parameterised, via
// CSS custom properties set on the document root. That way every note,
// every card preview and every modal view picks up the user's preferred
// look without needing a migration.

export const DEFAULT_TYPOGRAPHY_PRESETS = Object.freeze({
  p:  { size: "1rem",    weight: 400 },
  h1: { size: "1.5rem",  weight: 600 },
  h2: { size: "1.25rem", weight: 600 },
  h3: { size: "1.125rem",weight: 600 },
  h4: { size: "1rem",    weight: 600 },
  h5: { size: "0.9rem",  weight: 600 },
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

// Keys iterated in fixed order so (normalize / apply / isDefault) always
// stay in lockstep if we ever add h6 later.
const BLOCKS = ["p", "h1", "h2", "h3", "h4", "h5"];

function sanitize(value, fallback) {
  if (!value || typeof value !== "object") return { ...fallback };
  const size = typeof value.size === "string" ? value.size : fallback.size;
  const weightNum = Number(value.weight);
  const weight = Number.isFinite(weightNum) && weightNum >= 100 && weightNum <= 900
    ? weightNum
    : fallback.weight;
  return { size, weight };
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
  return BLOCKS.every(
    (k) =>
      n[k].size === DEFAULT_TYPOGRAPHY_PRESETS[k].size &&
      n[k].weight === DEFAULT_TYPOGRAPHY_PRESETS[k].weight,
  );
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
    root.style.setProperty(`--gk-type-${k}-size`,   n[k].size);
    root.style.setProperty(`--gk-type-${k}-weight`, String(n[k].weight));
  }
}

export const TYPOGRAPHY_STORAGE_KEY = "typographyPresets";
