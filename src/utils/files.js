// Files in and out of the browser: safe file names, downloads (through the
// Android app's native bridge when present) and the lazily loaded JSZip.
import { t } from "../i18n";

/** Saves a blob through a temporary download link (browsers; the Android
 *  WebView goes through its saveBlobFile bridge instead). */
export function saveBlobViaLink(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const sanitizeFilename = (name, fallback = "note") =>
  (name || fallback)
    .toString()
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .slice(0, 64);

export const downloadText = (filename, content) => {
  // Android WebView: pass directly to native bridge (blob: URLs get revoked before the download listener can fetch them)
  if (window.AndroidTheme?.saveBlobFile) {
    const base64 = btoa(unescape(encodeURIComponent(content)));
    window.AndroidTheme.saveBlobFile(base64, filename, "text/plain");
    return;
  }
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  saveBlobViaLink(filename, blob);
};

export const downloadDataUrl = async (filename, dataUrl) => {
  // Android WebView: extract base64 from data URL and pass to native bridge
  if (window.AndroidTheme?.saveBlobFile && dataUrl.startsWith("data:")) {
    const [header, b64] = dataUrl.split(",");
    const mime = (header.match(/data:([^;]+)/)?.[1]) || "application/octet-stream";
    window.AndroidTheme.saveBlobFile(b64, filename, mime);
    return;
  }
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  saveBlobViaLink(filename, blob);
};

// Download arbitrary blob
export const triggerBlobDownload = async (filename, blob) => {
  // Android WebView: convert blob to base64 and pass to native bridge
  if (window.AndroidTheme?.saveBlobFile) {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    window.AndroidTheme.saveBlobFile(base64, filename, blob.type || "application/octet-stream");
    return;
  }
  saveBlobViaLink(filename, blob);
};

// Lazy-load JSZip for generating ZIP files client-side
export async function ensureJSZip() {
  if (window.JSZip) return window.JSZip;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(t("failedLoadJszip")));
    document.head.appendChild(s);
  });
  if (!window.JSZip) throw new Error(t("jszipNotAvailable"));
  return window.JSZip;
}

// --- Image filename helpers (fix double extensions) ---
const imageExtFromDataURL = (dataUrl) => {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(dataUrl || "");
  const mime = (m?.[1] || "image/jpeg").toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
};
export const normalizeImageFilename = (name, dataUrl, index = 1) => {
  const base = sanitizeFilename(name && name.trim() ? name : `image-${index}`);
  const withoutExt = base.replace(/\.[^.]+$/, "");
  const ext = imageExtFromDataURL(dataUrl);
  return `${withoutExt}.${ext}`;
};
