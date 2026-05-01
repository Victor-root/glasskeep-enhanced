import React from "react";
import { createPortal } from "react-dom";
import { t } from "../../i18n";

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
export const DEFAULT_SECTION_COLOR = "indigo";

export function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function ColorPicker({ colorKey, onChange, onClose, onOutsideClose, triggerRef }) {
  const ref = React.useRef(null);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });

  React.useLayoutEffect(() => {
    const place = () => {
      const a = triggerRef?.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      // 5 cols × 32px + 4 gaps × 8px + padding 2×8px = 216px
      const panelW = 216;
      let left = Math.min(r.left, window.innerWidth - panelW - 8);
      left = Math.max(8, left);
      setPos({ top: r.bottom + 6, left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [triggerRef]);

  React.useEffect(() => {
    const onPointerDown = (e) => {
      if (ref.current?.contains(e.target)) return;
      if (triggerRef?.current?.contains(e.target)) return;
      e.preventDefault();
      onOutsideClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onOutsideClose, triggerRef]);

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999 }}
      className="p-2 rounded-lg shadow-xl bg-white dark:bg-gray-800 border border-[var(--border-light)]"
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 2rem)", gap: "0.5rem" }}>
        {/* No-color option */}
        <button
          type="button"
          aria-label="No color"
          onClick={() => { onChange("none"); onClose(); }}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none"
          style={{
            boxShadow: colorKey === "none" ? "0 0 0 2px white, 0 0 0 3.5px #94a3b8" : "none",
          }}
        >
          <svg viewBox="0 0 24 24" className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        </button>
        {SECTION_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-label={c.key}
            onClick={() => { onChange(c.key); onClose(); }}
            className="w-8 h-8 rounded-full transition-transform hover:scale-110 focus:outline-none"
            style={{
              background: c.hex,
              boxShadow: c.key === colorKey ? `0 0 0 2px white, 0 0 0 3.5px ${c.hex}` : "none",
            }}
          />
        ))}
      </div>
    </div>,
    document.body
  );
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
}) {
  const [editing, setEditing] = React.useState(!section.title);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const inputRef = React.useRef(null);
  const confirmTimerRef = React.useRef(null);
  const enterPressedRef = React.useRef(false);
  const triggerBtnRef = React.useRef(null);
  const suppressNextClickRef = React.useRef(false);

  // Persistent click suppressor — stays active as long as SectionHeader is mounted,
  // so it catches the click that fires after ColorPicker unmounts on outside-close.
  React.useEffect(() => {
    const handler = (e) => {
      if (!suppressNextClickRef.current) return;
      suppressNextClickRef.current = false;
      e.stopPropagation();
      e.preventDefault();
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  const colorKey = section.color ?? "none";
  const colorHex = SECTION_COLORS.find((c) => c.key === colorKey)?.hex ?? null;

  React.useEffect(() => {
    if (!editing || !window.visualViewport) return;
    let prevH = window.visualViewport.height;
    const onResize = () => {
      const h = window.visualViewport.height;
      if (h - prevH > 150) inputRef.current?.blur();
      prevH = h;
    };
    window.visualViewport.addEventListener("resize", onResize);
    return () => window.visualViewport.removeEventListener("resize", onResize);
  }, [editing]);

  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  React.useEffect(() => {
    if (!confirmingDelete) return;
    confirmTimerRef.current = setTimeout(() => setConfirmingDelete(false), 3000);
    return () => {
      if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
    };
  }, [confirmingDelete]);

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
    background: hexAlpha(colorHex, 0.12),
    borderBottom: `1px solid ${hexAlpha(colorHex, 0.2)}`,
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
          <div className="grid grid-cols-2 gap-0.5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full" />
            ))}
          </div>
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
            <ColorPicker
              colorKey={colorKey}
              onChange={onColorChange}
              onClose={() => setPickerOpen(false)}
              onOutsideClose={() => { suppressNextClickRef.current = true; setPickerOpen(false); }}
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
          className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-200 cursor-text py-0"
          onClick={() => setEditing(true)}
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
    </div>
  );
}
