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
import { renderSafeMarkdown } from "../../utils/markdown.jsx";
import { handleSmartEnter } from "../common/FormatToolbar.jsx";
import { uid } from "../../utils/helpers.js";
import { modalBgFor, scrollColorsFor, solid, bgFor } from "../../utils/colors.js";

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
  checklistDragId,
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
  onChecklistDragStart,
  onChecklistDragOver,
  onChecklistDragLeave,
  onChecklistDrop,
  onChecklistDragEnd,
}) {
  if (!open && !isModalClosing) return null;

  return (
    <>
      <div
        className={`modal-scrim note-scrim-anim${isModalClosing ? ' closing' : ''} fixed inset-0 bg-black/40 z-40 flex items-center justify-center overscroll-contain`}
        onMouseDown={(e) => {
          // Only consider closing if the press STARTS on the scrim
          scrimClickStartRef.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          // Close only if press started AND ended on scrim (prevents drag-outside-close)
          if (scrimClickStartRef.current && e.target === e.currentTarget) {
            closeModal();
          }
          scrimClickStartRef.current = false;
        }}
      >
        <div
          className={`note-modal-anim${isModalClosing ? ' closing' : ''} glass-card rounded-none shadow-2xl w-full h-full max-w-none sm:w-11/12 sm:max-w-3xl lg:max-w-4xl sm:h-[95vh] sm:rounded-xl flex flex-col relative overflow-hidden`}
          style={{ backgroundColor: modalBgFor(mColor, dark) }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Scroll container */}
          <div
            ref={modalScrollRef}
            className="relative flex-1 min-h-0 overflow-y-auto overflow-x-auto mobile-hide-scrollbar modal-scroll-themed"
            style={(() => {
              const sc = scrollColorsFor(mColor, dark);
              const noteColorBtn = (!dark && (!mColor || mColor === "default"))
                ? "#a78bfa"
                : solid(bgFor(mColor, dark));
              const noteColorOpaque = typeof noteColorBtn === "string" ? noteColorBtn.replace(/,\s*[\d.]+\)$/, ', 1)') : noteColorBtn;
              return { scrollbarColor: `${sc.thumb} ${sc.track}`, '--sb-thumb': sc.thumb, '--sb-track': sc.track, '--note-color': noteColorBtn, '--note-color-opaque': noteColorOpaque };
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
              onToggleViewMode={() => {
                setViewMode((v) => !v);
                setShowModalFmt(false);
              }}
              onOpenCollaboration={async () => {
                setCollaborationModalOpen(true);
                if (activeId) {
                  await loadCollaboratorsForAddModal(activeId);
                }
              }}
              modalFmtBtnRef={modalFmtBtnRef}
              showModalFmt={showModalFmt}
              setShowModalFmt={setShowModalFmt}
              onFormatModal={formatModal}
              modalMenuBtnRef={modalMenuBtnRef}
              modalMenuOpen={modalMenuOpen}
              setModalMenuOpen={setModalMenuOpen}
              activeId={activeId}
              notes={notes}
              tagFilter={tagFilter}
              activeNoteObj={activeNoteObj}
              onDownloadNote={handleDownloadNote}
              onRestoreFromTrash={restoreFromTrash}
              onArchiveNote={handleArchiveNote}
              onOpenConfirmDelete={() => setConfirmDeleteOpen(true)}
              onTogglePin={togglePin}
              onClose={closeModal}
              modalScrollRef={modalScrollRef}
              savedModalScrollRatioRef={savedModalScrollRatioRef}
            />

            <ModalImagesGrid
              images={mImages}
              onOpenViewer={openImageViewer}
              onRemoveImage={(id) => setMImages((prev) => prev.filter((x) => x.id !== id))}
            />

            {/* Content area */}
            <div
              className={mType === "draw" ? "p-2 pb-6" : "p-6 pb-12"}
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
                      className="w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none overflow-hidden min-h-[160px]"
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

                          // Check if cursor is on the last line before Enter
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

                              // If we were on the last line, scroll down a bit to ensure cursor visibility
                              if (isOnLastLine) {
                                const modalScrollEl = modalScrollRef.current;
                                if (modalScrollEl) {
                                  setTimeout(() => {
                                    modalScrollEl.scrollTop += 30; // Scroll down by 30px
                                  }, 50);
                                }
                              }
                            });
                          } else if (isOnLastLine) {
                            // If not handled by smart enter but on last line, allow normal Enter but scroll down
                            setTimeout(() => {
                              const modalScrollEl = modalScrollRef.current;
                              if (modalScrollEl) {
                                modalScrollEl.scrollTop += 30; // Scroll down by 30px
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
                  {/* Add new item row */}
                  <div className="flex gap-2">
                      <input
                        value={mInput}
                        onChange={(e) => setMInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const t = mInput.trim();
                            if (t) {
                              const newItems = [
                                ...mItems,
                                { id: uid(), text: t, done: false },
                              ];
                              setMItems(newItems);
                              setMInput("");
                              syncChecklistItems(newItems);
                            }
                          }
                        }}
                        placeholder={t("listItemEllipsis")}
                        className="flex-1 bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2 border-b border-[var(--border-light)]"
                      />
                      <button
                        onClick={() => {
                          const t = mInput.trim();
                          if (t) {
                            const newItems = [
                              ...mItems,
                              { id: uid(), text: t, done: false },
                            ];
                            setMItems(newItems);
                            setMInput("");
                            syncChecklistItems(newItems);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                      >{t("add")}</button>
                  </div>

                  {mItems.length > 0 ? (
                    <div className="space-y-4 md:space-y-2">
                      {/* Unchecked items */}
                      {mItems
                        .filter((it) => !it.done)
                        .map((it) => (
                          <div
                            key={it.id}
                            data-checklist-item={it.id}
                            onDragOver={(e) => onChecklistDragOver(it.id, e)}
                            onDragLeave={onChecklistDragLeave}
                            onDrop={(e) => onChecklistDrop(it.id, e)}
                            className="group flex items-center gap-2"
                          >
                            {/* Drag handle */}
                            <div
                              draggable
                              onDragStart={(e) =>
                                onChecklistDragStart(it.id, e)
                              }
                              onDragEnd={onChecklistDragEnd}
                              onTouchStart={(e) => {
                                // Handle touch drag start - only when touching the handle
                                const target = e.currentTarget.closest(
                                  "[data-checklist-item]",
                                );
                                if (target) {
                                  checklistDragId.current = String(it.id);
                                  target.classList.add("dragging");
                                }
                              }}
                              onTouchMove={(e) => {
                                if (!checklistDragId.current) return;

                                const touch = e.touches[0];
                                const elementAtPoint =
                                  document.elementFromPoint(
                                    touch.clientX,
                                    touch.clientY,
                                  );
                                if (elementAtPoint) {
                                  // Find the checklist item container
                                  const checklistItem = elementAtPoint.closest(
                                    "[data-checklist-item]",
                                  );
                                  if (
                                    checklistItem &&
                                    checklistItem !==
                                      e.currentTarget.closest(
                                        "[data-checklist-item]",
                                      )
                                  ) {
                                    const dragOverEvent = new Event(
                                      "dragover",
                                      { bubbles: true },
                                    );
                                    checklistItem.dispatchEvent(dragOverEvent);
                                  }
                                }
                              }}
                              onTouchEnd={(e) => {
                                if (!checklistDragId.current) return;
                                const touch = e.changedTouches[0];
                                const elementAtPoint =
                                  document.elementFromPoint(
                                    touch.clientX,
                                    touch.clientY,
                                  );
                                const target = e.currentTarget.closest(
                                  "[data-checklist-item]",
                                );

                                if (elementAtPoint) {
                                  const checklistItem = elementAtPoint.closest(
                                    "[data-checklist-item]",
                                  );
                                  if (
                                    checklistItem &&
                                    checklistItem !== target
                                  ) {
                                    const dropEvent = new Event("drop", {
                                      bubbles: true,
                                    });
                                    checklistItem.dispatchEvent(dropEvent);
                                  }
                                }

                                if (target) {
                                  target.classList.remove("dragging");
                                }
                                checklistDragId.current = null;

                                // Clean up any remaining drag-over states
                                document
                                  .querySelectorAll(".drag-over")
                                  .forEach((el) => {
                                    el.classList.remove("drag-over");
                                  });
                              }}
                              className="flex items-center justify-center px-1 cursor-grab active:cursor-grabbing opacity-40 group-hover:opacity-70 transition-opacity"
                              style={{ touchAction: "none" }}
                            >
                              <div className="grid grid-cols-2 gap-0.5">
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                              </div>
                            </div>

                            <div className="flex-1">
                              <ChecklistRow
                                item={it}
                                readOnly={false}
                                disableToggle={false}
                                showRemove={true}
                                size="lg"
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
                              ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">{t("noItemsYet")}</p>
                  )}
                </div>
              ) : (
                <DrawingCanvas
                  data={mDrawingData}
                  onChange={setMDrawingData}
                  width={750}
                  height={850}
                  readOnly={false}
                  darkMode={dark}
                  initialMode="view"
                />
              )}

              {/* Inline Edited stamp: only when scrollable (appears at very end) */}
              {editedStamp && modalScrollable && (
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

            {/* Absolute Edited stamp: only when NOT scrollable (sits just above footer) */}
            {editedStamp && !modalScrollable && (
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
            mColor={mColor}
            setMColor={setMColor}
            modalColorBtnRef={modalColorBtnRef}
            showModalColorPop={showModalColorPop}
            setShowModalColorPop={setShowModalColorPop}
            modalFileRef={modalFileRef}
            addImagesToState={addImagesToState}
            setMImages={setMImages}
            modalHasChanges={modalHasChanges}
            mType={mType}
            isCollaborativeNote={isCollaborativeNote}
            activeId={activeId}
            savingModal={savingModal}
            onSave={saveModal}
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
