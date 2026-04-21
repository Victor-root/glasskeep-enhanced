import React from "react";
import { t } from "../../i18n";

/**
 * Explicit choice when the owner removes a collaborator from a shared note.
 *   - "keep_copy": the removed collaborator keeps a standalone, non-collab
 *     copy of the note in their own list (they retain the content).
 *   - "remove_access": the removed collaborator loses the note entirely,
 *     matching the legacy behavior.
 */
export default function ConfirmRemoveCollaboratorDialog({
  open,
  dark,
  collaboratorName,
  onClose,
  onConfirm,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        className="glass-card rounded-xl shadow-2xl w-[90%] max-w-sm p-6 relative"
        style={{
          backgroundColor: dark ? "#282828" : "#ffffff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-2">
          {t("removeCollaboratorQuestion", { name: collaboratorName || "" })}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t("removeCollaboratorConfirm")}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => onConfirm("keep_copy")}
          >{t("removeAndKeepCopy")}</button>
          <button
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            onClick={() => onConfirm("remove_access")}
          >{t("removeAndDeleteForThem")}</button>
          <button
            className="px-4 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-sm text-gray-600 dark:text-gray-300"
            onClick={onClose}
          >{t("cancel")}</button>
        </div>
      </div>
    </div>
  );
}
