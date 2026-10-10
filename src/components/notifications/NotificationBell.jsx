// Header button: bell-ringing icon + unread badge + click to open
// the notification center. Sized to match the sibling header icons
// (list view, theme toggle, …) — the filled tabler glyph is
// constrained to 20×20 inside the same 8-px padded rounded-full
// hit area so it sits at the exact same baseline as its neighbours.
//
// Opening the panel also marks any still-visible toasts as dismissed
// — the user explicitly wants the open / close action to clear the
// floating stack so the panel becomes the single source of truth for
// what's still actionable.
//
// "Unread" = active (not yet dismissed). Badge hides itself when the
// count drops to zero so the bell sits flush in the header during
// quiet periods.

import React, { useEffect, useRef, useState } from "react";
import { useNotifications } from "./NotificationProvider.jsx";
import NotificationCenter from "./NotificationCenter.jsx";
import TI from "../../icons/editor/index.jsx";
import { t } from "../../i18n";

export default function NotificationBell({
  dark,
  onAction,
  onClearAll,
  // Optional callback fired whenever the open state changes. App.jsx
  // uses this to know when the panel is open without taking over the
  // state itself — two NotificationBell instances (desktop + mobile)
  // are mounted in parallel and only the visible one is ever toggled,
  // so the local state stays correctly per-instance and we never end
  // up rendering two NotificationCenter portals at once.
  onOpenChange,
  // Optional ref the parent can use to close the panel from outside
  // (e.g. useOverlayBackStack, for the Android back button).
  // Whichever instance is currently open writes its close fn into the
  // ref; the closed one leaves it alone. Cleared on close.
  closeRef,
}) {
  const { notifications, dismissAll, markDelivered } = useNotifications();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);

  // Sync local state up to whichever parent cares (App.jsx for PTR).
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  // Expose a close handle while open so the parent can dismiss the
  // panel without owning the state (back button, programmatic close).
  useEffect(() => {
    if (!open || !closeRef) return undefined;
    closeRef.current = () => setOpen(false);
    return () => { if (closeRef) closeRef.current = null; };
  }, [open, closeRef]);

  const unread = notifications.reduce(
    (acc, n) => (n.dismissed ? acc : acc + 1),
    0,
  );

  // Filled bell uses the indigo accent — #6366f1 (indigo-500) in light
  // mode, #9c9ddb (a desaturated indigo) in dark — so the icon reads as
  // a coloured indicator rather than a neutral chrome glyph. Hover and
  // focus stay subtle so the button still sits inside the utility row.
  const baseClass =
    "relative inline-flex items-center justify-center w-9 h-9 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors";
  const themeClass = "gk-header-icon-btn focus:ring-indigo-400";
  const iconColor = dark ? "#9c9ddb" : "#6366f1";

  const handleToggle = () => {
    setOpen((wasOpen) => {
      // Opening = move everything currently floating into the panel,
      // and acknowledge any still-pending server-side rows. Without
      // the server ack, a second device reconnecting later would
      // re-fetch the same notifications from /pending and replay
      // them, even though the user has already seen the cards here.
      // markDelivered comes from the provider context and dedupes
      // internally, so any ids already acked (e.g. by an earlier X
      // click) won't trigger a second POST.
      if (!wasOpen && unread > 0) {
        const serverIds = [];
        for (const n of notifications) {
          if (n.dismissed) continue;
          const sid = n.metadata?.serverNotificationId;
          if (sid != null) serverIds.push(sid);
        }
        if (serverIds.length > 0) markDelivered(serverIds);
        dismissAll();
      }
      return !wasOpen;
    });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={`${baseClass} ${themeClass}`}
        data-tooltip={t("notifications")}
        aria-label={t("notifications")}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {/* Outline bell at rest, filled bell while the panel is open
            — gives the header button a "the panel is up" affordance
            without changing the accent colour. */}
        {open ? (
          <TI.BellFilled
            className="tabler-icon tabler-icon--filled"
            style={{ color: iconColor }}
          />
        ) : (
          <TI.Bell
            className="tabler-icon"
            style={{ color: iconColor }}
          />
        )}
        {unread > 0 ? (
          <span className="gk-notif-bell-dot" aria-hidden="true" />
        ) : null}
      </button>
      <NotificationCenter
        open={open}
        // eslint-disable-next-line react-hooks/refs -- the bell button is mounted before the panel can open, so its node is available when the anchor matters
        anchor={buttonRef.current}
        onClose={() => setOpen(false)}
        onAction={onAction}
        onClearAll={onClearAll}
      />
    </>
  );
}
