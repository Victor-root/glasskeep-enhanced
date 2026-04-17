import React from "react";
import { t } from "../../i18n";

export default function OfflineCollabBanner({ visible }) {
  if (!visible) return null;

  return (
    <div className="mx-4 mt-2 sm:mx-6 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-400 dark:border-amber-600 text-amber-800 dark:text-amber-200 text-sm">
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.464 15.536a5 5 0 010-7.072M15.536 8.464a5 5 0 010 7.072" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      </svg>
      <span>{t("offlineCollabWarning")}</span>
    </div>
  );
}
