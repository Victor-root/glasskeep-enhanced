// Per-user typography presets for the rich-text editor.
//
// We keep the block types (paragraph, h1, h2, h3) untouched in the ProseMirror
// schema — only their VISUAL rendering is parameterised, via CSS custom
// properties set on the document root. That way every note, every card
// preview and every modal view picks up the user's preferred look without
// needing a migration.

export const DEFAULT_TYPOGRAPHY_PRESETS = Object.freeze({
  p:  { size: "1rem",    weight: 400 },
  h1: { size: "1.5rem",  weight: 600 },
  h2: { size: "1.25rem", weight: 600 },
  h3: { size: "1.125rem",weight: 600 },
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
  return {
    p:  sanitize(input.p,  DEFAULT_TYPOGRAPHY_PRESETS.p),
    h1: sanitize(input.h1, DEFAULT_TYPOGRAPHY_PRESETS.h1),
    h2: sanitize(input.h2, DEFAULT_TYPOGRAPHY_PRESETS.h2),
    h3: sanitize(input.h3, DEFAULT_TYPOGRAPHY_PRESETS.h3),
  };
}

export function isDefaultTypography(presets) {
  const n = normalizeTypographyPresets(presets);
  return (
    n.p.size  === DEFAULT_TYPOGRAPHY_PRESETS.p.size  && n.p.weight  === DEFAULT_TYPOGRAPHY_PRESETS.p.weight &&
    n.h1.size === DEFAULT_TYPOGRAPHY_PRESETS.h1.size && n.h1.weight === DEFAULT_TYPOGRAPHY_PRESETS.h1.weight &&
    n.h2.size === DEFAULT_TYPOGRAPHY_PRESETS.h2.size && n.h2.weight === DEFAULT_TYPOGRAPHY_PRESETS.h2.weight &&
    n.h3.size === DEFAULT_TYPOGRAPHY_PRESETS.h3.size && n.h3.weight === DEFAULT_TYPOGRAPHY_PRESETS.h3.weight
  );
}

/**
 * Push the four block styles onto the document root as CSS variables.
 * CSS (globalCSS) then consumes them on both the editor and the preview /
 * view-mode markup so edit-mode and read-mode stay in sync.
 */
export function applyTypographyPresets(presets) {
  if (typeof document === "undefined") return;
  const n = normalizeTypographyPresets(presets);
  const root = document.documentElement;
  root.style.setProperty("--gk-type-p-size",   n.p.size);
  root.style.setProperty("--gk-type-p-weight", String(n.p.weight));
  root.style.setProperty("--gk-type-h1-size",   n.h1.size);
  root.style.setProperty("--gk-type-h1-weight", String(n.h1.weight));
  root.style.setProperty("--gk-type-h2-size",   n.h2.size);
  root.style.setProperty("--gk-type-h2-weight", String(n.h2.weight));
  root.style.setProperty("--gk-type-h3-size",   n.h3.size);
  root.style.setProperty("--gk-type-h3-weight", String(n.h3.weight));
}

export const TYPOGRAPHY_STORAGE_KEY = "typographyPresets";
