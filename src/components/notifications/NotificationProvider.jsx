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

const NotificationContext = createContext(null);

// Cap the history list so a long-running session can't accumulate an
// unbounded array of dismissed entries. 100 is more than enough for the
// notification center to feel useful without becoming a memory leak.
const MAX_HISTORY = 100;

let _nextId = 1;
function uid() {
  return `n_${Date.now().toString(36)}_${(_nextId++).toString(36)}`;
}

function reducer(state, action) {
  switch (action.type) {
    case "ADD": {
      // Cross-session dedup: this provider sits above App in the tree
      // (AppRoot.jsx) so its state survives a sign-out / sign-in cycle.
      // After a reconnect, /notifications/pending replays every still-
      // undelivered row server-side; without this guard a row whose
      // session-1 card is still active here would stack a duplicate.
      // Only ACTIVE entries (dismissed === false) block — a dismissed
      // entry means the user already closed it, and a replay implies
      // markDelivered didn't reach the server, so the re-show is
      // intentional.
      const incoming = action.notification;
      const sid = incoming?.metadata?.serverNotificationId;
      if (sid != null) {
        const dup = state.some(
          (n) =>
            !n.dismissed &&
            n.metadata?.serverNotificationId === sid,
        );
        if (dup) return state;
      }
      return [incoming, ...state].slice(0, MAX_HISTORY);
    }
    case "DISMISS":
      // Soft-hide: mark as dismissed but keep the row in history so
      // the notification center still surfaces it. Used by the
      // viewport close button and by `dismissAll`.
      return state.map((n) =>
        n.id === action.id && !n.dismissed
          ? { ...n, dismissed: true, dismissedAt: Date.now() }
          : n,
      );
    case "DISMISS_BY_SERVER_IDS": {
      // Cross-device sync — match by the stored
      // metadata.serverNotificationId so a `notification_delivered`
      // broadcast can clear active cards even when the matching
      // ADD action is still being flushed by React. Running through
      // a reducer guarantees we see the latest state for every row
      // (including the just-added one) rather than a snapshot from
      // a stale closure.
      const ids = action.ids;
      if (!ids || ids.size === 0) return state;
      const ts = Date.now();
      return state.map((n) => {
        if (n.dismissed) return n;
        const sid = n.metadata?.serverNotificationId;
        if (sid == null) return n;
        if (!ids.has(Number(sid))) return n;
        return { ...n, dismissed: true, dismissedAt: ts };
      });
    }
    case "REMOVE":
      // Hard delete: drop the row entirely. Used by the per-item X
      // in the notification center, so the user can prune history
      // selectively without nuking the whole list (which is what
      // CLEAR is for).
      return state.filter((n) => n.id !== action.id);
    case "REMOVE_BY_SERVER_IDS": {
      // Cross-device per-item remove. When the user clicks X on a
      // history entry on one device, the server DELETEs that row and
      // broadcasts notification_removed; every other device drops
      // matching rows from its in-memory state via this action so the
      // history stays identical everywhere.
      const ids = action.ids;
      if (!ids || ids.size === 0) return state;
      return state.filter((n) => {
        const sid = n.metadata?.serverNotificationId;
        if (sid == null) return true;
        return !ids.has(Number(sid));
      });
    }
    case "DISMISS_ALL": {
      const ts = Date.now();
      return state.map((n) =>
        n.dismissed ? n : { ...n, dismissed: true, dismissedAt: ts },
      );
    }
    case "CLEAR":
      return [];
    case "CLEAR_SERVER_BACKED":
      // Cross-device "Clear all" — only wipe rows backed by a server
      // notification id. Local-only toasts (UI feedback such as
      // "Note moved to trash") have no server counterpart and must
      // survive a remote clear so the user doesn't lose unrelated
      // history on this device.
      return state.filter(
        (n) => n.metadata?.serverNotificationId == null,
      );
    case "MERGE_HISTORY": {
      // Populate the notification center with already-delivered rows
      // fetched from the server at login. Runs on every device/tab so
      // every session sees the same history regardless of which device
      // originally received each notification.
      //
      // Dedup rule: skip any incoming row whose serverNotificationId
      // already appears in state (active OR dismissed) — the in-memory
      // version is the authoritative one for this session.
      const incoming = action.notifications;
      if (!incoming || incoming.length === 0) return state;
      const existingSids = new Set(
        state
          .map((n) => n.metadata?.serverNotificationId)
          .filter((x) => x != null),
      );
      const toAdd = incoming.filter((n) => {
        const sid = n.metadata?.serverNotificationId;
        return sid == null || !existingSids.has(sid);
      });
      if (toAdd.length === 0) return state;
      const merged = [...toAdd, ...state];
      // Keep newest-first so the history panel shows a consistent
      // chronological feed across all devices.
      merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return merged.slice(0, MAX_HISTORY);
    }
    default:
      return state;
  }
}

// Every variant defaults to whatever the consumer last set via
// `setDefaultDuration(ms|null)` — App wires this to a user pref.
// Callers can still override per-call with `duration`; `persistent:
// true` (or `duration: null`) suppresses auto-dismiss regardless.
const FALLBACK_DEFAULT_DURATION = 10000;

export function NotificationProvider({ children }) {
  const [notifications, dispatch] = useReducer(reducer, []);
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

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  return ctx || NOOP_VALUE;
}

export default NotificationProvider;
