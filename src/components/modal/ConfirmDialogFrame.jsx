import React from "react";
import { t } from "../../i18n";

/**
 * Centred confirmation card over a dimmed backdrop, shared by the note
 * modal's confirmation dialogs: a title, a message and the action buttons
 * passed as children. `zClassName` sets its stacking level.
 */
export default function ConfirmDialogFrame({ zClassName, title, message, onClose, children }) {
  return (
    <div className={`fixed inset-0 ${zClassName} flex items-center justify-center`}>
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        className="rounded-xl shadow-2xl w-[90%] max-w-sm p-6 relative bg-white dark:bg-[#282828] border border-[var(--border-light)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
        {children}
      </div>
    </div>
  );
}

// Stacked choice between a mild and a destructive outcome, then Cancel.
export function ConfirmChoices({ mildLabel, onMild, destructiveLabel, onDestructive, onCancel }) {
  return (
    <div className="mt-5 flex flex-col gap-2">
      <button
        className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
        onClick={onMild}
      >{mildLabel}</button>
      <button
        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        onClick={onDestructive}
      >{destructiveLabel}</button>
      <button
        className="px-4 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-sm text-gray-600 dark:text-gray-300"
        onClick={onCancel}
      >{t("cancel")}</button>
    </div>
  );
}
