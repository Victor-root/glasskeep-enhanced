// Shared UI bricks for the Settings AND Admin panels. Both side sheets
// use the same chevron-led collapsible section pattern, the same indigo
// chip in front of every row, and the same tiny sub-group caption when
// a section needs internal grouping. Keeping these in one place avoids
// the two panels drifting apart as the UI evolves.

import React from "react";
import TI from "../../icons/editor/index.jsx";

// 32×32 indigo chip wrapping a Tabler icon. Placed in front of section
// headers and option rows so every icon aligns in a single vertical
// column whether the row sits next to a section title or an option
// label.
export function RowIcon({ icon: Icon }) {
  return (
    <span className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300">
      <Icon className="tabler-icon w-5 h-5" />
    </span>
  );
}

// Collapsible section wrapper used to declutter the long side panels.
// Header is a button (chevron + icon + title), content slides open and
// closed with a grid-template-rows animation that handles variable
// height without JS. The chevron flips between right and down and
// turns indigo when the section is open. Closed content is marked
// inert + aria-hidden so it stays out of the keyboard tab order and
// out of the accessibility tree.
export function SettingsSection({ icon, title, open, onToggle, children }) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group w-full flex items-center gap-3 pl-3 pr-3 py-2 -mx-1 rounded-xl text-left hover:bg-[#c1cfff66] dark:hover:bg-indigo-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 transition-colors"
      >
        <TI.ChevronDown
          className={`tabler-icon w-5 h-5 shrink-0 transition-all duration-200 ${
            open
              ? "text-indigo-500 dark:text-indigo-400"
              : "text-gray-400 dark:text-gray-500 -rotate-90"
          } group-hover:text-indigo-500 dark:group-hover:text-indigo-400`}
        />
        <RowIcon icon={icon} />
        <span className="text-md font-semibold flex-1 min-w-0">{title}</span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="overflow-hidden">
          <div className="pt-4">{children}</div>
        </div>
      </div>
    </>
  );
}

// Lightweight sub-section divider used inside collapsible sections that
// have enough internal variety to benefit from extra grouping. Renders
// the label as a small uppercase caption next to a thin trailing rule.
export function SettingsSubHeading({ label }) {
  return (
    <div className="flex items-center gap-2 pl-3 pt-1 select-none">
      <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-300/60 dark:bg-gray-600/40" />
    </div>
  );
}
