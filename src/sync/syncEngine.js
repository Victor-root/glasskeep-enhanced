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

/**
 * SyncEngine manages background synchronization.
 * It processes queue items sequentially, retries on failure,
 * and reports status changes via callbacks.
 */
export class SyncEngine {
  constructor({ getToken, onStatusChange, onSyncComplete, onSyncError }) {
    this.getToken = getToken;
    this.onStatusChange = onStatusChange || (() => {});
    this.onSyncComplete = onSyncComplete || (() => {});
    this.onSyncError = onSyncError || (() => {});
    this._processing = false;
    this._healthTimer = null;
    this._aggressiveHealthTimer = null;
    this._serverOnline = true;
    this._destroyed = false;
  }

  // ─── Public API ───

  /**
   * Trigger sync processing. Safe to call repeatedly.
   */
  async processQueue() {
    if (this._processing || this._destroyed) return;
    this._processing = true;

    try {
      // Collapse redundant entries first
      await collapseQueue();

      const items = await getPendingQueue();
      if (items.length === 0) {
        this._processing = false;
        this.onStatusChange(await this._buildStatus("synced"));
        return;
      }

      this.onStatusChange(await this._buildStatus("syncing"));

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

        // Check retry delay
        if (item.status === "failed" && item.lastAttemptAt) {
          const delay = BASE_RETRY_DELAY * Math.pow(2, Math.min(item.attempts, 4));
          if (Date.now() - item.lastAttemptAt < delay) {
            continue; // Not time to retry yet
          }
        }

        await updateQueueItem(item.queueId, { status: "processing" });
        this.onStatusChange(await this._buildStatus("syncing"));

        try {
          await this._executeAction(item);
          await removeQueueItem(item.queueId);
          this.onSyncComplete(item);
        } catch (err) {
          const isAuthError = err.status === 401;
          const isConflict = err.status === 409;
          const isNotFound = err.status === 404;
          const isNetworkError = err.isNetworkError || err.status === 0 || !err.status;

          if (isAuthError) {
            // Don't retry auth errors
            await updateQueueItem(item.queueId, {
              status: "failed",
              lastError: "Authentication expired",
              attempts: MAX_RETRIES, // prevent further retries
            });
          } else if (isConflict && item.type === "create") {
            // Note already exists on server (idempotent create succeeded before)
            await removeQueueItem(item.queueId);
            this.onSyncComplete(item);
            continue;
          } else if (isNotFound && (item.type === "update" || item.type === "patch" || item.type === "archive")) {
            // Note doesn't exist on server anymore
            await updateQueueItem(item.queueId, {
              status: "failed",
              lastError: `Note not found on server (${err.status})`,
              attempts: MAX_RETRIES,
            });
          } else if (isNetworkError) {
            this._serverOnline = false;
            await updateQueueItem(item.queueId, {
              status: "failed",
              lastError: "Server unreachable",
              attempts: item.attempts + 1,
              lastAttemptAt: Date.now(),
            });
            // Stop processing - server is down
            this.onStatusChange(await this._buildStatus("offline"));
            this._startAggressiveHealthCheck();
            break;
          } else {
            await updateQueueItem(item.queueId, {
              status: "failed",
              lastError: `${err.message || "Unknown error"} (HTTP ${err.status || "?"})`,
              attempts: item.attempts + 1,
              lastAttemptAt: Date.now(),
            });
            this.onSyncError(item, err);
          }
        }
      }

      // Final status
      const stats = await getQueueStats();
      if (stats.total === 0) {
        this.onStatusChange(await this._buildStatus("synced"));
      } else if (stats.failed > 0 && stats.pending === 0 && stats.processing === 0) {
        this.onStatusChange(await this._buildStatus("error"));
      } else if (stats.pending > 0 || stats.failed > 0) {
        this.onStatusChange(await this._buildStatus("pending"));
        // Schedule retry
        if (!this._destroyed) {
          setTimeout(() => this.processQueue(), BASE_RETRY_DELAY);
        }
      }
    } catch (err) {
      console.error("[SyncEngine] processQueue error:", err);
    } finally {
      this._processing = false;
    }
  }

  /**
   * Lightweight health check to detect server recovery.
   */
  async healthCheck() {
    const token = this.getToken();
    if (!token) return false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_BASE}/health`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const wasOffline = !this._serverOnline;
        this._serverOnline = true;
        if (wasOffline) {
          this._stopAggressiveHealthCheck();
          // Server is back, retry queue
          this.processQueue();
        }
        return true;
      }
      this._serverOnline = false;
      return false;
    } catch {
      this._serverOnline = false;
      return false;
    }
  }

  /**
   * Start regular health checks (every 30s).
   */
  startHealthChecks() {
    this.stopHealthChecks();
    this._healthTimer = setInterval(() => {
      this.healthCheck();
    }, 30000);
    // Initial check
    this.healthCheck();
  }

  stopHealthChecks() {
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
      this._healthTimer = null;
    }
    this._stopAggressiveHealthCheck();
  }

  get isServerOnline() {
    return this._serverOnline;
  }

  destroy() {
    this._destroyed = true;
    this.stopHealthChecks();
  }

  // ─── Private ───

  _startAggressiveHealthCheck() {
    if (this._aggressiveHealthTimer) return;
    this._aggressiveHealthTimer = setInterval(() => {
      this.healthCheck();
    }, 5000); // Check every 5s when offline + pending changes
  }

  _stopAggressiveHealthCheck() {
    if (this._aggressiveHealthTimer) {
      clearInterval(this._aggressiveHealthTimer);
      this._aggressiveHealthTimer = null;
    }
  }

  async _buildStatus(state) {
    const stats = await getQueueStats();
    return {
      state, // synced | pending | syncing | offline | error
      serverOnline: this._serverOnline,
      pending: stats.pending,
      processing: stats.processing,
      failed: stats.failed,
      total: stats.total,
      items: stats.items,
    };
  }

  async _executeAction(item) {
    const token = this.getToken();
    if (!token) {
      const err = new Error("No auth token");
      err.status = 401;
      throw err;
    }

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    const doFetch = async (path, options = {}) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
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
          const e = new Error("Request timeout");
          e.status = 408;
          e.isNetworkError = true;
          throw e;
        }
        if (err.isAuthError || err.status) throw err;
        // Network error
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
