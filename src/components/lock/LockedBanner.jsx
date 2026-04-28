// src/components/lock/LockedBanner.jsx
// Top-of-app notice shown when the server is at-rest-locked but the
// user already has a local-first cache loaded.
//
// Positioning rules:
//   - Rendered in the normal document flow (not position:fixed) so it
//     pushes the rest of the layout down instead of overlapping the
//     header. When the user scrolls, it scrolls away with the page —
//     once they've seen it and started working, it doesn't waste
//     vertical real-estate.
//   - On wide screens with the permanent sidebar pinned, the banner
//     starts where the main content starts (offset by sidebarWidth)
//     so the sidebar's tag column stays cleanly framed and the bar
//     doesn't run under it.
//
// First-time visitors (no session) are sent to the full unlock screen
// instead, since they have no local cache to fall back on. That
// branching lives in App.jsx; this component only renders the banner.

import React from "react";
import { t } from "../../i18n";

export default function LockedBanner({ onUnlock, onDismiss, sidebarOffset = 0 }) {
  return (
    <div
      role="status"
      className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 bg-amber-100 dark:bg-amber-900/80 border-b-2 border-amber-500 dark:border-amber-600 text-amber-900 dark:text-amber-100 text-sm shadow-md"
      style={{
        marginLeft: sidebarOffset ? `${sidebarOffset}px` : undefined,
        paddingTop: "max(env(safe-area-inset-top), 0.75rem)",
      }}
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
