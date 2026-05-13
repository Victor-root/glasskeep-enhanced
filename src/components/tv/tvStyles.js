// CSS injected when the app boots in Android TV mode.
//
// Gated entirely on `<html data-tv="1">`.

export const TV_STYLE_ID = "tv-mode-styles";

export const TV_CSS = `
/* ------- Root ------- */
:root {
  /* Header sits at 3vh from the top — most TVs only overscan 2-3%
     vertically and the previous 5.5vh was leaving a visible gap. */
  --tv-safe-x: 2vw;
  --tv-safe-y: 3vh;
  --tv-focus-pad: 14px;
  --tv-gap: 14px;
}
html[data-tv="1"], html[data-tv="1"] body {
  background: #0b0d12 !important;
  color: #e5e7eb;
  font-size: 16px;
  line-height: 1.45;
  overflow: hidden !important;
  height: 100vh;
  width: 100vw;
  margin: 0;
  box-sizing: border-box;
}
html[data-tv="1"] body {
  background: radial-gradient(circle at 20% 0%, #1a1530 0%, #0b0d12 55%, #06070b 100%) !important;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
/* Light theme override — flipped via data-tv-theme on <html>. */
html[data-tv="1"][data-tv-theme="light"], html[data-tv="1"][data-tv-theme="light"] body {
  background: #f3f4f6 !important;
  color: #1f2937;
}
html[data-tv="1"][data-tv-theme="light"] body {
  background: radial-gradient(circle at 20% 0%, #ede9fe 0%, #f3f4f6 55%, #e5e7eb 100%) !important;
}
html[data-tv="1"] *, html[data-tv="1"] *::before, html[data-tv="1"] *::after {
  box-sizing: border-box;
}
html[data-tv="1"] *::-webkit-scrollbar { width: 0; height: 0; display: none; }
html[data-tv="1"] * { scrollbar-width: none; }
html[data-tv="1"] { user-select: none; -webkit-user-select: none; }
html[data-tv="1"] .tv-allow-select { user-select: text; -webkit-user-select: text; }

/* ------- Focus ring -------
   Single box-shadow (was 3 stacked) and no transform on the cards
   themselves; older Shields stutter when 100+ cards each have to
   interpolate a multi-shadow + scale. We rely on a sharp violet
   outline ring instead, which is one GPU layer per focused element. */
html[data-tv="1"] *:focus { outline: none; }
html[data-tv="1"] .tv-focusable {
  position: relative;
  transition: box-shadow 90ms ease;
  cursor: default;
}
html[data-tv="1"] .tv-focusable:focus,
html[data-tv="1"] .tv-focusable[data-tv-focused="true"] {
  box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.95);
  z-index: 50;
}
html[data-tv="1"] .tv-focusable.tv-focusable--flat:focus,
html[data-tv="1"] .tv-focusable.tv-focusable--flat[data-tv-focused="true"] {
  box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.95);
}

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
  overflow: hidden;
  padding: 0;
}
html[data-tv="1"] .tv-pager {
  display: grid;
  grid-template-columns: 56px 1fr 56px;
  gap: var(--tv-gap);
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  padding: 12px 14px 22px;
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
  gap: var(--tv-gap);
  align-items: stretch;
  min-width: 0;
  min-height: 0;
  /* Hard cap on height so cards can't grow past the viewport — the
     overflow:hidden trims any preview that would exceed the cell. */
  height: 100%;
  overflow: hidden;
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
html[data-tv="1"] .tv-pager .tv-card__title { font-size: 22px; }
html[data-tv="1"] .tv-pager .tv-card__preview {
  font-size: 16px;
  max-height: none;
  flex: 1 1 auto;
  min-height: 0;
  /* Hard cut via overflow:hidden on the card itself — no mask
     gradient (composited mask was a Shield bottleneck). */
}
html[data-tv="1"] .tv-pager .tv-card__images img { height: 140px; }

/* ------- Note card (closed) ------- */
html[data-tv="1"] .tv-card {
  border-radius: 14px;
  padding: 16px 16px 14px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 7px;
  color: #111827;
  border: 1px solid rgba(255, 255, 255, 0.06);
  position: relative;
  overflow: hidden;
  text-align: left;
  scroll-margin: 40px 24px 60px 24px;
}
html[data-tv="1"] .tv-card__title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
  margin: 0;
  word-break: break-word;
  /* IMPORTANT: do NOT use display: -webkit-box + -webkit-line-clamp.
     On the Shield WebView these get computed as display: flow-root and
     the rendered height collapses to ~0.4em (~8px at 22px font-size)
     for single-line titles like "SMS MIRIAD" — combined with the
     overflow: hidden the title was rendered into a 8px-tall sliver and
     looked clipped through 80% of its glyph height.
     Plain block + max-height + overflow: hidden gives the title its
     natural one-or-two-line height and clips only when it would exceed
     ~2.8em, with no WebKit special-casing involved. */
  display: block;
  max-height: 2.8em;
  overflow: hidden;
}
html[data-tv="1"] .tv-card__preview {
  font-size: 14px;
  line-height: 1.45;
  max-height: 12em;
  overflow: hidden;
  opacity: 0.92;
  word-break: break-word;
  /* No mask-image fade — running a GPU-composited mask on every card
     in a 100+ note grid was a measurable Shield bottleneck. Clean cut
     via overflow:hidden is fast and just as readable. */
}
html[data-tv="1"] .tv-card__preview > * { margin: 0 0 0.4em !important; }
html[data-tv="1"] .tv-card__preview > *:last-child { margin-bottom: 0 !important; }
html[data-tv="1"] .tv-card__preview h1,
html[data-tv="1"] .tv-card__preview h2,
html[data-tv="1"] .tv-card__preview h3 {
  font-weight: 700 !important;
  font-size: 14.5px !important;
  margin: 0.2em 0 0.4em !important;
}
html[data-tv="1"] .tv-card__preview ul,
html[data-tv="1"] .tv-card__preview ol { padding-left: 1.15em !important; }
html[data-tv="1"] .tv-card__preview pre {
  display: block;
  font-family: 'Fira Code', 'JetBrains Mono', monospace !important;
  font-size: 13px !important;
  background: rgba(0, 0, 0, 0.18) !important;
  padding: 6px 9px !important;
  border-radius: 6px !important;
  margin: 5px 0 !important;
  /* Wrap long lines so the preview doesn't silently clip them. */
  white-space: pre-wrap;
  word-break: break-word;
  overflow: hidden;
  max-height: 7em;
}
html[data-tv="1"] .tv-card__preview code {
  font-family: 'Fira Code', 'JetBrains Mono', monospace !important;
  font-size: 13px !important;
  background: rgba(0, 0, 0, 0.18) !important;
  padding: 1px 5px !important;
  border-radius: 4px !important;
}
html[data-tv="1"] .tv-card__preview pre code {
  padding: 0 !important;
  background: transparent !important;
}
html[data-tv="1"] .tv-card__preview hr {
  border: none;
  border-top: 1px solid currentColor;
  opacity: 0.18;
  margin: 7px 0 !important;
}
html[data-tv="1"] .tv-card__preview blockquote {
  border-left: 2px solid currentColor;
  padding: 2px 9px;
  opacity: 0.75;
  margin: 5px 0 !important;
}
html[data-tv="1"] .tv-card__preview img {
  max-width: 100%;
  border-radius: 6px;
  margin: 4px 0 !important;
}
html[data-tv="1"] .tv-card--dark { color: #f3f4f6; }
html[data-tv="1"] .tv-card__footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11.5px;
  opacity: 0.7;
  margin-top: 6px;
}
html[data-tv="1"] .tv-card__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.18);
  font-size: 11.5px;
  font-weight: 600;
}
html[data-tv="1"] .tv-card--dark .tv-card__badge { background: rgba(255, 255, 255, 0.14); }
html[data-tv="1"] .tv-card__images {
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px;
  margin-bottom: 4px;
}
html[data-tv="1"] .tv-card__images--multi { grid-template-columns: 1fr 1fr; }
html[data-tv="1"] .tv-card__images img {
  width: 100%;
  height: 80px;
  /* 'contain' (not 'cover') matches the phone / desktop closed cards:
     show the whole image with letterboxing rather than cropping the
     left & right edges. Cover was making landscape screenshots
     unrecognisable on TV. */
  object-fit: contain;
  border-radius: 7px;
  background: rgba(0,0,0,0.15);
}
html[data-tv="1"] .tv-carousel .tv-card__images img {
  object-fit: contain;
}

/* ------- Note detail (FULLSCREEN) ------- */
html[data-tv="1"] .tv-detail {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  /* No padding around the card — true fullscreen viewer. */
  padding: 0;
  background: #0b0d12;
  animation: tv-detail-in 160ms ease-out;
}
@keyframes tv-detail-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
html[data-tv="1"] .tv-detail__card {
  width: 100%;
  max-width: none;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: none;
  min-height: 0;
}
html[data-tv="1"] .tv-detail__header {
  display: flex;
  align-items: center;
  gap: 14px;
  /* Keep the header dense — same vertical rhythm as before, no taller. */
  padding: calc(var(--tv-safe-y) * 0.5) calc(var(--tv-safe-x) * 1.4) 4px;
  flex-wrap: nowrap;
}
html[data-tv="1"] .tv-detail__title {
  font-size: 24px;
  font-weight: 800;
  line-height: 1.15;
  word-break: break-word;
  flex: 1 1 auto;
  min-width: 0;
}
html[data-tv="1"] .tv-detail__meta {
  font-size: 12px;
  opacity: 0.65;
  flex-shrink: 0;
}
html[data-tv="1"] .tv-detail__close {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: inherit;
}
html[data-tv="1"] .tv-detail__body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 8px calc(var(--tv-safe-x) * 1.4) var(--tv-safe-y);
  font-size: 17px;
  line-height: 1.6;
}
html[data-tv="1"] .tv-detail__body * { max-width: 100%; word-break: break-word; }
html[data-tv="1"] .tv-detail__body h1 { font-size: 26px; font-weight: 800; margin: 18px 0 8px; }
html[data-tv="1"] .tv-detail__body h2 { font-size: 22px; font-weight: 700; margin: 16px 0 8px; }
html[data-tv="1"] .tv-detail__body h3 { font-size: 19px; font-weight: 700; margin: 14px 0 6px; }
html[data-tv="1"] .tv-detail__body p { margin: 0 0 8px; }
html[data-tv="1"] .tv-detail__body ul,
html[data-tv="1"] .tv-detail__body ol { padding-left: 1.4em; margin: 0 0 10px; }
html[data-tv="1"] .tv-detail__body li { margin-bottom: 4px; }
html[data-tv="1"] .tv-detail__body blockquote {
  border-left: 3px solid currentColor;
  padding: 4px 14px;
  margin: 10px 0;
  opacity: 0.85;
  font-style: italic;
}
html[data-tv="1"] .tv-detail__body code {
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 15px;
}
html[data-tv="1"] .tv-detail__body pre {
  background: rgba(0, 0, 0, 0.45);
  padding: 14px 18px;
  border-radius: 10px;
  font-size: 14px;
  /* Long lines wrap — better than horizontal scroll on a TV. */
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  margin: 10px 0;
}
html[data-tv="1"] .tv-detail__body pre code {
  white-space: inherit;
  word-break: inherit;
}
html[data-tv="1"] .tv-detail__body hr {
  border: none;
  border-top: 1px solid currentColor;
  opacity: 0.18;
  margin: 12px 0;
}
html[data-tv="1"] .tv-detail__body img {
  max-width: 100%;
  border-radius: 10px;
  margin: 10px 0;
}

/* Checklist body inside detail */
html[data-tv="1"] .tv-checklist {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
html[data-tv="1"] .tv-checklist__section-title {
  font-size: 15px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 10px 0 2px;
  opacity: 0.85;
}
html[data-tv="1"] .tv-checklist__item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 7px 11px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}
html[data-tv="1"] .tv-checklist__item--done { opacity: 0.45; text-decoration: line-through; }
html[data-tv="1"] .tv-checklist__box {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 5px;
  border: 2px solid currentColor;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 12px;
  margin-top: 2px;
}
html[data-tv="1"] .tv-checklist__item--done .tv-checklist__box { background: currentColor; color: rgba(255, 255, 255, 0.95); }

/* Empty / login */
html[data-tv="1"] .tv-empty {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 50px;
  text-align: center;
  color: #cbd5e1;
}
html[data-tv="1"] .tv-empty__title {
  font-size: 22px;
  font-weight: 700;
  background: linear-gradient(90deg, #c4b5fd, #f9a8d4);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
html[data-tv="1"] .tv-empty__hint {
  font-size: 13px;
  opacity: 0.7;
  max-width: 520px;
}

/* Buttons */
html[data-tv="1"] .tv-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 9px 16px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #e5e7eb;
  font-size: 12px;
  font-weight: 600;
}
html[data-tv="1"] .tv-btn--primary {
  background: linear-gradient(90deg, #6366f1, #7c3aed);
  border-color: transparent;
  color: #ffffff;
}

/* Login surface */
html[data-tv="1"] .tv-login {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4vh 4vw;
  gap: 20px;
}
html[data-tv="1"] .tv-login__card {
  width: 100%;
  max-width: 520px;
  background: rgba(15, 17, 25, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  padding: 28px 30px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
html[data-tv="1"] .tv-login__title {
  font-size: 24px;
  font-weight: 800;
  background: linear-gradient(90deg, #c4b5fd, #f9a8d4);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
html[data-tv="1"] .tv-login__row { display: flex; flex-direction: column; gap: 4px; }
html[data-tv="1"] .tv-login__label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #a78bfa; }
html[data-tv="1"] .tv-login__input {
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9px;
  padding: 11px 14px;
  font-size: 15px;
  color: #f9fafb;
  outline: none;
}
html[data-tv="1"] .tv-login__input:focus { border-color: #a78bfa; box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.4); }
html[data-tv="1"] .tv-login__submit { padding: 12px; font-size: 14px; }
html[data-tv="1"] .tv-login__error {
  color: #fca5a5;
  background: rgba(220, 38, 38, 0.12);
  border: 1px solid rgba(220, 38, 38, 0.3);
  padding: 7px 11px;
  border-radius: 7px;
  font-size: 12px;
}
html[data-tv="1"] .tv-detail,
html[data-tv="1"] .tv-screen { max-width: 100vw; max-height: 100vh; }

/* ===== LIGHT THEME OVERRIDES =====
   Everything below only fires when html[data-tv-theme="light"]. The
   dark palette above is the default. */
html[data-tv="1"][data-tv-theme="light"] .tv-header__hamburger,
html[data-tv="1"][data-tv-theme="light"] .tv-header__viewtoggle,
html[data-tv="1"][data-tv-theme="light"] .tv-header__themetoggle {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
  color: #1f2937;
}
html[data-tv="1"][data-tv-theme="light"] .tv-header__subtitle { color: #4b5563; }
html[data-tv="1"][data-tv-theme="light"] .tv-header__user {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
  color: #1f2937;
}
html[data-tv="1"][data-tv-theme="light"] .tv-header__count {
  color: #5b21b6;
  background: rgba(167, 139, 250, 0.18);
  border-color: rgba(124, 58, 237, 0.35);
}
html[data-tv="1"][data-tv-theme="light"] .tv-sidebar__group-label { color: #6b7280; }
html[data-tv="1"][data-tv-theme="light"] .tv-sidebar__item {
  background: rgba(255, 255, 255, 0.7);
  border-color: rgba(0, 0, 0, 0.06);
  color: #1f2937;
}
html[data-tv="1"][data-tv-theme="light"] .tv-sidebar__item[data-active="true"] {
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.18), rgba(124, 58, 237, 0.12));
  border-color: rgba(124, 58, 237, 0.45);
  color: #4c1d95;
}
html[data-tv="1"][data-tv-theme="light"] .tv-sidebar__item-count {
  color: #4b5563;
  background: rgba(0, 0, 0, 0.05);
}
html[data-tv="1"][data-tv-theme="light"] .tv-detail { background: #f3f4f6; }
html[data-tv="1"][data-tv-theme="light"] .tv-detail__body code {
  background: rgba(0, 0, 0, 0.06);
}
html[data-tv="1"][data-tv-theme="light"] .tv-detail__body pre {
  background: rgba(0, 0, 0, 0.06);
}
html[data-tv="1"][data-tv-theme="light"] .tv-detail__close {
  background: rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.12);
}
html[data-tv="1"][data-tv-theme="light"] .tv-checklist__item {
  background: rgba(0, 0, 0, 0.04);
}
html[data-tv="1"][data-tv-theme="light"] .tv-empty { color: #4b5563; }
html[data-tv="1"][data-tv-theme="light"] .tv-status {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
  color: #374151;
}
`;
