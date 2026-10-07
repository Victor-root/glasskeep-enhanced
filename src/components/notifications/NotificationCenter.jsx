// History panel of the header bell. Shows every notification still in
// memory (active + dismissed), newest first. Active entries get the same
// card UI as the viewport; dismissed ones are dimmed but still actionable
// (the user can re-trigger the action link or simply remove them via
// "Clear all").
//
// Desktop: floating panel positioned just below the anchor button.
// Mobile (< 640px viewport): a top sheet (Sheet, edge="top") dropping from
// under the status bar, where cards are swiped away instead of closed.

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useBranding } from "../../branding/BrandingContext.jsx";
import { useNotifications } from "./NotificationProvider.jsx";
import NotificationCard from "./NotificationCard.jsx";
import Sheet from "../common/Sheet.jsx";
import { useSwallowClosingClick } from "../../hooks/useSwallowClosingClick.js";
import { t } from "../../i18n";

const SHEET_BREAKPOINT_PX = 640;

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
  // Used by the pointerdown handler below, same pattern as NotesHeader's
  // header kebab menu. A single tap fires pointerdown → pointerup → click.
  // Closing on pointerdown would remove the listener before the click fires,
  // letting the click fall through to whatever is behind the panel, so the
  // closing pointerdown hands its gesture to useSwallowClosingClick.
  const swallowClickOf = useSwallowClosingClick();
  const isMobile = typeof window !== "undefined" && window.innerWidth < SHEET_BREAKPOINT_PX;

  // Desktop panel: Escape and a tap outside close it (the mobile sheet has
  // its own backdrop and Escape handling).
  useEffect(() => {
    if (!open || isMobile) return undefined;
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
      swallowClickOf(e);
      onClose && onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, isMobile, onClose, anchor, swallowClickOf]);

  const hasAny = notifications.length > 0;

  const clearAllButton = hasAny ? (
    <button
      type="button"
      className="gk-notif-center__header-btn"
      onClick={() => handleClearAll()}
    >
      {t("notificationsClearAll")}
    </button>
  ) : null;

  const list = (
    <div className={`gk-notif-center__list${isMobile ? " gk-notif-center__list--sheet" : ""}`}>
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
              // History cards remove the row entirely on close:
              // the entry is already in the panel, so a "soft
              // dismiss" would just dim it without freeing space.
              onDismiss={remove}
              onAction={(notif, chosenAction) => {
                // Forward BOTH args: the App-level dispatcher
                // branches on chosenAction.kind for multi-action
                // cards (Approve / Reject on a pending-user notif,
                // Open on a retained note-copy, etc.). Without
                // chosenAction the dispatcher falls back to
                // notif.action, which is null for multi-action
                // cards, and the click does nothing visible; the
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
  );

  if (isMobile) {
    return (
      <Sheet
        edge="top"
        open={open}
        onClose={onClose}
        title={t("notificationCenterTitle")}
        titleAction={clearAllButton}
        background="var(--gk-statusbar)"
      >
        {list}
      </Sheet>
    );
  }

  if (!open || typeof document === "undefined") return null;

  // Anchored under the bell button.
  let style;
  if (anchor && typeof anchor.getBoundingClientRect === "function") {
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

  const node = (
    <div
      ref={panelRef}
      className="gk-notif-center"
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
          {clearAllButton}
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
      {list}
    </div>
  );

  return createPortal(node, document.body);
}
