// src/sync/syncEngine.js
// Background sync processor: dequeues actions, calls API, handles retries

import {
  getPendingQueue,
  updateQueueItem,
  removeQueueItem,
  collapseQueue,
  getQueueStats,
  purgeQueueForNote,
} from "./localDb.js";

const API_BASE = "/api";
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 2000; // 2s, 4s, 8s, 16s, 32s
const QUEUE_ITEM_DELAY = 200;  // ms between queue items to avoid rate limiting

// Health check intervals (self-hosted LAN — lightweight ping, can be aggressive)
const HEALTH_IDLE_INTERVAL = 10000;      // 10s when everything is OK
const HEALTH_PENDING_INTERVAL = 5000;    // 5s when there are pending changes
const HEALTH_OFFLINE_INTERVAL = 3000;    // 3s when server is known to be down

/**
 * SyncEngine manages background synchronization.
 * It processes queue items sequentially, retries on failure,
 * and reports status changes via callbacks.
 *
 * Status model emitted via onStatusChange:
 *   serverReachable: boolean  — last health check result
 *   hasPendingChanges: boolean
 *   isSyncing: boolean
 *   lastSyncAt: number|null   — timestamp of last successful sync action
 *   lastSyncError: string|null
 *   syncState: "synced"|"pending"|"syncing"|"offline"|"error"
 *   pending/processing/failed/total/items: queue stats
 */
export class SyncEngine {
  constructor({ getToken, userId, sessionId, onStatusChange, onSyncComplete, onSyncError, onNoteInaccessible }) {
    this.getToken = getToken;
    this._userId = userId;
    this._sessionId = sessionId;
    this.onStatusChange = onStatusChange || (() => {});
    this.onSyncComplete = onSyncComplete || (() => {});
    this.onSyncError = onSyncError || (() => {});
    this.onNoteInaccessible = onNoteInaccessible || (() => {});
    this._processing = false;
    this._isChecking = false; // true while forceSync health-checks (immediate UI feedback)
    this._healthTimer = null;
    this._destroyed = false;

    // Internal state
    this._serverReachable = null; // null = unknown, true/false = tested
    this._lastSyncAt = null;
    this._lastSyncError = null;
    this._failedChecks = 0; // consecutive failed health checks (reset on success)
    this._consecutiveTimeouts = 0; // consecutive AbortErrors (reset on success or hard failure)
    this._healthCheckInFlight = false; // guard against concurrent health checks
    this._sseConnected = false; // true while SSE EventSource is open
  }

  // ─── Public API ───

  /**
   * Signal that the server is reachable (e.g. SSE connected).
   * Bypasses healthCheck — useful when fetch-based checks fail due to
   * SW cache issues but SSE (EventSource) connects fine.
   */
  notifySseDisconnected() {
    this._sseConnected = false;
  }

  /**
   * Browser fired the "offline" event — mark server unreachable immediately
   * without waiting for the next health check cycle.
   */
  async notifyOffline() {
    if (this._destroyed) return;
    this._serverReachable = false;
    this._lastSyncError = "Browser offline";
    this._failedChecks++;
    this._adjustHealthInterval();
    await this._emitStatus();
  }

  async notifyServerReachable() {
    if (this._destroyed) return;
    this._sseConnected = true;
    if (this._serverReachable === true && this._failedChecks === 0) return; // already known
    this._serverReachable = true;
    this._lastSyncError = null;
    this._failedChecks = 0;
    this._consecutiveTimeouts = 0;
    this._adjustHealthInterval();
    await this._emitStatus();
    this.processQueue();
  }

  /**
   * Trigger sync processing. Safe to call repeatedly.
   */
  async processQueue() {
    if (this._destroyed) return;
    if (this._processing) {
      await this._emitStatus(); // refresh queue count even while busy
      return;
    }

    // Never attempt network calls if server is known to be down.
    // The health check will reset _serverReachable and call processQueue on recovery.
    // Still emit status so the UI reflects the new queue count.
    if (this._serverReachable === false) {
      await this._emitStatus();
      return;
    }

    this._processing = true;

    try {
      await collapseQueue(this._userId);

      const items = await getPendingQueue(this._userId);
      if (items.length === 0) {
        this._processing = false;
        await this._emitStatus();
        return;
      }

      await this._emitStatus();

      for (const item of items) {
        if (this._destroyed) break;

        // Skip if too many retries
        if (item.attempts >= MAX_RETRIES) {
          await updateQueueItem(item.queueId, {
            status: "failed",
            lastError: item.lastError || "Max retries exceeded",
          });
          continue;
        }

        // Check retry delay (applies to both "retry" and "failed" statuses)
        if ((item.status === "retry" || item.status === "failed") && item.lastAttemptAt) {
          const delay = BASE_RETRY_DELAY * Math.pow(2, Math.min(item.attempts, 4));
          if (Date.now() - item.lastAttemptAt < delay) {
            continue;
          }
        }

        await updateQueueItem(item.queueId, { status: "processing" });
        await this._emitStatus();

        try {
          const result = await this._executeAction(item);
          await removeQueueItem(item.queueId);
          this._serverReachable = true;
          this._lastSyncAt = Date.now();
          this._lastSyncError = null;
          try { await this.onSyncComplete(item, result); } catch (e) {
            console.error("[SyncEngine] onSyncComplete error:", e);
          }
          // Small delay between items to avoid triggering reverse proxy rate limits
          await new Promise((r) => setTimeout(r, QUEUE_ITEM_DELAY));
        } catch (err) {
          const isAuthError = err.status === 401;
          const isForbidden = err.status === 403;
          const isConflict = err.status === 409;
          const isNotFound = err.status === 404;
          const isRateLimited = err.status === 429;
          const isTimeout = !!err.isTimeout;
          const isMissingTimestamp = err.status === 400 && /client_(updated|reordered)_at is required/i.test(err.message);
          const isNetworkError = !isTimeout && !isRateLimited && !isForbidden && (err.isNetworkError || err.status === 0 || !err.status);

          if (isMissingTimestamp) {
            // Legacy queue item without required LWW timestamp — permanently invalid.
            // Drop immediately: retrying will never help.
            console.warn(`[SyncEngine] ${item.type} 400: missing LWW timestamp, dropping queue item (noteId=${item.noteId})`);
            this._serverReachable = true;
            await removeQueueItem(item.queueId);
            try { await this.onSyncComplete(item, { dropped: true }); } catch (e) {
              console.error("[SyncEngine] onSyncComplete (dropped) error:", e);
            }
            continue;
          } else if (isAuthError) {
            await updateQueueItem(item.queueId, {
              status: "failed",
              lastError: "Authentication expired",
              attempts: MAX_RETRIES,
            });
          } else if (isConflict && item.type === "create") {
            await removeQueueItem(item.queueId);
            this._serverReachable = true;
            this._lastSyncAt = Date.now();
            try { await this.onSyncComplete(item); } catch (e) {
              console.error("[SyncEngine] onSyncComplete error:", e);
            }
            continue;
          } else if (isNotFound && item.noteId) {
            // Note gone on server — terminal for any note mutation, no retry.
            console.warn(`[SyncEngine] ${item.type} 404: note ${item.noteId}, dropping queue item`);
            this._serverReachable = true;
            await removeQueueItem(item.queueId);
            // Notify so reorder leases (and other resources) are released
            try { await this.onSyncComplete(item, { dropped: true }); } catch (e) {
              console.error("[SyncEngine] onSyncComplete (dropped) error:", e);
            }
            continue;
          } else if (isForbidden && item.noteId) {
            this._serverReachable = true;
            if (item.noteId === "__reorder__") {
              // Meta-item (reorder) — no real note to purge. Just drop and release leases.
              console.warn(`[SyncEngine] reorder 403, dropping queue item`);
              await removeQueueItem(item.queueId);
              try { await this.onSyncComplete(item, { dropped: true }); } catch (e) {
                console.error("[SyncEngine] onSyncComplete (dropped) error:", e);
              }
            } else {
              // 403 on a note mutation — access revoked or note no longer ours.
              // Purge this queue item AND all remaining items for the same note,
              // then notify the UI so it can remove the zombie note locally.
              // This handles the case where note_access_revoked SSE was missed
              // (e.g. client was offline when access was revoked).
              console.warn(`[SyncEngine] ${item.type} 403: note ${item.noteId}, purging locally`);
              await purgeQueueForNote(item.noteId, this._userId);
              try { await this.onNoteInaccessible(item.noteId); } catch (e) {
                console.error("[SyncEngine] onNoteInaccessible error:", e);
              }
            }
            continue;
          } else if (isRateLimited) {
            // Rate limited (HTTP 429). Server IS reachable, just throttling.
            this._serverReachable = true;
            this._lastSyncError = `Rate limited (HTTP ${err.status})`;
            const nextAttempts = item.attempts + 1;
            await updateQueueItem(item.queueId, {
              status: nextAttempts >= MAX_RETRIES ? "failed" : "retry",
              lastError: `Rate limited (HTTP ${err.status})`,
              attempts: nextAttempts,
              lastAttemptAt: Date.now(),
            });
            // Back off longer for rate limits — wait 3s before next item
            await new Promise((r) => setTimeout(r, 3000));
          } else if (isTimeout) {
            // Timeout: server may be busy (e.g. concurrent device sync).
            // DON'T mark server as unreachable — just retry later.
            this._lastSyncError = "Request timeout";
            const nextAttempts = item.attempts + 1;
            await updateQueueItem(item.queueId, {
              status: nextAttempts >= MAX_RETRIES ? "failed" : "retry",
              lastError: "Request timeout",
              attempts: nextAttempts,
              lastAttemptAt: Date.now(),
            });
          } else if (isNetworkError) {
            // Genuine network failure (connection refused, DNS, etc.)
            this._serverReachable = false;
            this._lastSyncError = "Server unreachable";
            this._failedChecks++;
            const nextAttempts = item.attempts + 1;
            await updateQueueItem(item.queueId, {
              status: nextAttempts >= MAX_RETRIES ? "failed" : "retry",
              lastError: "Server unreachable",
              attempts: nextAttempts,
              lastAttemptAt: Date.now(),
            });
            // Stop processing — server is down
            this._adjustHealthInterval();
            break;
          } else {
            this._serverReachable = true;
            this._lastSyncError = `${err.message || "Unknown error"} (HTTP ${err.status || "?"})`;
            const nextAttempts = item.attempts + 1;
            await updateQueueItem(item.queueId, {
              status: nextAttempts >= MAX_RETRIES ? "failed" : "retry",
              lastError: this._lastSyncError,
              attempts: nextAttempts,
              lastAttemptAt: Date.now(),
            });
            this.onSyncError(item, err);
          }
        }
      }

      // Schedule retry if there are items that can still be retried.
      // Include both pending items AND failed items still under MAX_RETRIES.
      const stats = await getQueueStats(this._userId);
      const hasRetryable = stats.items.some(
        (i) => i.status === "pending" || i.status === "retry" || (i.status === "failed" && i.attempts < MAX_RETRIES)
      );
      if (hasRetryable && !this._destroyed) {
        // Find the shortest remaining delay among retryable failed items
        let nextDelay = BASE_RETRY_DELAY;
        for (const i of stats.items) {
          if ((i.status === "retry" || (i.status === "failed" && i.attempts < MAX_RETRIES)) && i.lastAttemptAt) {
            const backoff = BASE_RETRY_DELAY * Math.pow(2, Math.min(i.attempts, 4));
            const elapsed = Date.now() - i.lastAttemptAt;
            const remaining = Math.max(backoff - elapsed, 500);
            nextDelay = Math.min(nextDelay, remaining);
          }
        }
        setTimeout(() => this.processQueue(), nextDelay);
      }
    } catch (err) {
      console.error("[SyncEngine] processQueue error:", err);
    } finally {
      this._processing = false;
      await this._emitStatus();
    }
  }

  /**
   * Force sync: health check first, then process queue.
   * Returns the resulting status for immediate feedback.
   */
  async forceSync() {
    // Signal "checking" for the entire duration of the health check
    // so the UI shows a spinner / "Vérification du serveur..." immediately.
    this._isChecking = true;
    await this._emitStatus();

    try {
      let ok = await this.healthCheck();
      // On mobile after long background suspension, the first fetch often fails
      // because the browser hasn't fully restored network sockets yet. One retry
      // after a short pause is enough to recover in most cases.
      if (!ok) {
        await new Promise((r) => setTimeout(r, 1500));
        ok = await this.healthCheck();
      }
    } finally {
      this._isChecking = false;
    }

    // healthCheck already emitted the result; now re-emit with _isChecking=false
    // so the UI transitions from "checking" → the real state (offline/synced/pending)
    await this._emitStatus();

    if (!this._serverReachable) return; // server is down — already emitted offline

    // Reset ALL failed items — forced sync bypasses MAX_RETRIES and backoff completely
    const stats = await getQueueStats(this._userId);
    for (const item of stats.items) {
      if (item.status === "failed" || item.status === "retry") {
        await updateQueueItem(item.queueId, {
          status: "pending",
          lastAttemptAt: 0,
          attempts: 0, // Full reset so they get a clean retry
        });
      }
    }
    await this.processQueue();
  }

  /**
   * Lightweight health check to detect server availability.
   * Always emits a status update so UI stays in sync.
   */
  async healthCheck() {
    const token = this.getToken();
    if (!token) return false;

    // Prevent concurrent health checks (e.g. forceSync + scheduled check)
    if (this._healthCheckInFlight) return this._serverReachable ?? false;
    this._healthCheckInFlight = true;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      // No Authorization header needed — /api/health has no auth middleware.
      // Cache-busting param forces the browser to open a fresh connection,
      // which avoids stale TCP sockets after a server restart (common on mobile).
      // cache: "no-store" bypasses HTTP cache (SW already uses NetworkOnly).
      const res = await fetch(`${API_BASE}/health?_t=${Date.now()}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        // Validate that the actual GlassKeep backend responded, not just a
        // reverse proxy (nginx) returning a cached/generic 200. This catches
        // cases where nginx is up but the backend process is stopped: nginx
        // returns 502/504 (caught below as 5xx), or a load balancer returns
        // a generic health page that isn't GlassKeep.
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          try {
            const body = await res.json();
            if (body?.service !== "glasskeep") {
              console.warn("[SyncEngine] healthCheck: response missing service marker — not GlassKeep backend");
              this._serverReachable = false;
              this._lastSyncError = "Backend not responding (proxy only)";
              this._failedChecks++;
              this._adjustHealthInterval();
              await this._emitStatus();
              return false;
            }
          } catch (_) {
            // JSON parse failed — not a valid GlassKeep response
            console.warn("[SyncEngine] healthCheck: invalid JSON in health response");
            this._serverReachable = false;
            this._lastSyncError = "Invalid health response";
            this._failedChecks++;
            this._adjustHealthInterval();
            await this._emitStatus();
            return false;
          }
        } else {
          // Not JSON — probably a proxy error page or captive portal
          console.warn("[SyncEngine] healthCheck: non-JSON response (content-type: %s)", contentType);
          this._serverReachable = false;
          this._lastSyncError = "Backend not responding (proxy only)";
          this._failedChecks++;
          this._adjustHealthInterval();
          await this._emitStatus();
          return false;
        }

        const wasOffline = this._serverReachable === false;
        this._serverReachable = true;
        this._lastSyncError = null;
        this._failedChecks = 0;
        this._consecutiveTimeouts = 0;

        // Server confirmed reachable — reset all transient failures so they retry.
        // Fatal errors (auth expired, note not found) are already at MAX_RETRIES
        // or removed, so this only affects retryable items.
        const stats = await getQueueStats(this._userId);
        const NON_RETRYABLE = new Set(["Authentication expired"]);
        let resetCount = 0;
        for (const item of stats.items) {
          if ((item.status === "failed" || item.status === "retry") && !NON_RETRYABLE.has(item.lastError) && !item.lastError?.startsWith("Note not found")) {
            await updateQueueItem(item.queueId, {
              status: "pending",
              lastAttemptAt: 0,
              attempts: 0,
            });
            resetCount++;
          }
        }

        this._adjustHealthInterval();
        await this._emitStatus();
        if (wasOffline || resetCount > 0 || stats.total > 0) {
          this.processQueue();
        }
        return true;
      }

      // Server responded with an error status — it IS reachable, just unhappy.
      // 403 = rate-limited or auth issue on proxy, NOT "server down".
      // Only 5xx should be treated as a server problem.
      const isServerError = res.status >= 500;
      console.warn("[SyncEngine] healthCheck: server responded", res.status);
      if (isServerError) {
        this._serverReachable = false;
        this._lastSyncError = `Server error (${res.status})`;
        this._failedChecks++;
      } else {
        // 4xx (403, 429, etc.) — server is reachable but rejecting requests
        // Don't mark as unreachable, just note the issue
        this._serverReachable = true;
        this._lastSyncError = `HTTP ${res.status}`;
      }
      this._adjustHealthInterval();
      await this._emitStatus();
      return false;
    } catch (err) {
      console.warn("[SyncEngine] healthCheck failed:", err?.name, err?.message);
      const isAbort = err?.name === "AbortError";
      const browserSaysOnline = typeof navigator !== "undefined" && navigator.onLine;

      // Hard network error (TypeError: Failed to fetch) = real proof the
      // server is unreachable. The _sseConnected flag is NOT reliable here:
      // TCP keepalive may not have detected the dead connection yet, so
      // EventSource still reports OPEN while the network is actually down.
      // Only AbortError (timeout/throttle) is ambiguous enough to tolerate.
      if (!isAbort) {
        // Real network failure — mark offline immediately, clear stale SSE flag
        this._sseConnected = false;
        this._consecutiveTimeouts = 0;
        this._serverReachable = false;
        this._lastSyncError = "Server unreachable";
        this._failedChecks++;
      } else {
        this._consecutiveTimeouts++;
        const tabHidden = typeof document !== "undefined" && document.hidden;
        // AbortError (timeout). Only tolerate when the tab is in background:
        // Chrome mobile aggressively throttles background fetches, causing
        // timeouts even when the network is fine. When the tab is VISIBLE,
        // the user is looking at the app — a timeout = server is down.
        const tolerate = tabHidden && this._consecutiveTimeouts < 2;
        if (tolerate) {
          console.warn("[SyncEngine] healthCheck timeout #%d — tolerating (background tab)",
            this._consecutiveTimeouts);
          // Don't change _serverReachable — keep previous state
        } else {
          console.warn("[SyncEngine] healthCheck timeout #%d — marking offline (tab=%s)",
            this._consecutiveTimeouts, tabHidden ? "hidden" : "visible");
          this._serverReachable = false;
          this._lastSyncError = "Health check timeout";
          this._failedChecks++;
        }
      }

      // On mobile PWAs, a stuck Service Worker can make all fetches fail even
      // though the network is up. After several consecutive failures while the
      // browser reports online, nudge the SW to update — a fresh SW often
      // resolves the stuck state without clearing all browsing data.
      if (this._failedChecks >= 3 && typeof navigator !== "undefined" && navigator.onLine && "serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then((reg) => reg.update()).catch(() => {});
      }

      this._adjustHealthInterval();
      await this._emitStatus();
      return false;
    } finally {
      this._healthCheckInFlight = false;
    }
  }

  /**
   * Start adaptive health checks.
   */
  startHealthChecks() {
    this.stopHealthChecks();
    // Initial check to establish server reachability.
    // On mobile after long background / page refresh, the first fetch may fail
    // because the browser is still restoring sockets. Retry once after a pause.
    this.healthCheck().then((ok) => {
      if (!ok && !this._destroyed) {
        setTimeout(() => {
          if (!this._destroyed) this.healthCheck();
        }, 2000);
      }
    });
    this._scheduleNextHealth();
  }

  /**
   * Restart the health-check timer chain without firing an immediate check.
   * Use after an explicit healthCheck() call to ensure the periodic chain
   * hasn't been broken (e.g. by mobile tab suspension GC'ing the timer).
   */
  restartHealthTimer() {
    this.stopHealthChecks();
    this._scheduleNextHealth();
  }

  stopHealthChecks() {
    if (this._healthTimer) {
      clearTimeout(this._healthTimer);
      this._healthTimer = null;
    }
  }

  get serverReachable() {
    return this._serverReachable;
  }

  get lastSyncAt() {
    return this._lastSyncAt;
  }

  destroy() {
    this._destroyed = true;
    this.stopHealthChecks();
  }

  // ─── Private ───

  /**
   * Adaptive health check scheduling:
   * - Server down + pending: aggressive (5s)
   * - Pending changes: moderate (10s)
   * - All synced: relaxed (30s)
   */
  _adjustHealthInterval() {
    // The interval will be picked up by _scheduleNextHealth
  }

  _scheduleNextHealth() {
    if (this._destroyed) return;
    if (this._healthTimer) clearTimeout(this._healthTimer);

    getQueueStats(this._userId).then((stats) => {
      let interval;
      if (this._serverReachable === false) {
        // Always aggressive when offline — detect recovery ASAP
        interval = HEALTH_OFFLINE_INTERVAL;
      } else if (stats.total > 0) {
        interval = HEALTH_PENDING_INTERVAL;
      } else {
        interval = HEALTH_IDLE_INTERVAL;
      }

      this._healthTimer = setTimeout(async () => {
        if (!this._destroyed) {
          await this.healthCheck();
          this._scheduleNextHealth();
        }
      }, interval);
    }).catch(() => {
      // Fallback: idle interval
      this._healthTimer = setTimeout(() => {
        if (!this._destroyed) {
          this.healthCheck().then(() => this._scheduleNextHealth());
        }
      }, HEALTH_IDLE_INTERVAL);
    });
  }

  /**
   * Build and emit the canonical status object.
   * This is the SINGLE source of truth for UI.
   */
  async _emitStatus() {
    const stats = await getQueueStats(this._userId);
    const hasPending = stats.total > 0;

    // Derive the display state — strict priority, no false positives
    //
    // Rule 1: serverReachable === false wins EVERYTHING. UI stays red/offline.
    //         Even if _processing is true (a stale retry is running), the user sees "offline".
    // Rule 2: serverReachable === null (unknown) → "checking" — never green.
    // Rule 3: Only when serverReachable === true (confirmed by health check or successful sync)
    //         can we show syncing/pending/synced/error.
    let syncState;
    if (this._serverReachable === false) {
      // Server confirmed unreachable — ALWAYS offline, no exceptions
      syncState = "offline";
    } else if (this._isChecking || this._serverReachable === null) {
      syncState = "checking";
    } else if (this._processing) {
      syncState = "syncing";
    } else if (stats.failed > 0 && stats.pending === 0 && stats.processing === 0 && stats.retry === 0) {
      // Only show "error" when ALL remaining items are permanently failed (max retries).
      // Items in "retry" are still being retried — that's normal, not an error state.
      syncState = "error";
    } else if (hasPending) {
      syncState = "pending";
    } else {
      syncState = "synced";
    }

    // CRITICAL: During processing or checking, server reachability is UNVERIFIED for
    // this attempt. Never show "Server OK" based on a stale previous check.
    // Only confirmed states: false stays false, true becomes null during processing.
    let emittedServerReachable = this._serverReachable;
    if (this._processing || this._isChecking) {
      // If currently attempting network calls, server state is uncertain
      // false = already confirmed down (keep it), true/null = not yet confirmed for this attempt
      if (this._serverReachable !== false) {
        emittedServerReachable = null;
      }
    }

    this.onStatusChange({
      syncState,
      serverReachable: emittedServerReachable,
      hasPendingChanges: hasPending,
      isSyncing: this._processing,
      lastSyncAt: this._lastSyncAt,
      lastSyncError: this._lastSyncError,
      // Queue stats for detail display
      pending: stats.pending,
      processing: stats.processing,
      retry: stats.retry,
      failed: stats.failed,
      total: stats.total,
      items: stats.items,
      failedChecks: this._failedChecks,
    });
  }

  async _executeAction(item) {
    const token = this.getToken();
    if (!token) {
      const err = new Error("No auth token");
      err.status = 401;
      throw err;
    }

    const baseHeaders = {
      Authorization: `Bearer ${token}`,
    };

    const doFetch = async (path, options = {}) => {
      const headers = options.body
        ? { ...baseHeaders, "Content-Type": "application/json" }
        : baseHeaders;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent("auth-expired"));
          const err = new Error("Authentication expired");
          err.status = 401;
          err.isAuthError = true;
          throw err;
        }

        if (!res.ok) {
          let data = null;
          try { data = await res.json(); } catch {}
          const err = new Error(data?.error || `HTTP ${res.status}`);
          err.status = res.status;
          throw err;
        }

        if (res.status === 204) return null;
        try { return await res.json(); } catch { return null; }
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === "AbortError") {
          // Timeout is NOT a network error — the server may just be busy.
          // Don't mark server as unreachable, just retry the item.
          const e = new Error("Request timeout");
          e.status = 408;
          e.isTimeout = true;
          throw e;
        }
        if (err.isAuthError || err.status) throw err;
        // Genuine network failure (connection refused, DNS, etc.)
        const e = new Error("Network error");
        e.status = 0;
        e.isNetworkError = true;
        throw e;
      }
    };

    switch (item.type) {
      case "create":
        return doFetch("/notes", {
          method: "POST",
          body: JSON.stringify(item.payload),
        });

      case "update":
        return doFetch(`/notes/${item.noteId}`, {
          method: "PUT",
          body: JSON.stringify(item.payload),
        });

      case "patch":
        return doFetch(`/notes/${item.noteId}`, {
          method: "PATCH",
          body: JSON.stringify(item.payload),
        });

      case "archive":
        return doFetch(`/notes/${item.noteId}/archive`, {
          method: "POST",
          body: JSON.stringify(item.payload),
        });

      case "trash":
        return doFetch(`/notes/${item.noteId}/trash`, {
          method: "POST",
          body: JSON.stringify(item.payload || {}),
        });

      case "restore":
        return doFetch(`/notes/${item.noteId}/restore`, {
          method: "POST",
          body: JSON.stringify(item.payload || {}),
        });

      case "permanentDelete":
        return doFetch(`/notes/${item.noteId}/permanent`, {
          method: "DELETE",
          body: JSON.stringify(item.payload || {}),
        });

      case "reorder":
        return doFetch("/notes/reorder", {
          method: "POST",
          body: JSON.stringify(item.payload),
        });

      default:
        throw new Error(`Unknown sync action type: ${item.type}`);
    }
  }
}
