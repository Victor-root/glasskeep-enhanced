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

// Ask the native layer to post a reminder's SYSTEM notification right now.
// Used when an SSE reminder arrives while the APK is backgrounded (not
// foreground): the in-app card would be invisible, so we surface a real
// notification instead — driven by the live SSE, no push service. No-op
// off-Android (browsers/PWA use Web Push for the backgrounded case).
export function notifyAndroidNow(noteId, title, body) {
  if (
    typeof window === "undefined" ||
    !window.AndroidReminders ||
    typeof window.AndroidReminders.notifyNow !== "function"
  ) {
    return;
  }
  try {
    window.AndroidReminders.notifyNow(
      String(noteId ?? ""),
      String(title ?? ""),
      String(body ?? ""),
    );
  } catch {
    /* bridge unavailable — ignore */
  }
}

// Hand the current auth token to the native layer so the Android background
// sync (WorkManager) can fetch upcoming reminders from the server while the
// APK is closed — that's what lets a reminder created on another device still
// fire on the phone, with no push service (no Google). No-op everywhere else.
export function setAndroidReminderAuth(token) {
  if (
    typeof window === "undefined" ||
    !window.AndroidReminders ||
    typeof window.AndroidReminders.setAuth !== "function"
  ) {
    return;
  }
  try {
    window.AndroidReminders.setAuth(typeof token === "string" ? token : "");
  } catch {
    /* bridge unavailable — ignore */
  }
}
