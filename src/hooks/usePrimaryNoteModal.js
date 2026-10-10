/**
 * Opening and closing of the primary note modal, the app's regular one:
 * open a note from anywhere (card, deep link, notification, side-by-side
 * hand-off), animate the modal out once useNoteActions' closeModal has
 * flushed the edits, force it closed when the note disappears remotely.
 *
 * The side-by-side right pane opens from its noteId prop and leaves its
 * closing animation to the shell (see SecondaryNoteInstance).
 */
export default function usePrimaryNoteModal({
  modal,
  editor,
  noteAi,
  notes,
  setSidebarOpen,
  setSbsSuppressOpenReplay,
  allNotifications,
  dismissNotification,
  releaseLocalLease,
}) {
  const {
    setActiveId, activeIdRef, setOpen, setViewMode, setConfirmDeleteOpen,
    setIsModalClosing, modalClosingTimerRef, setShowModalFmt, setImgViewOpen,
  } = modal;
  const { loadNote, pendingDrawingSaveRef, drawingDebounceTimerRef } = editor;
  const { noteAiOpen, setNoteAiOpen } = noteAi;

  const openModal = (id) => {
    const n = notes.find((x) => String(x.id) === String(id));
    if (!n) return;
    // Opening a note acknowledges any pending reminder for it: clear the
    // in-app reminder notification(s) for this note so they don't linger
    // after you've opened it (e.g. by tapping the system/push notification,
    // which deep-links here without going through the card's own button).
    // dismiss() acks "delivered", which also clears the card on the user's
    // other devices, so desktop ↔ mobile stay in sync.
    try {
      const sid = String(id);
      (allNotifications || []).forEach((notif) => {
        if (
          notif &&
          notif.type === "reminder" &&
          (String(notif.metadata?.noteId) === sid || String(notif.action?.noteId) === sid)
        ) {
          dismissNotification(notif.id);
        }
      });
    } catch {
      /* best-effort: never block opening the note */
    }
    setSidebarOpen(false);
    setSbsSuppressOpenReplay(false);
    loadNote(n);

    // If this note has a saved AI conversation in localStorage, pre-load
    // the messages and mark the panel as "has been opened" so the header
    // toggle is immediately visible (the user can resume the saved chat
    // without having to re-open via the kebab menu).
    noteAi.restoreSavedNoteAi(id);
  };

  // The note no longer exists for this user (deleted elsewhere, access
  // revoked): close it if it is the one open, without saving anything.
  const closeNoteIfOpen = (noteId) => {
    if (String(activeIdRef.current) === noteId) {
      forceCloseModalForRemoteDelete(noteId);
    }
  };

  // Force-close modal without any save/flush: used when a remote session
  // permanently deletes the note that is currently open. Must not trigger
  // autoSaveTextNote, flushPendingDrawingSave, or any enqueueAndSync.
  const forceCloseModalForRemoteDelete = (noteId) => {
    const nid = String(noteId);

    // Cancel any pending drawing debounce so flush never fires.
    // Release the lease since the note no longer exists.
    const pending = pendingDrawingSaveRef.current;
    if (pending && String(pending.noteId) === nid) {
      if (drawingDebounceTimerRef.current) {
        clearTimeout(drawingDebounceTimerRef.current);
        drawingDebounceTimerRef.current = null;
      }
      if (pending.leaseId) releaseLocalLease(nid, pending.leaseId);
      pendingDrawingSaveRef.current = null;
    }

    // Cancel in-flight close animation (if any)
    if (modalClosingTimerRef.current) {
      clearTimeout(modalClosingTimerRef.current);
      modalClosingTimerRef.current = null;
    }

    // Reset all modal state immediately: no animation, no save
    // (history cleanup is handled by the centralized overlay back-button system)
    setOpen(false);
    setActiveId(null);
    setViewMode(true);
    setConfirmDeleteOpen(false);
    setShowModalFmt(false);
    setIsModalClosing(false);
    setImgViewOpen(false);
  };

  // Run the modal exit animation. If the AI side panel is open, close
  // it first with its own slide-back animation, then kick off the modal
  // fade-out: this gives a clean sequential close instead of both
  // animations playing at the same time. The same modalClosingTimerRef
  // guards re-entry through both phases.
  const startModalExitAnimation = () => {
    const PANEL_CLOSE_DURATION = 640; // matches NoteModal's aiClosing window
    const MODAL_FADE_DURATION = 180;
    const beginFade = () => {
      setIsModalClosing(true);
      modalClosingTimerRef.current = setTimeout(() => {
        modalClosingTimerRef.current = null;
        setOpen(false);
        setActiveId(null);
        setViewMode(true);
        setConfirmDeleteOpen(false);
        setShowModalFmt(false);
        setIsModalClosing(false);
        noteAi.resetNoteAiAfterClose();
      }, MODAL_FADE_DURATION);
    };
    if (noteAiOpen) {
      setNoteAiOpen(false);
      // Cancel any in-flight AI request so chunks don't arrive after
      // the note has unmounted.
      noteAi.stopNoteAi();
      modalClosingTimerRef.current = setTimeout(() => {
        modalClosingTimerRef.current = null;
        beginFade();
      }, PANEL_CLOSE_DURATION);
    } else {
      beginFade();
    }
  };

  // The end of every closeModal of the primary pane.
  const animateClose = () => {
    // Clear the post-SBS replay-suppression flag so noteModalOut can run
    // unblocked when the user closes the survivor.
    setSbsSuppressOpenReplay(false);
    // Sequential close: if the AI panel is open, it animates out first.
    startModalExitAnimation();
  };

  return {
    openModal,
    closeNoteIfOpen,
    animateClose,
  };
}
