import React from "react";
import { t } from "../../i18n";

/**
 * Inline-editable section header with a drag handle.
 * - Click the title → edit it inline. Enter commits + advances to the
 *   first item of the section (via onEnter).
 * - Drag handle (six dots) → move the whole section block (wired in
 *   ChecklistEditor through onHandlePointerDown).
 * - Trash button → two-step delete confirmation: first click swaps the
 *   icon to a red check; second click confirms and triggers onRemove.
 *   The pending state cancels on blur-out (click anywhere else) after
 *   a short delay so the section isn't accidentally removed.
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
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const inputRef = React.useRef(null);
  const confirmTimerRef = React.useRef(null);

  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Auto-cancel pending confirmation after 3 s of inaction.
  React.useEffect(() => {
    if (!confirmingDelete) return;
    confirmTimerRef.current = setTimeout(() => {
      setConfirmingDelete(false);
    }, 3000);
    return () => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    };
  }, [confirmingDelete]);

  const commit = (value) => {
    const next = (value ?? "").trim();
    onRename(next);
    setEditing(false);
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);
    onRemove?.();
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
        type="button"
        onClick={handleDeleteClick}
        data-tooltip={confirmingDelete ? t("confirmRemoveSection") : t("removeSection")}
        aria-label={confirmingDelete ? t("confirmRemoveSection") : t("removeSection")}
        className="flex items-center justify-center w-7 h-7 rounded-md text-red-500 hover:text-red-600 hover:bg-red-500/10 dark:hover:bg-red-500/20 transition-colors cursor-pointer"
      >
        {confirmingDelete ? (
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
          </svg>
        )}
      </button>
    </div>
  );
}
