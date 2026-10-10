import React from "react";
import { t } from "../../i18n";
import ConfirmDialogFrame, { ConfirmChoices } from "./ConfirmDialogFrame.jsx";

/**
 * Explicit choice when the owner removes a collaborator from a shared note.
 *   - "keep_copy": the removed collaborator keeps a standalone, non-collab
 *     copy of the note in their own list (they retain the content).
 *   - "remove_access": the removed collaborator loses the note entirely,
 *     matching the legacy behavior.
 */
export default function ConfirmRemoveCollaboratorDialog({
  open,
  collaboratorName,
  onClose,
  onConfirm,
}) {
  if (!open) return null;

  return (
    <ConfirmDialogFrame
      zClassName="z-[60]"
      title={t("removeCollaboratorQuestion", { name: collaboratorName || "" })}
      message={t("removeCollaboratorConfirm")}
      onClose={onClose}
    >
      <ConfirmChoices
        mildLabel={t("removeAndKeepCopy")}
        onMild={() => onConfirm("keep_copy")}
        destructiveLabel={t("removeAndDeleteForThem")}
        onDestructive={() => onConfirm("remove_access")}
        onCancel={onClose}
      />
    </ConfirmDialogFrame>
  );
}
