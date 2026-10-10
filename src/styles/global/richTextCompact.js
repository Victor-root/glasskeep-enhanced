// Compact rich-text toolbar on narrow screens and containers, and user
// typography on read-only renderings.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const richTextCompactCSS = `
/* Mobile squeeze: the toolbar stays on one or two lines and each row uses
   the horizontal scroll container instead of wrapping aggressively on tiny
   screens. Groups stay grouped visually via the separators. */

/* Desktop micro-compact: when the toolbar's own inline-size shrinks to
   the ~880 px range (modal at max-w-4xl with the scrollbar gutter
   reserved), trim a few pixels off each control so all four super-
   groups still tuck onto two ribbon rows.

   The :not() chain is load-bearing — without it the base .rt-btn
   override would also raise the min-width of variants like
   .rt-btn--chevron (20 px), .rt-btn--narrow (64 px), .rt-btn--link
   (68 px) and grow them instead of shrinking the toolbar. Only plain
   buttons and .rt-btn--swatch are reduced; the named variants keep
   the widths they were designed with.

   Guarded by min-width: 641 px so the mobile bottom-sheet (which uses
   its own dedicated .mobile-fmt-sheet-content layout) is never touched. */
@media (min-width: 641px) {
  @container rt-toolbar (max-width: 880px) {
    .rt-btn:not(.rt-btn--wide):not(.rt-btn--narrow):not(.rt-btn--chevron):not(.rt-btn--block):not(.rt-btn--link):not(.rt-btn--menu) {
      min-width: 32px;
      padding: 0 6px;
    }
    .rt-btn--wide { width: 122px; flex: 0 0 122px; }
    .rt-style-btn { width: 78px; flex: 0 0 78px; }
    .rt-sep { margin: 2px 4px; }
  }
}

@media (max-width: 640px) {
  .rt-toolbar {
    flex-wrap: wrap;
    padding: 4px 6px 6px;
    margin: 2px 6px 6px;
    row-gap: 4px;
  }
  /* Touch-friendly minimum size on mobile, matching the enlarged desktop
     density. */
  .rt-btn { min-width: 36px; height: 36px; padding: 0 7px; }
  .rt-btn--wide { width: 110px; flex: 0 0 110px; }
  .rt-btn--block { min-width: 50px; }
  .rt-btn svg { width: 20px; height: 20px; }
  .rt-pop { min-width: 220px; }
  .rt-sep { margin: 0 4px; height: 26px; }
  .rt-style-btn { width: 80px; flex: 0 0 80px; height: 34px; padding: 0 6px; }
}

/* Read-only note-content renderings (cards + modal view) should ALSO honour
   typography presets AND the per-block indent marker so edit↔view stays
   visually identical even before the user edits a legacy note. */
.note-content [data-indent],
.rt-editor-content [data-indent] {
  /* Inline style handles the actual margin; this hook just lets us attach
     responsive overrides if ever needed. */
}
`;
