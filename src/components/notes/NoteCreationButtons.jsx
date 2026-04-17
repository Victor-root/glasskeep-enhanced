import React from "react";
import { t } from "../../i18n";
import { TextNoteIcon, ChecklistIcon, BrushIcon } from "../../icons/index.jsx";

/**
 * Desktop-only note creation buttons.
 * Replaces the collapsed composer rectangle: clicking a button creates a
 * blank note of the matching type and opens the modal in edit mode
 * (see handleDirectText/Checklist/Draw in App.jsx).
 *
 * Each button is self-describing (icon tile + title + one-line description
 * + a subtle "+" pill on the right) and uses the app-wide `btn-gradient`
 * shimmer + scale animation on hover, matching the primary violet/indigo
 * buttons elsewhere in the UI.
 */
export default function NoteCreationButtons({
  onCreateText,
  onCreateChecklist,
  onCreateDraw,
}) {
  return (
    <div className="mb-8 flex gap-3">
      <CreationButton
        title={t("textNote")}
        description={t("textNoteDesc")}
        onClick={onCreateText}
        icon={<TextNoteIcon />}
        colorClasses="border-rose-500 bg-gradient-to-br from-rose-300 to-pink-400 text-rose-900 shadow-rose-300/50 hover:from-rose-400 hover:to-pink-500 hover:border-rose-600 hover:shadow-rose-400/70 dark:from-rose-700 dark:to-pink-800 dark:border-rose-500 dark:text-rose-50 dark:shadow-none dark:hover:from-rose-600 dark:hover:to-pink-700 dark:hover:border-rose-400"
        iconBg="bg-white/85 text-rose-600 dark:bg-rose-950/50 dark:text-rose-100"
      />
      <CreationButton
        title={t("checklist")}
        description={t("checklistDesc")}
        onClick={onCreateChecklist}
        icon={<ChecklistIcon />}
        colorClasses="border-emerald-500 bg-gradient-to-br from-emerald-300 to-green-400 text-emerald-900 shadow-emerald-300/50 hover:from-emerald-400 hover:to-green-500 hover:border-emerald-600 hover:shadow-emerald-400/70 dark:from-emerald-700 dark:to-green-800 dark:border-emerald-500 dark:text-emerald-50 dark:shadow-none dark:hover:from-emerald-600 dark:hover:to-green-700 dark:hover:border-emerald-400"
        iconBg="bg-white/85 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-100"
      />
      <CreationButton
        title={t("drawing")}
        description={t("drawingDesc")}
        onClick={onCreateDraw}
        icon={<BrushIcon />}
        colorClasses="border-orange-500 bg-gradient-to-br from-orange-300 to-amber-400 text-orange-900 shadow-orange-300/50 hover:from-orange-400 hover:to-amber-500 hover:border-orange-600 hover:shadow-orange-400/70 dark:from-orange-700 dark:to-amber-800 dark:border-orange-500 dark:text-orange-50 dark:shadow-none dark:hover:from-orange-600 dark:hover:to-amber-700 dark:hover:border-orange-400"
        iconBg="bg-white/85 text-orange-600 dark:bg-orange-950/50 dark:text-orange-100"
      />
    </div>
  );
}

function CreationButton({ title, description, onClick, icon, colorClasses, iconBg }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex-1 flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left shadow-md transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 btn-gradient ${colorClasses}`}
    >
      <span className={`inline-flex shrink-0 items-center justify-center w-10 h-10 rounded-lg ${iconBg}`}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold leading-tight truncate">{title}</span>
        <span className="block text-[11px] font-normal opacity-80 leading-tight truncate mt-0.5">{description}</span>
      </span>
      <PlusHint />
    </button>
  );
}

function PlusHint() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center w-6 h-6 rounded-full bg-white/80 text-current opacity-70 transition-all duration-200 group-hover:opacity-100 group-hover:scale-110 dark:bg-black/40"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </span>
  );
}
