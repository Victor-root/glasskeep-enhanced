// Files attached to a note: what the interface needs to show them and the
// calls that move them. See server/attachments/attachmentStore.js.
import { api, API_BASE, getAuth, getClientId } from "./api.js";
import { t } from "../i18n";

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  const [b, kb, mb, gb] = t("fileSizeUnits").split(",");
  if (bytes < KB) return `${bytes} ${b}`;
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / KB))} ${kb}`;
  const [value, unit] = bytes < GB ? [bytes / MB, mb] : [bytes / GB, gb];
  const shown = value.toLocaleString(document.documentElement.lang || undefined, { maximumFractionDigits: value >= 10 ? 0 : 1 });
  return `${shown} ${unit}`;
}

// Families shown with their own colour on the file's tile.
const FAMILY_BY_EXTENSION = {
  pdf: ["pdf"],
  doc: ["doc", "docx", "odt", "rtf", "pages"],
  sheet: ["xls", "xlsx", "ods", "csv", "tsv", "numbers"],
  slides: ["ppt", "pptx", "odp", "key"],
  archive: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz"],
  text: ["txt", "md", "log", "json", "xml", "yml", "yaml", "ini", "conf"],
  code: ["js", "ts", "jsx", "tsx", "py", "sh", "c", "cpp", "h", "java", "kt", "rs", "go", "html", "css", "sql"],
  image: ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "heic", "svg", "tiff"],
  audio: ["mp3", "wav", "flac", "ogg", "m4a", "aac", "opus"],
  video: ["mp4", "mkv", "mov", "avi", "webm", "m4v"],
};

export function fileExtension(name) {
  const match = /\.([a-z0-9]{1,8})$/i.exec(String(name || ""));
  return match ? match[1].toLowerCase() : "";
}

export function fileFamily({ name, mime }) {
  const ext = fileExtension(name);
  for (const [family, extensions] of Object.entries(FAMILY_BY_EXTENSION)) {
    if (extensions.includes(ext)) return family;
  }
  const type = String(mime || "").split("/")[0];
  return ["image", "audio", "video", "text"].includes(type) ? type : "file";
}

// What a tap opens in place, rather than saving it. SVG stays out: the
// server only ever hands it over as a download.
const VIEWABLE_IMAGES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp"]);
export const isViewableImage = (attachment) => VIEWABLE_IMAGES.has(attachment.mime);
export const opensInBrowser = (attachment) => attachment.mime === "application/pdf" || attachment.mime === "text/plain";

const THUMB_SIZE = 160;
const THUMB_QUALITY = 0.72;

// A small JPEG of an image file for its tile, or null for anything else or
// anything the browser can't decode.
export async function createThumbnail(file) {
  if (!isViewableImage({ mime: file.type })) return null;
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, THUMB_SIZE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", THUMB_QUALITY);
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

const token = () => getAuth()?.token;

// XMLHttpRequest rather than fetch: only it reports upload progress. Rejects
// with { status } so the caller can tell a refusal from a lost connection
// (status 0). Sent as a raw body: see the upload route.
export function sendFile({ noteId, id, blob, name, mime, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/notes/${encodeURIComponent(noteId)}/attachments`);
    xhr.setRequestHeader("Authorization", `Bearer ${token()}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-Client-Id", getClientId());
    xhr.setRequestHeader("X-Attachment-Id", id);
    xhr.setRequestHeader("X-Attachment-Name", encodeURIComponent(name));
    xhr.setRequestHeader("X-Attachment-Type", mime || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* a proxy's own error page */ }
      if (xhr.status >= 200 && xhr.status < 300 && body?.attachment) resolve(body.attachment);
      else reject({ status: xhr.status, error: body?.error, maxBytes: body?.maxBytes });
    };
    xhr.onerror = () => reject({ status: 0 });
    xhr.onabort = () => reject({ status: 0, aborted: true });
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

export const setAttachmentThumb = (noteId, id, thumb) =>
  api(`/notes/${encodeURIComponent(noteId)}/attachments/${encodeURIComponent(id)}`, {
    method: "PATCH", token: token(), body: { thumb },
  });

export const deleteAttachment = (noteId, id) =>
  api(`/notes/${encodeURIComponent(noteId)}/attachments/${encodeURIComponent(id)}`, {
    method: "DELETE", token: token(),
  });

export const getAttachmentConfig = () => api("/attachments/config", { token: token() });

// A short-lived signed address of the file, absolute: it also leaves the
// page for the system's download manager.
export async function attachmentLink(noteId, id, { inline = false } = {}) {
  const { url } = await api(`/notes/${encodeURIComponent(noteId)}/attachments/${encodeURIComponent(id)}/link`, {
    method: "POST", token: token(), body: { inline },
  });
  return new URL(url, window.location.origin).href;
}

// A plain link click: the browser, or the Android app's download listener,
// takes it from there.
export function saveFromLink(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
