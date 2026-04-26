// Per-user typography presets for the rich-text editor.
//
// Data model: the user keeps THREE independent profiles so they can
// save several complete typography setups and switch between them
// with a tab click. Only the ACTIVE profile's values are written to
// :root as CSS variables, so swapping profiles re-renders the editor
// and the view mode with no extra plumbing.
//
//   { active: "profile1",
//     profile1: { p, h1, h2, h3, h4, h5 },
//     profile2: { … },
//     profile3: { … } }
//
// Each block carries five configurable properties:
//   size       — rem string (e.g. "1.5rem")
//   weight     — CSS font-weight number (400 / 500 / 600 / 700)
//   color      — hex / rgb / null (null = inherit)
//   italic     — boolean
//   underline  — boolean

export const DEFAULT_PROFILE = Object.freeze({
  p:  { size: "1rem",     weight: 400, color: null,      italic: false, underline: false },
  h1: { size: "1.75rem",  weight: 800, color: "#4f46e5", italic: false, underline: false },
  h2: { size: "1.5rem",   weight: 700, color: "#059669", italic: false, underline: false },
  h3: { size: "1.25rem",  weight: 600, color: "#0284c7", italic: false, underline: true  },
  h4: { size: "1.125rem", weight: 600, color: "#d97706", italic: true,  underline: false },
  h5: { size: "1rem",     weight: 500, color: "#db2777", italic: true,  underline: true  },
});

export const PROFILE_KEYS = ["profile1", "profile2", "profile3"];
export const DEFAULT_ACTIVE_PROFILE = "profile1";

export const DEFAULT_TYPOGRAPHY_PRESETS = Object.freeze({
  active: DEFAULT_ACTIVE_PROFILE,
  profile1: DEFAULT_PROFILE,
  profile2: DEFAULT_PROFILE,
  profile3: DEFAULT_PROFILE,
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

// Swatches offered in the per-block colour picker.
export const TYPOGRAPHY_COLOR_PRESETS = [
  "#111827", "#ef4444", "#f97316", "#eab308",
  "#10b981", "#0ea5e9", "#6366f1", "#a855f7",
  "#ec4899",
];

const BLOCKS = ["p", "h1", "h2", "h3", "h4", "h5"];

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgb|hsl|inherit|transparent)/;

/**
 * Snap a size string to the nearest entry in TYPOGRAPHY_SIZE_PRESETS.
 * The dropdown only offers preset values, so any stored value that
 * isn't in the list (older defaults like "1.35rem" / "1.15rem" / …)
 * would surface as the dropdown showing its first option ("14") while
 * the inline preview rendered the saved size — visually contradicting
 * itself. Snapping on read normalises old data without losing intent.
 */
function nearestPresetSize(value) {
  if (typeof value !== "string") return null;
  const m = value.match(/^([\d.]+)\s*rem$/i);
  if (!m) return null;
  const target = parseFloat(m[1]);
  if (!Number.isFinite(target)) return null;
  let best = TYPOGRAPHY_SIZE_PRESETS[0];
  let bestDiff = Math.abs(parseFloat(best.value) - target);
  for (const p of TYPOGRAPHY_SIZE_PRESETS) {
    const d = Math.abs(parseFloat(p.value) - target);
    if (d < bestDiff) { best = p; bestDiff = d; }
  }
  return best.value;
}

function sanitizeBlock(value, fallback) {
  if (!value || typeof value !== "object") return { ...fallback };
  let size = typeof value.size === "string" ? value.size : fallback.size;
  // Migrate non-preset sizes to the nearest preset entry.
  if (!TYPOGRAPHY_SIZE_PRESETS.some((s) => s.value === size)) {
    const snapped = nearestPresetSize(size);
    if (snapped) size = snapped;
  }
  const weightNum = Number(value.weight);
  const weight = Number.isFinite(weightNum) && weightNum >= 100 && weightNum <= 900
    ? weightNum
    : fallback.weight;
  let color;
  if (value.color === null) color = null;
  else if (typeof value.color === "string" && COLOR_RE.test(value.color)) color = value.color;
  else color = fallback.color;
  const italic = typeof value.italic === "boolean" ? value.italic : fallback.italic;
  const underline = typeof value.underline === "boolean" ? value.underline : fallback.underline;
  return { size, weight, color, italic, underline };
}

function sanitizeProfile(raw, fallback) {
  const input = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const k of BLOCKS) {
    out[k] = sanitizeBlock(input[k], fallback[k] || DEFAULT_PROFILE[k]);
  }
  return out;
}

export function normalizeTypographyPresets(raw) {
  const input = raw && typeof raw === "object" ? raw : {};

  // Legacy migration: old shape had the blocks at the top level
  // (no `active` key, no `profile1` key). Move them into profile1.
  const hasNewShape =
    !!input.active ||
    PROFILE_KEYS.some((k) => input[k] && typeof input[k] === "object");
  if (!hasNewShape && (input.p || input.h1 || input.h2 || input.h3 || input.h4 || input.h5)) {
    return {
      active: DEFAULT_ACTIVE_PROFILE,
      profile1: sanitizeProfile(input, DEFAULT_PROFILE),
      profile2: { ...DEFAULT_PROFILE },
      profile3: { ...DEFAULT_PROFILE },
    };
  }

  const active = PROFILE_KEYS.includes(input.active) ? input.active : DEFAULT_ACTIVE_PROFILE;
  return {
    active,
    profile1: sanitizeProfile(input.profile1, DEFAULT_PROFILE),
    profile2: sanitizeProfile(input.profile2, DEFAULT_PROFILE),
    profile3: sanitizeProfile(input.profile3, DEFAULT_PROFILE),
  };
}

/** Return the currently active profile's block map. */
export function getActiveProfile(presets) {
  const n = normalizeTypographyPresets(presets);
  return n[n.active];
}

export function isDefaultTypography(presets) {
  const n = normalizeTypographyPresets(presets);
  if (n.active !== DEFAULT_ACTIVE_PROFILE) return false;
  return PROFILE_KEYS.every((pk) =>
    BLOCKS.every((k) => {
      const a = n[pk][k];
      const b = DEFAULT_PROFILE[k];
      return (
        a.size === b.size &&
        a.weight === b.weight &&
        a.color === b.color &&
        a.italic === b.italic &&
        a.underline === b.underline
      );
    }),
  );
}

/**
 * Push the ACTIVE profile's block styles onto the document root as
 * CSS variables. Switching profiles triggers a fresh call so the UI
 * re-renders with the new look immediately.
 */
export function applyTypographyPresets(presets) {
  if (typeof document === "undefined") return;
  const n = normalizeTypographyPresets(presets);
  const profile = n[n.active];
  const root = document.documentElement;
  for (const k of BLOCKS) {
    const p = profile[k];
    root.style.setProperty(`--gk-type-${k}-size`,      p.size);
    root.style.setProperty(`--gk-type-${k}-weight`,    String(p.weight));
    root.style.setProperty(`--gk-type-${k}-color`,     p.color || "inherit");
    root.style.setProperty(`--gk-type-${k}-italic`,    p.italic ? "italic" : "normal");
    root.style.setProperty(`--gk-type-${k}-underline`, p.underline ? "underline" : "none");
  }
}

export const TYPOGRAPHY_STORAGE_KEY = "typographyPresets";
