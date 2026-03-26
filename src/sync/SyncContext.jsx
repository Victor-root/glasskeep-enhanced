// src/sync/SyncContext.jsx
// React context that bridges local-first storage, sync engine, and UI state

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import {
  getAllNotes,
  getNote,
  putNote,
  putNotes,
  deleteNote as deleteNoteFromDb,
  enqueue,
  getQueueStats,
  hasPendingChanges,
  clearQueue,
  clearNotesForUser,
} from "./localDb.js";
import { SyncEngine } from "./syncEngine.js";

const SyncContext = createContext(null);

export function useSyncContext() {
  return useContext(SyncContext);
}

// Sync status states
const INITIAL_STATUS = {
  state: "synced", // synced | pending | syncing | offline | error
  serverOnline: true,
  pending: 0,
  processing: 0,
  failed: 0,
  total: 0,
  items: [],
};

export function SyncProvider({ children, token, userId }) {
  const [syncStatus, setSyncStatus] = useState(INITIAL_STATUS);
  const engineRef = useRef(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // Initialize sync engine
  useEffect(() => {
    if (!token || !userId) {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
      setSyncStatus(INITIAL_STATUS);
      return;
    }

    const engine = new SyncEngine({
      getToken: () => tokenRef.current,
      onStatusChange: (status) => {
        setSyncStatus(status);
      },
      onSyncComplete: (item) => {
        // Individual item synced successfully
      },
      onSyncError: (item, err) => {
        console.warn("[Sync] Action failed:", item.type, item.noteId, err.message);
      },
    });

    engineRef.current = engine;
    engine.startHealthChecks();

    // Process any leftover queue items from previous session
    engine.processQueue();

    // Refresh status
    getQueueStats().then((stats) => {
      if (stats.total > 0) {
        setSyncStatus({
          state: stats.failed > 0 ? "error" : "pending",
          serverOnline: engine.isServerOnline,
          ...stats,
        });
      }
    });

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [token, userId]);

  // ─── Local-first mutation helpers ───
  // Each function: 1) writes to IndexedDB, 2) enqueues sync action, 3) triggers sync

  const triggerSync = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.processQueue();
    }
  }, []);

  const forceSyncNow = useCallback(async () => {
    if (engineRef.current) {
      await engineRef.current.processQueue();
    }
  }, []);

  const forceHealthCheck = useCallback(async () => {
    if (engineRef.current) {
      return engineRef.current.healthCheck();
    }
    return false;
  }, []);

  /**
   * Create a note locally and enqueue for server sync.
   * Returns the note object immediately.
   */
  const createNoteLocal = useCallback(async (note) => {
    const localNote = {
      ...note,
      user_id: userId,
      archived: false,
      trashed: false,
      _localOnly: true, // flag: not yet confirmed by server
    };
    await putNote(localNote);
    await enqueue({
      type: "create",
      noteId: note.id,
      payload: note,
    });
    setSyncStatus((prev) => ({
      ...prev,
      state: "pending",
      pending: prev.pending + 1,
      total: prev.total + 1,
    }));
    triggerSync();
    return localNote;
  }, [userId, triggerSync]);

  /**
   * Update a note locally (full update) and enqueue for sync.
   */
  const updateNoteLocal = useCallback(async (noteId, payload) => {
    const existing = await getNote(noteId);
    if (!existing) return null;
    const updated = { ...existing, ...payload, updated_at: new Date().toISOString() };
    delete updated._synced; // mark as not synced
    updated._localOnly = existing._localOnly || false;
    await putNote(updated);
    await enqueue({
      type: "update",
      noteId,
      payload,
    });
    setSyncStatus((prev) => ({
      ...prev,
      state: "pending",
      pending: prev.pending + 1,
      total: prev.total + 1,
    }));
    triggerSync();
    return updated;
  }, [triggerSync]);

  /**
   * Patch a note locally (partial update, e.g. pin) and enqueue.
   */
  const patchNoteLocal = useCallback(async (noteId, patch) => {
    const existing = await getNote(noteId);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    await putNote(updated);
    await enqueue({
      type: "patch",
      noteId,
      payload: patch,
    });
    setSyncStatus((prev) => ({
      ...prev,
      state: "pending",
      pending: prev.pending + 1,
      total: prev.total + 1,
    }));
    triggerSync();
    return updated;
  }, [triggerSync]);

  /**
   * Archive/unarchive a note locally and enqueue.
   */
  const archiveNoteLocal = useCallback(async (noteId, archived) => {
    const existing = await getNote(noteId);
    if (!existing) return null;
    const updated = { ...existing, archived: !!archived };
    await putNote(updated);
    await enqueue({
      type: "archive",
      noteId,
      payload: { archived: !!archived },
    });
    setSyncStatus((prev) => ({
      ...prev,
      state: "pending",
      pending: prev.pending + 1,
      total: prev.total + 1,
    }));
    triggerSync();
    return updated;
  }, [triggerSync]);

  /**
   * Trash a note locally and enqueue.
   */
  const trashNoteLocal = useCallback(async (noteId) => {
    const existing = await getNote(noteId);
    if (!existing) return null;
    const updated = { ...existing, trashed: true };
    await putNote(updated);
    await enqueue({
      type: "trash",
      noteId,
    });
    setSyncStatus((prev) => ({
      ...prev,
      state: "pending",
      pending: prev.pending + 1,
      total: prev.total + 1,
    }));
    triggerSync();
    return updated;
  }, [triggerSync]);

  /**
   * Restore a note from trash locally and enqueue.
   */
  const restoreNoteLocal = useCallback(async (noteId) => {
    const existing = await getNote(noteId);
    if (!existing) return null;
    const updated = { ...existing, trashed: false };
    await putNote(updated);
    await enqueue({
      type: "restore",
      noteId,
    });
    setSyncStatus((prev) => ({
      ...prev,
      state: "pending",
      pending: prev.pending + 1,
      total: prev.total + 1,
    }));
    triggerSync();
    return updated;
  }, [triggerSync]);

  /**
   * Permanently delete a note locally and enqueue.
   */
  const permanentDeleteLocal = useCallback(async (noteId) => {
    await deleteNoteFromDb(noteId);
    await enqueue({
      type: "permanentDelete",
      noteId,
    });
    setSyncStatus((prev) => ({
      ...prev,
      state: "pending",
      pending: prev.pending + 1,
      total: prev.total + 1,
    }));
    triggerSync();
  }, [triggerSync]);

  /**
   * Reorder notes locally and enqueue.
   */
  const reorderNotesLocal = useCallback(async (notesArray, pinnedIds, otherIds) => {
    // Update positions in IndexedDB
    for (const note of notesArray) {
      const existing = await getNote(note.id);
      if (existing) {
        await putNote({ ...existing, position: note.position });
      }
    }
    await enqueue({
      type: "reorder",
      noteId: "__reorder__",
      payload: { pinnedIds, otherIds },
    });
    setSyncStatus((prev) => ({
      ...prev,
      state: "pending",
      pending: prev.pending + 1,
      total: prev.total + 1,
    }));
    triggerSync();
  }, [triggerSync]);

  /**
   * Hydrate local DB from server data.
   * Only updates notes that don't have pending local changes.
   */
  const hydrateFromServer = useCallback(async (serverNotes, filter = "active") => {
    if (!userId) return;
    const notesToPut = [];
    for (const sn of serverNotes) {
      const hasPending = await hasPendingChanges(String(sn.id));
      if (hasPending) {
        // Don't overwrite local changes with server state
        continue;
      }
      notesToPut.push({
        ...sn,
        id: String(sn.id),
        user_id: sn.user_id || userId,
        archived: filter === "archived" ? true : (sn.archived || false),
        trashed: filter === "trashed" ? true : (sn.trashed || false),
        _localOnly: false,
      });
    }
    if (notesToPut.length > 0) {
      await putNotes(notesToPut);
    }
  }, [userId]);

  /**
   * Load notes from local IndexedDB (the source of truth for UI).
   */
  const loadLocalNotes = useCallback(async (filter = "active") => {
    if (!userId) return [];
    return getAllNotes(userId, filter);
  }, [userId]);

  /**
   * Check if a specific note has pending changes.
   */
  const noteHasPendingChanges = useCallback(async (noteId) => {
    return hasPendingChanges(String(noteId));
  }, []);

  /**
   * Clear all local data (on logout).
   */
  const clearLocalData = useCallback(async () => {
    if (userId) {
      await clearNotesForUser(userId);
    }
    await clearQueue();
    setSyncStatus(INITIAL_STATUS);
  }, [userId]);

  const value = {
    syncStatus,
    createNoteLocal,
    updateNoteLocal,
    patchNoteLocal,
    archiveNoteLocal,
    trashNoteLocal,
    restoreNoteLocal,
    permanentDeleteLocal,
    reorderNotesLocal,
    hydrateFromServer,
    loadLocalNotes,
    noteHasPendingChanges,
    clearLocalData,
    forceSyncNow,
    forceHealthCheck,
    triggerSync,
  };

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}
