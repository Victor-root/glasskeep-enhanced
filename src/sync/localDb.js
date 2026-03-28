// src/sync/localDb.js
// IndexedDB wrapper for local-first note storage and sync queue

const DB_NAME = "glasskeep";
const DB_VERSION = 3; // v3: add compound [userId, sessionId] index for per-session isolation
const NOTES_STORE = "notes";
const QUEUE_STORE = "syncQueue";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const oldVersion = e.oldVersion;

      // ─── v1: initial stores ───
      if (oldVersion < 1) {
        const ns = db.createObjectStore(NOTES_STORE, { keyPath: "id" });
        ns.createIndex("user_id", "user_id", { unique: false });
        ns.createIndex("archived", "archived", { unique: false });
        ns.createIndex("trashed", "trashed", { unique: false });

        const qs = db.createObjectStore(QUEUE_STORE, { keyPath: "queueId", autoIncrement: true });
        qs.createIndex("noteId", "noteId", { unique: false });
        qs.createIndex("status", "status", { unique: false });
        qs.createIndex("createdAt", "createdAt", { unique: false });
        qs.createIndex("userId", "userId", { unique: false });
        qs.createIndex("userSession", ["userId", "sessionId"], { unique: false });
      }

      // ─── v2: add userId index to existing syncQueue ───
      if (oldVersion >= 1 && oldVersion < 2) {
        const queueStore = e.target.transaction.objectStore(QUEUE_STORE);
        if (!queueStore.indexNames.contains("userId")) {
          queueStore.createIndex("userId", "userId", { unique: false });
        }
      }

      // ─── v3: add compound [userId, sessionId] index ───
      if (oldVersion >= 1 && oldVersion < 3) {
        const queueStore = e.target.transaction.objectStore(QUEUE_STORE);
        if (!queueStore.indexNames.contains("userSession")) {
          queueStore.createIndex("userSession", ["userId", "sessionId"], { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode = "readonly") {
  return openDb().then((db) => {
    const t = db.transaction(storeName, mode);
    return t.objectStore(storeName);
  });
}

// ─── Notes Store ───

export async function getAllNotes(userId, filter = "active") {
  const store = await tx(NOTES_STORE);
  return new Promise((resolve, reject) => {
    const req = store.index("user_id").getAll(userId);
    req.onsuccess = () => {
      let notes = req.result || [];
      if (filter === "active") {
        notes = notes.filter((n) => !n.archived && !n.trashed);
      } else if (filter === "archived") {
        notes = notes.filter((n) => n.archived && !n.trashed);
      } else if (filter === "trashed") {
        notes = notes.filter((n) => n.trashed);
      }
      resolve(notes);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getNote(id) {
  const store = await tx(NOTES_STORE);
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function putNote(note) {
  const store = await tx(NOTES_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(note);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function putNotes(notes) {
  const db = await openDb();
  const t = db.transaction(NOTES_STORE, "readwrite");
  const store = t.objectStore(NOTES_STORE);
  for (const note of notes) {
    store.put(note);
  }
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function deleteNote(id) {
  const store = await tx(NOTES_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearNotesForUser(userId) {
  const db = await openDb();
  const t = db.transaction(NOTES_STORE, "readwrite");
  const store = t.objectStore(NOTES_STORE);
  const idx = store.index("user_id");
  const req = idx.openCursor(IDBKeyRange.only(userId));
  req.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// ─── Sync Queue Store ───
// All queue read functions require userId + sessionId for per-session isolation.
// Entries without sessionId (v1/v2) are silently excluded by the compound index.

/**
 * Queue action types:
 * - create: POST /api/notes
 * - update: PUT /api/notes/:id
 * - patch: PATCH /api/notes/:id  (partial update like pin)
 * - archive: POST /api/notes/:id/archive
 * - trash: POST /api/notes/:id/trash
 * - restore: POST /api/notes/:id/restore
 * - permanentDelete: DELETE /api/notes/:id/permanent
 * - reorder: POST /api/notes/reorder
 */

export async function enqueue(action) {
  const store = await tx(QUEUE_STORE, "readwrite");
  const entry = {
    ...action,
    status: "pending", // pending | processing | retry | failed
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  };
  return new Promise((resolve, reject) => {
    const req = store.add(entry);
    req.onsuccess = () => {
      entry.queueId = req.result;
      resolve(entry);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getQueueItems(userId, sessionId) {
  const store = await tx(QUEUE_STORE);
  return new Promise((resolve, reject) => {
    const req = store.index("userSession").getAll([userId, sessionId]);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingQueue(userId, sessionId) {
  const items = await getQueueItems(userId, sessionId);
  return items
    .filter((i) => i.status === "pending" || i.status === "retry" || i.status === "failed")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function updateQueueItem(queueId, updates) {
  const db = await openDb();
  const t = db.transaction(QUEUE_STORE, "readwrite");
  const store = t.objectStore(QUEUE_STORE);
  return new Promise((resolve, reject) => {
    const getReq = store.get(queueId);
    getReq.onsuccess = () => {
      const item = getReq.result;
      if (!item) return resolve(null);
      Object.assign(item, updates);
      store.put(item);
      t.oncomplete = () => resolve(item);
    };
    t.onerror = () => reject(t.error);
  });
}

export async function removeQueueItem(queueId) {
  const store = await tx(QUEUE_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(queueId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Clear all queue items for a user (all sessions). Used at sign-out / auth-expired
 * to ensure no orphaned items remain from any session.
 */
export async function clearQueueForUser(userId) {
  const db = await openDb();
  const t = db.transaction(QUEUE_STORE, "readwrite");
  const store = t.objectStore(QUEUE_STORE);
  const idx = store.index("userId");
  const req = idx.openCursor(IDBKeyRange.only(userId));
  req.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getQueueStats(userId, sessionId) {
  const items = await getQueueItems(userId, sessionId);
  const pending = items.filter((i) => i.status === "pending").length;
  const processing = items.filter((i) => i.status === "processing").length;
  const retry = items.filter((i) => i.status === "retry").length;
  const failed = items.filter((i) => i.status === "failed").length;
  return { total: items.length, pending, processing, retry, failed, items };
}

/**
 * Collapse redundant queue entries for the same note.
 * E.g. if a note was updated 3 times before sync, keep only the latest.
 * Create actions are never collapsed (they must execute once).
 */
export async function collapseQueue(userId, sessionId) {
  const items = await getQueueItems(userId, sessionId);
  const toRemove = [];
  const seen = new Map(); // noteId:type -> latest queue entry

  const collapsible = new Set(["update", "patch"]);

  // Process in chronological order
  const sorted = items.sort((a, b) => a.createdAt - b.createdAt);
  for (const item of sorted) {
    if (item.status === "processing") continue; // don't touch in-flight items
    if (!collapsible.has(item.type)) continue;

    const key = `${item.noteId}:${item.type}`;
    if (seen.has(key)) {
      const older = seen.get(key);
      // Merge older payload INTO the newer item so no fields are lost.
      // Newer fields win (spread order: older first, newer overwrites).
      item.payload = { ...(older.payload || {}), ...(item.payload || {}) };
      toRemove.push(older.queueId);
    }
    seen.set(key, item);
  }

  if (toRemove.length > 0) {
    // Build the set of survivors that need their merged payload persisted.
    // IMPORTANT: only update items that are NOT being removed — intermediate
    // items appear in both toRemove and would get recreated by store.put().
    const removeSet = new Set(toRemove);
    const survivors = [];
    for (const item of seen.values()) {
      if (!removeSet.has(item.queueId)) {
        survivors.push(item);
      }
    }

    const db = await openDb();
    const t = db.transaction(QUEUE_STORE, "readwrite");
    const store = t.objectStore(QUEUE_STORE);
    for (const id of toRemove) {
      store.delete(id);
    }
    for (const item of survivors) {
      store.put(item);
    }
  }

  return toRemove.length;
}

/**
 * Check if a note has pending local changes in the queue for a given session.
 */
export async function hasPendingChanges(noteId, userId, sessionId) {
  const store = await tx(QUEUE_STORE);
  return new Promise((resolve, reject) => {
    const req = store.index("noteId").getAll(noteId);
    req.onsuccess = () => {
      const items = (req.result || []).filter(
        (i) => i.userId === userId && i.sessionId === sessionId &&
          (i.status === "pending" || i.status === "processing" || i.status === "retry" || i.status === "failed")
      );
      resolve(items.length > 0);
    };
    req.onerror = () => reject(req.error);
  });
}
