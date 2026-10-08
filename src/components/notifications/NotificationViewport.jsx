// Floating overlay that renders the currently-active notifications at
// one of six fixed positions on the screen. Reads notifications from
// the NotificationProvider context, filters out dismissed entries, and
// caps the visible count so a burst of events never floods the screen
// (the overflow stays accessible through the notification center).
//
// `position` is a render-time prop — App owns it because it's a user
// preference persisted with the other settings.
//
// `onAction` is the App-level dispatcher invoked when the user clicks
// a notification's action button (e.g. "Ouvrir" on a shared-note
// notification). The viewport stays UI-only and doesn't know how to
// open notes itself.

import React from "react";
import { createPortal } from "react-dom";
import { useNotifications } from "./NotificationProvider.jsx";
import NotificationCard from "./NotificationCard.jsx";

const MAX_VISIBLE = 4;

const POSITION_CLASS = {
  "top-left": "gk-notif-viewport--top-left",
  "top-center": "gk-notif-viewport--top-center",
  "top-right": "gk-notif-viewport--top-right",
  "bottom-left": "gk-notif-viewport--bottom-left",
  "bottom-center": "gk-notif-viewport--bottom-center",
  "bottom-right": "gk-notif-viewport--bottom-right",
};

// Map a viewport anchor to the close-button side. A right-anchored
// stack puts its X on the LEFT so the X overhangs INTO the screen
// rather than off the screen edge; left- and centre-anchored stacks
// put their X on the RIGHT for the same reason.
function closeSideForPosition(position) {
  if (position === "top-right" || position === "bottom-right") return "left";
  return "right";
}

export default function NotificationViewport({
  position = "top-right",
  onAction,
  // Hide the floating stack while the notification centre panel is
  // open. New arrivals still land in the provider history (the panel
  // shows them) but we don't double them up as floating toasts on
  // top of the panel.
  suppressed = false,
}) {
  const { notifications, remove } = useNotifications();
  if (typeof document === "undefined") return null;
  if (suppressed) return null;
  const active = notifications.filter((n) => !n.dismissed).slice(0, MAX_VISIBLE);
  if (active.length === 0) return null;
  const positionClass = POSITION_CLASS[position] || POSITION_CLASS["top-right"];
  const isBottom = position.startsWith("bottom");
  const closeSide = closeSideForPosition(position);
  const ordered = isBottom ? active.slice().reverse() : active;
  const node = (
    <div className={`gk-notif-viewport ${positionClass}`}>
      {ordered.map((n) => (
        <NotificationCard
          key={n.id}
          notification={n}
          // Manual close on the floating card hard-removes the row
          // — the user said "if I clicked the X I don't want it in
          // history". Auto-dismiss timers still go through the
          // provider's soft DISMISS path so timed-out cards keep
          // showing in the centre.
          onDismiss={remove}
          onAction={onAction}
          closeSide={closeSide}
        />
      ))}
    </div>
  );
  return createPortal(node, document.body);
}
