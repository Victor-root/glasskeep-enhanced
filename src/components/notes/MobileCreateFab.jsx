import React, { useState, useRef, useEffect } from "react";
import { t } from "../../i18n";
import { TextNoteIcon, ChecklistIcon, BrushIcon } from "../../icons/index.jsx";

/**
 * MobileCreateFab — Mobile-only floating action button for note creation.
 *
 * Replaces the in-page mobile composer with a bottom-right "+" FAB that
 * unfolds the three creation entries (text / checklist / drawing) as
 * icon-only circular buttons stacked above it. Tapping one forwards to
 * the same handleDirect* callbacks the desktop creation buttons use —
 * opening the modal over a deferred draft (see useDraftNote.js).
 *
 * Outside click or Esc collapses the dial. Each speed-dial entry carries
 * the same gradient identity as its desktop sibling so the mobile UI stays
 * visually coherent with the rest of the app.
 */
export default function MobileCreateFab({
  onCreateText,
  onCreateChecklist,
  onCreateDraw,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (fn) => () => {
    setOpen(false);
    fn?.();
  };

  return (
    <div
      ref={containerRef}
      className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3"
    >
      <div
        className={`flex flex-col items-end gap-3 transition-all duration-200 ease-out ${
          open
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-3 pointer-events-none"
        }`}
      >
        <FabDialButton
          onClick={pick(onCreateText)}
          label={t("textNote")}
          icon={<TextNoteIcon />}
          colorClasses="border-indigo-400 bg-gradient-to-br from-indigo-200 to-violet-300 text-indigo-700 shadow-indigo-300/40 dark:from-indigo-800 dark:to-violet-900 dark:border-indigo-500 dark:text-indigo-100 dark:shadow-none"
        />
        <FabDialButton
          onClick={pick(onCreateChecklist)}
          label={t("checklist")}
          icon={<ChecklistIcon />}
          colorClasses="border-teal-300 bg-gradient-to-br from-teal-200 to-emerald-300 text-teal-700 shadow-teal-300/40 dark:from-teal-800 dark:to-emerald-900 dark:border-teal-500 dark:text-teal-100 dark:shadow-none"
        />
        <FabDialButton
          onClick={pick(onCreateDraw)}
          label={t("drawing")}
          icon={<BrushIcon />}
          colorClasses="border-orange-300 bg-gradient-to-br from-rose-200 to-orange-200 text-rose-700 shadow-rose-300/40 dark:from-rose-800 dark:to-orange-900 dark:border-orange-500 dark:text-rose-100 dark:shadow-none"
        />
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("addNote")}
        aria-expanded={open}
        className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-500/40 active:scale-95 transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 btn-gradient"
      >
        <svg
          className={`w-7 h-7 transition-transform duration-200 ${open ? "rotate-45" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}

function FabDialButton({ onClick, label, icon, colorClasses }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`w-12 h-12 rounded-full border-2 shadow-md active:scale-95 transition-transform duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${colorClasses}`}
    >
      {icon}
    </button>
  );
}
