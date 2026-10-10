// Dates as the interface shows them.
import { t } from "../i18n";

/** Format "Edited" text */
export function formatEditedStamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();

  const sameYMD = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const timeStr = d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (sameYMD(d, now)) return `${t("todayLabel")}, ${timeStr}`;
  const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameYMD(d, yest)) return `${t("yesterdayLabel")}, ${timeStr}`;

  const month = d.toLocaleString([], { month: "short" });
  const day = d.getDate();
  if (d.getFullYear() === now.getFullYear()) return `${day} ${month}`;
  const yyyy = String(d.getFullYear());
  return `${day} ${month} ${yyyy}`;
}

/** A date and time in the browser's locale, or nothing without a date. */
export function formatDateTime(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
