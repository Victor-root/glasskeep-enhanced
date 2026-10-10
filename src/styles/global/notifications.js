// In-app notifications: floating viewport, notification cards and the
// mobile toast.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const notificationsCSS = `
/* ============================================================
   In-app notifications (provider + viewport + center + bell)
   ============================================================
   Six positional variants, glass card visual, badge on the bell.
   Mobile (<640px) collapses the desktop column to full-width edge
   margins so a long message wraps without overflowing the screen. */

/* Floating viewport — six fixed-position variants */
.gk-notif-viewport {
  position: fixed;
  z-index: 70;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none; /* cards opt back in individually */
  max-width: calc(100vw - 16px);
  width: 360px;
}
.gk-notif-viewport > * { pointer-events: auto; }
/* Wide cards (callers that opted into actionLayout:"below" because
   their message is long) bump the whole viewport to a roomier width
   so the message wraps over fewer lines. Scoped via :has() so the
   bump only applies while a wide card is actually visible; the
   default 360px returns the moment it dismisses. Caps at the
   viewport with a 16px safety margin so portrait phones never see
   the card overflow horizontally. */
.gk-notif-viewport:has(.gk-notif-card--wide) {
  width: min(480px, calc(100vw - 16px));
}
.gk-notif-viewport--top-left {
  top: calc(var(--safe-top, 0px) + 0.5rem);
  left: 12px;
  align-items: flex-start;
}
.gk-notif-viewport--top-center {
  top: calc(var(--safe-top, 0px) + 0.5rem);
  left: 50%;
  transform: translateX(-50%);
  align-items: center;
}
.gk-notif-viewport--top-right {
  top: calc(var(--safe-top, 0px) + 0.5rem);
  right: 12px;
  align-items: flex-end;
}
.gk-notif-viewport--bottom-left {
  bottom: calc(var(--safe-bottom, 0px) + 1rem);
  left: 12px;
  align-items: flex-start;
}
.gk-notif-viewport--bottom-center {
  bottom: calc(var(--safe-bottom, 0px) + 1rem);
  left: 50%;
  transform: translateX(-50%);
  align-items: center;
}
.gk-notif-viewport--bottom-right {
  bottom: calc(var(--safe-bottom, 0px) + 1rem);
  right: 12px;
  align-items: flex-end;
}
@media (max-width: 699px) {
  .gk-notif-viewport--top-left,
  .gk-notif-viewport--top-center,
  .gk-notif-viewport--top-right {
    top: calc(var(--safe-top, 0px) + 0.5rem);
  }
}
@media (max-width: 639px) {
  /* Mobile: viewport fills the horizontal space regardless of the
     user's left/center/right preference so a long message has room
     to wrap. Vertical anchor (top/bottom) is still respected. */
  .gk-notif-viewport {
    left: 8px !important;
    right: 8px !important;
    width: auto !important;
    transform: none !important;
    align-items: stretch !important;
  }
}

/* Notification card — macOS Notification Centre styling with the
   app's violet/blue/pink palette. The card has a tinted diagonal
   gradient background over a heavy backdrop blur, plus a thin
   matching gradient border drawn via the dual-background /
   border-box-clip technique so the rounded corners stay clean
   (border-image would have flattened them). The border is subtle
   but visible enough to lift the card off whatever sits behind. */
.gk-notif-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 11px 14px;
  border-radius: 16px;
  /* Toast mode: clean LED-strip look. A 1.5 px solid border in the
     variant colour does most of the work; a second crisp 1 px ring
     immediately outside the border (via spread, 0 blur) doubles the
     strip so it reads as a sharp lit edge rather than a stroke. A
     tiny 4 px bleed adds just enough light to feel emissive without
     becoming a diffuse halo, and the drop shadow stays neutral
     (slate grey, not accent) so the card sits cleanly on its
     surface. No pulse — the strip is static. */
  --gk-notif-glow-ring:  rgba(99, 102, 241, 0.32);
  --gk-notif-glow-bleed: rgba(99, 102, 241, 0.45);
  --gk-notif-bg-tint:    rgba(99, 102, 241, 0.06);
  background: linear-gradient(var(--gk-notif-bg-tint), var(--gk-notif-bg-tint)),
              rgba(252, 252, 255, 0.97);
  border: 2.5px solid var(--gk-notif-accent, #6366f1);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  box-shadow:
    0 0 0 1px   var(--gk-notif-glow-ring),
    0 0 4px 0   var(--gk-notif-glow-bleed),
    0 6px 14px -2px rgba(15, 23, 42, 0.10),
    inset 0 1px 0 rgba(255, 255, 255, 0.80);
  color: #1d1d1f;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  animation: gkNotifIn 280ms cubic-bezier(.22,.61,.36,1) both;
}
html.dark .gk-notif-card {
  background: linear-gradient(var(--gk-notif-bg-tint), var(--gk-notif-bg-tint)),
              rgba(18, 18, 28, 0.97);
  color: #f0f0f5;
  box-shadow:
    0 0 0 1px   var(--gk-notif-glow-ring),
    0 0 5px 0   var(--gk-notif-glow-bleed),
    0 6px 14px -2px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

/* Variant accent colour + per-variant LED palette. Two values only:
   the crisp 1 px ring just outside the border, and the tight 4 px
   bleed that gives the strip its "emissive" feel. Dark-mode rules
   below bump both values up to keep the strip readable on a near-
   black card. */
.gk-notif-card--info {
  --gk-notif-accent:     #3b82f6;
  --gk-notif-bg-tint:    rgba(59, 130, 246, 0.06);
  --gk-notif-glow-ring:  rgba(59, 130, 246, 0.32);
  --gk-notif-glow-bleed: rgba(59, 130, 246, 0.45);
}
.gk-notif-card--success {
  --gk-notif-accent:     #10b981;
  --gk-notif-bg-tint:    rgba(16, 185, 129, 0.06);
  --gk-notif-glow-ring:  rgba(16, 185, 129, 0.32);
  --gk-notif-glow-bleed: rgba(16, 185, 129, 0.45);
}
.gk-notif-card--warning {
  --gk-notif-accent:     #f59e0b;
  --gk-notif-bg-tint:    rgba(245, 158, 11, 0.07);
  --gk-notif-glow-ring:  rgba(245, 158, 11, 0.32);
  --gk-notif-glow-bleed: rgba(245, 158, 11, 0.45);
}
.gk-notif-card--error {
  --gk-notif-accent:     #ef4444;
  --gk-notif-bg-tint:    rgba(239, 68, 68, 0.06);
  --gk-notif-glow-ring:  rgba(239, 68, 68, 0.32);
  --gk-notif-glow-bleed: rgba(239, 68, 68, 0.45);
}
html.dark .gk-notif-card--info {
  --gk-notif-glow-ring:  rgba(59, 130, 246, 0.45);
  --gk-notif-glow-bleed: rgba(59, 130, 246, 0.60);
}
html.dark .gk-notif-card--success {
  --gk-notif-glow-ring:  rgba(16, 185, 129, 0.45);
  --gk-notif-glow-bleed: rgba(16, 185, 129, 0.60);
}
html.dark .gk-notif-card--warning {
  --gk-notif-glow-ring:  rgba(245, 158, 11, 0.45);
  --gk-notif-glow-bleed: rgba(245, 158, 11, 0.60);
}
html.dark .gk-notif-card--error {
  --gk-notif-glow-ring:  rgba(239, 68, 68, 0.45);
  --gk-notif-glow-bleed: rgba(239, 68, 68, 0.60);
}

/* Auto-dismiss countdown bar — only rendered on floating toasts that
   have a finite duration. The fill's animation-duration is set inline
   from the notification's actual duration so it always finishes at
   the exact moment the provider's timer fires.

   Layered as a thin progress strip flush against the bottom of the
   card. Two pieces:
     - The "clip" wrapper anchors a 14-px-tall band at the inside
       bottom edge of the card and applies overflow:hidden with a
       border-radius that matches the card's INNER border curve
       (16 px outer − 2.5 px border = 13.5 px). Children inside —
       the track and the fill — are clipped to the same circular
       silhouette as the card itself, so the corners curve cleanly
       instead of leaving square pixels poking past the card edge.
       Couldn't put overflow:hidden on the card directly because the
       close-button pill overhangs the top-left at -6/-6.
     - The track + fill themselves are a flat full-inside-width
       3.6-px-tall strip (10 % thinner than the previous 4 px), with
       the variant accent used at low opacity for the track and
       full saturation for the fill so the bar reads as part of the
       card's coloured identity. */
.gk-notif-card__countdown-clip {
  /* Inside the padding-box; bottom corners match the card's INNER
     border curve (16 px outer − 2.5 px border = 13.5 px) so the
     strip's silhouette follows the card's bottom curve. */
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 14px;
  border-bottom-left-radius: 13.5px;
  border-bottom-right-radius: 13.5px;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
.gk-notif-card__countdown {
  /* No track surface — the previous design had a coloured track
     (16 % accent on the body bg) that visibly stepped from the
     body's own tint at the top of the strip, which the user read as
     a "couture". Empty container, just contains the fill. */
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3.6px;
}
.gk-notif-card__countdown-fill {
  /* Vertical gradient: transparent at the top so the strip fades
     into the body bg (no top step / seam against the card body),
     full accent at the bottom so it merges with the card's solid
     bottom border (same colour on both sides → invisible boundary).
     transform: scaleX animates left-to-right, so the depleted area
     simply shows the body+border behind. */
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    transparent,
    var(--gk-notif-accent, #6366f1)
  );
  transform-origin: left center;
  animation-name: gkNotifCountdown;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}
@keyframes gkNotifCountdown {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}

/* All variants render a filled Tabler glyph in the accent colour,
   with no coloured chip background — the icon itself carries the
   variant identity. The icon slot stays at 30×30 so the body lines
   up consistently across notifications. */
.gk-notif-card__icon {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--gk-notif-accent);
}
.gk-notif-card__icon-glyph { width: 30px; height: 30px; }

.gk-notif-card__body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-self: stretch;
}
/* Bottom row of the body — message takes the available width and
   the action button sits flush against the message on the right.
   When the message wraps to multiple lines the button stays anchored
   to the bottom edge thanks to align-items: flex-end, so the card
   only grows as tall as the message needs and never gains an extra
   row just for the action. */
.gk-notif-card__body-end {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  min-width: 0;
}
.gk-notif-card__body-end .gk-notif-card__message {
  flex: 1 1 auto;
  min-width: 0;
}
.gk-notif-card__body-end .gk-notif-card__action-btn {
  flex: 0 0 auto;
}

/* Timestamp sits in the card's top-right corner regardless of whether
   an action button is present, so the position stays consistent
   between cards with and without actions. */
.gk-notif-card__time {
  position: absolute;
  top: 11px;
  right: 14px;
  font-size: 11px;
  font-weight: 400;
  opacity: 0.55;
  pointer-events: none;
}
/* Title acts as the notification's headline (was "GlassKeep" in an
   earlier iteration; the user moved the title here so each card
   "presents" itself). Right-padded so a long title doesn't run
   into the absolutely-positioned timestamp. */
.gk-notif-card__title {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.3;
  margin-bottom: 2px;
  word-break: break-word;
  padding-right: 56px;
}
.gk-notif-card__message {
  font-size: 13px;
  line-height: 1.35;
  opacity: 0.88;
  word-break: break-word;
}

.gk-notif-card__action-btn {
  font-size: 12.5px;
  font-weight: 600;
  padding: 5px 14px;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.07);
  color: #1d1d1f;
  transition: background 0.15s, transform 0.1s;
}
.gk-notif-card__action-btn:hover {
  background: rgba(0, 0, 0, 0.12);
}
.gk-notif-card__action-btn:active {
  transform: scale(0.96);
}
html.dark .gk-notif-card__action-btn {
  background: rgba(255, 255, 255, 0.13);
  color: #f5f5f7;
}
html.dark .gk-notif-card__action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Multi-action row — used when a notification carries an actions
   array instead of the single action field. Rendered as a dedicated
   row UNDER the body (not inline next to the message) so the two
   buttons sit side-by-side at full width instead of stacking
   vertically when the message takes a few lines. Right-aligned to
   stay visually anchored to the card's action edge. */
.gk-notif-card__actions {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}
/* When a card carries the multi-action row, the body grows by a
   third row (title + message + actions). Default align-items:center
   on the card would then push the variant icon to the vertical
   centre, far below the title and far above the action buttons —
   the screenshot from the pending-user toast showed a noticeable
   gap between "Nouvelle inscription" and the message line for
   exactly this reason. Pulling the icon to the top of the card
   re-anchors it next to the title, the way a single-row card
   already does naturally because its body height matches the icon
   height. */
.gk-notif-card:has(.gk-notif-card__actions) {
  align-items: flex-start;
}
.gk-notif-card:has(.gk-notif-card__actions) .gk-notif-card__icon {
  margin-top: 1px;
}
/* Secondary action — outline-styled so the reject / cancel half of a
   pair never reads as the primary CTA. Padding is shrunk by 1 px
   each side so the 1-px border doesn't make this button taller /
   wider than the primary one next to it (otherwise the pair looks
   off-balance even with identical labels). */
.gk-notif-card__action-btn--secondary {
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.18);
  color: #1d1d1f;
  padding: 4px 13px;
}
.gk-notif-card__action-btn--secondary:hover {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.28);
}
html.dark .gk-notif-card__action-btn--secondary {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.22);
  color: #f5f5f7;
}
html.dark .gk-notif-card__action-btn--secondary:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.32);
}

/* Close button: corner circular pill (macOS style). The side switches
   based on the parent viewport's anchor edge — see the
   .gk-notif-card--close-right modifier — so for a right-anchored
   stack the X sits on the LEFT of the card (away from the screen
   edge it would otherwise crowd) and vice versa. Hidden by default
   on hover-capable devices and revealed on hover/focus; always
   visible on coarse pointers where there's no hover. */
.gk-notif-card__close {
  position: absolute;
  top: -6px;
  left: -6px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: none;
  background: rgba(80, 80, 85, 0.92);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  /* Default cursor — explicit override so the global
     'button { cursor: pointer }' rule near the top of this file
     does not apply. The user wants this affordance subtle, not
     advertised on hover. */
  cursor: default;
  opacity: 0;
  transition: opacity 0.15s, transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  z-index: 2;
}
.gk-notif-card--close-right .gk-notif-card__close {
  left: auto;
  right: -6px;
}
.gk-notif-card:hover .gk-notif-card__close,
.gk-notif-card:focus-within .gk-notif-card__close {
  opacity: 1;
}
.gk-notif-card__close:hover { background: rgba(60, 60, 65, 1); }
.gk-notif-card__close:active { transform: scale(0.9); }
@media (hover: none) {
  .gk-notif-card__close { opacity: 1; }
}
html.dark .gk-notif-card__close {
  background: rgba(160, 160, 170, 0.92);
  color: #1d1d1f;
}
html.dark .gk-notif-card__close:hover { background: rgba(180, 180, 190, 1); }

/* Compact variant — used by the history list in the center where
   rows are denser. Close button keeps the floating-card behaviour:
   hover-revealed and overhanging the corner so it reads as a
   "remove" handle rather than an inline control. The list's
   padding (8/10 px) absorbs the −6 px overhang without bumping into
   the panel's overflow:hidden clip. */
.gk-notif-card--compact {
  padding: 9px 12px;
  border-radius: 12px;
  gap: 9px;
}
.gk-notif-card--compact .gk-notif-card__icon {
  width: 26px;
  height: 26px;
  font-size: 12px;
  border-radius: 8px;
}
.gk-notif-card--compact .gk-notif-card--info .gk-notif-card__icon,
.gk-notif-card--compact.gk-notif-card--info .gk-notif-card__icon {
  width: 26px;
  height: 26px;
}
.gk-notif-card--compact .gk-notif-card--info .gk-notif-card__icon-glyph,
.gk-notif-card--compact.gk-notif-card--info .gk-notif-card__icon-glyph {
  width: 26px;
  height: 26px;
}
.gk-notif-card--compact .gk-notif-card__title {
  font-size: 12.5px;
  padding-right: 48px;
}
.gk-notif-card--compact .gk-notif-card__message { font-size: 12px; }
.gk-notif-card--compact .gk-notif-card__time { top: 9px; right: 14px; }

/* Center mode — used inside the NotificationCenter panel. The panel
   already provides the frosted glass surface, so the card itself
   strips its gradient + LED halo and falls back to a near-transparent
   wash. Variant identity is still readable: the icon stays in its
   accent colour, and a 3 px left bar in the same accent gives the
   card a quiet "category stripe" without re-introducing a gradient.
   The wider left border is offset by trimming padding-left so the
   icon column stays aligned with the header. */
.gk-notif-card.gk-notif-card--center {
  /* Inside the near-opaque panel the card needs no heavy blur of its
     own — it just sits as a clean white tile. No backdrop-filter so
     it can't pull colour from behind the panel. Variant identity
     comes from the 3 px left accent bar + the icon only.
     Animation is reset to entry-only: no glow pulse inside the panel. */
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-left: 3px solid var(--gk-notif-accent, rgba(0, 0, 0, 0.10));
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
  animation: gkNotifIn 280ms cubic-bezier(.22,.61,.36,1) both;
}
.gk-notif-card.gk-notif-card--center.gk-notif-card--compact {
  padding-left: 10px;
}
html.dark .gk-notif-card.gk-notif-card--center {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-left: 3px solid var(--gk-notif-accent, rgba(255, 255, 255, 0.20));
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.30);
}

@keyframes gkNotifIn {
  from { opacity: 0; transform: translateY(-8px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    }
}

/* ───────── Mobile PWA toast ─────────
   Full-width bottom-anchored card on PWA / browser sessions. Uses the
   same LED-strip visual language as the desktop floating cards — 2.5 px
   variant-coloured border + crisp 1 px outer ring + a soft 4 px bleed.
   The Android wrapper short-circuits this entirely and routes through
   the native Toast.makeText bridge instead. */
.gk-mobile-toast {
  position: fixed;
  z-index: 70;
  left: 50%;
  transform: translateX(-50%);
  /* Anchor the countdown bar absolutely against the pill. */
  isolation: isolate;
  width: max-content;
  max-width: calc(100vw - 24px);
  /* Default to bottom-anchored — the .gk-mobile-toast--anchor-top /
     --anchor-bottom modifier classes (added at render time from the
     user's mobile position preference) override just top/bottom. */
  bottom: calc(var(--safe-bottom, 0px) + 24px);
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 14px;
  border-radius: 16px;
  /* Same vars / palette as the desktop card. The fallback is indigo so
     a notification fired with an unknown variant still gets a coloured
     border instead of going transparent. */
  --gk-notif-glow-ring:  rgba(99, 102, 241, 0.32);
  --gk-notif-glow-bleed: rgba(99, 102, 241, 0.45);
  --gk-notif-bg-tint:    rgba(99, 102, 241, 0.06);
  background:
    linear-gradient(var(--gk-notif-bg-tint), var(--gk-notif-bg-tint)),
    rgba(252, 252, 255, 0.97);
  border: 2.5px solid var(--gk-notif-accent, #6366f1);
  box-shadow:
    0 0 0 1px   var(--gk-notif-glow-ring),
    0 0 4px 0   var(--gk-notif-glow-bleed),
    0 6px 14px -2px rgba(15, 23, 42, 0.10),
    inset 0 1px 0 rgba(255, 255, 255, 0.80);
  color: #1d1d1f;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.3;
  animation: gkMobileToastIn 220ms cubic-bezier(.22,.61,.36,1) both;
  cursor: pointer;
}
/* Anchor variants — touch ONLY top/bottom. All visual styling stays
   in the base .gk-mobile-toast rule above so both anchors get the
   same background, border, animation, etc. */
.gk-mobile-toast.gk-mobile-toast--anchor-top {
  /* Sit BELOW the sticky app header (~72 px on mobile) rather than
     stacking on top of it. Safe-top accounts for the system status
     bar / notch above the header. */
  top: calc(var(--safe-top, 0px) + 88px);
  bottom: auto;
}
.gk-mobile-toast.gk-mobile-toast--anchor-bottom {
  bottom: calc(var(--safe-bottom, 0px) + 24px);
  top: auto;
}
html.dark .gk-mobile-toast {
  background:
    linear-gradient(var(--gk-notif-bg-tint), var(--gk-notif-bg-tint)),
    rgba(18, 18, 28, 0.97);
  color: #f0f0f5;
  box-shadow:
    0 0 0 1px   var(--gk-notif-glow-ring),
    0 0 5px 0   var(--gk-notif-glow-bleed),
    0 6px 14px -2px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

/* Variant palette — mirrors .gk-notif-card--* so the mobile toast and
   the desktop card stay visually synced when both appear in the same
   user's history (centre panel). */
.gk-mobile-toast--info {
  --gk-notif-accent:     #3b82f6;
  --gk-notif-bg-tint:    rgba(59, 130, 246, 0.06);
  --gk-notif-glow-ring:  rgba(59, 130, 246, 0.32);
  --gk-notif-glow-bleed: rgba(59, 130, 246, 0.45);
}
.gk-mobile-toast--success {
  --gk-notif-accent:     #10b981;
  --gk-notif-bg-tint:    rgba(16, 185, 129, 0.06);
  --gk-notif-glow-ring:  rgba(16, 185, 129, 0.32);
  --gk-notif-glow-bleed: rgba(16, 185, 129, 0.45);
}
.gk-mobile-toast--warning {
  --gk-notif-accent:     #f59e0b;
  --gk-notif-bg-tint:    rgba(245, 158, 11, 0.07);
  --gk-notif-glow-ring:  rgba(245, 158, 11, 0.32);
  --gk-notif-glow-bleed: rgba(245, 158, 11, 0.45);
}
.gk-mobile-toast--error {
  --gk-notif-accent:     #ef4444;
  --gk-notif-bg-tint:    rgba(239, 68, 68, 0.06);
  --gk-notif-glow-ring:  rgba(239, 68, 68, 0.32);
  --gk-notif-glow-bleed: rgba(239, 68, 68, 0.45);
}
html.dark .gk-mobile-toast--info {
  --gk-notif-glow-ring:  rgba(59, 130, 246, 0.45);
  --gk-notif-glow-bleed: rgba(59, 130, 246, 0.60);
}
html.dark .gk-mobile-toast--success {
  --gk-notif-glow-ring:  rgba(16, 185, 129, 0.45);
  --gk-notif-glow-bleed: rgba(16, 185, 129, 0.60);
}
html.dark .gk-mobile-toast--warning {
  --gk-notif-glow-ring:  rgba(245, 158, 11, 0.45);
  --gk-notif-glow-bleed: rgba(245, 158, 11, 0.60);
}
html.dark .gk-mobile-toast--error {
  --gk-notif-glow-ring:  rgba(239, 68, 68, 0.45);
  --gk-notif-glow-bleed: rgba(239, 68, 68, 0.60);
}

.gk-mobile-toast__icon {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--gk-notif-accent, #6366f1);
}
.gk-mobile-toast__icon .tabler-icon {
  width: 22px;
  height: 22px;
}
.gk-mobile-toast__body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}
.gk-mobile-toast__title {
  font-size: 13px;
  font-weight: 600;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gk-mobile-toast__message {
  font-size: 12.5px;
  color: inherit;
  opacity: 0.85;
  word-break: break-word;
  /* No line clamp — the pill grows vertically to fit the full
     message. Truncating was hiding important content (e.g. the
     "but a copy was kept for you" tail on access-revoked toasts)
     when the same notification displayed fine in the panel. */
}
/* Wrapper for one or more action buttons inside the pill. flex
   container so multi-action cards (Accept / Reject on pending-user
   notifs, etc.) lay out as a small inline button group. */
.gk-mobile-toast__actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: -4px;
}
.gk-mobile-toast__action {
  flex: 0 0 auto;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--gk-notif-accent, #6366f1);
  background: transparent;
  border: none;
  padding: 4px 10px;
  border-radius: 8px;
  cursor: pointer;
}
/* Secondary action (the "Reject" half of an Accept/Reject pair)
   reads as a neutral outline so the primary CTA stays the default. */
.gk-mobile-toast__action--secondary {
  border: 1px solid rgba(0, 0, 0, 0.18);
  color: inherit;
  padding: 3px 9px;
}
html.dark .gk-mobile-toast__action--secondary {
  border-color: rgba(255, 255, 255, 0.22);
}
.gk-mobile-toast__action:hover { background: rgba(0, 0, 0, 0.05); }
.gk-mobile-toast__action:active { background: rgba(0, 0, 0, 0.10); }
html.dark .gk-mobile-toast__action:hover { background: rgba(255, 255, 255, 0.08); }
html.dark .gk-mobile-toast__action:active { background: rgba(255, 255, 255, 0.14); }

@keyframes gkMobileToastIn {
  from { opacity: 0; transform: translate(-50%, 24px); }
  to   { opacity: 1; transform: translate(-50%, 0);    }
}
/* Top-anchored: slide down from above instead of up from below. */
.gk-mobile-toast--anchor-top {
  animation-name: gkMobileToastInTop;
}
@keyframes gkMobileToastInTop {
  from { opacity: 0; transform: translate(-50%, -24px); }
  to   { opacity: 1; transform: translate(-50%, 0);     }
}

/* Auto-dismiss countdown bar — same anatomy as the desktop card so
   the two surfaces feel like one design system. A clipped 14-px-tall
   band hugs the pill's inner bottom curve (16 px outer − 2.5 px
   border = 13.5 px), and a 3.6-px fill scaleX-animates from 1 → 0
   in sync with the provider's dismiss timer (animation-duration set
   inline from the notification's effective duration). */
.gk-mobile-toast__countdown-clip {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 14px;
  border-bottom-left-radius: 13.5px;
  border-bottom-right-radius: 13.5px;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
.gk-mobile-toast__countdown {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3.6px;
}
.gk-mobile-toast__countdown-fill {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    transparent,
    var(--gk-notif-accent, #6366f1)
  );
  transform-origin: left center;
  animation-name: gkNotifCountdown;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

/* Stacked layout — opt-in via actionLayout:"below" on the notification.
   The default single-row pill crushes a long title + a wide CTA into
   ellipsis territory; this variant gives the message full width and
   pushes the action button onto its own row underneath. Also widens
   the pill (capped at the safe-zone width) so the message wraps over
   fewer lines. */
.gk-mobile-toast--stacked {
  width: min(420px, calc(100vw - 24px));
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    "icon body"
    ".    action";
  align-items: start;
  row-gap: 8px;
  column-gap: 11px;
  padding: 12px 14px;
}
.gk-mobile-toast--stacked .gk-mobile-toast__icon  { grid-area: icon; margin-top: 1px; }
.gk-mobile-toast--stacked .gk-mobile-toast__body  { grid-area: body; }
.gk-mobile-toast--stacked .gk-mobile-toast__actions {
  grid-area: action;
  justify-self: end;
  margin-right: -4px;
}
.gk-mobile-toast--stacked .gk-mobile-toast__action {
  padding: 6px 12px;
  font-size: 13px;
}
/* Title can wrap (no ellipsis truncation) and message gets full lines. */
.gk-mobile-toast--stacked .gk-mobile-toast__title {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
}
.gk-mobile-toast--stacked .gk-mobile-toast__message {
  -webkit-line-clamp: unset;
  display: block;
  overflow: visible;
}
`;
