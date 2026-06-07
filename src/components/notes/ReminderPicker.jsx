import React, { useEffect, useMemo, useState } from "react";
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

// Default reminder anchor when the note has none yet: tomorrow 09:00.
function presetTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

const intlLocale = locale === "fr" ? "fr-FR" : "en-US";

// ---------- Custom time suggestions (user-editable, persisted) ----------
// Quick-pick time chips shown under the stepper. The defaults match the
// old hard-coded list; the user can edit them (max 5) via the pencil
// button and the override is stored per-device in localStorage.
const CHIP_STORAGE_KEY = "gk-reminder-time-chips";
const DEFAULT_TIME_CHIPS = ["09:00", "12:00", "15:00", "18:00", "20:00"];
const MAX_TIME_CHIPS = 5;

function isValidHHMM(s) {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}
// Coerce free-typed digits into a valid "HH:MM" (clamped), or null.
function normalizeChip(s) {
  const digits = String(s).replace(/[^0-9]/g, "").slice(0, 4);
  if (!digits) return null;
  let hh, mm;
  if (digits.length <= 2) { hh = Number(digits); mm = 0; }
  else { hh = Number(digits.slice(0, 2)); mm = Number(digits.slice(2)); }
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return `${pad(Math.min(23, hh))}:${pad(Math.min(59, mm))}`;
}
// Live formatter while typing (auto-inserts the colon after 2 digits).
function formatChipInput(s) {
  const digits = String(s).replace(/[^0-9]/g, "").slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
function loadChips() {
  try {
    const raw = localStorage.getItem(CHIP_STORAGE_KEY);
    if (!raw) return DEFAULT_TIME_CHIPS;
    const arr = JSON.parse(raw);
    const clean = Array.isArray(arr) ? arr.filter(isValidHHMM).slice(0, MAX_TIME_CHIPS) : [];
    return clean.length ? clean : DEFAULT_TIME_CHIPS;
  } catch {
    return DEFAULT_TIME_CHIPS;
  }
}
function saveChips(arr) {
  try { localStorage.setItem(CHIP_STORAGE_KEY, JSON.stringify(arr)); } catch {}
}

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

// One editable HH or MM field, clamped to [0, max]. Typing is allowed
// directly in the number (the request: click the value between the
// chevrons to enter it by hand); the chevrons still step it.
function TimeField({ val, max, onChange, label }) {
  const [draft, setDraft] = useState(pad(val));
  // Keep the visible draft in sync when the value changes via the steppers
  // or a quick-chip, but not while the user is mid-edit (handled by focus).
  useEffect(() => { setDraft(pad(val)); }, [val]);

  const commit = (raw) => {
    let n = parseInt(String(raw).replace(/[^0-9]/g, ""), 10);
    if (Number.isNaN(n)) n = val;
    n = Math.max(0, Math.min(max, n));
    onChange(n);
    setDraft(pad(n));
  };

  return (
    <input
      className="gk-time-val gk-time-input"
      type="text"
      inputMode="numeric"
      maxLength={2}
      value={draft}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
      onFocus={(e) => e.target.select()}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { commit(draft); e.target.blur(); }
      }}
    />
  );
}

// One stepper column: ▲ field ▼ (up chevron is the down glyph rotated,
// since the icon set only ships ChevronDown).
function TimeStepperCol({ children, onUp, onDown, upLabel, downLabel }) {
  return (
    <div className="gk-time-col">
      <button type="button" className="gk-time-btn" onClick={onUp} aria-label={upLabel} onMouseDown={(e) => e.preventDefault()}>
        <TI.ChevronDown className="tabler-icon" style={{ width: 16, height: 16, transform: "rotate(180deg)" }} />
      </button>
      {children}
      <button type="button" className="gk-time-btn" onClick={onDown} aria-label={downLabel} onMouseDown={(e) => e.preventDefault()}>
        <TI.ChevronDown className="tabler-icon" style={{ width: 16, height: 16 }} />
      </button>
    </div>
  );
}

// ---------- Custom time picker (no native picker) ----------
// Editable HH:MM stepper (hour ±1, minute ±5, both wrap) plus the
// user-editable quick chips.
function TimePicker({ value, onChange }) {
  const [hh, mm] = (value || "09:00").split(":").map((n) => Number(n) || 0);
  const setHour = (h) => onChange(`${pad((h + 24) % 24)}:${pad(mm)}`);
  const setMinute = (m) => onChange(`${pad(hh)}:${pad((m + 60) % 60)}`);

  const [chips, setChips] = useState(loadChips);
  const [editing, setEditing] = useState(false);

  const updateChip = (i, v) => setChips((prev) => prev.map((c, idx) => (idx === i ? v : c)));
  const removeChip = (i) => setChips((prev) => prev.filter((_, idx) => idx !== i));
  const addChip = () => setChips((prev) => (prev.length >= MAX_TIME_CHIPS ? prev : [...prev, "12:00"]));
  const finishEditing = () => {
    const seen = new Set();
    const clean = [];
    for (const c of chips) {
      const norm = normalizeChip(c);
      if (norm && !seen.has(norm)) { seen.add(norm); clean.push(norm); }
    }
    const final = (clean.length ? clean : DEFAULT_TIME_CHIPS).slice(0, MAX_TIME_CHIPS);
    setChips(final);
    saveChips(final);
    setEditing(false);
  };

  return (
    <div className="gk-time">
      <div className="gk-time-stepper">
        <TimeStepperCol
          onUp={() => setHour(hh + 1)}
          onDown={() => setHour(hh - 1)}
          upLabel={t("reminderHourUp")}
          downLabel={t("reminderHourDown")}
        >
          <TimeField val={hh} max={23} onChange={(n) => onChange(`${pad(n)}:${pad(mm)}`)} label={t("reminderHour")} />
        </TimeStepperCol>
        <span className="gk-time-sep" aria-hidden="true">:</span>
        <TimeStepperCol
          onUp={() => setMinute(mm + 5)}
          onDown={() => setMinute(mm - 5)}
          upLabel={t("reminderMinUp")}
          downLabel={t("reminderMinDown")}
        >
          <TimeField val={mm} max={59} onChange={(n) => onChange(`${pad(hh)}:${pad(n)}`)} label={t("reminderMinute")} />
        </TimeStepperCol>
      </div>

      {editing ? (
        <div className="gk-time-chips-edit">
          {chips.map((c, i) => (
            <div key={i} className="gk-chip-edit-row">
              <input
                className="gk-chip-edit-input"
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                value={c}
                onChange={(e) => updateChip(i, formatChipInput(e.target.value))}
                onFocus={(e) => e.target.select()}
              />
              <button type="button" className="gk-chip-edit-del" onClick={() => removeChip(i)} aria-label={t("delete")}>
                <TI.X className="tabler-icon" style={{ width: 14, height: 14 }} />
              </button>
            </div>
          ))}
          <div className="gk-chip-edit-actions">
            {chips.length < MAX_TIME_CHIPS && (
              <button type="button" className="gk-chip-edit-add" onClick={addChip}>+</button>
            )}
            <button type="button" className="gk-chip-edit-done" onClick={finishEditing}>
              <TI.Check className="tabler-icon" style={{ width: 14, height: 14 }} />
              <span>{t("done")}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="gk-time-chips">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              className={`gk-time-chip${value === c ? " gk-time-chip--active" : ""}`}
              aria-pressed={value === c}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(c)}
            >
              {c}
            </button>
          ))}
          <button
            type="button"
            className="gk-time-chip gk-time-chip--edit"
            aria-label={t("reminderEditSuggestions")}
            data-tooltip={t("reminderEditSuggestions")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEditing(true)}
          >
            <TI.Pencil className="tabler-icon" style={{ width: 14, height: 14 }} />
          </button>
        </div>
      )}
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

  return (
    <>
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
