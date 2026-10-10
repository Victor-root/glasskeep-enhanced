// TV viewer preferences in localStorage (view mode, sidebar, theme).
// Storage errors fall back to the default and are otherwise ignored.

export function loadPref(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch { return fallback; }
}
export function savePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}
