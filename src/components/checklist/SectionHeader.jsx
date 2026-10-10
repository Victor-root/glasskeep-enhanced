import React from "react";
import { t } from "../../i18n";
import { useSwallowClosingClick } from "../../hooks/useSwallowClosingClick.js";
import useBlurOnKeyboardClose from "../../hooks/useBlurOnKeyboardClose.js";
import useTimedConfirm from "../../hooks/useTimedConfirm.js";
import { useDark } from "./useDark.js";
import SectionColorPicker from "./SectionColorPicker.jsx";
import GripDots from "./GripDots.jsx";

// eslint-disable-next-line react-refresh/only-export-components -- also imported from this module by notes/NoteCard.jsx
export const SECTION_COLORS = [
  { key: "slate",   hex: "#64748b" },
  { key: "indigo",  hex: "#6366f1" },
  { key: "violet",  hex: "#8b5cf6" },
  { key: "sky",     hex: "#0ea5e9" },
  { key: "teal",    hex: "#0d9488" },
  { key: "emerald", hex: "#10b981" },
  { key: "amber",   hex: "#f59e0b" },
  { key: "rose",    hex: "#f43f5e" },
];

// eslint-disable-next-line react-refresh/only-export-components -- also imported from this module by notes/NoteCard.jsx
export function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Inline-editable section header with color picker, drag handle, collapse, and delete.
 */
export default function SectionHeader({
  section,
  onRename,
  onRemove,
  onEnter,
  onColorChange,
  onHandlePointerDown,
  onHandlePointerMove,
  onHandlePointerUp,
  onHandlePointerCancel,
  collapsed = false,
  onToggleCollapse,
  count,
  readOnly = false,
}) {
  const [editing, setEditing] = React.useState(!readOnly && !section.title);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const inputRef = React.useRef(null);
  const enterPressedRef = React.useRef(false);
  const triggerBtnRef = React.useRef(null);
  const swallowClickOf = useSwallowClosingClick();

  const dark = useDark();
  const colorKey = section.color ?? "none";
  const colorHex = SECTION_COLORS.find((c) => c.key === colorKey)?.hex ?? null;

  useBlurOnKeyboardClose(editing, inputRef);

  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const [confirmingDelete, setConfirmingDelete] = useTimedConfirm();

  const commit = (value) => {
    onRename((value ?? "").trim());
    setEditing(false);
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    setConfirmingDelete(false);
    onRemove?.();
  };

  const headerStyle = colorHex ? {
    background: hexAlpha(colorHex, dark ? 0.22 : 0.12),
    borderBottom: `1px solid ${hexAlpha(colorHex, dark ? 0.35 : 0.2)}`,
  } : {};

  const countStyle = colorHex ? {
    background: "#fff",
    color: colorHex,
  } : {
    background: "#fff",
    color: "rgba(0,0,0,0.5)",
  };

  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5"
      style={headerStyle}
    >
      {/* Drag handle */}
      {onHandlePointerDown && (
        <div
          onPointerDown={(e) => onHandlePointerDown(section.id, e)}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerCancel}
          className="flex items-center justify-center px-0.5 checklist-grab-handle opacity-40 hover:opacity-70 transition-opacity cursor-grab flex-shrink-0"
          style={{ touchAction: "none" }}
          data-tooltip={t("moveSection")}
        >
          <GripDots />
        </div>
      )}

      {/* Color picker trigger */}
      {onColorChange && (
        <div className="relative flex-shrink-0">
          <button
            ref={triggerBtnRef}
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className={`w-4 h-4 sm:w-3.5 sm:h-3.5 rounded-full transition-transform hover:scale-110 focus:outline-none flex-shrink-0 flex items-center justify-center${colorHex ? "" : " border-2 border-gray-300 dark:border-gray-500"}`}
            style={colorHex ? { background: colorHex } : undefined}
            aria-label={t("sectionColor")}
            data-tooltip={t("sectionColor")}
          >
          </button>
          {pickerOpen && (
            <SectionColorPicker
              colors={SECTION_COLORS}
              colorKey={colorKey}
              onChange={onColorChange}
              onClose={() => setPickerOpen(false)}
              onOutsideClose={(e) => { swallowClickOf(e); setPickerOpen(false); }}
              triggerRef={triggerBtnRef}
            />
          )}
        </div>
      )}

      {/* Collapse chevron */}
      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center justify-center w-5 h-5 flex-shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label={collapsed ? t("expandSection") : t("collapseSection")}
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200${collapsed ? " -rotate-90" : ""}`}
            fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Title / edit input */}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          defaultValue={section.title}
          className="flex-1 bg-transparent text-sm font-semibold text-gray-700 dark:text-gray-200 focus:outline-none border-0 border-b border-[var(--border-light)] px-0 py-0"
          placeholder={t("sectionTitlePlaceholder")}
          onBlur={(e) => {
            if (enterPressedRef.current) { enterPressedRef.current = false; return; }
            commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const val = (e.currentTarget.value ?? "").trim();
              enterPressedRef.current = true;
              setEditing(false);
              onEnter?.(val);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
        />
      ) : (
        <h4
          className={`flex-1 text-sm font-semibold text-gray-700 dark:text-gray-200 py-0${readOnly ? "" : " cursor-text"}`}
          onClick={readOnly ? undefined : () => setEditing(true)}
        >
          {section.title || t("sectionTitlePlaceholder")}
        </h4>
      )}

      {/* Item count badge */}
      {count !== undefined && (
        <span
          className="text-xs font-medium flex-shrink-0 tabular-nums px-1.5 py-0.5 rounded-full"
          style={countStyle}
        >
          {count}
        </span>
      )}

      {/* Delete button */}
      {!readOnly && (
        <button
          type="button"
          onClick={handleDeleteClick}
          data-tooltip={confirmingDelete ? t("confirmRemoveSection") : t("removeSection")}
          aria-label={confirmingDelete ? t("confirmRemoveSection") : t("removeSection")}
          className="flex items-center justify-center w-6 h-6 rounded text-red-500 hover:text-red-600 hover:bg-red-500/10 dark:hover:bg-red-500/20 transition-colors cursor-pointer flex-shrink-0"
        >
          {confirmingDelete ? (
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
