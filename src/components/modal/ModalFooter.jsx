import React from "react";
import FooterColorButton from "./FooterColorButton.jsx";
import FooterImageButton from "./FooterImageButton.jsx";
import FooterTagButton from "./FooterTagButton.jsx";
import FooterUndoRedoButtons from "./FooterUndoRedoButtons.jsx";
import FooterCollaborateButton from "./FooterCollaborateButton.jsx";
import FooterKebabMenu from "./FooterKebabMenu.jsx";
import FooterModeButtons from "./FooterModeButtons.jsx";
import { Trash } from "../../icons/index.jsx";
import TI from "../../icons/editor/index.jsx";
import { modalBgFor } from "../../utils/colors.js";
import { t } from "../../i18n";

// Spoken by screen readers as the save line changes.
const SAVE_STATE_LABELS = {
  saving: "noteSaveSaving",
  saved: "noteSaveSaved",
  offline: "noteSaveOffline",
  error: "noteSaveError",
};

/**
 * Google Keep-style footer toolbar for the note modal.
 * Desktop: icon + text label for each action.
 * Mobile:  icon-only (compact).
 */
export default function ModalFooter({
  dark,
  saveState = "idle",
  onTogglePin,
  reserveNavBar = false,
  rootRef,
  isDesktop,
  // tags
  mTagList,
  setMTagList,
  tagInput,
  setTagInput,
  modalTagFocused,
  setModalTagFocused,
  modalTagInputRef,
  modalTagBtnRef,
  suppressTagBlurRef,
  tagsWithCounts,
  addTags,
  handleTagKeyDown,
  handleTagBlur,
  handleTagPaste,
  // color
  mColor,
  setMColor,
  modalColorBtnRef,
  showModalColorPop,
  setShowModalColorPop,
  // images
  modalFileRef,
  addImagesToState,
  setMImages,
  // note icon (logo badge) — flows through addImagesToState too, then
  // gets stamped with role:"icon" via setNoteIconFromFile (handled in App).
  modalIconFileRef,
  setNoteIconFromFile,
  removeNoteIcon,
  // Per-user note icon: the current icon object (or null) + a setter that
  // persists it through the dedicated per-user endpoint. The icon is NOT in
  // mImages anymore (it's personal, never synced with the note body).
  noteIcon = null,
  onPickIcon,
  // logo library (persistent, per-user)
  logoLibrary = [],
  deleteLogoFromLibrary,
  // collaboration
  onOpenCollaboration,
  // formatting (mobile)
  modalFmtBtnRef,
  showModalFmt,
  setShowModalFmt,
  // view/edit toggle
  mType,
  viewMode,
  readModeEnabled = true,
  readOnlyBadge = false,
  onToggleViewMode,
  // drawing mode toggle
  drawMode,
  onToggleDrawMode,
  onExitDrawToView,
  modalScrollRef,
  savedModalScrollRatioRef,
  // actions
  activeId,
  notes,
  tagFilter,
  activeNoteObj,
  addModalCollaborators,
  currentUser,
  onDownloadNote,
  onRestoreFromTrash,
  onArchiveNote,
  onOpenConfirmDelete,
  // reminders — onSetReminder(noteId, isoStringOrNull)
  onSetReminder,
  // reminder picker open state (lifted to App so the Android back button
  // and the mobile full-screen panel hook into the central overlay stack)
  reminderPopOpen,
  setReminderPopOpen,
  reminderTimeChips,
  onReminderTimeChipsChange,
  // kebab menu (state lifted to App)
  modalKebabOpen,
  setModalKebabOpen,
  // image menu and the logo picker it leads to (lifted to App with the
  // other footer menus, so the Android back button closes them)
  imageMenuOpen,
  setImageMenuOpen,
  logoPickerOpen,
  setLogoPickerOpen,
  // undo / redo
  undo,
  redo,
  canUndo,
  canRedo,
  // note type conversion (text <-> checklist)
  onConvertNoteType,
  // Duplicate the active note (kebab → "Dupliquer la note").
  onDuplicateNote,
  // Per-note AI chat panel — kebab entry
  noteAiAvailable,
  onOpenNoteAi,
}) {
  const isTrashed = tagFilter === "TRASHED";

  const btnClass = isDesktop ? "modal-footer-labeled-btn" : "modal-footer-btn";
  // Mobile sheets take the open note's own background colour.
  const sheetBg = modalBgFor(mColor, dark);

  return (
    <div
      ref={rootRef}
      className={`modal-footer-toolbar border-t border-[var(--border-light)]${isDesktop ? "" : " modal-footer-toolbar--touch"}`}
      data-save-state={isDesktop ? undefined : saveState}
      // The gesture bar sits on top of the keyboard, so its inset would only
      // be dead space above it once the panel has slid up.
      style={reserveNavBar ? { paddingBottom: "max(0px, var(--safe-bottom) - var(--keyboard-inset))" } : undefined}
    >
      {/* Phones: the note's save state, along the footer's top edge
          (.gk-save-line), in place of the header's save check. */}
      {!isDesktop && (
        <>
          <div className="gk-save-line" aria-hidden="true" />
          <span className="sr-only" role="status">{SAVE_STATE_LABELS[saveState] ? t(SAVE_STATE_LABELS[saveState]) : ""}</span>
        </>
      )}
      <div className={`modal-footer-inner flex items-center px-2 sm:px-3 py-1.5 ${isDesktop ? "gap-1" : "gap-0.5"}`}>

        {/* ── Color picker ── */}
        <FooterColorButton
          dark={dark}
          isDesktop={isDesktop}
          btnClass={btnClass}
          sheetBg={sheetBg}
          mColor={mColor}
          setMColor={setMColor}
          modalColorBtnRef={modalColorBtnRef}
          showModalColorPop={showModalColorPop}
          setShowModalColorPop={setShowModalColorPop}
        />

        {/* ── Reminder ── The bell lives in the kebab menu (see below); the
            picker popover is rendered once, anchored to the kebab trigger. */}

        {/* ── Add image / logo (hidden in view mode for draw notes, hidden in
              draw canvas). Audio notes only get the logo: they have no
              content-image flow, and their logo-only button is a separate
              control (its own key). ── */}
        {(mType === "checklist" || mType === "text" || (mType === "draw" && drawMode !== "draw" && !viewMode) || mType === "audio") && (
          <FooterImageButton
            key={mType === "audio" ? "logo" : "image"}
            logoOnly={mType === "audio"}
            dark={dark}
            isDesktop={isDesktop}
            btnClass={btnClass}
            sheetBg={sheetBg}
            modalFileRef={modalFileRef}
            addImagesToState={addImagesToState}
            setMImages={setMImages}
            modalIconFileRef={modalIconFileRef}
            setNoteIconFromFile={setNoteIconFromFile}
            removeNoteIcon={removeNoteIcon}
            noteIcon={noteIcon}
            onPickIcon={onPickIcon}
            logoLibrary={logoLibrary}
            deleteLogoFromLibrary={deleteLogoFromLibrary}
            imageMenuOpen={imageMenuOpen}
            setImageMenuOpen={setImageMenuOpen}
            logoPickerOpen={logoPickerOpen}
            setLogoPickerOpen={setLogoPickerOpen}
          />
        )}

        {/* ── Tag icon + checkbox dropdown ── */}
        <FooterTagButton
          isDesktop={isDesktop}
          btnClass={btnClass}
          sheetBg={sheetBg}
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
        />

        {/* ── Undo / Redo (hidden in draw canvas mode & in text view mode,
              also hidden for audio notes: undo/redo doesn't apply to audio
              clips, the playlist has per-row delete instead).
              Checklist notes are always editable, so the buttons stay
              visible regardless of the viewMode flag. ── */}
        {!(mType === 'draw' && drawMode === 'draw') && mType !== "audio" && (mType === "checklist" || !viewMode) && (
          <FooterUndoRedoButtons
            isDesktop={isDesktop}
            btnClass={btnClass}
            undo={undo}
            redo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        )}

        {/* Mobile-only formatting button: opens the rich-text toolbar
            in a bottom sheet. The desktop ribbon stays in the sticky
            header (handled by NoteModal), so this button is hidden
            there. Available for text notes (always) and draw notes
            when not in canvas mode (their inline text body still uses
            the same rich editor). View mode hides it. */}
        {!isDesktop && !viewMode && (mType === "text" || (mType === "draw" && drawMode !== "draw")) && (
          <button
            ref={modalFmtBtnRef}
            className={`modal-footer-btn modal-footer-btn--fmt focus:outline-none${showModalFmt ? " is-active" : ""}`}
            onClick={() => setShowModalFmt((v) => !v)}
            data-tooltip={t("formatting")}
            aria-pressed={showModalFmt ? "true" : "false"}
          >
            <TI.TextColor />
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1 modal-footer-spacer" />

        {/* ── Collaborate (hidden on mobile text edit mode & draw edit mode: moved to kebab) ── */}
        {(isDesktop || viewMode || mType !== "text") && !(mType === "draw" && drawMode !== "draw" && !viewMode) && (
          <FooterCollaborateButton
            dark={dark}
            isDesktop={isDesktop}
            btnClass={btnClass}
            addModalCollaborators={addModalCollaborators}
            currentUser={currentUser}
            onOpenCollaboration={onOpenCollaboration}
          />
        )}

        {/* ── Delete / Trash (hidden on mobile edit mode: moved to kebab) ── */}
        {(isDesktop || viewMode || mType !== "text") && (
        <button
          className={`${btnClass} modal-footer-btn--trash focus:outline-none`}
          onClick={onOpenConfirmDelete}
          data-tooltip={!isDesktop ? (isTrashed ? t("permanentlyDelete") : t("moveToTrash")) : undefined}
        >
          <Trash />
          {isDesktop && <span>{isTrashed ? t("permanentlyDelete") : t("trash")}</span>}
        </button>
        )}

        {/* ── Kebab menu and the reminder picker it opens ── */}
        <FooterKebabMenu
          dark={dark}
          isDesktop={isDesktop}
          isTrashed={isTrashed}
          sheetBg={sheetBg}
          mType={mType}
          viewMode={viewMode}
          drawMode={drawMode}
          activeId={activeId}
          notes={notes}
          tagFilter={tagFilter}
          activeNoteObj={activeNoteObj}
          onTogglePin={onTogglePin}
          onDownloadNote={onDownloadNote}
          onRestoreFromTrash={onRestoreFromTrash}
          onArchiveNote={onArchiveNote}
          onOpenConfirmDelete={onOpenConfirmDelete}
          onOpenCollaboration={onOpenCollaboration}
          onSetReminder={onSetReminder}
          reminderPopOpen={reminderPopOpen}
          setReminderPopOpen={setReminderPopOpen}
          reminderTimeChips={reminderTimeChips}
          onReminderTimeChipsChange={onReminderTimeChipsChange}
          modalKebabOpen={modalKebabOpen}
          setModalKebabOpen={setModalKebabOpen}
          onConvertNoteType={onConvertNoteType}
          onDuplicateNote={onDuplicateNote}
          noteAiAvailable={noteAiAvailable}
          onOpenNoteAi={onOpenNoteAi}
        />

        {/* ── Read-only badge, or the Edit/View and drawing mode buttons ── */}
        <FooterModeButtons
          isDesktop={isDesktop}
          mType={mType}
          viewMode={viewMode}
          readModeEnabled={readModeEnabled}
          readOnlyBadge={readOnlyBadge}
          addModalCollaborators={addModalCollaborators}
          drawMode={drawMode}
          onToggleViewMode={onToggleViewMode}
          onToggleDrawMode={onToggleDrawMode}
          onExitDrawToView={onExitDrawToView}
          modalScrollRef={modalScrollRef}
          savedModalScrollRatioRef={savedModalScrollRatioRef}
        />
      </div>
    </div>
  );
}
