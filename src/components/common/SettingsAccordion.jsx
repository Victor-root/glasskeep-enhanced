// Shared UI bricks for the Settings AND Admin panels. Both side sheets
// use the same chevron-led collapsible section pattern, the same indigo
// chip in front of every row, and the same tiny sub-group caption when
// a section needs internal grouping. Keeping these in one place avoids
// the two panels drifting apart as the UI evolves.

import React from "react";
import TI from "../../icons/editor/index.jsx";

// 32x32 themed chip (option-row tier: --gk-icon-fg / --gk-icon-bg, derived
// from the active theme) wrapping a Tabler icon. Placed in front of OPTION
// rows so every option icon aligns in a single vertical column. Section-level
// icons use the second tier (SectionIcon below) so the two hierarchies read
// at a glance.
export function RowIcon({ icon: Icon }) {
  return (
    <span className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--gk-icon-bg)] text-[var(--gk-icon-fg)]">
      <Icon className="tabler-icon w-5 h-5" />
    </span>
  );
}

// Same shape as RowIcon but the second icon tier (--gk-icon2-fg /
// --gk-icon2-bg, derived from the theme's grad-to) — used in section headers
// so category-level icons stay distinct from the option-row icons underneath.
// For GlassKeep that resolves to the familiar indigo/violet pairing.
function SectionIcon({ icon: Icon }) {
  return (
    <span className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--gk-icon2-bg)] text-[var(--gk-icon2-fg)]">
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
        className="group w-full flex items-center gap-3 pl-3 pr-3 py-2 -mx-1 rounded-xl text-left hover:bg-[var(--gk-chrome-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 transition-colors"
      >
        <TI.ChevronDown
          className={`tabler-icon w-5 h-5 shrink-0 transition-all duration-200 ${
            open
              ? "text-[var(--gk-icon2-fg)]"
              : "text-gray-400 dark:text-gray-500 -rotate-90"
          } group-hover:text-[var(--gk-icon2-fg)]`}
        />
        <SectionIcon icon={icon} />
        <span className="text-md font-semibold flex-1 min-w-0">{title}</span>
      </button>
      <div
        className={`grid min-w-0 transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
        aria-hidden={!open}
        inert={!open}
      >
        {/* gk-acc-body clips during the open/close animation (so the grid
            collapse hides content), then switches to overflow:visible once
            open — see globalCSS — so button hover glows / focus rings on the
            last row aren't clipped at the section's bottom edge.
            min-w-0 lets this grid item shrink to the track width instead of
            its content's min-width (grid items default to min-width:auto),
            so a section with wide content — e.g. the federation URL in a
            whitespace-nowrap <code> — can't push the whole panel past the
            viewport on mobile; the inner elements scroll/wrap/truncate. */}
        <div className={`gk-acc-body min-w-0${open ? " is-open" : ""}`}>
          <div className="pt-4 pb-2">{children}</div>
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
