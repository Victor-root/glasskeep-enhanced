// src/sync/localDb.js
// IndexedDB wrapper for local-first note storage and sync queue

const DB_NAME = "glasskeep";
const DB_VERSION = 1;
const NOTES_STORE = "notes";
const QUEUE_STORE = "syncQueue";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        const ns = db.createObjectStore(NOTES_STORE, { keyPath: "id" });
        ns.createIndex("user_id", "user_id", { unique: false });
        ns.createIndex("archived", "archived", { unique: false });
        ns.createIndex("trashed", "trashed", { unique: false });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const qs = db.createObjectStore(QUEUE_STORE, { keyPath: "queueId", autoIncrement: true });
        qs.createIndex("noteId", "noteId", { unique: false });
        qs.createIndex("status", "status", { unique: false });
        qs.createIndex("createdAt", "createdAt", { unique: false });
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
    status: "pending", // pending | processing | failed
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

export async function getQueueItems() {
  const store = await tx(QUEUE_STORE);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingQueue() {
  const store = await tx(QUEUE_STORE);
  return new Promise((resolve, reject) => {
    const req = store.index("status").getAll("pending");
    req.onsuccess = () => {
      const items = req.result || [];
      // Also get failed items for retry
      const req2 = store.index("status").getAll("failed");
      req2.onsuccess = () => {
        const failed = req2.result || [];
        resolve([...items, ...failed].sort((a, b) => a.createdAt - b.createdAt));
      };
      req2.onerror = () => resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
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

export async function clearQueue() {
  const store = await tx(QUEUE_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getQueueStats() {
  const items = await getQueueItems();
  const pending = items.filter((i) => i.status === "pending").length;
  const processing = items.filter((i) => i.status === "processing").length;
  const failed = items.filter((i) => i.status === "failed").length;
  return { total: items.length, pending, processing, failed, items };
}

/**
 * Collapse redundant queue entries for the same note.
 * E.g. if a note was updated 3 times before sync, keep only the latest.
 * Create actions are never collapsed (they must execute once).
 */
export async function collapseQueue() {
  const items = await getQueueItems();
  const toRemove = [];
  const toUpdate = []; // items whose payload needs merging
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
      toUpdate.push(item);
    }
    seen.set(key, item);
  }

  if (toRemove.length > 0 || toUpdate.length > 0) {
    const db = await openDb();
    const t = db.transaction(QUEUE_STORE, "readwrite");
    const store = t.objectStore(QUEUE_STORE);
    for (const id of toRemove) {
      store.delete(id);
    }
    for (const item of toUpdate) {
      store.put(item);
    }
  }

  return toRemove.length;
}

/**
 * Check if a note has pending local changes in the queue.
 */
export async function hasPendingChanges(noteId) {
  const store = await tx(QUEUE_STORE);
  return new Promise((resolve, reject) => {
    const req = store.index("noteId").getAll(noteId);
    req.onsuccess = () => {
      const items = (req.result || []).filter(
        (i) => i.status === "pending" || i.status === "processing" || i.status === "failed"
      );
      resolve(items.length > 0);
    };
    req.onerror = () => reject(req.error);
  });
}
