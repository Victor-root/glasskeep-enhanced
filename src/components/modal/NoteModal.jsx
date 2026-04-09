import React from "react";
import { t } from "../../i18n";
import DrawingCanvas from "../../DrawingCanvas";
import ChecklistRow from "../common/ChecklistRow.jsx";
import ModalHeader from "./ModalHeader.jsx";
import ModalFooter from "./ModalFooter.jsx";
import ModalImagesGrid from "./ModalImagesGrid.jsx";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog.jsx";
import CollaborationModal from "./CollaborationModal.jsx";
import FullscreenImageViewer from "./FullscreenImageViewer.jsx";
import useChecklistDrag from "../../hooks/useChecklistDrag.js";
import useModalHistory from "../../hooks/useModalHistory.js";
import { renderSafeMarkdown } from "../../utils/markdown.jsx";
import { handleSmartEnter } from "../common/FormatToolbar.jsx";
import { uid } from "../../utils/helpers.js";
import { modalBgFor, scrollColorsFor, solid, bgFor, toHex } from "../../utils/colors.js";
import { setThemeColor } from "../../utils/helpers.js";

export default function NoteModal({
  // visibility / animation
  open,
  isModalClosing,
  // theme & layout
  dark,
  windowWidth,
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
  onModalBodyClick,
  resizeModalTextarea,
  // checklist handlers
  syncChecklistItems,
  checklistInsertPosition,
  // direct draw mode
  initialDrawMode,
  onConsumeInitialDrawMode,
}) {
  const [autoEditId, setAutoEditId] = React.useState(null);
  const [drawMode, setDrawMode] = React.useState("view");
  const [drawToolbarEl, setDrawToolbarEl] = React.useState(null);
  const isDrawEdit = mType === 'draw' && drawMode === 'draw';
  const isDrawView = mType === 'draw' && drawMode !== 'draw';
  const { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } =
    useChecklistDrag(mItems, setMItems, syncChecklistItems);

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

  /* Sync PWA status bar color with note color */
  React.useEffect(() => {
    if (!open) return;
    const pageColor = dark ? "#1a1a1a" : "#f0e8ff";
    const color = (!mColor || mColor === "default") ? pageColor : toHex(solid(bgFor(mColor, dark)));
    setThemeColor(color);
    return () => setThemeColor(pageColor);
  }, [open, mColor, dark]);

  /* Intercept Ctrl+Z / Ctrl+Y at modal level for chunk-level undo */
  const handleModalKeyDown = React.useCallback(
    (e) => {
      if (mType !== "text" || viewMode) return; // let native handle non-text
      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      }
    },
    [undo, redo, mType, viewMode],
  );

  if (!open && !isModalClosing) return null;

  return (
    <>
      <div
        className={`modal-scrim note-scrim-anim${isModalClosing ? ' closing' : ''} fixed inset-0 bg-black/40 max-sm:bg-black z-40 flex items-center justify-center overscroll-contain`}
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
          className={`note-modal-anim${isModalClosing ? ' closing' : ''} glass-card rounded-none shadow-none w-full max-w-none modal-resize-smooth ${
            isDrawEdit ? 'sm:w-screen sm:max-w-none sm:h-screen sm:!rounded-none'
            : 'sm:w-11/12 sm:max-w-3xl lg:max-w-4xl sm:h-[95vh] sm:rounded-xl'
          } flex flex-col relative overflow-hidden`}
          style={{ backgroundColor: modalBgFor(mColor, dark), height: windowWidth < 640 ? '100dvh' : undefined }}
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

            <ModalImagesGrid
              images={mImages}
              onOpenViewer={openImageViewer}
              onRemoveImage={(id) => setMImages((prev) => prev.filter((x) => x.id !== id))}
            />

            {/* Content area */}
            <div
              key={isDrawEdit ? 'draw' : viewMode ? 'view' : 'edit'}
              className={`${isDrawEdit ? "flex-1 min-h-0 flex flex-col" : isDrawView ? "px-6 pt-3 pb-6 max-sm:px-4 max-sm:pt-1 max-sm:pb-4" : "px-6 pt-3 pb-12 max-sm:pt-1 max-sm:pb-4"} ${!isDrawEdit ? "modal-content-fade" : ""}`}
              onClick={onModalBodyClick}
            >

              {/* Text, Checklist, or Drawing */}
              {mType === "text" ? (
                viewMode ? (
                  <div
                    ref={noteViewRef}
                    className="note-content note-content--dense whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{
                      __html: renderSafeMarkdown(mBody),
                    }}
                  />
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
                <div className="space-y-4 md:space-y-2">
                  {/* Add new item row — top position */}
                  {checklistInsertPosition === "top" && (
                    <div
                      className="flex items-center gap-2 cursor-pointer p-2 border-b border-[var(--border-light)] text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-100 transition-colors"
                      onClick={() => {
                        const newItem = { id: uid(), text: "", done: false };
                        const newItems = [newItem, ...mItems];
                        setMItems(newItems);
                        setAutoEditId(newItem.id);
                        syncChecklistItems(newItems);
                      }}
                    >
                      <span className="text-lg leading-none">+</span>
                      <span className="text-sm">{t("listItemEllipsis")}</span>
                    </div>
                  )}

                  {mItems.length > 0 ? (
                    <div className="space-y-4 md:space-y-2">
                      {/* Unchecked items */}
                      {mItems
                        .filter((it) => !it.done)
                        .map((it) => (
                          <div
                            key={it.id}
                            data-checklist-item={it.id}
                            className="group flex items-center gap-2"
                          >
                            <div
                              onPointerDown={(e) => handlePointerDown(it.id, e)}
                              onPointerMove={handlePointerMove}
                              onPointerUp={handlePointerUp}
                              onPointerCancel={handlePointerCancel}
                              className="flex items-center justify-center px-1 checklist-grab-handle opacity-40 group-hover:opacity-70 transition-opacity"
                              style={{ touchAction: "none" }}
                            >
                              <div className="grid grid-cols-2 gap-0.5">
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
                              </div>
                            </div>

                            <div className="flex-1">
                              <ChecklistRow
                                item={it}
                                readOnly={false}
                                disableToggle={false}
                                showRemove={true}
                                size="lg"
                                initialEditing={autoEditId === it.id}
                                onToggle={(checked, e) => {
                                  e?.stopPropagation();
                                  const newItems = mItems.map((p) =>
                                    p.id === it.id ? { ...p, done: checked } : p,
                                  );
                                  setMItems(newItems);
                                  syncChecklistItems(newItems);
                                }}
                                onChange={(txt) => {
                                  const newItems = mItems.map((p) =>
                                    p.id === it.id ? { ...p, text: txt } : p,
                                  );
                                  setMItems(newItems);
                                  syncChecklistItems(newItems);
                                }}
                                onRemove={() => {
                                  const newItems = mItems.filter(
                                    (p) => p.id !== it.id,
                                  );
                                  setMItems(newItems);
                                  syncChecklistItems(newItems);
                                }}
                              />
                            </div>
                          </div>
                        ))}

                      {/* Add new item row — bottom position */}
                      {checklistInsertPosition === "bottom" && (
                        <div
                          className="flex items-center gap-2 cursor-pointer p-2 border-b border-[var(--border-light)] text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-100 transition-colors"
                          onClick={() => {
                            const newItem = { id: uid(), text: "", done: false };
                            const newItems = [...mItems, newItem];
                            setMItems(newItems);
                            setAutoEditId(newItem.id);
                            syncChecklistItems(newItems);
                          }}
                        >
                          <span className="text-lg leading-none">+</span>
                          <span className="text-sm">{t("listItemEllipsis")}</span>
                        </div>
                      )}

                      {/* Done section */}
                      {mItems.filter((it) => it.done).length > 0 && (
                        <>
                          <div className="border-t border-[var(--border-light)] pt-4 mt-4">
                            <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">{t("done")}</h4>
                            {mItems
                              .filter((it) => it.done)
                              .map((it) => (
                                <ChecklistRow
                                  key={it.id}
                                  item={it}
                                  readOnly={false}
                                  disableToggle={false}
                                  showRemove={true}
                                  size="lg"
                                  onToggle={(checked, e) => {
                                    e?.stopPropagation();
                                    if (!checked) {
                                      const unchecked = mItems.filter((p) => !p.done && p.id !== it.id);
                                      const checkedItems = mItems.filter((p) => p.done && p.id !== it.id);
                                      const restored = { ...it, done: false };
                                      const newUnchecked = checklistInsertPosition === "top"
                                        ? [restored, ...unchecked]
                                        : [...unchecked, restored];
                                      const newItems = [...newUnchecked, ...checkedItems];
                                      setMItems(newItems);
                                      syncChecklistItems(newItems);
                                    } else {
                                      const newItems = mItems.map((p) =>
                                        p.id === it.id ? { ...p, done: checked } : p,
                                      );
                                      setMItems(newItems);
                                      syncChecklistItems(newItems);
                                    }
                                  }}
                                  onChange={(txt) => {
                                    const newItems = mItems.map((p) =>
                                      p.id === it.id ? { ...p, text: txt } : p,
                                    );
                                    setMItems(newItems);
                                    syncChecklistItems(newItems);
                                  }}
                                  onRemove={() => {
                                    const newItems = mItems.filter(
                                      (p) => p.id !== it.id,
                                    );
                                    setMItems(newItems);
                                    syncChecklistItems(newItems);
                                  }}
                                />
                              ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">{t("noItemsYet")}</p>
                  )}

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
                  {mBody ? (
                    <div
                      className="note-content note-content--dense whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{
                        __html: renderSafeMarkdown(mBody),
                      }}
                    />
                  ) : (
                    <p className="text-sm text-gray-400 dark:text-gray-500 italic">{t("noTextContent")}</p>
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
            onDownloadNote={handleDownloadNote}
            onRestoreFromTrash={restoreFromTrash}
            onArchiveNote={handleArchiveNote}
            onOpenConfirmDelete={() => setConfirmDeleteOpen(true)}
            undo={undo}
            redo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
          />

          <ConfirmDeleteDialog
            open={confirmDeleteOpen}
            dark={dark}
            isTrashed={tagFilter === "TRASHED"}
            onClose={() => setConfirmDeleteOpen(false)}
            onConfirm={async () => {
              setConfirmDeleteOpen(false);
              await deleteModal();
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
        />
      )}
    </>
  );
}
