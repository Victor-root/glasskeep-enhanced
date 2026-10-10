// Workspace ("shell") colour theme — header + sidebar chrome only.
//
// The actual colours live in CSS as --gk-chrome-* / --gk-statusbar token
// overrides under `html.gk-theme-<id>` (see src/styles/global/base.js).
// GlassKeep is the DEFAULT and intentionally has NO class: it falls back to
// the untouched :root / html.dark token blocks, so the validated default
// renders byte-identical regardless of this module.
//
// This module just owns the id list, the saved preference, and toggling the
// single class on <html>. No colours are hardcoded here except the small
// swatch triplets used purely to draw the picker chips.

import { setThemeColor, currentStatusBarColor } from "../utils/helpers.js";

export const DEFAULT_SHELL_THEME = "glasskeep";

// Order = display order in the picker. swatch = [primary, secondary, surface]
// used only to paint the preview chip.
export const SHELL_THEMES = [
  { id: "glasskeep", label: "GlassKeep", swatch: ["#6366f1", "#7c3aed", "#dce1fb"] },
  { id: "emerald", label: "Emerald", swatch: ["#10b981", "#0d9488", "#d2ecdf"] },
  { id: "amber", label: "Amber", swatch: ["#d97706", "#b45309", "#f6e3c9"] },
  { id: "rosewood", label: "Ruby", swatch: ["#e11d1d", "#9f1010", "#f7cccc"] },
  { id: "graphite", label: "Graphite", swatch: ["#64748b", "#475569", "#dde1e7"] },
  { id: "blush", label: "Blush", swatch: ["#ec4899", "#be185d", "#f7d4ea"] },
];

const VALID_IDS = new Set(SHELL_THEMES.map((t) => t.id));
const STORAGE_KEY = "gk:shellTheme";

export function isValidShellTheme(id) {
  return typeof id === "string" && VALID_IDS.has(id);
}

// Saved preference, or the default when absent / invalid.
export function getStoredShellTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage blocked — fall through to default */
  }
  return isValidShellTheme(saved) ? saved : DEFAULT_SHELL_THEME;
}

// Event fired on <document> whenever the active shell theme changes, so UI
// that mirrors the current theme (the Settings picker's checkmark) can stay in
// sync no matter who triggered the change — including the server settings load
// applying a different theme after the picker has already mounted (the
// cross-device case where localStorage was empty at boot).
export const SHELL_THEME_EVENT = "gk:shelltheme";

// The theme actually applied right now, read from the live <html> class — the
// single source of truth, independent of localStorage (which may lag on a
// fresh device until the server value lands).
export function getActiveShellTheme() {
  const root = document.documentElement;
  for (const t of SHELL_THEMES) {
    if (t.id !== DEFAULT_SHELL_THEME && root.classList.contains(`gk-theme-${t.id}`)) {
      return t.id;
    }
  }
  return DEFAULT_SHELL_THEME;
}

// Toggle the single gk-theme-* class on <html>. GlassKeep => no class.
// Does NOT persist and does NOT touch the theme-color meta — callers that
// need those use setShellTheme(). Safe to call before the global stylesheet
// is injected (the class is just waiting for the rules to arrive).
export function applyShellThemeClass(id) {
  const theme = isValidShellTheme(id) ? id : DEFAULT_SHELL_THEME;
  const root = document.documentElement;
  for (const t of SHELL_THEMES) {
    root.classList.toggle(`gk-theme-${t.id}`, t.id !== DEFAULT_SHELL_THEME && t.id === theme);
  }
  // Notify in-app listeners. Guarded for the boot call (before React mounts
  // there are simply no listeners, so this is a harmless no-op).
  try {
    document.dispatchEvent(new CustomEvent(SHELL_THEME_EVENT, { detail: theme }));
  } catch {
    /* CustomEvent unavailable (very old engines) — listeners just won't fire */
  }
  return theme;
}

// Read + apply the saved theme. Call once at boot (before React renders) so
// the right tokens are live the moment the stylesheet mounts — no flash of
// the default theme.
export function applyStoredShellTheme() {
  return applyShellThemeClass(getStoredShellTheme());
}

// Full apply from the picker: swap the class, persist, and refresh the PWA /
// mobile theme-color from the now-current --gk-statusbar (skipped while a note
// modal owns the status-bar colour). Returns the applied id.
export function setShellTheme(id) {
  const theme = applyShellThemeClass(id);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage blocked — selection still applies for this session */
  }
  if (!window.__noteModalOpen) {
    setThemeColor(currentStatusBarColor());
  }
  return theme;
}
