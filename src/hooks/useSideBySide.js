import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// SBS animation duration: 40ms longer than the CSS --sbs-anim (360ms) so
// React cleanup fires after the transitions have fully settled.
const SBS_ANIM_MS = 400;
// noteModalOut 180ms + 20ms buffer.
const MODAL_FADE_DURATION_SBS = 200;

/**
 * Side-by-side: two selected notes open at once. The PRIMARY (left) pane
 * is the app's regular note modal, driven by `openModal`, so it keeps
 * every feature. The SECONDARY (right) pane is a self-contained
 * SecondaryNoteInstance with its own modal state, autosave, AI chat and
 * collaboration handlers. Closing one pane animates it out and the
 * survivor recenters.
 */
export default function useSideBySide({
  openModal,
  setSbsSuppressOpenReplay,
  setMultiMode,
  setSelectedIds,
  setSidebarOpen,
  mType,
  flushPendingDrawingSave,
  setOpen,
  setActiveId,
  setViewMode,
  setConfirmDeleteOpen,
  setShowModalFmt,
  setIsModalClosing,
}) {
  const [sbsSecondaryId, setSbsSecondaryId] = useState(null);
  const [sbsClosingSide, setSbsClosingSide] = useState(null); // "left" | "right" | null
  const [sbsBothClosing, setSbsBothClosing] = useState(false);
  // Cuts CSS transitions on the primary modal during the final left-close
  // handoff frame. Without it, the primary keeps its closing transform
  // (translateX(-50%-36px) opacity:0) and would visibly transition back to
  // centre when the SBS rules drop, a left→right kick. Only transition is
  // suppressed; animation: noteModalIn must remain so it doesn't restart
  // when the class is removed.
  const [sbsHandoffNoTransition, setSbsHandoffNoTransition] = useState(false);

  // SBS AI coordination: when one note opens its AI panel in SBS mode,
  // the AI panel takes over the OPPOSITE pane's slot and the opposite
  // note is hidden (kept mounted). Cleared on close/hide and on SBS exit.
  const [sbsAiActiveSide, setSbsAiActiveSide] = useState(null); // null | "left" | "right"
  // Timer that delays clearing sbsAiActiveSide so the AI close animation
  // (620ms in NoteModal) can complete before the opposite pane reappears
  // and the wrapper loses its absolute positioning. Cancelled immediately
  // when the whole SBS session closes (no need to wait).
  const sbsAiClearTimerRef = useRef(null);
  const scheduleSbsAiClear = useCallback(() => {
    if (sbsAiClearTimerRef.current) clearTimeout(sbsAiClearTimerRef.current);
    sbsAiClearTimerRef.current = setTimeout(() => {
      setSbsAiActiveSide(null);
      sbsAiClearTimerRef.current = null;
    }, 640); // 620ms (NoteModal aiClosing) + 20ms buffer
  }, []);
  // Cancel any pending delayed clear and wipe immediately (used when SBS
  // closes so there's no zombie state left after teardown).
  const cancelAndClearSbsAi = useCallback(() => {
    if (sbsAiClearTimerRef.current) {
      clearTimeout(sbsAiClearTimerRef.current);
      sbsAiClearTimerRef.current = null;
    }
    setSbsAiActiveSide(null);
  }, []);
  useEffect(() => () => {
    if (sbsAiClearTimerRef.current) clearTimeout(sbsAiClearTimerRef.current);
  }, []);

  const onOpenSideBySide = (ids) => {
    if (!Array.isArray(ids) || ids.length !== 2) return;
    setMultiMode(false);
    setSelectedIds([]);
    setSidebarOpen(false);
    // Add sbs-active to <body> synchronously before the React render so
    // both panes paint with the SBS positioning CSS already in effect.
    // Their noteModalIn keyframes compose with --note-anim-x via the SBS
    // CSS rules, so they animate scale+slide IN PLACE at their SBS
    // anchor positions (same animation as opening a single note).
    document.body.classList.add("sbs-active");
    // Open the left pane via the existing primary pipeline (full features
    // unchanged). Open the right pane via the SecondaryNoteInstance below.
    openModal(String(ids[0]));
    setSbsSecondaryId(String(ids[1]));
    setSbsClosingSide(null);
  };

  // Intercepts the LEFT pane's close button while in SBS mode. The trick
  // is to NEVER tear down the primary modal here: instead we play a
  // pure-CSS close animation on the left half, glide the right pane to
  // centre, then in the SAME render swap the primary's active note from
  // A → B and unmount the secondary. Because primary's `open` state
  // never flips, there's no close-then-reopen flicker. The survivor
  // smoothly takes over the centre slot with full single-note features.
  const requestCloseLeftPaneSBS = useCallback(() => {
    if (!sbsSecondaryId || sbsClosingSide) return;
    const remaining = sbsSecondaryId;
    cancelAndClearSbsAi();
    setSbsClosingSide("left");
    setTimeout(() => {
      // Handoff: snap the primary back to centre WITHOUT transition. The
      // SBS rules drop in the same React commit as openModal/setSbsSecondaryId,
      // and without this snap the residual `transition: transform var(--sbs-anim)`
      // would animate the primary from translateX(-50%-36px) back to translateX(0)
      // a left→right kick at the very end. Re-enable transitions after two
      // frames so the next render has settled.
      setSbsHandoffNoTransition(true);
      openModal(String(remaining));
      setSbsSecondaryId(null);
      setSbsClosingSide(null);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSbsHandoffNoTransition(false);
        });
      });
    }, SBS_ANIM_MS);
  }, [sbsSecondaryId, sbsClosingSide, cancelAndClearSbsAi]); // eslint-disable-line react-hooks/exhaustive-deps -- openModal is recreated on every render

  // Closing the RIGHT pane: the secondary instance only signals start
  // (via onRequestClosing) and then sits still while the shell drives
  // both sides' transitions in lockstep. After the recenter animation
  // finishes the shell unmounts the secondary and drops sbs-active so
  // the primary settles into normal single-modal layout at centre.
  const onSbsRightClosing = useCallback(() => {
    if (sbsClosingSide) return;
    cancelAndClearSbsAi();
    setSbsClosingSide("right");
    setTimeout(() => {
      // Sticky flag: stays true while the survivor remains mounted, so the
      // base .note-modal-anim { animation: noteModalIn } can never replay.
      // Cleared by openModal / onOpenSideBySide / closeModal: never on a timer.
      setSbsSuppressOpenReplay(true);
      setSbsSecondaryId(null);
      setSbsClosingSide(null);
    }, SBS_ANIM_MS);
  }, [sbsClosingSide, cancelAndClearSbsAi, setSbsSuppressOpenReplay]);
  // Kept for backward-compat in case the secondary ever runs its own
  // exit animation outside SBS: currently a no-op in SBS path.
  const onSbsRightClosed = useCallback(() => {
    setSbsSecondaryId(null);
    setSbsClosingSide(null);
  }, []);

  // SBS AI callbacks for the secondary (right) pane. The secondary owns
  // its own AI state, so it must signal the shell when its AI opens or
  // closes/hides. The shell uses these to drive sbsAiActiveSide and the
  // body class that hides the opposite pane.
  const onSecondaryAiOpen = useCallback(() => {
    setSbsAiActiveSide("right");
  }, []);
  const onSecondaryAiClose = useCallback(() => {
    // Like closeNoteAi/hideNoteAi for the primary: keep sbsAiActiveSide="right"
    // alive for the AI close animation duration so the left pane stays hidden
    // and the wrapper keeps its absolute position at the left half.
    scheduleSbsAiClear();
  }, [scheduleSbsAiClear]);

  // Backdrop click while in SBS mode: close BOTH notes together.
  // Strict separation of roles:
  //   - splitClosing → closes ONE pane, survivor recenters (NOT used here)
  //   - sbsClosingSide → drives the survivor's recenter (NOT used here)
  //   - isModalClosing + noteModalOut → closes the WHOLE modal (used here)
  // body.sbs-active stays on so --note-anim-x is still set on each pane;
  // noteModalOut composes with it and plays from each pane's own anchor
  // position (left from -50%-12px, right from +50%+12px). The secondary
  // is forced into closing via the forceClosing prop, which OR-s into its
  // NoteModal's isModalClosing.
  const closeBothSBS = useCallback(() => {
    if (sbsBothClosing) return;
    if (mType === "draw") flushPendingDrawingSave();
    setSbsBothClosing(true);
    setIsModalClosing(true);
    setTimeout(() => {
      setSbsAiActiveSide(null);
      setSbsSecondaryId(null);
      setSbsClosingSide(null);
      setSbsBothClosing(false);
      setOpen(false);
      setActiveId(null);
      setViewMode(true);
      setConfirmDeleteOpen(false);
      setShowModalFmt(false);
      setIsModalClosing(false);
    }, MODAL_FADE_DURATION_SBS);
  }, [sbsBothClosing, mType, flushPendingDrawingSave, setActiveId, setConfirmDeleteOpen, setIsModalClosing, setOpen, setShowModalFmt, setViewMode]);

  // Active whenever a secondary note is set. Both panes render under a
  // shared scrim (the .sbs-active body class drives the split-mode CSS).
  const sbsActive = !!sbsSecondaryId;

  // Body-level classes that drive split-mode CSS:
  //   .sbs-active           : both panes are mounted
  //   .sbs-closing-left     : left is fading out, right glides to centre
  //   .sbs-closing-right    : right is fading out, left glides to centre
  // Use useLayoutEffect (not useEffect) so the class change is applied
  // BEFORE the next paint, in the same commit cycle as data-split-* prop
  // updates on the primary scrim. This prevents an intermediate paint
  // where body still has sbs-active/sbs-closing-left while the primary's
  // data-split-mode has already become undefined: the surviving right
  // pane's anchor-x rule would briefly flip from the recenter (0) back
  // to its default (calc(50%+gap/2)), kicking it rightward for one frame
  // before the rule drops entirely.
  useLayoutEffect(() => {
    const body = document.body;
    body.classList.toggle("sbs-active", sbsActive);
    body.classList.toggle("sbs-closing-left", sbsActive && sbsClosingSide === "left");
    body.classList.toggle("sbs-closing-right", sbsActive && sbsClosingSide === "right");
    body.classList.toggle("sbs-ai-left", sbsActive && sbsAiActiveSide === "left");
    body.classList.toggle("sbs-ai-right", sbsActive && sbsAiActiveSide === "right");
    return () => {
      body.classList.remove("sbs-active");
      body.classList.remove("sbs-closing-left");
      body.classList.remove("sbs-closing-right");
      body.classList.remove("sbs-ai-left");
      body.classList.remove("sbs-ai-right");
    };
  }, [sbsActive, sbsClosingSide, sbsAiActiveSide]);

  return {
    sbsActive,
    sbsSecondaryId,
    sbsClosingSide,
    sbsBothClosing,
    sbsHandoffNoTransition,
    sbsAiActiveSide,
    setSbsAiActiveSide,
    scheduleSbsAiClear,
    onOpenSideBySide,
    requestCloseLeftPaneSBS,
    onSbsRightClosing,
    onSbsRightClosed,
    onSecondaryAiOpen,
    onSecondaryAiClose,
    closeBothSBS,
  };
}
