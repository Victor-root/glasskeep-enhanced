// History panel anchored to the header bell button. Shows every
// notification still in memory (active + dismissed), newest first.
// Active entries get the same card UI as the viewport; dismissed ones
// are dimmed but still actionable (the user can re-trigger the action
// link or simply remove them via "Clear all").
//
// Desktop: floating panel positioned just below the anchor button.
// Mobile (< 640px viewport): full-width sheet pinned under the header
// so the panel never overflows offscreen on narrow devices.

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBranding } from "../../branding/BrandingContext.jsx";
import { useNotifications } from "./NotificationProvider.jsx";
import NotificationCard from "./NotificationCard.jsx";
import { t } from "../../i18n";

const SHEET_BREAKPOINT_PX = 640;
// Mobile open/close animation duration — the deferred-unmount window that lets
// the slide-out finish before the DOM is removed. Must stay >= the CSS
// transition on .gk-notif-center--mobile (0.6s); this sheet runs a touch
// longer than the compact sync sheet on purpose so a tall panel doesn't whip
// down (its longer translateY(-100%) travel would otherwise feel too fast).
const MOBILE_ANIM_MS = 650;
// Px the bottom edge has to travel upward (via the grabber drag)
// before release closes the panel. Same threshold the editor's
// formatting sheet uses for swipe-to-close.
const MOBILE_CLOSE_THRESHOLD_PX = 60;

export default function NotificationCenter({
  open,
  anchor,
  onClose,
  onAction,
  // App-provided wrapper that also POSTs /notifications/clear so the
  // wipe propagates to other tabs / devices via SSE. Falls back to
  // the provider's local-only clear() when not supplied (kept for
  // standalone use of the component in tests / future panes).
  onClearAll,
}) {
  const { notifications, remove, clear } = useNotifications();
  const { branding } = useBranding();
  const handleClearAll = onClearAll || clear;
  const panelRef = useRef(null);
  // Used by the pointerdown handler below — same pattern as NotesHeader's
  // header kebab menu. A single tap fires pointerdown → pointerup → click.
  // Closing on pointerdown would remove the listener before the click fires,
  // letting the click fall through to whatever is behind the panel. Instead
  // we preventDefault + stopPropagation on pointerdown, set the flag, and
  // keep a permanent click listener that swallows the follow-up event even
  // after the panel state has already changed to closed.
  const swallowNextClickRef = useRef(false);
  const swallowClearTimerRef = useRef(null);

  // Deferred unmount so the mobile slide-down close animation has time
  // to play out before the DOM goes away. Two flags so the open class
  // (which drives the CSS transition) flips one paint AFTER the
  // wrapper has mounted in its closed state — without that gap, the
  // first render would already carry .is-open and the transform would
  // be applied with no transition (the from-state never existed).
  const [rendering, setRendering] = useState(false);
  const [animOpen, setAnimOpen] = useState(false);
  const isMobile =
    rendering &&
    typeof window !== "undefined" &&
    window.innerWidth < SHEET_BREAKPOINT_PX;

  useEffect(() => {
    const mobileNow =
      typeof window !== "undefined" && window.innerWidth < SHEET_BREAKPOINT_PX;
    if (open) {
      setRendering(true);
      if (mobileNow) {
        // Double requestAnimationFrame: rAF #1 fires before the next
        // paint (when the panel has been committed but maybe not yet
        // rendered), rAF #2 fires the frame AFTER, which is reliably
        // past the first paint at translateY(-100%). Adding .is-open
        // then gives the transform transition a real from-frame to
        // animate from — a single rAF was sometimes batched in the
        // same paint and the slide-in skipped silently.
        let r2 = 0;
        const r1 = requestAnimationFrame(() => {
          r2 = requestAnimationFrame(() => setAnimOpen(true));
        });
        return () => {
          cancelAnimationFrame(r1);
          if (r2) cancelAnimationFrame(r2);
        };
      }
      setAnimOpen(true);
      return undefined;
    }
    setAnimOpen(false);
    if (mobileNow) {
      const tm = setTimeout(() => setRendering(false), MOBILE_ANIM_MS);
      return () => clearTimeout(tm);
    }
    setRendering(false);
    return undefined;
  }, [open]);

  // Permanent click swallower — mounted once, never torn down.
  useEffect(() => {
    const onClick = (e) => {
      if (!swallowNextClickRef.current) return;
      swallowNextClickRef.current = false;
      if (swallowClearTimerRef.current) {
        clearTimeout(swallowClearTimerRef.current);
        swallowClearTimerRef.current = null;
      }
      e.stopPropagation();
      e.preventDefault();
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (swallowClearTimerRef.current) {
        clearTimeout(swallowClearTimerRef.current);
        swallowClearTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose && onClose();
    };
    const onPointerDown = (e) => {
      const panel = panelRef.current;
      if (!panel) return;
      if (panel.contains(e.target)) return;
      // Ignore taps on the anchor — the bell button's own toggle runs after
      // this and would immediately re-open the panel otherwise.
      if (anchor && anchor.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      swallowNextClickRef.current = true;
      if (swallowClearTimerRef.current) clearTimeout(swallowClearTimerRef.current);
      swallowClearTimerRef.current = setTimeout(() => {
        swallowNextClickRef.current = false;
        swallowClearTimerRef.current = null;
      }, 500);
      onClose && onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, onClose, anchor]);

  // No body-scroll lock on purpose: setting overflow:hidden on html/body
  // shifted the page (and could leave it stuck). The sheet just overlays the
  // chrome; the list keeps its own overflow-y for scrolling.

  // Grabber drag-to-close — mirrors the editor's .mobile-fmt-sheet
  // grabber except the panel is anchored at the TOP, so the drag is
  // upward (finger moves toward the top of the screen) and the panel
  // shrinks from the bottom by translating up. Direct DOM mutation
  // via panel.style.transform keeps the per-frame work off the React
  // render path; same trick the editor sheet already uses.
  const dragRef = useRef({ active: false, startY: 0, currentY: 0 });
  const dragCleanupRef = useRef(null);

  const handleGrabberDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (dragCleanupRef.current) {
      clearTimeout(dragCleanupRef.current);
      dragCleanupRef.current = null;
    }
    dragRef.current = {
      active: true,
      startY: e.clientY,
      currentY: 0,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    // Disable the CSS transition during the drag so transform follows
    // the finger 1:1; restored on release.
    panel.style.transition = "none";
  };
  const handleGrabberMove = (e) => {
    if (!dragRef.current.active) return;
    // Upward drag = positive dy. Anything downward (dy < 0) is
    // clamped to 0 so the panel doesn't peek out below its safe-area
    // anchor when the user accidentally goes the wrong way.
    const dy = Math.max(0, dragRef.current.startY - e.clientY);
    dragRef.current.currentY = dy;
    const panel = panelRef.current;
    if (panel) panel.style.transform = `translateY(-${dy}px)`;
  };
  const handleGrabberUp = (e) => {
    if (!dragRef.current.active) return;
    const dy = dragRef.current.currentY;
    dragRef.current.active = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transition = "";
    if (dy > MOBILE_CLOSE_THRESHOLD_PX) {
      // Close: continue the move from the current dragged position
      // up to fully offscreen in a single smooth motion — no
      // snap-back to fully-open before collapsing.
      panel.style.transform = "translateY(-100%)";
      onClose && onClose();
      dragCleanupRef.current = setTimeout(() => {
        dragCleanupRef.current = null;
        if (panelRef.current) panelRef.current.style.transform = "";
      }, MOBILE_ANIM_MS);
    } else {
      // Snap back: clear the inline transform so the .is-open CSS
      // rule re-applies and animates the panel back to translateY(0).
      panel.style.transform = "";
    }
  };

  if (!rendering || typeof document === "undefined") return null;

  // Desktop: anchor under the bell button. Mobile: full-screen sheet
  // — covers the entire viewport (minus safe-area insets) so the panel
  // feels like a dedicated screen on small devices. The header keeps
  // the X button so the user always has an obvious close affordance.
  let style;
  if (isMobile) {
    style = {
      position: "fixed",
      top: "var(--safe-top, 0px)",
      left: 0,
      right: 0,
      // Sheet adapts to its content. Caps at the available height
      // (viewport minus safe-area insets) so a long list still gets
      // an internal scroll, but a short / empty list shrinks back to
      // its natural size — with the grabber now exposed, the sheet
      // no longer needs to claim the full screen to feel done.
      maxHeight:
        "calc(100vh - var(--safe-top, 0px) - var(--safe-bottom, 0px))",
      // Square the bottom corners so the sheet still reads as a panel
      // pushed down from the top edge; round the bottom corners so
      // the short / mid-height form factor still feels like a card.
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      borderTop: "none",
      borderLeft: "none",
      borderRight: "none",
      // Vertical scroll inside the list is fine; everything else — page
      // swipes, native drag, horizontal pull — must not bleed through to
      // the notes view when the panel is empty.
      touchAction: "pan-y",
      overscrollBehavior: "contain",
    };
  } else if (anchor && typeof anchor.getBoundingClientRect === "function") {
    const r = anchor.getBoundingClientRect();
    // Right-align with the bell button. Width fixed at 360px so the
    // panel doesn't get squeezed by a narrow anchor.
    const PANEL_WIDTH = 360;
    let right = Math.max(8, window.innerWidth - r.right);
    // If anchoring right would push the panel off the left edge, anchor left instead.
    if (window.innerWidth - right - PANEL_WIDTH < 8) {
      right = Math.max(8, window.innerWidth - r.left - PANEL_WIDTH);
    }
    style = {
      // Sit close to the bell — 4 px below feels anchored without
      // touching the button outline.
      position: "fixed",
      top: r.bottom + 4,
      right,
      width: PANEL_WIDTH,
      maxHeight: "70vh",
    };
  } else {
    style = {
      position: "fixed",
      top: 56,
      right: 8,
      width: 360,
      maxHeight: "70vh",
    };
  }

  const hasAny = notifications.length > 0;

  const node = (
    <div
      ref={panelRef}
      className={`gk-notif-center${isMobile ? " gk-notif-center--mobile" : ""}${isMobile && animOpen ? " is-open" : ""}`}
      style={style}
      role="dialog"
      aria-label={t("notificationCenterTitle")}
    >
      <header className="gk-notif-center__header">
        <div className="gk-notif-center__brand">
          <span className="gk-notif-center__logo-wrap" aria-hidden="true">
            {branding.logo ? (
              <img
                src={branding.logo}
                alt=""
                className="gk-notif-center__logo"
                style={{ objectFit: "contain", borderRadius: 0, boxShadow: "none" }}
                draggable="false"
              />
            ) : (
              <img
                src="/favicon-32x32.png"
                srcSet="/pwa-192.png 2x, /pwa-512.png 3x"
                alt=""
                className="gk-notif-center__logo"
                draggable="false"
              />
            )}
          </span>
          <h2 className="gk-notif-center__title">
            {t("notificationCenterTitle")}
          </h2>
        </div>
        <div className="gk-notif-center__header-actions">
          {hasAny ? (
            <button
              type="button"
              className="gk-notif-center__header-btn"
              onClick={() => handleClearAll()}
            >
              {t("notificationsClearAll")}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={t("close")}
            className="gk-notif-center__close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </header>
      <div className="gk-notif-center__list">
        {!hasAny ? (
          <div className="gk-notif-center__empty">{t("noNotifications")}</div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`gk-notif-center__item ${n.dismissed ? "is-dismissed" : "is-active"}${isMobile ? " gk-notif-center__item--swipeable" : ""}`}
            >
              <NotificationCard
                notification={n}
                // History cards remove the row entirely on close —
                // the entry is already in the panel, so a "soft
                // dismiss" would just dim it without freeing space.
                onDismiss={remove}
                onAction={(notif, chosenAction) => {
                  // Forward BOTH args — the App-level dispatcher
                  // branches on chosenAction.kind for multi-action
                  // cards (Approve / Reject on a pending-user notif,
                  // Open on a retained note-copy, etc.). Without
                  // chosenAction the dispatcher falls back to
                  // notif.action, which is null for multi-action
                  // cards, and the click does nothing visible — the
                  // only side effect is onClose() below, which made
                  // it look like the button just closed the panel.
                  if (onAction) onAction(notif, chosenAction);
                  if (onClose) onClose();
                }}
                compact
                // Inside the panel the X lives on the right of each
                // row, away from the panel's left edge where it
                // would otherwise collide with the gutter.
                closeSide="right"
                // Default "toast" mode so the panel rows render with
                // the same LED-strip border + variant tint as the
                // floating active toasts. Card width follows the
                // panel column via the wrapper (the .gk-notif-card
                // rule already sets width:100%).
                // Mobile: hide the X and enable horizontal swipe to
                // dismiss instead.
                swipeable={isMobile}
              />
            </div>
          ))
        )}
      </div>
      {isMobile ? (
        <div
          className="gk-notif-center-grabber"
          role="button"
          tabIndex={-1}
          aria-label={t("close")}
          onPointerDown={handleGrabberDown}
          onPointerMove={handleGrabberMove}
          onPointerUp={handleGrabberUp}
          onPointerCancel={handleGrabberUp}
        />
      ) : null}
    </div>
  );

  return createPortal(node, document.body);
}
