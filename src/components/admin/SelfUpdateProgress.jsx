import React, { useEffect, useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";

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

export default function SelfUpdateProgress({ selfUpdate }) {
    const { phase, status, startError, dismiss, acknowledge, isActive } =
        selfUpdate;
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
            <div className="w-full max-w-lg rounded-2xl border border-[var(--border-light)] bg-white dark:bg-[var(--bg-elevated,#1a1a1f)] shadow-2xl p-6">
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

                {/* Details toggle — collapsed by default, opens up to show
                    the raw state + version transition. Helps debug when
                    something goes wrong. */}
                <div className="mt-4">
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
                            <div>
                                <span className="opacity-60">mode:</span>{" "}
                                {status?.mode || selfUpdate.mode || "?"}
                            </div>
                            <div>
                                <span className="opacity-60">state:</span>{" "}
                                {status?.state || phase}
                            </div>
                            <div>
                                <span className="opacity-60">step:</span> {step} /{" "}
                                {totalSteps}
                            </div>
                            <div>
                                <span className="opacity-60">from:</span>{" "}
                                {status?.fromVersion || "?"}{" "}
                                <span className="opacity-60">→ to:</span>{" "}
                                {status?.toVersion || "?"}
                            </div>
                            {status?.message && (
                                <div>
                                    <span className="opacity-60">message:</span>{" "}
                                    {status.message}
                                </div>
                            )}
                            {status?.startedAt && (
                                <div>
                                    <span className="opacity-60">startedAt:</span>{" "}
                                    {status.startedAt}
                                </div>
                            )}
                            {status?.endedAt && (
                                <div>
                                    <span className="opacity-60">endedAt:</span>{" "}
                                    {status.endedAt}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                    {success && (
                        <button
                            type="button"
                            onClick={onReload}
                            className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
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
