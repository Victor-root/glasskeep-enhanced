import React, { useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { RowIcon } from "../common/SettingsAccordion.jsx";

// Remembered on this device: whoever leaves the files out once usually
// means it the next time too.
const WITH_ATTACHMENTS_KEY = "gk-export-attachments";

function readWithAttachments() {
  try { return localStorage.getItem(WITH_ATTACHMENTS_KEY) !== "0"; } catch { return true; }
}

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
  const [withAttachments, setWithAttachments] = useState(readWithAttachments);
  const toggleWithAttachments = () => {
    const next = !withAttachments;
    setWithAttachments(next);
    try { localStorage.setItem(WITH_ATTACHMENTS_KEY, next ? "1" : "0"); } catch { /* kept for this session only */ }
  };

  return (
    <div className="space-y-3">
      <div className="border border-[var(--border-light)] rounded-lg overflow-hidden">
        <button
          className={`flex items-center gap-3 w-full text-left px-3 py-3 ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
          onClick={() => {
            onClose();
            onExportAll?.({ withAttachments });
          }}
        >
          <RowIcon icon={TI.Upload} />
          <div className="min-w-0">
            <div className="font-medium">{t("exportAllNotes")}</div>
            <div className="text-sm text-gray-500">
              {t(withAttachments ? "exportAllNotesZipDesc" : "exportAllNotesJsonDesc")}
            </div>
          </div>
        </button>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-t border-[var(--border-light)]">
          <span id="export-with-attachments" className="text-sm">{t("exportWithAttachments")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={withAttachments}
            aria-labelledby="export-with-attachments"
            onClick={toggleWithAttachments}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
              withAttachments
                ? "bg-gradient-to-r from-indigo-500 to-violet-600 btn-gradient"
                : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                withAttachments ? "translate-x-[18px]" : "translate-x-[2px]"
              }`}
            />
          </button>
        </div>
      </div>

      <button
        className={`flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
        onClick={() => {
          onClose();
          onImportAll?.();
        }}
      >
        <RowIcon icon={TI.Download} />
        <div className="min-w-0">
          <div className="font-medium">{t("importNotes")}</div>
          <div className="text-sm text-gray-500">{t("importNotesDesc")}</div>
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
