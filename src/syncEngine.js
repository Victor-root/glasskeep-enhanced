// src/syncEngine.js
// Sync engine: manages online/offline detection, action queue replay, and conflict handling.

import {
  getAllNotes,
  putNotes,
  putNote,
  deleteNote as idbDeleteNote,
  enqueueAction,
  getAllQueuedActions,
  getQueueLength,
  removeQueuedAction,
  clearQueue,
  getMeta,
  setMeta,
} from "./offlineStore.js";

// ──── Server Health Check ────

let _lastHealthCheck = 0;
let _lastHealthResult = null;
const HEALTH_CHECK_INTERVAL = 5000; // Don't re-check more than every 5s

/**
 * Check if the server is actually reachable (not just navigator.onLine).
 * Returns true if server responds, false otherwise.
 */
export async function checkServerHealth(token) {
  const now = Date.now();
  if (now - _lastHealthCheck < HEALTH_CHECK_INTERVAL && _lastHealthResult !== null) {
    return _lastHealthResult;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch("/api/health", {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    _lastHealthResult = res.ok;
    _lastHealthCheck = now;
    return res.ok;
  } catch {
    _lastHealthResult = false;
    _lastHealthCheck = now;
    return false;
  }
}

/** Force-reset the cached health check so next call actually pings the server. */
export function resetHealthCache() {
  _lastHealthCheck = 0;
  _lastHealthResult = null;
}

// ──── Sync Status ────

// Possible states: "synced" | "offline" | "pending" | "syncing" | "error"
const listeners = new Set();
let _syncStatus = "synced";
let _pendingCount = 0;
let _lastError = null;

export function getSyncStatus() {
  return { status: _syncStatus, pendingCount: _pendingCount, lastError: _lastError };
}

function setSyncStatus(status, pendingCount, lastError) {
  _syncStatus = status;
  if (pendingCount !== undefined) _pendingCount = pendingCount;
  if (lastError !== undefined) _lastError = lastError;
  for (const fn of listeners) {
    try { fn({ status: _syncStatus, pendingCount: _pendingCount, lastError: _lastError }); } catch {}
  }
}

export function onSyncStatusChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ──── Persist notes to IndexedDB after server fetch ────

export async function cacheNotesLocally(notes, userId) {
  if (!userId) return;
  await putNotes(notes, userId);
  await setMeta(`lastSync-${userId}`, Date.now());
}

export async function getLocalNotes(userId) {
  if (!userId) return [];
  return getAllNotes(userId);
}

// ──── Queue an offline action ────

export async function queueOfflineAction(action) {
  await enqueueAction(action);
  const count = await getQueueLength();
  setSyncStatus("pending", count, null);
}

export async function getPendingCount() {
  return getQueueLength();
}

// ──── Apply action locally (optimistic update to IndexedDB) ────

export async function applyActionLocally(action, userId) {
  switch (action.type) {
    case "create":
      await putNote({ ...action.data, _offlineCreated: true }, userId);
      break;
    case "update":
      await putNote({ ...action.data, _offlineModified: true }, userId);
      break;
    case "delete":
    case "trash":
    case "permanentDelete":
      await idbDeleteNote(String(action.noteId));
      break;
    case "archive": {
      const existing = await getAllNotes(userId);
      const note = existing.find((n) => String(n.id) === String(action.noteId));
      if (note) {
        await putNote({ ...note, archived: action.archived, _offlineModified: true }, userId);
      }
      break;
    }
    case "restore": {
      // Remove from local store (it will come back on next sync)
      await idbDeleteNote(String(action.noteId));
      break;
    }
    case "pin": {
      const existing2 = await getAllNotes(userId);
      const note2 = existing2.find((n) => String(n.id) === String(action.noteId));
      if (note2) {
        await putNote({ ...note2, pinned: action.pinned, _offlineModified: true }, userId);
      }
      break;
    }
    default:
      break;
  }
}

// ──── Replay queue (sync) ────

let _syncing = false;

/**
 * Replay all queued actions to the server.
 * Returns { ok: boolean, synced: number, failed: number, conflicts: [] }
 */
export async function syncNow(token, userId, apiHelper) {
  if (_syncing) return { ok: false, synced: 0, failed: 0, conflicts: [], reason: "already_syncing" };
  _syncing = true;

  const actions = await getAllQueuedActions();
  if (actions.length === 0) {
    _syncing = false;
    setSyncStatus("synced", 0, null);
    return { ok: true, synced: 0, failed: 0, conflicts: [] };
  }

  setSyncStatus("syncing", actions.length, null);

  // Check server health first
  const serverOk = await checkServerHealth(token);
  if (!serverOk) {
    _syncing = false;
    setSyncStatus("offline", actions.length, null);
    return { ok: false, synced: 0, failed: 0, conflicts: [], reason: "server_unreachable" };
  }

  let synced = 0;
  let failed = 0;
  const conflicts = [];

  // Sort by timestamp to replay in order
  actions.sort((a, b) => a.timestamp - b.timestamp);

  // Deduplicate: keep only the latest action per noteId for updates
  const deduped = deduplicateActions(actions);

  for (const action of deduped) {
    try {
      await replayAction(action, token, apiHelper, userId, conflicts);
      await removeQueuedAction(action.queueId);
      synced++;
    } catch (e) {
      console.error("[SyncEngine] Failed to replay action:", action, e);
      // If it's a 404 on delete/trash/restore, consider it done (note already gone)
      if (e.status === 404 && ["delete", "trash", "restore", "permanentDelete", "archive"].includes(action.type)) {
        await removeQueuedAction(action.queueId);
        synced++;
      } else if (e.isAuthError) {
        // Stop sync on auth errors
        _syncing = false;
        setSyncStatus("error", actions.length - synced, "Auth expired");
        return { ok: false, synced, failed: actions.length - synced, conflicts, reason: "auth_error" };
      } else {
        failed++;
      }
    }
  }

  // Also remove any deduped-out entries
  const dedupedIds = new Set(deduped.map((a) => a.queueId));
  for (const action of actions) {
    if (!dedupedIds.has(action.queueId)) {
      await removeQueuedAction(action.queueId);
    }
  }

  const remaining = await getQueueLength();
  _syncing = false;

  if (remaining === 0) {
    setSyncStatus("synced", 0, null);
  } else {
    setSyncStatus("pending", remaining, failed > 0 ? `${failed} action(s) failed` : null);
  }

  return { ok: failed === 0, synced, failed, conflicts };
}

/**
 * Deduplicate actions: for the same noteId, keep only the latest meaningful action.
 * E.g., if we have create + update + update for the same note, keep create (with latest data) or just the last update.
 */
function deduplicateActions(actions) {
  const byNote = new Map();
  const nonNoteBound = []; // Actions without noteId

  for (const action of actions) {
    if (!action.noteId) {
      nonNoteBound.push(action);
      continue;
    }
    const key = String(action.noteId);
    if (!byNote.has(key)) {
      byNote.set(key, []);
    }
    byNote.get(key).push(action);
  }

  const result = [...nonNoteBound];

  for (const [, noteActions] of byNote) {
    // Sort by timestamp
    noteActions.sort((a, b) => a.timestamp - b.timestamp);

    const hasCreate = noteActions.find((a) => a.type === "create");
    const last = noteActions[noteActions.length - 1];

    // If the last action is a destructive one (delete/trash/permanentDelete)
    if (["delete", "trash", "permanentDelete"].includes(last.type)) {
      if (hasCreate) {
        // Created then deleted offline - skip entirely, remove all
        for (const a of noteActions) {
          removeQueuedAction(a.queueId).catch(() => {});
        }
        continue;
      }
      // Just keep the destructive action
      result.push(last);
      continue;
    }

    // If there's a create, merge all updates into the create
    if (hasCreate) {
      const lastUpdate = noteActions.filter((a) => a.type === "update").pop();
      const merged = {
        ...hasCreate,
        data: lastUpdate ? lastUpdate.data : hasCreate.data,
      };
      result.push(merged);
      continue;
    }

    // Otherwise keep only the last action
    result.push(last);
  }

  return result;
}

async function replayAction(action, token, apiHelper, userId, conflicts) {
  switch (action.type) {
    case "create": {
      const { _offlineCreated, _offlineModified, _userId, ...cleanData } = action.data;
      const created = await apiHelper("/notes", {
        method: "POST",
        body: cleanData,
        token,
      });
      // Update local store with server-assigned data
      if (created && created.id) {
        // If server changed the ID, update local
        if (String(created.id) !== String(action.noteId)) {
          await idbDeleteNote(String(action.noteId));
        }
        await putNote(created, userId);
      }
      break;
    }
    case "update": {
      const { _offlineCreated, _offlineModified, _userId, ...cleanPayload } = action.data;

      // Check for conflict: fetch server version first
      try {
        // We don't have a single-note GET, so we'll just try the PUT.
        // If the server rejects (409), we handle conflict.
        await apiHelper(`/notes/${action.noteId}`, {
          method: "PUT",
          body: cleanPayload,
          token,
        });
      } catch (e) {
        if (e.status === 409) {
          // Conflict - server has a newer version
          conflicts.push({
            noteId: action.noteId,
            localData: cleanPayload,
            error: "conflict",
          });
          // Create a backup copy with the local changes
          const backupNote = {
            ...cleanPayload,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: `[Conflict backup] ${cleanPayload.title || ""}`.trim(),
            timestamp: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          await apiHelper("/notes", { method: "POST", body: backupNote, token });
          break;
        }
        throw e;
      }
      break;
    }
    case "trash":
      await apiHelper(`/notes/${action.noteId}/trash`, { method: "POST", token });
      break;
    case "delete":
      await apiHelper(`/notes/${action.noteId}`, { method: "DELETE", token });
      break;
    case "permanentDelete":
      await apiHelper(`/notes/${action.noteId}/permanent`, { method: "DELETE", token });
      break;
    case "archive":
      await apiHelper(`/notes/${action.noteId}/archive`, {
        method: "POST",
        body: { archived: action.archived },
        token,
      });
      break;
    case "restore":
      await apiHelper(`/notes/${action.noteId}/restore`, { method: "POST", token });
      break;
    case "pin":
      await apiHelper(`/notes/${action.noteId}`, {
        method: "PATCH",
        body: { pinned: action.pinned },
        token,
      });
      break;
    default:
      console.warn("[SyncEngine] Unknown action type:", action.type);
  }
}

// ──── Auto-sync on reconnection ────

let _autoSyncTimer = null;

export function startAutoSync(token, userId, apiHelper, intervalMs = 30000) {
  stopAutoSync();
  _autoSyncTimer = setInterval(async () => {
    const count = await getQueueLength();
    if (count > 0) {
      const serverOk = await checkServerHealth(token);
      if (serverOk) {
        await syncNow(token, userId, apiHelper);
      }
    }
  }, intervalMs);
}

export function stopAutoSync() {
  if (_autoSyncTimer) {
    clearInterval(_autoSyncTimer);
    _autoSyncTimer = null;
  }
}

// ──── Update sync status based on current state ────

export async function refreshSyncStatus(token) {
  const count = await getQueueLength();
  if (count === 0) {
    const serverOk = navigator.onLine ? await checkServerHealth(token) : false;
    setSyncStatus(serverOk ? "synced" : "offline", 0, null);
  } else {
    const serverOk = navigator.onLine ? await checkServerHealth(token) : false;
    setSyncStatus(serverOk ? "pending" : "offline", count, null);
  }
}
