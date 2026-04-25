import React, { memo } from "react";
import { t } from "../../i18n";

const NoteViewContent = memo(function NoteViewContent({ html, noteViewRef }) {
  return (
    <div
      ref={noteViewRef}
      className="note-content note-content--dense"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}, (prev, next) => prev.html === next.html);
import DrawingCanvas from "../../DrawingCanvas";
import ModalHeader from "./ModalHeader.jsx";
import ModalFooter from "./ModalFooter.jsx";
import ModalImagesGrid from "./ModalImagesGrid.jsx";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog.jsx";
import CollaborationModal from "./CollaborationModal.jsx";
import FullscreenImageViewer from "./FullscreenImageViewer.jsx";
import OfflineCollabBanner from "./OfflineCollabBanner.jsx";
import ChecklistEditor from "../checklist/ChecklistEditor.jsx";
import useModalHistory from "../../hooks/useModalHistory.js";
import { renderSafeMarkdown, linkifyContactsHTML } from "../../utils/markdown.jsx";
import RichTextEditor from "../richtext/RichTextEditor.jsx";
import { contentToHTML, serializeRichContent, isRichContent } from "../../utils/richText.js";
import { modalBgFor, scrollColorsFor, solid, bgFor, toHex } from "../../utils/colors.js";
import { setThemeColor } from "../../utils/helpers.js";

export default function NoteModal({
  // visibility / animation
  open,
  isModalClosing,
  // theme & layout
  dark,
  windowWidth,
  isLandscapeMobile,
  isWebView,
  edgeToEdgeLandscape,
  // modal state
  activeId,
  mType,
  mTitle,
  setMTitle,
  mBody,
  setMBody,
  mColor,
  setMColor,
  viewMode,
  setViewMode,
  mImages,
  setMImages,
  mItems,
  setMItems,
  mInput,
  setMInput,
  mDrawingData,
  setMDrawingData,
  mTagList,
  setMTagList,
  tagInput,
  setTagInput,
  modalTagFocused,
  setModalTagFocused,
  // refs
  modalScrollRef,
  mBodyRef,
  noteViewRef,
  modalFileRef,
  modalMenuBtnRef,
  modalFmtBtnRef,
  modalTagInputRef,
  modalTagBtnRef,
  suppressTagBlurRef,
  modalColorBtnRef,
  scrimClickStartRef,
  savedModalScrollRatioRef,
  // derived
  activeNoteObj,
  editedStamp,
  modalHasChanges,
  modalScrollable,
  tagsWithCounts,
  addTags,
  handleTagKeyDown,
  handleTagBlur,
  handleTagPaste,
  // modal menu
  modalMenuOpen,
  setModalMenuOpen,
  // formatting
  showModalFmt,
  setShowModalFmt,
  formatModal,
  // color popover
  showModalColorPop,
  setShowModalColorPop,
  // kebab menu
  modalKebabOpen,
  setModalKebabOpen,
  // confirm delete
  confirmDeleteOpen,
  setConfirmDeleteOpen,
  // saving
  savingModal,
  // collaboration
  collaborationModalOpen,
  setCollaborationModalOpen,
  collaboratorUsername,
  setCollaboratorUsername,
  addModalCollaborators,
  showUserDropdown,
  setShowUserDropdown,
  filteredUsers,
  setFilteredUsers,
  loadingUsers,
  dropdownPosition,
  collaboratorInputRef,
  addCollaborator,
  removeCollaborator,
  searchUsers,
  updateDropdownPosition,
  loadCollaboratorsForAddModal,
  // image viewer
  imgViewOpen,
  imgViewIndex,
  mobileNavVisible,
  openImageViewer,
  closeImageViewer,
  nextImage,
  prevImage,
  resetMobileNav,
  // note context
  notes,
  currentUser,
  tagFilter,
  // handlers
  closeModal,
  saveModal,
  deleteModal,
  restoreFromTrash,
  handleArchiveNote,
  handleDownloadNote,
  togglePin,
  addImagesToState,
  isCollaborativeNote,
  syncState,
  onModalBodyClick,
  resizeModalTextarea,
  // checklist handlers
  syncChecklistItems,
  checklistInsertPosition,
  checklistRemoveSectionBehavior,
  // note type conversion (text <-> checklist)
  onConvertNoteType,
  // direct draw mode
  initialDrawMode,
  onConsumeInitialDrawMode,
}) {
  const [drawMode, setDrawMode] = React.useState("view");
  const [drawToolbarEl, setDrawToolbarEl] = React.useState(null);
  const [drawTransition, setDrawTransition] = React.useState(null); // 'entering' | 'leaving' | null
  const isDrawEdit = mType === 'draw' && drawMode === 'draw';
  const isDrawView = mType === 'draw' && drawMode !== 'draw';

  // Track draw mode transitions for animation
  const prevDrawEditRef = React.useRef(false);
  React.useEffect(() => {
    const wasDrawEdit = prevDrawEditRef.current;
    prevDrawEditRef.current = isDrawEdit;
    if (isDrawEdit && !wasDrawEdit) {
      setDrawTransition('entering');
    } else if (!isDrawEdit && wasDrawEdit) {
      setDrawTransition('leaving');
    }
  }, [isDrawEdit]);
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

  const { undo, redo, canUndo, canRedo } = useModalHistory({
    mTitle, mBody, setMTitle, setMBody,
    open, activeId, mType, viewMode,
  });

  // DOM node of the slot inside ModalHeader where the rich-text toolbar is
  // portaled. Using useState-as-ref so the RichTextEditor re-renders once
  // the slot actually mounts (a useRef wouldn't trigger the re-render).
  const [toolbarSlot, setToolbarSlot] = React.useState(null);
  // Mobile-only: the rich-text toolbar moves out of the sticky header
  // (which is too cramped on phone widths) and lives inside a bottom
  // sheet the user opens via the "Mise en forme" footer button. The
  // sheet's content div is registered here as a portal target.
  const [mobileToolbarSlot, setMobileToolbarSlot] = React.useState(null);
  const isDesktopLayout = windowWidth >= 768 && !isLandscapeMobile && !isWebView;
  const toolbarMount = isDesktopLayout ? toolbarSlot : mobileToolbarSlot;

  /* Set draw mode when modal opens (reset to view, or honour initialDrawMode) */
  React.useEffect(() => {
    if (open) {
      if (initialDrawMode) {
        setDrawMode(initialDrawMode);
        if (onConsumeInitialDrawMode) onConsumeInitialDrawMode();
      } else {
        setDrawMode("view");
      }
    }
  }, [open, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Sync PWA / Android status bar color with note color.
     No cleanup function — avoids the cleanup→default→effect→noteColor race
     that caused a flash on Android WebView. The default is set explicitly
     when `open` becomes false. */
  React.useEffect(() => {
    const pageColor = dark ? "#1a1a1a" : "#f0e8ff";
    if (!open) {
      window.__noteModalOpen = false;
      setThemeColor(pageColor);
      return;
    }
    window.__noteModalOpen = true;
    const color = (!mColor || mColor === "default") ? pageColor : toHex(modalBgFor(mColor, dark));
    setThemeColor(color);
  }, [open, mColor, dark]);

  /* Intercept Ctrl+Z/Y at the modal level for title-only undo.
   *
   * For the text-note body, the rich editor owns its own history and
   * keyboard shortcuts (bold/italic/strike/code/headings/lists/link/quote
   * all come from Tiptap's StarterKit keymaps). We deliberately skip those
   * here to avoid double-handling. The modal-level Ctrl+Z still works for
   * checklist/draw note title changes and anywhere outside a contenteditable.
   */
  const handleModalKeyDown = React.useCallback(
    (e) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;
      const shift = e.shiftKey;
      const alt = e.altKey;

      // If the keystroke originated inside a Tiptap contenteditable we bail
      // out: the editor handles formatting and undo natively.
      const active = document.activeElement;
      if (active && active.isContentEditable) return;

      if (e.code === "KeyZ" && !shift && !alt) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.code === "KeyZ" && shift && !alt) || (e.code === "KeyY" && !shift && !alt)) {
        e.preventDefault();
        redo();
        return;
      }
    },
    [undo, redo],
  );

  // Force mobile layout when running inside Android WebView (tablets)
  const mobileLayout = windowWidth < 640 || isLandscapeMobile || isWebView;

  if (!open && !isModalClosing) return null;

  return (
    <>
      <div
        className={`modal-scrim note-scrim-anim${isModalClosing ? ' closing' : ''} fixed inset-0 ${mobileLayout ? 'bg-black' : 'bg-black/40 max-sm:bg-black'} z-40 flex items-center justify-center overscroll-contain`}
        onMouseDown={(e) => {
          scrimClickStartRef.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          if (scrimClickStartRef.current && e.target === e.currentTarget) {
            closeModal();
          }
          scrimClickStartRef.current = false;
        }}
      >
        <div
          className={`note-modal-anim${isModalClosing ? ' closing' : ''} glass-card rounded-none shadow-none w-full max-w-none ${
            mobileLayout ? ''
            : isDrawEdit ? 'sm:w-screen sm:max-w-none sm:h-screen sm:!rounded-none'
            : 'sm:w-11/12 sm:max-w-3xl lg:max-w-4xl sm:h-[95vh] sm:rounded-xl'
          }${drawTransition === 'entering' ? ' draw-expand' : drawTransition === 'leaving' ? ' draw-collapse' : ''} flex flex-col relative overflow-hidden`}
          style={{
            backgroundColor: modalBgFor(mColor, dark),
            height: mobileLayout ? '100dvh' : undefined,
            paddingTop: mobileLayout ? 'env(safe-area-inset-top)' : undefined,
            paddingBottom: mobileLayout ? 'env(safe-area-inset-bottom)' : undefined,
            paddingLeft: mobileLayout && !edgeToEdgeLandscape ? 'env(safe-area-inset-left)' : undefined,
            paddingRight: mobileLayout ? 'env(safe-area-inset-right)' : undefined,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleModalKeyDown}
        >
          {/* Scroll container */}
          <div
            ref={modalScrollRef}
            data-modal-scroll
            className={`relative flex-1 min-h-0 mobile-hide-scrollbar modal-scroll-themed ${isDrawEdit ? 'flex flex-col overflow-hidden' : 'overflow-y-auto overflow-x-auto'}`}
            style={(() => {
              const sc = scrollColorsFor(mColor, dark);
              const noteColorBtn = (!dark && (!mColor || mColor === "default"))
                ? "#a78bfa"
                : solid(bgFor(mColor, dark));
              const noteColorOpaque = typeof noteColorBtn === "string" ? noteColorBtn.replace(/,\s*[\d.]+\)$/, ', 1)') : noteColorBtn;
              return { '--sb-thumb': sc.thumb, '--sb-track': sc.track, '--note-color': noteColorBtn, '--note-color-opaque': noteColorOpaque, backgroundColor: 'inherit' };
            })()}
          >
            <ModalHeader
              dark={dark}
              mColor={mColor}
              mTitle={mTitle}
              setMTitle={setMTitle}
              mType={mType}
              viewMode={viewMode}
              windowWidth={windowWidth}
              isLandscapeMobile={isLandscapeMobile}
              isWebView={isWebView}
              // formatting
              modalFmtBtnRef={modalFmtBtnRef}
              showModalFmt={showModalFmt}
              setShowModalFmt={setShowModalFmt}
              onFormatModal={formatModal}
              // pin
              onTogglePin={togglePin}
              activeId={activeId}
              notes={notes}
              tagFilter={tagFilter}
              // close
              onClose={closeModal}
              // save
              modalHasChanges={modalHasChanges}
              savingModal={savingModal}
              onSave={saveModal}
              // drawing
              drawMode={drawMode}
              drawToolbarMount={setDrawToolbarEl}
              onToggleDrawMode={() => setDrawMode((m) => m === "view" ? "draw" : "view")}
              toolbarSlotRef={setToolbarSlot}
              // keyboard: Tab from title → body, skipping the toolbar buttons
              onTitleTab={() => {
                if (mType === "checklist") {
                  const first = document.querySelector(
                    '[data-checklist-list] textarea, [data-checklist-list] input[type="text"]'
                  );
                  if (first) first.focus();
                  return;
                }
                mBodyRef.current?.focus();
              }}
            />

            {!isDrawEdit && (
              <ModalImagesGrid
                images={mImages}
                onOpenViewer={openImageViewer}
                onRemoveImage={(id) => setMImages((prev) => prev.filter((x) => x.id !== id))}
                canRemove={mType === "checklist" || !viewMode}
              />
            )}

            <OfflineCollabBanner visible={isCollaborativeNote(activeId) && syncState === "offline"} />

            {/* Content area */}
            <div
              key={isDrawEdit ? 'draw' : viewMode ? 'view' : 'edit'}
              className={`${isDrawEdit ? "flex-1 min-h-0 flex flex-col" : isDrawView ? "px-6 pt-3 pb-6 max-sm:px-4 max-sm:pt-1 max-sm:pb-4" : "px-6 pt-3 pb-12 max-sm:pt-1 max-sm:pb-4"} ${!isDrawEdit ? "modal-content-fade" : ""}`}
              onClick={onModalBodyClick}
            >

              {/* Text, Checklist, or Drawing */}
              {mType === "text" ? (
                viewMode ? (
                  <NoteViewContent html={viewHtml} noteViewRef={noteViewRef} />
                ) : (
                  <div className="relative min-h-[160px]">
                    <RichTextEditor
                      key={activeId || "new"}
                      value={mBody}
                      onDocChange={handleRichDocChange}
                      placeholder={t("writeYourNoteEllipsis")}
                      dark={dark}
                      autoFocus={!mTitle}
                      minHeightClass="min-h-[160px]"
                      toolbarContainer={toolbarMount}
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
                  />
                </div>
              ) : drawMode === 'draw' ? (
                /* Draw mode: fullscreen interactive canvas */
                <DrawingCanvas
                  data={mDrawingData}
                  onChange={setMDrawingData}
                  width={1200}
                  height={800}
                  readOnly={false}
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
                    <DrawingCanvas
                      data={mDrawingData}
                      width={1200}
                      height={800}
                      readOnly
                      darkMode={dark}
                      hideModeToggle
                    />
                  </div>
                </>
              ) : (
                /* Edit mode: rich text body + drawing preview */
                <>
                  <RichTextEditor
                    key={`draw-${activeId || "new"}`}
                    value={mBody}
                    onDocChange={handleRichDocChange}
                    placeholder={t("writeYourNoteEllipsis")}
                    dark={dark}
                    minHeightClass="min-h-[80px]"
                    toolbarContainer={toolbarSlot}
                  />
                  <DrawingCanvas
                    data={mDrawingData}
                    width={1200}
                    height={800}
                    readOnly
                    darkMode={dark}
                    hideModeToggle
                  />
                </>
              )}

              {/* Inline Edited stamp: only when scrollable (hidden in draw edit mode) */}
              {editedStamp && modalScrollable && !(mType === 'draw' && drawMode === 'draw') && (
                <div className="mt-6 text-xs text-gray-600 dark:text-gray-300 text-right flex items-center justify-end gap-1.5">
                  <span>{t("editedPrefix")} {editedStamp}</span>
                  {activeId && (
                    <span
                      className="opacity-30 hover:opacity-100 cursor-default transition-opacity"
                      data-tooltip={`Note ID : ${activeId}`}
                    >ⓘ</span>
                  )}
                </div>
              )}
            </div>

            {/* Absolute Edited stamp: only when NOT scrollable (hidden in draw edit mode) */}
            {editedStamp && !modalScrollable && !(mType === 'draw' && drawMode === 'draw') && (
              <div className="absolute bottom-3 right-4 text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                <span className="pointer-events-none">{t("editedPrefix")} {editedStamp}</span>
                {activeId && (
                  <span
                    className="opacity-30 hover:opacity-100 cursor-default transition-opacity"
                    data-tooltip={`Note ID : ${activeId}`}
                  >ⓘ</span>
                )}
              </div>
            )}
          </div>

          {/* Mobile-only formatting bottom sheet — hosts the rich-text
              toolbar via a portal. Always mounted so the editor's toolbar
              keeps a stable target across open/close; visibility is
              driven by the "is-open" class. Closed by tapping the
              "Mise en forme" footer toggle again. Only relevant for
              text notes (and the inline text body of draw notes) in
              edit mode. */}
          {!isDesktopLayout && mType !== "checklist" && !viewMode && !(mType === 'draw' && drawMode === 'draw') && (
            <div
              className={`mobile-fmt-sheet${showModalFmt ? " is-open" : ""}${dark ? " mobile-fmt-sheet--dark" : ""}`}
              role="dialog"
              aria-label={t("formatting")}
              aria-hidden={showModalFmt ? "false" : "true"}
              style={{ backgroundColor: modalBgFor(mColor, dark) }}
            >
              <div ref={setMobileToolbarSlot} className="mobile-fmt-sheet-content" />
            </div>
          )}

          <ModalFooter
            dark={dark}
            windowWidth={windowWidth}
            isLandscapeMobile={isLandscapeMobile}
            isWebView={isWebView}
            // tags
            mTagList={mTagList}
            setMTagList={setMTagList}
            tagInput={tagInput}
            setTagInput={setTagInput}
            modalTagFocused={modalTagFocused}
            setModalTagFocused={setModalTagFocused}
            modalTagInputRef={modalTagInputRef}
            modalTagBtnRef={modalTagBtnRef}
            suppressTagBlurRef={suppressTagBlurRef}
            tagsWithCounts={tagsWithCounts}
            addTags={addTags}
            handleTagKeyDown={handleTagKeyDown}
            handleTagBlur={handleTagBlur}
            handleTagPaste={handleTagPaste}
            // color
            mColor={mColor}
            setMColor={setMColor}
            modalColorBtnRef={modalColorBtnRef}
            showModalColorPop={showModalColorPop}
            setShowModalColorPop={setShowModalColorPop}
            // images
            modalFileRef={modalFileRef}
            addImagesToState={addImagesToState}
            setMImages={setMImages}
            // collaboration
            onOpenCollaboration={async () => {
              setCollaborationModalOpen(true);
              if (activeId) {
                await loadCollaboratorsForAddModal(activeId);
              }
            }}
            // formatting (mobile)
            modalFmtBtnRef={modalFmtBtnRef}
            showModalFmt={showModalFmt}
            setShowModalFmt={setShowModalFmt}
            // view/edit toggle
            mType={mType}
            viewMode={viewMode}
            onToggleViewMode={() => {
              setViewMode((v) => !v);
              setShowModalFmt(false);
            }}
            // drawing mode toggle
            drawMode={drawMode}
            onToggleDrawMode={() => setDrawMode((m) => m === "view" ? "draw" : "view")}
            onExitDrawToView={() => { setDrawMode("view"); setViewMode(true); }}
            modalScrollRef={modalScrollRef}
            savedModalScrollRatioRef={savedModalScrollRatioRef}
            // actions
            activeId={activeId}
            notes={notes}
            tagFilter={tagFilter}
            activeNoteObj={activeNoteObj}
            addModalCollaborators={addModalCollaborators}
            currentUser={currentUser}
            onDownloadNote={handleDownloadNote}
            onRestoreFromTrash={restoreFromTrash}
            onArchiveNote={handleArchiveNote}
            onOpenConfirmDelete={() => setConfirmDeleteOpen(true)}
            modalKebabOpen={modalKebabOpen}
            setModalKebabOpen={setModalKebabOpen}
            undo={undo}
            redo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            onConvertNoteType={onConvertNoteType}
          />

          <ConfirmDeleteDialog
            open={confirmDeleteOpen}
            dark={dark}
            isTrashed={tagFilter === "TRASHED"}
            collabOwner={
              tagFilter !== "TRASHED"
              && activeNoteObj?.user_id === currentUser?.id
              && (activeNoteObj?.collaborators?.length || 0) > 0
            }
            onClose={() => setConfirmDeleteOpen(false)}
            onConfirm={async (mode) => {
              setConfirmDeleteOpen(false);
              await deleteModal(mode);
            }}
          />

          <CollaborationModal
            open={collaborationModalOpen}
            dark={dark}
            activeId={activeId}
            notes={notes}
            currentUser={currentUser}
            collaboratorUsername={collaboratorUsername}
            setCollaboratorUsername={setCollaboratorUsername}
            addModalCollaborators={addModalCollaborators}
            showUserDropdown={showUserDropdown}
            setShowUserDropdown={setShowUserDropdown}
            filteredUsers={filteredUsers}
            setFilteredUsers={setFilteredUsers}
            loadingUsers={loadingUsers}
            dropdownPosition={dropdownPosition}
            collaboratorInputRef={collaboratorInputRef}
            onClose={() => setCollaborationModalOpen(false)}
            onAddCollaborator={addCollaborator}
            onRemoveCollaborator={removeCollaborator}
            searchUsers={searchUsers}
            updateDropdownPosition={updateDropdownPosition}
          />
        </div>
      </div>

      {/* Fullscreen Image Viewer */}
      {imgViewOpen && mImages.length > 0 && (
        <FullscreenImageViewer
          images={mImages}
          currentIndex={imgViewIndex}
          dark={dark}
          onClose={closeImageViewer}
          onNext={nextImage}
          onPrev={prevImage}
          mobileNavVisible={mobileNavVisible}
          onResetMobileNav={resetMobileNav}
          canRemove={mType === "checklist" || !viewMode}
          onRemoveImage={(id) => setMImages((prev) => prev.filter((x) => x.id !== id))}
        />
      )}
    </>
  );
}
