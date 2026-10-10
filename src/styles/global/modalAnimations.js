// Text preview clamp, modal scrim, sticky modal header and the note modal
// enter / exit / mode-switch animations.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const modalAnimationsCSS = `
/* clamp for text preview */
.line-clamp-6 {
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* scrim blur */
/* The one blur kept app-wide: the scrim behind an open note (frosted
   separation from the page). Cheap because the animated background is
   frozen while an overlay is open, so the backdrop is static and the GPU
   rasterises the blur once and caches it. */
.modal-scrim {
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
/* Scroll the open note and the Settings / Admin panels on the compositor,
   like the notes list (see .notes-scroll-area). Otherwise the browser kept
   these transparent scrollers on the main thread and re-rasterised the whole
   visible note or panel on every scrolled frame, on top of the blur behind. */
[data-modal-scroll],
.gk-side-panel-scroll {
  will-change: scroll-position;
}

/* Modal sticky header — flat (no blur), matching the rest of the app. */
.modal-header-blur {
  background-color: inherit;
}

/* Note modal enter / exit animations — only transform+opacity (GPU composited, no layout)
   The var(--note-anim-x, ) lets SBS panes inject a leading translateX
   into the keyframe transform. The default fallback is empty so single-
   modal opens are unchanged; in SBS mode the variable is set per-side
   so the scale+slide animation plays AT the SBS anchor position and
   ends exactly where the persistent SBS transform takes over (no jump). */
@keyframes noteModalIn {
  from { opacity: 0; transform: var(--note-anim-x, ) scale(0.92) translateY(10px); }
  to   { opacity: 1; transform: var(--note-anim-x, ) scale(1)    translateY(0);    }
}
@keyframes noteModalOut {
  from { opacity: 1; transform: var(--note-anim-x, ) scale(1)    translateY(0);   }
  to   { opacity: 0; transform: var(--note-anim-x, ) scale(0.97) translateY(6px); }
}
/* Mobile: full-screen modal → slide-up only, no scale (avoids jitter on small screens) */
@media (max-width: 639px) {
  @keyframes noteModalIn  { from { opacity: 0; transform: var(--note-anim-x, ) translateY(14px); } to { opacity: 1; transform: var(--note-anim-x, ) translateY(0); } }
  @keyframes noteModalOut { from { opacity: 1; transform: var(--note-anim-x, ) translateY(0); } to { opacity: 0; transform: var(--note-anim-x, ) translateY(14px); } }
}
@keyframes scrimFadeIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes scrimFadeOut { from { opacity: 1; } to { opacity: 0; } }
/* Intentionally NOT using "both" for the open animation — retaining the
   "transform: scale(1) translateY(0)" after the keyframes ends turns the
   modal card into a containing block, which in turn broke "position: sticky"
   (toolbar stops following scroll) and "position: fixed" (popovers landed
   in the middle of the modal). Ending the animation returns the card to
   its declared no-transform state, which is visually identical. */
.note-modal-anim         { animation: noteModalIn  200ms ease-out; }
.note-modal-anim.closing { animation: noteModalOut 180ms ease-in  both; }
.note-scrim-anim         { animation: scrimFadeIn  200ms ease-out both; }
.note-scrim-anim.closing { animation: scrimFadeOut 180ms ease-in  both; }

/* Smooth content fade when toggling view/edit mode */
@keyframes modalContentFade {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* No "both" — same reason as .note-modal-anim. Keeping a transform on an
   ancestor of the rich-text toolbar prevented position: sticky from binding
   to the real modal scroll container. */
.modal-content-fade { animation: modalContentFade 200ms ease-out; }

/* Smooth expand/collapse when entering/leaving draw canvas mode */
@media (min-width: 640px) {
  @keyframes drawExpand {
    from { transform: scale(0.72); border-radius: 12px; opacity: 0.8; }
    to   { transform: scale(1);    border-radius: 0;    opacity: 1; }
  }
  @keyframes drawCollapse {
    from { transform: scale(1.15); opacity: 0.7; }
    to   { transform: scale(1);    opacity: 1; }
  }
  .draw-expand   { animation: drawExpand   400ms cubic-bezier(.16,1,.3,1) both; }
  .draw-collapse { animation: drawCollapse 350ms cubic-bezier(.16,1,.3,1) both; }
}

/* Remove glass-card shadow on modal to avoid edge halos */
.note-modal-anim.glass-card {
  box-shadow: none !important;
}
`;
