import React, { useRef, useState } from "react";
import { t } from "../../i18n";
import { AUDIO_MAX_TOTAL_BYTES } from "../../utils/audioNote.js";
import Popover from "../common/Popover.jsx";

// Discreet horizontal gauge that shows how full an audio note is relative to
// AUDIO_MAX_TOTAL_BYTES. Click → popover with detailed limits. The bar uses
// three colour zones (green / amber / red) so the user gets at-a-glance
// feedback before the limit is reached.
//
// Used in two places:
//   - AudioNoteEditor (with clips): static, reflects sum of clip sizes
//   - RecorderPanel (during record): live, reflects existing total + the
//     in-progress recording, animated so the user sees it grow.

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Ko";
  const KB = 1024;
  const MB = 1024 * 1024;
  if (bytes < MB) return `${Math.round(bytes / KB)} Ko`;
  const mb = bytes / MB;
  // Whole-MB values get no decimal, otherwise 1 decimal so the bar reads
  // "0.4 / 100 Mo" rather than "0 / 100 Mo" while filling.
  return mb >= 10 || mb === Math.floor(mb)
    ? `${Math.round(mb)} Mo`
    : `${mb.toFixed(1)} Mo`;
}

function zoneFor(pct) {
  // Tailwind gradient classes for the three usage zones. Picked so the
  // visual jump from zone to zone is immediately readable peripherally.
  if (pct < 70) return { fill: "from-emerald-400 to-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
  if (pct < 90) return { fill: "from-amber-400 to-orange-500", text: "text-amber-600 dark:text-amber-400" };
  return { fill: "from-rose-500 to-red-600", text: "text-rose-600 dark:text-rose-400" };
}

export default function StorageGauge({
  usedBytes = 0,
  maxBytes = AUDIO_MAX_TOTAL_BYTES,
  live = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const ratio = Math.min(1, Math.max(0, usedBytes / maxBytes));
  const pct = Math.round(ratio * 100);
  const zone = zoneFor(pct);

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="w-full group flex items-center gap-2 px-2 py-1 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-current/30"
        aria-label={t("audioStorageGaugeLabel").replace("{pct}", String(pct))}
        data-tooltip={t("audioStorageTooltip")}
      >
        <div className="flex-1 h-1.5 rounded-full bg-black/10 dark:bg-white/15 overflow-hidden relative">
          <div
            className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-300 ease-out ${zone.fill} ${live ? "animate-pulse" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-[11px] tabular-nums font-semibold opacity-75 group-hover:opacity-100 transition-opacity ${pct >= 90 ? zone.text : ""}`}>
          {pct}%
        </span>
      </button>

      <Popover anchorRef={btnRef} open={open} onClose={() => setOpen(false)} showArrow>
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
