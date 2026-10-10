import React from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { RowIcon } from "../common/SettingsAccordion.jsx";

// Data management section of the Settings panel: exports, imports, the
// secret key download and the note order reset (whose confirmation
// dialog is rendered by SettingsPanel).
export default function DataSettingsSection({
  dark,
  onClose,
  onExportAll,
  onImportAll,
  onImportGKeep,
  onImportMd,
  onDownloadSecretKey,
  onOpenResetNoteOrder,
}) {
  return (
    <div className="space-y-3">
      <button
        className={`flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
        onClick={() => {
          onClose();
          onExportAll?.();
        }}
      >
        <RowIcon icon={TI.Upload} />
        <div className="min-w-0">
          <div className="font-medium">{t("exportAllNotesJson")}</div>
          <div className="text-sm text-gray-500">{t("downloadAllNotesJson")}</div>
        </div>
      </button>

      <button
        className={`flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
        onClick={() => {
          onClose();
          onImportAll?.();
        }}
      >
        <RowIcon icon={TI.Download} />
        <div className="min-w-0">
          <div className="font-medium">{t("importNotesJson")}</div>
          <div className="text-sm text-gray-500">{t("importNotesFromJsonFile")}</div>
        </div>
      </button>

      <button
        className={`flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
        onClick={() => {
          onClose();
          onImportGKeep?.();
        }}
      >
        <RowIcon icon={TI.BrandGoogle} />
        <div className="min-w-0">
          <div className="font-medium">{t("importGoogleKeepNotes")}</div>
          <div className="text-sm text-gray-500">
            {t("importNotesFromGoogleKeepExport")}{" "}
            {/* Inline help link to Google's Takeout instructions.
                stopPropagation so clicking the link doesn't also
                trigger the parent button's file-picker open. */}
            <a
              href="https://support.google.com/accounts/answer/3024190?hl=en-AM&utm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--gk-chrome-accent)] hover:brightness-90 dark:hover:brightness-110 underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              {t("howToExportGoogleKeep")}
            </a>
          </div>
        </div>
      </button>

      <button
        className={`flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
        onClick={() => {
          onClose();
          onImportMd?.();
        }}
      >
        <RowIcon icon={TI.FileText} />
        <div className="min-w-0">
          <div className="font-medium">{t("importMarkdownFilesMd")}</div>
          <div className="text-sm text-gray-500">{t("importNotesFromMarkdownFiles")}</div>
        </div>
      </button>

      <button
        className={`flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
        onClick={() => {
          onClose();
          onDownloadSecretKey?.();
        }}
      >
        <RowIcon icon={TI.Key} />
        <div className="min-w-0">
          <div className="font-medium">{t("downloadSecretKeyTxt")}</div>
          <div className="text-sm text-gray-500">{t("downloadEncryptionKeyBackup")}</div>
        </div>
      </button>

      <button
        className={`flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
        onClick={onOpenResetNoteOrder}
      >
        <RowIcon icon={TI.ArrowsSort} />
        <div className="min-w-0">
          <div className="font-medium">{t("resetNoteOrder")}</div>
          <div className="text-sm text-gray-500">{t("resetNoteOrderDesc")}</div>
        </div>
      </button>
    </div>
  );
}
