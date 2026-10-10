// AI chat panel animations, alone and in side-by-side mode.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const aiPanelCSS = `
/* AI chat panel push-out / push-back animation.
   The wrapper div (in NoteModal) expands its width 0 → target on open and
   target → 0 on close, which slides the note modal left/right via flex
   reflow. The panel content sits inside that clipped wrapper and plays a
   separate translate so it appears to push out from behind the note (open)
   or slide back behind it (close), rather than simply being un/covered.

   Sequencing:
   - Open : wrapper expands first (0–0.44s), panel pushes out (0.12–0.5s).
   - Close: panel pushes back first (0–0.32s), wrapper collapses (0.14–0.58s)
            via the transition-delay added by the .closing class. */
.note-ai-panel-wrapper {
  transition: width 0.44s cubic-bezier(0.22, 1, 0.36, 1);
}
.note-ai-panel-wrapper.closing {
  transition: width 0.44s cubic-bezier(0.22, 1, 0.36, 1) 0.14s;
}
@keyframes noteAiPanelIn {
  from { opacity: 0.4; transform: translateX(-32px); }
  to   { opacity: 1;   transform: translateX(0); }
}
@keyframes noteAiPanelOut {
  from { opacity: 1;   transform: translateX(0); }
  to   { opacity: 0;   transform: translateX(-32px); }
}
.note-ai-panel {
  animation: noteAiPanelIn 0.38s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both;
}
.note-ai-panel-wrapper.closing .note-ai-panel {
  animation: noteAiPanelOut 0.32s cubic-bezier(0.55, 0, 0.55, 0.6) both;
}
/* Mobile AI panel — full-screen overlay that slides in from the right
   over the note modal. Mirrors the desktop "panel comes from the side"
   principle but adapted to a screen with no horizontal slack. The panel
   covers the modal completely; closing slides it back out to the right
   to reveal the note. The whole overlay translates as one block since
   there's no flex reflow to mask. */
@keyframes noteAiPanelMobileIn {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
@keyframes noteAiPanelMobileOut {
  from { transform: translateX(0); }
  to   { transform: translateX(100%); }
}
.note-ai-panel-mobile {
  animation: noteAiPanelMobileIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
  will-change: transform;
}
.note-ai-panel-mobile.closing {
  animation: noteAiPanelMobileOut 0.28s cubic-bezier(0.55, 0, 0.55, 0.6) both;
}
/* Inside the mobile overlay, the inner panel itself shouldn't replay
   the desktop translate-from-behind animation — the whole overlay is
   already moving. Reset the noteAiPanelIn keyframes for this case. */
.note-ai-panel-mobile .note-ai-panel {
  animation: none;
  border-radius: 0;
  border: 0;
  box-shadow: none;
  height: 100%;
}
.note-ai-panel-mobile.closing .note-ai-panel {
  animation: none;
}
/* Save ↔ Reset button swap animation. Both buttons carry this class so the
   animation re-fires each time React mounts the replacement button. The
   short overshoot (scale 1.25) makes the swap feel decisive even though
   the two icons look similar. */
@keyframes noteAiSaveBtnIn {
  0%   { transform: scale(0.2) rotate(-45deg); opacity: 0; }
  65%  { transform: scale(1.25) rotate(6deg);  opacity: 1; }
  100% { transform: scale(1)   rotate(0deg);   opacity: 1; }
}
.note-ai-save-btn {
  animation: noteAiSaveBtnIn 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/* ───────── SBS-aware AI panel ─────────
   In side-by-side mode (desktop, ≥1024px where the AI sidebar layout
   is active), the AI panel for the active note temporarily replaces
   the OPPOSITE pane's slot — left-note AI shows in the right half,
   right-note AI shows in the left half. The opposite note stays mounted
   but is hidden (visibility:hidden + pointer-events:none) so its
   internal state is preserved across show/hide cycles.

   The active note keeps its SBS half position; only the AI panel wrapper
   is repositioned via absolute layout into the opposite half. The wrapper
   width (animated 0 → var(--sbs-pane-w) inline) drives the open/close
   reveal exactly like single-note mode. The inner panel uses the regular
   noteAiPanelIn or its mirrored variant (noteAiPanelInRightToLeft) so the
   slide direction always points "into" the active note.

   Below 1024px the AI panel is a fullscreen overlay (mobile-style) that
   covers both panes — no SBS coordination needed and these rules are
   intentionally inert. */
@media (min-width: 1024px) {
  /* Opposite pane hides while the other side's AI panel is showing.
     visibility (not display:none) is intentional — keeps the DOM
     layout & internal state intact, so when the AI panel closes the
     pane reappears exactly where it was. */
  body.sbs-active .modal-scrim[data-sbs-opposite-hidden="true"] > .note-modal-anim {
    visibility: hidden;
    pointer-events: none;
  }
  /* AI panel wrapper position in SBS+AI mode. Pulled out of the scrim's
     horizontal flex layout via absolute positioning, anchored to the
     opposite half via left/right + half-pane offset. Width is set inline
     on the element to var(--sbs-pane-w) so the wrapper transition still
     animates 0 → full-width on open and back on close.
     border-radius + overflow:hidden clip the wrapper from the first frame
     so the animation never exposes rectangular corners regardless of width. */
  body.sbs-active .modal-scrim[data-ai-panel-side] > .note-ai-panel-wrapper {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    height: 95vh;
    pointer-events: auto;
    z-index: 1;
    border-radius: 0.75rem; /* rounded-xl — matches the note modal */
    overflow: hidden;
  }
  /* Left pane's AI panel sits in the RIGHT half. */
  body.sbs-active .modal-scrim[data-split-side="left"][data-ai-panel-side="right"] > .note-ai-panel-wrapper {
    left: calc(50% + var(--sbs-gap) / 2);
    right: auto;
  }
  /* Right pane's AI panel sits in the LEFT half. The right scrim has
     pointer-events:none on the scrim itself; we restore them on the
     wrapper via the rule above. */
  body.sbs-active .modal-scrim[data-split-side="right"][data-ai-panel-side="left"] > .note-ai-panel-wrapper {
    right: calc(50% + var(--sbs-gap) / 2);
    left: auto;
  }
}

/* Mirrored AI panel slide animation — same duration / easing / opacity
   curve as noteAiPanelIn / Out, just with the X delta inverted so the
   panel slides "into" the active note from the opposite side. Used when
   the panel sits to the LEFT of the note (right-pane's AI in SBS). */
@keyframes noteAiPanelInRightToLeft {
  from { opacity: 0.4; transform: translateX(32px); }
  to   { opacity: 1;   transform: translateX(0); }
}
@keyframes noteAiPanelOutRightToLeft {
  from { opacity: 1;   transform: translateX(0); }
  to   { opacity: 0;   transform: translateX(32px); }
}
.modal-scrim[data-ai-panel-side="left"] .note-ai-panel {
  animation: noteAiPanelInRightToLeft 0.38s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both;
}
.modal-scrim[data-ai-panel-side="left"] .note-ai-panel-wrapper.closing .note-ai-panel {
  animation: noteAiPanelOutRightToLeft 0.32s cubic-bezier(0.55, 0, 0.55, 0.6) both;
}
`;
