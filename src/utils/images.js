// Client-side image processing: compression of uploads, square icons and
// the login background's placeholders.
import { encode as blurhashEncode } from "blurhash";

function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
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
  const img = await loadImage(dataUrl);
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

/** Square PNG icon: the source image is contain-fitted, centred, on a
 *  solid background tile (transparent when `bg` is null). The PWA manifest
 *  icon uses the defaults, so it reads well as both a regular and a
 *  maskable home-screen icon; `pad` is the fraction of the canvas left as
 *  margin on each side (maskable safe-zone). */
export async function makeSquarePngIcon(dataUrl, size = 512, bg = "#ffffff", pad = 0.12) {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
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
    const img = await loadImage(dataUrl);
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
