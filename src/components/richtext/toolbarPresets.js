// Palettes, fonts and sizes offered by the rich-text toolbar popovers.

export const PRESET_TEXT_COLORS = [
  "#111827", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#64748b", "#ffffff",
];
// Highlight palette: 8 named slots backed by CSS variables. Each slot
// resolves to a different hex in light vs dark mode (see globalCSS.js
// :root / html.dark rules); we store the var() REFERENCE in the mark,
// so switching theme re-resolves the highlight automatically and a
// "red" highlight picked in dark mode becomes the light-mode "red"
// equivalent without having to touch the document.
export const PRESET_HIGHLIGHTS = [
  "var(--rt-hl-1)",
  "var(--rt-hl-2)",
  "var(--rt-hl-3)",
  "var(--rt-hl-4)",
  "var(--rt-hl-5)",
  "var(--rt-hl-6)",
  "var(--rt-hl-7)",
  "var(--rt-hl-8)",
];
export const DEFAULT_HIGHLIGHT_SWATCH = "var(--rt-hl-1)";
export const PRESET_UNDERLINE_COLORS = [
  "#111827", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6",
  "#ec4899", "#64748b",
];

// 28 web-safe + open-source webfonts vendored locally via @fontsource
// (see src/main.jsx). Listed in a familiar Sans / Serif / Mono / Display
// order so the popover reads as a tidy gallery.
export const FONT_FAMILIES = [
  // System default (no fontFamily mark applied)
  { label: "Sans", value: "" },
  // --- Sans-serif ---
  { label: "Inter",            value: 'Inter, sans-serif' },
  { label: "Roboto",           value: 'Roboto, sans-serif' },
  { label: "Open Sans",        value: '"Open Sans", sans-serif' },
  { label: "Lato",             value: 'Lato, sans-serif' },
  { label: "Source Sans",      value: '"Source Sans 3", sans-serif' },
  { label: "Noto Sans",        value: '"Noto Sans", sans-serif' },
  { label: "Nunito",           value: 'Nunito, sans-serif' },
  { label: "Poppins",          value: 'Poppins, sans-serif' },
  { label: "Montserrat",       value: 'Montserrat, sans-serif' },
  { label: "Raleway",          value: 'Raleway, sans-serif' },
  { label: "Work Sans",        value: '"Work Sans", sans-serif' },
  { label: "Ubuntu",           value: 'Ubuntu, sans-serif' },
  // --- Serif ---
  { label: "Merriweather",     value: 'Merriweather, serif' },
  { label: "Lora",             value: 'Lora, serif' },
  { label: "PT Serif",         value: '"PT Serif", serif' },
  { label: "Playfair Display", value: '"Playfair Display", serif' },
  { label: "EB Garamond",      value: '"EB Garamond", serif' },
  { label: "Source Serif",     value: '"Source Serif 4", serif' },
  // --- Monospace ---
  { label: "JetBrains Mono",   value: '"JetBrains Mono", monospace' },
  { label: "Fira Code",        value: '"Fira Code", monospace' },
  { label: "Source Code Pro",  value: '"Source Code Pro", monospace' },
  { label: "IBM Plex Mono",    value: '"IBM Plex Mono", monospace' },
  { label: "Roboto Mono",      value: '"Roboto Mono", monospace' },
  // --- Display / decorative ---
  { label: "Bebas Neue",       value: '"Bebas Neue", sans-serif' },
  { label: "Oswald",           value: 'Oswald, sans-serif' },
  { label: "Pacifico",         value: 'Pacifico, cursive' },
  { label: "Dancing Script",   value: '"Dancing Script", cursive' },
  { label: "Caveat",           value: 'Caveat, cursive' },
];
export const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"];
export const DEFAULT_FONT_SIZE = "16px";

export const UNDERLINE_STYLES = [
  { value: "simple", label: "fmtUnderlineSimple", preview: "underline" },
  { value: "double", label: "fmtUnderlineDouble", preview: "underline double" },
  { value: "dotted", label: "fmtUnderlineDotted", preview: "underline dotted" },
  { value: "dashed", label: "fmtUnderlineDashed", preview: "underline dashed" },
  { value: "wavy", label: "fmtUnderlineWavy", preview: "underline wavy" },
];
