import React, { useRef, useState } from "react";
import { t } from "../../i18n";
import { AUDIO_MAX_TOTAL_BYTES } from "../../utils/audioNote.js";
import Popover from "../common/Popover.jsx";

// Discreet circular storage indicator: "Storage ●" pill that lives in the
// modal footer area. Click the ring to open a popover showing detailed
// limits + the per-note gauge. The bar inside the popover keeps the longer
// linear visualisation (easier to read exact values) while the trigger
// itself stays compact so it doesn't fight with the "Edited:" stamp on
// the opposite side.
//
// Two consumers:
//   - NoteModal bottom row (static, mirrors the "Edited:" stamp position)
//   - AudioNoteEditor RecorderPanel (live, pulses while recording so the
//     user sees the cap fill up in real time)

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Ko";
  const KB = 1024;
  const MB = 1024 * 1024;
  if (bytes < MB) return `${Math.round(bytes / KB)} Ko`;
  const mb = bytes / MB;
  return mb >= 10 || mb === Math.floor(mb)
    ? `${Math.round(mb)} Mo`
    : `${mb.toFixed(1)} Mo`;
}

// Three usage zones drive both the ring colour and the popover bar fill.
// Picked so the green→amber→red transition is immediately readable
// peripherally; the exact thresholds are arbitrary but match common
// "X% full" warnings (warn at 70, danger at 90).
function zoneFor(pct) {
  if (pct < 70) return {
    ring: "#10b981",  // emerald-500
    fill: "from-emerald-400 to-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  };
  if (pct < 90) return {
    ring: "#f59e0b",  // amber-500
    fill: "from-amber-400 to-orange-500",
    text: "text-amber-600 dark:text-amber-400",
  };
  return {
    ring: "#e11d48",  // rose-600
    fill: "from-rose-500 to-red-600",
    text: "text-rose-600 dark:text-rose-400",
  };
}

function CircularRing({ pct, color, live, size = 16 }) {
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`shrink-0 ${live ? "animate-pulse" : ""}`}
      aria-hidden="true"
    >
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="opacity-25"
      />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 300ms ease-out, stroke 200ms ease-out" }}
      />
    </svg>
  );
}

export default function StorageGauge({
  usedBytes = 0,
  maxBytes = AUDIO_MAX_TOTAL_BYTES,
  live = false,
  // "ring": compact "Stockage ●" pill used in the modal bottom row.
  // "bar":  wider linear bar used inside the RecorderPanel where the live
  //         fill reads better against a vertical stack of timer + status.
  variant = "ring",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const ratio = Math.min(1, Math.max(0, usedBytes / maxBytes));
  const pct = Math.round(ratio * 100);
  const zone = zoneFor(pct);

  return (
    <div className={`relative ${className}`}>
      {variant === "bar" ? (
        <button
          ref={btnRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className={`w-full group flex items-center gap-2 px-2 py-1 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-current/30 ${pct >= 90 ? zone.text : "text-gray-600 dark:text-gray-300"}`}
          aria-label={t("audioStorageGaugeLabel").replace("{pct}", String(pct))}
          data-tooltip={t("audioStorageTooltip")}
        >
          <span className="text-[11px] font-medium shrink-0">{t("audioStorageLabel")}</span>
          <div className="flex-1 h-1.5 rounded-full bg-black/10 dark:bg-white/15 overflow-hidden relative">
            <div
              className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-300 ease-out ${zone.fill} ${live ? "animate-pulse" : ""}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] tabular-nums font-semibold shrink-0">{pct}%</span>
        </button>
      ) : (
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-current/30 ${pct >= 90 ? zone.text : ""}`}
        aria-label={t("audioStorageGaugeLabel").replace("{pct}", String(pct))}
        data-tooltip={t("audioStorageTooltip")}
      >
        <span>{t("audioStorageLabel")}</span>
        <CircularRing pct={pct} color={zone.ring} live={live} />
      </button>
      )}

      <Popover anchorRef={btnRef} open={open} onClose={() => setOpen(false)}>
        <div
          className="w-72 max-w-[90vw] rounded-xl border border-[var(--border-light)] bg-white dark:bg-[#222222] text-gray-800 dark:text-gray-100 shadow-xl p-4 space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div>
            <div className="text-sm font-semibold mb-1">{t("audioStorageTitle")}</div>
            <div className="text-[11px] opacity-70 leading-snug">{t("audioStorageDescription")}</div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">
                {t("audioStorageNoteUsage")}
              </span>
              <span className={`text-xs font-bold tabular-nums ${zone.text}`}>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-black/10 dark:bg-white/15 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${zone.fill}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums opacity-70">
              <span>{formatBytes(usedBytes)}</span>
              <span>{formatBytes(maxBytes)}</span>
            </div>
          </div>

          <div className="space-y-1.5 text-[12px] border-t border-[var(--border-light)] pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="opacity-70">{t("audioStorageLimitNote")}</span>
              <span className="font-semibold tabular-nums">{formatBytes(maxBytes)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="opacity-70">{t("audioStorageEstimate")}</span>
              <span className="font-semibold">{t("audioStorageEstimateValue")}</span>
            </div>
          </div>

          <div className="text-[11px] opacity-60 leading-relaxed">
            {t("audioStorageHint")}
          </div>
        </div>
      </Popover>
    </div>
  );
}
