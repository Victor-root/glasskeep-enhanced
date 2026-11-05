// The files on their way to the server. One queue for the whole app, outside
// React: an upload outlives the note that started it being closed, and its
// bytes outlive the page itself, in IndexedDB, so a file picked offline or
// cut off midway goes out once the connection is back.
import { deleteUpload, getUploads, putUpload } from "./localDb.js";
import { sendFile, setAttachmentThumb } from "../utils/attachments.js";
import { localizeServerError } from "../utils/serverErrors.js";
import { t } from "../i18n";

const RETRY_MS = 15000;
// The note a file belongs to can still be in the sync queue: a brand new
// note reaches the server after a moment, or much later when offline.
const NOTE_PENDING_RETRY_MS = 2000;
const NOTE_PENDING_ATTEMPTS = 30;

let items = [];
let listeners = new Set();
let userId = null;
let onUploaded = null;
let running = null;
let retryTimer = null;

const publish = () => {
  items = [...items];
  listeners.forEach((listener) => listener());
};
const update = (id, patch) => {
  items = items.map((item) => (item.id === id ? { ...item, ...patch } : item));
  listeners.forEach((listener) => listener());
};
const drop = (id) => {
  items = items.filter((item) => item.id !== id);
  publish();
  deleteUpload(id).catch(() => {});
};

export const subscribeUploads = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getUploadItems = () => items;
export const hasUploadsFor = (noteId) => items.some((item) => item.noteId === String(noteId));

function failureMessage(failure) {
  if (failure.status === 413) return t("attachmentTooLarge");
  return localizeServerError(failure.error, "attachmentUploadFailed");
}

function scheduleRetry(delay) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(pump, delay);
}

async function upload(item) {
  const abort = new AbortController();
  running = { id: item.id, abort };
  update(item.id, { status: "uploading", progress: 0 });
  try {
    const attachment = await sendFile({
      noteId: item.noteId,
      id: item.id,
      blob: item.blob,
      name: item.name,
      mime: item.mime,
      signal: abort.signal,
      onProgress: (progress) => update(item.id, { progress }),
    });
    if (item.thumb) {
      await setAttachmentThumb(item.noteId, item.id, item.thumb).catch(() => {});
      attachment.thumb = item.thumb;
    }
    onUploaded?.(item.noteId, attachment);
    drop(item.id);
    return 0;
  } catch (failure) {
    if (failure.aborted && !items.some((i) => i.id === item.id)) return 0;
    if (failure.status === 404 && item.attempts < NOTE_PENDING_ATTEMPTS) {
      update(item.id, { status: "waiting", attempts: item.attempts + 1 });
      return NOTE_PENDING_RETRY_MS;
    }
    if (failure.status === 0 || failure.status === 423 || failure.status >= 500) {
      update(item.id, { status: "waiting", progress: 0 });
      return RETRY_MS;
    }
    update(item.id, { status: "failed", error: failureMessage(failure) });
    deleteUpload(item.id).catch(() => {});
    return 0;
  } finally {
    running = null;
  }
}

async function pump() {
  if (running || !userId) return;
  // No check of navigator.onLine: it says nothing about a server on the
  // local network. The attempt itself is the only honest answer.
  for (;;) {
    const now = Date.now();
    const next = items.find((item) => (item.status === "queued" || item.status === "waiting") && !(item.notBefore > now));
    if (!next) break;
    const wait = await upload(next);
    if (wait) update(next.id, { notBefore: Date.now() + wait });
  }
  const pending = items.filter((item) => item.notBefore > Date.now()).map((item) => item.notBefore);
  if (pending.length) scheduleRetry(Math.min(...pending) - Date.now());
}

// Adds a file. `file` is a File; `thumb` its tile, when it has one.
export function queueUpload(noteId, file, id, thumb) {
  const item = {
    id,
    noteId: String(noteId),
    userId,
    name: file.name,
    mime: file.type,
    size: file.size,
    thumb,
    blob: file,
    createdAt: Date.now(),
    status: "queued",
    progress: 0,
    attempts: 0,
  };
  items = [...items, item];
  publish();
  // A fresh object: an IndexedDB record cannot carry the transient state.
  const { status: _status, progress: _progress, attempts: _attempts, ...record } = item;
  putUpload(record).catch(() => { /* out of space: it still goes out while the page lives */ });
  pump();
}

export function cancelUpload(id) {
  if (running?.id === id) {
    const { abort } = running;
    items = items.filter((item) => item.id !== id);
    publish();
    deleteUpload(id).catch(() => {});
    abort.abort();
    return;
  }
  drop(id);
}

export function retryUpload(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  update(id, { status: "queued", error: null, attempts: 0, notBefore: 0 });
  putUpload({
    id: item.id, noteId: item.noteId, userId: item.userId, name: item.name, mime: item.mime,
    size: item.size, thumb: item.thumb, blob: item.blob, createdAt: item.createdAt,
  }).catch(() => {});
  pump();
}

// Called with the signed-in user: brings back what an earlier session left.
export async function startUploads(user, uploaded) {
  userId = user;
  onUploaded = uploaded;
  const stored = await getUploads(user).catch(() => []);
  const known = new Set(items.map((item) => item.id));
  items = [
    ...items,
    ...stored.filter((u) => !known.has(u.id)).map((u) => ({ ...u, status: "queued", progress: 0, attempts: 0 })),
  ];
  publish();
  pump();
}

export function stopUploads() {
  running?.abort.abort();
  clearTimeout(retryTimer);
  userId = null;
  onUploaded = null;
  items = [];
  publish();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    items.forEach((item) => item.notBefore && update(item.id, { notBefore: 0 }));
    pump();
  });
}
