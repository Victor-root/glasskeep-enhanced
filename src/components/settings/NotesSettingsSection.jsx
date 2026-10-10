import React from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { RowIcon, SettingsSubHeading } from "../common/SettingsAccordion.jsx";

// Notes section of the Settings panel: read mode, editor toolbar,
// typography, paste behaviour and the checklist sub-group.
export default function NotesSettingsSection({
  readModeEnabled,
  setReadModeEnabled,
  editorToolbarMode,
  setEditorToolbarMode,
  setTypographyModalOpen,
  pasteMode,
  setPasteMode,
  checklistInsertPosition,
  setChecklistInsertPosition,
  checklistRemoveSectionBehavior,
  setChecklistRemoveSectionBehavior,
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 px-3">
        <div className="flex items-center gap-3 min-w-0">
          <RowIcon icon={TI.Eye} />
          <div className="min-w-0">
            <div className="font-medium">{t("readModeOption")}</div>
            <div className="text-sm text-gray-500 whitespace-pre-line">{t("readModeOptionDesc")}</div>
          </div>
        </div>
        <button
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full self-end sm:self-auto transition-colors ${
            readModeEnabled
              ? "bg-[var(--gk-switch-on)]"
              : "bg-gray-300 dark:bg-gray-600"
          }`}
          onClick={() => setReadModeEnabled(!readModeEnabled)}
          aria-pressed={readModeEnabled}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              readModeEnabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 px-3">
        <div className="flex items-center gap-3 min-w-0">
          <RowIcon icon={TI.Heading} />
          <div className="min-w-0">
            <div className="font-medium">{t("editorToolbarMode")}</div>
            <div className="text-sm text-gray-500">
              {editorToolbarMode === "simple"
                ? t("editorToolbarModeSimpleDesc")
                : t("editorToolbarModeAdvancedDesc")}
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 inline-flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 self-end sm:self-auto">
          <button
            className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
              editorToolbarMode === "simple"
                ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
            onClick={() => setEditorToolbarMode("simple")}
          >
            {t("editorToolbarModeSimple")}
          </button>
          <button
            className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
              editorToolbarMode === "advanced"
                ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
            onClick={() => setEditorToolbarMode("advanced")}
          >
            {t("editorToolbarModeAdvanced")}
          </button>
        </div>
      </div>

      {/* Rich-text editor typography presets: opens its own
          full-viewport modal so the 6 block cards have enough
          room to show size / weight / colour / italic / underline
          controls without being cut off on the narrow side sheet. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 px-3">
        <div className="flex items-center gap-3 min-w-0">
          <RowIcon icon={TI.Typography} />
          <div className="min-w-0">
            <div className="font-medium">{t("typographyTitle")}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{t("typographyDesc")}</div>
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 self-end sm:self-auto px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
          onClick={() => setTypographyModalOpen(true)}
        >
          {t("typographyOpen")}
        </button>
      </div>

      <div className="flex flex-col gap-2 px-3">
        <div className="flex items-center gap-3 min-w-0">
          <RowIcon icon={TI.Clipboard} />
          <div className="min-w-0">
            <div className="font-medium">{t("pasteBehaviorTitle")}</div>
            <div className="text-sm text-gray-500">
              {pasteMode === "plain"
                ? t("pasteBehaviorPlainDesc")
                : t("pasteBehaviorRichDesc")}
            </div>
          </div>
        </div>
        <div className="self-end inline-flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
          <button
            className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
              pasteMode === "rich"
                ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
            onClick={() => setPasteMode("rich")}
          >
            {t("pasteBehaviorRich")}
          </button>
          <button
            className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
              pasteMode === "plain"
                ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
            onClick={() => setPasteMode("plain")}
          >
            {t("pasteBehaviorPlain")}
          </button>
        </div>
      </div>

      <SettingsSubHeading label={t("checklistSettings")} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 px-3">
        <div className="flex items-center gap-3 min-w-0">
          <RowIcon icon={TI.IndentIncrease} />
          <div className="min-w-0">
            <div className="font-medium">{t("checklistInsertPosition")}</div>
            <div className="text-sm text-gray-500">{t("checklistInsertPositionDesc")}</div>
          </div>
        </div>
        <div className="flex-shrink-0 inline-flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 self-end sm:self-auto">
          <button
            className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
              checklistInsertPosition === "top"
                ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
            onClick={() => setChecklistInsertPosition("top")}
          >
            {t("checklistInsertTop")}
          </button>
          <button
            className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
              checklistInsertPosition === "bottom"
                ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
            onClick={() => setChecklistInsertPosition("bottom")}
          >
            {t("checklistInsertBottom")}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 px-3">
        <div className="flex items-center gap-3 min-w-0">
          <RowIcon icon={TI.Filter2Question} />
          <div className="min-w-0">
            <div className="font-medium">{t("checklistRemoveSection")}</div>
            <div className="text-sm text-gray-500">{t("checklistRemoveSectionDesc")}</div>
          </div>
        </div>
        <div className="flex-shrink-0 inline-flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 self-end sm:self-auto">
          <button
            className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
              checklistRemoveSectionBehavior === "cascade"
                ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
            onClick={() => setChecklistRemoveSectionBehavior("cascade")}
          >
            {t("checklistRemoveSectionCascade")}
          </button>
          <button
            className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
              checklistRemoveSectionBehavior === "keep"
                ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
            onClick={() => setChecklistRemoveSectionBehavior("keep")}
          >
            {t("checklistRemoveSectionKeep")}
          </button>
        </div>
      </div>
    </div>
  );
}
