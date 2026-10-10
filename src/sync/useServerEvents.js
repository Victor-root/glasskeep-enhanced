import { useEffect, useRef } from "react";
import { api, getAuth } from "../utils/api.js";
import { netLog } from "../utils/netDebug.js";

/**
 * The live connection to the server (SSE on /api/events) and the
 * recovery around it: exponential reconnect backoff, a reload of the
 * current view after a reconnection or once the server comes back from
 * offline (after the local queue has drained), a 60 s polling fallback
 * while the stream is dead, and the visibility / online / offline hooks
 * that kick the sync engine.
 *
 * Note changes announced by the server are batched (300 ms) and handed to
 * `patchNotes(ids)`; every other message goes to `onMessage(msg, tools)`.
 * Both are taken from the render that opened the connection, i.e. when
 * the token changes.
 */
export default function useServerEvents({
  token,
  syncStatus,
  syncEngineRef,
  reloadCurrentViewRef,
  triggerSync,
  patchNotes,
  onMessage,
}) {
  // Revives a dead stream when the sync engine sees the server recover.
  const reconnectSseRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    let es;
    let reconnectTimeout;
    let reconnectAttempts = 0;
    let hasConnectedOnce = false; // track first vs reconnection
    const maxReconnectDelay = 30000; // cap backoff at 30s, never give up
    let reloadCooldownUntil = 0; // suppress patches during full reload

    // ─── Debounced batch patch: collect noteIds, reload once ───
    let patchBatchTimeout = null;
    const patchBatchIds = new Set();
    let cooldownDeferredIds = new Set(); // events received during reload cooldown

    const flushPatchBatch = async () => {
      patchBatchTimeout = null;
      const ids = [...patchBatchIds];
      patchBatchIds.clear();
      await patchNotes(ids);
    };

    const debouncedPatch = (noteId) => {
      // During reload cooldown, buffer instead of dropping — the full reload
      // may have started BEFORE these notes existed on the server (e.g. another
      // device synced while the reload was in flight).
      if (Date.now() < reloadCooldownUntil) {
        cooldownDeferredIds.add(String(noteId));
        return;
      }
      patchBatchIds.add(String(noteId));
      if (patchBatchTimeout) clearTimeout(patchBatchTimeout);
      patchBatchTimeout = setTimeout(flushPatchBatch, 300);
    };

    // ─── Targeted single-note patch (local-first safe) ───

    const connectSSE = () => {
      netLog("sse: connecting, attempt " + reconnectAttempts);
      try {
        const url = new URL(`${window.location.origin}/api/events`);
        url.searchParams.set("token", token);
        url.searchParams.set("_t", Date.now());
        es = new EventSource(url.toString());

        es.onopen = () => {
          console.log("SSE connected");
          netLog("sse: open");
          // SSE onopen through a reverse proxy does NOT prove the backend is
          // alive — the proxy accepts the TCP connection even when the backend
          // is down. Only a real SSE data message (onmessage) is proof.
          // Trigger a health check instead to verify properly.
          if (syncEngineRef.current && !syncEngineRef.current.isRateLimited) {
            syncEngineRef.current.healthCheck();
          }
          // On reconnection (not first connect), reload the view — but only
          // AFTER the sync queue has finished processing. If we reload while
          // processQueue is running, the server may return stale data (patches
          // not yet applied) and overwrite correct local state.
          if (hasConnectedOnce) {
            console.log("[SSE] reconnected — will reload after queue drains");
            const waitForQueue = async () => {
              const engine = syncEngineRef.current;
              if (engine && engine._processing) {
                // Queue still running — check again in 500ms
                setTimeout(waitForQueue, 500);
                return;
              }
              // Skip reload if:
              // 1. Server not confirmed reachable — loadNotes() would skip the
              //    server fetch and we'd go green with stale IDB data.
              // 2. A pull is already in progress (recovery useEffect owns it) —
              //    avoid duplicate reloads racing each other.
              // In both cases, the recovery useEffect handles the reload.
              if (engine && (engine.serverReachable !== true || engine.isPulling)) {
                console.log("[SSE] queue idle but %s — skipping reload (recovery useEffect will handle it)",
                  engine.isPulling ? "pull already in progress" : "server not confirmed reachable");
                return;
              }
              console.log("[SSE] queue idle — reloading current view");
              cooldownDeferredIds = new Set(); // clear before cooldown starts
              reloadCooldownUntil = Date.now() + 3000;
              // Use beginPull/endPull so status stays "syncing" until reload completes
              if (engine) await engine.beginPull();
              try {
                await reloadCurrentViewRef.current?.();
              } finally {
                if (engine) await engine.endPull();
              }
              // After cooldown expires, flush any SSE events that arrived during the
              // reload window (e.g. another device synced while reload was in flight).
              setTimeout(() => {
                if (cooldownDeferredIds.size > 0) {
                  console.log("[SSE] flushing", cooldownDeferredIds.size, "deferred events");
                  for (const nid of cooldownDeferredIds) patchBatchIds.add(nid);
                  cooldownDeferredIds = new Set();
                  if (patchBatchTimeout) clearTimeout(patchBatchTimeout);
                  patchBatchTimeout = setTimeout(flushPatchBatch, 300);
                }
              }, 3100);
            };
            // Small initial delay to let processQueue start if it hasn't yet
            setTimeout(waitForQueue, 300);
          }
          hasConnectedOnce = true;
          reconnectAttempts = 0;
        };

        // The backend emits NAMED SSE events as proof-of-life: `hello` right
        // after connect and `ping` every 25s (server/index.js). Named events do
        // NOT trigger es.onmessage (that only fires for unnamed "message"
        // events), so we listen for them explicitly. Each is written by the
        // Node backend itself — a reverse proxy can't fabricate one — so
        // receiving it proves the backend, not just the proxy, is reachable.
        // This is what breaks the "stuck offline after resuming from
        // background" deadlock: on resume the /health fetch can keep timing out
        // (AbortError) while SSE reconnects fine, leaving serverReachable=false
        // and the recovery reload gated forever until a manual refresh. The
        // hello on reconnect (and the 25s ping as a safety net) now confirms
        // reachability and triggers recovery. notifyServerReachable() is a
        // no-op once we're already online, so the heartbeat is essentially free.
        const onBackendAlive = () => {
          syncEngineRef.current?.notifyServerReachable();
        };
        es.addEventListener("hello", onBackendAlive);
        es.addEventListener("ping", onBackendAlive);

        // SSE message handler (server sends generic data: messages)
        es.onmessage = (e) => {
          try {
            // A real SSE data message = proof the GlassKeep backend is alive.
            // This is the ONLY place we call notifyServerReachable from SSE
            // (onopen doesn't count — the proxy can accept connections even
            // when the backend is down).
            if (syncEngineRef.current) {
              syncEngineRef.current.notifyServerReachable();
            }
            onMessage(JSON.parse(e.data || "{}"), { queueNotePatch: debouncedPatch });
          } catch { /* malformed or unhandled event: skip it */ }
        };

        es.onerror = (error) => {
          console.log("SSE error, attempting reconnect...", error);
          netLog("sse: error, readyState=" + es.readyState, "onLine=" + navigator.onLine);
          const engine = syncEngineRef.current;
          if (engine) {
            engine.notifySseDisconnected();
            // SSE died — trigger a health check to detect server outage fast.
            // healthCheck() has built-in throttling (3s min gap) so rapid SSE
            // errors won't flood the server.
            if (!engine.isRateLimited) {
              engine.healthCheck();
            }
          }

          if (es.readyState === EventSource.CLOSED) {
            const currentAuth = getAuth();
            if (!currentAuth || !currentAuth.token) {
              return;
            }
          }

          es.close();

          // Backoff: exponential with cap. When rate-limited (403/429),
          // use a much longer minimum delay to let the proxy cool down.
          const isRL = engine?.isRateLimited;
          const minDelay = isRL ? 10000 : 1000;
          const delay = Math.max(minDelay, Math.min(1000 * Math.pow(2, reconnectAttempts), maxReconnectDelay));
          netLog("sse: reconnecting in " + delay + "ms");
          reconnectTimeout = setTimeout(() => {
            reconnectAttempts++;
            const currentAuth = getAuth();
            if (!currentAuth || !currentAuth.token) return;
            connectSSE();
          }, delay);
        };
      } catch (error) {
        console.error("Failed to create EventSource:", error);
      }
    };

    netLog("boot: " + navigator.userAgent, "onLine=" + navigator.onLine,
      "swController=" + !!navigator.serviceWorker?.controller);
    connectSSE();

    // Expose reconnect for use when sync engine detects server recovery
    reconnectSseRef.current = () => {
      if (!es || es.readyState === EventSource.CLOSED) {
        // Cancel any pending backoff timer to avoid duplicate connections
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectAttempts = 0; // reset backoff on explicit reconnect
        connectSSE();
      }
    };

    // Fallback polling: only when SSE is dead, and only every 60s
    let pollInterval;
    const startPolling = () => {
      pollInterval = setInterval(() => {
        if (!es || es.readyState === EventSource.CLOSED) {
          // SSE is dead — do a full reload as last resort
          reloadCurrentViewRef.current?.();
        }
        // When SSE is connected, polling does nothing
      }, 60000);
    };

    const pollTimeout = setTimeout(startPolling, 15000);

    // Visibility change: reconnect SSE if dead, kick sync engine recovery.
    // CRITICAL: use the engine's healthCheck() — NOT a separate api("/health") —
    // so that _serverReachable gets updated. Without this, processQueue()
    // early-exits when _serverReachable===false (stuck "offline" on mobile
    // after the health-check timer chain breaks during tab suspension).
    const handleVisibilityChange = async () => {
      netLog("page " + document.visibilityState, "sse readyState=" + es?.readyState);
      if (document.visibilityState !== "visible") return;

      const engine = syncEngineRef.current;

      // Run engine health check — this updates _serverReachable and
      // auto-triggers processQueue on recovery. Also restarts the
      // health timer chain if it was broken by tab suspension.
      if (engine) {
        // Background AbortErrors accumulated in _consecutiveTimeouts under the
        // hidden-tab tolerance (limit=3). If we don't reset here, the first
        // post-resume check uses the visible-tab limit (1), immediately exceeds
        // it, and marks the server offline even though it's reachable.
        engine.notifyVisible();

        // force=true on every attempt: the retry gap (1.5s) is shorter than
        // the 3s throttle in healthCheck(), so unforced retries silently
        // return the cached "offline" value and waste a slot in the loop.
        let ok = await engine.healthCheck(true);
        // On mobile after long background, the first fetch often fails because
        // Chrome reuses stale TCP sockets from before suspension. Retry with
        // increasing delays to give the browser time to recycle the socket pool.
        for (let i = 0; i < 3 && !ok; i++) {
          await new Promise((r) => setTimeout(r, 1500 + i * 1500));
          ok = await engine.healthCheck(true);
        }
        // Restart the health timer chain unconditionally — mobile browsers
        // may have GC'd the previous setTimeout during background suspension.
        engine.restartHealthTimer();

        // Reconnect SSE if dead and server is reachable
        if (ok && es && es.readyState === EventSource.CLOSED) {
          connectSSE();
        }
      } else if (es && es.readyState === EventSource.CLOSED) {
        // No engine but SSE dead — try to reconnect SSE anyway
        try {
          await api("/health", { token });
          connectSSE();
        } catch (error) {
          if (error.status === 401) return;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Handle online/offline events
    const handleOnline = async () => {
      netLog("browser online event");
      // Browser detected network recovery — run health check first,
      // then process queue and reconnect SSE only after confirming
      // the server is reachable. Avoids racing SSE reconnect against
      // the health check that sets _serverReachable = true.
      const engine = syncEngineRef.current;
      if (engine) {
        // force=true: same reason as in visibilitychange — the 1.5s retry
        // gap would otherwise trip the 3s throttle inside healthCheck().
        let ok = await engine.healthCheck(true);
        // On mobile, stale TCP sockets survive the offline→online transition.
        // Retry with increasing delays so the browser can recycle them.
        for (let i = 0; i < 3 && !ok; i++) {
          await new Promise((r) => setTimeout(r, 1500 + i * 1500));
          ok = await engine.healthCheck(true);
        }
        engine.restartHealthTimer();
        if (ok) {
          triggerSync();
          // Reconnect SSE after confirmed server reachability
          if (es && es.readyState === EventSource.CLOSED) {
            reconnectAttempts = 0;
            connectSSE();
          }
        }
      } else if (es && es.readyState === EventSource.CLOSED) {
        reconnectAttempts = 0;
        connectSSE();
      }
    };

    const handleOffline = () => {
      netLog("browser offline event");
      // Immediately tell the sync engine — don't wait for the next health check.
      // The browser "offline" event is instant proof the network is down.
      const engine = syncEngineRef.current;
      if (engine) {
        engine.notifySseDisconnected();
        engine.notifyOffline();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      try { if (es) es.close(); } catch { /* close is best-effort */ }
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (patchBatchTimeout) clearTimeout(patchBatchTimeout);
      if (pollTimeout) clearTimeout(pollTimeout);
      if (pollInterval) clearInterval(pollInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the SSE connection must only be rebuilt when the token changes
  }, [token]);

  // Reconnect SSE and reload view when server recovers from offline
  const prevSyncStateRef = useRef(syncStatus.syncState);
  useEffect(() => {
    const prev = prevSyncStateRef.current;
    prevSyncStateRef.current = syncStatus.syncState;
    if (prev === "offline" && syncStatus.syncState !== "offline" && syncStatus.syncState !== "checking") {
      // Server just recovered — reconnect SSE immediately
      reconnectSseRef.current?.();
      // Reload the view to pick up changes from other devices, but WAIT for
      // the local queue to drain first. Otherwise we fetch stale server data
      // that overwrites local offline edits that haven't been pushed yet.
      // Use beginPull()/endPull() so the status stays "syncing" (not green)
      // until the view has been fully refreshed.
      //
      // After the initial reload, wait a settling period (3s) then reload
      // again. This gives OTHER devices time to push their pending changes
      // (e.g. PC reordered notes while offline — it needs a few seconds to
      // push the reorder after it also detects recovery).
      const waitThenReload = async () => {
        const engine = syncEngineRef.current;
        if (engine && engine._processing) {
          setTimeout(waitThenReload, 500);
          return;
        }
        // Signal that we're now pulling remote changes — keeps status "syncing"
        if (engine) await engine.beginPull();
        try {
          // First reload: get whatever the server has right now
          let ok = await reloadCurrentViewRef.current?.();
          if (!ok) {
            // Server fetch failed — retry a few times
            for (let i = 1; i <= 4 && !ok; i++) {
              await new Promise((r) => setTimeout(r, 2000 * i));
              ok = await reloadCurrentViewRef.current?.();
            }
          }
          if (ok) {
            // Settling period: other devices may still be pushing changes.
            // Wait 3s then reload once more to catch late arrivals.
            await new Promise((r) => setTimeout(r, 3000));
            await reloadCurrentViewRef.current?.();
          }
        } catch { /* reload is best-effort: the pull still ends below */ }
        if (engine) await engine.endPull();
      };
      // Small delay to let processQueue start (healthCheck triggers it)
      setTimeout(waitThenReload, 500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the engine and reload refs are read when the state flips
  }, [syncStatus.syncState]);
}
