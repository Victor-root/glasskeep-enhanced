// Small "Copy" button with a short "Copied" confirmation, for values an
// admin has to paste somewhere else (an address, a callback URL).

import React, { useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";

async function writeClipboard(value) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.setAttribute("readonly", "");
  ta.style.position = "absolute";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

export default function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onCopy = async () => {
    if (!value) return;
    try {
      await writeClipboard(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the value stays visible to copy by hand */
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={t("copy")}
      className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-500/10 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
    >
      {copied ? (
        <TI.Check className="tabler-icon w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <TI.Copy className="tabler-icon w-3.5 h-3.5" />
      )}
      {copied ? t("copied") : t("copy")}
    </button>
  );
}
