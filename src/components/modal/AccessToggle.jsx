import React from "react";
import TI from "../../icons/editor/index.jsx";
import { t } from "../../i18n";

// Read-only / read-write chooser. A compact segmented control: the active
// half is filled with the soft theme accent, matching the app's other
// two-option pickers. Eye = read-only, Pencil = can edit; tooltips/aria
// carry the labels so it stays small.
//
// Deliberately never disabled while the change is in flight. Disabling it
// bought nothing: the row already flips optimistically, and setting the
// same access twice is a no-op server-side; but it meant a click landing
// in that window did absolutely nothing, which is indistinguishable from
// the app ignoring you. Clicking the half that is already active is
// likewise a no-op, so there is nothing to guard against.
export default function AccessToggle({ canWrite, onChange }) {
  const ro = canWrite === 0;
  const cell =
    "inline-flex items-center justify-center px-2 py-1 transition-colors";
  // --gk-accent-text: lighter in dark sheets (globalCSS, .gk-sheet).
  const active = "bg-[var(--gk-accent-soft-bg)] text-[var(--gk-accent-text,var(--gk-chrome-accent))]";
  const idle = "text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10";
  return (
    <div className="inline-flex rounded-lg border border-[var(--border-light)] overflow-hidden">
      <button
        type="button"
        aria-pressed={ro}
        aria-label={t("accessReadOnly")}
        data-tooltip={t("accessReadOnly")}
        onClick={(e) => { e.stopPropagation(); if (!ro) onChange("read"); }}
        className={`${cell} ${ro ? active : idle}`}
      >
        <TI.Eye className="tabler-icon w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        aria-pressed={!ro}
        aria-label={t("accessReadWrite")}
        data-tooltip={t("accessReadWrite")}
        onClick={(e) => { e.stopPropagation(); if (ro) onChange("write"); }}
        className={`${cell} border-l border-[var(--border-light)] ${!ro ? active : idle}`}
      >
        <TI.Pencil className="tabler-icon w-3.5 h-3.5" />
      </button>
    </div>
  );
}
