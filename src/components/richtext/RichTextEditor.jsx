import React, { useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from "react";
import { createPortal } from "react-dom";
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
    // When provided, the toolbar is portaled into this DOM element instead of
    // rendered inline above the editor. This lets the host (NoteModal) mount
    // the toolbar inside its sticky header so it stays pinned while the note
    // scrolls.
    toolbarContainer = null,
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

  // Refs declared before useEditor so the onUpdate closure can always reach
  // them without depending on declaration order subtleties.
  const lastAppliedRef = useRef(null);
  const lastEmittedRef = useRef(null);

  const editor = useEditor({
    extensions,
    content: initialContent,
    editable,
    // Never use Tiptap's `autofocus: "end"` — it triggers a scrollIntoView on
    // the ProseMirror view which visibly nudges the modal content down when
    // the user toggles from view to edit mode. If the parent asked for
    // autofocus, the dedicated effect below handles it WITHOUT scrollIntoView.
    autofocus: false,
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

  // Opt-in focus after mount, WITHOUT scrolling the surrounding modal.
  // Tiptap's built-in autofocus triggers ProseMirror's scrollIntoView, which
  // nudges the view when switching between view-mode and edit-mode.
  useEffect(() => {
    if (!editor || !autoFocus) return;
    const id = requestAnimationFrame(() => {
      try {
        editor.commands.focus("end", { scrollIntoView: false });
      } catch {}
    });
    return () => cancelAnimationFrame(id);
    // We only want this on true mount (per editor instance).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // External content changes: when the parent swaps to a different note or
  // pulls a fresh doc from the server, re-seed the editor.
  // We track the last serialized string we pushed into the editor so we don't
  // reset on every autosave echo.
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

  const toolbar = editable && showToolbar && editor
    ? <RichTextToolbar editor={editor} />
    : null;

  return (
    <div className={`rt-editor${dark ? " rt-editor--dark" : ""} ${className}`}>
      {toolbar && (toolbarContainer
        ? createPortal(toolbar, toolbarContainer)
        : toolbar)}
      <EditorContent editor={editor} />
    </div>
  );
});

export default RichTextEditor;
