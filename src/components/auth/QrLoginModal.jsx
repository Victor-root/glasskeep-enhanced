// src/components/auth/QrLoginModal.jsx
//
// PC-side QR sign-in. Shown over the login screen when the user
// clicks "Sign in with a QR code" — the user then scans the displayed
// QR with their phone (already signed-in GlassKeep app) and the PC
// receives a JWT without ever typing a password into the foreign
// machine.
//
// The lifecycle is event-driven via a `poll` interval (default 2 s):
//   1. mount → POST /api/device-link/create → render QR
//   2. setInterval poll → update statusLabel as the server's status
//      transitions pending → approved → consumed
//   3. on `approved` the response carries `{ token, user }`; we hand
//      it off to the existing `completeLogin` path via `onLoggedIn`
//      (same callback the password / passkey flows use) and close.
//   4. on `expired` we offer a "regenerate" button — fresh token,
//      fresh QR, lifecycle restarts.

import React, { useEffect, useRef, useState, useCallback } from "react";
import QRCode from "qrcode";
import { t } from "../../i18n";
import {
  createDeviceLink,
  pollDeviceLink,
  buildLinkUrl,
} from "../../auth/deviceLinkClient.js";

// Don't poll harder than this regardless of what the server returns
// in `pollIntervalMs` — keeps a rogue server config from DoS-ing
// itself with a 100 ms interval.
const MIN_POLL_INTERVAL_MS = 1000;

export default function QrLoginModal({ open, onClose, onLoggedIn, dark }) {
  // The device-link token (a.k.a. challenge id). Held in a ref AND in
  // state because the polling effect needs the latest value without
  // re-subscribing when only the QR data URL changes.
  const tokenRef = useRef(null);
  const [linkToken, setLinkToken] = useState(null);

  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [pollIntervalMs, setPollIntervalMs] = useState(2000);

  const [status, setStatus] = useState("loading"); // loading | pending | approved | expired | rejected | error
  const [errorText, setErrorText] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(null);

  // Generate a fresh challenge + matching QR. Used both on first open
  // and every time the user clicks "Regenerate" after a timeout.
  const generate = useCallback(async () => {
    setStatus("loading");
    setErrorText("");
    setQrDataUrl(null);
    setLinkToken(null);
    tokenRef.current = null;
    try {
      const created = await createDeviceLink();
      tokenRef.current = created.token;
      setLinkToken(created.token);
      setExpiresAt(created.expiresAt);
      setPollIntervalMs(
        Math.max(MIN_POLL_INTERVAL_MS, Number(created.pollIntervalMs) || 2000),
      );
      const url = buildLinkUrl(created.token);
      const data = await QRCode.toDataURL(url, {
        margin: 1,
        width: 320,
        errorCorrectionLevel: "M",
        color: { dark: "#1f1f1f", light: "#ffffff" },
      });
      setQrDataUrl(data);
      setStatus("pending");
    } catch (e) {
      setErrorText((e && e.message) || "Network error");
      setStatus("error");
    }
  }, []);

  // Fire the initial challenge whenever the modal opens. Cleanup tears
  // down the token reference so a stale closure can't keep polling
  // after the user closes the dialog.
  useEffect(() => {
    if (!open) {
      tokenRef.current = null;
      return undefined;
    }
    generate();
    return () => {
      tokenRef.current = null;
    };
  }, [open, generate]);

  // Polling loop — bound to the current token. The effect resubscribes
  // whenever generate() produces a new token, but in steady state the
  // same interval keeps firing.
  useEffect(() => {
    if (!open || !linkToken || status !== "pending") return undefined;
    let cancelled = false;
    const tick = async () => {
      const t0 = tokenRef.current;
      if (cancelled || !t0 || t0 !== linkToken) return;
      try {
        const r = await pollDeviceLink(t0);
        if (cancelled || tokenRef.current !== t0) return;
        if (r.status === "approved" && r.token && r.user) {
          setStatus("approved");
          // Defer the login callback by a microtask so React has a
          // chance to render the success state before the parent
          // potentially unmounts us.
          queueMicrotask(() => {
            try { onLoggedIn?.(r); } catch { /* parent decides */ }
          });
        } else if (r.status === "expired") {
          setStatus("expired");
        } else if (r.status === "rejected") {
          setStatus("rejected");
        } else if (r.status === "consumed") {
          // Race: another tab already claimed it. Treat as expired.
          setStatus("expired");
        }
      } catch (e) {
        // 404 (token gone) and 410 (consumed) both mean "regenerate".
        if (e?.status === 404 || e?.status === 410) {
          setStatus("expired");
          return;
        }
        // Transient network blip — leave the loop running, the next
        // tick may recover. We don't surface every blip as an error.
      }
    };
    const id = setInterval(tick, pollIntervalMs);
    // First tick after a short delay so the QR has time to paint and
    // the user has a chance to see the "waiting" state.
    const kick = setTimeout(tick, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(kick);
    };
  }, [open, linkToken, status, pollIntervalMs, onLoggedIn]);

  // Countdown clock under the QR so the user can see how much time
  // they have left before it expires.
  useEffect(() => {
    if (!open || !expiresAt) {
      setSecondsLeft(null);
      return undefined;
    }
    const update = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.round(ms / 1000)));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [open, expiresAt]);

  // Escape closes the modal — matches the password / passkey dialogs
  // in PasskeySettingsSection.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-[92%] max-w-sm rounded-2xl shadow-2xl p-6 relative bg-white dark:bg-[#282828] border border-[var(--border-light)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="absolute top-3 right-3 w-8 h-8 rounded-md text-gray-500 hover:text-gray-800 hover:bg-black/5 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-white/10 flex items-center justify-center"
        >
          <CloseGlyph />
        </button>

        <h3 className="text-lg font-semibold mb-1 pr-8">
          {t("qrLoginTitle")}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 leading-snug">
          {t("qrLoginExplain")}
        </p>

        <div className="flex justify-center">
          <QrCanvas status={status} qrDataUrl={qrDataUrl} dark={dark} />
        </div>

        <div className="mt-4 min-h-[2.5rem] flex flex-col items-center justify-center text-center">
          <StatusLine
            status={status}
            errorText={errorText}
            secondsLeft={secondsLeft}
          />
          {(status === "expired" || status === "error" || status === "rejected") && (
            <button
              type="button"
              onClick={generate}
              className="mt-3 px-4 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 btn-gradient"
            >
              {t("qrLoginRegenerate")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────

function QrCanvas({ status, qrDataUrl, dark }) {
  // Fixed-square placeholder so the dialog doesn't jump in height as
  // the QR loads or expires. Tints follow the app theme rather than
  // staying pure white, which would look like a printer page in dark
  // mode.
  const wrapper =
    "w-[260px] h-[260px] rounded-xl border border-[var(--border-light)] flex items-center justify-center";
  const placeholderBg = dark ? "bg-[#1f1f1f]" : "bg-gray-50";

  if (status === "loading") {
    return (
      <div className={`${wrapper} ${placeholderBg}`}>
        <Spinner />
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

function StatusLine({ status, errorText, secondsLeft }) {
  if (status === "loading") {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t("qrLoginGenerating")}
      </p>
    );
  }
  if (status === "error") {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        {errorText || t("qrLoginError")}
      </p>
    );
  }
  if (status === "pending") {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t("qrLoginWaiting")}
        {secondsLeft != null && (
          <>
            {" · "}
            <span className="tabular-nums">
              {t("qrLoginExpiresIn").replace("%s", String(secondsLeft))}
            </span>
          </>
        )}
      </p>
    );
  }
  if (status === "approved") {
    return (
      <p className="text-sm text-emerald-600 dark:text-emerald-300 font-medium">
        {t("qrLoginApproved")}
      </p>
    );
  }
  if (status === "rejected") {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        {t("qrLoginRejected")}
      </p>
    );
  }
  if (status === "expired") {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t("qrLoginExpired")}
      </p>
    );
  }
  return null;
}

function Spinner() {
  return (
    <svg
      className="w-10 h-10 text-indigo-500 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CloseGlyph({ large }) {
  const size = large ? "w-12 h-12" : "w-5 h-5";
  return (
    <svg
      className={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      className="w-14 h-14 text-emerald-600"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
