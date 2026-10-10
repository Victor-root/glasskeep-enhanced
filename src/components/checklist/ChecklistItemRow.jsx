import React from "react";
import { t } from "../../i18n";
import ChecklistRow from "../common/ChecklistRow.jsx";
import GripDots from "./GripDots.jsx";
import { INDENT_STEP_PX } from "../../utils/checklist.js";

// One unchecked item of the checklist editor: drag handle, the editable
// row, and its delete button.
export default function ChecklistItemRow({
  item: it,
  readOnly,
  focusItemId,
  focusToken,
  focusCaret,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onToggle,
  onChangeText,
  onEnter,
  onBackspaceEmpty,
  onIndent,
  onOutdent,
  onRemove,
}) {
  return (
    <div
      data-checklist-item={it.id}
      data-checklist-row
      className="group flex items-center gap-2"
      style={it.indent ? { marginLeft: INDENT_STEP_PX } : undefined}
    >
      {/* Only this wrapper slides during the horizontal indent/outdent
          drag (useChecklistDrag targets [data-checklist-slide]) -- the
          delete button below sits outside it, so it stays put instead
          of chasing the row sideways. */}
      <div data-checklist-slide className="flex items-center gap-2 flex-1 min-w-0">
        {!readOnly && (
          <div
            onPointerDown={(e) => onPointerDown(it.id, e)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            className="flex items-center justify-center px-1 checklist-grab-handle opacity-40 group-hover:opacity-70 transition-opacity"
            style={{ touchAction: "none" }}
          >
            <GripDots />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <ChecklistRow
            item={it}
            readOnly={readOnly}
            disableToggle={readOnly}
            externalRemove
            size="lg"
            indentGutter={false}
            focusItemId={focusItemId}
            focusToken={focusToken}
            focusCaret={focusCaret}
            onToggle={(checked, e) => {
              e?.stopPropagation();
              onToggle(it.id, checked);
            }}
            onChange={(txt) => onChangeText(it.id, txt)}
            onEnter={(opts) => onEnter(it.id, opts)}
            onBackspaceEmpty={() => onBackspaceEmpty(it.id)}
            onIndent={() => onIndent(it.id)}
            onOutdent={() => onOutdent(it.id)}
          />
        </div>
      </div>

      {!readOnly && (
        <button
          className="opacity-80 hover:opacity-100 ml-1.5 sm:ml-3 md:ml-2 -translate-x-2 transition-opacity text-gray-500 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 rounded-full flex items-center justify-center cursor-pointer w-6 h-6 text-lg font-semibold"
          data-tooltip={t("removeItem")}
          onClick={() => onRemove(it.id)}
        >
          ✕
        </button>
      )}
    </div>
  );
}
