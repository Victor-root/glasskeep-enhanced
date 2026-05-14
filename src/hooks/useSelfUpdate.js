import { useCallback, useEffect, useRef, useState } from "react";
import { api, API_BASE } from "../utils/api.js";

// =============================================================================
//  useSelfUpdate
//
//  State machine for the one-click "Update now" flow.
//
//  Lifecycle:
//    idle                → no update running
//    starting            → POST /start sent, waiting for first status
//    running             → status file says we are mid-update
//    waiting_for_server  → fetch failing (the server is restarting)
//    success | error | rolled_back → terminal
//
//  The status endpoint is polled every 1500ms while active. While the
//  server is down (because the service is restarting), the hook keeps
//  polling with a short timeout — when the server comes back, polling
//  resumes naturally.
// =============================================================================

const ACTIVE_STATES = new Set([
    "queued",
    "preparing",
    "stopping_service",
    "fetching",
    "renaming",
    "creating",
    "installing",
    "building",
    "starting_service",
    "rolling_back",
]);

const TERMINAL_STATES = new Set(["success", "error", "rolled_back"]);

// Acknowledgement lives server-side (status.acknowledgedAt) so the
// modal does not re-pop in private browsing, after a hard refresh,
// on another device, or after a sign-out + sign-in. The client just
// calls this when the admin clicks Reload / Close, then trusts the
// next status fetch to reflect it.
async function postAcknowledge(token, endedAt) {
    if (!endedAt) return;
    try {
        await api("/admin/self-update/acknowledge", {
            method: "POST",
            body: { endedAt },
            token,
            timeoutMs: 4000,
        });
    } catch {
        /* best-effort — the user can still reload manually */
    }
}

function isActiveState(s) {
    return !!s && ACTIVE_STATES.has(s.state);
}

function isTerminalState(s) {
    return !!s && TERMINAL_STATES.has(s.state);
}

async function rawFetchStatus(token, timeoutMs = 4000) {
    // We don't use the shared `api()` helper here because we want to
    // distinguish "server unreachable" (during restart) from "server
    // returned 204 / 401 / etc." without throwing a generic error.
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${API_BASE}/admin/self-update/status`, {
            method: "GET",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
        });
        clearTimeout(t);
        if (res.status === 204) return { ok: true, status: null };
        if (res.status >= 200 && res.status < 300) {
            const data = await res.json().catch(() => null);
            return { ok: true, status: data };
        }
        return { ok: false, transient: false, code: res.status };
    } catch (e) {
        clearTimeout(t);
        // Network error, abort, etc. — treat as transient (server is
        // likely restarting). The caller will keep polling.
        return { ok: false, transient: true, code: 0, error: e };
    }
}

export function useSelfUpdate({ token, isAdmin }) {
    const [mode, setMode] = useState(null);
    const [oneClickAvailable, setOneClickAvailable] = useState(false);
    const [modeReason, setModeReason] = useState(null);
    const [status, setStatus] = useState(null);
    const [phase, setPhase] = useState("idle"); // idle|starting|running|waiting_for_server|success|error|rolled_back
    const [startError, setStartError] = useState(null);
    const pollingRef = useRef(false);
    const stoppedRef = useRef(false);

    // Initial mode check + recovery if an update was already in flight
    // when the admin opened the panel (e.g. they refreshed the page).
    useEffect(() => {
        if (!token || !isAdmin) return;
        let cancelled = false;
        (async () => {
            try {
                const m = await api("/admin/self-update/mode", { token, timeoutMs: 4000 });
                if (cancelled) return;
                setMode(m?.mode || null);
                setOneClickAvailable(!!m?.oneClickAvailable);
                setModeReason(m?.reason || null);
            } catch {
                /* fail silently — the button just won't appear */
            }
            try {
                const r = await rawFetchStatus(token, 4000);
                if (cancelled) return;
                if (r.ok && r.status) {
                    setStatus(r.status);
                    const isTerminal = TERMINAL_STATES.has(r.status.state);
                    const alreadyAcknowledged =
                        isTerminal && !!r.status.acknowledgedAt;
                    // Resolve the phase explicitly on every mount so a
                    // stale React state from before a logout / refresh
                    // can't survive into the new session.
                    if (r.status.inProgress || isActiveState(r.status)) {
                        setPhase("running");
                    } else if (alreadyAcknowledged) {
                        setPhase("idle");
                    } else if (r.status.state === "success") {
                        setPhase("success");
                    } else if (r.status.state === "error") {
                        setPhase("error");
                    } else if (r.status.state === "rolled_back") {
                        setPhase("rolled_back");
                    } else {
                        setPhase("idle");
                    }
                } else {
                    // No status file at all → make sure we are idle.
                    setPhase("idle");
                }
            } catch {
                /* ignored */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token, isAdmin]);

    const pollLoop = useCallback(
        async function pollLoop() {
            if (pollingRef.current) return;
            pollingRef.current = true;
            stoppedRef.current = false;

            // Track consecutive transient errors so we can flip the UI
            // into "waiting_for_server" without flickering on every
            // network blip.
            let consecutiveTransient = 0;
            // Cap the loop so a stuck status file does not poll forever.
            const startTs = Date.now();
            const MAX_MS = 10 * 60 * 1000;

            try {
                while (!stoppedRef.current && Date.now() - startTs < MAX_MS) {
                    const r = await rawFetchStatus(token, 4000);
                    if (r.ok) {
                        consecutiveTransient = 0;
                        if (r.status) {
                            setStatus(r.status);
                            if (isTerminalState(r.status)) {
                                if (r.status.state === "success") setPhase("success");
                                else if (r.status.state === "error") setPhase("error");
                                else if (r.status.state === "rolled_back")
                                    setPhase("rolled_back");
                                break;
                            }
                            if (isActiveState(r.status)) {
                                setPhase((p) =>
                                    p === "waiting_for_server" || p === "starting"
                                        ? "running"
                                        : p === "running"
                                          ? "running"
                                          : "running"
                                );
                            }
                        }
                    } else if (r.transient) {
                        consecutiveTransient += 1;
                        if (consecutiveTransient >= 2) {
                            setPhase((p) =>
                                p === "running" || p === "starting"
                                    ? "waiting_for_server"
                                    : p
                            );
                        }
                    } else {
                        // Non-transient HTTP error (401, 500 etc.) — stop polling.
                        break;
                    }
                    // Poll quickly while the update is in flight: the
                    // Docker swap can blow through three or four steps
                    // in a fraction of a second when the registry is
                    // local, and a slow poll would miss them entirely.
                    await sleep(500);
                }
            } finally {
                pollingRef.current = false;
            }
        },
        [token]
    );

    // Kick off polling whenever we transition into an active phase.
    useEffect(() => {
        if (!token || !isAdmin) return;
        const active =
            phase === "starting" ||
            phase === "running" ||
            phase === "waiting_for_server";
        if (active && !pollingRef.current) {
            pollLoop();
        }
        return () => {
            // We do NOT stop polling on unmount — the modal needs to
            // keep tracking the update even if the admin closes / opens
            // panels. Polling stops naturally on terminal state.
        };
    }, [phase, token, isAdmin, pollLoop]);

    const startUpdate = useCallback(
        async ({ latestVersion }) => {
            setStartError(null);
            if (!latestVersion) {
                setStartError("missing latestVersion");
                return;
            }
            setPhase("starting");
            setStatus({
                state: "queued",
                step: 0,
                totalSteps: 5,
                message: "",
                mode,
                fromVersion: null,
                toVersion: latestVersion,
            });
            try {
                await api("/admin/self-update/start", {
                    method: "POST",
                    body: { latestVersion },
                    token,
                    timeoutMs: 10000,
                });
            } catch (e) {
                setStartError(e?.message || "failed to start update");
                setPhase("error");
                return;
            }
            // Polling starts via the effect above.
        },
        [mode, token]
    );

    const acknowledge = useCallback(async () => {
        // Record server-side that the current terminal outcome has
        // been seen, so a subsequent reload / login does not re-open
        // the modal. Awaited so callers can sequence a reload safely.
        if (status?.endedAt) await postAcknowledge(token, status.endedAt);
    }, [status, token]);

    const dismiss = useCallback(() => {
        // Used after a terminal state to close the overlay locally and
        // mark the server-side status as seen.
        if (status?.endedAt) postAcknowledge(token, status.endedAt);
        stoppedRef.current = true;
        setPhase("idle");
        setStartError(null);
    }, [status, token]);

    return {
        mode,
        oneClickAvailable,
        modeReason,
        status,
        phase,
        startError,
        startUpdate,
        dismiss,
        acknowledge,
        isActive:
            phase === "starting" ||
            phase === "running" ||
            phase === "waiting_for_server",
        isFinished:
            phase === "success" ||
            phase === "error" ||
            phase === "rolled_back",
    };
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
