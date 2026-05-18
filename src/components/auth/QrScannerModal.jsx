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
  // Optical zoom slider state. Some Android cameras default to a
  // narrow / cropped view; querying MediaTrackCapabilities.zoom and
  // pinning the track to the smallest supported value gives the
  // widest field of view by default, and exposes a slider so the
  // user can zoom IN if they need to fill the frame with a QR
  // that's far away. Hidden when the active camera doesn't expose
  // the `zoom` capability (older devices, most desktop webcams,
  // Android System WebView builds).
  const [zoomCaps, setZoomCaps] = useState(null); // { min, max, step }
  const [zoomValue, setZoomValue] = useState(1);
  const videoTrackRef = useRef(null);

  // Match the camera container's aspect ratio to whatever the active
  // stream actually delivers. Without this, a 9:16 portrait stream
  // (Android back cam in environment mode) gets cropped horizontally
  // by ~25% inside the static 3:4 container — which is exactly what
  // the user perceived as "the camera is too zoomed in", even on
  // devices that don't expose hardware zoom at all. Lets the WebView
  // path benefit even though it can't move the zoom slider.
  const [streamAspect, setStreamAspect] = useState(null);

  // Track which token we've already submitted to the server so a
  // shaky camera doesn't double-POST when the user holds the phone
  // steady and the same QR is decoded twice.
  const submittedRef = useRef(null);

  const stopScanner = useCallback(() => {
    videoTrackRef.current = null;
    const s = scannerRef.current;
    if (!s) return;
    try { s.stop(); } catch { /* ignore */ }
    try { s.destroy(); } catch { /* ignore */ }
    scannerRef.current = null;
  }, []);

  // Slider handler. Browsers reject zoom values outside the
  // capability range so we don't clamp here — but we silence the
  // promise rejection because the input could fire faster than the
  // camera can keep up.
  const onZoomChange = useCallback((next) => {
    const value = Number(next);
    if (!Number.isFinite(value)) return;
    setZoomValue(value);
    const track = videoTrackRef.current;
    if (!track) return;
    try {
      track.applyConstraints({ advanced: [{ zoom: value }] }).catch(() => {});
    } catch { /* track gone — slider will re-attach next open */ }
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
    setZoomCaps(null);
    setZoomValue(1);
    setStreamAspect(null);

    const start = async () => {
      const video = videoRef.current;
      if (!video) return;

      // Pick up the real stream dimensions as soon as they're known —
      // before the first frame is decoded videoWidth/videoHeight are
      // both 0, so we wait for loadedmetadata (or use the values now
      // if metadata is already in by the time we attach).
      const captureAspect = () => {
        if (!videoRef.current) return;
        const w = videoRef.current.videoWidth;
        const h = videoRef.current.videoHeight;
        if (w > 0 && h > 0 && !cancelled) {
          setStreamAspect(w / h);
          console.log("[QR] stream dimensions:", w, "x", h, "→ aspect", (w / h).toFixed(3));
        }
      };
      video.addEventListener("loadedmetadata", captureAspect);
      if (video.videoWidth > 0) captureAspect();

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
        captureAspect();
        probeAndApplyZoom(video, () => cancelled, setZoomCaps, setZoomValue, videoTrackRef);
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
          // Container's aspect ratio adapts to whatever the camera
          // stream actually delivers (read from videoWidth/videoHeight
          // on loadedmetadata). The 3:4 here is a placeholder used
          // before metadata is in. Why this matters: a 9:16 portrait
          // Android stream inside a static 3:4 box gets cropped ~25%
          // horizontally by object-cover, which the user perceives as
          // "the camera is zoomed in too much". Adapting the box
          // eliminates the crop and we see the camera's real FoV —
          // no hardware zoom required.
          className="relative w-full rounded-xl overflow-hidden bg-black"
          style={{
            display:
              phase === PHASES.loading || phase === PHASES.scanning
                ? "block"
                : "none",
            aspectRatio: streamAspect
              ? String(streamAspect)
              : "3 / 4",
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
              <Spinner small />
            </div>
          )}
          {/* Zoom slider — overlaid on the bottom of the camera surface
              so it doesn't push the modal's layout around when it
              appears. Only rendered when the active track exposes a
              `zoom` capability and we're actually scanning. The
              gradient backdrop keeps the slider legible regardless of
              what the camera sees. */}
          {phase === PHASES.scanning && zoomCaps && (
            <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-6 bg-gradient-to-t from-black/60 via-black/30 to-transparent flex items-center gap-2 select-none">
              <ZoomGlyph dir="out" />
              <input
                type="range"
                min={zoomCaps.min}
                max={zoomCaps.max}
                step={zoomCaps.step}
                value={zoomValue}
                onChange={(e) => onZoomChange(parseFloat(e.target.value))}
                aria-label={t("qrScanZoom")}
                className="flex-1 accent-indigo-400 cursor-pointer"
              />
              <ZoomGlyph dir="in" />
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

// ─── helpers ─────────────────────────────────────────────────────────

// Probe the back camera's zoom range and pin the track to its widest
// setting. Two strategies, in order:
//
//   1. MediaTrackCapabilities.zoom — the "spec" way. Many Android
//      WebViews populate this lazily so we retry a handful of times
//      before giving up.
//
//   2. Trial-and-error applyConstraints — fallback for WebView builds
//      that accept advanced[zoom] constraints WITHOUT advertising
//      them through getCapabilities(). We try a few canonical values
//      (0.5, 1, 2, 4, 8) and keep whichever the device accepts.
//
// All probe attempts are logged so a chrome://inspect session can
// pinpoint why no slider appears on a given phone.
async function probeAndApplyZoom(video, isCancelled, setZoomCaps, setZoomValue, videoTrackRef) {
  try {
    const stream = video?.srcObject;
    const track = stream && stream.getVideoTracks
      ? stream.getVideoTracks()[0]
      : null;
    if (!track) {
      console.log("[QR] zoom probe: no video track");
      return;
    }
    videoTrackRef.current = track;

    // ── Strategy 1: getCapabilities() with retries ─────────────────
    if (typeof track.getCapabilities === "function") {
      for (let i = 0; i < 6; i++) {
        if (isCancelled()) return;
        const caps = track.getCapabilities() || {};
        const settings = typeof track.getSettings === "function"
          ? track.getSettings() || {}
          : {};
        console.log("[QR] zoom probe attempt", i, "caps:", caps, "settings:", settings);

        if (caps.zoom && typeof caps.zoom === "object"
            && Number.isFinite(Number(caps.zoom.min))
            && Number.isFinite(Number(caps.zoom.max))
            && Number(caps.zoom.max) > Number(caps.zoom.min)) {
          const min = Number(caps.zoom.min);
          const max = Number(caps.zoom.max);
          const step = Number(caps.zoom.step) || 0.1;
          if (!isCancelled()) {
            setZoomCaps({ min, max, step });
            setZoomValue(min);
          }
          try {
            await track.applyConstraints({ advanced: [{ zoom: min }] });
            console.log("[QR] zoom via caps applied:", min);
          } catch (e) {
            console.log("[QR] zoom applyConstraints rejected:", e?.message || e);
          }
          return;
        }

        await new Promise(r => setTimeout(r, 250));
      }
      console.log("[QR] zoom caps absent after retries — falling back to trial");
    } else {
      console.log("[QR] getCapabilities unsupported — falling back to trial");
    }

    // ── Strategy 2: trial-and-error applyConstraints ───────────────
    // Some Android WebViews silently accept any advanced[zoom] value
    // without throwing, even on devices with no zoom hardware. To
    // distinguish "accepted but no-op" from "real support", we read
    // back getSettings().zoom after each apply and require it to
    // actually move.
    const probeValue = async (value) => {
      try {
        await track.applyConstraints({ advanced: [{ zoom: value }] });
        const after = typeof track.getSettings === "function"
          ? Number(track.getSettings()?.zoom)
          : undefined;
        return Number.isFinite(after) ? after : null;
      } catch {
        return null;
      }
    };

    if (isCancelled()) return;
    const baseline = await probeValue(1);
    console.log("[QR] trial probe baseline @ zoom=1 →", baseline);
    if (baseline == null) {
      console.log("[QR] trial probe: device rejected zoom=1, no slider");
      return;
    }

    // Walk down to find the smallest accepted value (ultra-wide), then
    // up to find the largest (max telephoto / digital).
    let detectedMin = 1;
    for (const candidate of [0.5, 0.6, 0.7, 0.8, 0.9]) {
      if (isCancelled()) return;
      const after = await probeValue(candidate);
      console.log("[QR] trial probe min @ zoom=", candidate, "→", after);
      if (after != null && Math.abs(after - candidate) < 0.15) {
        detectedMin = candidate;
        break;
      }
    }
    let detectedMax = 1;
    for (const candidate of [8, 6, 4, 3, 2]) {
      if (isCancelled()) return;
      const after = await probeValue(candidate);
      console.log("[QR] trial probe max @ zoom=", candidate, "→", after);
      if (after != null && Math.abs(after - candidate) < 0.5) {
        detectedMax = candidate;
        break;
      }
    }

    if (detectedMax > detectedMin) {
      console.log("[QR] trial probe accepted range:", detectedMin, "→", detectedMax);
      if (!isCancelled()) {
        setZoomCaps({ min: detectedMin, max: detectedMax, step: 0.1 });
        setZoomValue(detectedMin);
      }
      await probeValue(detectedMin);
    } else {
      console.log("[QR] trial probe: no usable range (min ==", detectedMin, ", max ==", detectedMax, ") — no slider");
    }
  } catch (e) {
    console.log("[QR] zoom probe threw:", e?.message || e);
  }
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

// Magnifier glyphs flanking the zoom slider. `dir="out"` → minus (left
// edge, widest field of view), `dir="in"` → plus (right edge, tightest
// crop). Inline SVG so they inherit currentColor and stay crisp.
function ZoomGlyph({ dir }) {
  return (
    <svg
      className="w-4 h-4 text-white/90 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="7" />
      <line x1="21" y1="21" x2="15" y2="15" />
      <line x1="7" y1="10" x2="13" y2="10" />
      {dir === "in" && <line x1="10" y1="7" x2="10" y2="13" />}
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
