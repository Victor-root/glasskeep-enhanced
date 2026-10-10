import React, { useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { writeClipboard } from "../../utils/clipboard.js";

// Icon and label of the update section's copy buttons: "Copy", then
// "Copied" for a moment after a click.
export function CopyFeedback({ copied }) {
  return (
    <>
      {copied ? (
        <TI.Check className="tabler-icon w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" />
      ) : (
        <TI.Download className="tabler-icon w-3.5 h-3.5 opacity-70" />
      )}
      {copied ? t("copied") : t("copy")}
    </>
  );
}

// A manual update command with its copy button.
export default function UpdateCommandRow({ icon: Icon, label, description, command }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await writeClipboard(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: silent */
    }
  };

  return (
    <div className="rounded-lg border border-[var(--border-light)] bg-gray-50 dark:bg-black/30 p-3">
      {/* Title row: icon + label left, copy button right */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
          <Icon className="tabler-icon w-4 h-4" />
          {label}
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-white dark:bg-white/10 border border-[var(--border-light)] hover:bg-gray-100 dark:hover:bg-white/15"
          aria-label={t("copyCommand")}
        >
          <CopyFeedback copied={copied} />
        </button>
      </div>
      {/* Description and command: full width, no icon indentation */}
      {description && (
        <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
          {description}
        </p>
      )}
      <code
        className="block w-full text-xs font-mono text-gray-800 dark:text-gray-100 bg-white dark:bg-black/40 border border-[var(--border-light)] rounded-md px-2 py-1.5 whitespace-nowrap overflow-x-auto"
        title={command}
      >
        {command}
      </code>
    </div>
  );
}
