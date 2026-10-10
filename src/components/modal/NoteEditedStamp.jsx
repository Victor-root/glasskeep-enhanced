import React from "react";
import { t } from "../../i18n";

// "Edited: …" line of the note modal, with the note id on hover of the ⓘ.
// Its placement (inline, bottom-right corner, audio bottom bar) is set by
// the caller through className.
export default function NoteEditedStamp({ editedStamp, activeId, className, labelClassName }) {
  return (
    <div className={className}>
      <span className={labelClassName}>{t("editedPrefix")} {editedStamp}</span>
      {activeId && (
        <span
          className="opacity-30 hover:opacity-100 cursor-default transition-opacity"
          data-tooltip={`Note ID : ${activeId}`}
        >ⓘ</span>
      )}
    </div>
  );
}
