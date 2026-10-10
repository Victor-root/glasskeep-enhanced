// Google Keep import (Google Takeout): expands the Takeout .zip and turns
// each Keep .json into a GlassKeep note, with its attached images embedded.
import { uid } from "./ids.js";
import { ensureJSZip } from "./files.js";
import { fileToCompressedDataURL } from "./images.js";
import { plainTextToRichDoc, serializeRichContent } from "./richText.js";

// Google Keep persists colours as a fixed enum; GlassKeep uses its own
// palette. Map each enum to the closest swatch we ship so the imported
// note keeps its colour identity. Anything we don't recognise falls
// back to "default".
const GKEEP_COLOR_MAP = {
  DEFAULT: "default",
  WHITE:   "default",
  RED:     "red",
  ORANGE:  "peach",
  YELLOW:  "yellow",
  GREEN:   "green",
  TEAL:    "mint",
  BLUE:    "blue",
  GRAY:    "default",
  CERULEAN:"sky",
  PURPLE:  "purple",
  PINK:    "mauve",
  BROWN:   "sand",
};

export const GKEEP_IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i;
const GKEEP_MIME_FROM_EXT = (lower) =>
  lower.endsWith(".png")  ? "image/png"  :
  lower.endsWith(".gif")  ? "image/gif"  :
  lower.endsWith(".webp") ? "image/webp" :
  lower.endsWith(".bmp")  ? "image/bmp"  :
  lower.endsWith(".heic") ? "image/heic" :
  lower.endsWith(".heif") ? "image/heif" :
                            "image/jpeg";

/** Expand any .zip files in a flat file list into the JSON / image entries
 *  they contain. Non-zip files pass through untouched. Tailored to Google
 *  Takeout structures (entries live under Takeout/Keep/), filters by
 *  extension only, so re-zipped Keep folders without the parent path also
 *  work. JSZip blobs are wrapped back into File objects so the rest of the
 *  importer can treat them like a native FileList selection. */
export async function expandGkeepZips(files) {
  const zips = files.filter(
    (f) => f.name.toLowerCase().endsWith(".zip") || (f.type || "").includes("zip"),
  );
  if (!zips.length) return files;
  const out = files.filter((f) => !zips.includes(f));
  const JSZip = await ensureJSZip();
  for (const zf of zips) {
    try {
      const zip = await JSZip.loadAsync(zf);
      const entries = Object.values(zip.files);
      for (const entry of entries) {
        if (entry.dir) continue;
        const lower = entry.name.toLowerCase();
        const isJsonEntry = lower.endsWith(".json");
        const isImageEntry = GKEEP_IMAGE_EXT.test(lower);
        if (!isJsonEntry && !isImageEntry) continue;
        const baseName = entry.name.split("/").pop() || entry.name;
        const mime = isJsonEntry ? "application/json" : GKEEP_MIME_FROM_EXT(lower);
        const blob = await entry.async("blob");
        out.push(new File([blob], baseName, { type: mime }));
      }
    } catch (e) {
      console.warn("[gkeep] zip expansion failed", zf.name, e?.message);
    }
  }
  return out;
}

/** Note built from one parsed Keep .json, or null when the object isn't a
 *  Keep note. `imageByName` maps lower-cased image file names to the image
 *  files selected with it, for the note's attachments. */
export async function keepNoteFromJson(obj, imageByName) {
  if (!obj || typeof obj !== "object") return null;
  // Soft filter: a Takeout .zip can include non-Keep JSONs from
  // other products (Drive, Calendar, …). Skip anything that
  // doesn't look like a Keep note shape.
  const looksLikeKeepNote =
    "title" in obj || "textContent" in obj ||
    "listContent" in obj || "attachments" in obj ||
    "labels" in obj || "userEditedTimestampUsec" in obj ||
    "createdTimestampUsec" in obj;
  if (!looksLikeKeepNote) return null;
  const title = String(obj.title || "");
  const hasChecklist =
    Array.isArray(obj.listContent) && obj.listContent.length > 0;
  // Google Takeout's listContent entries only ever carry `text` and
  // `isChecked` (verified against real Takeout exports, JSON and
  // HTML alike): Google does not export which items are indented
  // under another. There is nothing to read here, so imported items
  // stay flat; normalizeItems already treats a missing `indent` as
  // 0, which matches reality for this source.
  const items = hasChecklist
    ? obj.listContent.map((it) => ({
        id: uid(),
        text: String(it?.text || ""),
        done: !!it?.isChecked,
      }))
    : [];
  // Google Keep's textContent is always plain text, never
  // Markdown: using marked() here would join single \n line
  // breaks and collapse \n\n blank-line separators. The
  // dedicated plain-text converter preserves both.
  const content = hasChecklist
    ? ""
    : serializeRichContent(plainTextToRichDoc(String(obj.textContent || "")));
  const usec = Number(
    obj.userEditedTimestampUsec || obj.createdTimestampUsec || 0,
  );
  const ms =
    Number.isFinite(usec) && usec > 0
      ? Math.floor(usec / 1000)
      : Date.now();
  const timestamp = new Date(ms).toISOString();
  // Extract labels to tags
  const tags = Array.isArray(obj.labels)
    ? obj.labels
        .map((l) => (typeof l?.name === "string" ? l.name.trim() : ""))
        .filter(Boolean)
    : [];
  // Resolve attachments → embedded data URLs. The .json only
  // references images by filePath; we look each up in the
  // image-file lookup the user provided in the same selection.
  const images = [];
  if (Array.isArray(obj.attachments)) {
    for (const att of obj.attachments) {
      const path = typeof att?.filePath === "string" ? att.filePath : "";
      if (!path) continue;
      const base = (path.split("/").pop() || path).toLowerCase();
      const img = imageByName.get(base);
      if (!img) continue;
      try {
        const src = await fileToCompressedDataURL(img);
        images.push({ id: uid(), src, name: img.name });
      } catch (e) {
        console.warn("[gkeep] image compress failed", path, e?.message);
      }
    }
  }
  // Map Google Keep's colour enum to the closest GlassKeep
  // swatch (UPPERCASE-insensitive on the input).
  const color =
    typeof obj.color === "string"
      ? GKEEP_COLOR_MAP[obj.color.toUpperCase()] || "default"
      : "default";
  return {
    id: uid(),
    type: hasChecklist ? "checklist" : "text",
    title,
    content,
    items,
    tags,
    images,
    color,
    pinned: !!obj.isPinned,
    position: ms,
    timestamp,
  };
}
