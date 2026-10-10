import React, { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { api } from "../../utils/api.js";
import TI from "../../icons/editor/index.jsx";
import { markChangelogToShow } from "./ChangelogModal.jsx";
import SelfUpdateSystemMonitor from "./SelfUpdateSystemMonitor.jsx";
import SelfUpdateTechnicalLog from "./SelfUpdateTechnicalLog.jsx";
import SelfUpdateDetails from "./SelfUpdateDetails.jsx";
import { SelfUpdateProgressBar, SelfUpdateStateIcon } from "./SelfUpdateIndicators.jsx";
import { detectFailureHint, stepLabel } from "./selfUpdateHelpers.js";

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
    // (we don't support that yet) or cancel a finished run. Nor while
    // Node.js itself is being replaced (the server refuses it too).
    const cancelAvailable =
        isActive &&
        !cancelling &&
        status?.state !== "upgrading_runtime" &&
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
                        <SelfUpdateStateIcon phase={phase} />
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
                            <SelfUpdateProgressBar
                                step={step}
                                total={totalSteps}
                                terminal={false}
                                success={false}
                            />
                        </>
                    )}

                    {terminal && (
                        <SelfUpdateProgressBar
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
                        (status?.state === "upgrading_runtime" ||
                            status?.state === "installing" ||
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
                        <SelfUpdateSystemMonitor token={token} active={isActive} />
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
                        <SelfUpdateDetails
                            status={status}
                            mode={selfUpdate.mode}
                            phase={phase}
                            failed={error || rolledBack}
                            step={step}
                            totalSteps={totalSteps}
                            startError={startError}
                        />
                    )}
                    {/* Always-mounted (hidden via CSS) so the
                        accumulated log + scroll position survive a
                        toggle of "Show details". */}
                    <div className={showDetails ? "" : "hidden"}>
                        <SelfUpdateTechnicalLog
                            token={token}
                            phase={phase}
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
