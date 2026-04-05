import { t } from "../i18n";

/** ---------- Utils ---------- */
export const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const sanitizeFilename = (name, fallback = "note") =>
  (name || fallback)
    .toString()
    .trim()
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .slice(0, 64);

export const downloadText = (filename, content) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const downloadDataUrl = async (filename, dataUrl) => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Download arbitrary blob
export const triggerBlobDownload = (filename, blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
export const imageExtFromDataURL = (dataUrl) => {
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

/** Format "Edited" text */
export function formatEditedStamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();

  const sameYMD = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const timeStr = d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (sameYMD(d, now)) return `${t("todayLabel")}, ${timeStr}`;
  const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameYMD(d, yest)) return `${t("yesterdayLabel")}, ${timeStr}`;

  const month = d.toLocaleString([], { month: "short" });
  const day = d.getDate();
  if (d.getFullYear() === now.getFullYear()) return `${day} ${month}`;
  const yyyy = String(d.getFullYear());
  return `${day} ${month} ${yyyy}`;
}

/** ---------- Image compression (client) ---------- */
export async function fileToCompressedDataURL(file, maxDim = 1600, quality = 0.85) {
  /* Detect alpha support from MIME type AND filename extension */
  const alphaTypes = ["image/png", "image/webp", "image/gif", "image/avif"];
  const alphaExts = /\.(png|webp|gif|avif)$/i;
  const hasAlphaHint = alphaTypes.includes(file.type) || alphaExts.test(file.name || "");

  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d", { alpha: true });
  /* Start from a fully transparent canvas */
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  /* If alpha hint matched, check actual pixel data for real transparency */
  if (hasAlphaHint) {
    const pixelData = ctx.getImageData(0, 0, targetW, targetH).data;
    let hasRealAlpha = false;
    for (let i = 3; i < pixelData.length; i += 4) {
      if (pixelData[i] < 254) { hasRealAlpha = true; break; }
    }
    if (hasRealAlpha) return canvas.toDataURL("image/png");
  }
  return canvas.toDataURL("image/jpeg", quality);
}
