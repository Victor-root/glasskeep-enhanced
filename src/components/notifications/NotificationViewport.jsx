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

export const NOTIFICATION_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export function isValidPosition(p) {
  return NOTIFICATION_POSITIONS.includes(p);
}

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
}) {
  const { notifications, dismiss } = useNotifications();
  if (typeof document === "undefined") return null;
  const active = notifications.filter((n) => !n.dismissed).slice(0, MAX_VISIBLE);
  if (active.length === 0) return null;
  const positionClass = POSITION_CLASS[position] || POSITION_CLASS["top-right"];
  const isBottom = position.startsWith("bottom");
  const closeSide = closeSideForPosition(position);
  // Bottom-anchored stacks render the newest notification at the bottom
  // (closest to the anchor edge), top-anchored stacks render the newest
  // at the top — both match user intuition about "the new thing comes in
  // at the edge it's anchored to".
  const ordered = isBottom ? active.slice().reverse() : active;
  const node = (
    <div className={`gk-notif-viewport ${positionClass}`}>
      {ordered.map((n) => (
        <NotificationCard
          key={n.id}
          notification={n}
          onDismiss={dismiss}
          onAction={onAction}
          closeSide={closeSide}
        />
      ))}
    </div>
  );
  return createPortal(node, document.body);
}
