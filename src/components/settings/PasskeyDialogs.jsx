import React, { useEffect, useRef, useState } from "react";
import { t } from "../../i18n";

// Scrim, card, title and Cancel button shared by the two dialogs below;
// `children` is the body, `confirmButton` sits after Cancel.
function PasskeyDialogFrame({ title, onClose, confirmButton, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="rounded-xl shadow-2xl w-[90%] max-w-sm p-6 relative bg-white dark:bg-[#282828] border border-[var(--border-light)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        {children}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
          >
            {t("cancel")}
          </button>
          {confirmButton}
        </div>
      </div>
    </div>
  );
}

// Styled in-app text prompt. Replaces `window.prompt(...)` for passkey
// naming so the WebView doesn't render the bare "La page <url> indique:"
// system dialog. Keeps focus on the input, submits on Enter, cancels on
// Escape: matches the editor / settings dialogs people already know.
export function PasskeyTextDialog({ prompt, onClose }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  // Re-seed the field every time a fresh prompt opens. We keep the
  // input controlled (rather than reading from a ref on submit) so the
  // confirm button can be disabled while empty without a re-render
  // dance.
  useEffect(() => {
    if (prompt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- re-seed the field each time a fresh prompt opens
      setValue(prompt.defaultValue || "");
      // The focus has to happen *after* the input mounts. A microtask
      // tick is enough: requestAnimationFrame would also work but
      // delays focus by a paint cycle on slow devices.
      queueMicrotask(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          el.select();
        }
      });
    }
  }, [prompt]);

  if (!prompt) return null;

  const submit = () => {
    onClose();
    if (prompt.onSubmit) prompt.onSubmit(value);
  };

  return (
    <PasskeyDialogFrame
      title={prompt.title}
      onClose={onClose}
      confirmButton={
        <button
          type="button"
          className="px-4 py-2 rounded-lg font-semibold transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] btn-gradient bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none"
          onClick={submit}
        >
          {prompt.confirmText || t("confirm")}
        </button>
      }
    >
      {prompt.message && (
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          {prompt.message}
        </p>
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        maxLength={64}
        placeholder={prompt.placeholder || ""}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          else if (e.key === "Escape") { e.preventDefault(); onClose(); }
        }}
        className="w-full px-3 py-2 rounded-lg border border-[var(--border-light)] bg-white dark:bg-[#1f1f1f] focus:outline-none focus:ring-2 focus:ring-[var(--gk-chrome-accent)]"
      />
    </PasskeyDialogFrame>
  );
}

// Styled in-app confirmation dialog. Used for "delete this passkey?"
// in place of `window.confirm()`, same reasons as PasskeyTextDialog:
// the system dialog leaks the WebView URL and ignores the app theme.
export function PasskeyConfirmDialog({ prompt, onClose }) {
  if (!prompt) return null;

  const confirmClass = prompt.danger
    ? "bg-red-600 text-white hover:bg-red-700 hover:shadow-lg hover:shadow-red-300/50"
    : "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 hover:shadow-lg hover:shadow-indigo-300/50";

  return (
    <PasskeyDialogFrame
      title={prompt.title}
      onClose={onClose}
      confirmButton={
        <button
          type="button"
          className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] btn-gradient${prompt.danger ? " gk-fixed-btn" : ""} ${confirmClass}`}
          onClick={() => {
            onClose();
            if (prompt.onConfirm) prompt.onConfirm();
          }}
        >
          {prompt.confirmText || t("confirm")}
        </button>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-300">{prompt.message}</p>
    </PasskeyDialogFrame>
  );
}
