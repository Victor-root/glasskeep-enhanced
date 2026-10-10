import { t } from "../i18n";
import {
  getAllNotes as idbGetAllNotes,
  getNote as idbGetNote,
  putNote as idbPutNote,
  deleteNote as idbDeleteNote,
} from "../sync/localDb.js";
import { mdForDownload } from "../utils/markdown.jsx";
import { localizeServerError } from "../utils/serverErrors.js";
import { uid, sanitizeFilename, triggerBlobDownload, ensureJSZip, fileToCompressedDataURL } from "../utils/helpers.js";
import { computeRestoredPosition, sortByPositionDesc } from "../utils/noteList.js";

/**
 * Actions of the multi-select bar on the selected notes, plus emptying the
 * trash. Each one is local-first: React state and IndexedDB first, then a
 * queued sync action per note, under a lease.
 */
export default function useBulkActions({
  notes,
  setNotes,
  selectedIds,
  onExitMulti,
  tagFilter,
  setTagFilter,
  currentUser,
  sessionId,
  acquireLocalLease,
  addDeleteTombstone,
  enqueueWithLease,
  showGenericConfirm,
  showToast,
  applyNoteIcon,
  addLogoToLibrary,
}) {
  const onBulkDelete = async () => {
    if (!selectedIds.length) return;

    if (tagFilter === "TRASHED") {
      showGenericConfirm({
        title: t("permanentlyDelete"),
        message: t("permanentlyDeleteConfirm"),
        confirmText: t("permanentlyDelete"),
        danger: true,
        onConfirm: async () => {
          const count = selectedIds.length;
          for (const id of selectedIds) {
            const nid = String(id);
            addDeleteTombstone(nid);
            const leaseId = acquireLocalLease(nid);
            try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
            await enqueueWithLease(nid, { type: "permanentDelete", noteId: nid, payload: { client_updated_at: new Date().toISOString() } }, leaseId);
          }
          setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
          onExitMulti();
          showToast(t("bulkDeletedSuccess").replace("{count}", String(count)), "success", undefined, "trash-x");
        },
      });
    } else {
      showGenericConfirm({
        title: t("moveToTrash"),
        message: t("bulkMoveToTrashConfirm").replace("{count}", String(selectedIds.length)),
        confirmText: t("moveToTrash"),
        danger: true,
        onConfirm: async () => {
          const count = selectedIds.length;
          const nowIso = new Date().toISOString();
          for (const id of selectedIds) {
            const nid = String(id);
            const note = notes.find((n) => String(n.id) === nid);
            const isCollab = note && (note.user_id !== currentUser?.id || note.collaborators?.length > 0);
            const leaseId = acquireLocalLease(nid);
            if (isCollab) {
              try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
            } else {
              try {
                const existing = await idbGetNote(nid, currentUser?.id, sessionId);
                if (existing) await idbPutNote({ ...existing, trashed: true, client_updated_at: nowIso }, currentUser?.id, sessionId);
              } catch (e) { console.error(e); }
            }
            await enqueueWithLease(nid, { type: "trash", noteId: nid, payload: { client_updated_at: nowIso } }, leaseId);
          }
          setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
          onExitMulti();
          showToast(t("bulkTrashedSuccess").replace("{count}", String(count)), "success", undefined, "trash");
        },
      });
    }
  };

  const onEmptyTrash = () => {
    if (notes.length === 0) return;
    showGenericConfirm({
      title: t("emptyTrash"),
      message: t("emptyTrashConfirm"),
      confirmText: t("emptyTrash"),
      danger: true,
      onConfirm: async () => {
        const count = notes.length;
        for (const n of notes) {
          const nid = String(n.id);
          addDeleteTombstone(nid);
          const leaseId = acquireLocalLease(nid);
          try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
          await enqueueWithLease(nid, { type: "permanentDelete", noteId: nid, payload: { client_updated_at: new Date().toISOString() } }, leaseId);
        }
        setNotes([]);
        showToast(t("bulkDeletedSuccess").replace("{count}", String(count)), "success");
      },
    });
  };

  const onBulkPin = async (pinnedVal) => {
    if (!selectedIds.length) return;
    const nowIso = new Date().toISOString();
    // Local-first: update UI + IndexedDB, then enqueue
    setNotes((prev) =>
      prev.map((n) =>
        selectedIds.includes(String(n.id))
          ? { ...n, pinned: !!pinnedVal }
          : n,
      ),
    );
    for (const id of selectedIds) {
      const nid = String(id);
      const leaseId = acquireLocalLease(nid);
      try {
        const existing = await idbGetNote(nid, currentUser?.id, sessionId);
        if (existing) await idbPutNote({ ...existing, pinned: !!pinnedVal, client_updated_at: nowIso }, currentUser?.id, sessionId);
      } catch (e) { console.error(e); }
      await enqueueWithLease(nid, { type: "patch", noteId: nid, payload: { pinned: !!pinnedVal, client_updated_at: nowIso } }, leaseId);
    }
  };

  const onBulkRestore = async () => {
    if (!selectedIds.length) return;
    const count = selectedIds.length;
    const nowIso = new Date().toISOString();
    // Pre-load active notes once for position calculation
    let activeNotes = [];
    try {
      activeNotes = sortByPositionDesc(await idbGetAllNotes(currentUser?.id, sessionId, "active"));
    } catch { /* IDB best-effort: positions computed without local notes */ }
    for (const id of selectedIds) {
      const nid = String(id);
      const leaseId = acquireLocalLease(nid);
      try {
        const existing = await idbGetNote(nid, currentUser?.id, sessionId);
        if (existing) {
          const restoredPosition = computeRestoredPosition(existing, activeNotes);
          await idbPutNote({ ...existing, trashed: false, position: restoredPosition, client_updated_at: nowIso }, currentUser?.id, sessionId);
        }
      } catch (e) { console.error(e); }
      await enqueueWithLease(nid, { type: "restore", noteId: nid, payload: { client_updated_at: nowIso } }, leaseId);
    }
    setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
    onExitMulti();
    showToast(t("bulkRestoredSuccess").replace("{count}", String(count)), "success", undefined, "restore");
  };

  const onBulkArchive = async () => {
    if (!selectedIds.length) return;

    const isArchiving = tagFilter !== "ARCHIVED";
    const archivedValue = isArchiving;
    const count = selectedIds.length;
    const nowIso = new Date().toISOString();

    // Local-first: update IndexedDB + UI, then enqueue
    setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
    for (const id of selectedIds) {
      const nid = String(id);
      const leaseId = acquireLocalLease(nid);
      try {
        const existing = await idbGetNote(nid, currentUser?.id, sessionId);
        if (existing) await idbPutNote({ ...existing, archived: !!archivedValue, client_updated_at: nowIso }, currentUser?.id, sessionId);
      } catch (e) { console.error(e); }
      await enqueueWithLease(nid, { type: "archive", noteId: nid, payload: { archived: !!archivedValue, client_updated_at: nowIso } }, leaseId);
    }

    if (!isArchiving && tagFilter === "ARCHIVED") {
      // Unarchiving from archived view: remove them from current list and switch view
      setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
      setTagFilter(null);
    } else if (isArchiving) {
      // Archiving from normal view: remove them from current list
      setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
    }

    onExitMulti();
    showToast(
      t(isArchiving ? "bulkArchivedSuccess" : "bulkUnarchivedSuccess").replace("{count}", String(count)),
      "success",
      undefined,
      isArchiving ? "archive" : "archive-off",
    );
  };

  const onBulkColor = async (colorName) => {
    if (!selectedIds.length) return;
    const nowIso = new Date().toISOString();
    setNotes((prev) =>
      prev.map((n) =>
        selectedIds.includes(String(n.id)) ? { ...n, color: colorName } : n,
      ),
    );
    for (const id of selectedIds) {
      const nid = String(id);
      const leaseId = acquireLocalLease(nid);
      try {
        const existing = await idbGetNote(nid, currentUser?.id, sessionId);
        if (existing) await idbPutNote({ ...existing, color: colorName, client_updated_at: nowIso }, currentUser?.id, sessionId);
      } catch (e) { console.error(e); }
      await enqueueWithLease(nid, { type: "patch", noteId: nid, payload: { color: colorName, client_updated_at: nowIso } }, leaseId);
    }
  };

  // Apply a note-icon (logo) to every selected note. The icon is per-user
  // (never synced), so each note's icon is saved through the dedicated
  // per-user endpoint via applyNoteIcon: not written into images_json.
  const onBulkSetIcon = async (logo) => {
    if (!selectedIds.length || !logo?.src) return;
    for (const id of selectedIds) {
      await applyNoteIcon(id, { id: uid(), src: logo.src, name: logo.name });
    }
  };

  // Upload a new logo via the OS file picker, register it in the user's
  // logo library AND apply it to every selected note in one shot.
  const onBulkAddLogoFromFile = async (file) => {
    if (!file || !selectedIds.length) return;
    try {
      const src = await fileToCompressedDataURL(file);
      addLogoToLibrary?.({ src, name: file.name });
      await onBulkSetIcon({ src, name: file.name });
    } catch (e) {
      console.error("Bulk logo upload failed", e);
    }
  };

  const onBulkDownloadZip = async () => {
    try {
      const ids = new Set(selectedIds);
      const chosen = notes.filter((n) => ids.has(String(n.id)));
      if (!chosen.length) return;
      const JSZip = await ensureJSZip();
      const zip = new JSZip();
      chosen.forEach((n, idx) => {
        const md = mdForDownload(n);
        const base = sanitizeFilename(
          n.title || `note-${String(n.id).slice(-6)}`,
        );
        zip.file(`${base || `note-${idx + 1}`}.md`, md);
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      await triggerBlobDownload(`glass-keep-selected-${ts}.zip`, blob);
    } catch (e) {
      alert(localizeServerError(e.message, "zipDownloadFailed"));
    }
  };

  return {
    onBulkDelete,
    onEmptyTrash,
    onBulkPin,
    onBulkRestore,
    onBulkArchive,
    onBulkColor,
    onBulkSetIcon,
    onBulkAddLogoFromFile,
    onBulkDownloadZip,
  };
}
