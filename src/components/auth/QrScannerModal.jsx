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
import { QrSpinner, CloseGlyph } from "./QrGlyphs.jsx";
import QrScanConfirmCard from "./QrScanConfirmCard.jsx";
import QrScanPhaseCard from "./QrScanPhaseCard.jsx";

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the scan state each time the modal opens, before starting the camera
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

  // Body-scroll lock — without this, swipes started inside the QR
  // modal can scroll / swipe-navigate the notes view underneath on
  // Android (the modal's `fixed` positioning catches taps but doesn't
  // prevent gesture chaining to the body). Restore the previous
  // overflow/touch-action on cleanup so unmounting a *second* modal
  // on top of this one doesn't permanently lock the body.
  useEffect(() => {
    if (!open) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyTouchAction: body.style.touchAction,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    body.style.overscrollBehavior = "contain";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.touchAction = prev.bodyTouchAction;
      body.style.overscrollBehavior = prev.bodyOverscroll;
    };
  }, [open]);

  const handleApprove = async () => {
    if (!linkToken) return;
    setPhase(PHASES.approving);
    try {
      await approveDeviceLink(linkToken, token);
      setPhase(PHASES.done);
      if (showToast) showToast(t("qrScanApproved"), "success", undefined, "qr");
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
            the stream.
            ⚠ We must NOT touch the <video>'s visibility / opacity /
            display while qr-scanner is running: the library reads
            the computed style and, if it sees the video hidden,
            overrides it with `position: fixed; left:0; top:0;
            width:1px; height:1px; opacity:0;` (Safari workaround,
            see the "QrScanner has overwritten the video hiding
            style" console log). Once that override is applied the
            camera feed never paints again. So the video stays
            visually untouched and we cover it with an opaque
            overlay during the loading phase — same visual result,
            no stylistic battle with the scanner. */}
        <div
          // 3:4 portrait container (was aspect-square) — phone back
          // cameras output a portrait stream and `object-cover` was
          // cropping its left + right edges hard inside the square,
          // ~doubling the perceived zoom. A 3:4 box closely matches
          // the native stream ratio so the visible field of view is
          // roughly what the camera actually sees.
          className="relative w-full aspect-[3/4] rounded-xl overflow-hidden bg-black"
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
          />
          {phase === PHASES.loading && (
            <div className="absolute inset-0 bg-black flex flex-col items-center justify-center text-white/80 gap-4">
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
              <QrSpinner size="w-6 h-6" />
            </div>
          )}
        </div>

        {phase === PHASES.wrongOrigin && (
          <QrScanPhaseCard
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
          <QrScanPhaseCard
            kind="info"
            title={t("qrScanFetching")}
            body=""
            spinner
          />
        )}

        {phase === PHASES.confirm && info && (
          <QrScanConfirmCard
            info={info}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        )}

        {phase === PHASES.approving && (
          <QrScanPhaseCard
            kind="info"
            title={t("qrScanApproving")}
            body=""
            spinner
          />
        )}

        {phase === PHASES.done && (
          <QrScanPhaseCard
            kind="success"
            title={t("qrScanApproved")}
            body={t("qrScanApprovedBody")}
          />
        )}

        {phase === PHASES.error && (
          <QrScanPhaseCard
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
