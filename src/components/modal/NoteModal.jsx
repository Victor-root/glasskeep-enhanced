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
import { handleSmartEnter } from "../common/FormatToolbar.jsx";
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
  const viewHtml = React.useMemo(
    () => linkifyContactsHTML(renderSafeMarkdown(mBody)),
    [mBody],
  );

  const { undo, redo, canUndo, canRedo } = useModalHistory({
    mTitle, mBody, setMTitle, setMBody,
    open, activeId, mType, viewMode,
  });

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

  /* Intercept Ctrl+Z/Y for undo/redo and standard formatting shortcuts.
     Uses e.code (layout-independent) for digit keys so AZERTY users keep
     working shortcuts. */
  const handleModalKeyDown = React.useCallback(
    (e) => {
      if (mType !== "text" || viewMode) return; // let native handle non-text
      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;
      const shift = e.shiftKey;
      const alt = e.altKey;

      // Undo / redo
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

      // Formatting shortcuts — only when focus is inside the body textarea
      const active = document.activeElement;
      if (!mBodyRef.current || active !== mBodyRef.current) return;

      const apply = (type) => {
        e.preventDefault();
        formatModal(type);
      };

      if (!alt && !shift && e.code === "KeyB") return apply("bold");
      if (!alt && !shift && e.code === "KeyI") return apply("italic");
      if (!alt && shift && e.code === "KeyX") return apply("strike");
      if (!alt && !shift && e.code === "KeyE") return apply("code");
      if (!alt && shift && e.code === "KeyE") return apply("codeblock");
      if (!alt && !shift && e.code === "KeyK") return apply("link");
      // Match on produced character so it works across layouts
      // (on AZERTY "." is typed via Shift+`;`, so e.code === "Period" never fires)
      if (!alt && e.key === ".") return apply("quote");
      if (!alt && shift && e.code === "Digit8") return apply("ul");
      if (!alt && shift && e.code === "Digit7") return apply("ol");
      if (alt && !shift && e.code === "Digit1") return apply("h1");
      if (alt && !shift && e.code === "Digit2") return apply("h2");
      if (alt && !shift && e.code === "Digit3") return apply("h3");
    },
    [undo, redo, mType, viewMode, formatModal, mBodyRef],
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
            />

            {!isDrawEdit && (
              <ModalImagesGrid
                images={mImages}
                onOpenViewer={openImageViewer}
                onRemoveImage={(id) => setMImages((prev) => prev.filter((x) => x.id !== id))}
                canRemove={mType === "checklist" || !viewMode}
              />
            )}

            <OfflineCollabBanner visible={isCollaborativeNote && syncState === "offline"} />

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
                    <textarea
                      ref={mBodyRef}
                      className="w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none overflow-hidden min-h-[160px] pb-8"
                      style={{ scrollBehavior: "unset" }}
                      value={mBody}
                      onChange={(e) => {
                        setMBody(e.target.value);
                        resizeModalTextarea();
                      }}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.altKey &&
                          !e.ctrlKey &&
                          !e.metaKey
                        ) {
                          const el = mBodyRef.current;
                          const value = mBody;
                          const start = el.selectionStart ?? value.length;
                          const end = el.selectionEnd ?? value.length;

                          const lastNewlineIndex = value.lastIndexOf("\n");
                          const isOnLastLine = start > lastNewlineIndex;

                          const res = handleSmartEnter(value, start, end);
                          if (res) {
                            e.preventDefault();
                            setMBody(res.text);
                            requestAnimationFrame(() => {
                              try {
                                el.setSelectionRange(
                                  res.range[0],
                                  res.range[1],
                                );
                              } catch (e) {}
                              resizeModalTextarea();

                              if (isOnLastLine) {
                                const modalScrollEl = modalScrollRef.current;
                                if (modalScrollEl) {
                                  setTimeout(() => {
                                    modalScrollEl.scrollTop += 30;
                                  }, 50);
                                }
                              }
                            });
                          } else if (isOnLastLine) {
                            setTimeout(() => {
                              const modalScrollEl = modalScrollRef.current;
                              if (modalScrollEl) {
                                modalScrollEl.scrollTop += 30;
                              }
                            }, 10);
                          }
                        }
                      }}
                      placeholder={t("writeYourNoteEllipsis")}
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
                /* Edit mode: text body textarea + drawing preview */
                <>
                  <textarea
                    ref={mBodyRef}
                    className="w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none overflow-hidden min-h-[80px] pb-4"
                    value={mBody}
                    onChange={(e) => {
                      setMBody(e.target.value);
                      resizeModalTextarea();
                    }}
                    placeholder={t("writeYourNoteEllipsis")}
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
