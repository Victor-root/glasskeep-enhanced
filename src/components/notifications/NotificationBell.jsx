// Header button: bell icon + unread badge + click to open the
// notification center. Styled to match the other header icon buttons
// (rounded full, hover background tint, dark-mode aware colours).
//
// Unread = active (not yet dismissed) notifications. The badge hides
// itself when the count drops to zero so the bell sits flush in the
// header during quiet periods.

import React, { useRef, useState } from "react";
import { useNotifications } from "./NotificationProvider.jsx";
import NotificationCenter from "./NotificationCenter.jsx";
import TI from "../../icons/editor/index.jsx";
import { t } from "../../i18n";

export default function NotificationBell({ dark, onAction }) {
  const { notifications } = useNotifications();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);

  const unread = notifications.reduce(
    (acc, n) => (n.dismissed ? acc : acc + 1),
    0,
  );

  const baseClass =
    "relative p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800";
  const themeClass = dark
    ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700 focus:ring-gray-500"
    : "text-gray-500 hover:text-gray-700 hover:bg-gray-200 focus:ring-gray-400";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${baseClass} ${themeClass}`}
        data-tooltip={t("notifications")}
        aria-label={t("notifications")}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <TI.Bell />
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
