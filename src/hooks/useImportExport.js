import { api } from "../utils/api.js";
import { uid, sanitizeFilename, downloadText } from "../utils/helpers.js";
import { t } from "../i18n";
import { localizeServerError } from "../utils/serverErrors.js";
import {
  isRichContent,
  legacyMarkdownToRichDoc,
  serializeRichContent,
} from "../utils/richText.js";
import { GKEEP_IMAGE_EXT, expandGkeepZips, keepNoteFromJson } from "../utils/googleKeepImport.js";

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
 * imported/updated/skipped breakdown. The server dedupes by
 * (type|title|body) so a re-import of the same file won't multiply
 * notes; when a note is already there but the file carries tags, a
 * colour or a pin it has since lost, the server restores those and
 * counts it as updated. All three outcomes are worth saying out loud:
 * a restore that only updates would otherwise report zero.
 *
 * @param {object} result      server response { imported, updated, skipped }
 * @param {number} attempted   how many notes the client sent
 * @param {string} successKey  i18n key used when nothing else happened
 *                             ("importedNotesSuccessfully", etc.)
 */
function buildImportMessage(result, attempted, successKey) {
  const imported = Number(result?.imported);
  const updated = Number(result?.updated);
  const skipped = Number(result?.skipped);
  const importedSafe = Number.isFinite(imported) ? imported : attempted;
  const updatedSafe = Number.isFinite(updated) ? updated : 0;
  const skippedSafe = Number.isFinite(skipped) ? skipped : 0;

  const base =
    skippedSafe > 0 && importedSafe === 0
      ? t("importAllSkipped").replace("{skipped}", String(skippedSafe))
      : skippedSafe > 0
        ? t("importedWithSkipped")
          .replace("{count}", String(importedSafe))
          .replace("{skipped}", String(skippedSafe))
        : t(successKey).replace("{count}", String(importedSafe));

  const withUpdated =
    updatedSafe === 0
      ? base
      : importedSafe === 0 && skippedSafe === 0
        ? t("importAllUpdated").replace("{updated}", String(updatedSafe))
        : `${base} ${t("importAlsoUpdated").replace("{updated}", String(updatedSafe))}`;

  // A rejected note is lost data, not a duplicate quietly stepped over.
  // The server counts them apart now, so say so instead of letting them
  // hide among the skipped ones.
  const rejected = Number(result?.rejected);
  const rejectedSafe = Number.isFinite(rejected) ? rejected : 0;
  if (rejectedSafe === 0) return withUpdated;
  return `${withUpdated} ${t("importRejected").replace("{rejected}", String(rejectedSafe))}`;
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
      // A truncated file or one that was never a GlassKeep export throws
      // here with a browser-native message ("Unexpected non-whitespace
      // character..."), meant for a developer console, not the person who
      // just picked a file. Caught on its own so it never reaches
      // localizeServerError, which only knows how to translate messages
      // the server itself sends.
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        alert(t("importInvalidJson"));
        return;
      }
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
          const note = await keepNoteFromJson(JSON.parse(txt), imageByName);
          if (note) notesArr.push(note);
        } catch { /* malformed Keep file: skip it */ }
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
