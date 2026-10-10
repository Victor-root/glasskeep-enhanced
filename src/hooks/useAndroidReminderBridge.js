import { useEffect, useRef } from "react";
import { t } from "../i18n";
import { hasAndroidReminders, syncAndroidReminders, setAndroidReminderAuth } from "../utils/androidReminders.js";

/**
 * Android app only (no-op in the browser / PWA, where Web Push does it):
 * - mirrors the upcoming reminders to the native alarm scheduler, which
 *   fires them without a push service. The whole set is reconciled on
 *   every change; an unchanged set skips the bridge call.
 * - hands the session token to the native background sync, so a reminder
 *   created on another device still fires while the app is closed.
 */
export default function useAndroidReminderBridge({ notes, token }) {
  const androidReminderSyncRef = useRef("");
  useEffect(() => {
    if (!hasAndroidReminders()) return;
    const now = Date.now();
    const title = t("reminderNotificationTitle");
    const items = (notes || [])
      .filter((n) => n.reminderAt && new Date(n.reminderAt).getTime() > now)
      .map((n) => ({
        noteId: String(n.id),
        t: new Date(n.reminderAt).getTime(),
        title,
        body: (n.title || "").trim() || t("untitledNote"),
      }));
    const sig = JSON.stringify(items);
    if (sig === androidReminderSyncRef.current) return;
    androidReminderSyncRef.current = sig;
    syncAndroidReminders(items);
  }, [notes]);

  useEffect(() => {
    setAndroidReminderAuth(token || "");
  }, [token]);
}
