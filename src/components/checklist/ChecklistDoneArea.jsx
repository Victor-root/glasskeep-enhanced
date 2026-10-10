import React from "react";
import { t } from "../../i18n";
import ChecklistRow from "../common/ChecklistRow.jsx";
import { hexAlpha } from "./SectionHeader.jsx";
import { DEFAULT_SECTION_ID } from "../../utils/checklist.js";

// "Done" area at the bottom of the checklist editor: a collapsible header
// with the count, then the checked items, grouped under their section's
// title when the list has sections.
export default function ChecklistDoneArea({
  checkedCount,
  collapsed,
  onToggleCollapsed,
  showSectionBreaks,
  checkedBySection,
  sections,
  readOnly,
  onToggle,
  onChangeText,
  onRemove,
}) {
  const renderCheckedRow = (it) => (
    <ChecklistRow
      key={it.id}
      item={it}
      readOnly={readOnly}
      disableToggle={readOnly}
      showRemove={!readOnly}
      size="lg"
      onToggle={(checked, e) => {
        e?.stopPropagation();
        onToggle(it.id, checked);
      }}
      onChange={(txt) => onChangeText(it.id, txt)}
      onRemove={() => onRemove(it.id)}
    />
  );

  return (
    <div className="border-t border-[var(--border-light)] pt-4 mt-4">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 -mx-2 rounded-sm mb-3 transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 text-gray-400 dark:text-gray-500${collapsed ? " -rotate-90" : ""}`}
          fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
          {t("done")}
        </span>
        <span
          className="text-xs font-medium tabular-nums px-1.5 py-0.5 rounded-full ml-0.5"
          style={{ background: hexAlpha("#64748b", 0.14), color: "#64748b" }}
        >
          {checkedCount}
        </span>
      </button>
      {!collapsed && (
        showSectionBreaks ? (
          Array.from(checkedBySection.entries()).map(([sid, arr]) => {
            const section = sections.find((s) => s.id === sid);
            const label = section && section.title ? section.title : null;
            return (
              <div key={sid} className="mb-3">
                {label && (
                  <div className="text-xs font-semibold tracking-wide text-gray-400 dark:text-gray-500 mb-1">
                    {label}
                  </div>
                )}
                {arr.map(renderCheckedRow)}
              </div>
            );
          })
        ) : (
          (checkedBySection.get(DEFAULT_SECTION_ID) || []).map(renderCheckedRow)
        )
      )}
    </div>
  );
}
