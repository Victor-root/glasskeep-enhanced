import React, { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { API_BASE, api } from "../../utils/api.js";
import TI from "../../icons/editor/index.jsx";
import { markChangelogToShow } from "./ChangelogModal.jsx";

// Asset listing lines vite emits at the end of every build. There can
// be hundreds of them for the @fontsource packages, and they drown
// out the lines that actually matter (the JS bundle size, the
// warnings). Detect and collapse them into a single expandable group.
const FONT_ASSET_RE = /^dist\/assets\/.+\.(woff2?|otf|ttf|eot)\s/;

function processLog(text) {
    if (!text) return [];
    const out = [];
    let fonts = [];
    const flush = () => {
        if (fonts.length > 0) {
            out.push({ type: "fonts", count: fonts.length, lines: fonts });
            fonts = [];
        }
    };
    for (const line of text.split("\n")) {
        if (FONT_ASSET_RE.test(line)) {
            fonts.push(line);
        } else {
            flush();
            out.push({ type: "line", text: line });
        }
    }
    flush();
    // Drop trailing empty lines for tidiness.
    while (
        out.length > 0 &&
        out[out.length - 1].type === "line" &&
        out[out.length - 1].text === ""
    ) {
        out.pop();
    }
    return out;
}

function FontGroup({ count, lines }) {
    const [open, setOpen] = useState(false);
    const action = open ? t("selfUpdateLogHideFonts") : t("selfUpdateLogShowFonts");
    const label = t("selfUpdateLogFontAssets").replace("{count}", count);
    return (
        <div className="text-gray-500 dark:text-gray-400">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
            >
                <span className="opacity-70">{open ? "▼" : "▶"}</span>
                <span className="italic">+ {label}</span>
                <span className="opacity-60">({action})</span>
            </button>
            {open && (
                <div className="pl-4 mt-0.5 opacity-70">
                    {lines.map((l, i) => (
                        <div key={i} className="whitespace-pre-wrap break-words">
                            {l}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Compact RAM / CPU load monitor shown next to the progress bar while
// an update is in flight. The values come from `/api/admin/self-
// update/system` which the server exposes for exactly this purpose;
// we poll every 2 seconds (slower than the status poll because RAM
// drift over 500 ms intervals is not interesting). Polling is gated
// on a hard error count so a couple of timeouts during a heavy build
// don't blank the readout — it just keeps showing the last value.
const HIGH_RAM_THRESHOLD = 90; // % — flips the bar to red + warning
const ELEVATED_RAM_THRESHOLD = 75; // % — flips the bar to amber

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    if (bytes < 1024 * 1024 * 1024)
        return `${Math.round(bytes / (1024 * 1024))} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function SystemMonitor({ token, active }) {
    const [info, setInfo] = useState(null);
    // Number of consecutive failed (or aborted-too-slow) polls
    // since the last successful read. We flip the UI to "stale" when
    // this gets high enough — the gauges keep showing the last
    // valid values (still useful info) but it's clear they no
    // longer reflect reality. Common cause: the build has hijacked
    // every available CPU cycle and the API server can no longer
    // answer in time.
    const [staleStreak, setStaleStreak] = useState(0);

    useEffect(() => {
        if (!active || !token) {
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
            // answer in 5 s, we abort and re-tick — values stay on
            // their last reading but the polling loop keeps a
            // predictable cadence.
            const ctrl = new AbortController();
            const tHandle = setTimeout(() => ctrl.abort(), 5000);
            let ok = false;
            try {
                // cache:no-store + a fresh _t every call guarantee the
                // browser hits the network instead of returning the
                // same response from its HTTP cache. Without this the
                // gauges look frozen because every poll resolves to
                // the very first reading.
                const res = await fetch(
                    `${API_BASE}/admin/self-update/system?_t=${Date.now()}`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                        cache: "no-store",
                        signal: ctrl.signal,
                    }
                );
                if (!cancelled && res.ok) {
                    const data = await res.json().catch(() => null);
                    if (!cancelled && data) {
                        setInfo(data);
                        ok = true;
                    }
                }
            } catch {
                /* abort or network hiccup — keep showing the last value */
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
    const elevated = percent >= ELEVATED_RAM_THRESHOLD;
    const high = percent >= HIGH_RAM_THRESHOLD;
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

    // Swap. The server returns null when no swap is configured so we
    // can suppress the row entirely instead of rendering a meaningless
    // 0/0. Thresholds are deliberately more lenient than RAM — some
    // swap usage during a build is healthy (it's exactly why we have
    // swap), so the bar only goes amber past 50 % and red past 90 %.
    const swap = info.swap;
    const swapPercent = swap
        ? Math.min(100, Math.max(0, swap.percent || 0))
        : 0;
    const swapElevated = swap && swapPercent >= 50;
    const swapHigh = swap && swapPercent >= 90;
    const swapBarClass = swapHigh
        ? "bg-red-500"
        : swapElevated
          ? "bg-amber-500"
          : "bg-emerald-500";
    const swapLabelClass = swapHigh
        ? "text-red-600 dark:text-red-300 font-medium"
        : swapElevated
          ? "text-amber-600 dark:text-amber-300"
          : "text-gray-500 dark:text-gray-400";

    // CPU usage as a real 0-100 % derived server-side from a delta
    // of /proc/stat tick counters. We hide the bar entirely if the
    // server can't compute it yet (first poll has no previous
    // sample, so percent is null); the next 2-second tick fills it
    // in. Much more honest than scaling load-avg, which can stay
    // above 100 % long after the CPU is back to idle.
    const cpuCount = info.cpu?.count || 1;
    const cpuPercent =
        typeof info.cpu?.percent === "number" ? info.cpu.percent : null;
    const cpuElevated = cpuPercent !== null && cpuPercent >= 70;
    const cpuHigh = cpuPercent !== null && cpuPercent >= 90;
    const cpuBarClass = cpuHigh
        ? "bg-red-500"
        : cpuElevated
          ? "bg-amber-500"
          : "bg-emerald-500";
    const cpuLabelClass = cpuHigh
        ? "text-red-600 dark:text-red-300 font-medium"
        : cpuElevated
          ? "text-amber-600 dark:text-amber-300"
          : "text-gray-500 dark:text-gray-400";

    // After ~3 consecutive failed polls the server has lost the
    // ability to keep up — the gauges still display the last good
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
            <div>
                <div className={`flex items-center justify-between mb-1 ${labelClass}`}>
                    <span className="inline-flex items-center gap-1.5">
                        <TI.Ram className="tabler-icon w-3 h-3" />
                        {t("selfUpdateRamLabel")}
                        {high && (
                            <span className="ml-1 font-semibold">
                                · {t("selfUpdateRamSaturated")}
                            </span>
                        )}
                    </span>
                    <span className="tabular-nums">
                        {formatBytes(info.mem.used)} / {formatBytes(info.mem.total)} ({percent.toFixed(0)}%)
                    </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                    <div
                        className={`h-full transition-[width] duration-500 ${barClass}`}
                        style={{ width: `${percent}%` }}
                    />
                </div>
            </div>
            {swap && (
                <div>
                    <div className={`flex items-center justify-between mb-1 ${swapLabelClass}`}>
                        <span className="inline-flex items-center gap-1.5">
                            <TI.Swap className="tabler-icon w-3 h-3" />
                            {t("selfUpdateSwapLabel")}
                            {swapHigh && (
                                <span className="ml-1 font-semibold">
                                    · {t("selfUpdateSwapSaturated")}
                                </span>
                            )}
                        </span>
                        <span className="tabular-nums">
                            {formatBytes(swap.used)} / {formatBytes(swap.total)} ({swapPercent.toFixed(0)}%)
                        </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                        <div
                            className={`h-full transition-[width] duration-500 ${swapBarClass}`}
                            style={{ width: `${swapPercent}%` }}
                        />
                    </div>
                </div>
            )}
            {cpuPercent !== null && (
                <div>
                    <div className={`flex items-center justify-between mb-1 ${cpuLabelClass}`}>
                        <span className="inline-flex items-center gap-1.5">
                            <TI.Cpu className="tabler-icon w-3.5 h-3.5" />
                            {t("selfUpdateCpuLabel")}
                            {cpuHigh && (
                                <span className="ml-1 font-semibold">
                                    · {t("selfUpdateCpuSaturated")}
                                </span>
                            )}
                        </span>
                        <span className="tabular-nums">
                            {cpuPercent.toFixed(0)}% ({cpuCount}{" "}
                            {cpuCount > 1
                                ? t("selfUpdateCpuCores")
                                : t("selfUpdateCpuCore")})
                        </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                        <div
                            className={`h-full transition-[width] duration-500 ${cpuBarClass}`}
                            style={{ width: `${cpuPercent}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function TechnicalLog({ token, phase, showDetails, onTextChanged }) {
    const [text, setText] = useState("");

    // Tell the parent every time the log text changes so the modal's
    // outer scroll container can stick to the bottom AND so the
    // parent can scan the latest output for known failure patterns
    // (OOM during build, lost network, etc.) to surface a friendlier
    // hint in the header. Auto-scrolling lives at the modal level
    // now — the technical log no longer has its own scroll area: a
    // long log just grows the modal and the user scrolls the whole
    // thing.
    useEffect(() => {
        if (typeof onTextChanged === "function") onTextChanged(text);
    }, [text, onTextChanged]);

    useEffect(() => {
        // Fetch the log whenever the modal is non-idle, even if the
        // details section is collapsed — the parent uses the text to
        // detect failure hints, which need to be available the
        // moment we hit a terminal failure state regardless of
        // whether the user expanded the panel.
        if (!token) return;
        const active =
            phase === "starting" ||
            phase === "running" ||
            phase === "waiting_for_server";
        const terminal =
            phase === "success" ||
            phase === "error" ||
            phase === "rolled_back";
        if (!active && !terminal) return;
        let cancelled = false;
        let timer = null;

        const fetchOnce = async () => {
            if (cancelled) return;
            // Same bound as the system endpoint — the build can stall
            // the server's event loop badly enough that a default
            // fetch would wait minutes.
            const ctrl = new AbortController();
            const tHandle = setTimeout(() => ctrl.abort(), 5000);
            try {
                const res = await fetch(
                    `${API_BASE}/admin/self-update/log?_t=${Date.now()}`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                        cache: "no-store",
                        signal: ctrl.signal,
                    }
                );
                if (cancelled) return;
                if (res.status === 204) {
                    setText("");
                } else if (res.ok) {
                    const raw = await res.text();
                    if (!cancelled) setText(raw);
                }
            } catch {
                /* ignore — the modal is not the place to surface a fetch hiccup */
            } finally {
                clearTimeout(tHandle);
            }
            // Re-poll only while the update is still running. Once
            // we hit a terminal state we fetched the final log
            // content above; no need to keep hammering the server.
            const stillActive =
                phase === "starting" ||
                phase === "running" ||
                phase === "waiting_for_server";
            if (!cancelled && stillActive) {
                timer = setTimeout(fetchOnce, 1000);
            }
        };

        fetchOnce();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [token, phase]);

    const items = processLog(text);

    return (
        <div className="mt-3 rounded-lg border border-[var(--border-light)] bg-gray-50 dark:bg-black/30 p-3 text-[11px] font-mono text-gray-700 dark:text-gray-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                {t("selfUpdateLogTitle")}
            </div>
            <div className="-mx-1 px-1">
                {items.length === 0 ? (
                    <div className="opacity-60 italic">
                        {t("selfUpdateLogEmpty")}
                    </div>
                ) : (
                    items.map((it, i) =>
                        it.type === "fonts" ? (
                            <FontGroup
                                key={i}
                                count={it.count}
                                lines={it.lines}
                            />
                        ) : (
                            <div key={i} className="whitespace-pre-wrap break-words">
                                {it.text || " "}
                            </div>
                        )
                    )
                )}
            </div>
        </div>
    );
}

// =============================================================================
//  SelfUpdateProgress
//
//  Full-screen, blocking overlay shown while a one-click update is in
//  flight. Keeps the admin from interacting with stale UI during the
//  service restart and gives a clear visual of the running step.
//
//  Driven entirely by the `selfUpdate` object returned by useSelfUpdate().
//  Renders nothing when the update is idle.
// =============================================================================

const STEP_LABEL_KEYS = {
    queued: "selfUpdateStepQueued",
    preparing: "selfUpdateStepPreparing",
    stopping_service: "selfUpdateStepStopping",
    fetching: "selfUpdateStepFetching",
    renaming: "selfUpdateStepRenaming",
    creating: "selfUpdateStepCreating",
    installing: "selfUpdateStepInstalling",
    building: "selfUpdateStepBuilding",
    starting_service: "selfUpdateStepStarting",
    rolling_back: "selfUpdateStepRollingBack",
    success: "selfUpdateStepSuccess",
    error: "selfUpdateStepError",
    rolled_back: "selfUpdateStepRolledBack",
    cancelled: "selfUpdateStepCancelled",
};

function stepLabel(state) {
    const key = STEP_LABEL_KEYS[state];
    return key ? t(key) : state || "";
}

// Scan the technical log for known failure patterns and map them to
// a category. The category drives a friendlier subtext / hint in the
// header so the admin sees "out of memory during build" instead of
// just the generic "exit 134". Categories are intentionally
// conservative — when in doubt, return null and we fall back to the
// default rolled_back / error messaging.
function detectFailureHint(logText) {
    if (!logText) return null;
    if (
        /Reached heap limit|JavaScript heap out of memory|Allocation failed/i.test(
            logText
        )
    ) {
        return "oom";
    }
    if (
        /Could not resolve host|Connection refused|ENETUNREACH|Network is unreachable|fatal: unable to access/i.test(
            logText
        )
    ) {
        return "network";
    }
    if (/Permission denied|EACCES/i.test(logText)) {
        return "permissions";
    }
    if (/ENOSPC|No space left on device/i.test(logText)) {
        return "disk";
    }
    return null;
}

function modeLabel(mode) {
    if (mode === "native") return t("selfUpdateDetailModeNative");
    if (mode === "docker") return t("selfUpdateDetailModeDocker");
    return mode || t("selfUpdateEmpty");
}

function formatDuration(startISO, endISO) {
    if (!startISO || !endISO) return t("selfUpdateEmpty");
    const s = Date.parse(startISO);
    const e = Date.parse(endISO);
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return t("selfUpdateEmpty");
    const ms = e - s;
    if (ms < 1000) return `${ms} ms`;
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s2 = totalSec % 60;
    return m > 0 ? `${m}m ${s2}s` : `${s2}s`;
}

// Renders a single label/value row for the expert details panel.
// Hidden when the value is empty so the panel stays compact for
// runs that did not produce certain fields (no error, no rollback).
function DetailRow({ label, value, monoValue = true, hideIfEmpty = false }) {
    if (hideIfEmpty && (value === null || value === undefined || value === "")) {
        return null;
    }
    const v =
        value === null || value === undefined || value === ""
            ? t("selfUpdateEmpty")
            : value;
    return (
        <div className="grid grid-cols-[max-content_1fr] gap-x-3 items-baseline">
            <span className="opacity-60">{label}:</span>
            <span className={monoValue ? "font-mono break-all" : "break-words"}>
                {v}
            </span>
        </div>
    );
}

function ProgressBar({ step, total, terminal, success }) {
    const safeTotal = Math.max(1, total || 1);
    const pct =
        terminal && success
            ? 100
            : terminal
              ? Math.min(100, ((step || 0) / safeTotal) * 100)
              : Math.min(100, ((step || 0) / safeTotal) * 100);
    return (
        <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
            <div
                className={`h-full transition-[width] duration-500 ${
                    terminal && !success
                        ? "bg-red-500"
                        : terminal
                          ? "bg-emerald-500"
                          : "bg-indigo-500"
                }`}
                style={{ width: `${pct}%` }}
            />
        </div>
    );
}

function Spinner() {
    return (
        <span
            className="inline-block w-5 h-5 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin"
            aria-hidden="true"
        />
    );
}

function StateIcon({ phase }) {
    if (phase === "success") {
        return (
            <span className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                <TI.Check className="tabler-icon w-7 h-7" />
            </span>
        );
    }
    if (phase === "error" || phase === "rolled_back" || phase === "cancelled") {
        return (
            <span
                className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                    phase === "error"
                        ? "bg-red-500/15 text-red-600 dark:text-red-300"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                }`}
            >
                <TI.X className="tabler-icon w-7 h-7" />
            </span>
        );
    }
    return (
        <span className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">
            <Spinner />
        </span>
    );
}

export default function SelfUpdateProgress({
    selfUpdate,
    token,
    showGenericConfirm,
}) {
    const {
        phase,
        status,
        startError,
        dismiss,
        acknowledge,
        isActive,
        slowResponse,
        mode,
    } = selfUpdate;
    const [showDetails, setShowDetails] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    // Sticky-bottom auto-scroll, lifted up to the modal level so the
    // technical log can grow naturally without its own scroll area.
    // The middle scrollable section is the one that actually scrolls;
    // it stays "stuck" to the bottom while new log lines arrive,
    // releases the moment the admin scrolls up, and re-engages when
    // they scroll back within 40 px of the end.
    const scrollRef = useRef(null);
    const stickToBottomRef = useRef(true);
    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        stickToBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    };

    // Latest log text, captured here so we can scan it for known
    // failure patterns (OOM, network down, perms…) without lifting
    // the log state out of TechnicalLog. The scan result is fed back
    // into the header subtext so the admin sees "out of memory"
    // instead of just "build exited 134".
    const [logText, setLogText] = useState("");
    const onLogTextChanged = useCallback((newText) => {
        if (typeof newText === "string") setLogText(newText);
        if (!stickToBottomRef.current) return;
        // Wait for the freshly-rendered lines to be in the DOM
        // before we measure scrollHeight.
        requestAnimationFrame(() => {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
        });
    }, []);

    // Lock body scroll while the overlay is shown.
    useEffect(() => {
        if (phase === "idle") return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [phase]);

    if (phase === "idle") return null;

    const success = phase === "success";
    const error = phase === "error";
    const rolledBack = phase === "rolled_back";
    const cancelled = phase === "cancelled";
    const terminal = success || error || rolledBack || cancelled;
    const waiting = phase === "waiting_for_server";

    // Cancel is only meaningful on native installs while the update
    // is actually in flight. We hide the button in any other case
    // so the admin doesn't think they can interrupt the docker swap
    // (we don't support that yet) or cancel a finished run.
    const cancelAvailable =
        isActive &&
        !cancelling &&
        (mode === "native" || (!mode && status?.mode === "native"));

    const requestCancel = () => {
        if (!cancelAvailable) return;
        const fire = async () => {
            setCancelling(true);
            try {
                await api("/admin/self-update/cancel", {
                    method: "POST",
                    token,
                    timeoutMs: 15000,
                });
            } catch {
                /* connection probably dropped because the service is
                 * restarting — that's actually the success path */
            }
            // Polling continues; either the new server reports
            // state="cancelled" and the modal flips to the terminal
            // view, or the response we just got returns cancelled.
        };
        if (typeof showGenericConfirm === "function") {
            showGenericConfirm({
                title: t("selfUpdateCancelConfirmTitle"),
                message: t("selfUpdateCancelConfirmMessage"),
                confirmText: t("selfUpdateCancelConfirmButton"),
                cancelText: t("cancel"),
                variant: "danger",
                // Sit above the self-update modal (z-9999) so the
                // confirm dialog isn't trapped under its backdrop.
                zIndex: 10000,
                onConfirm: fire,
            });
        } else {
            fire();
        }
    };

    const headline = success
        ? t("selfUpdateHeadlineSuccess")
        : error
          ? t("selfUpdateHeadlineError")
          : rolledBack
            ? t("selfUpdateHeadlineRolledBack")
            : cancelled
              ? t("selfUpdateHeadlineCancelled")
              : cancelling
                ? t("selfUpdateHeadlineCancelling")
                : t("selfUpdateHeadlineRunning");

    // When the run failed, scan the technical log for a known
    // failure category (OOM, network, perms, full disk) and prefer
    // the specific message over the generic "couldn't finish" one
    // so the admin learns the actionable cause without having to
    // expand the details panel.
    const failureHint =
        (error || rolledBack) ? detectFailureHint(logText) : null;
    const subtext = success
        ? t("selfUpdateSubtextSuccess")
        : error
          ? failureHint
              ? t(`selfUpdateSubtextError_${failureHint}`)
              : t("selfUpdateSubtextError")
          : rolledBack
            ? failureHint
                ? t(`selfUpdateSubtextRolledBack_${failureHint}`)
                : t("selfUpdateSubtextRolledBack")
            : cancelled
              ? t("selfUpdateSubtextCancelled")
              : cancelling
                ? t("selfUpdateSubtextCancelling")
                : waiting
                  ? t("selfUpdateSubtextWaiting")
                  : t("selfUpdateSubtextRunning");

    const currentStep = waiting
        ? t("selfUpdateStepWaiting")
        : stepLabel(status?.state) || "";

    const step = status?.step || 0;
    const totalSteps = status?.totalSteps || 5;

    const errorMessage = startError || status?.error || null;

    const onReload = async () => {
        try {
            // Wait for the server-side acknowledgement so the freshly
            // mounted hook (post-reload) sees the status as already
            // seen and skips re-opening the modal.
            if (typeof acknowledge === "function") await acknowledge();
        } catch {
            /* best-effort — reload anyway */
        }
        // Tell the post-reload session that the user just came back
        // from a successful in-app update, so the ChangelogModal can
        // pop on first mount. The flag is keyed in localStorage and
        // cleared as soon as the modal reads it, so a CLI update or
        // a manual refresh later never re-triggers it.
        try { markChangelogToShow(); } catch { /* ignore */ }
        // Hard refresh: tear down the PWA service worker and CacheStorage
        // before reloading so the browser actually fetches the new
        // bundle from the network rather than serving the freshly-
        // updated old assets from the SW cache.
        try {
            if ("serviceWorker" in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(
                    regs.map((r) => r.unregister().catch(() => {}))
                );
            }
        } catch {
            /* ignore — SW may be unavailable */
        }
        try {
            if (typeof caches !== "undefined" && caches.keys) {
                const names = await caches.keys();
                await Promise.all(
                    names.map((n) => caches.delete(n).catch(() => {}))
                );
            }
        } catch {
            /* ignore — CacheStorage may be unavailable */
        }
        try {
            window.location.reload();
        } catch {
            /* noop */
        }
    };

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="self-update-headline"
        >
            {/* Modal capped at the viewport height so opening the
                "Show details" panel — which can grow tall on a small
                laptop screen — never pushes the action buttons or
                the header off the page. The header (status + progress)
                and the footer (buttons) stay pinned; the details +
                technical log scroll inside the middle area. */}
            <div className={`w-full max-w-2xl ${showDetails ? "h-[calc(100dvh-2rem)]" : "max-h-[calc(100dvh-2rem)]"} flex flex-col rounded-2xl border border-[var(--border-light)] bg-white dark:bg-[var(--bg-elevated,#1a1a1f)] shadow-2xl overflow-hidden`}>
                <div className="flex-shrink-0 px-6 pt-6 pb-4">
                    <div className="flex items-start gap-4 mb-5">
                        <StateIcon phase={phase} />
                        <div className="min-w-0 flex-1">
                            <h2
                                id="self-update-headline"
                                className="text-lg font-semibold text-gray-900 dark:text-gray-50"
                            >
                                {headline}
                            </h2>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                {subtext}
                            </p>
                        </div>
                    </div>

                    {!terminal && (
                        <>
                            <div className="mb-2 flex items-center justify-between text-sm">
                                <span className="text-gray-700 dark:text-gray-200 font-medium">
                                    {currentStep}
                                </span>
                                <span className="text-gray-500 tabular-nums">
                                    {Math.min(step, totalSteps)} / {totalSteps}
                                </span>
                            </div>
                            <ProgressBar
                                step={step}
                                total={totalSteps}
                                terminal={false}
                                success={false}
                            />
                        </>
                    )}

                    {terminal && (
                        <ProgressBar
                            step={totalSteps}
                            total={totalSteps}
                            terminal={true}
                            success={success}
                        />
                    )}

                    {/* Static hint for the long-running steps. The
                        build especially can crawl on a 256 MB / 1 vCPU
                        host and we want the admin to know that's
                        expected rather than wondering if it's hung. */}
                    {!terminal &&
                        (status?.state === "installing" ||
                            status?.state === "building") && (
                            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                                {t("selfUpdateSlowStepHint")}
                            </p>
                        )}

                    {/* Stronger warning surfaced by the hook when
                        successive status polls time out while we are
                        still in a server-up state — the server is
                        likely CPU-starved, not down. */}
                    {!terminal && slowResponse && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                            {t("selfUpdateSlowResponseHint")}
                        </p>
                    )}

                    {/* Live RAM / Swap / CPU gauges, polled separately
                        from the status. Only visible on native installs
                        and while the update is active — in Docker mode
                        we hide them entirely because the readings only
                        ever reflect this single container, not the
                        host, and showing a partial picture is worse
                        than showing none. */}
                    {!terminal && mode !== "docker" && (
                        <SystemMonitor token={token} active={isActive} />
                    )}

                    {errorMessage && (error || rolledBack) && (
                        <div className="mt-4 rounded-lg border border-red-300/60 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
                            <div className="font-medium mb-0.5">
                                {t("selfUpdateErrorTitle")}
                            </div>
                            <code className="block whitespace-pre-wrap break-words font-mono text-xs">
                                {errorMessage}
                            </code>
                        </div>
                    )}
                </div>

                {/* Scrollable middle. Holds the (collapsible) details
                    panel and the technical log so the modal never
                    overflows the viewport when both are expanded. */}
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="flex-1 min-h-0 overflow-y-auto px-6 pb-2"
                >
                    <button
                        type="button"
                        onClick={() => setShowDetails((v) => !v)}
                        className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 inline-flex items-center gap-1"
                    >
                        <TI.Terminal2 className="tabler-icon w-3.5 h-3.5" />
                        {showDetails
                            ? t("selfUpdateHideDetails")
                            : t("selfUpdateShowDetails")}
                    </button>
                    {showDetails && (
                        <div className="mt-2 rounded-lg border border-[var(--border-light)] bg-gray-50 dark:bg-black/30 p-3 text-xs font-mono text-gray-700 dark:text-gray-200 space-y-1">
                            <DetailRow
                                label={t("selfUpdateDetailMode")}
                                value={modeLabel(status?.mode || selfUpdate.mode)}
                            />
                            <DetailRow
                                label={t("selfUpdateDetailState")}
                                value={stepLabel(status?.state) || (status?.state || phase)}
                            />
                            <DetailRow
                                label={
                                    error || rolledBack
                                        ? t("selfUpdateDetailFailedAtStep")
                                        : t("selfUpdateDetailStep")
                                }
                                value={`${step} / ${totalSteps}`}
                            />
                            <DetailRow
                                label={t("selfUpdateDetailFromVersion")}
                                value={status?.fromVersion ? `v${status.fromVersion}` : null}
                            />
                            <DetailRow
                                label={t("selfUpdateDetailToVersion")}
                                value={status?.toVersion ? `v${status.toVersion}` : null}
                            />
                            <DetailRow
                                label={t("selfUpdateDetailMessage")}
                                value={status?.message}
                                monoValue={false}
                                hideIfEmpty
                            />
                            <DetailRow
                                label={t("selfUpdateDetailStartedAt")}
                                value={status?.startedAt}
                            />
                            <DetailRow
                                label={t("selfUpdateDetailEndedAt")}
                                value={status?.endedAt}
                            />
                            <DetailRow
                                label={t("selfUpdateDetailDuration")}
                                value={formatDuration(status?.startedAt, status?.endedAt)}
                                hideIfEmpty
                            />
                            <DetailRow
                                label={t("selfUpdateDetailAcknowledgedAt")}
                                value={status?.acknowledgedAt}
                                hideIfEmpty
                            />
                            <DetailRow
                                label={t("selfUpdateDetailError")}
                                value={status?.error || startError}
                                monoValue={false}
                                hideIfEmpty
                            />
                            <DetailRow
                                label={t("selfUpdateDetailRolledBack")}
                                value={
                                    status?.rolledBack
                                        ? t("selfUpdateYes")
                                        : t("selfUpdateNo")
                                }
                                hideIfEmpty={!status?.rolledBack && status?.state !== "rolled_back"}
                            />
                        </div>
                    )}
                    {/* Always-mounted (hidden via CSS) so the
                        accumulated log + scroll position survive a
                        toggle of "Show details". The polling effect
                        inside is gated on `showDetails` so we don't
                        chat with the server while the log is hidden. */}
                    <div className={showDetails ? "" : "hidden"}>
                        <TechnicalLog
                            token={token}
                            phase={phase}
                            showDetails={showDetails}
                            onTextChanged={onLogTextChanged}
                        />
                    </div>
                </div>

                <div className="flex-shrink-0 px-6 py-4 border-t border-[var(--border-light)] flex flex-wrap items-center justify-end gap-2">
                    {success && (
                        <button
                            type="button"
                            onClick={onReload}
                            className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700 shadow-md shadow-emerald-300/40 dark:shadow-none hover:shadow-lg hover:shadow-emerald-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <TI.Refresh className="tabler-icon w-4 h-4" />
                            {t("selfUpdateReload")}
                        </button>
                    )}
                    {(error || rolledBack || cancelled) && (
                        <button
                            type="button"
                            onClick={dismiss}
                            className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                        >
                            {t("selfUpdateClose")}
                        </button>
                    )}
                    {cancelAvailable && (
                        <button
                            type="button"
                            onClick={requestCancel}
                            className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-red-300/60 dark:border-red-500/40 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                            <TI.X className="tabler-icon w-3.5 h-3.5" />
                            {t("selfUpdateCancelButton")}
                        </button>
                    )}
                    {isActive && !cancelling && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {t("selfUpdateKeepOpenHint")}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
