import { t, locale } from "../i18n";

// True when a reminder instant is in the past. Past reminders are kept
// (never auto-deleted) and simply shown in a muted "overdue" style.
export function isReminderPast(iso) {
  if (!iso) return false;
  const ms = new Date(iso).getTime();
  return !Number.isNaN(ms) && ms < Date.now();
}

function sameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Compact, localized label for a reminder chip / tooltip, relative to now:
//   today  → "Today 18:00" / "Aujourd'hui 18:00"
//   +1 day → "Tomorrow 09:00" / "Demain 09:00"
//   else   → "12 Jun, 09:00"  (adds the year only when it differs)
export function formatReminderLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const intl = locale === "fr" ? "fr-FR" : "en-US";
  const time = d.toLocaleTimeString(intl, { hour: "2-digit", minute: "2-digit" });

  if (sameLocalDay(d, now)) return t("reminderChipToday", { time });
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameLocalDay(d, tomorrow)) return t("reminderChipTomorrow", { time });

  const opts = { day: "numeric", month: "short" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  const date = d.toLocaleDateString(intl, opts);
  return t("reminderChipDate", { date, time });
}
