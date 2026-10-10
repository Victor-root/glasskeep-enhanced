import React from "react";
import { t } from "../../i18n";
import ConfirmDialogFrame from "./ConfirmDialogFrame.jsx";

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
      stacked
      actions={[
        { kind: "outline", label: t("removeAndKeepCopy"), onClick: () => onConfirm("keep_copy") },
        { kind: "danger", label: t("removeAndDeleteForThem"), onClick: () => onConfirm("remove_access") },
        { kind: "ghost", label: t("cancel"), onClick: onClose },
      ]}
    />
  );
}
