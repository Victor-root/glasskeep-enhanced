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
import { clipboardEditorProps } from "../../utils/richTextClipboard.js";
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
    // Shift+Tab inside the editor calls this so the parent can hand
    // focus back to whatever sits "before" the editor (the title
    // textarea, in NoteModal's case). Returning truthy from the
    // callback prevents the default Tab handling.
    onShiftTabExit,
    // When provided, the toolbar is portaled into this DOM element instead of
    // rendered inline above the editor. This lets the host (NoteModal) mount
    // the toolbar inside its sticky header so it stays pinned while the note
    // scrolls.
    toolbarContainer = null,
    // "simple" shows only essential formatting tools on one row.
    // "advanced" shows the full multi-row toolbar (default behaviour).
    toolbarMode = "simple",
    // Default behaviour of Ctrl+V:
    //   "rich"  — keep formatting when the clipboard contains HTML
    //             (Word, web pages, mail). Plain-text-only sources
    //             still get the line-preserving parser.
    //   "plain" — strip all formatting on every Ctrl+V. The matching
    //             `handlePaste` of clipboardEditorProps intercepts the paste event,
    //             reads `text/plain` directly, and ignores any HTML
    //             payload the source may also have provided.
    // Ctrl+Shift+V is always plain-text in either mode (PM handles
    // that flag itself by skipping `text/html`).
    pasteMode = "rich",
    // Mirrors the user's "Mode lecture pour les notes" preference.
    // When the user has read-mode OFF (default), they never see the
    // read-only view-mode renderer that injects copy buttons + handles
    // link clicks. We compensate by enabling the same affordances
    // inside the editor: copy buttons on code blocks / inline code,
    // link tooltip + Ctrl/middle-click / mobile-tap popover. Users
    // with read-mode ON keep their previous edit-mode behaviour so
    // toggling a note to edit doesn't suddenly behave differently.
    readModeEnabled = false,
  },
  ref,
) {
  // `useEditor`'s editorProps closures capture variables at editor
  // creation time, so we route `pasteMode` through a ref to avoid
  // rebuilding the editor (and losing the caret) every time the user
  // flips the setting.
  const pasteModeRef = useRef(pasteMode);
  useEffect(() => {
    pasteModeRef.current = pasteMode;
  }, [pasteMode]);
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
      // Copy as clean plain text, line-preserving plain-text paste and the
      // "plain" paste mode. See utils/richTextClipboard.js.
      ...clipboardEditorProps(() => pasteModeRef.current),
      handleKeyDown: (_, event) => {
        // Shift+Tab → hand focus back to the parent (title input).
        // Plain Tab is left to ProseMirror so list / code-block tab
        // semantics keep working.
        if (
          event.key === "Tab" &&
          event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          onShiftTabExit
        ) {
          event.preventDefault();
          onShiftTabExit();
          return true;
        }
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
      } catch { /* editor destroyed before the frame: nothing to focus */ }
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
    // Track what the editor now holds so the fast-path "parent echoed our
    // doc back" check on the next value change reflects reality. Without
    // this, after an external setContent (undo/redo, server patch) the ref
    // still pointed at the user's last typed doc, and re-applying that same
    // doc through redo was treated as an echo and silently skipped.
    lastEmittedRef.current = incomingDoc;
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  // Toggle the edit-mode extras (copy buttons on code blocks / inline
  // code, link tooltip + Ctrl/middle-click / mobile-tap popover) by
  // flagging the editor DOM. CSS gates the visible affordances (code
  // copy button on hover) and the `EditExtras` plugin gates the event
  // handlers. This way flipping the user preference takes effect
  // immediately without rebuilding the editor / losing the caret.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view?.dom;
    if (!dom) return;
    if (readModeEnabled) {
      dom.removeAttribute("data-edit-extras");
    } else {
      dom.setAttribute("data-edit-extras", "on");
    }
  }, [editor, readModeEnabled]);

  const toolbar = editable && showToolbar && editor
    ? <RichTextToolbar editor={editor} mode={toolbarMode} />
    : null;

  return (
    <div
      className={`rt-editor${dark ? " rt-editor--dark" : ""} ${className}`}
      data-edit-extras={readModeEnabled ? undefined : "on"}
    >
      {toolbar && (toolbarContainer
        ? createPortal(toolbar, toolbarContainer)
        : toolbar)}
      <EditorContent editor={editor} />
    </div>
  );
});

export default RichTextEditor;
