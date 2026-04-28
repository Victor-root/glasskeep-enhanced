// src/components/lock/LockedBanner.jsx
// Non-intrusive bar shown at the top of the app when the server is
// at-rest-locked but the user already has a local-first cache loaded.
//
// Why a banner instead of slamming the unlock screen over the app:
// the server locking (e.g. on a service restart for an unrelated
// update) shouldn't kick the user out of notes that are sitting in
// their browser's IndexedDB. They keep reading their cache; their
// edits queue locally and sync once an admin unlocks. The banner is
// the honest signal that sync is paused — with a one-click path to
// unlock when they're ready.
//
// First-time visitors (no session) are sent to the full unlock screen
// instead, since they have no local cache to fall back on. That
// branching lives in App.jsx; this component only renders the banner.

import React from "react";
import { t } from "../../i18n";

export default function LockedBanner({ onUnlock, onDismiss }) {
  return (
    <div
      role="status"
      className="mx-4 mt-2 sm:mx-6 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-400 dark:border-amber-600 text-amber-900 dark:text-amber-100 text-sm"
    >
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 1 1 8 0v3" />
      </svg>
      <span className="flex-1 min-w-0">{t("lockedBannerMessage")}</span>
      <div className="flex flex-shrink-0 gap-2 self-end sm:self-auto">
        <button
          type="button"
          onClick={onUnlock}
          className="px-3 py-1 rounded-md text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700"
        >{t("lockedBannerUnlock")}</button>
        <button
          type="button"
          onClick={onDismiss}
          className="px-2 py-1 rounded-md text-xs text-amber-700 dark:text-amber-200 hover:bg-amber-200/40 dark:hover:bg-amber-800/40"
        >{t("dismiss")}</button>
      </div>
    </div>
  );
}
