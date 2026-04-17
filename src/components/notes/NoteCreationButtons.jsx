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
    <div className="mb-8">
      <div className="mb-3 flex items-baseline gap-2 px-1">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-indigo-600/90 dark:text-indigo-300/90">
          {t("createNotePrompt")}
        </h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {t("createNoteHint")}
        </span>
      </div>
      <div className="flex gap-3">
        <CreationButton
          label={t("textNote")}
          tooltip={t("textNote")}
          onClick={onCreateText}
          icon={<TextNoteIcon />}
          colorClasses="border-rose-300 bg-gradient-to-br from-rose-100 to-pink-200 text-rose-700 hover:from-rose-200 hover:to-pink-300 hover:border-rose-400 hover:shadow-rose-300/60 dark:from-rose-800/70 dark:to-pink-900/60 dark:border-rose-600 dark:text-rose-100 dark:hover:from-rose-700/80 dark:hover:to-pink-800/70"
        />
        <CreationButton
          label={t("checklist")}
          tooltip={t("checklist")}
          onClick={onCreateChecklist}
          icon={<ChecklistIcon />}
          colorClasses="border-emerald-300 bg-gradient-to-br from-emerald-100 to-green-200 text-emerald-700 hover:from-emerald-200 hover:to-green-300 hover:border-emerald-400 hover:shadow-emerald-300/60 dark:from-emerald-800/70 dark:to-green-900/60 dark:border-emerald-600 dark:text-emerald-100 dark:hover:from-emerald-700/80 dark:hover:to-green-800/70"
        />
        <CreationButton
          label={t("drawing")}
          tooltip={t("drawing")}
          onClick={onCreateDraw}
          icon={<BrushIcon />}
          colorClasses="border-orange-300 bg-gradient-to-br from-orange-100 to-amber-200 text-orange-700 hover:from-orange-200 hover:to-amber-300 hover:border-orange-400 hover:shadow-orange-300/60 dark:from-orange-800/70 dark:to-amber-900/60 dark:border-orange-600 dark:text-orange-100 dark:hover:from-orange-700/80 dark:hover:to-amber-800/70"
        />
      </div>
    </div>
  );
}

function CreationButton({ label, tooltip, onClick, icon, colorClasses }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tooltip={tooltip}
      className={`flex-1 flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl border-2 font-semibold text-sm shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 ${colorClasses}`}
    >
      <span className="inline-flex shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
