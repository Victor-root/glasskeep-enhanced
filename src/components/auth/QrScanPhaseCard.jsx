import React from "react";
import { QrSpinner } from "./QrGlyphs.jsx";

// Status card of the QR scanner (waiting, done, error...), with an
// optional spinner and action button.
export default function QrScanPhaseCard({ kind, title, body, primary, spinner }) {
  const color =
    kind === "success"
      ? "text-emerald-600 dark:text-emerald-300"
      : kind === "error"
      ? "text-red-600 dark:text-red-400"
      : kind === "warning"
      ? "text-amber-600 dark:text-amber-300"
      : "text-gray-700 dark:text-gray-200";
  return (
    <div className="mt-2 text-center">
      {spinner && (
        <div className="flex justify-center mb-3">
          <QrSpinner size="w-6 h-6" />
        </div>
      )}
      <h4 className={`text-base font-semibold ${color} mb-1`}>{title}</h4>
      {body && (
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-snug">
          {body}
        </p>
      )}
      {primary && (
        <button
          type="button"
          onClick={primary.onClick}
          className="mt-4 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 hover:scale-[1.03] active:scale-[0.98] btn-gradient"
        >
          {primary.label}
        </button>
      )}
    </div>
  );
}
