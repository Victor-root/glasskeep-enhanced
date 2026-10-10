// Header kebab menu, mobile search bar and header icon buttons.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const headerCSS = `
/* Header kebab menu (phones): the header's colour, unfolding from the button
   it covers. Keep HEADER_MENU_EXIT_MS (NotesHeader.jsx) above the closing
   duration. */
.gk-header-menu {
  background: var(--gk-statusbar);
  transform-origin: top right;
  opacity: 0;
  transform: scale(0.9);
  pointer-events: none;
  transition: opacity 130ms ease-in, transform 130ms ease-in;
}
.gk-header-menu[data-state="open"] {
  opacity: 1;
  transform: none;
  pointer-events: auto;
  transition: opacity 160ms ease-out, transform 220ms cubic-bezier(0.2, 0, 0, 1);
}
@media (prefers-reduced-motion: reduce) {
  .gk-header-menu,
  .gk-header-menu[data-state="open"] { transition: none; }
}

/* Mobile search bar: covers the header in its colour, unfolding left and right
   from the search icon (--gk-search-origin, set by NotesHeader) and folding
   back into it. clip-path animates on the compositor. Keep SEARCH_EXIT_MS
   (NotesHeader.jsx) above the closing duration. */
.gk-mobile-search {
  background: var(--gk-statusbar);
  clip-path: inset(0 calc(100% - var(--gk-search-origin, 100%)) 0 var(--gk-search-origin, 100%) round 999px);
  transition: clip-path 220ms cubic-bezier(0.4, 0, 1, 1);
}
.gk-mobile-search[data-state="open"] {
  clip-path: inset(0 0 0 0 round 0);
  transition: clip-path 380ms cubic-bezier(0.2, 0, 0, 1);
}
@media (prefers-reduced-motion: reduce) {
  .gk-mobile-search,
  .gk-mobile-search[data-state="open"] { transition: none; }
}

/* Header icon buttons hover circle. Pointer devices only: a touch screen keeps
   :hover on the last tapped button, so it stayed circled after its panel
   closed with Android back. */
@media (hover: hover) {
  .gk-header-icon-btn:hover {
    background-color: color-mix(in srgb, var(--gk-chrome-accent) 15%, transparent);
  }
}
`;
