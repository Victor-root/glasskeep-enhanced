import React from "react";
import { t } from "../../i18n";
import { TextNoteIcon, ChecklistIcon, BrushIcon } from "../../icons/index.jsx";

/**
 * Desktop-only note creation buttons.
 * Replaces the collapsed composer rectangle: clicking a button creates a
 * blank note of the matching type and opens the modal in edit mode
 * (see handleDirectText/Checklist/Draw in App.jsx).
 *
 * Each button is self-describing (icon + title + one-line description + a
 * subtle "+" hint on hover) so the user knows these are note-creation
 * actions at a glance — no extra header needed.
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
        colorClasses="border-rose-400 bg-gradient-to-br from-rose-200 to-pink-300 text-rose-800 hover:from-rose-100 hover:to-pink-200 hover:border-rose-300 hover:shadow-rose-300/60 dark:from-rose-700/80 dark:to-pink-800/70 dark:border-rose-500 dark:text-rose-50 dark:hover:from-rose-800/70 dark:hover:to-pink-900/60 dark:hover:border-rose-600"
        iconBg="bg-white/70 text-rose-600 dark:bg-rose-950/40 dark:text-rose-200"
      />
      <CreationButton
        title={t("checklist")}
        description={t("checklistDesc")}
        onClick={onCreateChecklist}
        icon={<ChecklistIcon />}
        colorClasses="border-emerald-400 bg-gradient-to-br from-emerald-200 to-green-300 text-emerald-800 hover:from-emerald-100 hover:to-green-200 hover:border-emerald-300 hover:shadow-emerald-300/60 dark:from-emerald-700/80 dark:to-green-800/70 dark:border-emerald-500 dark:text-emerald-50 dark:hover:from-emerald-800/70 dark:hover:to-green-900/60 dark:hover:border-emerald-600"
        iconBg="bg-white/70 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200"
      />
      <CreationButton
        title={t("drawing")}
        description={t("drawingDesc")}
        onClick={onCreateDraw}
        icon={<BrushIcon />}
        colorClasses="border-orange-400 bg-gradient-to-br from-orange-200 to-amber-300 text-orange-800 hover:from-orange-100 hover:to-amber-200 hover:border-orange-300 hover:shadow-orange-300/60 dark:from-orange-700/80 dark:to-amber-800/70 dark:border-orange-500 dark:text-orange-50 dark:hover:from-orange-800/70 dark:hover:to-amber-900/60 dark:hover:border-orange-600"
        iconBg="bg-white/70 text-orange-600 dark:bg-orange-950/40 dark:text-orange-200"
      />
    </div>
  );
}

function CreationButton({ title, description, onClick, icon, colorClasses, iconBg }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex-1 flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 ${colorClasses}`}
    >
      <span className={`inline-flex shrink-0 items-center justify-center w-10 h-10 rounded-lg ${iconBg}`}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold leading-tight truncate">{title}</span>
        <span className="block text-[11px] font-normal opacity-75 leading-tight truncate mt-0.5">{description}</span>
      </span>
      <PlusHint />
    </button>
  );
}

function PlusHint() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center w-6 h-6 rounded-full bg-white/50 text-current opacity-60 transition-all duration-200 group-hover:opacity-100 group-hover:scale-110 dark:bg-black/25"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </span>
  );
}
