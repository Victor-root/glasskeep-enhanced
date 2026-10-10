import React, { memo } from "react";
import { domSelectionToCleanPlainText } from "../../utils/richTextClipboard.js";

// Outbound-only clipboard hook for the read-only viewer. Mirrors what
// editorProps.clipboardTextSerializer does for the Tiptap editor:
// override the text/plain payload with a clean line-per-block version,
// keep the text/html payload faithful to the rendered DOM. No change
// to what's actually rendered on screen.
const handleNoteViewCopy = (event) => {
  let cleanText;
  try {
    cleanText = domSelectionToCleanPlainText();
  } catch {
    return;
  }
  if (cleanText == null) return;
  try {
    const selection = window.getSelection();
    const range = selection?.getRangeAt(0);
    const fragment = range?.cloneContents();
    const container = document.createElement("div");
    if (fragment) container.appendChild(fragment);
    event.clipboardData.setData("text/plain", cleanText);
    event.clipboardData.setData("text/html", container.innerHTML);
    event.preventDefault();
  } catch {
    // Any failure → leave the default browser copy behaviour alone.
  }
};

// Read-only rendering of a note body (view mode of text and draw notes).
const NoteViewContent = memo(function NoteViewContent({ html, noteViewRef }) {
  return (
    <div
      ref={noteViewRef}
      className="note-content note-content--dense"
      onCopy={handleNoteViewCopy}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}, (prev, next) => prev.html === next.html);

export default NoteViewContent;
