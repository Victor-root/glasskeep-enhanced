import React from "react";

const ACTION_CLASSES = {
  outline: "px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10",
  danger: "px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700",
  ghost: "px-4 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-sm text-gray-600 dark:text-gray-300",
};

/**
 * Centred confirmation card over a dimmed backdrop, shared by the note
 * modal's confirmation dialogs: a title, a message and the action buttons,
 * in a row on the right or stacked (`stacked`, for a choice between
 * outcomes). Each action is { kind: "outline" | "danger" | "ghost", label,
 * onClick }. `zClassName` sets its stacking level.
 */
export default function ConfirmDialogFrame({ zClassName, title, message, onClose, stacked = false, actions }) {
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
        <div className={stacked ? "mt-5 flex flex-col gap-2" : "mt-5 flex justify-end gap-3"}>
          {actions.map((action, i) => (
            <button
              // Index keys: switching variant patches the buttons in place.
              key={i}
              className={ACTION_CLASSES[action.kind]}
              onClick={action.onClick}
            >{action.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
