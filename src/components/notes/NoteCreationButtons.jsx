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
        colorClasses="border-indigo-400 bg-gradient-to-br from-indigo-200 to-violet-300 text-indigo-950 shadow-indigo-200/50 hover:from-indigo-300 hover:to-violet-400 hover:border-indigo-500 hover:shadow-indigo-300/60 dark:from-indigo-800 dark:to-violet-900 dark:border-indigo-500 dark:text-indigo-50 dark:shadow-none dark:hover:from-indigo-700 dark:hover:to-violet-800 dark:hover:border-indigo-400"
        iconBg="bg-white/85 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-100"
      />
      <CreationButton
        title={t("checklist")}
        description={t("checklistDesc")}
        onClick={onCreateChecklist}
        icon={<ChecklistIcon />}
        colorClasses="border-[#a85bcc] bg-[linear-gradient(to_bottom_right,#d6a5ed,#be76de)] text-[#3a1850] shadow-purple-200/50 hover:bg-[linear-gradient(to_bottom_right,#c98ce4,#a85bcc)] hover:border-[#9343b6] hover:shadow-purple-300/60 dark:bg-[linear-gradient(to_bottom_right,#5e3a78,#422856)] dark:border-[#7d4699] dark:text-[#f3e5fb] dark:shadow-none dark:hover:bg-[linear-gradient(to_bottom_right,#6b4587,#523265)] dark:hover:border-[#a85bcc]"
        iconBg="bg-white/85 text-[#a85bcc] dark:bg-[#3a1850]/50 dark:text-[#f3e5fb]"
      />
      <CreationButton
        title={t("drawing")}
        description={t("drawingDesc")}
        onClick={onCreateDraw}
        icon={<BrushIcon />}
        colorClasses="border-sky-400 bg-gradient-to-br from-sky-200 to-blue-300 text-sky-950 shadow-sky-200/50 hover:from-sky-300 hover:to-blue-400 hover:border-sky-500 hover:shadow-sky-300/60 dark:from-sky-800 dark:to-blue-900 dark:border-sky-500 dark:text-sky-50 dark:shadow-none dark:hover:from-sky-700 dark:hover:to-blue-800 dark:hover:border-sky-400"
        iconBg="bg-white/85 text-sky-600 dark:bg-sky-950/50 dark:text-sky-100"
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
