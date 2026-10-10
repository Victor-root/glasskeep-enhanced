// Centralised in-app notification system.
//
// One React context wraps the whole app and exposes:
//
//   notify({ type, title, message, variant, duration, persistent,
//            dismissible, action, metadata })
//     → returns the assigned id.
//
//   dismiss(id)       — hide a single notification (X click, action click).
//   dismissAll()      — mark every still-active notification as dismissed.
//   clear()           — wipe the history list entirely.
//   notifications     — the full history array, newest first.
//
// Notifications start as `{ dismissed: false }` and stay that way until
// either the auto-dismiss timer fires (when `duration` is a number) or
// the consumer calls dismiss / dismissAll. Dismissed entries are kept
// in the array so they remain visible in the notification center; the
// viewport filters them out.
//
// `duration` defaults are sized for the existing toast style:
//   - variant=info → 10 000 ms
//   - others       → 5 000 ms
//   - persistent:true or duration:null → never auto-dismiss
//
// Note about deduplication: the provider does NOT dedupe by content.
// Callers that need that (e.g. share-notification fetch + SSE race)
// handle it themselves via metadata.
//
// The exposed action object is opaque to the provider. The viewport
// passes it back to the App-level onAction prop, which decides what to
// do (typically: open the linked note via openModal).

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";
import { notificationReducer } from "./notificationReducer.js";

const NotificationContext = createContext(null);

let _nextId = 1;
function uid() {
  return `n_${Date.now().toString(36)}_${(_nextId++).toString(36)}`;
}

// Every variant defaults to whatever the consumer last set via
// `setDefaultDuration(ms|null)` — App wires this to a user pref.
// Callers can still override per-call with `duration`; `persistent:
// true` (or `duration: null`) suppresses auto-dismiss regardless.
const FALLBACK_DEFAULT_DURATION = 10000;

export function NotificationProvider({ children }) {
  const [notifications, dispatch] = useReducer(notificationReducer, []);
  // Per-notification auto-dismiss timers. Cleared on dismiss, on
  // dismissAll, on clear, and on unmount.
  const timersRef = useRef(new Map());
  // Held in a ref so updating it from a consumer (App watches the
  // user pref) doesn't re-render the whole subtree. `notify` reads
  // the latest value when scheduling each new notification.
  const defaultDurationRef = useRef(FALLBACK_DEFAULT_DURATION);
  // Latest state mirror so dismiss/remove/timer can look up a
  // notification's serverNotificationId without going through the
  // (potentially stale) closure that scheduled the call.
  const notificationsRef = useRef([]);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);
  // App-provided predicate that returns false when a notification
  // should be silently dropped (category filter). Checked inside
  // notify() before any state mutation so filtered-out specs never
  // appear in history or trigger a ding.
  const notifyFilterRef = useRef(null);

  // App-provided delivery-ack POST (markShareNotificationsDelivered).
  // The provider calls it whenever a server-backed notification is
  // resolved on this device (X click, auto-dismiss timer, REMOVE).
  // Held in a ref so the consumer can swap implementations without
  // re-rendering the whole subtree.
  const onMarkDeliveredRef = useRef(null);
  // App-provided server-remove POST (markShareNotificationsRemoved).
  // Called when the user X's a history entry — DELETEs the server row
  // and broadcasts notification_removed to other devices for sync.
  const onMarkRemovedRef = useRef(null);
  // Server ids we've already acked on this device — dedupes against
  // the bell's own markDelivered call AND against the dismiss-after-
  // dismissAll path (where the row is dismissed via DISMISS_ALL but
  // a subsequent REMOVE on the same id would re-POST otherwise).
  const ackedServerIdsRef = useRef(new Set());

  const setDefaultDuration = useCallback((ms) => {
    // null / undefined means "persistent" — no auto-dismiss.
    if (ms == null) {
      defaultDurationRef.current = null;
      return;
    }
    const n = Number(ms);
    if (Number.isFinite(n) && n >= 0) {
      defaultDurationRef.current = n;
    }
  }, []);

  const setNotifyFilter = useCallback((fn) => {
    notifyFilterRef.current = typeof fn === "function" ? fn : null;
  }, []);

  const setOnMarkDelivered = useCallback((fn) => {
    onMarkDeliveredRef.current = typeof fn === "function" ? fn : null;
  }, []);

  const setOnMarkRemoved = useCallback((fn) => {
    onMarkRemovedRef.current = typeof fn === "function" ? fn : null;
  }, []);

  // Public ack helper — dedupes by server id and forwards fresh ones
  // to the App-provided callback. The bell uses this on panel-open
  // so the same ids it broadcasts to the server don't trigger a
  // second POST when the user later clicks X on a leftover card.
  const markDelivered = useCallback((serverIds) => {
    const fn = onMarkDeliveredRef.current;
    if (!fn || !Array.isArray(serverIds) || serverIds.length === 0) return;
    const fresh = [];
    for (const raw of serverIds) {
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      if (ackedServerIdsRef.current.has(n)) continue;
      ackedServerIdsRef.current.add(n);
      fresh.push(n);
    }
    if (fresh.length > 0) fn(fresh);
  }, []);

  // Internal helper: look up the notification's serverNotificationId
  // and route it through markDelivered. Called by dismiss/remove/
  // timer so every "user resolved this card" code path acks the
  // server — without it, rows linger as "pending" and replay at the
  // next /notifications/pending fetch.
  const ackDeliveredById = useCallback(
    (localId) => {
      const notif = notificationsRef.current.find((x) => x.id === localId);
      if (!notif) return;
      const sid = notif.metadata?.serverNotificationId;
      if (sid != null) markDelivered([sid]);
    },
    [markDelivered],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((handle) => clearTimeout(handle));
      timers.clear();
    };
  }, []);

  const cancelTimer = useCallback((id) => {
    const h = timersRef.current.get(id);
    if (h !== undefined) {
      clearTimeout(h);
      timersRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id) => {
      cancelTimer(id);
      ackDeliveredById(id);
      dispatch({ type: "DISMISS", id });
    },
    [cancelTimer, ackDeliveredById],
  );

  // Silent dismiss — marks the notification dismissed in this
  // session's state WITHOUT acking delivery to the server. Used by
  // the mobile pill cycler so per-slice dismissals don't trigger a
  // POST /notifications/delivered, which would broadcast a
  // notification_delivered SSE event to the same user's other
  // sessions (e.g. a desktop tab) and cut their card short mid-bar.
  // The provider's own auto-dismiss setTimeout still fires at
  // `duration` ms after notify() and performs the ack normally —
  // its dispatch DISMISS is then a no-op since this method already
  // marked the row dismissed. Net effect: the server eventually
  // learns the row was delivered, but the cycler doesn't drive the
  // cross-device broadcast.
  const dismissLocal = useCallback((id) => {
    dispatch({ type: "DISMISS", id });
  }, []);

  const remove = useCallback(
    (id) => {
      cancelTimer(id);
      // For server-backed entries, DELETE the row on the server so
      // every other device drops it from its history too. Falls back
      // to plain mark-delivered when no remove callback is wired
      // (standalone provider use, tests).
      const notif = notificationsRef.current.find((x) => x.id === id);
      const sid = notif?.metadata?.serverNotificationId;
      if (sid != null) {
        const fn = onMarkRemovedRef.current;
        if (typeof fn === "function") {
          fn([sid]);
        } else {
          ackDeliveredById(id);
        }
      }
      dispatch({ type: "REMOVE", id });
    },
    [cancelTimer, ackDeliveredById],
  );

  // Cross-device per-item remove handler. Triggered by the SSE
  // `notification_removed` event when another device DELETE'd a row.
  const removeByServerIds = useCallback((ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const set = new Set();
    for (const raw of ids) {
      const n = Number(raw);
      if (Number.isFinite(n)) set.add(n);
    }
    if (set.size === 0) return;
    dispatch({ type: "REMOVE_BY_SERVER_IDS", ids: set });
  }, []);

  // Cross-device dismissal — clears any active card whose
  // metadata.serverNotificationId is in `ids`. The reducer dispatch
  // is the only way to safely act on "newly added notifications" in
  // the same microtask: notificationsRef.current isn't updated
  // until React commits the useEffect that mirrors state, but the
  // reducer always operates on the latest array.
  const dismissByServerIds = useCallback((ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const set = new Set();
    for (const raw of ids) {
      const n = Number(raw);
      if (Number.isFinite(n)) set.add(n);
    }
    if (set.size === 0) return;
    dispatch({ type: "DISMISS_BY_SERVER_IDS", ids: set });
  }, []);

  const dismissAll = useCallback(() => {
    timersRef.current.forEach((h) => clearTimeout(h));
    timersRef.current.clear();
    dispatch({ type: "DISMISS_ALL" });
  }, []);

  const clear = useCallback(() => {
    timersRef.current.forEach((h) => clearTimeout(h));
    timersRef.current.clear();
    dispatch({ type: "CLEAR" });
  }, []);

  // Cross-device "Clear all" — wipe only server-backed rows so local
  // toasts (UI feedback that never hit the DB) survive a remote
  // device's clear. Only the timers for the rows we're about to drop
  // need to be cancelled; local toasts keep their own timers.
  const clearServerBacked = useCallback(() => {
    const list = notificationsRef.current;
    for (const n of list) {
      if (n.metadata?.serverNotificationId != null) {
        const h = timersRef.current.get(n.id);
        if (h !== undefined) {
          clearTimeout(h);
          timersRef.current.delete(n.id);
        }
      }
    }
    dispatch({ type: "CLEAR_SERVER_BACKED" });
  }, []);

  const notify = useCallback((spec) => {
    if (!spec) return null;
    const input = typeof spec === "string" ? { message: spec } : spec;
    // The dedicated unlock banner/screen already communicates the locked
    // state, so drop redundant "instance locked" error toasts that an
    // in-flight request can otherwise raise (matches EN + FR wording).
    if (typeof input.message === "string" && /^instance\s+(is\s+)?(locked|verrouill)/i.test(input.message.trim())) {
      return null;
    }
    // Per-category display filter. Returns false → silently drop this
    // notification before it ever reaches state or the ding logic.
    if (typeof notifyFilterRef.current === "function") {
      if (notifyFilterRef.current(input) === false) return null;
    }
    const id = uid();
    const variant = input.variant || "info";
    const isPersistent =
      input.persistent === true ||
      input.duration === null ||
      input.duration === Infinity;
    // Resolution order: per-call override → user-pref default (via
    // setDefaultDuration) → hard fallback. Result is `null` when the
    // resolved default itself is "persistent" (user pref).
    let duration;
    if (isPersistent) {
      duration = null;
    } else if (typeof input.duration === "number") {
      duration = input.duration;
    } else {
      duration = defaultDurationRef.current;
    }

    const n = {
      id,
      type: input.type || "generic",
      title: input.title != null ? String(input.title) : null,
      // Message can be a string (legacy / system text) or a React
      // element (when the caller built a JSX body via the
      // useShareNotifications buildHighlightedMessage helper — used
      // to render a user-provided value as plain text inside a
      // <strong>{value}</strong> wrapper). Coercing to String() here
      // would turn a JSX element into "[object Object]", which is
      // exactly what happened on share/revoke toasts after the
      // markdown-injection fix. Pass strings through String() to
      // catch the occasional non-string primitive; pass React
      // elements / arrays / fragments through unchanged.
      message:
        input.message == null
          ? ""
          : typeof input.message === "string"
            ? input.message
            : typeof input.message === "number" || typeof input.message === "boolean"
              ? String(input.message)
              : input.message,
      variant,
      // Semantic icon key (e.g. "trash", "archive", "save"). The
      // card resolves it via its own SEMANTIC_ICONS map; if the key
      // is unknown / null the card falls back to the variant glyph.
      icon: input.icon != null ? String(input.icon) : null,
      createdAt: Date.now(),
      duration,
      dismissible: input.dismissible !== false,
      action: input.action || null,
      // Multi-action surface (e.g. Accepter / Refuser on the admin
      // pending-user toast). Card.jsx picks `actions` when it's a
      // non-empty array, else falls back to the legacy single
      // `action` field — both can coexist on the same notif.
      actions: Array.isArray(input.actions) && input.actions.length > 0
        ? input.actions
        : null,
      // Opt-in: "below" forces even a single-action card to render the
      // button in the dedicated row underneath the message instead of
      // squeezed inline next to it. Useful for long messages.
      actionLayout: input.actionLayout === "below" ? "below" : null,
      metadata: input.metadata || null,
      dismissed: false,
      dismissedAt: null,
    };
    dispatch({ type: "ADD", notification: n });
    if (duration && duration > 0) {
      const handle = setTimeout(() => {
        timersRef.current.delete(id);
        // Auto-dismiss counts as the user-side resolution for a
        // server-backed row: the toast was on screen for the full
        // configured duration, the user had every chance to see it.
        // Without this ack the row stays pending and /notifications/
        // pending replays it at the next reload.
        ackDeliveredById(id);
        dispatch({ type: "DISMISS", id });
      }, duration);
      timersRef.current.set(id, handle);
    }
    return id;
  }, [ackDeliveredById]);

  // Populate the history panel with already-delivered notifications
  // fetched from the server at login. Each item must already be a
  // complete notification object (dismissed:true, createdAt set, etc.)
  // built by the caller. The reducer deduplicates by serverNotificationId
  // so calling this multiple times is safe.
  const mergeHistory = useCallback((items) => {
    if (!Array.isArray(items) || items.length === 0) return;
    dispatch({ type: "MERGE_HISTORY", notifications: items });
  }, []);

  const value = {
    notifications,
    notify,
    dismiss,
    remove,
    dismissByServerIds,
    removeByServerIds,
    dismissAll,
    clear,
    clearServerBacked,
    setDefaultDuration,
    setNotifyFilter,
    setOnMarkDelivered,
    setOnMarkRemoved,
    markDelivered,
    mergeHistory,
    dismissLocal,
    // Cancel a notification's auto-dismiss setTimeout WITHOUT
    // dismissing it. Used by the mobile pill when it takes
    // ownership of a queue: the per-notif provider timer would
    // otherwise fire mid-burst and dismiss notifs the cycler
    // hadn't reached yet. Stays in the local session only — no
    // POST, no SSE — so other sessions of the same user are
    // unaffected.
    cancelAutoDismiss: cancelTimer,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

const NOOP_VALUE = {
  notifications: [],
  notify: () => null,
  dismiss: () => {},
  remove: () => {},
  dismissByServerIds: () => {},
  removeByServerIds: () => {},
  dismissAll: () => {},
  clear: () => {},
  clearServerBacked: () => {},
  setDefaultDuration: () => {},
  setNotifyFilter: () => {},
  setOnMarkDelivered: () => {},
  setOnMarkRemoved: () => {},
  markDelivered: () => {},
  mergeHistory: () => {},
  dismissLocal: () => {},
  cancelAutoDismiss: () => {},
};

// eslint-disable-next-line react-refresh/only-export-components -- consumer hook of this provider's context, imported from here by App.jsx
export function useNotifications() {
  const ctx = useContext(NotificationContext);
  return ctx || NOOP_VALUE;
}

export default NotificationProvider;
