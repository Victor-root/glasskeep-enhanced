// src/components/auth/QrScannerModal.jsx
//
// In-app camera + QR scanner used by the phone half of the cross-
// device sign-in flow. The user opens this from Settings → "Sign in
// on another device", scans the QR shown on the foreign PC, then
// approves the resulting confirmation (which shows the PC's user-
// agent + a masked IP so they can sanity-check what they're about
// to authorise).
//
// Camera UI flow:
//   1. mount → request the back camera via QrScanner.start()
//   2. on scan → parse the URL; reject when the origin doesn't
//      match the user's own server (typical phishing scenario)
//   3. fetch /api/device-link/info → show the confirmation card
//   4. user Approves → POST /api/device-link/approve → success
//   5. user Rejects (or closes) → POST /api/device-link/reject
//
// We isolate the QrScanner lifecycle in a ref so React's strict mode
// re-mount doesn't leave a dangling camera handle behind.

import React, { useEffect, useRef, useState, useCallback } from "react";
import QrScanner from "qr-scanner";
import { t } from "../../i18n";
import {
  parseLinkUrl,
  getDeviceLinkInfo,
  approveDeviceLink,
  rejectDeviceLink,
} from "../../auth/deviceLinkClient.js";
import { localizeServerError } from "../../utils/serverErrors.js";

// Phases:
//   loading  → asking the OS for camera permission, starting the stream
//   scanning → looking at frames waiting for a valid GlassKeep QR
//   wrongOrigin → scanned a QR for a different domain (phishing guard)
//   fetching → got a token, asking the server what PC sits behind it
//   confirm  → /info returned, render the Approve / Reject card
//   approving → POST /approve in flight
//   done     → server accepted the approval, brief success animation
//   error    → permission denied, network blip on /info, etc.
const PHASES = {
  loading: "loading",
  scanning: "scanning",
  wrongOrigin: "wrongOrigin",
  fetching: "fetching",
  confirm: "confirm",
  approving: "approving",
  done: "done",
  error: "error",
};

export default function QrScannerModal({ open, onClose, token, showToast }) {
  const videoRef = useRef(null);
  const scannerRef = useRef(null);

  const [phase, setPhase] = useState(PHASES.loading);
  const [errorText, setErrorText] = useState("");
  const [linkToken, setLinkToken] = useState(null);
  const [info, setInfo] = useState(null);
  const [scannedOrigin, setScannedOrigin] = useState(null);

  // Track which token we've already submitted to the server so a
  // shaky camera doesn't double-POST when the user holds the phone
  // steady and the same QR is decoded twice.
  const submittedRef = useRef(null);

  const stopScanner = useCallback(() => {
    const s = scannerRef.current;
    if (!s) return;
    try { s.stop(); } catch { /* ignore */ }
    try { s.destroy(); } catch { /* ignore */ }
    scannerRef.current = null;
  }, []);

  // Handler called by qr-scanner whenever a QR is decoded from a
  // frame. The scanner keeps firing as long as it's running, so we
  // bail early if we've already moved past the scanning phase.
  const onScan = useCallback(
    async (result) => {
      const raw = result?.data ?? result;
      if (!raw || submittedRef.current) return;

      const parsed = parseLinkUrl(raw);
      if (!parsed) return; // ignore random non-GlassKeep QRs

      if (parsed.origin !== window.location.origin) {
        // Phishing guard: the QR is a GlassKeep device-link URL but
        // points to a DIFFERENT server. We never want to approve
        // someone else's PC for an unrelated account.
        submittedRef.current = raw;
        setScannedOrigin(parsed.origin);
        setPhase(PHASES.wrongOrigin);
        stopScanner();
        return;
      }

      submittedRef.current = raw;
      setLinkToken(parsed.token);
      setPhase(PHASES.fetching);
      stopScanner();

      try {
        const data = await getDeviceLinkInfo(parsed.token, token);
        setInfo(data);
        setPhase(PHASES.confirm);
      } catch (e) {
        setErrorText(
          localizeServerError(e?.message || "", "qrScanInfoFailed"),
        );
        setPhase(PHASES.error);
      }
    },
    [token, stopScanner],
  );

  // Boot / tear down the camera lifecycle with the modal's open prop.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    submittedRef.current = null;
    setLinkToken(null);
    setInfo(null);
    setErrorText("");
    setScannedOrigin(null);
    setPhase(PHASES.loading);

    const start = async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        const scanner = new QrScanner(video, onScan, {
          preferredCamera: "environment",
          highlightScanRegion: true,
          highlightCodeOutline: true,
          maxScansPerSecond: 8,
        });
        scannerRef.current = scanner;
        await scanner.start();
        if (cancelled) {
          stopScanner();
          return;
        }
        setPhase(PHASES.scanning);
      } catch (e) {
        setErrorText(
          (e && e.message) ||
            (typeof DOMException !== "undefined" && e instanceof DOMException
              ? e.name
              : "Camera error"),
        );
        setPhase(PHASES.error);
      }
    };
    start();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [open, onScan, stopScanner]);

  const handleApprove = async () => {
    if (!linkToken) return;
    setPhase(PHASES.approving);
    try {
      await approveDeviceLink(linkToken, token);
      setPhase(PHASES.done);
      if (showToast) showToast(t("qrScanApproved"), "success");
      // Hand the user a brief confirmation animation, then close.
      setTimeout(() => { onClose?.(); }, 900);
    } catch (e) {
      setErrorText(localizeServerError(e?.message || "", "qrScanApproveFailed"));
      setPhase(PHASES.error);
    }
  };

  const handleReject = async () => {
    if (linkToken) {
      try { await rejectDeviceLink(linkToken, token); }
      catch { /* best-effort */ }
    }
    onClose?.();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className="w-[94%] max-w-sm rounded-2xl shadow-2xl p-5 relative bg-white dark:bg-[#282828] border border-[var(--border-light)]"
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
          {t("qrScanTitle")}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 leading-snug">
          {phase === PHASES.confirm
            ? t("qrScanConfirmExplain")
            : t("qrScanExplain")}
        </p>

        {/* Camera surface — kept mounted across phases so toggling
            back from confirm → scanning doesn't have to re-acquire
            the stream. Hidden via CSS once we've moved past
            scanning rather than via conditional mount.
            We use `visibility: hidden` while loading so the WebView
            never paints the <video>'s default no-source play-button
            poster — opacity-0 alone left it visible for one frame
            on slow devices, producing a brief flash through our
            placeholder. visibility:hidden keeps layout (qr-scanner
            still needs a real video element behind the scenes) but
            blocks all paint. */}
        <div
          className="relative w-full aspect-square rounded-xl overflow-hidden bg-black"
          style={{
            display:
              phase === PHASES.loading || phase === PHASES.scanning
                ? "block"
                : "none",
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            disablePictureInPicture
            controls={false}
            className="w-full h-full object-cover"
            style={{
              visibility: phase === PHASES.scanning ? "visible" : "hidden",
            }}
          />
          {phase === PHASES.loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 gap-4">
              <span
                className="inline-flex items-center justify-center"
                style={{ width: "96px", height: "96px" }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="96"
                  height="96"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" />
                  <path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
                </svg>
              </span>
              <Spinner small />
            </div>
          )}
        </div>

        {phase === PHASES.wrongOrigin && (
          <PhaseCard
            kind="warning"
            title={t("qrScanWrongOrigin")}
            body={t("qrScanWrongOriginBody").replace("%s", scannedOrigin || "?")}
            primary={{
              label: t("qrScanRetry"),
              onClick: () => {
                submittedRef.current = null;
                setPhase(PHASES.loading);
                // re-mount the camera via the open-toggle effect
                onClose?.();
              },
            }}
          />
        )}

        {phase === PHASES.fetching && (
          <PhaseCard
            kind="info"
            title={t("qrScanFetching")}
            body=""
            spinner
          />
        )}

        {phase === PHASES.confirm && info && (
          <ConfirmCard
            info={info}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        )}

        {phase === PHASES.approving && (
          <PhaseCard
            kind="info"
            title={t("qrScanApproving")}
            body=""
            spinner
          />
        )}

        {phase === PHASES.done && (
          <PhaseCard
            kind="success"
            title={t("qrScanApproved")}
            body={t("qrScanApprovedBody")}
          />
        )}

        {phase === PHASES.error && (
          <PhaseCard
            kind="error"
            title={t("qrScanError")}
            body={errorText || ""}
            primary={{ label: t("close"), onClick: onClose }}
          />
        )}
      </div>
    </div>
  );
}

// ─── sub-components ──────────────────────────────────────────────────

function ConfirmCard({ info, onApprove, onReject }) {
  const browserGuess = guessBrowser(info?.userAgent || "");
  const osGuess = guessOs(info?.userAgent || "");
  return (
    <div className="mt-2">
      <div className="rounded-xl border border-[var(--border-light)] p-4 bg-gray-50 dark:bg-[#1f1f1f] space-y-2">
        <Row label={t("qrScanFieldBrowser")} value={browserGuess} />
        <Row label={t("qrScanFieldOs")} value={osGuess} />
        <Row label={t("qrScanFieldIp")} value={info?.ip || "?"} mono />
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onReject}
          className="flex-1 px-4 py-2 rounded-lg border border-[var(--border-light)] text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
        >
          {t("qrScanReject")}
        </button>
        <button
          type="button"
          onClick={onApprove}
          className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 btn-gradient"
        >
          {t("qrScanApprove")}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 shrink-0">
        {label}
      </span>
      <span className={`text-sm truncate text-gray-800 dark:text-gray-100 ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}

function PhaseCard({ kind, title, body, primary, spinner }) {
  const color =
    kind === "success"
      ? "text-emerald-600 dark:text-emerald-300"
      : kind === "error"
      ? "text-red-600 dark:text-red-400"
      : kind === "warning"
      ? "text-amber-600 dark:text-amber-300"
      : "text-gray-700 dark:text-gray-200";
  return (
    <div className="mt-2 text-center">
      {spinner && (
        <div className="flex justify-center mb-3">
          <Spinner small />
        </div>
      )}
      <h4 className={`text-base font-semibold ${color} mb-1`}>{title}</h4>
      {body && (
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-snug">
          {body}
        </p>
      )}
      {primary && (
        <button
          type="button"
          onClick={primary.onClick}
          className="mt-4 px-4 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 btn-gradient"
        >
          {primary.label}
        </button>
      )}
    </div>
  );
}

function Spinner({ small }) {
  const size = small ? "w-6 h-6" : "w-10 h-10";
  return (
    <svg
      className={`${size} text-indigo-500 animate-spin`}
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

function CloseGlyph() {
  return (
    <svg
      className="w-5 h-5"
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

// Quick-and-dirty UA fingerprinting just for the confirmation card.
// Used only for human-readable labels — never trusted for security
// decisions — so a bare-string match is plenty.
function guessBrowser(ua) {
  if (!ua) return "?";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Brave/i.test(ua)) return "Brave";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
  return ua.slice(0, 40);
}
function guessOs(ua) {
  if (!ua) return "?";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iOS/i.test(ua)) return "iOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "?";
}
