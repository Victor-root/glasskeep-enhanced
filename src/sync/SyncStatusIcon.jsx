// src/sync/SyncStatusIcon.jsx
// Cloud sync status icon with dropdown menu showing detailed sync state

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";

// ─── SVG Icons ───

const CloudCheck = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" />
    <polyline points="9 12 11.5 14.5 15 10" />
  </svg>
);

const CloudPending = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" />
    <line x1="12" y1="11" x2="12" y2="15" />
    <line x1="10" y1="13" x2="14" y2="13" />
  </svg>
);

const CloudSync = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" />
    <path d="M8 14l2-2 2 2" />
    <path d="M10 12v5" />
    <path d="M16 13l-2 2-2-2" />
    <path d="M14 15v-5" />
  </svg>
);

const CloudOff = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const CloudError = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" />
    <line x1="12" y1="10" x2="12" y2="14" />
    <circle cx="12" cy="17" r="0.5" fill="currentColor" />
  </svg>
);

const RefreshIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const WarningIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// Solid red padlock used both as a badge over the cloud icon and
// inline in the sync dropdown. We render the body and shackle filled
// so it stays readable at small sizes without a background ring.
const LockBadge = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 1 1 8 0v3" fill="none" strokeWidth="2.5" />
  </svg>
);

const MAX_RETRIES = 5; // must match syncEngine.js

// ─── Status config ───

function getStatusConfig(syncState, dark) {
  switch (syncState) {
    case "checking":
      return {
        Icon: CloudPending,
        color: dark ? "text-gray-400" : "text-gray-500",
        hoverBg: "",
        label: t("syncServerChecking"),
        animate: true,
      };
    case "synced":
      return {
        Icon: CloudCheck,
        color: dark ? "text-emerald-400" : "text-emerald-600",
        hoverBg: "",
        label: t("syncStatusSynced"),
        animate: false,
      };
    case "pending":
      return {
        Icon: CloudPending,
        color: dark ? "text-amber-400" : "text-amber-600",
        hoverBg: "",
        label: t("syncStatusPending"),
        animate: false,
      };
    case "syncing":
      return {
        Icon: CloudSync,
        color: dark ? "text-blue-400" : "text-blue-600",
        hoverBg: "",
        label: t("syncStatusSyncing"),
        animate: true,
      };
    case "offline":
      return {
        Icon: CloudOff,
        color: dark ? "text-gray-400" : "text-gray-500",
        hoverBg: "",
        label: t("syncStatusOffline"),
        animate: false,
      };
    case "error":
      return {
        Icon: CloudError,
        color: dark ? "text-red-400" : "text-red-600",
        hoverBg: "",
        label: t("syncStatusError"),
        animate: false,
      };
    default:
      return {
        Icon: CloudPending,
        color: dark ? "text-gray-400" : "text-gray-500",
        hoverBg: "",
        label: "...",
        animate: false,
      };
  }
}

// ─── Action type labels ───

function actionTypeLabel(type) {
  const map = {
    create: t("syncActionCreate"),
    update: t("syncActionUpdate"),
    patch: t("syncActionPatch"),
    archive: t("syncActionArchive"),
    trash: t("syncActionTrash"),
    restore: t("syncActionRestore"),
    permanentDelete: t("syncActionDelete"),
    reorder: t("syncActionReorder"),
  };
  return map[type] || type;
}

function formatTimeAgo(ts) {
  if (!ts) return null;
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return t("syncJustNow") || "just now";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ─── Component ───

export default function SyncStatusIcon({ dark, syncStatus, onSyncNow, syncDropdownOpen, setSyncDropdownOpen, instanceLocked = false }) {
  const open = syncDropdownOpen;
  const setOpen = setSyncDropdownOpen;
  const [forceSyncing, setForceSyncing] = useState(false);
  const menuRef = useRef(null);
  const btnRef = useRef(null);
  // Same swallow-next-click pattern as the header kebab menu. The host
  // <header> has transform: translateY(0) which clips any fixed-inset-0
  // backdrop to the header rect, leaving the rest of the screen open.
  // So we use a document-level pointerdown listener instead, then swallow
  // the follow-up click to stop it reaching note cards behind the panel.
  const swallowNextClickRef = useRef(false);
  const swallowClearTimerRef = useRef(null);

  // Force re-render every 10s so "time ago" stays fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((v) => v + 1), 10000);
    return () => clearInterval(id);
  }, [open]);

  // Permanent click swallower — mounted once, never torn down.
  useEffect(() => {
    const onClick = (e) => {
      if (!swallowNextClickRef.current) return;
      swallowNextClickRef.current = false;
      if (swallowClearTimerRef.current) {
        clearTimeout(swallowClearTimerRef.current);
        swallowClearTimerRef.current = null;
      }
      e.stopPropagation();
      e.preventDefault();
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (swallowClearTimerRef.current) {
        clearTimeout(swallowClearTimerRef.current);
        swallowClearTimerRef.current = null;
      }
    };
  }, []);

  // Close on outside tap/click — pointerdown + flag prevents the follow-up
  // click from reaching elements behind the panel on mobile.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      // Portal-safe + null-safe: the sheet is portalled to <body>, and across
      // the portal/IIFE re-render menuRef.current can be momentarily null —
      // in which case the menuRef check below falls through and the sheet
      // closes the instant you touch its OWN grabber. closest() walks the
      // target's real DOM ancestry, so a touch anywhere inside the sheet
      // (grabber included) is correctly treated as "inside".
      if (e.target?.closest?.(".gk-sync-sheet")) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      swallowNextClickRef.current = true;
      if (swallowClearTimerRef.current) clearTimeout(swallowClearTimerRef.current);
      swallowClearTimerRef.current = setTimeout(() => {
        swallowNextClickRef.current = false;
        swallowClearTimerRef.current = null;
      }, 500);
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, setOpen]);

  // Slide the phone sheet in: flip .is-open one frame after mount so the
  // transform transition has a from-state (translateY(-100%)) to animate from.
  // No body-scroll lock on purpose — it shifted the page and could get stuck;
  // the sheet simply overlays the header.
  const [animIn, setAnimIn] = useState(false);
  useEffect(() => {
    if (!open) { setAnimIn(false); return undefined; }
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setAnimIn(true)); });
    return () => { cancelAnimationFrame(r1); if (r2) cancelAnimationFrame(r2); };
  }, [open]);

  // Grabber drag-to-close (phone sheet). The sheet is anchored at the top, so
  // dragging the grabber UP collapses it. The drag moves the panel via an
  // inline transform; the CSS uses a transition (not a keyframe animation) so
  // nothing holds transform and the panel follows the finger 1:1.
  const dragRef = useRef({ active: false, startY: 0, currentY: 0 });
  const handleGrabberDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    const panel = menuRef.current;
    if (!panel) return;
    dragRef.current = { active: true, startY: e.clientY, currentY: 0 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    panel.style.transition = "none";
  };
  const handleGrabberMove = (e) => {
    if (!dragRef.current.active) return;
    const dy = Math.max(0, dragRef.current.startY - e.clientY);
    dragRef.current.currentY = dy;
    if (menuRef.current) menuRef.current.style.transform = `translateY(-${dy}px)`;
  };
  const handleGrabberUp = (e) => {
    if (!dragRef.current.active) return;
    const dy = dragRef.current.currentY;
    dragRef.current.active = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    const panel = menuRef.current;
    if (!panel) return;
    if (dy > 60) {
      setOpen(false);
    } else {
      // Snap back: restore the CSS transition, clear the inline transform so
      // .is-open (translateY 0) takes over and animates the panel home.
      panel.style.transition = "";
      panel.style.transform = "";
    }
  };
  const isMobileSheet = typeof window !== "undefined" && window.innerWidth < 640;

  if (!syncStatus) return null;

  const {
    syncState, serverReachable, hasPendingChanges, lastSyncAt, lastSyncError,
    pending, processing, retry, failed, total, items, failedChecks,
  } = syncStatus;

  const config = getStatusConfig(syncState, dark);
  const { Icon, color, label, animate } = config;

  const retryItems = (items || []).filter((i) => i.status === "retry");
  const failedItems = (items || []).filter((i) => i.status === "failed");
  const pendingAndProcessing = (pending || 0) + (processing || 0);

  // Server status line
  let serverLabel, serverColor, serverDotColor;
  if (syncState === "offline") {
    serverLabel = t("syncServerUnreachable") || "Server unreachable";
    serverColor = dark ? "text-red-400" : "text-red-600";
    serverDotColor = "bg-red-500";
  } else if (syncState === "error") {
    serverLabel = t("syncServerReachableErrors") || "Server reachable";
    serverColor = dark ? "text-amber-400" : "text-amber-600";
    serverDotColor = "bg-amber-500";
  } else if (syncState === "syncing") {
    serverLabel = t("syncServerReachable") || "Server reachable";
    serverColor = dark ? "text-emerald-400" : "text-emerald-600";
    serverDotColor = "bg-emerald-500";
  } else if (syncState === "checking") {
    serverLabel = t("syncServerChecking") || "Checking server...";
    serverColor = dark ? "text-gray-400" : "text-gray-500";
    serverDotColor = "bg-gray-400";
  } else if (serverReachable === false) {
    serverLabel = t("syncServerUnreachable") || "Server unreachable";
    serverColor = dark ? "text-red-400" : "text-red-600";
    serverDotColor = "bg-red-500";
  } else if (serverReachable === true) {
    serverLabel = t("syncServerReachable") || "Server reachable";
    serverColor = dark ? "text-emerald-400" : "text-emerald-600";
    serverDotColor = "bg-emerald-500";
  } else {
    serverLabel = t("syncServerChecking") || "Checking server...";
    serverColor = dark ? "text-gray-400" : "text-gray-500";
    serverDotColor = "bg-gray-400";
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={`p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 gk-header-icon-btn ${color} ${animate ? "animate-pulse" : ""}`}
        data-tooltip={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon className="w-5 h-5" />
        {/* Badge for pending count */}
        {total > 0 && syncState !== "synced" && !instanceLocked && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold px-1 leading-none">
            {total}
          </span>
        )}
        {/* Lock badge — server reachable but at-rest-locked. Solid red
            padlock right at the top-right of the cloud, no ring. We
            also drop the pending-count badge when locked because
            nothing's going to sync anyway and the operator's
            attention should go to the lock state. */}
        {instanceLocked && (
          <LockBadge className="absolute top-0 right-0 w-3.5 h-3.5 text-red-600" />
        )}
      </button>

      {open && (() => {
        // Phone (<640px): a full-width top SHEET portalled to <body> so it's
        // positioned relative to the viewport (the header's transform would
        // otherwise make `fixed` relative to the header + its padding). The
        // .gk-sync-sheet CSS drives the full-width/slide/safe-top on phones.
        // Desktop keeps the anchored popover rendered inline (sm: classes).
        //
        // NotesHeader renders TWO SyncStatusIcon (desktop + mobile clusters)
        // that share syncDropdownOpen. The hidden one used to keep its inline
        // dropdown hidden via its display:none container — but a portal escapes
        // to <body> and would show a DUPLICATE sheet. So the hidden instance
        // (its button has no offsetParent) renders nothing on phones.
        if (isMobileSheet && btnRef.current && btnRef.current.offsetParent === null) {
          return null;
        }
        const sheet = (
          <div
            ref={menuRef}
            className={`gk-sync-sheet ${animIn ? "is-open" : ""} fixed top-14 left-1/2 -translate-x-1/2 sm:absolute sm:top-12 sm:left-auto sm:right-0 sm:translate-x-0 w-[calc(100vw-1rem)] max-w-[340px] sm:w-auto sm:min-w-[280px] z-[1100] border rounded-lg overflow-hidden ${
              dark
                ? "bg-[var(--gk-statusbar)] sm:bg-[#222] border-gray-700 text-gray-100"
                : "bg-[var(--gk-statusbar)] sm:bg-[#f9f6ff] border-gray-200 text-gray-800"
            }`}
            // Mobile sheet layout is driven inline off the same JS flag that
            // decides to render the sheet — exactly like the notification sheet
            // — so it never desyncs from the CSS media query at the 639/640px
            // boundary (which left the Tailwind rounded top corners poking out
            // as white notches under the header). Square top + no top/side
            // border = flush with the header; rounded bottom only.
            style={isMobileSheet ? {
              position: "fixed",
              top: "var(--safe-top, 0px)",
              left: 0,
              right: 0,
              width: "100%",
              maxWidth: "none",
              translate: "none",
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              borderBottomLeftRadius: "1rem",
              borderBottomRightRadius: "1rem",
              borderTopWidth: 0,
              borderLeftWidth: 0,
              borderRightWidth: 0,
            } : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Phone sheet: small close affordance, below the status bar. */}
            {isMobileSheet && (
              <button
                type="button"
                aria-label={t("close")}
                onClick={() => setOpen(false)}
                className={`absolute right-2 z-10 w-8 h-8 rounded-md flex items-center justify-center ${dark ? "text-gray-400 hover:text-gray-100 hover:bg-white/10" : "text-gray-500 hover:text-gray-800 hover:bg-black/5"}`}
                style={{ top: "0.5rem" }}
              >
                ✕
              </button>
            )}
            {/* ── Section 1: Status header ── */}
            <div className={`px-4 py-3 border-b ${dark ? "border-[rgba(255,255,255,0.06)]" : "border-[rgba(0,0,0,0.06)]"}`}>
              <div className="flex items-center gap-2">
                <Icon className={`w-5 h-5 ${color}`} />
                <span className="font-semibold text-sm">{label}</span>
              </div>

              {/* Server status + last sync */}
              <div className="mt-1.5 flex items-center gap-2 text-xs">
                <span className={`inline-flex items-center gap-1 ${serverColor}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${serverDotColor}`} />
                  {serverLabel}
                </span>
                {lastSyncAt && (
                  <span className={dark ? "text-gray-500" : "text-gray-400"}>
                    · {formatTimeAgo(lastSyncAt)}
                  </span>
                )}
              </div>

              {/* Instance lock state — separate line so the user can
                  see at a glance that the server is up AND that the
                  encryption layer is gating writes. */}
              {instanceLocked && (
                <div className={`mt-1.5 flex items-start gap-1.5 text-xs ${dark ? "text-red-400" : "text-red-600"}`}>
                  <LockBadge className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="leading-snug">{t("syncInstanceLocked")}</span>
                </div>
              )}

              {/* Error detail when server is down */}
              {serverReachable === false && lastSyncError && lastSyncError !== "Server unreachable" && lastSyncError !== "Browser offline" && (
                <div className={`mt-0.5 text-xs ${dark ? "text-red-400/70" : "text-red-500/70"}`}>
                  {lastSyncError.startsWith("Backend not responding") ? (t("syncErrorBackendDown") || "The proxy is responding but GlassKeep is not accessible") :
                   lastSyncError.startsWith("Server error") ? (t("syncErrorServerError") || `The server returned an error (${lastSyncError})`) :
                   lastSyncError === "Health check timeout" ? (t("syncErrorTimeout") || "Health check timed out") :
                   lastSyncError}
                </div>
              )}

              {/* Reconnection attempts */}
              {failedChecks > 0 && syncState === "offline" && (
                <div className={`mt-1 text-xs ${dark ? "text-amber-400" : "text-amber-600"}`}>
                  {t("syncFailedChecks", { count: failedChecks })}
                </div>
              )}
            </div>

            {/* ── Section 2: Queue summary (pending + processing) ── */}
            {pendingAndProcessing > 0 && (
              <div className={`px-4 py-2.5 border-b ${dark ? "border-[rgba(255,255,255,0.06)]" : "border-[rgba(0,0,0,0.06)]"}`}>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full ${processing > 0 ? "bg-blue-500 animate-pulse" : "bg-amber-500"}`} />
                  <span className={dark ? "text-gray-300" : "text-gray-600"}>
                    {processing > 0
                      ? t("syncQueueSyncing", { processing, pending: pending || 0 })
                      : t("syncQueueWaiting", { count: pending })
                    }
                  </span>
                </div>
              </div>
            )}

            {/* ── Section 3a: Retrying (amber — transient, will be retried) ── */}
            {retryItems.length > 0 && (
              <div className={`border-b ${dark ? "border-[rgba(255,255,255,0.06)]" : "border-[rgba(0,0,0,0.06)]"}`}>
                <div className={`px-4 pt-2.5 pb-1.5 flex items-center gap-1.5 text-xs font-medium ${dark ? "text-amber-400" : "text-amber-600"}`}>
                  <RefreshIcon className="w-3 h-3" />
                  {t("syncRetryingTitle")}
                </div>
                <div className="max-h-[120px] overflow-y-auto">
                  {retryItems.map((item) => (
                    <div
                      key={item.queueId}
                      className={`px-4 py-1.5 text-xs ${dark ? "hover:bg-white/5" : "hover:bg-gray-50"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={dark ? "text-gray-300" : "text-gray-700"}>
                          {actionTypeLabel(item.type)}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={dark ? "text-amber-400/70" : "text-amber-500"}>
                            {t("syncRetryCount", { count: item.attempts })}/{MAX_RETRIES}
                          </span>
                          <span className={dark ? "text-gray-500" : "text-gray-400"}>
                            {item.noteId && item.noteId !== "__reorder__" ? `#${item.noteId.slice(0, 8)}` : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="h-1" />
              </div>
            )}

            {/* ── Section 3b: Failed (red — permanent, max retries reached) ── */}
            {(failed > 0 || (lastSyncError && syncState === "error")) && (
              <div className={`border-b ${dark ? "border-[rgba(255,255,255,0.06)]" : "border-[rgba(0,0,0,0.06)]"}`}>
                <div className={`px-4 pt-2.5 pb-1.5 flex items-center gap-1.5 text-xs font-medium ${dark ? "text-red-400" : "text-red-600"}`}>
                  <WarningIcon className="w-3.5 h-3.5" />
                  {t("syncErrorsTitle")}
                </div>

                {/* Global error (only if not duplicated by item errors) */}
                {lastSyncError && syncState === "error" && (failedItems.length === 0 || !failedItems.some(i => i.lastError === lastSyncError)) && (
                  <div className={`px-4 py-1.5 text-xs ${dark ? "text-red-400/80" : "text-red-500"}`}>
                    {lastSyncError}
                  </div>
                )}

                {failedItems.length > 0 && (
                  <div className="max-h-[180px] overflow-y-auto">
                    {failedItems.map((item) => (
                      <div
                        key={item.queueId}
                        className={`px-4 py-2 text-xs ${dark ? "hover:bg-white/5" : "hover:bg-gray-50"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-medium ${dark ? "text-gray-300" : "text-gray-700"}`}>
                            {actionTypeLabel(item.type)}
                          </span>
                          <div className="flex items-center gap-2">
                            {item.attempts > 0 && (
                              <span className={dark ? "text-gray-500" : "text-gray-400"}>
                                {t("syncRetryCount", { count: item.attempts })}
                              </span>
                            )}
                            <span className={`truncate ${dark ? "text-gray-500" : "text-gray-400"}`}>
                              {item.noteId && item.noteId !== "__reorder__" ? `#${item.noteId.slice(0, 8)}` : ""}
                            </span>
                          </div>
                        </div>
                        {item.lastError && (
                          <div className={`mt-0.5 ${dark ? "text-red-400/70" : "text-red-500/80"}`}>
                            {item.lastError}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="h-1" />
              </div>
            )}

            {/* ── Section 4: Sync button ── */}
            <div className="px-4 py-3">
              <button
                disabled={forceSyncing}
                onClick={async () => {
                  if (forceSyncing) return;
                  setForceSyncing(true);
                  try {
                    await onSyncNow?.();
                  } finally {
                    setForceSyncing(false);
                  }
                }}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  forceSyncing
                    ? "bg-indigo-400 text-white/70 cursor-wait"
                    : dark
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                      : "bg-indigo-500 hover:bg-indigo-600 text-white"
                }`}
              >
                <RefreshIcon className={`w-4 h-4 ${forceSyncing ? "animate-spin" : ""}`} />
                {forceSyncing ? (t("syncServerChecking") || "Checking server...") : t("syncNow")}
              </button>
            </div>

            {/* ── Section 5: Safe to close ── */}
            {hasPendingChanges || syncState === "error" || syncState === "offline" ? (
              <div className={`px-4 pb-3 text-xs text-center ${dark ? "text-amber-400" : "text-amber-600"}`}>
                {t("syncNotSafeToClose")}
              </div>
            ) : syncState === "synced" ? (
              <div className={`px-4 pb-3 text-xs text-center ${dark ? "text-emerald-400" : "text-emerald-600"}`}>
                {t("syncSafeToClose")}
              </div>
            ) : null}
            {/* Phone sheet: bottom grabber — drag up to dismiss (like the notif sheet). */}
            {isMobileSheet && (
              <div
                className="gk-sync-sheet__grabber"
                onPointerDown={handleGrabberDown}
                onPointerMove={handleGrabberMove}
                onPointerUp={handleGrabberUp}
                onPointerCancel={handleGrabberUp}
              />
            )}
          </div>
        );
        return isMobileSheet ? createPortal(sheet, document.body) : sheet;
      })()}
    </div>
  );
}
