// Bridge to the Android WebView's local reminder scheduler
// (window.AndroidReminders, injected by WebViewActivity). The WebView has
// no Web Push API, so on the APK reminders fire via local AlarmManager
// alarms scheduled here instead. These helpers are no-ops everywhere else
// (installed PWA, desktop, plain browser), where Web Push handles
// background reminders — so they're safe to call unconditionally.

export function hasAndroidReminders() {
  return (
    typeof window !== "undefined" &&
    !!window.AndroidReminders &&
    typeof window.AndroidReminders.syncAll === "function"
  );
}

// Reconcile the full set of upcoming reminders with the native scheduler.
// `items`: [{ noteId, t (epoch ms), title, body }]. The native side cancels
// any alarm not in the list and (re)schedules the rest — so this single
// call covers create, edit, delete, cross-device changes and app launch.
export function syncAndroidReminders(items) {
  if (!hasAndroidReminders()) return;
  try {
    window.AndroidReminders.syncAll(JSON.stringify(Array.isArray(items) ? items : []));
  } catch {
    /* bridge unavailable — ignore */
  }
}
