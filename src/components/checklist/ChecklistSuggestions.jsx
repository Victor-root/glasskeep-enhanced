import React from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import Popover from "../richtext/Popover.jsx";

// Checked items matching what is being typed into a checklist row,
// offered back below it (see suggestCheckedItems). Mouse-down is
// swallowed so a click or a tap never blurs the row before it picks.
export default function ChecklistSuggestions({ anchorRef, suggestions, activeIndex, onPick, onClose }) {
  return (
    <Popover open anchorRef={anchorRef} onClose={onClose} className="rt-pop--checklist-suggest" preferredWidth={260}>
      <div role="listbox" aria-label={t("checklistSuggestions")} onMouseDown={(e) => e.preventDefault()}>
        {suggestions.map((s, i) => {
          const [start, end] = s.match;
          return (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              tabIndex={-1}
              className={`rt-menu-item${i === activeIndex ? " is-current" : ""}`}
              onClick={() => onPick(s.id)}
            >
              <span className="rt-menu-item-icon"><TI.Check className="tabler-icon" /></span>
              <span className="rt-menu-item-label">
                {s.text.slice(0, start)}<strong>{s.text.slice(start, end)}</strong>{s.text.slice(end)}
              </span>
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
