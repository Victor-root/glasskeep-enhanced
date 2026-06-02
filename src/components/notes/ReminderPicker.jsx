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
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1); // +1h, rounded to the hour
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
 * Reminder editor. Rendered as the body of the rich-text-style popover
 * (the `.rt-pop` shell is provided by the parent), so it visually matches
 * the editor's font / block-type dropdowns: same rows, same theming.
 *
 * Props:
 *   value    — current reminder ISO string (or null)
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
    <>
      <div className="rt-pop-label">{t("reminderTitle")}</div>

      {presets.map((p) => (
        <button
          key={p.key}
          type="button"
          className="rt-menu-item"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => commit(p.make())}
        >
          <span className="rt-menu-item-icon">
            <TI.Clock className="tabler-icon" />
          </span>
          <span className="rt-menu-item-label">{p.label}</span>
        </button>
      ))}

      <div className="gk-reminder-sep" />

      <div className="rt-pop-label">{t("reminderPickDateTime")}</div>
      <div className="gk-reminder-fields">
        <input
          type="date"
          className="gk-reminder-input"
          value={dateStr}
          min={minDate}
          onChange={(e) => setDateStr(e.target.value)}
          aria-label={t("reminderDateLabel")}
        />
        <input
          type="time"
          className="gk-reminder-input gk-reminder-input--time"
          value={timeStr}
          onChange={(e) => setTimeStr(e.target.value)}
          aria-label={t("reminderTimeLabel")}
        />
      </div>

      <div className="gk-reminder-actions">
        {value && (
          <button type="button" className="gk-reminder-remove" onClick={() => { onClear?.(); onClose?.(); }}>
            {t("reminderRemove")}
          </button>
        )}
        <button
          type="button"
          onClick={handleCustomSave}
          disabled={!combineLocal(dateStr, timeStr)}
          className="gk-reminder-set px-3 py-1.5 rounded-lg font-semibold text-sm text-white transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none disabled:hover:scale-100"
        >
          {value ? t("reminderUpdate") : t("reminderSet")}
        </button>
      </div>
    </>
  );
}
