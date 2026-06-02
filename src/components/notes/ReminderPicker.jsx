import React, { useMemo, useState } from "react";
import { t, locale } from "../../i18n";
import TI from "../../icons/editor/index.jsx";

// ---------- local date/time helpers ----------
// Native <input type="date|time"> work in the device's local timezone.
// We assemble the two local fields into a Date, then store it as an ISO
// (UTC) string — so the same instant fires correctly regardless of the
// timezone the note is later read from. (Unchanged from the native
// version — only the controls feeding these strings changed.)
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
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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

const intlLocale = locale === "fr" ? "fr-FR" : "en-US";
const TIME_CHIPS = ["09:00", "12:00", "15:00", "18:00", "20:00"];

// ---------- Custom mini calendar (no native picker) ----------
// Monday-first month grid. Past days are disabled; the selected day uses
// the workspace accent; today gets a subtle ring.
function MiniCalendar({ valueDate, onPick }) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const initMonth = valueDate && valueDate >= today ? valueDate : today;
  const [view, setView] = useState(() => new Date(initMonth.getFullYear(), initMonth.getMonth(), 1));

  // Monday-first weekday labels, localized (Jan 1 2024 was a Monday).
  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(2024, 0, 1 + i).toLocaleDateString(intlLocale, { weekday: "short" }),
      ),
    [],
  );

  const title = view.toLocaleDateString(intlLocale, { month: "long", year: "numeric" });

  const days = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const firstDow = (first.getDay() + 6) % 7; // 0 = Monday
    const start = new Date(view.getFullYear(), view.getMonth(), 1 - firstDow);
    return Array.from({ length: 42 }, (_, i) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
    );
  }, [view]);

  const selKey = valueDate ? toDateInput(valueDate) : null;
  const todayKey = toDateInput(today);
  const goMonth = (delta) => setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  return (
    <div className="gk-cal">
      <div className="gk-cal-header">
        <button type="button" className="gk-cal-nav" onClick={() => goMonth(-1)} aria-label={t("reminderPrevMonth")}>
          <TI.ChevronLeft className="tabler-icon" style={{ width: 18, height: 18 }} />
        </button>
        <span className="gk-cal-title">{title}</span>
        <button type="button" className="gk-cal-nav" onClick={() => goMonth(1)} aria-label={t("reminderNextMonth")}>
          <TI.ChevronRight className="tabler-icon" style={{ width: 18, height: 18 }} />
        </button>
      </div>
      <div className="gk-cal-grid" role="grid">
        {weekdays.map((w, i) => (
          <div key={`dow-${i}`} className="gk-cal-dow" aria-hidden="true">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const key = toDateInput(d);
          const inMonth = d.getMonth() === view.getMonth();
          const isPast = d < today;
          const isSel = key === selKey;
          const isToday = key === todayKey;
          const cls = ["gk-cal-day"];
          if (!inMonth) cls.push("gk-cal-day--muted");
          if (isSel) cls.push("gk-cal-day--selected");
          else if (isToday) cls.push("gk-cal-day--today");
          return (
            <button
              key={key}
              type="button"
              className={cls.join(" ")}
              disabled={isPast}
              aria-pressed={isSel}
              aria-label={d.toLocaleDateString(intlLocale, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              onClick={() => onPick(d)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// One HH or MM column: ▲ value ▼ (the up chevron is the down glyph rotated,
// since the icon set only ships ChevronDown).
function TimeStepper({ val, onUp, onDown, upLabel, downLabel, valLabel }) {
  return (
    <div className="gk-time-col">
      <button type="button" className="gk-time-btn" onClick={onUp} aria-label={upLabel}>
        <TI.ChevronDown className="tabler-icon" style={{ width: 16, height: 16, transform: "rotate(180deg)" }} />
      </button>
      <span className="gk-time-val" aria-label={valLabel}>{pad(val)}</span>
      <button type="button" className="gk-time-btn" onClick={onDown} aria-label={downLabel}>
        <TI.ChevronDown className="tabler-icon" style={{ width: 16, height: 16 }} />
      </button>
    </div>
  );
}

// ---------- Custom time picker (no native picker) ----------
// Compact HH:MM stepper (hour ±1, minute ±5, both wrap) plus quick chips.
function TimePicker({ value, onChange }) {
  const [hh, mm] = (value || "09:00").split(":").map((n) => Number(n) || 0);
  const setHour = (h) => onChange(`${pad((h + 24) % 24)}:${pad(mm)}`);
  const setMinute = (m) => onChange(`${pad(hh)}:${pad((m + 60) % 60)}`);

  return (
    <div className="gk-time">
      <div className="gk-time-stepper">
        <TimeStepper
          val={hh}
          onUp={() => setHour(hh + 1)}
          onDown={() => setHour(hh - 1)}
          upLabel={t("reminderHourUp")}
          downLabel={t("reminderHourDown")}
          valLabel={t("reminderHour")}
        />
        <span className="gk-time-sep" aria-hidden="true">:</span>
        <TimeStepper
          val={mm}
          onUp={() => setMinute(mm + 5)}
          onDown={() => setMinute(mm - 5)}
          upLabel={t("reminderMinUp")}
          downLabel={t("reminderMinDown")}
          valLabel={t("reminderMinute")}
        />
      </div>
      <div className="gk-time-chips">
        {TIME_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            className={`gk-time-chip${value === c ? " gk-time-chip--active" : ""}`}
            aria-pressed={value === c}
            onClick={() => onChange(c)}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Reminder editor. Rendered as the body of the rich-text-style popover
 * (the `.rt-pop` shell is provided by the parent), so it visually matches
 * the editor's font / block-type dropdowns: same rows, same theming.
 *
 * Props (unchanged):
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

  const valueDate = useMemo(() => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }, [dateStr]);

  const combined = combineLocal(dateStr, timeStr);
  const isPast = combined ? combined.getTime() <= Date.now() : false;
  const canSet = !!combined && !isPast;

  const commit = (d) => {
    if (!d) return;
    onSave?.(d.toISOString());
    onClose?.();
  };
  const handleCustomSave = () => {
    if (canSet) commit(combined);
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
      <MiniCalendar valueDate={valueDate} onPick={(d) => setDateStr(toDateInput(d))} />
      <TimePicker value={timeStr} onChange={setTimeStr} />

      {isPast && <div className="gk-reminder-past-hint">{t("reminderPastHint")}</div>}

      <div className="gk-reminder-actions">
        {value && (
          <button type="button" className="gk-reminder-remove" onClick={() => { onClear?.(); onClose?.(); }}>
            {t("reminderRemove")}
          </button>
        )}
        <button
          type="button"
          onClick={handleCustomSave}
          disabled={!canSet}
          className="gk-reminder-set px-3 py-1.5 rounded-lg font-semibold text-sm text-white transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none disabled:hover:scale-100"
        >
          {value ? t("reminderUpdate") : t("reminderSet")}
        </button>
      </div>
    </>
  );
}
