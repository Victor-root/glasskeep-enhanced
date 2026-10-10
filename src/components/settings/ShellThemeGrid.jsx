import React from "react";
import TI from "../../icons/editor/index.jsx";
import { SHELL_THEMES } from "../../theme/shellTheme.js";

// The shell colour themes as a grid of swatch tiles, one selected: the
// workspace theme picker and the admin's login page theme picker.
export default function ShellThemeGrid({ label, selected, onChoose }) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 gap-2"
      role="radiogroup"
      aria-label={label}
    >
      {SHELL_THEMES.map((theme) => {
        const isSel = theme.id === selected;
        const [primary, secondary, surface] = theme.swatch;
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={isSel}
            onClick={() => onChoose(theme.id)}
            className={`relative flex flex-col overflow-hidden rounded-xl border text-left transition-all active:scale-[0.99] ${
              isSel
                ? "border-[var(--gk-chrome-accent)] ring-2 ring-[var(--gk-chrome-accent)]"
                : "border-[var(--border-light)] hover:border-[var(--gk-accent-soft-border)]"
            }`}
          >
            <span
              className="h-9 w-full flex items-center px-2"
              style={{ background: surface }}
            >
              <span
                className="h-3.5 w-12 rounded-full"
                style={{ background: `linear-gradient(to right, ${primary}, ${secondary})` }}
              />
            </span>
            <span className="flex items-center justify-between gap-1 px-2.5 py-1.5 bg-white dark:bg-gray-800">
              <span className="text-sm font-medium truncate">{theme.label}</span>
              {isSel && (
                <TI.Check className="tabler-icon w-4 h-4 shrink-0 text-[var(--gk-chrome-accent)]" />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
