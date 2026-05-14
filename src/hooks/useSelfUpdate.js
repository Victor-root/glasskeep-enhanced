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

const TERMINAL_STATES = new Set([
    "success",
    "error",
    "rolled_back",
    "cancelled",
]);

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
    // Set when polls start timing out but the server is most likely
    // just busy (slow CPU during install/build). Lets the modal show a
    // "this is slow, hang on" hint instead of the misleading
    // "the application is restarting" message.
    const [slowResponse, setSlowResponse] = useState(false);
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
                    // The "success" modal must only resurface for an
                    // update that this app actually went through —
                    // i.e. the server's running version equals what
                    // the recorded update targeted. We compare on the
                    // SERVER-reported runningVersion (fresh from
                    // package.json), NOT the bundle's __APP_VERSION__
                    // which is frozen at build time and therefore
                    // stale until the user reloads the page.
                    // If the operator upgraded out-of-band (CLI /
                    // docker compose pull) the running version will
                    // be newer than the recorded toVersion and we
                    // suppress the modal.
                    const runningVersion = r.status?.runningVersion
                        ? String(r.status.runningVersion).replace(/^v/i, "")
                        : null;
                    const targetVersion = r.status?.toVersion
                        ? String(r.status.toVersion).replace(/^v/i, "")
                        : null;
                    // When the server doesn't expose runningVersion
                    // (older deploys missing the field), fall back to
                    // showing the modal — better a slightly stale
                    // popup than a silently-hidden success.
                    const successFromInAppUpdate =
                        r.status.state === "success" &&
                        (!runningVersion ||
                            !targetVersion ||
                            runningVersion === targetVersion);
                    // Resolve the phase explicitly on every mount so a
                    // stale React state from before a logout / refresh
                    // can't survive into the new session. We trust the
                    // server's inProgress flag — it combines "the
                    // state name is active" AND "the status file was
                    // touched recently". A non-terminal state with a
                    // stale mtime (e.g. the script crashed during a
                    // build) falls through to idle so the modal does
                    // not stay stuck forever.
                    if (r.status.inProgress) {
                        setPhase("running");
                    } else if (alreadyAcknowledged) {
                        setPhase("idle");
                    } else if (r.status.state === "success") {
                        setPhase(successFromInAppUpdate ? "success" : "idle");
                    } else if (r.status.state === "error") {
                        setPhase("error");
                    } else if (r.status.state === "rolled_back") {
                        setPhase("rolled_back");
                    } else if (r.status.state === "cancelled") {
                        setPhase("cancelled");
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
            setSlowResponse(false);

            // States that genuinely take the API server offline (the
            // restart itself). When polls fail while the last known
            // state is one of these, we're really waiting for the
            // server to come back. For any other active state
            // (fetching / installing / building) a failed poll just
            // means the CPU is busy crunching and the server is
            // responding too slowly — we keep the modal as-is and
            // hint at the slowness instead of crying "restarting".
            const SERVER_DOWN_STATES = new Set([
                "starting_service",
                "stopping_service",
                "renaming",
                "creating",
            ]);

            let consecutiveTransient = 0;
            let lastKnownState = null;
            // Cap the loop so a stuck status file does not poll forever.
            const startTs = Date.now();
            const MAX_MS = 10 * 60 * 1000;

            try {
                while (!stoppedRef.current && Date.now() - startTs < MAX_MS) {
                    const r = await rawFetchStatus(token, 4000);
                    if (r.ok) {
                        consecutiveTransient = 0;
                        if (r.status) {
                            lastKnownState = r.status.state;
                            setStatus(r.status);
                            // A successful poll clears the slow flag —
                            // the server caught up, the user can see
                            // real progress again.
                            setSlowResponse(false);
                            if (isTerminalState(r.status)) {
                                if (r.status.state === "success") setPhase("success");
                                else if (r.status.state === "error") setPhase("error");
                                else if (r.status.state === "rolled_back")
                                    setPhase("rolled_back");
                                else if (r.status.state === "cancelled")
                                    setPhase("cancelled");
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
                            const serverGoingDown =
                                !lastKnownState ||
                                SERVER_DOWN_STATES.has(lastKnownState);
                            if (serverGoingDown) {
                                setPhase((p) =>
                                    p === "running" || p === "starting"
                                        ? "waiting_for_server"
                                        : p
                                );
                            } else {
                                // Server is up but busy — surface the
                                // hint instead of flipping to "waiting".
                                setSlowResponse(true);
                            }
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

    const dismiss = useCallback(async () => {
        // Wait for the server-side acknowledgement to land BEFORE
        // closing the modal locally. Without the await the fetch
        // was fire-and-forget — a user who refreshed within the
        // ~100 ms it took to land got the modal back because the
        // status file did not yet have acknowledgedAt stamped on it.
        // postAcknowledge already swallows its own errors, so the
        // promise always resolves and the modal always closes.
        if (status?.endedAt) {
            await postAcknowledge(token, status.endedAt);
        }
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
        slowResponse,
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
