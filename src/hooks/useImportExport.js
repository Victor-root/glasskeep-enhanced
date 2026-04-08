import { useCallback } from "react";
import { api } from "../utils/api.js";
import { uid, sanitizeFilename, downloadText } from "../utils/helpers.js";
import { t } from "../i18n";

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
      alert(e.message || t("exportFailed"));
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
      await api("/notes/import", {
        method: "POST",
        token,
        body: { notes: notesArr },
      });
      await loadNotes();
      alert(t("importedNotesSuccessfully").replace("{count}", String(notesArr.length)));
    } catch (e) {
      alert(e.message || t("importFailed"));
    }
  };

  /** Import Google Keep single-note JSON files (multiple) */
  const importGKeep = async (fileList) => {
    try {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      const texts = await Promise.all(
        files.map((f) => f.text().catch(() => null)),
      );
      const notesArr = [];
      for (const t of texts) {
        if (!t) continue;
        try {
          const obj = JSON.parse(t);
          if (!obj || typeof obj !== "object") continue;
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
          const content = hasChecklist ? "" : String(obj.textContent || "");
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
          notesArr.push({
            id: uid(),
            type: hasChecklist ? "checklist" : "text",
            title,
            content,
            items,
            tags,
            images: [],
            color: "default",
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
      await api("/notes/import", {
        method: "POST",
        token,
        body: { notes: notesArr },
      });
      await loadNotes();
      alert(t("importedGoogleKeepNotes").replace("{count}", String(notesArr.length)));
    } catch (e) {
      alert(e.message || t("googleKeepImportFailed"));
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
          const content = lines.slice(contentStartIndex).join("\n").trim();

          if (title || content) {
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

      await api("/notes/import", {
        method: "POST",
        token,
        body: { notes: notesArr },
      });
      await loadNotes();
      alert(t("importedMarkdownFilesSuccessfully").replace("{count}", String(notesArr.length)));
    } catch (e) {
      alert(e.message || t("markdownImportFailed"));
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
      alert(e.message || t("couldNotGenerateSecretKey"));
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
