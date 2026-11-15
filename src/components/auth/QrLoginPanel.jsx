// src/components/auth/QrLoginPanel.jsx
//
// Standalone panel rendering the QR + status for the cross-device
// sign-in flow. The lifecycle (challenge creation, polling, expiry
// countdown) is useDeviceLinkLogin's, so callers just mount/unmount it
// and provide an onLoggedIn callback that fires with the
// `/api/device-link/poll` payload, same shape `completeLogin` already
// consumes from the password / passkey flows.
//
// Renders without any modal chrome: it's a regular "card" meant to
// be slotted into a layout next to the auth form (see AuthShell's
// `sidePanel` prop). The wrapping styles (rounded-xl, glass-card,
// padding) match the auth form's own card so the two read as a
// matched pair on a wide screen.

import React from "react";
import { t } from "../../i18n";
import useDeviceLinkLogin, { qrStatusMessage } from "../../auth/useDeviceLinkLogin.js";
import { QrSpinner, CloseGlyph, CheckGlyph } from "./QrGlyphs.jsx";

export default function QrLoginPanel({ dark, onLoggedIn, onCancel }) {
  const { status, qrDataUrl, errorText, secondsLeft, generate } = useDeviceLinkLogin(onLoggedIn);

  return (
    // Mirrors the auth card's chrome (glass-card, rounded-xl, p-6,
    // shadow-lg) so the panel reads as a matched second card next to
    // the login form. No modal backdrop, no fixed positioning — the
    // panel is part of normal flow within AuthShell's `sidePanel`
    // column.
    <div className="glass-card auth-card rounded-xl p-6 shadow-lg">
      <h3 className="text-center text-base font-semibold mb-3">
        {t("qrLoginTitle")}
      </h3>
      <div className="flex justify-center">
        <QrCanvas status={status} qrDataUrl={qrDataUrl} dark={dark} />
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-snug text-center">
        {t("qrLoginExplain")}
      </p>
      <div className="mt-3 min-h-[1.5rem] text-center">
        <StatusLine
          status={status}
          errorText={errorText}
          secondsLeft={secondsLeft}
        />
      </div>
      <div className="mt-3 flex items-center justify-center gap-2">
        {(status === "expired" || status === "error" || status === "rejected") && (
          <button
            type="button"
            onClick={generate}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 hover:scale-[1.03] active:scale-[0.98] btn-gradient"
          >
            {t("qrLoginRegenerate")}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

function QrCanvas({ status, qrDataUrl, dark }) {
  // Fixed-square placeholder so the panel doesn't jump in height as
  // the QR loads or expires.
  const wrapper =
    "w-[220px] h-[220px] rounded-xl border border-[var(--border-light)] flex items-center justify-center";
  const placeholderBg = dark ? "bg-[#1f1f1f]" : "bg-gray-50";

  if (status === "loading") {
    return (
      <div className={`${wrapper} ${placeholderBg}`}>
        <QrSpinner size="w-8 h-8" />
      </div>
    );
  }
  if (!qrDataUrl) {
    return (
      <div className={`${wrapper} ${placeholderBg}`}>
        <CloseGlyph />
      </div>
    );
  }
  return (
    <div className={`${wrapper} bg-white relative overflow-hidden`}>
      <img
        src={qrDataUrl}
        alt="QR code"
        className={`w-full h-full select-none pointer-events-none transition-opacity duration-200 ${
          status === "expired" || status === "rejected" ? "opacity-30" : "opacity-100"
        }`}
        draggable="false"
      />
      {(status === "expired" || status === "rejected") && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-700">
          <CloseGlyph large />
        </div>
      )}
      {status === "approved" && (
        <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/15">
          <CheckGlyph />
        </div>
      )}
    </div>
  );
}

const STATUS_TONE = {
  muted: "text-gray-500 dark:text-gray-400",
  error: "text-red-600 dark:text-red-400",
  success: "text-emerald-600 dark:text-emerald-300 font-medium",
};

function StatusLine({ status, errorText, secondsLeft }) {
  const message = qrStatusMessage(status, errorText, secondsLeft);
  if (!message) return null;
  return (
    <p className={`text-sm ${STATUS_TONE[message.tone]}`}>
      {message.text}
      {message.countdown && (
        <>
          {" · "}
          <span className="tabular-nums">{message.countdown}</span>
        </>
      )}
    </p>
  );
}
