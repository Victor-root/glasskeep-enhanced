// src/SyncIndicator.jsx
// Sync status icon for the header bar. Shows sync state and allows manual sync trigger.

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { t } from "./i18n";

// ──── SVG Icons ────

function CheckCloudIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9" />
      <polyline points="9 15 12 18 16 12" />
    </svg>
  );
}

function CloudOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2l20 20" />
      <path d="M17.5 8h1.1A4.5 4.5 0 0 1 20 16.8" />
      <path d="M7.6 7.6A7 7 0 0 0 4 14.9" />
      <path d="M12 3a7 7 0 0 1 4.5 1.5" />
    </svg>
  );
}

function CloudUploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9" />
      <polyline points="12 12 12 21" />
      <polyline points="8 16 12 12 16 16" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function AlertCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

// Map action types to user-friendly labels
function actionTypeLabel(type) {
  const map = {
    create: t("syncActionCreate") || "Create",
    update: t("syncActionUpdate") || "Update",
    delete: t("syncActionDelete") || "Delete",
    trash: t("syncActionTrash") || "Trash",
    permanentDelete: t("syncActionPermDelete") || "Perm. delete",
    archive: t("syncActionArchive") || "Archive",
    restore: t("syncActionRestore") || "Restore",
    pin: t("syncActionPin") || "Pin",
  };
  return map[type] || type;
}

// ──── Component ────

export default function SyncIndicator({ syncStatus, onSyncNow, dark }) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      setPopoverOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoverOpen]);

  const { status, pendingCount, lastError, failedActions } = syncStatus;

  // Determine icon, color, and label
  let Icon, colorClass, label, pulse = false;

  switch (status) {
    case "synced":
      Icon = CheckCloudIcon;
      colorClass = dark
        ? "text-green-400 hover:text-green-300 hover:bg-green-500/15"
        : "text-green-600 hover:text-green-700 hover:bg-green-100";
      label = t("syncStatusSynced");
      break;
    case "offline":
      // Offline: always show CloudOff, even with pending changes (no spinner)
      Icon = CloudOffIcon;
      colorClass = dark
        ? "text-orange-400 hover:text-orange-300 hover:bg-orange-500/15"
        : "text-orange-600 hover:text-orange-700 hover:bg-orange-100";
      label = t("syncStatusOffline");
      break;
    case "pending":
      Icon = CloudUploadIcon;
      colorClass = dark
        ? "text-blue-400 hover:text-blue-300 hover:bg-blue-500/15"
        : "text-blue-600 hover:text-blue-700 hover:bg-blue-100";
      label = t("syncStatusPending");
      pulse = true;
      break;
    case "syncing":
      Icon = SpinnerIcon;
      colorClass = dark
        ? "text-indigo-400"
        : "text-indigo-600";
      label = t("syncStatusSyncing");
      break;
    case "error":
      Icon = AlertCircleIcon;
      colorClass = dark
        ? "text-red-400 hover:text-red-300 hover:bg-red-500/15"
        : "text-red-600 hover:text-red-700 hover:bg-red-100";
      label = t("syncStatusError");
      break;
    default:
      Icon = CheckCloudIcon;
      colorClass = dark ? "text-gray-400" : "text-gray-500";
      label = "";
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setPopoverOpen((v) => !v)}
        className={`relative p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-indigo-500 ${colorClass}`}
        data-tooltip={label}
        aria-label={label}
      >
        <Icon />
        {/* Pending badge */}
        {pendingCount > 0 && status !== "syncing" && (
          <span className={`absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full ${dark ? "bg-blue-500 text-white" : "bg-blue-600 text-white"} ${pulse ? "animate-pulse" : ""}`}>
            {pendingCount > 99 ? "99+" : pendingCount}
          </span>
        )}
      </button>

      {/* Popover */}
      {popoverOpen && btnRef.current && createPortal(
        <SyncPopover
          popRef={popRef}
          btnRef={btnRef}
          dark={dark}
          status={status}
          pendingCount={pendingCount}
          lastError={lastError}
          failedActions={failedActions || []}
          label={label}
          onSyncNow={() => {
            onSyncNow?.();
            setPopoverOpen(false);
          }}
          onClose={() => setPopoverOpen(false)}
        />,
        document.body,
      )}
    </>
  );
}

function SyncPopover({ popRef, btnRef, dark, status, pendingCount, lastError, failedActions, label, onSyncNow, onClose }) {
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, []);

  const bgClass = dark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200";
  const textClass = dark ? "text-gray-200" : "text-gray-800";
  const subtextClass = dark ? "text-gray-400" : "text-gray-500";

  const statusColors = {
    synced: dark ? "text-green-400" : "text-green-600",
    offline: dark ? "text-orange-400" : "text-orange-600",
    pending: dark ? "text-blue-400" : "text-blue-600",
    syncing: dark ? "text-indigo-400" : "text-indigo-600",
    error: dark ? "text-red-400" : "text-red-600",
  };

  const canSync = status === "pending" || status === "error" || status === "offline";

  return (
    <>
      {/* Backdrop (invisible, for click-outside) */}
      <div className="fixed inset-0 z-[1099]" onClick={onClose} />
      <div
        ref={popRef}
        className={`fixed z-[1100] w-72 rounded-xl border shadow-xl p-4 ${bgClass} ${textClass}`}
        style={{ top: pos.top, right: pos.right }}
      >
        {/* Status row */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`font-semibold text-sm ${statusColors[status] || ""}`}>
            {label}
          </span>
        </div>

        {/* Details */}
        {pendingCount > 0 && (
          <p className={`text-xs mb-2 ${subtextClass}`}>
            {t("syncPendingActions").replace("{count}", pendingCount)}
          </p>
        )}

        {/* Verbose failed actions list */}
        {failedActions.length > 0 && (
          <div className="mb-2 space-y-1">
            <p className="text-xs font-medium text-red-500">{t("syncFailedDetails") || "Failed actions:"}</p>
            {failedActions.map((fa, i) => (
              <div key={i} className={`text-xs rounded px-2 py-1 ${dark ? "bg-red-900/30 text-red-300" : "bg-red-50 text-red-700"}`}>
                <span className="font-medium">{actionTypeLabel(fa.type)}</span>
                {fa.title && fa.title !== fa.noteId && (
                  <span className="ml-1 opacity-75">— {fa.title.length > 30 ? fa.title.slice(0, 30) + "…" : fa.title}</span>
                )}
                <br />
                <span className="opacity-60">{fa.error}{fa.status ? ` (${fa.status})` : ""}</span>
              </div>
            ))}
          </div>
        )}

        {lastError && failedActions.length === 0 && (
          <p className="text-xs mb-2 text-red-500">
            {lastError}
          </p>
        )}

        {status === "synced" && pendingCount === 0 && (
          <p className={`text-xs mb-2 ${subtextClass}`}>
            {t("syncAllUpToDate")}
          </p>
        )}

        {status === "offline" && pendingCount === 0 && (
          <p className={`text-xs mb-2 ${subtextClass}`}>
            {t("syncOfflineNoChanges")}
          </p>
        )}

        {status === "offline" && pendingCount > 0 && (
          <p className={`text-xs mb-2 ${subtextClass}`}>
            {t("syncOfflinePending") || "Changes will sync when you're back online."}
          </p>
        )}

        {status === "syncing" && (
          <p className={`text-xs mb-2 ${subtextClass}`}>
            {t("syncStatusSyncing")}...
          </p>
        )}

        {/* Sync button */}
        {canSync && (
          <button
            onClick={onSyncNow}
            className={`mt-1 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              dark
                ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                : "bg-indigo-600 hover:bg-indigo-700 text-white"
            }`}
          >
            <RefreshIcon />
            {t("syncNow")}
          </button>
        )}
      </div>
    </>
  );
}
