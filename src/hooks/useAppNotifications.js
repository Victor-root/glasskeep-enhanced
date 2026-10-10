import { useCallback, useEffect, useRef } from "react";
import { api } from "../utils/api.js";
import { useNotifications } from "../components/notifications/NotificationProvider.jsx";
import { playNotificationDing } from "../utils/notificationSound.js";
import { soundCategoryFor, filterCategoryFor } from "../utils/notificationCategories.js";
import { useShareNotifications } from "./useShareNotifications.js";

/**
 * The app's side of the notification provider: applies the user's
 * duration / filter / sound preferences, acks server-backed rows, and
 * exposes `showToast(message, type, duration, icon)`, the compatibility
 * shim the many existing call sites use instead of notify().
 */
export default function useAppNotifications({
  token,
  userId,
  notificationsDuration,
  notificationsFilterTypes,
  notificationsSound,
  notificationsSoundTypes,
}) {
  const {
    notify,
    dismiss: dismissNotification,
    remove: removeNotification,
    dismissByServerIds,
    removeByServerIds,
    clear: clearNotifications,
    clearServerBacked: clearServerBackedNotifications,
    notifications: allNotifications,
    setDefaultDuration,
    setNotifyFilter,
    setOnMarkDelivered,
    setOnMarkRemoved,
  } = useNotifications();

  // The provider's clear() is local-only; this one also tells the server,
  // which broadcasts `notifications_cleared` to the user's other devices
  // and marks still-undelivered rows as delivered.
  const clearAllNotificationsSynced = useCallback(() => {
    clearNotifications();
    const tk = token;
    if (!tk) return;
    api("/notifications/clear", { method: "POST", token: tk }).catch(() => {});
  }, [clearNotifications, token]);

  // Default duration of every notify() call that doesn't pass one.
  useEffect(() => {
    setDefaultDuration(notificationsDuration);
  }, [notificationsDuration, setDefaultDuration]);

  const showToast = useCallback(
    (message, type = "success", duration, icon) => {
      // The optional 4th argument is a semantic icon key ("trash",
      // "archive", "save"...); without one the variant glyph is used.
      const variant =
        type === "success" || type === "error" || type === "info" || type === "warning"
          ? type
          : "info";
      return notify({
        type: "toast",
        variant,
        message,
        duration: duration === undefined ? undefined : duration,
        icon: icon || null,
      });
    },
    [notify],
  );

  // Per-category display filter: the provider drops hidden categories
  // before they reach state or the ding logic.
  useEffect(() => {
    setNotifyFilter((spec) => {
      const cat = filterCategoryFor(spec);
      return notificationsFilterTypes[cat] !== false;
    });
  }, [notificationsFilterTypes, setNotifyFilter]);

  // Ding on a NEW notification. `createdAt` is compared rather than the
  // first id: closing the top card promotes the next one to index 0,
  // which must not ding again.
  const lastDingedAtRef = useRef(0);
  useEffect(() => {
    const newest = allNotifications[0];
    if (!newest) return;
    const createdAt = newest.createdAt || 0;
    if (createdAt <= lastDingedAtRef.current) return;
    lastDingedAtRef.current = createdAt;
    if (newest.dismissed) return;
    if (!notificationsSound) return;
    const category = soundCategoryFor(newest);
    if (notificationsSoundTypes[category] === false) return;
    playNotificationDing();
  }, [allNotifications, notificationsSound, notificationsSoundTypes]);

  // Server-backed notifications: fetches what is still pending on auth
  // and builds the live toasts the server events ask for (with dedup
  // against the fetch).
  const share = useShareNotifications({ token, userId });

  // Every dismiss / remove / auto-dismiss path acks the server, otherwise
  // the row would be replayed at the next reload.
  useEffect(() => {
    setOnMarkDelivered(share.markDelivered);
  }, [setOnMarkDelivered, share.markDelivered]);
  useEffect(() => {
    setOnMarkRemoved(share.markRemoved);
  }, [setOnMarkRemoved, share.markRemoved]);

  return {
    notify,
    showToast,
    allNotifications,
    dismissNotification,
    removeNotification,
    dismissByServerIds,
    removeByServerIds,
    clearServerBackedNotifications,
    clearAllNotificationsSynced,
    showShareToast: share.showShareToast,
    showRevokeToast: share.showRevokeToast,
    showPendingUserToast: share.showPendingUserToast,
    showUserDeletedToast: share.showUserDeletedToast,
  };
}
