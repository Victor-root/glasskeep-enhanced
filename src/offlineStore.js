// src/offlineStore.js
// IndexedDB-based offline storage for notes and sync queue.
// Provides robust local persistence that survives page refreshes and browser restarts.

const DB_NAME = "glasskeep-offline";
const DB_VERSION = 1;
const NOTES_STORE = "notes";
const SYNC_QUEUE_STORE = "syncQueue";
const META_STORE = "meta";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const qs = db.createObjectStore(SYNC_QUEUE_STORE, {
          keyPath: "queueId",
          autoIncrement: true,
        });
        qs.createIndex("noteId", "noteId", { unique: false });
        qs.createIndex("timestamp", "timestamp", { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function tx(storeName, mode = "readonly") {
  return openDB().then((db) => {
    const t = db.transaction(storeName, mode);
    return t.objectStore(storeName);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ──── Notes CRUD ────

export async function getAllNotes(userId) {
  const store = await tx(NOTES_STORE);
  const all = await reqToPromise(store.getAll());
  return all.filter((n) => String(n._userId) === String(userId));
}

export async function putNotes(notes, userId) {
  const db = await openDB();
  const t = db.transaction(NOTES_STORE, "readwrite");
  const store = t.objectStore(NOTES_STORE);
  for (const note of notes) {
    store.put({ ...note, _userId: String(userId) });
  }
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function putNote(note, userId) {
  const store = await tx(NOTES_STORE, "readwrite");
  return reqToPromise(store.put({ ...note, _userId: String(userId) }));
}

export async function deleteNote(noteId) {
  const store = await tx(NOTES_STORE, "readwrite");
  return reqToPromise(store.delete(String(noteId)));
}

export async function getNote(noteId) {
  const store = await tx(NOTES_STORE);
  return reqToPromise(store.get(String(noteId)));
}

export async function clearNotesForUser(userId) {
  const all = await getAllNotes(userId);
  const db = await openDB();
  const t = db.transaction(NOTES_STORE, "readwrite");
  const store = t.objectStore(NOTES_STORE);
  for (const n of all) {
    store.delete(n.id);
  }
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// ──── Sync Queue ────

/**
 * Action types:
 *  - create: { noteId, data }
 *  - update: { noteId, data }
 *  - delete: { noteId }
 *  - archive: { noteId, archived: bool }
 *  - trash: { noteId }
 *  - restore: { noteId }
 *  - permanentDelete: { noteId }
 *  - pin: { noteId, pinned: bool }
 */
export async function enqueueAction(action) {
  const store = await tx(SYNC_QUEUE_STORE, "readwrite");
  const entry = {
    ...action,
    timestamp: Date.now(),
  };
  return reqToPromise(store.add(entry));
}

export async function getAllQueuedActions() {
  const store = await tx(SYNC_QUEUE_STORE);
  return reqToPromise(store.getAll());
}

export async function getQueueLength() {
  const store = await tx(SYNC_QUEUE_STORE);
  return reqToPromise(store.count());
}

export async function removeQueuedAction(queueId) {
  const store = await tx(SYNC_QUEUE_STORE, "readwrite");
  return reqToPromise(store.delete(queueId));
}

export async function clearQueue() {
  const store = await tx(SYNC_QUEUE_STORE, "readwrite");
  return reqToPromise(store.clear());
}

// ──── Meta (last sync time, etc.) ────

export async function getMeta(key) {
  const store = await tx(META_STORE);
  const result = await reqToPromise(store.get(key));
  return result?.value ?? null;
}

export async function setMeta(key, value) {
  const store = await tx(META_STORE, "readwrite");
  return reqToPromise(store.put({ key, value }));
}
