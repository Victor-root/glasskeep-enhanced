import React from "react";
import { t } from "../../i18n";
import ConfirmDialogFrame, { ConfirmChoices } from "./ConfirmDialogFrame.jsx";

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
    <ConfirmDialogFrame zClassName="z-50" title={title} message={body} onClose={onClose}>
      {collabOwner ? (
        <ConfirmChoices
          mildLabel={t("removeForMe")}
          onMild={() => onConfirm("remove_self")}
          destructiveLabel={t("deleteForAll")}
          onDestructive={() => onConfirm("delete_for_all")}
          onCancel={onClose}
        />
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
    </ConfirmDialogFrame>
  );
}
