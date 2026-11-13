// The Android app's pull-to-refresh, native and above the page: an open
// overlay holds it off, and so does a note card being dragged, which would
// otherwise read as a pull and lose the card. It comes back once nothing
// holds it.
const holders = new Set();

export function holdPullToRefresh(reason, held) {
  if (held) holders.add(reason);
  else holders.delete(reason);
  try { window.AndroidTheme?.setRefreshEnabled(holders.size === 0); } catch { /* Android bridge best-effort */ }
}
