// src/components/auth/QrLoginButton.jsx
//
// Login-screen affordance for the cross-device QR sign-in flow.
// Controlled component: the parent (LoginView) owns the open/closed
// state so it can also slot the matching QrLoginPanel into AuthShell's
// `sidePanel` prop — that's what makes the QR appear as a real second
// card next to the auth form on wide screens rather than as a popup
// hovering over it.

import React from "react";
import { t } from "../../i18n";

export default function QrLoginButton({ open, onToggle }) {
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => onToggle?.(!open)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-light)] text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        aria-expanded={!!open}
      >
        <QrIcon />
        {open ? t("qrLoginHide") : t("qrLoginCta")}
      </button>
    </div>
  );
}

function QrIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <line x1="14" y1="14" x2="14" y2="17" />
      <line x1="14" y1="20" x2="14" y2="21" />
      <line x1="17" y1="14" x2="21" y2="14" />
      <line x1="17" y1="17" x2="17" y2="21" />
      <line x1="20" y1="17" x2="21" y2="17" />
      <line x1="20" y1="20" x2="21" y2="20" />
    </svg>
  );
}
