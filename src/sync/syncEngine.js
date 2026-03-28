// src/sync/syncEngine.js
// Background sync processor: dequeues actions, calls API, handles retries

import {
  getPendingQueue,
  updateQueueItem,
  removeQueueItem,
  collapseQueue,
  getQueueStats,
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
  constructor({ getToken, userId, sessionId, onStatusChange, onSyncComplete, onSyncError }) {
    this.getToken = getToken;
    this._userId = userId;
    this._sessionId = sessionId;
    this.onStatusChange = onStatusChange || (() => {});
    this.onSyncComplete = onSyncComplete || (() => {});
    this.onSyncError = onSyncError || (() => {});
    this._processing = false;
    this._isChecking = false; // true while forceSync health-checks (immediate UI feedback)
    this._healthTimer = null;
    this._destroyed = false;

    // Internal state
    this._serverReachable = null; // null = unknown, true/false = tested
    this._lastSyncAt = null;
    this._lastSyncError = null;
    this._failedChecks = 0; // consecutive failed health checks (reset on success)
    this._healthCheckInFlight = false; // guard against concurrent health checks
  }

  // ─── Public API ───

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
      await collapseQueue(this._userId, this._sessionId);

      const items = await getPendingQueue(this._userId, this._sessionId);
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
          this.onSyncComplete(item, result);
          // Small delay between items to avoid triggering reverse proxy rate limits
          await new Promise((r) => setTimeout(r, QUEUE_ITEM_DELAY));
        } catch (err) {
          const isAuthError = err.status === 401;
          const isConflict = err.status === 409;
          const isNotFound = err.status === 404;
          const isRateLimited = err.status === 403 || err.status === 429;
          const isTimeout = !!err.isTimeout;
          const isNetworkError = !isTimeout && !isRateLimited && (err.isNetworkError || err.status === 0 || !err.status);

          if (isAuthError) {
            await updateQueueItem(item.queueId, {
              status: "failed",
              lastError: "Authentication expired",
              attempts: MAX_RETRIES,
            });
          } else if (isConflict && item.type === "create") {
            await removeQueueItem(item.queueId);
            this._serverReachable = true;
            this._lastSyncAt = Date.now();
            this.onSyncComplete(item);
            continue;
          } else if (isNotFound && (item.type === "trash" || item.type === "restore")) {
            this._serverReachable = true;
            await removeQueueItem(item.queueId);
            continue;
          } else if (isNotFound && (item.type === "update" || item.type === "patch" || item.type === "archive")) {
            this._serverReachable = true;
            await updateQueueItem(item.queueId, {
              status: "failed",
              lastError: `Note not found on server (${err.status})`,
              attempts: MAX_RETRIES,
            });
          } else if (isRateLimited) {
            // Rate limited by reverse proxy (403/429). Server IS reachable,
            // just rejecting rapid requests. Pause briefly then retry.
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
      const stats = await getQueueStats(this._userId, this._sessionId);
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
      await this.healthCheck();
    } finally {
      this._isChecking = false;
    }

    // healthCheck already emitted the result; now re-emit with _isChecking=false
    // so the UI transitions from "checking" → the real state (offline/synced/pending)
    await this._emitStatus();

    if (!this._serverReachable) return; // server is down — already emitted offline

    // Reset ALL failed items — forced sync bypasses MAX_RETRIES and backoff completely
    const stats = await getQueueStats(this._userId, this._sessionId);
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
      const timeoutId = setTimeout(() => controller.abort(), 6000);
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
        const wasOffline = this._serverReachable === false;
        this._serverReachable = true;
        this._lastSyncError = null;
        this._failedChecks = 0;

        // Server confirmed reachable — reset all transient failures so they retry.
        // Fatal errors (auth expired, note not found) are already at MAX_RETRIES
        // or removed, so this only affects retryable items.
        const stats = await getQueueStats(this._userId, this._sessionId);
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
      this._serverReachable = false;
      this._lastSyncError = err?.name === "AbortError" ? "Health check timeout" : "Server unreachable";
      this._failedChecks++;
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
    // Initial check to establish server reachability
    this.healthCheck();
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

    getQueueStats(this._userId, this._sessionId).then((stats) => {
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
    const stats = await getQueueStats(this._userId, this._sessionId);
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
        });

      case "restore":
        return doFetch(`/notes/${item.noteId}/restore`, {
          method: "POST",
        });

      case "permanentDelete":
        return doFetch(`/notes/${item.noteId}/permanent`, {
          method: "DELETE",
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
