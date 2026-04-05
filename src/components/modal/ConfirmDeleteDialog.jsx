import React from "react";
import { t } from "../../i18n";

/**
 * Confirm-delete dialog shown inside the note modal.
 * Handles both "move to trash" and "permanently delete" variants.
 */
export default function ConfirmDeleteDialog({
  open,
  dark,
  isTrashed,
  onClose,
  onConfirm,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        className="glass-card rounded-xl shadow-2xl w-[90%] max-w-sm p-6 relative"
        style={{
          backgroundColor: dark
            ? "rgba(40,40,40,0.95)"
            : "rgba(255,255,255,0.95)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-2">
          {isTrashed ? t("permanentlyDeleteQuestion") : t("moveToTrashQuestion")}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {isTrashed ? t("permanentlyDeleteConfirm") : t("moveToTrashConfirm")}
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
          >{t("cancel")}</button>
          <button
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            onClick={onConfirm}
          >{isTrashed ? t("permanentlyDelete") : t("moveToTrash")}</button>
        </div>
      </div>
    </div>
  );
}
