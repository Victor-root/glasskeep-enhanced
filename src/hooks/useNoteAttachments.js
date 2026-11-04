import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { uid } from "../utils/ids.js";
import { t } from "../i18n";
import { localizeServerError } from "../utils/serverErrors.js";
import {
  attachmentLink,
  createThumbnail,
  deleteAttachment,
  formatFileSize,
  getAttachmentConfig,
  isViewableImage,
  opensInBrowser,
  saveFromLink,
} from "../utils/attachments.js";
import {
  cancelUpload,
  getUploadItems,
  queueUpload,
  retryUpload,
  subscribeUploads,
} from "../sync/attachmentUploads.js";

const NO_LIMIT = { maxBytes: null, maxPerNote: null };
const OFFLINE_ERROR = () => t("attachmentNeedsConnection");

// The attachments of the note open in a pane: what the server has, what is
// on its way there, and what can be done with each.
export default function useNoteAttachments({ note, noteId, canEdit, materializeDraftIfNeeded, showToast, showGenericConfirm, onPreviewImage, patchNoteAttachments }) {
  const uploads = useSyncExternalStore(subscribeUploads, getUploadItems);
  const [limits, setLimits] = useState(NO_LIMIT);

  useEffect(() => {
    if (!canEdit) return;
    getAttachmentConfig().then(setLimits).catch(() => {});
  }, [canEdit]);

  const stored = note?.attachments;
  const pending = useMemo(
    () => uploads.filter((u) => u.noteId === String(noteId)),
    [uploads, noteId],
  );
  // A finished upload can still be in the queue for a moment, and the server
  // has it already.
  const attachments = useMemo(() => {
    const list = Array.isArray(stored) ? stored : [];
    const known = new Set(list.map((a) => a.id));
    return [...list, ...pending.filter((u) => !known.has(u.id))];
  }, [stored, pending]);

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (limits.maxBytes === 0) {
      showToast?.(t("attachmentsDisabled"), "error");
      return;
    }
    // A new note exists on the server only once it has something in it.
    materializeDraftIfNeeded?.({ force: true });
    for (const file of files) {
      if (limits.maxBytes && file.size > limits.maxBytes) {
        showToast?.(t("attachmentTooLargeNamed", { name: file.name, max: formatFileSize(limits.maxBytes) }), "error");
        continue;
      }
      queueUpload(noteId, file, uid(), await createThumbnail(file));
    }
  }, [limits, materializeDraftIfNeeded, noteId, showToast]);

  const failed = useCallback((e) => {
    showToast?.(navigator.onLine ? localizeServerError(e?.message, "attachmentOpenFailed") : OFFLINE_ERROR(), "error");
  }, [showToast]);

  const download = useCallback(async (attachment) => {
    try {
      saveFromLink(await attachmentLink(noteId, attachment.id), attachment.name);
    } catch (e) {
      failed(e);
    }
  }, [noteId, failed]);

  const open = useCallback(async (attachment) => {
    try {
      if (isViewableImage(attachment)) {
        onPreviewImage({ id: attachment.id, name: attachment.name, src: await attachmentLink(noteId, attachment.id, { inline: true }), attachment });
        return;
      }
      if (window.AndroidTheme?.openFile) {
        window.AndroidTheme.openFile(await attachmentLink(noteId, attachment.id), attachment.name, attachment.mime);
        return;
      }
      if (opensInBrowser(attachment)) {
        // Opened first, addressed after: a window opened once the link has
        // come back would no longer count as the tap's doing, and be blocked.
        const tab = window.open("about:blank", "_blank");
        const url = await attachmentLink(noteId, attachment.id, { inline: true });
        if (tab) tab.location.href = url;
        else window.location.href = url;
        return;
      }
      await download(attachment);
    } catch (e) {
      failed(e);
    }
  }, [noteId, onPreviewImage, download, failed]);

  const remove = useCallback((attachment) => {
    showGenericConfirm({
      title: t("removeAttachment"),
      message: t("removeAttachmentConfirm", { name: attachment.name }),
      confirmText: t("remove"),
      danger: true,
      onConfirm: async () => {
        try {
          await deleteAttachment(noteId, attachment.id);
          patchNoteAttachments(noteId, (list) => list.filter((a) => a.id !== attachment.id));
        } catch (e) {
          failed(e);
        }
      },
    });
  }, [noteId, showGenericConfirm, patchNoteAttachments, failed]);

  return {
    attachments,
    addFiles: canEdit ? addFiles : null,
    open,
    download,
    remove: canEdit ? remove : null,
    cancel: cancelUpload,
    retry: retryUpload,
  };
}
