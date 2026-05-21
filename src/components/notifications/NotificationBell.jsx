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

import React, { useRef, useState } from "react";
import { useNotifications } from "./NotificationProvider.jsx";
import NotificationCenter from "./NotificationCenter.jsx";
import TI from "../../icons/editor/index.jsx";
import { t } from "../../i18n";

export default function NotificationBell({ dark, onAction }) {
  const { notifications, dismissAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);

  const unread = notifications.reduce(
    (acc, n) => (n.dismissed ? acc : acc + 1),
    0,
  );

  // Same colour treatment as the settings cog button (neutral grey,
  // theme-aware) so the bell visually belongs to the "utility"
  // cluster of the header rather than competing for attention.
  const baseClass =
    "relative inline-flex items-center justify-center w-9 h-9 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors";
  const themeClass = dark
    ? "text-gray-300 hover:text-gray-100 hover:bg-gray-700 focus:ring-gray-500"
    : "text-gray-600 hover:text-gray-800 hover:bg-gray-200 focus:ring-gray-400";

  const handleToggle = () => {
    setOpen((wasOpen) => {
      // Opening = move everything currently floating into the panel.
      if (!wasOpen && unread > 0) dismissAll();
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
        <TI.BellRingingFilled className="tabler-icon tabler-icon--filled" />
        {unread > 0 ? (
          <span className="gk-notif-bell-badge" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      <NotificationCenter
        open={open}
        anchor={buttonRef.current}
        onClose={() => setOpen(false)}
        onAction={onAction}
      />
    </>
  );
}
