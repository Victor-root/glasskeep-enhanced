import { t } from "../i18n";
import { encode as blurhashEncode } from "blurhash";

/** ---------- Utils ---------- */
export const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** App-chrome status-bar colours. Shared so the value can't drift across
 *  callers: App.jsx sets these on load / dark-toggle, and NoteModal restores
 *  them when a note closes (it overrides with the open note's colour meanwhile).
 *  MUST match the --gk-statusbar CSS variable in globalCSS (which also paints
 *  the flat mobile header), light and dark respectively. */
export const STATUS_BAR_LIGHT = "#dce1fb";
export const STATUS_BAR_DARK = "#171f30";

/** Current shell status-bar colour, read from the live --gk-statusbar token so
 *  it follows the active workspace theme AND dark mode automatically. Falls
 *  back to the GlassKeep constants if the stylesheet isn't mounted yet (the
 *  token resolves to empty), so early callers still get a sensible colour. */
export function currentStatusBarColor() {
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--gk-statusbar")
      .trim();
    if (v) return v;
  } catch (_) {
    /* getComputedStyle unavailable — fall through */
  }
  return document.documentElement.classList.contains("dark")
    ? STATUS_BAR_DARK
    : STATUS_BAR_LIGHT;
}

/** Whatever theme-color is live right now — a modal's own override or the
 *  shell default, whichever last called setThemeColor — read straight from
 *  the meta tag rather than recomputed, so a caller can restore exactly
 *  what was there before it took over (e.g. a modal opened on top of an
 *  already-colored NoteModal). Null if the tag isn't mounted yet. */
export function currentThemeColor() {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || null;
}

/** Update PWA status bar color by removing and re-creating the meta tag */
export function setThemeColor(color) {
  const old = document.querySelector('meta[name="theme-color"]');
  if (old) old.remove();
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.setAttribute("content", color);
  document.head.appendChild(meta);
  // Direct call to Android WebView bridge (bypasses MutationObserver)
  try { window.AndroidTheme?.onThemeColor(color); } catch (_) {}
}

export const sanitizeFilename = (name, fallback = "note") =>
  (name || fallback)
    .toString()
    .trim()
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .slice(0, 64);

export const downloadText = (filename, content) => {
  // Android WebView: pass directly to native bridge (blob: URLs get revoked before the download listener can fetch them)
  if (window.AndroidTheme?.saveBlobFile) {
    const base64 = btoa(unescape(encodeURIComponent(content)));
    window.AndroidTheme.saveBlobFile(base64, filename, "text/plain");
    return;
  }
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
  // Android WebView: extract base64 from data URL and pass to native bridge
  if (window.AndroidTheme?.saveBlobFile && dataUrl.startsWith("data:")) {
    const [header, b64] = dataUrl.split(",");
    const mime = (header.match(/data:([^;]+)/)?.[1]) || "application/octet-stream";
    window.AndroidTheme.saveBlobFile(b64, filename, mime);
    return;
  }
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

/** Square PNG app icon (for the PWA manifest): the source image is
 *  contain-fitted, centred, on a solid background tile, so it reads well
 *  as both a regular and a maskable home-screen icon. `pad` is the
 *  fraction of the canvas left as margin on each side (maskable safe-zone). */
export async function makeSquarePngIcon(dataUrl, size = 512, bg = "#ffffff", pad = 0.12) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  const inner = size * (1 - 2 * pad);
  const scale = Math.min(inner / img.width, inner / img.height);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  ctx.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
  return canvas.toDataURL("image/png");
}

/** Derive the two tiny placeholders for a login-background image (a data
 *  URL): its mean colour (#rrggbb) and a BlurHash string (~30 chars). The
 *  login page paints the colour, then the decoded BlurHash, then fades in
 *  the real image — so there's never a flash of the default backdrop, even
 *  on a cold load. Both outputs are a few bytes, so unlike the image itself
 *  they can be inlined in the page / cached cheaply. Returns
 *  { color, hash }, or null if the image can't be read. */
export async function deriveBackgroundPlaceholders(dataUrl) {
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    // Downscale to a small box: BlurHash only needs a coarse sample and the
    // mean colour is resolution-independent, so this keeps encode() fast on
    // large uploads. Guard against a zero dimension on odd images.
    const maxDim = 64;
    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    const w = Math.max(1, Math.round((img.width || 1) * scale));
    const h = Math.max(1, Math.round((img.height || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    // Mean colour across every pixel.
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
    }
    const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
    const color = `#${hex(r)}${hex(g)}${hex(b)}`;

    // 4×3 components — the sweet spot (enough to recognise the image, still
    // a ~30-char string), the same the BlurHash authors recommend.
    const hash = blurhashEncode(data, w, h, 4, 3);
    return { color, hash };
  } catch {
    return null;
  }
}
