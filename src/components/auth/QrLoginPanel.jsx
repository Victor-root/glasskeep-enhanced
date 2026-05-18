// src/components/auth/QrLoginPanel.jsx
//
// Standalone panel rendering the QR + status for the cross-device
// sign-in flow. Owns the full lifecycle (challenge creation, polling,
// expiry countdown) so callers just mount/unmount it and provide an
// onLoggedIn callback that fires with the `/api/device-link/poll`
// payload — same shape `completeLogin` already consumes from the
// password / passkey flows, so the post-login pipeline is identical.
//
// Renders without any modal chrome: it's a regular "card" meant to
// be slotted into a layout next to the auth form (see AuthShell's
// `sidePanel` prop). The wrapping styles (rounded-xl, glass-card,
// padding) match the auth form's own card so the two read as a
// matched pair on a wide screen.

import React, { useCallback, useEffect, useRef, useState } from "react";
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

export default function QrLoginPanel({ dark, onLoggedIn, onCancel }) {
  const tokenRef = useRef(null);
  const [linkToken, setLinkToken] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [pollIntervalMs, setPollIntervalMs] = useState(2000);

  const [status, setStatus] = useState("loading"); // loading | pending | approved | expired | rejected | error
  const [errorText, setErrorText] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(null);

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

  useEffect(() => {
    generate();
    return () => {
      tokenRef.current = null;
    };
  }, [generate]);

  // Polling loop — bound to the current token.
  useEffect(() => {
    if (!linkToken || status !== "pending") return undefined;
    let cancelled = false;
    const tick = async () => {
      const t0 = tokenRef.current;
      if (cancelled || !t0 || t0 !== linkToken) return;
      try {
        const r = await pollDeviceLink(t0);
        if (cancelled || tokenRef.current !== t0) return;
        if (r.status === "approved" && r.token && r.user) {
          setStatus("approved");
          queueMicrotask(() => {
            try { onLoggedIn?.(r); } catch { /* parent decides */ }
          });
        } else if (r.status === "expired") {
          setStatus("expired");
        } else if (r.status === "rejected") {
          setStatus("rejected");
        } else if (r.status === "consumed") {
          setStatus("expired");
        }
      } catch (e) {
        if (e?.status === 404 || e?.status === 410) {
          setStatus("expired");
          return;
        }
        // Transient network blip — keep polling on the next tick.
      }
    };
    const id = setInterval(tick, pollIntervalMs);
    const kick = setTimeout(tick, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(kick);
    };
  }, [linkToken, status, pollIntervalMs, onLoggedIn]);

  useEffect(() => {
    if (!expiresAt) { setSecondsLeft(null); return undefined; }
    const update = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.round(ms / 1000)));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return (
    // Mirrors the auth card's chrome (glass-card, rounded-xl, p-6,
    // shadow-lg) so the panel reads as a matched second card next to
    // the login form. No modal backdrop, no fixed positioning — the
    // panel is part of normal flow within AuthShell's `sidePanel`
    // column.
    <div className="glass-card rounded-xl p-6 shadow-lg">
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
            className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 btn-gradient"
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
      className="w-8 h-8 text-indigo-500 animate-spin"
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
  const size = large ? "w-10 h-10" : "w-5 h-5";
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
      className="w-12 h-12 text-emerald-600"
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
