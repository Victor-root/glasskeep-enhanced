import React, { useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { API_BASE } from "../../utils/api.js";
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

    useEffect(() => {
        if (!active || !token) {
            setInfo(null);
            return;
        }
        let cancelled = false;
        let timer = null;
        const tick = async () => {
            if (cancelled) return;
            try {
                const res = await fetch(`${API_BASE}/admin/self-update/system`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!cancelled && res.ok) {
                    const data = await res.json().catch(() => null);
                    if (!cancelled && data) setInfo(data);
                }
            } catch {
                /* keep showing the last value */
            }
            if (!cancelled) timer = setTimeout(tick, 2000);
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

    // CPU load. loadavg[0] is the 1-minute load average from the OS.
    // Normalised by the CPU count it maps to a familiar "0..100% per
    // core" gauge: 1.0 on a 1-core box = fully busy, 2.0 = overloaded
    // with one task waiting in the queue. Capped at 200% for display
    // (the bar itself clips at 100% but the percentage label tells
    // the truth).
    const cpuCount = info.cpu?.count || 1;
    const cpuLoad = info.cpu?.load1 || 0;
    const cpuPercentRaw = (cpuLoad / cpuCount) * 100;
    const cpuPercent = Math.min(200, Math.max(0, cpuPercentRaw));
    const cpuElevated = cpuPercent >= 70;
    const cpuHigh = cpuPercent >= 100;
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

    return (
        <div className="mt-3 space-y-2 text-xs">
            <div>
                <div className={`flex items-center justify-between mb-1 ${labelClass}`}>
                    <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true">💾</span>
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
            <div>
                <div className={`flex items-center justify-between mb-1 ${cpuLabelClass}`}>
                    <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true">⚙️</span>
                        {t("selfUpdateCpuLabel")}
                        {cpuHigh && (
                            <span className="ml-1 font-semibold">
                                · {t("selfUpdateCpuSaturated")}
                            </span>
                        )}
                    </span>
                    <span className="tabular-nums">
                        {cpuLoad.toFixed(2)} / {cpuCount} {cpuCount > 1 ? t("selfUpdateCpuCores") : t("selfUpdateCpuCore")} ({cpuPercentRaw.toFixed(0)}%)
                    </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                    <div
                        className={`h-full transition-[width] duration-500 ${cpuBarClass}`}
                        style={{ width: `${Math.min(100, cpuPercent)}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

function TechnicalLog({ token, phase, showDetails }) {
    const [text, setText] = useState("");
    const scrollRef = useRef(null);
    // Sticky-bottom auto-scroll. Default true so the panel jumps to
    // the latest line on first render; flipped to false the moment
    // the admin scrolls up to read earlier output, restored when
    // they scroll back to the bottom.
    const stickToBottomRef = useRef(true);

    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        stickToBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    };

    // After every log update, glue the view to the bottom — but only
    // if the admin had not scrolled away from it.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || !stickToBottomRef.current) return;
        el.scrollTop = el.scrollHeight;
    }, [text]);

    useEffect(() => {
        if (!showDetails || !token) return;
        let cancelled = false;
        let timer = null;

        const fetchOnce = async () => {
            if (cancelled) return;
            try {
                const res = await fetch(`${API_BASE}/admin/self-update/log`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (cancelled) return;
                if (res.status === 204) {
                    setText("");
                } else if (res.ok) {
                    const raw = await res.text();
                    if (!cancelled) setText(raw);
                }
            } catch {
                /* ignore — the modal is not the place to surface a fetch hiccup */
            }
            const active =
                phase === "starting" ||
                phase === "running" ||
                phase === "waiting_for_server";
            if (!cancelled && active) {
                timer = setTimeout(fetchOnce, 2000);
            }
        };

        fetchOnce();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [showDetails, token, phase]);

    const items = processLog(text);

    return (
        <div className="mt-3 rounded-lg border border-[var(--border-light)] bg-gray-50 dark:bg-black/30 p-3 text-[11px] font-mono text-gray-700 dark:text-gray-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                {t("selfUpdateLogTitle")}
            </div>
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="max-h-72 overflow-y-auto overflow-x-hidden -mx-1 px-1"
            >
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
};

function stepLabel(state) {
    const key = STEP_LABEL_KEYS[state];
    return key ? t(key) : state || "";
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
    if (phase === "error" || phase === "rolled_back") {
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

export default function SelfUpdateProgress({ selfUpdate, token }) {
    const {
        phase,
        status,
        startError,
        dismiss,
        acknowledge,
        isActive,
        slowResponse,
    } = selfUpdate;
    const [showDetails, setShowDetails] = useState(false);

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
    const terminal = success || error || rolledBack;
    const waiting = phase === "waiting_for_server";

    const headline = success
        ? t("selfUpdateHeadlineSuccess")
        : error
          ? t("selfUpdateHeadlineError")
          : rolledBack
            ? t("selfUpdateHeadlineRolledBack")
            : t("selfUpdateHeadlineRunning");

    const subtext = success
        ? t("selfUpdateSubtextSuccess")
        : error
          ? t("selfUpdateSubtextError")
          : rolledBack
            ? t("selfUpdateSubtextRolledBack")
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
            <div className="w-full max-w-2xl max-h-[calc(100dvh-2rem)] flex flex-col rounded-2xl border border-[var(--border-light)] bg-white dark:bg-[var(--bg-elevated,#1a1a1f)] shadow-2xl overflow-hidden">
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

                    {/* Live RAM gauge, polled separately from the
                        status. Only visible while the update is
                        active so it does not clutter terminal states. */}
                    {!terminal && (
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
                <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-2">
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
                                label={t("selfUpdateDetailStep")}
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
                    {showDetails && (
                        <TechnicalLog
                            token={token}
                            phase={phase}
                            showDetails={showDetails}
                        />
                    )}
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
                    {(error || rolledBack) && (
                        <button
                            type="button"
                            onClick={dismiss}
                            className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                        >
                            {t("selfUpdateClose")}
                        </button>
                    )}
                    {isActive && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {t("selfUpdateKeepOpenHint")}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
