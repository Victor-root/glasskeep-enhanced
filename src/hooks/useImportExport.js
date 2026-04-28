import { useCallback } from "react";
import { api } from "../utils/api.js";
import { uid, sanitizeFilename, downloadText, fileToCompressedDataURL, ensureJSZip } from "../utils/helpers.js";
import { t } from "../i18n";
import { localizeServerError } from "../utils/serverErrors.js";
import {
  isRichContent,
  legacyMarkdownToRichDoc,
  plainTextToRichDoc,
  serializeRichContent,
} from "../utils/richText.js";

// Normalise any inbound text note `content` (plain string, Markdown, or
// already-rich envelope) into our current rich-JSON envelope string. Keeps
// imported notes consistent with new ones while still accepting older exports.
function ensureRichContent(raw) {
  if (typeof raw !== "string") return serializeRichContent(legacyMarkdownToRichDoc(""));
  if (isRichContent(raw)) return raw;
  return serializeRichContent(legacyMarkdownToRichDoc(raw));
}

/**
 * Build the post-import success message based on the server's
 * imported/skipped breakdown. The server now dedupes by
 * (type|title|body) so a re-import of the same file won't multiply
 * notes; surface that to the user via the message variant matching
 * the situation.
 *
 * @param {object} result      server response { imported, skipped }
 * @param {number} attempted   how many notes the client sent
 * @param {string} successKey  i18n key used when nothing was skipped
 *                             ("importedNotesSuccessfully", etc.)
 */
function buildImportMessage(result, attempted, successKey) {
  const imported = Number(result?.imported);
  const skipped = Number(result?.skipped);
  const importedSafe = Number.isFinite(imported) ? imported : attempted;
  const skippedSafe = Number.isFinite(skipped) ? skipped : 0;
  if (skippedSafe > 0 && importedSafe === 0) {
    return t("importAllSkipped").replace("{skipped}", String(skippedSafe));
  }
  if (skippedSafe > 0) {
    return t("importedWithSkipped")
      .replace("{count}", String(importedSafe))
      .replace("{skipped}", String(skippedSafe));
  }
  return t(successKey).replace("{count}", String(importedSafe));
}

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

const GKEEP_IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i;
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
 *  Takeout structures (entries live under Takeout/Keep/) — filters by
 *  extension only, so re-zipped Keep folders without the parent path also
 *  work. JSZip blobs are wrapped back into File objects so the rest of the
 *  importer can treat them like a native FileList selection. */
async function expandGkeepZips(files) {
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

/**
 * Hook encapsulating import/export actions and secret key download.
 * Purely mechanical extraction from App — same flows, same behavior.
 */
export default function useImportExport(token, { currentUser, loadNotes }) {
  const triggerJSONDownload = (filename, jsonText) => {
    const blob = new Blob([jsonText], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportAll = async () => {
    try {
      const payload = await api("/notes/export", { token });
      const json = JSON.stringify(payload, null, 2);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const fname =
        sanitizeFilename(
          `glass-keep-notes-${currentUser?.email || "user"}-${ts}`,
        ) + ".json";
      triggerJSONDownload(fname, json);
    } catch (e) {
      alert(localizeServerError(e.message, "exportFailed"));
    }
  };

  const importAll = async (fileList) => {
    try {
      if (!fileList || !fileList.length) return;
      const file = fileList[0];
      const text = await file.text();
      const parsed = JSON.parse(text);
      const notesArr = Array.isArray(parsed?.notes)
        ? parsed.notes
        : Array.isArray(parsed)
          ? parsed
          : [];
      if (!notesArr.length) {
        alert(t("noNotesFoundInFile"));
        return;
      }
      // Upgrade text-note content to the rich-JSON envelope so older JSON
      // exports (which store Markdown strings) come in as first-class rich
      // notes — no legacy branch needed for imported data.
      const upgraded = notesArr.map((n) => {
        if (!n || n.type !== "text") return n;
        return { ...n, content: ensureRichContent(n.content) };
      });
      const result = await api("/notes/import", {
        method: "POST",
        token,
        body: { notes: upgraded },
      });
      await loadNotes();
      alert(buildImportMessage(result, notesArr.length, "importedNotesSuccessfully"));
    } catch (e) {
      alert(localizeServerError(e.message, "importFailed"));
    }
  };

  /** Import Google Keep notes.
   *
   *  Accepts any combination of:
   *    - the raw Google Takeout .zip (recommended — drop it as is and
   *      we expand its Keep/ folder transparently),
   *    - the loose .json metadata files,
   *    - the image attachments referenced by those JSONs.
   *
   *  JSON files become notes, image files are matched to each note's
   *  attachment.filePath and embedded as compressed data URLs. */
  const importGKeep = async (fileList) => {
    try {
      let files = Array.from(fileList || []);
      if (!files.length) return;

      // If the user selected one or more Takeout .zips, swap each in
      // place for the .json + image entries it contains.
      files = await expandGkeepZips(files);

      const isJson = (f) =>
        f.name.toLowerCase().endsWith(".json") ||
        (f.type || "").includes("json");
      const isImage = (f) =>
        (f.type || "").startsWith("image/") ||
        GKEEP_IMAGE_EXT.test(f.name);
      const jsonFiles = files.filter(isJson);
      const imageFiles = files.filter(isImage);
      if (!jsonFiles.length) {
        alert(t("noValidGoogleKeepNotesFound"));
        return;
      }
      // Filename → File lookup so attachment.filePath references in
      // each .json can resolve to a real Blob. Lower-cased for
      // case-insensitive matches across filesystems.
      const imageByName = new Map();
      for (const img of imageFiles) {
        imageByName.set(img.name.toLowerCase(), img);
      }

      const texts = await Promise.all(
        jsonFiles.map((f) => f.text().catch(() => null)),
      );
      const notesArr = [];
      for (const txt of texts) {
        if (!txt) continue;
        try {
          const obj = JSON.parse(txt);
          if (!obj || typeof obj !== "object") continue;
          // Soft filter: a Takeout .zip can include non-Keep JSONs from
          // other products (Drive, Calendar, …). Skip anything that
          // doesn't look like a Keep note shape.
          const looksLikeKeepNote =
            "title" in obj || "textContent" in obj ||
            "listContent" in obj || "attachments" in obj ||
            "labels" in obj || "userEditedTimestampUsec" in obj ||
            "createdTimestampUsec" in obj;
          if (!looksLikeKeepNote) continue;
          const title = String(obj.title || "");
          const hasChecklist =
            Array.isArray(obj.listContent) && obj.listContent.length > 0;
          const items = hasChecklist
            ? obj.listContent.map((it) => ({
                id: uid(),
                text: String(it?.text || ""),
                done: !!it?.isChecked,
              }))
            : [];
          // Google Keep's textContent is always plain text, never
          // Markdown — using marked() here would join single \n line
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
          notesArr.push({
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
          });
        } catch (e) {}
      }
      if (!notesArr.length) {
        alert(t("noValidGoogleKeepNotesFound"));
        return;
      }
      const result = await api("/notes/import", {
        method: "POST",
        token,
        body: { notes: notesArr },
      });
      await loadNotes();
      alert(buildImportMessage(result, notesArr.length, "importedGoogleKeepNotes"));
    } catch (e) {
      alert(localizeServerError(e.message, "googleKeepImportFailed"));
    }
  };

  /** Import Markdown files (multiple) */
  const importMd = async (fileList) => {
    try {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      const notesArr = [];

      for (const file of files) {
        try {
          const text = await file.text();
          const lines = text.split("\n");

          // Extract title from first line if it starts with #
          let title = "";
          let contentStartIndex = 0;

          if (lines[0] && lines[0].trim().startsWith("#")) {
            // Remove # symbols and trim
            title = lines[0].replace(/^#+\s*/, "").trim();
            contentStartIndex = 1;
          } else {
            // Use filename as title (without .md extension)
            title = file.name.replace(/\.md$/i, "");
          }

          // Join remaining lines as content
          const markdown = lines.slice(contentStartIndex).join("\n").trim();
          const content = serializeRichContent(legacyMarkdownToRichDoc(markdown));

          if (title || markdown) {
            notesArr.push({
              id: uid(),
              type: "text",
              title,
              content,
              items: [],
              tags: [],
              images: [],
              color: "default",
              pinned: false,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (e) {
          console.error(`Failed to process file ${file.name}:`, e);
        }
      }

      if (!notesArr.length) {
        alert(t("noValidMarkdownFilesFound"));
        return;
      }

      const result = await api("/notes/import", {
        method: "POST",
        token,
        body: { notes: notesArr },
      });
      await loadNotes();
      alert(buildImportMessage(result, notesArr.length, "importedMarkdownFilesSuccessfully"));
    } catch (e) {
      alert(localizeServerError(e.message, "markdownImportFailed"));
    }
  };

  /** Download secret recovery key */
  const downloadSecretKey = async () => {
    try {
      const data = await api("/secret-key", { method: "POST", token });
      if (!data?.key) throw new Error(t("secretKeyNotReturned"));
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const fname = `glass-keep-secret-key-${ts}.txt`;
      const content =
        `Glass Keep — Secret Recovery Key\n\n` +
        `Keep this key safe. Anyone with this key can sign in as you.\n\n` +
        `Secret Key:\n${data.key}\n\n` +
        `Instructions:\n` +
        `1) Go to the login page.\n` +
        `2) Click ${t("forgotUsernamePassword")}.\n` +
        `3) Choose "${t("signInWithSecretKey")}" and paste this key.\n`;
      downloadText(fname, content);
      alert(t("secretKeyDownloadedSafe"));
    } catch (e) {
      alert(localizeServerError(e.message, "couldNotGenerateSecretKey"));
    }
  };

  return {
    exportAll,
    importAll,
    importGKeep,
    importMd,
    downloadSecretKey,
  };
}
