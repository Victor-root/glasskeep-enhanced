// src/components/lock/LockedBanner.jsx
// Top-of-page bar shown when the server is at-rest-locked but the user
// already has a local-first cache loaded.
//
// The banner is:
//   - position:fixed, top:0, full-width, z-50 — above the sidebar
//     (z-40) and above the floating-cards background (z-1) so it can
//     never be hidden behind decorative or chrome layers.
//   - bordered only on the bottom (no rounded corners) so it reads as
//     a stacked notice and not a card.
//   - intentionally prominent — server-side lock under a logged-in
//     user is rare and the user needs to notice that sync is paused.
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
      className="fixed top-0 left-0 right-0 z-50 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 bg-amber-100 dark:bg-amber-900/80 border-b-2 border-amber-500 dark:border-amber-600 text-amber-900 dark:text-amber-100 text-sm shadow-md backdrop-blur-sm"
      style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)" }}
    >
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 1 1 8 0v3" />
      </svg>
      <span className="flex-1 min-w-0 leading-snug">{t("lockedBannerMessage")}</span>
      <div className="flex flex-shrink-0 gap-2 self-end sm:self-auto">
        <button
          type="button"
          onClick={onUnlock}
          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 transition-colors"
        >{t("lockedBannerUnlock")}</button>
        <button
          type="button"
          onClick={onDismiss}
          className="px-2 py-1.5 rounded-md text-xs text-amber-800 dark:text-amber-100 hover:bg-amber-200/60 dark:hover:bg-amber-800/40 transition-colors"
        >{t("dismiss")}</button>
      </div>
    </div>
  );
}
