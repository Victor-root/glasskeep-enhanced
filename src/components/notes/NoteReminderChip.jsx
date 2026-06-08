import React from "react";
import TI from "../../icons/editor/index.jsx";
import { formatReminderLabel, isReminderPast } from "../../utils/reminder.js";

/**
 * Small reminder pill shown on a note card (and reusable elsewhere).
 *
 * Mirrors the tag-chip look so it sits naturally in the card footer:
 * neutral frosted background that reads on any note colour, accent text
 * with a bell glyph when upcoming, muted (overdue) when the instant has
 * already passed. Truncates rather than overflowing on narrow cards.
 */
export default function NoteReminderChip({ reminderAt, className = "" }) {
  if (!reminderAt) return null;
  const label = formatReminderLabel(reminderAt);
  if (!label) return null;
  const past = isReminderPast(reminderAt);

  return (
    <span
      className={
        "inline-flex items-center gap-1 max-w-full text-[11px] font-medium px-2 py-0.5 rounded-full " +
        (past
          ? "bg-black/[0.06] text-gray-500 dark:bg-white/[0.08] dark:text-gray-400"
          : "bg-black/[0.06] text-[var(--gk-chrome-accent,#6366f1)] dark:bg-white/[0.10] dark:text-indigo-300") +
        (className ? ` ${className}` : "")
      }
      title={label}
    >
      <TI.Bell className="tabler-icon w-3 h-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
}
