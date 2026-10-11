import React, { useEffect, useRef } from "react";
import NoteModal from "./NoteModal.jsx";
import useModalState from "../../hooks/useModalState.js";
import useCollaboration from "../../hooks/useCollaboration.js";
import useNoteAiChat from "../../hooks/useNoteAiChat.js";
import useNoteEditor from "../../hooks/useNoteEditor.js";
import useNoteActions from "../../hooks/useNoteActions.js";
import useNoteIconActions from "../../hooks/useNoteIconActions.js";

/**
 * SecondaryNoteInstance: self-contained per-note modal controller used as
 * the right-hand pane in side-by-side mode. It runs the primary modal's
 * hooks (useModalState, useNoteEditor, useNoteActions, useNoteAiChat,
 * useCollaboration) on its own modal state, so both panes share the same
 * edit, autosave and action code. The primary pane stays driven by
 * App.jsx so the single-note flow is untouched.
 *
 * The two panes coexist visually as siblings under the same shared scrim
 * via NoteModal's splitMode/splitSide props (split-mode CSS positions
 * them at left/right halves and animates a pane closing while the
 * survivor recenters).
 */
export default function SecondaryNoteInstance({
  noteId,                       // requested id (null/undefined = closed)
  splitSide = "right",
  splitClosing,
  forceClosing = false,         // shell-driven close-both signal: OR-s into NoteModal's isModalClosing
  // shell callback: close requested (edits flushed), the shell drives the animation
  onRequestClosing,
  // ref the pane keeps pointing at its closeNoteIfOpen, for App's note-gone path
  closeNoteIfOpenRef,
  // SBS AI coordination: shell passes the side ("left" for the right pane in
  // SBS, mirroring the active note) and a flag that hides this pane while the
  // OPPOSITE pane's AI panel takes over its slot. AI open/close callbacks let
  // the shell drive sbsAiActiveSide.
  aiPanelSide,
  sbsOppositeHidden = false,
  onAiOpen,
  onAiClose,
  // shared state & helpers (all owned by App.jsx)
  notes, setNotes,
  currentUser, sessionId, token,
  dark, windowWidth, isLandscapeMobile, isWebView, edgeToEdgeLandscape,
  tagFilter, setTagFilter, tagsWithCounts,
  logoLibrary, addLogoToLibrary, deleteLogoFromLibrary, applyNoteIcon,
  editorToolbarMode, pasteMode, checklistInsertPosition, checklistRemoveSectionBehavior,
  reminderTimeChips, onReminderTimeChipsChange,
  aiAssistantEnabled,
  syncState,
  flushNoteSync,
  // Persistence
  acquireLocalLease, releaseLocalLease, releaseLocalLeaseWithPrune,
  isNoteLocallyProtected,
  enqueueAndSync, enqueueWithLease,
  addDeleteTombstone,
  // UI helpers
  showToast,
  showGenericConfirm,
  dismissNoteReminders,
  isCollaborativeNote,
  readModeEnabled = true,
}) {
  // ─── Modal state (own instance) ────────────────────────────────────────
  const closeModalRef = useRef(null);
  const modal = useModalState({ notes, currentUser, closeModalRef });
  const {
    open, setOpen,
    activeId, setActiveId,
    activeIdRef,
    mType,
    mTitle, setMTitle,
    mBody, setMBody,
    mTagList, setMTagList,
    tagInput, setTagInput,
    modalTagFocused, setModalTagFocused,
    mColor, setMColor,
    viewMode, setViewMode,
    mImages, setMImages,
    savingModal,
    confirmDeleteOpen, setConfirmDeleteOpen,
    isModalClosing,
    mItems, setMItems,
    mDrawingData, setMDrawingData,
    showModalFmt, setShowModalFmt,
    showModalColorPop, setShowModalColorPop,
    modalKebabOpen, setModalKebabOpen,
    reminderPopOpen, setReminderPopOpen,
    imageMenuOpen, setImageMenuOpen,
    logoPickerOpen, setLogoPickerOpen,
    imgViewOpen, imgViewIndex,
    mobileNavVisible,
    modalScrollable,
    modalTagInputRef, modalTagBtnRef, suppressTagBlurRef,
    mBodyRef, modalFileRef, modalIconFileRef, modalFmtBtnRef, modalColorBtnRef,
    scrimClickStartRef,
    noteViewRef, modalScrollRef, savedModalScrollRatioRef,
    activeNoteObj, editedStamp, modalHasChanges,
    addTags, handleTagKeyDown, handleTagBlur, handleTagPaste,
    openImageViewer, closeImageViewer, nextImage, prevImage, resetMobileNav,
    onModalBodyClick,
  } = modal;

  // ─── Collaboration (own instance) ──────────────────────────────────────
  const {
    collaborationModalOpen, setCollaborationModalOpen,
    addModalCollaborators,
    removeCollaborator,
    loadCollaboratorsForAddModal,
    addCollaboratorsBatch,
    setCollaboratorAccess,
    availableUsers,
    availableLoading,
  } = useCollaboration(token, {
    currentUser, activeId,
    flushNoteSync,
    showToast,
  });

  // ─── Note-AI chat (own instance) ───────────────────────────────────────
  const noteAi = useNoteAiChat({
    open,
    activeId,
    note: { mTitle, mType, mTagList, mItems, mDrawingData, mBody },
    onOpen: onAiOpen,
    onClose: onAiClose,
    onModalClose: onAiClose,
    errorLabel: "Note AI error (secondary):",
  });
  const { restoreSavedNoteAi } = noteAi;

  // ─── Persistence of the open note (own instance) ───────────────────────
  const editor = useNoteEditor({
    modal,
    notes,
    setNotes,
    currentUser,
    sessionId,
    readModeEnabled,
    acquireLocalLease,
    releaseLocalLease,
    releaseLocalLeaseWithPrune,
    isNoteLocallyProtected,
    enqueueAndSync,
    enqueueWithLease,
  });
  const {
    initialDrawMode, setInitialDrawMode, loadNote, syncChecklistItems, discardPendingDrawingSave,
    materializeDraftIfNeeded,
  } = editor;

  // Open whenever the controlled noteId prop changes
  useEffect(() => {
    if (noteId && (!open || String(activeId) !== String(noteId))) {
      const n = notes.find((x) => String(x.id) === String(noteId));
      if (!n) return;
      dismissNoteReminders(noteId);
      loadNote(n);
      restoreSavedNoteAi(noteId);
    } else if (!noteId && open) {
      // External request to drop without animation
      setOpen(false);
      setActiveId(null);
    }
  }, [noteId]); // eslint-disable-line react-hooks/exhaustive-deps -- reacts to the requested note only, not to its own open state

  // ─── Note actions (own instance) ───────────────────────────────────────
  // Closing only signals the shell: it drives the timeline in lockstep with
  // the LEFT pane's recenter animation and unmounts this pane when done
  // (the splitClosing CSS rule on the scrim drives the visible fade-out).
  const {
    closeModal, saveOnClose, saveModal, deleteModal, restoreFromTrash,
    handleArchiveNote, togglePin, setNoteReminder, convertNoteType, duplicateActiveNote,
    handleDownloadNote, addImagesToState,
  } = useNoteActions({
    modal,
    editor,
    notes,
    setNotes,
    currentUser,
    sessionId,
    tagFilter,
    setTagFilter,
    acquireLocalLease,
    releaseLocalLeaseWithPrune,
    addDeleteTombstone,
    enqueueAndSync,
    enqueueWithLease,
    showToast,
    showGenericConfirm,
    applyNoteIcon,
    finishClose: onRequestClosing,
  });
  // eslint-disable-next-line react-hooks/refs -- keeps the ref given to useModalState pointing at the latest closeModal
  closeModalRef.current = closeModal;

  // Close-both (backdrop click): the shell animates both panes out, this
  // pane saves like its own close does.
  useEffect(() => {
    if (forceClosing) saveOnClose();
  }, [forceClosing]); // eslint-disable-line react-hooks/exhaustive-deps -- runs once per close-both signal, on the edits of that render

  // The note no longer exists for this user (deleted elsewhere, access
  // revoked): like the primary modal, the pane drops it at once without
  // saving anything, then the shell recenters the left pane.
  useEffect(() => {
    closeNoteIfOpenRef.current = (noteId) => {
      if (String(activeIdRef.current) !== noteId) return;
      discardPendingDrawingSave(noteId);
      setOpen(false);
      setActiveId(null);
      onRequestClosing();
    };
    return () => { closeNoteIfOpenRef.current = null; };
  });

  // ─── Note icon (PER-USER, never synced) ────────────────────────────────
  const { setNoteIconFromFile, removeNoteIcon, pickNoteIcon } = useNoteIconActions({
    noteId: activeId, applyNoteIcon, addLogoToLibrary, materializeDraftIfNeeded,
  });

  if (!noteId) return null;

  return (
    <NoteModal
      open={open}
      isModalClosing={isModalClosing || forceClosing}
      splitMode
      splitSide={splitSide}
      splitClosing={splitClosing}
      aiPanelSide={aiPanelSide}
      sbsOppositeHidden={sbsOppositeHidden}
      dark={dark}
      windowWidth={windowWidth}
      isLandscapeMobile={isLandscapeMobile}
      isWebView={isWebView}
      edgeToEdgeLandscape={edgeToEdgeLandscape}
      activeId={activeId}
      mType={mType}
      mTitle={mTitle}
      setMTitle={setMTitle}
      mBody={mBody}
      setMBody={setMBody}
      mColor={mColor}
      setMColor={setMColor}
      viewMode={viewMode}
      setViewMode={setViewMode}
      readModeEnabled={readModeEnabled}
      mImages={mImages}
      setMImages={setMImages}
      mItems={mItems}
      setMItems={setMItems}
      mDrawingData={mDrawingData}
      setMDrawingData={setMDrawingData}
      mTagList={mTagList}
      setMTagList={setMTagList}
      tagInput={tagInput}
      setTagInput={setTagInput}
      modalTagFocused={modalTagFocused}
      setModalTagFocused={setModalTagFocused}
      modalScrollRef={modalScrollRef}
      mBodyRef={mBodyRef}
      noteViewRef={noteViewRef}
      modalFileRef={modalFileRef}
      modalIconFileRef={modalIconFileRef}
      modalFmtBtnRef={modalFmtBtnRef}
      modalTagInputRef={modalTagInputRef}
      modalTagBtnRef={modalTagBtnRef}
      suppressTagBlurRef={suppressTagBlurRef}
      modalColorBtnRef={modalColorBtnRef}
      scrimClickStartRef={scrimClickStartRef}
      savedModalScrollRatioRef={savedModalScrollRatioRef}
      activeNoteObj={activeNoteObj}
      onSetReminder={setNoteReminder}
      editedStamp={editedStamp}
      modalHasChanges={modalHasChanges}
      modalScrollable={modalScrollable}
      tagsWithCounts={tagsWithCounts}
      addTags={addTags}
      handleTagKeyDown={handleTagKeyDown}
      handleTagBlur={handleTagBlur}
      handleTagPaste={handleTagPaste}
      showModalFmt={showModalFmt}
      setShowModalFmt={setShowModalFmt}
      showModalColorPop={showModalColorPop}
      setShowModalColorPop={setShowModalColorPop}
      reminderPopOpen={reminderPopOpen}
      setReminderPopOpen={setReminderPopOpen}
      reminderTimeChips={reminderTimeChips}
      onReminderTimeChipsChange={onReminderTimeChipsChange}
      modalKebabOpen={modalKebabOpen}
      setModalKebabOpen={setModalKebabOpen}
      imageMenuOpen={imageMenuOpen}
      setImageMenuOpen={setImageMenuOpen}
      logoPickerOpen={logoPickerOpen}
      setLogoPickerOpen={setLogoPickerOpen}
      confirmDeleteOpen={confirmDeleteOpen}
      setConfirmDeleteOpen={setConfirmDeleteOpen}
      savingModal={savingModal}
      collaborationModalOpen={collaborationModalOpen}
      setCollaborationModalOpen={setCollaborationModalOpen}
      addModalCollaborators={addModalCollaborators}
      addCollaboratorsBatch={addCollaboratorsBatch}
      availableUsers={availableUsers}
      availableLoading={availableLoading}
      removeCollaborator={removeCollaborator}
      setCollaboratorAccess={setCollaboratorAccess}
      loadCollaboratorsForAddModal={loadCollaboratorsForAddModal}
      imgViewOpen={imgViewOpen}
      imgViewIndex={imgViewIndex}
      mobileNavVisible={mobileNavVisible}
      openImageViewer={openImageViewer}
      closeImageViewer={closeImageViewer}
      nextImage={nextImage}
      prevImage={prevImage}
      resetMobileNav={resetMobileNav}
      notes={notes}
      currentUser={currentUser}
      tagFilter={tagFilter}
      closeModal={closeModal}
      saveModal={saveModal}
      deleteModal={deleteModal}
      restoreFromTrash={restoreFromTrash}
      handleArchiveNote={handleArchiveNote}
      handleDownloadNote={handleDownloadNote}
      togglePin={togglePin}
      addImagesToState={addImagesToState}
      setNoteIconFromFile={setNoteIconFromFile}
      removeNoteIcon={removeNoteIcon}
      noteIcon={activeNoteObj?.icon || null}
      onPickIcon={pickNoteIcon}
      logoLibrary={logoLibrary}
      deleteLogoFromLibrary={deleteLogoFromLibrary}
      isCollaborativeNote={isCollaborativeNote}
      syncState={syncState}
      onModalBodyClick={onModalBodyClick}
      syncChecklistItems={syncChecklistItems}
      checklistInsertPosition={checklistInsertPosition}
      checklistRemoveSectionBehavior={checklistRemoveSectionBehavior}
      editorToolbarMode={editorToolbarMode}
      pasteMode={pasteMode}
      onConvertNoteType={convertNoteType}
      onDuplicateNote={duplicateActiveNote}
      initialDrawMode={initialDrawMode}
      onConsumeInitialDrawMode={() => setInitialDrawMode(null)}
      aiAssistantEnabled={aiAssistantEnabled}
      {...noteAi.modalProps}
    />
  );
}
