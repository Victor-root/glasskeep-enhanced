// History panel anchored to the header bell button. Shows every
// notification still in memory (active + dismissed), newest first.
// Active entries get the same card UI as the viewport; dismissed ones
// are dimmed but still actionable (the user can re-trigger the action
// link or simply remove them via "Clear all").
//
// Desktop: floating panel positioned just below the anchor button.
// Mobile (< 640px viewport): full-width sheet pinned under the header
// so the panel never overflows offscreen on narrow devices.

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNotifications } from "./NotificationProvider.jsx";
import NotificationCard from "./NotificationCard.jsx";
import { t } from "../../i18n";

const SHEET_BREAKPOINT_PX = 640;

export default function NotificationCenter({
  open,
  anchor,
  onClose,
  onAction,
}) {
  const { notifications, remove, dismissAll, clear } = useNotifications();
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose && onClose();
    };
    const onDocMouseDown = (e) => {
      const panel = panelRef.current;
      if (!panel) return;
      if (panel.contains(e.target)) return;
      // Ignore clicks on the anchor itself — the button's own toggle
      // handler runs after this and would re-open the panel otherwise.
      if (anchor && anchor.contains(e.target)) return;
      onClose && onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDocMouseDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDocMouseDown, true);
    };
  }, [open, onClose, anchor]);

  if (!open || typeof document === "undefined") return null;

  const isMobile =
    typeof window !== "undefined" && window.innerWidth < SHEET_BREAKPOINT_PX;

  // Desktop: anchor under the bell button. Mobile: full-width sheet.
  let style;
  if (isMobile) {
    style = {
      position: "fixed",
      top: "calc(var(--safe-top, 0px) + 56px)",
      left: 8,
      right: 8,
      maxHeight: "70vh",
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
  const hasActive = notifications.some((n) => !n.dismissed);

  const node = (
    <div ref={panelRef} className="gk-notif-center" style={style} role="dialog" aria-label={t("notificationCenterTitle")}>
      <header className="gk-notif-center__header">
        <h2 className="gk-notif-center__title">
          {t("notificationCenterTitle")}
        </h2>
        <div className="gk-notif-center__header-actions">
          {hasActive ? (
            <button
              type="button"
              className="gk-notif-center__header-btn"
              onClick={() => dismissAll()}
            >
              {t("notificationsMarkAllRead")}
            </button>
          ) : null}
          {hasAny ? (
            <button
              type="button"
              className="gk-notif-center__header-btn"
              onClick={() => clear()}
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
              className={`gk-notif-center__item ${n.dismissed ? "is-dismissed" : "is-active"}`}
            >
              <NotificationCard
                notification={n}
                // History cards remove the row entirely on close —
                // the entry is already in the panel, so a "soft
                // dismiss" would just dim it without freeing space.
                onDismiss={remove}
                onAction={(notif) => {
                  if (onAction) onAction(notif);
                  if (onClose) onClose();
                }}
                compact
                // Inside the panel the X lives on the right of each
                // row, away from the panel's left edge where it
                // would otherwise collide with the gutter.
                closeSide="right"
              />
            </div>
          ))
        )}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
