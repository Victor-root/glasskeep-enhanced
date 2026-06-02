import React, { useMemo, useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";

// ---------- local date/time helpers ----------
// Native <input type="date|time"> work in the device's local timezone.
// We assemble the two local fields into a Date, then store it as an ISO
// (UTC) string — so the same instant fires correctly regardless of the
// timezone the note is later read from.
function pad(n) {
  return String(n).padStart(2, "0");
}
function toDateInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toTimeInput(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// Combine a "YYYY-MM-DD" + "HH:MM" local pair into a Date (local time).
function combineLocal(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, m, day] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  if ([y, m, day, hh, mm].some((n) => Number.isNaN(n))) return null;
  const d = new Date(y, m - 1, day, hh, mm, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Quick presets, Google Keep style. Each returns a future Date.
function presetLaterToday() {
  const d = new Date();
  if (d.getHours() < 20) {
    d.setHours(20, 0, 0, 0); // this evening
  } else {
    d.setTime(d.getTime() + 60 * 60 * 1000); // +1h
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
  }
  return d;
}
function presetTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}
function presetNextWeek() {
  const d = new Date();
  // Next Monday (ISO week start). If today is Monday, jump a full week.
  const day = d.getDay(); // 0=Sun … 1=Mon
  const delta = ((8 - day) % 7) || 7;
  d.setDate(d.getDate() + delta);
  d.setHours(9, 0, 0, 0);
  return d;
}

/**
 * Reminder editor rendered inside the ModalFooter Popover.
 *
 * Props:
 *   value    — current reminder ISO string (or null)
 *   dark     — dark mode flag (theme tokens otherwise drive the styling)
 *   onSave   — (isoString) => void
 *   onClear  — () => void   (remove the reminder)
 *   onClose  — () => void
 */
export default function ReminderPicker({ value, onSave, onClear, onClose }) {
  const initial = useMemo(() => {
    const base = value ? new Date(value) : presetTomorrow();
    return Number.isNaN(base?.getTime?.()) ? presetTomorrow() : base;
  }, [value]);

  const [dateStr, setDateStr] = useState(() => toDateInput(initial));
  const [timeStr, setTimeStr] = useState(() => toTimeInput(initial));

  const minDate = toDateInput(new Date());

  const commit = (d) => {
    if (!d) return;
    onSave?.(d.toISOString());
    onClose?.();
  };

  const handleCustomSave = () => {
    const d = combineLocal(dateStr, timeStr);
    if (d) commit(d);
  };

  const presets = [
    { key: "laterToday", label: t("reminderLaterToday"), make: presetLaterToday },
    { key: "tomorrow", label: t("reminderTomorrow"), make: presetTomorrow },
    { key: "nextWeek", label: t("reminderNextWeek"), make: presetNextWeek },
  ];

  return (
    <div
      className="gk-reminder-popover w-[17rem] max-w-[calc(100vw-1.5rem)] rounded-2xl shadow-2xl bg-white dark:bg-gray-900 border border-indigo-100/80 dark:border-indigo-800/50 ring-1 ring-black/5 dark:ring-white/5 p-3"
      role="dialog"
      aria-label={t("reminderTitle")}
    >
      <div className="flex items-center gap-2 mb-2.5 px-0.5">
        <TI.BellRingingFilled className="tabler-icon tabler-icon--filled w-4 h-4 text-[var(--gk-chrome-accent,#6366f1)]" />
        <span className="text-sm font-semibold">{t("reminderTitle")}</span>
      </div>

      {/* Presets */}
      <div className="flex flex-col gap-1 mb-3">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => commit(p.make())}
            className="flex items-center gap-2 w-full text-left text-sm px-2.5 py-2 rounded-lg hover:bg-[var(--gk-accent-soft-bg,rgba(99,102,241,0.1))] transition-colors"
          >
            <TI.Clock className="tabler-icon w-4 h-4 opacity-70 shrink-0" />
            <span className="truncate">{p.label}</span>
          </button>
        ))}
      </div>

      {/* Custom date + time */}
      <div className="border-t border-[var(--border-light)] pt-2.5">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 px-0.5">
          {t("reminderPickDateTime")}
        </div>
        <div className="flex gap-2 mb-2.5">
          <input
            type="date"
            value={dateStr}
            min={minDate}
            onChange={(e) => setDateStr(e.target.value)}
            className="gk-reminder-input flex-1 min-w-0 text-sm rounded-lg border border-[var(--border-light)] bg-white/70 dark:bg-gray-800/70 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
            aria-label={t("reminderDateLabel")}
          />
          <input
            type="time"
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            className="gk-reminder-input w-[5.5rem] shrink-0 text-sm rounded-lg border border-[var(--border-light)] bg-white/70 dark:bg-gray-800/70 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
            aria-label={t("reminderTimeLabel")}
          />
        </div>

        <div className="flex items-center gap-2">
          {value && (
            <button
              type="button"
              onClick={() => {
                onClear?.();
                onClose?.();
              }}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              {t("reminderRemove")}
            </button>
          )}
          <button
            type="button"
            onClick={handleCustomSave}
            disabled={!combineLocal(dateStr, timeStr)}
            className="ml-auto text-sm font-semibold px-3 py-1.5 rounded-lg bg-[var(--gk-chrome-accent,#6366f1)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {value ? t("reminderUpdate") : t("reminderSet")}
          </button>
        </div>
      </div>
    </div>
  );
}
