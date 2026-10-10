import React from "react";
import { t } from "../../i18n";
import DrawingCanvas from "../drawing/DrawingCanvas";
import ChecklistEditor from "../checklist/ChecklistEditor.jsx";
import RichTextEditor from "../richtext/RichTextEditor.jsx";
import AudioNoteEditor from "../audio/AudioNoteEditor.jsx";
import StorageGauge from "../audio/StorageGauge.jsx";
import NoteViewContent from "./NoteViewContent.jsx";
import NoteEditedStamp from "./NoteEditedStamp.jsx";
import { renderSafeMarkdown, linkifyContactsHTML } from "../../utils/markdown.jsx";
import { contentToHTML, serializeRichContent, isRichContent } from "../../utils/richText.js";
import { parseAudioContent, totalClipsBytes } from "../../utils/audioNote.js";

/**
 * Content area of the note modal: the body of each note type (text,
 * checklist, drawing, audio) in view or edit mode, and the inline
 * "Edited" stamp. NoteModal keys it by mode so switching between view,
 * edit and draw remounts it.
 */
export default function NoteModalBody({
  mType,
  isDrawEdit,
  isDrawView,
  isAudio,
  viewMode,
  noteReadOnly,
  readModeEnabled,
  dark,
  activeId,
  noteId,
  onClick,
  // text / audio body
  mTitle,
  mBody,
  setMBody,
  noteViewRef,
  richEditorRef,
  focusModalTitle,
  toolbarMount,
  editorToolbarMode,
  pasteMode,
  // checklist
  mItems,
  setMItems,
  syncChecklistItems,
  checklistInsertPosition,
  checklistRemoveSectionBehavior,
  // drawing
  drawMode,
  setDrawMode,
  mDrawingData,
  setMDrawingData,
  drawToolbarEl,
  // edited stamp
  editedStamp,
  modalScrollable,
}) {
  // Rendered HTML for view mode. Rich-format notes render through Tiptap's
  // generateHTML (also sanitized); legacy Markdown notes keep the old marked
  // pipeline so they look identical until the user edits and upgrades them.
  const viewHtml = React.useMemo(() => {
    if (isRichContent(mBody)) return linkifyContactsHTML(contentToHTML(mBody));
    return linkifyContactsHTML(renderSafeMarkdown(mBody));
  }, [mBody]);

  // Serialize a Tiptap doc from the editor back into the string shape that
  // mBody / autosave / sync expect. Centralised here so the two editor mount
  // points (text note / draw-note body) stay in lockstep.
  const handleRichDocChange = React.useCallback(
    (doc) => {
      const serialized = serializeRichContent(doc);
      setMBody(serialized);
    },
    [setMBody],
  );

  // Shared by the text note body and the draw note's text body.
  const richTextProps = {
    editable: !noteReadOnly,
    value: mBody,
    onDocChange: handleRichDocChange,
    placeholder: t("writeYourNoteEllipsis"),
    dark,
    toolbarContainer: toolbarMount,
    toolbarMode: editorToolbarMode,
    pasteMode,
    readModeEnabled,
    onReady: (ed) => { richEditorRef.current = ed; },
    onShiftTabExit: focusModalTitle,
  };

  // Read-only drawing shown under the draw note's text, in view and edit mode.
  const drawingPreview = (
    <DrawingCanvas
      data={mDrawingData}
      width={1200}
      height={800}
      readOnly
      darkMode={dark}
      hideModeToggle
    />
  );

  return (
    <div
      className={`${isDrawEdit ? "flex-1 min-h-0 flex flex-col" : isDrawView ? "px-6 pt-3 pb-6 max-sm:px-4 max-sm:pt-1 max-sm:pb-4" : isAudio ? "flex-1 min-h-0 flex flex-col px-4 pt-2 pb-4 sm:px-5 sm:pt-3 sm:pb-5" : "px-6 pt-3 pb-12 max-sm:pt-1 max-sm:pb-4"} ${!isDrawEdit ? "modal-content-fade" : ""}`}
      onClick={onClick}
    >

      {/* Text, Checklist, Drawing, or Audio */}
      {mType === "audio" ? (
        <AudioNoteEditor
          body={mBody}
          setBody={setMBody}
          title={mTitle}
          readOnly={noteReadOnly}
        />
      ) : mType === "text" ? (
        viewMode ? (
          <NoteViewContent html={viewHtml} noteViewRef={noteViewRef} />
        ) : (
          <div className="relative min-h-[160px]">
            <RichTextEditor
              key={activeId || "new"}
              {...richTextProps}
              autoFocus={!activeId && !mTitle}
              minHeightClass="min-h-[160px]"
            />
          </div>
        )
      ) : mType === "checklist" ? (
        <div data-checklist-list>
          <ChecklistEditor
            entries={mItems}
            setEntries={setMItems}
            syncEntries={syncChecklistItems}
            insertPosition={checklistInsertPosition}
            removeSectionBehavior={checklistRemoveSectionBehavior}
            noteId={noteId}
            readOnly={noteReadOnly}
          />
        </div>
      ) : drawMode === 'draw' ? (
        /* Draw mode: fullscreen interactive canvas */
        <DrawingCanvas
          data={mDrawingData}
          onChange={setMDrawingData}
          width={1200}
          height={800}
          readOnly={noteReadOnly}
          darkMode={dark}
          hideModeToggle
          externalMode={drawMode}
          onModeChange={setDrawMode}
          fillContainer
          toolbarPortalTarget={drawToolbarEl}
        />
      ) : viewMode ? (
        /* View mode: rendered text + read-only drawing preview */
        <>
          {mBody && (
            <NoteViewContent html={viewHtml} />
          )}
          <div className="mt-4">
            {drawingPreview}
          </div>
        </>
      ) : (
        /* Edit mode: rich text body + drawing preview */
        <>
          <RichTextEditor
            key={`draw-${activeId || "new"}`}
            {...richTextProps}
            minHeightClass="min-h-[80px]"
          />
          {drawingPreview}
        </>
      )}

      {/* Audio bottom bar: storage gauge on the left (mirror of the
          "Edited:" stamp on the right). Always rendered so the
          user can read the per-note limit even before they start
          recording. The popover auto-flips upward since this row
          sits at the bottom of the modal. */}
      {isAudio && !isDrawEdit && (
        <div className="mt-6 text-xs text-gray-600 dark:text-gray-300 flex items-center justify-between gap-3">
          <StorageGauge usedBytes={totalClipsBytes(parseAudioContent(mBody).clips)} />
          {editedStamp && (
            <NoteEditedStamp editedStamp={editedStamp} activeId={activeId} className="flex items-center gap-1.5" />
          )}
        </div>
      )}

      {/* Inline Edited stamp: scrollable non-audio notes. Audio
          uses its own bottom row above so the gauge can sit
          opposite the stamp. */}
      {editedStamp && modalScrollable && !isAudio && !isDrawEdit && (
        <NoteEditedStamp
          editedStamp={editedStamp}
          activeId={activeId}
          className="mt-6 text-xs text-gray-600 dark:text-gray-300 text-right flex items-center justify-end gap-1.5"
        />
      )}
    </div>
  );
}
