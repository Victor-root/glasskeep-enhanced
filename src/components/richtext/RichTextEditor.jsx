import React, { useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { buildRichTextExtensions } from "./richTextSchema.js";
import {
  contentToRichDoc,
  isRichContent,
  emptyRichDoc,
  parseRichDoc,
} from "../../utils/richText.js";
import RichTextToolbar from "./RichTextToolbar.jsx";

/**
 * RichTextEditor
 * --------------
 * Thin wrapper over Tiptap. The parent supplies the note body as a string —
 * either our rich JSON envelope (new notes) or legacy Markdown (existing
 * notes on first open). The editor converts legacy content to a Tiptap doc
 * on mount and emits a Tiptap doc back through `onDocChange` on every edit.
 *
 * The parent keeps owning serialization: it decides when to wrap the doc in
 * our versioned envelope and push it down the autosave pipeline. This keeps
 * the editor decoupled from the storage format.
 *
 * Props
 *   value          Stored note content (rich JSON string OR legacy Markdown).
 *   onDocChange    (doc) => void — fired on every doc change.
 *   placeholder    Empty-state placeholder text.
 *   autoFocus      Focus editor on mount.
 *   dark           Dark-mode flag (used only for style hook).
 *   editable       False → read-only view.
 *   onReady        (editor) => void — lets the parent read the editor for
 *                  shortcuts, focus handoff, etc.
 *   toolbarSlot    Optional ref-like callback that receives a rendered
 *                  toolbar element to portal into a header/footer.
 */
const RichTextEditor = forwardRef(function RichTextEditor(
  {
    value,
    onDocChange,
    placeholder = "",
    autoFocus = false,
    dark = false,
    editable = true,
    onReady,
    className = "",
    minHeightClass = "min-h-[160px]",
    showToolbar = true,
    onEnterBottom,
  },
  ref,
) {
  const extensions = useMemo(
    () => buildRichTextExtensions({ placeholder }),
    [placeholder],
  );

  // We seed the editor once, then push external content changes through
  // setContent when the source note changes (different note id, server patch,
  // undo from outside). For normal edits the editor owns the doc and we do
  // NOT round-trip the string back in.
  const initialContent = useMemo(
    () => contentToRichDoc(value),
    // Intentionally only read `value` at first render; further external
    // changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editor = useEditor({
    extensions,
    content: initialContent,
    editable,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: `rt-editor-content note-content note-content--dense focus:outline-none ${minHeightClass}`,
        spellcheck: "true",
      },
      handleKeyDown: (_, event) => {
        if (!onEnterBottom) return false;
        if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
          onEnterBottom();
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const doc = ed.getJSON();
      // Stamp the last value we expect to see echoed back via the `value`
      // prop, so the external-sync effect doesn't re-seed the editor (which
      // would move the caret) on our own parent re-renders.
      lastEmittedRef.current = doc;
      if (onDocChange) onDocChange(doc);
    },
  });

  useImperativeHandle(ref, () => ({
    focus: () => editor?.commands.focus("end"),
    getEditor: () => editor,
  }), [editor]);

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  // External content changes: when the parent swaps to a different note or
  // pulls a fresh doc from the server, re-seed the editor.
  // We track the last serialized string we pushed into the editor so we don't
  // reset on every autosave echo.
  const lastAppliedRef = useRef(null);
  const lastEmittedRef = useRef(null);
  useEffect(() => {
    if (!editor) return;
    if (value == null) return;
    if (value === lastAppliedRef.current) return;
    let incomingDoc;
    if (isRichContent(value)) {
      incomingDoc = parseRichDoc(value) || emptyRichDoc();
    } else {
      incomingDoc = contentToRichDoc(value);
    }
    // Fast path: the parent just echoed back our own serialized doc. Nothing
    // to do — updating the content would move the selection.
    if (
      lastEmittedRef.current &&
      JSON.stringify(lastEmittedRef.current) === JSON.stringify(incomingDoc)
    ) {
      lastAppliedRef.current = value;
      return;
    }
    const currentDoc = editor.getJSON();
    if (JSON.stringify(currentDoc) === JSON.stringify(incomingDoc)) {
      lastAppliedRef.current = value;
      return;
    }
    editor.commands.setContent(incomingDoc, { emitUpdate: false });
    lastAppliedRef.current = value;
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  return (
    <div className={`rt-editor${dark ? " rt-editor--dark" : ""} ${className}`}>
      {editable && showToolbar && <RichTextToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
});

export default RichTextEditor;
