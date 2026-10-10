// Mobile bottom / top sheets and the note modal footer toolbar.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const modalFooterCSS = `
/* ── Modal footer toolbar (Google Keep style) ─────────────────────────── */
/* Mobile sheet (Sheet.jsx): rises over a dimmed backdrop with large rounded
   top corners and a grab handle (or, edge="top", drops from the top with
   rounded bottom corners, see the [data-edge="top"] rules below). Only transform (sheet) and
   opacity (backdrop) animate; it decelerates in and accelerates out. Lifted
   above the soft keyboard through --keyboard-inset. Content is laid out with
   the field / row bricks below, straight on the sheet's background. */
/* Above the note it opens from (z 40-50), below what may open from inside
   it: confirmation dialogs (z 60) and menus / popovers (z 9999+). */
.gk-sheet-root {
  position: fixed;
  inset: 0;
  z-index: 55;
}
.gk-sheet-root[data-state="closed"] { pointer-events: none; }
.gk-sheet-scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
  opacity: 0;
  transition: opacity 260ms ease-in;
}
.gk-sheet-scrim[data-state="open"] {
  opacity: 1;
  transition: opacity 380ms ease-out;
}
.gk-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: var(--keyboard-inset);
  max-height: calc(100dvh - var(--safe-top) - 32px - var(--keyboard-inset));
  display: flex;
  flex-direction: column;
  padding-bottom: max(12px, calc(var(--safe-bottom) - var(--keyboard-inset)));
  background: var(--gk-sheet-bg);
  color: #1f2937;
  border-radius: 28px 28px 0 0;
  box-shadow: 0 -10px 36px rgba(0, 0, 0, 0.16);
  transform: translateY(100%);
  transition: transform 260ms cubic-bezier(0.3, 0, 0.8, 0.15);
  will-change: transform;
}
html.dark .gk-sheet {
  color: #f3f4f6;
  box-shadow: 0 -10px 36px rgba(0, 0, 0, 0.5);
}
/* A sheet takes the open note's colour (or the header's): greys and accent
   tints made for neutral surfaces fade into it, pale ones on light pastels,
   dark ones on dark hues. Inside a sheet they are re-pointed to the sheet's
   text colour at reduced opacity, and to deeper (light) or lighter (dark)
   tints, readable on every note colour. */
.gk-sheet {
  --color-gray-300: rgb(31 41 55 / 0.42);
  --color-gray-400: rgb(31 41 55 / 0.62);
  --color-gray-500: rgb(31 41 55 / 0.7);
  --color-emerald-600: var(--color-emerald-700);
}
html.dark .gk-sheet {
  --color-gray-300: rgb(243 244 246 / 0.85);
  --color-gray-400: rgb(243 244 246 / 0.75);
  --color-gray-500: rgb(243 244 246 / 0.66);
  --color-gray-600: rgb(243 244 246 / 0.5);
  --color-indigo-300: var(--color-indigo-200);
  --color-red-600: var(--color-red-300);
  --gk-accent-text: color-mix(in srgb, var(--gk-chrome-accent) 40%, #fff);
  --rt-btn-active-text: #fff;
  --rt-btn-active-bg: rgb(255 255 255 / 0.16);
  --rt-list-bullet: #a5b4fc;
  --rt-list-ordered: #7dd3fc;
}
.gk-sheet[data-state="open"] {
  transform: translateY(0);
  transition: transform 380ms cubic-bezier(0.2, 0, 0, 1);
}
.gk-sheet[data-dragging],
.gk-sheet-scrim[data-dragging] { transition: none; }
@media (prefers-reduced-motion: reduce) {
  .gk-sheet,
  .gk-sheet[data-state="open"],
  .gk-sheet-scrim,
  .gk-sheet-scrim[data-state="open"] { transition: none; }
}
/* Handle + title: the drag area, kept clear of touch scrolling. */
.gk-sheet-head {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 10px 20px 16px;
  touch-action: none;
  user-select: none;
  cursor: grab;
}
.gk-sheet-grabber {
  width: 40px;
  height: 5px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.22);
}
html.dark .gk-sheet-grabber { background: rgba(255, 255, 255, 0.28); }
.gk-sheet-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}
.gk-sheet-titlerow {
  position: relative;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
}
.gk-sheet-titleaction {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
}
/* Top sheet: drops from under the status bar, title on top, the handle at
   its bottom edge, closing upwards. */
.gk-sheet[data-edge="top"] {
  top: 0;
  bottom: auto;
  max-height: calc(100dvh - var(--safe-bottom) - 32px);
  padding-top: var(--safe-top);
  padding-bottom: 0;
  border-radius: 0 0 28px 28px;
  box-shadow: 0 10px 36px rgba(0, 0, 0, 0.16);
  transform: translateY(-100%);
}
html.dark .gk-sheet[data-edge="top"] { box-shadow: 0 10px 36px rgba(0, 0, 0, 0.5); }
.gk-sheet[data-edge="top"][data-state="open"] { transform: translateY(0); }
.gk-sheet[data-edge="top"] > .gk-sheet-head:first-child { padding: 14px 20px 12px; }
.gk-sheet[data-edge="top"] > .gk-sheet-head:last-child { padding: 12px 20px 12px; }
.gk-sheet-body {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 16px 8px;
  scrollbar-width: none;
}
.gk-sheet-body::-webkit-scrollbar { display: none; }
.gk-sheet-field {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 14px;
}
html.dark .gk-sheet-field { background: rgba(255, 255, 255, 0.07); }
.gk-sheet-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 54px;
  padding: 0 8px;
  border-radius: 12px;
  text-align: left;
  font-size: 1rem;
  transition: background-color 0.12s ease;
}
/* Separator drawn apart from the row so it stays straight under the row's
   rounded pressed state. */
.gk-sheet-row + .gk-sheet-row::before {
  content: "";
  position: absolute;
  top: 0;
  left: 8px;
  right: 8px;
  height: 1px;
  background: rgba(0, 0, 0, 0.07);
}
html.dark .gk-sheet-row + .gk-sheet-row::before { background: rgba(255, 255, 255, 0.08); }
.gk-sheet-row:active { background-color: var(--gk-chrome-hover); }
.gk-sheet-row-icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* One icon size for every row, whatever size the shared icon was drawn at
   for the desktop menus (some carry inline sizes, hence !important). */
.gk-sheet-row-icon > svg { width: 22px !important; height: 22px !important; }

.modal-footer-toolbar {
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.04);
  box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.06);
}
html.dark .modal-footer-toolbar {
  background: rgba(0, 0, 0, 0.15);
  box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.2);
}

/* Inside the mobile formatting sheet the ribbon becomes full-width rows:
   the super-groups stack (divided by a hairline) and each of their rows
   spans the width, its controls sharing it (wrapping when a line is too
   full for a phone), at a 48px touch height with larger icons. The
   ribbon's .rt-sep dividers turn into line breaks, so the one-row simple
   toolbar splits into a row per group. */
.mobile-fmt-sheet-content .rt-toolbar {
  flex-direction: column;
  align-items: stretch;
  flex-wrap: nowrap;
  margin: 0;
  padding: 0 0 6px;
  border-top: none;
  border-bottom: none;
  row-gap: 0;
  background: transparent;
}
.mobile-fmt-sheet-content .rt-sg {
  width: 100%;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 10px 0;
  border-bottom: 1px solid var(--rt-divider);
}
.mobile-fmt-sheet-content .rt-sg:last-of-type { border-bottom: none; }
.mobile-fmt-sheet-content .rt-sg-row {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 6px;
  width: 100%;
}
.mobile-fmt-sheet-content .rt-sg-row > * {
  flex: 1 1 44px;
  min-width: 0;
  margin: 0;
}
.mobile-fmt-sheet-content .rt-sg-row > .rt-splitbtn { flex-basis: 64px; }
.mobile-fmt-sheet-content .rt-sg-row > .rt-btn--swatch { flex-basis: 50px; }
.mobile-fmt-sheet-content .rt-sg-row > .rt-btn--wide { flex: 2 1 120px; }
.mobile-fmt-sheet-content .rt-sep,
.mobile-fmt-sheet-content .rt-sg-row > .rt-sep {
  flex: 0 0 100%;
  width: 100%;
  height: 0;
  margin: 0;
  background: none;
}
.mobile-fmt-sheet-content .rt-btn {
  width: auto;
  min-width: 0;
  height: 48px;
  margin: 0;
  border-radius: 12px;
  font-size: 1rem;
}
.mobile-fmt-sheet-content .rt-btn svg { width: 24px; height: 24px; }
/* The size picker keeps its value next to its chevron once it is wide. */
.mobile-fmt-sheet-content .rt-btn--narrow { justify-content: center; gap: 6px; }
.mobile-fmt-sheet-content .rt-splitbtn { display: flex; }
.mobile-fmt-sheet-content .rt-splitbtn > .rt-btn:first-child { flex: 1 1 0; }
.mobile-fmt-sheet-content .rt-splitbtn > .rt-btn--chevron { flex: 0 0 26px; }
.mobile-fmt-sheet-content .rt-btn--chevron svg { width: 16px; height: 16px; }
.mobile-fmt-sheet-content .rt-style-btn {
  width: auto;
  height: 48px;
  border-radius: 12px;
}

/* Mobile-only "Mise en forme" footer toggle styling — flag the active
   state with the same indigo accent the toolbar already uses. */
.modal-footer-btn--fmt.is-active {
  background: rgba(99, 102, 241, 0.14);
  color: rgb(99, 102, 241);
}
html.dark .modal-footer-btn--fmt.is-active {
  background: rgba(129, 140, 248, 0.22);
  color: rgb(165, 180, 252);
}
.modal-footer-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(0, 0, 0, 0.54);
  cursor: pointer;
  transition:
    background 0.14s ease,
    color      0.14s ease,
    box-shadow 0.18s ease,
    transform  0.18s cubic-bezier(0.34, 1.5, 0.64, 1);
}

/* Labeled variant (desktop): pill with icon + text */
.modal-footer-labeled-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  height: 32px;
  padding: 0 0.6rem;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: rgba(0, 0, 0, 0.58);
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.14s ease,
    color      0.14s ease,
    box-shadow 0.18s ease,
    transform  0.18s cubic-bezier(0.34, 1.5, 0.64, 1);
}
.modal-footer-labeled-btn span {
  line-height: 1;
}

.modal-footer-btn svg,
.modal-footer-labeled-btn svg {
  display: block;
  flex-shrink: 0;
  transition: transform 0.18s cubic-bezier(0.34, 1.5, 0.64, 1);
}
@media (hover: hover) {
  .modal-footer-btn:hover,
  .modal-footer-labeled-btn:hover {
    background: rgba(0, 0, 0, 0.07);
    color: #111827;
  }
  .modal-footer-btn:hover svg,
  .modal-footer-labeled-btn:hover svg {
    transform: scale(1.12);
  }
}
.modal-footer-btn:active,
.modal-footer-labeled-btn:active {
  transform: scale(0.9) !important;
  transition: transform 0.08s ease !important;
}
html.dark .modal-footer-btn,
html.dark .modal-footer-labeled-btn {
  color: rgba(255, 255, 255, 0.92);
}
@media (hover: hover) {
  html.dark .modal-footer-btn:hover,
  html.dark .modal-footer-labeled-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }
}

/* Responsive: collapse labels to icon-only below 1024px, distribute evenly */
@media (max-width: 1023px) {
  .modal-footer-labeled-btn {
    width: 34px;
    height: 34px;
    padding: 0;
    border-radius: 50%;
    justify-content: center;
    gap: 0;
    flex-shrink: 0;
  }
  .modal-footer-labeled-btn > span {
    display: none;
  }
  .modal-footer-btn {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
  }
  .modal-footer-inner {
    justify-content: space-evenly;
    gap: 0;
    padding-left: 0;
    padding-right: 0;
  }
  .modal-footer-spacer {
    display: none;
  }
}

/* Mobile layout (ModalFooter, not isDesktop): finger-sized buttons that share
   the row evenly, up to 44px (the footer keeps its height), and 24px icons
   whatever size each icon was drawn at. */
.modal-footer-toolbar--touch .modal-footer-inner {
  padding: 1px 8px;
}
.modal-footer-toolbar--touch .modal-footer-inner > * {
  flex: 1 1 0;
  min-width: 0;
  max-width: 44px;
}
.modal-footer-toolbar--touch .modal-footer-btn {
  width: 100%;
  max-width: 44px;
  height: auto;
  aspect-ratio: 1;
}
.modal-footer-toolbar--touch .modal-footer-btn > svg,
.modal-footer-toolbar--touch .modal-footer-btn > .tabler-icon {
  width: 24px;
  height: 24px;
}
/* Badges (logo, tag count, collaborators) sit on the icon's top-right
   corner, not on the corners of the now larger button. */
.modal-footer-toolbar--touch .modal-footer-btn > span.absolute {
  top: calc(50% - 18px);
  right: calc(50% - 18px);
}
/* The filled read/edit disc stays clear of the footer's top edge. */
.modal-footer-toolbar--touch .modal-footer-btn--mode {
  max-width: 38px;
}
/* One stroke weight for the outlined icons (the Tabler ones already use it). */
.modal-footer-toolbar--touch .modal-footer-btn > svg[stroke="currentColor"] {
  stroke-width: 1.75;
}
/* Its glyph fills less of its box than the others: brought to their height. */
.modal-footer-toolbar--touch .modal-footer-btn--fmt > .tabler-icon {
  width: 30px;
  height: 30px;
}
.modal-footer-toolbar--touch .modal-footer-btn--fmt > .tabler-icon > svg {
  stroke-width: 1.4; /* 1.75px once scaled up to 30px */
}

/* Save line (phones): the open note's save state along the footer's top
   edge (ModalFooter data-save-state, from useNoteSaveState). Saving: a sheen
   in the theme's gradient runs over a faint accent track. Saved: the line
   fills in green from the left, glows, then fades. Offline: amber, breathing
   until the server is back. Error: red. Transform and opacity only. */
.modal-footer-toolbar--touch {
  position: relative;
}
.gk-save-line {
  --gk-save-color: #10b981;
  position: absolute;
  left: 0;
  right: 0;
  top: -1px;
  height: 2px;
  pointer-events: none;
  /* Room for the glow above and below; the sheen is cut at the edges. */
  clip-path: inset(-10px 0);
}
html.dark .gk-save-line { --gk-save-color: #34d399; }
.gk-save-line::before,
.gk-save-line::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 2px;
}
.gk-save-line::before {
  left: 0;
  right: 0;
  background: var(--gk-save-color);
  box-shadow: 0 0 8px color-mix(in srgb, var(--gk-save-color) 60%, transparent);
  transform-origin: left center;
  opacity: 0;
  transition: opacity 500ms ease;
}
.gk-save-line::after {
  left: 0;
  width: 38%;
  background: linear-gradient(90deg, transparent, var(--gk-chrome-grad-from), var(--gk-chrome-grad-to), transparent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--gk-chrome-accent) 45%, transparent);
  transform: translateX(-100%);
  opacity: 0;
  transition: opacity 250ms ease;
}
[data-save-state="saving"] > .gk-save-line::before {
  --gk-save-color: var(--gk-chrome-accent);
  opacity: 0.22;
}
[data-save-state="saving"] > .gk-save-line::after {
  opacity: 1;
  animation: gkSaveSheen 1.3s cubic-bezier(0.45, 0, 0.25, 1) infinite;
}
[data-save-state="saved"] > .gk-save-line::before {
  opacity: 1;
  transition: none;
  animation: gkSaveFill 380ms cubic-bezier(0.2, 0, 0, 1);
}
[data-save-state="offline"] > .gk-save-line::before {
  --gk-save-color: #f59e0b;
  opacity: 1;
  animation: gkSaveBreathe 2.4s ease-in-out infinite;
}
html.dark [data-save-state="offline"] > .gk-save-line::before { --gk-save-color: #fbbf24; }
[data-save-state="error"] > .gk-save-line::before {
  --gk-save-color: #ef4444;
  opacity: 1;
}
html.dark [data-save-state="error"] > .gk-save-line::before { --gk-save-color: #f87171; }
@keyframes gkSaveSheen {
  from { transform: translateX(-100%); }
  to   { transform: translateX(265%); }
}
@keyframes gkSaveFill {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
@keyframes gkSaveBreathe {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
}
@media (prefers-reduced-motion: reduce) {
  [data-save-state] > .gk-save-line::before,
  [data-save-state] > .gk-save-line::after { animation: none; }
  [data-save-state="saving"] > .gk-save-line::before { opacity: 0.6; }
  [data-save-state="saving"] > .gk-save-line::after { opacity: 0; }
}

/* Footer colored variants (apply to both icon-only and labeled) */
.modal-footer-btn--trash, .modal-footer-labeled-btn.modal-footer-btn--trash { color: #dc2626; }
@media (hover: hover) {
  .modal-footer-btn--trash:hover, .modal-footer-labeled-btn.modal-footer-btn--trash:hover { background: rgba(239, 68, 68, 0.1) !important; color: #b91c1c !important; }
}
html.dark .modal-footer-btn--trash, html.dark .modal-footer-labeled-btn.modal-footer-btn--trash { color: #fca5a5; }
@media (hover: hover) {
  html.dark .modal-footer-btn--trash:hover, html.dark .modal-footer-labeled-btn.modal-footer-btn--trash:hover { background: rgba(239, 68, 68, 0.22) !important; color: #fecaca !important; }
}

.modal-footer-btn--download, .modal-footer-labeled-btn.modal-footer-btn--download { color: #16a34a; }
@media (hover: hover) {
  .modal-footer-btn--download:hover, .modal-footer-labeled-btn.modal-footer-btn--download:hover { background: rgba(22, 163, 74, 0.1) !important; color: #15803d !important; }
}
html.dark .modal-footer-btn--download, html.dark .modal-footer-labeled-btn.modal-footer-btn--download { color: #86efac; }
@media (hover: hover) {
  html.dark .modal-footer-btn--download:hover, html.dark .modal-footer-labeled-btn.modal-footer-btn--download:hover { background: rgba(34, 197, 94, 0.2) !important; color: #bbf7d0 !important; }
}

.modal-footer-btn--archive, .modal-footer-labeled-btn.modal-footer-btn--archive { color: #a16207; }
@media (hover: hover) {
  .modal-footer-btn--archive:hover, .modal-footer-labeled-btn.modal-footer-btn--archive:hover { background: rgba(161, 98, 7, 0.1) !important; color: #854d0e !important; }
}
html.dark .modal-footer-btn--archive, html.dark .modal-footer-labeled-btn.modal-footer-btn--archive { color: #fcd34d; }
@media (hover: hover) {
  html.dark .modal-footer-btn--archive:hover, html.dark .modal-footer-labeled-btn.modal-footer-btn--archive:hover { background: rgba(251, 191, 36, 0.2) !important; color: #fde68a !important; }
}

.modal-footer-btn--collab, .modal-footer-labeled-btn.modal-footer-btn--collab { color: #7c3aed; }
@media (hover: hover) {
  .modal-footer-btn--collab:hover, .modal-footer-labeled-btn.modal-footer-btn--collab:hover { background: rgba(124, 58, 237, 0.1) !important; color: #6d28d9 !important; }
}
html.dark .modal-footer-btn--collab, html.dark .modal-footer-labeled-btn.modal-footer-btn--collab { color: #c4b5fd; }
@media (hover: hover) {
  html.dark .modal-footer-btn--collab:hover, html.dark .modal-footer-labeled-btn.modal-footer-btn--collab:hover { background: rgba(167, 139, 250, 0.2) !important; color: #ddd6fe !important; }
}

.modal-footer-btn--image, .modal-footer-labeled-btn.modal-footer-btn--image { color: #0284c7; }
@media (hover: hover) {
  .modal-footer-btn--image:hover, .modal-footer-labeled-btn.modal-footer-btn--image:hover { background: rgba(2, 132, 199, 0.1) !important; color: #0369a1 !important; }
}
html.dark .modal-footer-btn--image, html.dark .modal-footer-labeled-btn.modal-footer-btn--image { color: #7dd3fc; }
@media (hover: hover) {
  html.dark .modal-footer-btn--image:hover, html.dark .modal-footer-labeled-btn.modal-footer-btn--image:hover { background: rgba(56, 189, 248, 0.2) !important; color: #bae6fd !important; }
}

.modal-footer-btn--mode, .modal-footer-labeled-btn.modal-footer-btn--mode {
  background: linear-gradient(90deg, #6366f1 0%, #7c3aed 100%) !important;
  color: #fff !important;
  /* Halo on hover only. */
  box-shadow: none !important;
}
@media (hover: hover) {
  .modal-footer-btn--mode:hover, .modal-footer-labeled-btn.modal-footer-btn--mode:hover {
    background: linear-gradient(90deg, #4f46e5 0%, #6d28d9 100%) !important;
    color: #fff !important;
    box-shadow: 0 8px 18px rgba(99, 102, 241, 0.45) !important;
  }
}
html.dark .modal-footer-btn--mode, html.dark .modal-footer-labeled-btn.modal-footer-btn--mode {
  color: #fff !important;
}

/* Footer save checkmark states */
.modal-footer-btn--save-active {
  color: #fff !important;
  background: linear-gradient(90deg, #10b981 0%, #059669 100%) !important;
  /* Halo on hover only. */
  box-shadow: none !important;
}
@media (hover: hover) {
  .modal-footer-btn--save-active:hover {
    background: linear-gradient(90deg, #059669 0%, #047857 100%) !important;
    box-shadow: 0 8px 18px rgba(16, 185, 129, 0.45) !important;
  }
}
html.dark .modal-footer-btn--save-active { color: #fff !important; }
.modal-footer-btn--save-idle {
  color: rgba(16, 185, 129, 0.25) !important;
  border: 1.5px solid rgba(16, 185, 129, 0.15) !important;
  background: transparent !important;
}
html.dark .modal-footer-btn--save-idle {
  color: rgba(52, 211, 153, 0.2) !important;
  border-color: rgba(52, 211, 153, 0.1) !important;
}

/* Footer pin active state */
.modal-footer-btn--pin-active {
  background: #1e293b !important;
  color: #ffffff !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22) !important;
}
@media (hover: hover) {
  .modal-footer-btn--pin-active:hover {
    background: #0f172a !important;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3) !important;
  }
}
.modal-footer-btn--pin-active svg { transform: none !important; }
html.dark .modal-footer-btn--pin-active {
  background: rgba(255, 255, 255, 0.16) !important;
  color: #ffffff !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(255, 255, 255, 0.2) !important;
}
@media (hover: hover) {
  html.dark .modal-footer-btn--pin-active:hover {
    background: rgba(255, 255, 255, 0.22) !important;
  }
}
`;
