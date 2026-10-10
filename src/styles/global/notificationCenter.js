// Notification bell and center, Settings / Admin side panel surface, sync
// status popover and swipe-to-dismiss.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const notificationCenterCSS = `
/* Bell + badge */
/* Bell indicator — a single coloured dot when at least one toast is
   still floating in the viewport. We dropped the numeric badge along
   with the read/unread split: every active notification is already
   visible in the floating stack, so the count adds no information the
   user can't see at a glance. The dot keeps the "something is happening"
   affordance without claiming a number. Same red + white/dark ring as
   the previous badge so the visual identity stays. */
.gk-notif-bell-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #ef4444;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.96);
}
html.dark .gk-notif-bell-dot {
  box-shadow: 0 0 0 2px rgba(28, 28, 34, 0.98);
}

/* Notification center popover — near-opaque white surface so the
   coloured app background does not tint the panel. A faint blur
   (8 px only) adds just enough depth without pulling vivid colours
   from behind the sheet. No saturate() to prevent the pink/lavender
   bleed seen with higher values. */
.gk-notif-center {
  z-index: 75;
  color: #1d1d1f;
  border-radius: 14px;
  background: #f9f6ff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow:
    0 4px 6px -1px rgba(15, 23, 42, 0.07),
    0 10px 28px -4px rgba(15, 23, 42, 0.12),
    0 1px 0 rgba(255, 255, 255, 0.90) inset;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: gkNotifCenterIn 180ms ease-out both;
}
/* Settings / Admin side panels: a subtly theme-tinted surface on desktop
   (--gk-panel-bg follows the active theme, light + dark), but the flat header
   colour (--gk-statusbar) on phones so the whole panel matches the chrome.
   Background lives here (not inline) so the media query can win. */
.gk-side-panel {
  background-color: var(--gk-panel-bg);
  /* Hard guard against any horizontal overflow leaking out of the panel
     (e.g. a long label). overflow-x:clip + the default overflow-y:visible is
     a valid combo that, unlike overflow-x:hidden, does NOT promote the Y axis
     to a scroll container — so it can't spawn a second vertical scrollbar. */
  overflow-x: clip;
}
@media (max-width: 639px) {
  .gk-side-panel { background: var(--gk-statusbar); }
}
/* Desktop sync status popover: the same outer drop shadow as .gk-notif-center
   so both header popovers read identically. */
.gk-sync-sheet {
  box-shadow:
    0 4px 6px -1px rgba(15, 23, 42, 0.07),
    0 10px 28px -4px rgba(15, 23, 42, 0.12);
}
/* Status header: no hard divider line — a soft 6px gradient fade that bleeds
   into the body below, identical to the notification sheet's header (which
   dropped its 1px border for exactly this reason). This is the soft "shadow"
   between the status text and the Sync button. */
.gk-sync-sheet__header {
  position: relative;
}
.gk-sync-sheet__header::after {
  content: "";
  position: absolute;
  bottom: -6px;
  left: 0;
  right: 0;
  height: 6px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.05), transparent);
  pointer-events: none;
}
html.dark .gk-sync-sheet__header::after {
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.20), transparent);
}
html.dark .gk-notif-center {
  color: #f0f0f5;
  background: rgba(28, 28, 38, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.30),
    0 10px 28px -4px rgba(0, 0, 0, 0.50),
    0 1px 0 rgba(255, 255, 255, 0.05) inset;
}
@keyframes gkNotifCenterIn {
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    }
}
.gk-notif-center__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  gap: 6px;
}
html.dark .gk-notif-center__header {
  border-bottom-color: rgba(255, 255, 255, 0.06);
}
.gk-notif-center__title {
  font-size: .95rem;
  font-weight: 700;
  margin: 0;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* Whole title (brand wordmark + localised "Notifications") shares
     the app's violet→indigo gradient so it reads as a single
     decorated heading. Plus a hair-thin dark stroke around the
     letters so the gradient pops on the pale panel background —
     without it the indigo/violet pair washes into #f9f6ff. */
  background: linear-gradient(90deg, #8b5cf6, #6366f1);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  letter-spacing: -0.01em;
  -webkit-text-stroke: 0.4px rgba(15, 23, 42, 0.22);
}
html.dark .gk-notif-center__title {
  /* On the dark panel the contrast already pops; just nudge the
     stroke to a light tint so glyph edges stay crisp. */
  -webkit-text-stroke: 0.4px rgba(255, 255, 255, 0.18);
}
/* Brand row inside the panel header — small rounded logo + the
   gradient title. Sits inside the existing 10 px-padding header so
   the panel's overall height is unchanged. */
.gk-notif-center__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}
.gk-notif-center__logo {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
  user-select: none;
  pointer-events: none;
}
.gk-notif-center__header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.gk-notif-center__header-btn {
  font-size: .72rem;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.75;
}
.gk-notif-center__header-btn:hover {
  opacity: 1;
  background: rgba(0,0,0,0.05);
}
html.dark .gk-notif-center__header-btn:hover { background: rgba(255,255,255,0.07); }
.gk-notif-center__close {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}
.gk-notif-center__close:hover { opacity: 1; background: rgba(0,0,0,0.06); }
html.dark .gk-notif-center__close:hover { background: rgba(255,255,255,0.08); }

/* ── Panel header treatment (desktop + mobile) ─────────────────────
   Sober, app-native panel header. Same dimensions / padding /
   layout / behaviour as the base rules above; this block tweaks
   colours, softens the bottom separator, and turns the logo wrap
   into a transparent passthrough. Same look on desktop and on the
   mobile sheet. */

/* Very faint lilac wash so the header reads as a GlassKeep surface
   without being branded-loud. Hard 1 px bottom separator is dropped
   in favour of a soft fade below. */
.gk-notif-center__header {
  position: relative;
  background: linear-gradient(180deg, rgba(248, 246, 255, 0.96), rgba(249, 246, 255, 0.88));
  border-bottom: none;
}
html.dark .gk-notif-center__header {
  background: linear-gradient(180deg, rgba(32, 30, 42, 0.96), rgba(28, 28, 38, 0.90));
}

/* Soft 6 px bottom fade that bleeds into the list — no hard line. */
.gk-notif-center__header::after {
  content: "";
  position: absolute;
  bottom: -6px;
  left: 0;
  right: 0;
  height: 6px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.05), transparent);
  pointer-events: none;
}
html.dark .gk-notif-center__header::after {
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.20), transparent);
}

/* Title back to a neutral dark colour — no gradient, no stroke. The
   GlassKeep identity sits in the small logo next to it, not in the
   type. Overrides the earlier base rule via source order. */
.gk-notif-center__title {
  background: none;
  -webkit-text-fill-color: initial;
  color: #1d1d1f;
  -webkit-text-stroke: 0;
  letter-spacing: 0;
}
html.dark .gk-notif-center__title {
  color: #f0f0f5;
}

/* Logo wrap is a transparent passthrough — 24 px footprint so the
   header layout stays put, but no coloured background / ring. The
   PWA icon itself fills the box. */
.gk-notif-center__logo-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  background: transparent;
}
.gk-notif-center__logo {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  box-shadow: none;
}

/* Close button stays simple and discreet — neutral hover, no brand
   tint, default size unchanged. */
.gk-notif-center__close {
  background: transparent;
  color: inherit;
  opacity: 0.55;
}
.gk-notif-center__close:hover {
  background: rgba(0, 0, 0, 0.06);
  opacity: 1;
}
html.dark .gk-notif-center__close:hover {
  background: rgba(255, 255, 255, 0.08);
}

.gk-notif-center__list {
  overflow-y: auto;
  /* Prevent swipe-translated cards from creating a horizontal
     scrollbar. overflow-x:hidden + overflow-y:auto is valid CSS —
     the vertical axis stays scrollable while horizontal paint
     overflow (card transforms) is clipped at the list boundary. */
  overflow-x: hidden;
  /* Trap scroll chaining and pull-to-refresh inside the panel — on
     Android PWA / Chrome scrolling up from the top would otherwise
     trigger the browser's reload gesture before the user could see
     any earlier history entry. */
  overscroll-behavior: contain;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* In the mobile sheet the body scrolls and pads; the list keeps a little room
   so the clipped cards' shadows still show. */
.gk-notif-center__list--sheet {
  margin: 0 -6px;
  padding: 2px 6px 6px;
}
.gk-notif-center__empty {
  text-align: center;
  font-size: .85rem;
  opacity: 0.7;
  padding: 24px 12px;
}
.gk-notif-center__item {
  position: relative;
}
.gk-notif-center__item.is-dismissed .gk-notif-card {
  opacity: 0.55;
}
/* Entry animation: applied on the wrapper when the item is swipeable
   so the card itself never has a competing CSS animation on transform
   / opacity (the swipe handler writes those imperatively). */
.gk-notif-center__item--swipeable {
  animation: gkNotifIn 220ms cubic-bezier(.22,.61,.36,1) both;
}
/* In swipe mode the "dismissed = faded" indicator is meaningless:
   opening the bell auto-dismisses every notification, so without this
   rule the entire panel would render at 55 % opacity on first open.
   Per-item removal happens via swipe in this mode anyway. */
.gk-notif-center__item--swipeable.is-dismissed .gk-notif-card {
  opacity: 1;
}

/* ───────── Swipe-to-dismiss wrapper ─────────
   Visible only on mobile inside the NotificationCenter. The wrapper
   stacks a red "delete" background underneath the card; as the card
   is dragged horizontally, the background fades in proportionally and
   the trash glyph reads as the affordance for the gesture. */
.gk-notif-card-swipe-wrap {
  position: relative;
  border-radius: 16px;
  isolation: isolate;
}
.gk-notif-card-swipe-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  border-radius: 16px;
  background: linear-gradient(90deg,
                              rgba(220, 38, 38, 0.92),
                              rgba(220, 38, 38, 0.78) 50%,
                              rgba(220, 38, 38, 0.92));
  color: #fff;
  opacity: 0;
  pointer-events: none;
}
.gk-notif-card-swipe-bg__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.gk-notif-card-swipe-bg .tabler-icon {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  stroke-width: 2px;
}
html.dark .gk-notif-card-swipe-bg {
  background: linear-gradient(90deg,
                              rgba(185, 28, 28, 0.92),
                              rgba(185, 28, 28, 0.78) 50%,
                              rgba(185, 28, 28, 0.92));
}

/* Swipeable card: cancel the entry animation (it now lives on the
   wrapper) and prime the layer for transform/opacity writes from the
   pointer handler. touch-action: pan-y keeps vertical scroll working
   on the panel list. */
.gk-notif-card--swipeable {
  position: relative;
  z-index: 1;
  animation: none !important;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
  will-change: transform, opacity;
}
/* Dismissed-in-history rows keep their X — the user wants per-item
   removal in the panel (it calls REMOVE, not DISMISS, so the row is
   actually deleted). Only "Effacer" wipes the entire list. */
`;
