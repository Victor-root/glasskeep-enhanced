import React from "react";
import { t } from "../../i18n";
import { TextNoteIcon, ChecklistIcon, BrushIcon } from "../../icons/index.jsx";

/**
 * Desktop-only note creation buttons.
 * Replaces the collapsed composer rectangle: clicking a button creates a
 * blank note of the matching type and opens the modal in edit mode
 * (see handleDirectText/Checklist/Draw in App.jsx).
 */
export default function NoteCreationButtons({
  onCreateText,
  onCreateChecklist,
  onCreateDraw,
}) {
  return (
    <div className="mb-8 flex gap-3">
      <CreationButton
        label={t("textNote")}
        tooltip={t("textNote")}
        onClick={onCreateText}
        icon={<TextNoteIcon />}
        colorClasses="border-rose-200/80 bg-gradient-to-br from-rose-50 to-pink-50/60 text-rose-500 hover:from-rose-100 hover:to-pink-100 hover:border-rose-300 hover:shadow-rose-200/50 dark:from-rose-900/25 dark:to-pink-900/10 dark:border-rose-700/50 dark:text-rose-300 dark:hover:from-rose-800/40 dark:hover:to-pink-800/25"
      />
      <CreationButton
        label={t("checklist")}
        tooltip={t("checklist")}
        onClick={onCreateChecklist}
        icon={<ChecklistIcon />}
        colorClasses="border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-green-50/60 text-emerald-600 hover:from-emerald-100 hover:to-green-100 hover:border-emerald-300 hover:shadow-emerald-200/50 dark:from-emerald-900/25 dark:to-green-900/10 dark:border-emerald-700/50 dark:text-emerald-300 dark:hover:from-emerald-800/40 dark:hover:to-green-800/25"
      />
      <CreationButton
        label={t("drawing")}
        tooltip={t("drawing")}
        onClick={onCreateDraw}
        icon={<BrushIcon />}
        colorClasses="border-orange-200/80 bg-gradient-to-br from-orange-50 to-amber-50/60 text-orange-500 hover:from-orange-100 hover:to-amber-100 hover:border-orange-300 hover:shadow-orange-200/50 dark:from-orange-900/25 dark:to-amber-900/10 dark:border-orange-700/50 dark:text-orange-300 dark:hover:from-orange-800/40 dark:hover:to-amber-800/25"
      />
    </div>
  );
}

function CreationButton({ label, tooltip, onClick, icon, colorClasses }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tooltip={tooltip}
      className={`flex-1 flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl border-2 font-semibold text-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 ${colorClasses}`}
    >
      <span className="inline-flex shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
