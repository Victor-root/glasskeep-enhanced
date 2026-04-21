import React from "react";
import { t } from "../../i18n";

/**
 * Confirm-delete dialog shown inside the note modal.
 * Three variants:
 *   - Trash (default): soft-delete a non-collaborative note.
 *   - Permanent (isTrashed): definitive deletion from the trash.
 *   - Owner-of-collab (collabOwner): explicit 2-choice dialog — "remove for me"
 *     (owner leaves, note stays for other participants via ownership transfer)
 *     vs "delete for everyone" (hard-deletes for all collaborators).
 */
export default function ConfirmDeleteDialog({
  open,
  dark,
  isTrashed,
  collabOwner,
  onClose,
  onConfirm,
}) {
  if (!open) return null;

  const title = collabOwner
    ? t("deleteSharedNoteQuestion")
    : isTrashed
      ? t("permanentlyDeleteQuestion")
      : t("moveToTrashQuestion");
  const body = collabOwner
    ? t("deleteSharedNoteConfirm")
    : isTrashed
      ? t("permanentlyDeleteConfirm")
      : t("moveToTrashConfirm");

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
            ? "#282828"
            : "#ffffff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">{body}</p>
        {collabOwner ? (
          <div className="mt-5 flex flex-col gap-2">
            <button
              className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => onConfirm("remove_self")}
            >{t("removeForMe")}</button>
            <button
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              onClick={() => onConfirm("delete_for_all")}
            >{t("deleteForAll")}</button>
            <button
              className="px-4 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-sm text-gray-600 dark:text-gray-300"
              onClick={onClose}
            >{t("cancel")}</button>
          </div>
        ) : (
          <div className="mt-5 flex justify-end gap-3">
            <button
              className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
              onClick={onClose}
            >{t("cancel")}</button>
            <button
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              onClick={() => onConfirm()}
            >{isTrashed ? t("permanentlyDelete") : t("moveToTrash")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
