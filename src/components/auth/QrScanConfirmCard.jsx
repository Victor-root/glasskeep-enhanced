import React from "react";
import { t } from "../../i18n";

// Approve / Reject card of the QR scanner: which browser, system and IP
// address asked to be signed in.
export default function QrScanConfirmCard({ info, onApprove, onReject }) {
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
          className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 hover:scale-[1.03] active:scale-[0.98] btn-gradient"
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
        {value || "-"}
      </span>
    </div>
  );
}

// Quick-and-dirty UA fingerprinting just for the confirmation card.
// Used only for human-readable labels, never trusted for security
// decisions, so a bare-string match is plenty.
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
