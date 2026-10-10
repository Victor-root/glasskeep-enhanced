// Themed app scrollbars (pointer and touch) and the page scrollbar.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const scrollbarsCSS = `
/* === Global app scrollbars — themed via tokens (main page, sidebar, the
   Settings/Admin panels, global lists). Mode-aware tokens carry the light /
   dark values so no separate dark rules are needed. Note-content scrollbars
   are intentionally NOT touched: .modal-scroll-themed below is more specific
   and keeps each open note's own colour. === */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-button { display: none; height: 0; width: 0; }
::-webkit-scrollbar-track { background: var(--gk-scroll-track); }
::-webkit-scrollbar-thumb { background: var(--gk-scroll-thumb); border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: var(--gk-scroll-thumb-hover); }
/* Firefox fallback (no ::-webkit-scrollbar): scrollbar-color needs solid
   colours, so use the theme accent for the thumb + the faint track token.
   Cannot be scoped away from note content here, same as before. */
@supports not selector(::-webkit-scrollbar) {
  * { scrollbar-width: thin; scrollbar-color: var(--gk-chrome-accent) var(--gk-scroll-track); }
}
/* Modal : scrollbar adaptée à la couleur de la note (pointer devices; touch
   screens use the single touch scrollbar below). */
@media (hover: hover), (pointer: fine) {
  .modal-scroll-themed::-webkit-scrollbar-track { background: var(--sb-track); }
  .modal-scroll-themed::-webkit-scrollbar-thumb { background: var(--sb-thumb); border-radius: 10px; }
  .modal-scroll-themed::-webkit-scrollbar-thumb:hover { filter: brightness(1.15); }
  /* Fallback si CSS vars non résolues sur webkit (Safari) */
  html.dark .modal-scroll-themed::-webkit-scrollbar-track { background: var(--sb-track, #3b0764) !important; }
  html.dark .modal-scroll-themed::-webkit-scrollbar-thumb { background: var(--sb-thumb, #7c3aed) !important; border-radius: 10px; }
}
/* Touch screens: one scrollbar everywhere, a thin theme-accent thumb with no
   track, shown only while its box scrolls (data-gk-scrollbar, see
   useTouchScrollbars). The page's own is drawn by PageScrollbar, under the
   sticky header (z-40). */
@media (hover: none) and (pointer: coarse) {
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: transparent; border-radius: 2px; }
  [data-gk-scrollbar]::-webkit-scrollbar-thumb { background: var(--gk-chrome-accent); }
}
/* Between the status and navigation bars, clear of the screen's rounded
   corners, and of its edge. */
.gk-page-scrollbar-track {
  position: fixed;
  top: var(--safe-top);
  bottom: var(--safe-bottom);
  right: 4px;
  z-index: 35;
  width: 4px;
  pointer-events: none;
}
.gk-page-scrollbar {
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  border-radius: 2px;
  background: var(--gk-chrome-accent);
  opacity: 0;
  transition: opacity 250ms ease-out;
  will-change: transform;
}
.gk-page-scrollbar[data-active] {
  opacity: 1;
  transition: none;
}
/* Reserve the scrollbar gutter on desktop so the inner width stays
   identical whether the note is short (no scrollbar) or long (scrollbar
   visible). Without this, a long note shaves ~15 px off the toolbar's
   usable width and the .rt-sg--style super-group wraps onto an extra
   ribbon row. On mobile the scrollbar is already hidden via
   .mobile-hide-scrollbar / scrollbar-width: none so the gutter is 0 px;
   we still scope to the desktop breakpoint to be explicit. */
@media (min-width: 641px) {
  .modal-scroll-themed { scrollbar-gutter: stable; }
}
`;
