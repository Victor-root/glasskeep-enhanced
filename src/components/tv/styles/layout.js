// TV mode: screen and header, user menu, sidebar split, notes scroll, masonry grid
// and pager.
// Part of the TV stylesheet, assembled in order by ../tvStyles.js.

export const tvLayoutCSS = `
/* ------- Screen / header ------- */
html[data-tv="1"] .tv-screen {
  height: 100vh;
  width: 100vw;
  max-width: 100vw;
  max-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
html[data-tv="1"] .tv-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: var(--tv-safe-y) var(--tv-safe-x) 6px;
  position: relative;
  z-index: 20;
}
html[data-tv="1"] .tv-header__hamburger,
html[data-tv="1"] .tv-header__viewtoggle,
html[data-tv="1"] .tv-header__themetoggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.07);
  color: #e5e7eb;
  flex-shrink: 0;
}
html[data-tv="1"] .tv-header__title-wrap { min-width: 0; }
/* Small app logo to the left of the "GlassKeep" wordmark — mirrors
   the mobile NotesHeader layout. */
html[data-tv="1"] .tv-header__logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  flex-shrink: 0;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}
html[data-tv="1"] .tv-header__title {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.01em;
  background: linear-gradient(90deg, #c4b5fd, #f9a8d4);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  line-height: 1.1;
}
html[data-tv="1"] .tv-header__subtitle {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
}
html[data-tv="1"] .tv-header__user {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.07);
  font-size: 12px;
  color: #e5e7eb;
  cursor: default;
}
/* User-popover menu — sits below the avatar chip, anchored to its
   right edge so it doesn't bleed off the screen on narrow TVs. */
html[data-tv="1"] .tv-header__user-menu-wrap {
  position: relative;
}
html[data-tv="1"] .tv-header__user-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 200px;
  padding: 6px;
  background: rgba(20, 22, 32, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 14px 32px -12px rgba(0, 0, 0, 0.75);
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 100;
}
html[data-tv="1"][data-tv-theme="light"] .tv-header__user-menu {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
}
html[data-tv="1"] .tv-header__user-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: #e5e7eb;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  width: 100%;
}
html[data-tv="1"][data-tv-theme="light"] .tv-header__user-menu-item { color: #1f2937; }
html[data-tv="1"] .tv-header__user-menu-item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  opacity: 0.85;
}
html[data-tv="1"] .tv-header__avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(124, 58, 237, 0.35);
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  overflow: hidden;
}
html[data-tv="1"] .tv-header__avatar img { width: 100%; height: 100%; object-fit: cover; }
html[data-tv="1"] .tv-header__count {
  font-size: 12px;
  color: #c4b5fd;
  background: rgba(124, 58, 237, 0.15);
  border: 1px solid rgba(167, 139, 250, 0.35);
  padding: 4px 12px;
  border-radius: 999px;
}
/* The pager page indicator is anchored to the visual centre of the
   header — not the flex centre — so it stays put regardless of the
   left/right cluster widths. pointer-events:none so it never blocks
   D-pad focus on the controls underneath. */
html[data-tv="1"] .tv-header__pager-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

/* ------- Main split layout ------- */
/* Bottom safe area is 0 — user wants the cards to reach the bezel.
   The notes-scroll keeps its own padding-bottom for breathing room. */
html[data-tv="1"] .tv-layout {
  display: grid;
  grid-template-columns: 230px 1fr;
  gap: 12px;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 var(--tv-safe-x) 0;
  /* NO transition on grid-template-columns — the previous 200ms
     animation was forcing a reflow of the masonry grid for the entire
     duration, which made the Shield grind for 3-4s. Toggle is now
     instant: snappier perceptually, way less CPU. */
}
html[data-tv="1"] .tv-layout--sidebar-hidden {
  /* Single 1fr track, NOT "0 1fr": display:none drops the sidebar
     from the flow, leaving the main as the only child — with the old
     "0 1fr" it would have landed in the 0px-wide first cell, which is
     exactly what produced the "thin slivers, no cards visible" bug.
     One track + one child = the main pane takes the whole viewport. */
  grid-template-columns: 1fr;
  gap: 0;
}
html[data-tv="1"] .tv-sidebar {
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow-y: auto;
  padding: 8px 8px 24px 8px;
  min-width: 0;
}
html[data-tv="1"] .tv-layout--sidebar-hidden .tv-sidebar {
  display: none;
}
html[data-tv="1"] .tv-sidebar__group-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #6b7280;
  padding: 10px 6px 2px;
}
html[data-tv="1"] .tv-sidebar__item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 13px;
  color: #d1d5db;
  text-align: left;
  width: 100%;
  scroll-margin: 24px 0;
}
html[data-tv="1"] .tv-sidebar__item[data-active="true"] {
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.28), rgba(124, 58, 237, 0.18));
  border-color: rgba(167, 139, 250, 0.5);
  color: #f5f3ff;
}
html[data-tv="1"] .tv-sidebar__item-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: currentColor;
  opacity: 0.85;
}
html[data-tv="1"] .tv-sidebar__item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
html[data-tv="1"] .tv-sidebar__item-count {
  margin-left: auto;
  font-size: 10px;
  color: #9ca3af;
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 7px;
  border-radius: 999px;
  min-width: 20px;
  text-align: center;
}

/* ------- Notes scroll ------- */
html[data-tv="1"] .tv-notes-scroll {
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px 10px 40px 10px;
  scroll-behavior: smooth;
  scroll-padding-top: 20px;
  scroll-padding-bottom: 60px;
  min-width: 0;
}

/* ------- Masonry grid (Pinterest-style, no horizontal gaps) ------- */
html[data-tv="1"] .tv-masonry {
  display: flex;
  margin-left: calc(-1 * var(--tv-gap));
  width: auto;
  padding: 2px 2px 8px;
}
html[data-tv="1"] .tv-masonry__col {
  padding-left: var(--tv-gap);
  background-clip: padding-box;
}
html[data-tv="1"] .tv-masonry__col > .tv-card {
  margin-bottom: var(--tv-gap);
}

/* ------- Pager (two fixed cards + decorative arrows) ------- */
/* The scroll container drops its vertical scroll when the pager is
   inside it — the pager owns its own viewport-sized cells, the user
   should never be able to wheel/scroll past them. */
html[data-tv="1"] .tv-notes-scroll--pager {
  /* overflow: hidden again — long-content cards were spilling past
     the bottom of the viewport. The 18px horizontal / 10px-26px
     vertical padding on .tv-pager below absorbs the 3px focus ring
     overflow, so the ring stays visible even with this clip. */
  overflow: hidden;
  padding: 0;
}
html[data-tv="1"] .tv-pager {
  display: grid;
  grid-template-columns: 56px 1fr 56px;
  /* One explicit row at 1fr — without it the row auto-sizes to the
     intrinsic max-content of .tv-pager__page (= the tallest card),
     which pushes the cards past the viewport bottom. */
  grid-template-rows: 1fr;
  gap: var(--tv-gap);
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  /* Padding sized so the box-shadow focus ring (3px) escapes the
     card and .tv-pager__page comfortably without touching the bezel. */
  padding: 10px 18px 26px;
  align-items: stretch;
}
html[data-tv="1"] .tv-pager__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #c4b5fd;
  opacity: 0.55;
  pointer-events: none;
}
html[data-tv="1"][data-tv-theme="light"] .tv-pager__arrow { color: #7c3aed; }
html[data-tv="1"] .tv-pager__page {
  display: grid;
  grid-template-columns: 1fr 1fr;
  /* Explicit 1fr row — without it the row stretches to fit the
     tallest card's intrinsic content and height: 100% on the cards
     becomes circular, blowing past the viewport. */
  grid-template-rows: 1fr;
  gap: var(--tv-gap);
  align-items: stretch;
  min-width: 0;
  min-height: 0;
  height: 100%;
  /* No overflow: hidden here. The card itself already does overflow:
     hidden + max-height: 100%, so its content stays clipped while the
     focus ring (a box-shadow living outside the card box) stays
     visible on every side. */
}
html[data-tv="1"] .tv-pager .tv-card {
  height: 100%;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
  scroll-margin: 0;
}
/* In the pager the cards already fill their cell exactly; the
   default focus scale (1.025) pushed them past the right edge of
   their cell and clipped the glow. Use a ring-only focus (no scale)
   for pager cards. */
html[data-tv="1"] .tv-pager .tv-card.tv-focusable:focus,
html[data-tv="1"] .tv-pager .tv-card.tv-focusable[data-tv-focused="true"] {
  transform: none;
  box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.95);
}
html[data-tv="1"] .tv-pager .tv-card__preview {
  font-size: 16px;
  max-height: none;
  flex: 1 1 auto;
  min-height: 0;
  /* Hard cut via overflow:hidden on the card itself — no mask
     gradient (composited mask was a Shield bottleneck). */
}
html[data-tv="1"] .tv-pager .tv-card__images img { height: 140px; }
`;
