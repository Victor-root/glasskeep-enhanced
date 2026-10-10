import React, { useEffect, useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { fetchSelfUpdateLive } from "./selfUpdateHelpers.js";

// Compact RAM / CPU load monitor shown next to the progress bar while
// an update is in flight. The values come from `/api/admin/self-
// update/system` which the server exposes for exactly this purpose;
// we poll every 2 seconds (slower than the status poll because RAM
// drift over 500 ms intervals is not interesting). Polling is gated
// on a hard error count so a couple of timeouts during a heavy build
// don't blank the readout: it just keeps showing the last value.
const HIGH_RAM_THRESHOLD = 90; // %: flips the bar to red + warning
const ELEVATED_RAM_THRESHOLD = 75; // %: flips the bar to amber

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "-";
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    if (bytes < 1024 * 1024 * 1024)
        return `${Math.round(bytes / (1024 * 1024))} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// One labelled gauge: red past `high`, amber past `elevated`, green
// otherwise. `children` is the reading shown on the right.
function Gauge({ icon, label, saturatedLabel, high, elevated, percent, children }) {
    const barClass = high
        ? "bg-red-500"
        : elevated
          ? "bg-amber-500"
          : "bg-emerald-500";
    const labelClass = high
        ? "text-red-600 dark:text-red-300 font-medium"
        : elevated
          ? "text-amber-600 dark:text-amber-300"
          : "text-gray-500 dark:text-gray-400";
    return (
        <div>
            <div className={`flex items-center justify-between mb-1 ${labelClass}`}>
                <span className="inline-flex items-center gap-1.5">
                    {icon}
                    {label}
                    {high && (
                        <span className="ml-1 font-semibold">
                            · {saturatedLabel}
                        </span>
                    )}
                </span>
                <span className="tabular-nums">
                    {children}
                </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                <div
                    className={`h-full transition-[width] duration-500 ${barClass}`}
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
}

export default function SelfUpdateSystemMonitor({ token, active }) {
    const [info, setInfo] = useState(null);
    // Number of consecutive failed (or aborted-too-slow) polls
    // since the last successful read. We flip the UI to "stale" when
    // this gets high enough: the gauges keep showing the last
    // valid values (still useful info) but it's clear they no
    // longer reflect reality. Common cause: the build has hijacked
    // every available CPU cycle and the API server can no longer
    // answer in time.
    const [staleStreak, setStaleStreak] = useState(0);

    useEffect(() => {
        if (!active || !token) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the gauges when monitoring stops or the token goes away
            setInfo(null);
            setStaleStreak(0);
            return;
        }
        let cancelled = false;
        let timer = null;
        const tick = async () => {
            if (cancelled) return;
            // Bound each fetch so a CPU-starved server doesn't park
            // the gauge on its previous value for 30 s while the
            // browser quietly waits. If the server is too busy to
            // answer in 5 s, we abort and re-tick: values stay on
            // their last reading but the polling loop keeps a
            // predictable cadence.
            const ctrl = new AbortController();
            const tHandle = setTimeout(() => ctrl.abort(), 5000);
            let ok = false;
            try {
                const res = await fetchSelfUpdateLive("system", token, ctrl.signal);
                if (!cancelled && res.ok) {
                    const data = await res.json().catch(() => null);
                    if (!cancelled && data) {
                        setInfo(data);
                        ok = true;
                    }
                }
            } catch {
                /* abort or network hiccup: keep showing the last value */
            } finally {
                clearTimeout(tHandle);
            }
            if (!cancelled) {
                setStaleStreak((n) => (ok ? 0 : n + 1));
                timer = setTimeout(tick, 1000);
            }
        };
        tick();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [active, token]);

    if (!active || !info) return null;

    const percent = Math.min(100, Math.max(0, info.mem.percent || 0));

    // Swap. The server returns null when no swap is configured so we
    // can suppress the row entirely instead of rendering a meaningless
    // 0/0. Thresholds are deliberately more lenient than RAM: some
    // swap usage during a build is healthy (it's exactly why we have
    // swap), so the bar only goes amber past 50 % and red past 90 %.
    const swap = info.swap;
    const swapPercent = swap
        ? Math.min(100, Math.max(0, swap.percent || 0))
        : 0;

    // CPU usage as a real 0-100 % derived server-side from a delta
    // of /proc/stat tick counters. We hide the bar entirely if the
    // server can't compute it yet (first poll has no previous
    // sample, so percent is null); the next 2-second tick fills it
    // in. Much more honest than scaling load-avg, which can stay
    // above 100 % long after the CPU is back to idle.
    const cpuCount = info.cpu?.count || 1;
    const cpuPercent =
        typeof info.cpu?.percent === "number" ? info.cpu.percent : null;

    // After ~3 consecutive failed polls the server has lost the
    // ability to keep up: the gauges still display the last good
    // values (informative: "the system WAS at 99 % when we last
    // heard"), but we badge them so the admin doesn't think the
    // numbers reflect the current second.
    const isStale = staleStreak >= 3;

    return (
        <div className="mt-3 space-y-2 text-xs">
            {isStale && (
                <p className="text-amber-600 dark:text-amber-400 italic">
                    {t("selfUpdateGaugesStale")}
                </p>
            )}
            <Gauge
                icon={<TI.Ram className="tabler-icon w-3 h-3" />}
                label={t("selfUpdateRamLabel")}
                saturatedLabel={t("selfUpdateRamSaturated")}
                high={percent >= HIGH_RAM_THRESHOLD}
                elevated={percent >= ELEVATED_RAM_THRESHOLD}
                percent={percent}
            >
                {formatBytes(info.mem.used)} / {formatBytes(info.mem.total)} ({percent.toFixed(0)}%)
            </Gauge>
            {swap && (
                <Gauge
                    icon={<TI.Swap className="tabler-icon w-3 h-3" />}
                    label={t("selfUpdateSwapLabel")}
                    saturatedLabel={t("selfUpdateSwapSaturated")}
                    high={swapPercent >= 90}
                    elevated={swapPercent >= 50}
                    percent={swapPercent}
                >
                    {formatBytes(swap.used)} / {formatBytes(swap.total)} ({swapPercent.toFixed(0)}%)
                </Gauge>
            )}
            {cpuPercent !== null && (
                <Gauge
                    icon={<TI.Cpu className="tabler-icon w-3.5 h-3.5" />}
                    label={t("selfUpdateCpuLabel")}
                    saturatedLabel={t("selfUpdateCpuSaturated")}
                    high={cpuPercent >= 90}
                    elevated={cpuPercent >= 70}
                    percent={cpuPercent}
                >
                    {cpuPercent.toFixed(0)}% ({cpuCount}{" "}
                    {cpuCount > 1
                        ? t("selfUpdateCpuCores")
                        : t("selfUpdateCpuCore")})
                </Gauge>
            )}
        </div>
    );
}
