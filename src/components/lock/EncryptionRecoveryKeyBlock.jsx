import React, { useState } from "react";
import { t } from "../../i18n";

// The freshly generated recovery key, shown with a copy button and an
// optional "I saved it" acknowledgement.
export default function EncryptionRecoveryKeyBlock({ value, onAck }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard API (rare): fall back to a manual select. The
      // value is also visible on screen so the user can copy by hand.
    }
  };

  return (
    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 p-4 space-y-3">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
        {t("encryptionRecoveryKeyLabel")}
      </p>
      <div className="font-mono text-base tracking-wider bg-white dark:bg-gray-900 px-3 py-2 rounded border border-amber-300 dark:border-amber-700 select-all break-all">
        {value}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="px-3 py-1.5 text-xs rounded-md bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 hover:bg-amber-300 dark:hover:bg-amber-700"
        >
          {copied ? t("encryptionRecoveryKeyCopied") : t("encryptionRecoveryKeyCopy")}
        </button>
        {onAck && (
          <button
            type="button"
            onClick={onAck}
            className="px-3 py-1.5 text-xs rounded-md bg-amber-600 text-white hover:bg-amber-700"
          >
            {t("encryptionRecoveryKeyAck")}
          </button>
        )}
      </div>
    </div>
  );
}
