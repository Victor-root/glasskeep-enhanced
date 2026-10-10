// The colours of the browser / Android system bars around the app: the
// status bar (theme-color meta tag) and, in the Android app, the
// navigation bar and the scrim over both.

/** App-chrome status-bar colours. Shared so the value can't drift across
 *  callers: useDarkMode sets these on load / dark-toggle, and NoteModal restores
 *  them when a note closes (it overrides with the open note's colour meanwhile).
 *  MUST match the --gk-statusbar CSS variable in globalCSS (which also paints
 *  the flat mobile header), light and dark respectively. */
export const STATUS_BAR_LIGHT = "#dce1fb";
export const STATUS_BAR_DARK = "#171f30";

/** Current shell status-bar colour, read from the live --gk-statusbar token so
 *  it follows the active workspace theme AND dark mode automatically. Falls
 *  back to the GlassKeep constants if the stylesheet isn't mounted yet (the
 *  token resolves to empty), so early callers still get a sensible colour. */
export function currentStatusBarColor() {
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--gk-statusbar")
      .trim();
    if (v) return v;
  } catch {
    /* getComputedStyle unavailable — fall through */
  }
  return document.documentElement.classList.contains("dark")
    ? STATUS_BAR_DARK
    : STATUS_BAR_LIGHT;
}

/** Whatever theme-color is live right now — a modal's own override or the
 *  shell default, whichever last called setThemeColor — read straight from
 *  the meta tag rather than recomputed, so a caller can restore exactly
 *  what was there before it took over (e.g. a modal opened on top of an
 *  already-colored NoteModal). Null if the tag isn't mounted yet. */
export function currentThemeColor() {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || null;
}

/** Update PWA status bar color by removing and re-creating the meta tag */
export function setThemeColor(color) {
  const old = document.querySelector('meta[name="theme-color"]');
  if (old) old.remove();
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.setAttribute("content", color);
  document.head.appendChild(meta);
  // Direct call to Android WebView bridge (bypasses MutationObserver)
  try { window.AndroidTheme?.onThemeColor(color); } catch { /* bridge error: the meta tag above still applies */ }
}

/** Android app (1.4.8+) only: paints the navigation bar in its own colour
 *  instead of the theme colour; null hands it back to the theme colour. */
export function setNavBarColor(color) {
  try { window.AndroidTheme?.onNavBarColor?.(color || ""); } catch { /* bridge error: nav bar keeps its current colour */ }
}

/** Android app (1.4.8+) only: darkens the painted status and navigation bars
 *  by this share of black, in step with a dimming overlay over the page. */
export function setSystemBarsScrim(alpha) {
  try { window.AndroidTheme?.setBarsScrim?.(alpha); } catch { /* bridge error: system bars stay unscrimmed */ }
}
