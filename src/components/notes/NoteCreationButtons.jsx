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
        colorClasses="border-indigo-600 bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-indigo-300/50 hover:from-indigo-600 hover:to-violet-700 hover:border-indigo-700 hover:shadow-indigo-400/60 dark:from-indigo-600 dark:to-violet-700 dark:border-indigo-500 dark:text-white dark:shadow-none dark:hover:from-indigo-700 dark:hover:to-violet-800 dark:hover:border-indigo-400"
        iconBg="bg-white/95 text-indigo-600 dark:bg-white/90 dark:text-indigo-700"
        plusHintClasses="bg-black/25 text-white dark:bg-black/30"
      />
      <CreationButton
        title={t("checklist")}
        description={t("checklistDesc")}
        onClick={onCreateChecklist}
        icon={<ChecklistIcon />}
        colorClasses="border-emerald-400 bg-gradient-to-br from-emerald-200 to-green-300 text-emerald-950 shadow-emerald-200/50 hover:from-emerald-300 hover:to-green-400 hover:border-emerald-500 hover:shadow-emerald-300/60 dark:from-emerald-800 dark:to-green-900 dark:border-emerald-500 dark:text-emerald-50 dark:shadow-none dark:hover:from-emerald-700 dark:hover:to-green-800 dark:hover:border-emerald-400"
        iconBg="bg-white/85 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-100"
      />
      <CreationButton
        title={t("drawing")}
        description={t("drawingDesc")}
        onClick={onCreateDraw}
        icon={<BrushIcon />}
        colorClasses="border-orange-400 bg-gradient-to-br from-orange-200 to-amber-300 text-orange-950 shadow-orange-200/50 hover:from-orange-300 hover:to-amber-400 hover:border-orange-500 hover:shadow-orange-300/60 dark:from-orange-800 dark:to-amber-900 dark:border-orange-500 dark:text-orange-50 dark:shadow-none dark:hover:from-orange-700 dark:hover:to-amber-800 dark:hover:border-orange-400"
        iconBg="bg-white/85 text-orange-600 dark:bg-orange-950/50 dark:text-orange-100"
      />
    </div>
  );
}

function CreationButton({ title, description, onClick, icon, colorClasses, iconBg, plusHintClasses }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex-1 flex items-center gap-2.5 px-3 py-3 rounded-xl border-2 text-left shadow-md transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 btn-gradient ${colorClasses}`}
    >
      <span className={`inline-flex shrink-0 items-center justify-center w-9 h-9 rounded-lg ${iconBg}`}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold leading-tight">{title}</span>
        <span className="block text-[11px] font-normal opacity-80 leading-snug mt-0.5">{description}</span>
      </span>
      <PlusHint extraClasses={plusHintClasses} />
    </button>
  );
}

function PlusHint({ extraClasses = "bg-white/80 text-current dark:bg-black/40" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center w-6 h-6 rounded-full opacity-70 transition-all duration-200 group-hover:opacity-100 group-hover:scale-110 ${extraClasses}`}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </span>
  );
}
