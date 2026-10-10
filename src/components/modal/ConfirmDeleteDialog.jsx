import React from "react";
import { t } from "../../i18n";
import ConfirmDialogFrame from "./ConfirmDialogFrame.jsx";

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
    <ConfirmDialogFrame
      zClassName="z-50"
      title={title}
      message={body}
      onClose={onClose}
      stacked={collabOwner}
      actions={collabOwner
        ? [
          { kind: "outline", label: t("removeForMe"), onClick: () => onConfirm("remove_self") },
          { kind: "danger", label: t("deleteForAll"), onClick: () => onConfirm("delete_for_all") },
          { kind: "ghost", label: t("cancel"), onClick: onClose },
        ]
        : [
          { kind: "outline", label: t("cancel"), onClick: onClose },
          { kind: "danger", label: isTrashed ? t("permanentlyDelete") : t("moveToTrash"), onClick: () => onConfirm() },
        ]}
    />
  );
}
