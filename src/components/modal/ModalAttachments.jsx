import React from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { fileExtension, fileFamily, formatFileSize } from "../../utils/attachments.js";

const Tile = ({ attachment }) => {
  if (attachment.thumb) {
    return <img className="gk-attachment-thumb" src={attachment.thumb} alt="" draggable={false} />;
  }
  const label = fileExtension(attachment.name).slice(0, 4) || t("attachmentFileLabel");
  return <span className="gk-attachment-tile" data-family={fileFamily(attachment)}>{label}</span>;
};

function statusLine(attachment) {
  if (attachment.status === "failed") return attachment.error || t("attachmentUploadFailed");
  if (attachment.status === "uploading") return `${Math.round((attachment.progress || 0) * 100)} %`;
  if (attachment.status) return t("attachmentWaiting");
  return formatFileSize(attachment.size);
}

/**
 * The files attached to a note, between its images and its text. A row opens
 * the file; downloading and removing have their own buttons. Rows still on
 * their way to the server show how far they got instead.
 */
export default function ModalAttachments({ attachments, onOpen, onDownload, onRemove, onCancel, onRetry }) {
  if (!attachments.length) return null;

  return (
    <ul className="gk-attachments" aria-label={t("attachments")}>
      {attachments.map((attachment) => {
        const uploading = !!attachment.status;
        const failed = attachment.status === "failed";
        const Main = uploading ? "div" : "button";
        return (
          <li key={attachment.id} className="gk-attachment" data-failed={failed ? "" : undefined}>
            <Main
              {...(uploading ? {} : { type: "button", onClick: () => onOpen(attachment), title: attachment.name })}
              className="gk-attachment-main"
            >
              <Tile attachment={attachment} />
              <span className="gk-attachment-text">
                <span className="gk-attachment-name">{attachment.name}</span>
                <span className="gk-attachment-meta">{statusLine(attachment)}</span>
              </span>
            </Main>
            {uploading ? (
              <>
                {failed && (
                  <button type="button" className="gk-attachment-btn" data-tooltip={t("retry")} aria-label={t("retry")} onClick={() => onRetry(attachment.id)}>
                    <TI.Refresh className="tabler-icon" />
                  </button>
                )}
                <button type="button" className="gk-attachment-btn" data-tooltip={t("cancel")} aria-label={t("cancel")} onClick={() => onCancel(attachment.id)}>
                  <TI.X className="tabler-icon" />
                </button>
              </>
            ) : (
              <>
                <button type="button" className="gk-attachment-btn" data-tooltip={t("download")} aria-label={t("download")} onClick={() => onDownload(attachment)}>
                  <TI.Download className="tabler-icon" />
                </button>
                {onRemove && (
                  <button type="button" className="gk-attachment-btn gk-attachment-btn--danger" data-tooltip={t("removeAttachment")} aria-label={t("removeAttachment")} onClick={() => onRemove(attachment)}>
                    <TI.Trash className="tabler-icon" />
                  </button>
                )}
              </>
            )}
            {attachment.status === "uploading" && (
              <span className="gk-attachment-progress" style={{ transform: `scaleX(${attachment.progress || 0})` }} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
