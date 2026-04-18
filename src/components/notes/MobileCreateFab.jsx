import React, { useRef, useEffect } from "react";
import { t } from "../../i18n";
import { TextNoteIcon, ChecklistIcon, BrushIcon } from "../../icons/index.jsx";

export default function MobileCreateFab({
  open,
  setOpen,
  onCreateText,
  onCreateChecklist,
  onCreateDraw,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    // Close in the click capture phase at document level. This fires BEFORE any
    // element's onClick. stopPropagation prevents React from ever dispatching
    // the synthetic click to note cards. We don't call setOpen on
    // mousedown/touchstart, so the backdrop stays pointer-events:auto for the
    // whole tap sequence — the click target is the backdrop, not a note.
    const onClickCapture = (e) => {
      // The FAB wrapper spans the vertical space including the hidden dial
      // buttons, so plain containerRef.contains(target) treats empty padding
      // clicks as "inside". Only preserve clicks that hit an actual button
      // (FAB toggle or a dial button) inside the container — anything else,
      // including the wrapper itself, counts as outside and closes the menu.
      const btn = e.target.closest?.("button");
      if (btn && containerRef.current?.contains(btn)) return;
      e.stopPropagation();
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  const pick = (fn) => () => {
    setOpen(false);
    fn?.();
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-30 transition-all duration-200 ease-out bg-black/30 backdrop-blur-[2px] ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        ref={containerRef}
        className="fixed z-40 flex flex-col items-end gap-3 pointer-events-none"
        style={{
          bottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))",
          right: "max(1.5rem, calc(env(safe-area-inset-right) + 1rem))",
        }}
      >
      <div
        className={`flex flex-col items-end gap-3 transition-all duration-200 ease-out ${
          open
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-3 pointer-events-none"
        }`}
      >
        <FabDialButton
          onClick={pick(onCreateDraw)}
          label={t("drawing")}
          title={t("drawing")}
          description={t("drawingDesc")}
          icon={<BrushIcon />}
          colorClasses="border-orange-300 bg-gradient-to-br from-rose-200 to-orange-200 text-rose-900 dark:from-rose-800 dark:to-orange-900 dark:border-orange-500 dark:text-rose-50"
          iconBg="bg-white/85 text-rose-600 dark:bg-rose-950/50 dark:text-rose-100"
        />
        <FabDialButton
          onClick={pick(onCreateChecklist)}
          label={t("checklist")}
          title={t("checklist")}
          description={t("checklistDesc")}
          icon={<ChecklistIcon />}
          colorClasses="border-teal-300 bg-gradient-to-br from-teal-200 to-emerald-300 text-teal-900 dark:from-teal-800 dark:to-emerald-900 dark:border-teal-500 dark:text-teal-50"
          iconBg="bg-white/85 text-teal-700 dark:bg-teal-950/50 dark:text-teal-100"
        />
        <FabDialButton
          onClick={pick(onCreateText)}
          label={t("textNote")}
          title={t("textNote")}
          description={t("textNoteDesc")}
          icon={<TextNoteIcon />}
          colorClasses="border-indigo-400 bg-gradient-to-br from-indigo-200 to-violet-300 text-indigo-900 dark:from-indigo-800 dark:to-violet-900 dark:border-indigo-500 dark:text-indigo-50"
          iconBg="bg-white/85 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-100"
        />
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("addNote")}
        aria-expanded={open}
        className="pointer-events-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white active:scale-95 transition-all duration-200 flex items-center justify-center focus:outline-none btn-gradient"
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
    </>
  );
}

function FabDialButton({ onClick, label, icon, colorClasses, iconBg, title, description }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`w-44 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 active:scale-[0.98] transition-transform duration-200 text-left focus:outline-none ${colorClasses}`}
    >
      <span className={`inline-flex shrink-0 items-center justify-center w-9 h-9 rounded-lg ${iconBg}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight">{title}</span>
        <span className="block text-[11px] font-normal opacity-80 leading-snug mt-0.5">{description}</span>
      </span>
    </button>
  );
}
