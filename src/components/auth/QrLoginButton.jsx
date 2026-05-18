// src/components/auth/QrLoginButton.jsx
//
// Login-screen affordance for the cross-device QR sign-in flow.
// Mirrors PasskeyLoginButton's shape (same `onLoggedIn` callback, same
// dark prop, same dependency-free integration into LoginView) so the
// auth screen can drop them next to each other without lifting any
// extra state into AuthShell.
//
// We own the modal here rather than in LoginView for two reasons:
//   - keeps the wiring symmetric with the passkey button;
//   - lets us lazy-mount the QrLoginModal (and its qrcode / polling
//     code) only when the user explicitly clicks "Sign in with QR".

import React, { useState } from "react";
import { t } from "../../i18n";
import QrLoginModal from "./QrLoginModal.jsx";

export default function QrLoginButton({ onLoggedIn, dark }) {
  const [open, setOpen] = useState(false);

  const handleLoggedIn = (session) => {
    setOpen(false);
    onLoggedIn?.(session);
  };

  return (
    <>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-light)] text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <QrIcon />
          {t("qrLoginCta")}
        </button>
      </div>
      {open && (
        <QrLoginModal
          open={open}
          onClose={() => setOpen(false)}
          onLoggedIn={handleLoggedIn}
          dark={dark}
        />
      )}
    </>
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
