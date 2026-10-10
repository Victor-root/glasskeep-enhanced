import React from "react";
import { t } from "../../i18n";
import SectionHeader, { SECTION_COLORS, hexAlpha } from "./SectionHeader.jsx";

// A named section of the checklist editor: its header, then (unless
// collapsed) its unchecked items on the section's tint and the
// "add to section" button.
export default function ChecklistSection({
  section,
  uncheckedItems,
  collapsed,
  dark,
  readOnly,
  renderItemRow,
  onRename,
  onRemove,
  onEnter,
  onColorChange,
  onHandlePointerDown,
  onHandlePointerMove,
  onHandlePointerUp,
  onHandlePointerCancel,
  onToggleCollapse,
  onAddItem,
}) {
  const colorKey = section.color ?? "none";
  const colorHex = SECTION_COLORS.find((c) => c.key === colorKey)?.hex ?? null;
  const accentBorder = colorHex
    ? { borderLeft: `3px solid ${hexAlpha(colorHex, dark ? 0.80 : 0.6)}` }
    : undefined;
  const itemsAreaStyle = colorHex
    ? { background: hexAlpha(colorHex, dark ? 0.09 : 0.04) }
    : undefined;

  return (
    <div data-section-block={section.id} className="space-y-1 max-sm:-ml-2 max-sm:-mr-2">
      <div style={accentBorder}>
        <div data-checklist-row data-section-header={section.id}>
          <SectionHeader
            section={section}
            readOnly={readOnly}
            onRename={onRename}
            onRemove={onRemove}
            onEnter={onEnter}
            onColorChange={onColorChange}
            onHandlePointerDown={onHandlePointerDown}
            onHandlePointerMove={onHandlePointerMove}
            onHandlePointerUp={onHandlePointerUp}
            onHandlePointerCancel={onHandlePointerCancel}
            collapsed={collapsed}
            onToggleCollapse={onToggleCollapse}
            count={uncheckedItems.length}
          />
        </div>
        {!collapsed && (
          <div style={itemsAreaStyle}>
            {uncheckedItems.length > 0 && (
              <div className="pl-3 space-y-3 pt-1 pb-1">
                {uncheckedItems.map(renderItemRow)}
              </div>
            )}
            {!readOnly && (
              <button
                type="button"
                data-checklist-row
                className="flex items-center gap-2 pl-4 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                onClick={onAddItem}
              >
                <span className="leading-none">+</span>
                <span>{t("addToSectionEllipsis")}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
