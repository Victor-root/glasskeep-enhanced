// App shell: backdrop-filter warm-up, overlay and scroll freezes, glass
// surfaces, note cards and their drag and drop, header, sidebar, custom
// background overrides and the desktop scroll shell.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const shellCSS = `
/* Backdrop-filter shader warm-up. On touch devices the header / modal-scrim
   blurs are disabled (see the pointer:coarse block), so the create-note FAB
   scrim is usually the FIRST backdrop-filter painted in a session — and the
   browser pays a one-off cost (GL program compile + layer setup) the first
   time, which showed up as a lag before the + menu opened on a cold start.
   This 2px, ~invisible, always-mounted element keeps a backdrop-filter live
   from load, so that one-off cost is paid at startup (imperceptible) and the
   first FAB open reuses the warmed pipeline. Mobile only; pointer-events:none
   so it never intercepts taps. */
.gk-backdrop-warm {
  position: fixed;
  left: 0;
  bottom: 0;
  width: 2px;
  height: 2px;
  z-index: 0;
  opacity: 0.01;
  pointer-events: none;
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}
@media (pointer: fine) {
  /* Desktop already warms the blur via the header glass; don't add a layer. */
  .gk-backdrop-warm { display: none; }
}

/* Disable browser pull-to-refresh while any overlay (notification
   center, sync popover, modals, sidebar, …) is open. The attribute is
   toggled by useOverlayBackStack from a single effect — every panel benefits
   without each having to do its own DOM-level cleanup.
   Only overscroll-behavior is set: no overflow:hidden, no positioning
   changes, so the panel's own scrollable list and any underlying
   layout keep working normally. */
html[data-gk-overlay-locked],
html[data-gk-overlay-locked] body {
  overscroll-behavior: none !important;
  overscroll-behavior-y: none !important;
}
/* While any full-screen overlay is open, the decorative background cards
   sit behind its scrim — invisible (occluded, and blurred when the scrim
   has a backdrop-filter) but still animating. A moving backdrop forces
   the scrim's blur to re-rasterise every frame (the old ≈99%-GPU "open a
   note" case, and the Settings-panel stutter). Freeze the cards while an
   overlay is open so the scrim blurs a STATIC backdrop the GPU caches;
   they resume on close. The float is a pure transform, so pausing is
   free and imperceptible behind the overlay. */
html[data-gk-overlay-locked] .floating-cards-bg .login-deco-card {
  animation-play-state: paused;
}
/* The admin panel's backdrop preview reuses these animated cards. A closed
   side panel stays mounted off-screen (inert), where the browser kept
   ticking them on the main thread, restyling and repainting the page
   several times a second for nothing. Freeze them until the panel opens. */
[inert] .login-deco-card {
  animation-play-state: paused;
}
/* Same trick during active scrolling: a moving backdrop behind the sticky
   blurred header forces the GPU to re-rasterise the blur every frame, which
   janks the scroll on weak GPUs. useScrollActivity sets data-gk-scrolling
   on <html> while the user scrolls (removed ~180ms after it stops), so the
   cards freeze for the duration of the scroll and resume the moment it ends —
   imperceptible, and it hands the whole frame budget back to the scroll. */
html[data-gk-scrolling] .floating-cards-bg .login-deco-card {
  animation-play-state: paused;
}
/* Frosted-glass surfaces, FLATTENED for performance. The live
   backdrop-filter blur is re-rasterised by the GPU on every composite
   frame — a gridful of glass cards scrolling pegs weak integrated GPUs
   (and still costs ~30% of a high-end GPU just to scroll) — so it's dropped
   app-wide and the surfaces are near-opaque instead (legible without it).
   Touch devices got this treatment all along via @media (pointer: coarse);
   now every device does. The ONE blur kept is the modal scrim (see
   .modal-scrim) — the frosted separation behind an open note — which stays
   cheap because the animated background is frozen while any overlay is open
   (html[data-gk-overlay-locked]), so it blurs a STATIC backdrop the GPU caches. */
.glass-card {
  background-color: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--border-light);
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.06);
  /* background-color is transitioned so toggling a custom background
     (which flips these surfaces) fades smoothly. */
  transition: transform 0.2s ease, background-color 0.3s ease;
  break-inside: avoid;
}
html.dark .glass-card {
  background-color: rgba(40, 40, 40, 0.92);
}
/* Note cards: skip rendering when off-screen, isolate paint */
.note-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 200px;
  contain: layout style paint;
  animation: noteAppear 0.15s ease-out;
  -webkit-user-select: none;
  user-select: none;
}
.note-card { cursor: pointer; }
/* Desktop hover only: promote the hovered card to its own compositor layer
   so the group-hover scale animates as a pure transform instead of
   re-rasterising its box-shadow every frame. Scoped to :hover so we never
   keep 200+ promoted layers around, only the one card under the cursor.
   Held back while the list scrolls, like the card's other hover effects
   (the idle-hover variants in index.css). */
html:not([data-gk-scrolling]) .note-card-wrapper:hover .note-card { will-change: transform; }
/* Draw note cards: disable content-visibility which forces paint containment */
.note-card--draw {
  content-visibility: visible;
  contain: layout style;
}
/* Drag & drop reorder styles.
   Classes are added by the drag handlers to .note-card-wrapper but
   the visual treatment is applied to the inner .note-card so the
   pin popup container isnt scaled along with it. */
.note-card.dragging,
.note-card-wrapper.dragging > .note-card {
  opacity: 0.35;
  transform: scale(0.97);
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.note-card.drag-over,
.note-card-wrapper.drag-over > .note-card {
  outline: 2.5px dashed #6366f1;
  outline-offset: 4px;
  transition: outline-offset 0.15s ease, outline-color 0.15s ease;
}
/* Pin popup must vanish the instant the card starts being dragged
   (no transition — display:none beats both Tailwinds group-hover
   transform and the buttons own 300 ms transition). */
.note-card-wrapper.dragging .note-pin-popup {
  display: none;
}

/* Prevent native text selection / long-press callout on the main
   notes grid. The modal lives outside .note-card-wrapper so its
   content stays selectable normally. */
.note-card-wrapper,
.note-card-wrapper * {
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
@keyframes noteAppear {
  from { opacity: 0; }
  to   { opacity: 1; }
}
header.glass-card {
  /* Frosted glass — a SMALL real blur, but on the header ONLY: it's a single
     thin fixed strip (like a macOS/iOS toolbar), not the scrolling grid of
     cards that used to peg the GPU, so re-blurring it each frame is cheap.
     A semi-transparent blue→indigo→violet tint + a top light sheen colour the
     glass; the blur diffuses whatever scrolls behind so it's no longer
     readable, while the fond stays visible. The tint is derived from the
     shared --gk-chrome-* tokens (so themes apply) but made more translucent
     via color-mix — the blur, not opacity, is what hides the content. On
     touch / weak GPUs the blur is dropped for a solid header (see
     @media pointer: coarse). */
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  background:
    linear-gradient(180deg, var(--gk-statusbar) 0%, transparent 100%),
    linear-gradient(100deg,
      color-mix(in srgb, var(--gk-chrome-1) 86%, transparent) 0%,
      color-mix(in srgb, var(--gk-chrome-2) 86%, transparent) 52%,
      color-mix(in srgb, var(--gk-chrome-3) 86%, transparent) 100%);
  /* Only a bottom edge: the base .glass-card border is on all four sides, and
     its left edge showed as a grey 1px liseret against the sidebar. */
  border: 0;
  border-bottom: 1px solid var(--gk-chrome-border);
  box-shadow:
    inset 0 1px 0 var(--gk-chrome-highlight),
    0 1px 2px var(--gk-chrome-shadow),
    0 6px 18px -12px var(--gk-chrome-shadow);
}
/* Desktop shell: the header sits above the scrolling list, not over it, so
   the blur only ever sees the page background. With the floating cards off
   that background is a plain gradient, which blurs into itself: the filter
   changed nothing on screen yet was recomputed on every scrolled frame
   (most of the GPU's compositing work per frame). Keep it only when the
   floating cards are there to be blurred. */
.notes-shell-desktop:not(.floating-cards-bg ~ *) > header.glass-card {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
/* Installed DESKTOP PWA: the OS title bar sits directly above the header and
   is painted with theme-color (--gk-statusbar). Drop the header's top border
   and its bright inset rim-highlight so there's no hard line where the title
   bar meets the header — they read as one continuous surface (the mobile
   pointer:coarse block already does this against the status bar). */
@media (display-mode: standalone) and (pointer: fine) {
  header.glass-card {
    border-top: 0;
    box-shadow:
      0 1px 2px var(--gk-chrome-shadow),
      0 6px 18px -12px var(--gk-chrome-shadow);
  }
}
/* Sidebar — the same static fake-glass recipe, oriented vertically. The
   surface + border + depth live here (token-driven, so it follows every
   theme); TagSidebar.jsx only sets layout (width + safe-area padding).
   Header tint runs left→right and sidebar top→bottom, both starting on
   --gk-chrome-1, so the shared top-left corner stays seamless. */
.gk-sidebar {
  background:
    linear-gradient(180deg, var(--gk-statusbar) 0%, transparent 64px),
    linear-gradient(180deg, var(--gk-chrome-1) 0%, var(--gk-chrome-2) 55%, var(--gk-chrome-3) 100%),
    var(--gk-chrome-solid);
  /* The lateral depth is painted on .gk-sidebar-body (the nav, below the
     header row) instead of here: on the sidebar itself it projected a
     faint vertical shadow through the header strip. */
  box-shadow: inset 0 1px 0 var(--gk-chrome-highlight);
}
/* Sidebar right edge: a real border-right + lateral shadow on the body
   nav (below the header row), not a border-right on the whole sidebar --
   that would cross the header strip, which reads as one seamless surface
   with it (shared --gk-chrome-1 start, see the sidebar background above).
   This used to be a masked pseudo-element instead: a gradient cutoff
   computed from the header height, meant to meet the real header's own
   border in a crisp right angle. That relied on a gradient's sub-pixel
   colour-stop landing on the exact same device pixel as a border's
   snapped position -- two different rasterisation paths that stayed in
   sync at integer CSS pixel zoom but drifted apart under fractional
   OS/browser scaling (125%/150% Windows scaling reproduced it every
   time), leaving a stray pixel at the corner.
   A real border doesn't have that problem: the header row above this
   nav (see TagSidebar.jsx) is sized to var(--gk-header-h), the same
   value the real header measures itself at, so this border's top edge
   and the real header's bottom edge are positioned by ordinary layout --
   the same snapping the browser already gives any two adjacent element
   edges -- instead of needing a mask to fake the same result. */
.gk-sidebar-body {
  border-right: 1px solid var(--gk-chrome-border);
  box-shadow: 8px 0 24px -16px var(--gk-chrome-shadow);
}
/* Installed DESKTOP PWA: drop the sidebar's bright inset top rim-highlight so
   its top edge (the title-bar colour) meets the OS title bar with no 1px line.
   MUST live after the .gk-sidebar base rule above — at equal specificity the
   later rule wins, so placing it inside the earlier standalone block would be
   silently overridden by the base box-shadow (that was the visible seam). */
@media (display-mode: standalone) and (pointer: fine) {
  .gk-sidebar {
    box-shadow: none;
  }
}
/* Sidebar nav entries — hover/active driven by the same chrome tokens so they
   stay coherent with the glass and follow every theme (light + dark). */
.gk-side-item {
  transition: background-color 0.15s ease, color 0.15s ease;
}
.gk-side-item:hover {
  background-color: var(--gk-chrome-hover);
}
.gk-side-item--active {
  /* Vivid brand-gradient pill — the same indigo→violet sweep as the app's
     primary buttons, with white text. The strongest gradient accent of the
     chrome, and fully legible (white on a saturated fill). */
  background: linear-gradient(to right, var(--gk-chrome-grad-from), var(--gk-chrome-grad-to));
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 10px -4px color-mix(in srgb, var(--gk-chrome-grad-to) 55%, transparent);
}
/* Custom background image active (login screen or app), LIGHT mode only.
   The photo is shown raw (vivid), so legibility can't come from the
   backdrop — instead the text-bearing surfaces become near-opaque so
   their text reads over any image, and the few texts that float directly
   on the photo (login logo/title/slogan) get a soft light halo. Dark
   mode keeps its veil + glass look and is intentionally untouched. */
html.gk-custom-bg:not(.dark) .glass-card {
  background-color: rgba(255, 255, 255, 0.92);
}
/* The login form card(s) over a custom background: FULLY opaque (white in
   light, near-black in dark) so the photo never bleeds through behind the
   form. Scoped to .auth-card so the header / note modal are unaffected, and
   the higher specificity (.glass-card.auth-card) beats the 0.92 rule above. */
html.gk-custom-bg:not(.dark) .glass-card.auth-card {
  background-color: #ffffff;
}
html.gk-custom-bg.dark .glass-card.auth-card {
  background-color: #282828;
}
html.gk-custom-bg:not(.dark) header.glass-card {
  /* Opaque even over a custom wallpaper — the header is a solid chrome bar,
     not a frosted panel, so it occludes (and never re-blurs) the animated
     background behind it. */
  background:
    linear-gradient(
      90deg,
      rgba(99, 102, 241, 0.07) 0%,
      rgba(168, 85, 247, 0.07) 50%,
      rgba(236, 72, 153, 0.05) 100%
    ),
    #ffffff;
}
/* Even over a custom wallpaper the sidebar stays a SOLID, opaque panel with
   no backdrop blur — like the header, it occludes the animated background
   instead of re-blurring it every frame (the perf priority on these two
   large chrome surfaces). !important overrides the component's inline
   colour. */
html.gk-custom-bg:not(.dark) .gk-sidebar {
  /* Over a wallpaper the sidebar stays a solid opaque panel (occludes, never
     re-blurs); the background shorthand (not -color) also clears the gradient. */
  background: rgb(240, 232, 255) !important;
}
html.gk-custom-bg.dark .gk-sidebar {
  background: #222222 !important;
}
/* Note-type creation buttons: their light pastel drop-shadow reads as a
   white halo over a photo in light mode (dark mode already uses
   shadow-none). Swap it for a neutral dark shadow so the button sits on
   the wallpaper cleanly. */
html.gk-custom-bg:not(.dark) .gk-create-btn {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22) !important;
}
/* Section labels ("Pinned" / "Others") float directly on the wallpaper,
   so in light mode they get a small frosted pill to stay readable over
   any photo (dark mode reads fine on its veil). */
html.gk-custom-bg:not(.dark) .gk-section-label {
  display: inline-block;
  color: #374151;
  /* Near-opaque pill (no blur) so the label reads over any wallpaper. */
  background: rgba(255, 255, 255, 0.95);
  padding: 3px 12px;
  border-radius: 9999px;
}
/* Shim around composer + sections that yields vertical room for the
   floating multi-select dock at the top of the page. The dock itself
   stays position:fixed so it follows scroll, but without this padding
   the dock would overlap the 3 creation buttons when the user is at
   scrollTop=0. Padding only kicks in while multi-mode is active and
   transitions for a smooth in/out. */
.multi-select-content-shim {
  padding-top: 0;
  /* No padding-top transition: layout reflow over 220ms is expensive on mobile
     and feels like a sluggish auto-scroll. Padding flips instantly; the dock
     itself still slides in via its own multiDockIn animation, and onStartMulti/
     onExitMulti compensate scrollY so the user's view never visibly shifts. */
}
.multi-select-content-shim[data-multimode="true"] {
  /* Symmetric breathing: same 8px gap below the dock as above it.
     Header bottom -> dock top = 8px (96px - 88px). The composer
     naturally sits 24px below the header (mb-6), so adding
     dock-height (56px) + 8px - 24px = 40px on top of mb-6 lands the
     composer 8px below the dock bottom. We round to 48px to absorb
     subpixel layout. */
  padding-top: 48px;
}
@media (max-width: 639px) {
  .multi-select-content-shim[data-multimode="true"] {
    /* Mobile dock is ~52px tall (smaller padding), so 8 + 52 + 8 - 24 = 44 */
    padding-top: 44px;
  }
}

/* ───────── Desktop scroll shell ─────────
   NotesHeader is sticky, but sticky positioning never changes where the
   ancestor's native scrollbar begins -- it still spans the full viewport
   from y=0 unless the scrolling box itself starts below the header. On
   desktop the shell becomes a fixed-height flex column and the shim
   (composer + sections) is the real scrolling box, so its scrollbar
   starts right under the header, matching TagSidebar's own nav. Mobile
   keeps document-level scrolling: native scrollbars are hidden there
   (see the max-width:639px rule above) and the header auto-hide effect
   reads window.scrollY. */
.notes-shell-desktop {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
/* The header's own mb-6 is a flex-item margin, so it would otherwise leave
   a gap between the header and the scroll area -- meaning the scrollbar
   starts 24px below the header instead of flush against it. Zero that
   margin here and re-create the same 24px breathing room as padding
   *inside* the scrolling box instead, so the gap scrolls away with the
   content and the scrollbar itself starts right at the header's edge. */
.notes-shell-desktop > header.glass-card {
  margin-bottom: 0;
}
.notes-shell-desktop > .notes-scroll-area {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-top: 24px;
  /* Scroll on the compositor. Unless the screen is very dense (around 200%
     scaling), the browser keeps a transparent scroller like this one on the
     main thread, which re-rasterised the whole visible grid on every
     scrolled frame: the main cost of scrolling on integrated GPUs.
     Composited, the painted grid is just moved. */
  will-change: scroll-position;
}
/* Desktop grid: render every card up front instead of content-visibility:auto.
   Skipping off-screen cards meant each card entering the viewport was styled,
   laid out and painted mid-scroll, forcing a repaint of the grid on nearly
   every frame. A desktop paints the whole grid once without trouble, and the
   scrollbar now knows the real height of the list from the start. */
.notes-shell-desktop .note-card {
  content-visibility: visible;
}
/* The base 24px above replaces the header's own mb-6, so multimode's
   48px (which assumed mb-6 was still there, see the comment above)
   needs the same 24px folded back in here: 24 + 48 = 72px. */
.notes-shell-desktop > .notes-scroll-area[data-multimode="true"] {
  padding-top: 72px;
}
`;
