import { useCallback, useEffect, useRef, useState } from "react";
import { SyncEngine } from "./syncEngine.js";
import { enqueue as idbEnqueue } from "./localDb.js";

// Canonical reset shape, used at init, teardown and sign-out.
export const SYNC_STATUS_RESET = Object.freeze({
  syncState: "checking", serverReachable: null, hasPendingChanges: false, isSyncing: false,
  lastSyncAt: null, lastSyncError: null,
  pending: 0, processing: 0, failed: 0, total: 0, items: [],
});

/**
 * Lifecycle of the local-first sync engine.
 *
 * Canonical sync path:
 *   user action → IDB write → enqueueAndSync(action) → idbEnqueue → triggerSync
 *     → engine.processQueue() → HTTP calls → onStatusChange → syncStatus
 *   Remote updates: server event → note patch → pending-changes guard → IDB + notes
 *   Retry:          processQueue reschedules itself on retryable failures
 *   Recovery:       adaptive health check resets transient failures → processQueue
 *   Manual:         handleSyncNow → forceSync → reload of the current view
 *
 * Ownership: syncStatus is only written by the engine and the reset
 * points; the IndexedDB queue only by idbEnqueue and the engine.
 *
 * `onSyncComplete` / `onNoteInaccessible` are taken from the render that
 * (re)builds the engine, i.e. when the user or the session changes.
 */
export default function useNoteSync({ token, userId, sessionId, leases, onSyncComplete, onNoteInaccessible }) {
  const [syncStatus, setSyncStatus] = useState(SYNC_STATUS_RESET);
  const syncEngineRef = useRef(null);
  const tokenRef = useRef(token);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref read by the engine, outside render
  tokenRef.current = token;
  // The current view's reload, kept up to date by the notes loader.
  const reloadCurrentViewRef = useRef(null);

  useEffect(() => {
    if (!token || !userId) {
      if (syncEngineRef.current) {
        syncEngineRef.current.destroy();
        syncEngineRef.current = null;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the sync status when the engine is torn down on sign-out
      setSyncStatus(SYNC_STATUS_RESET);
      return;
    }

    const engine = new SyncEngine({
      getToken: () => tokenRef.current,
      userId,
      sessionId,
      onStatusChange: (status) => setSyncStatus(status),
      onSyncComplete: async (item, result) => {
        try {
          await onSyncComplete(item, result);
        } catch (e) {
          console.error("[Sync] reconciliation error:", e);
        }
      },
      onSyncError: (item, err) => console.warn("[Sync] Failed:", item.type, item.noteId, err.message),
      onNoteInaccessible,
    });
    syncEngineRef.current = engine;
    engine.startHealthChecks();

    // Process the queue left over by a previous session.
    engine.processQueue();

    return () => {
      engine.destroy();
      syncEngineRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the sync engine must be rebuilt only when the user or the session changes
  }, [token, userId, sessionId]);

  const triggerSync = useCallback(() => {
    syncEngineRef.current?.processQueue();
  }, []);

  // Sync the queue, then pull the current view to pick up the other
  // devices' changes.
  const handleSyncNow = useCallback(async () => {
    const engine = syncEngineRef.current;
    await engine?.forceSync();
    if (engine?.serverReachable) {
      if (engine) await engine.beginPull();
      try {
        await reloadCurrentViewRef.current?.();
      } finally {
        if (engine) await engine.endPull();
      }
    }
  }, []);

  // Warn before closing while local changes are still unsent.
  useEffect(() => {
    const handler = (e) => {
      if (syncStatus.hasPendingChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [syncStatus.hasPendingChanges]);

  const enqueueAndSync = useCallback(async (action) => {
    await idbEnqueue({ ...action, userId, sessionId });
    triggerSync();
  }, [triggerSync, userId, sessionId]);

  // The caller acquired the lease before its local writes. Pruned on
  // success; on failure it stays, so the note keeps its protection.
  const enqueueWithLease = async (noteId, syncAction, leaseId) => {
    try {
      await enqueueAndSync(syncAction);
    } catch {
      return false;
    }
    leases.releaseLocalLeaseWithPrune(noteId, leaseId);
    return true;
  };

  // Legacy localStorage note caches (IndexedDB is the store now): purged
  // to free quota.
  useEffect(() => {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("glass-keep-notes-") || k.startsWith("glass-keep-archived-") || k.startsWith("glass-keep-trashed-"))) {
          keys.push(k);
        }
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch { /* storage unavailable: nothing to clear */ }
  }, []);

  // Sign-out / expired session teardown.
  const resetSync = () => {
    leases.clearAll();
    if (syncEngineRef.current) {
      syncEngineRef.current.destroy();
      syncEngineRef.current = null;
    }
    setSyncStatus(SYNC_STATUS_RESET);
  };

  return {
    syncStatus,
    syncEngineRef,
    reloadCurrentViewRef,
    triggerSync,
    handleSyncNow,
    enqueueAndSync,
    enqueueWithLease,
    resetSync,
  };
}
