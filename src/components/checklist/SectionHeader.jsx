import React from "react";
import { t } from "../../i18n";

/**
 * Inline-editable section header with a drag handle.
 * - Click the title → edit it inline. Enter commits + advances to the
 *   first item of the section (via onEnter).
 * - Drag handle (six dots) → move the whole section block (wired in
 *   ChecklistEditor through onHandlePointerDown).
 * - ✕ button → delete the section and all its items (cascade).
 */
export default function SectionHeader({
  section,
  onRename,
  onRemove,
  onEnter,
  onHandlePointerDown,
  onHandlePointerMove,
  onHandlePointerUp,
  onHandlePointerCancel,
}) {
  const [editing, setEditing] = React.useState(!section.title);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = (value) => {
    const next = (value ?? "").trim();
    onRename(next);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 group pt-2">
      {onHandlePointerDown && (
        <div
          onPointerDown={(e) => onHandlePointerDown(section.id, e)}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerCancel}
          className="flex items-center justify-center px-1 checklist-grab-handle opacity-40 group-hover:opacity-70 transition-opacity cursor-grab"
          style={{ touchAction: "none" }}
          data-tooltip={t("moveSection")}
        >
          <div className="grid grid-cols-2 gap-0.5">
            <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
            <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
            <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
            <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
            <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
            <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
          </div>
        </div>
      )}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          defaultValue={section.title}
          className="flex-1 bg-transparent text-sm font-semibold tracking-wide text-gray-700 dark:text-gray-200 focus:outline-none border-0 border-b border-[var(--border-light)] px-0 py-1"
          placeholder={t("sectionTitlePlaceholder")}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(e.currentTarget.value);
              onEnter?.();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
        />
      ) : (
        <h4
          className="flex-1 text-sm font-semibold tracking-wide text-gray-700 dark:text-gray-200 cursor-text py-1"
          onClick={() => setEditing(true)}
        >
          {section.title || t("sectionTitlePlaceholder")}
        </h4>
      )}
      <button
        onClick={onRemove}
        data-tooltip={t("removeSection")}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 rounded-full border border-[var(--border-light)] flex items-center justify-center cursor-pointer w-6 h-6 text-sm"
      >
        ✕
      </button>
    </div>
  );
}
