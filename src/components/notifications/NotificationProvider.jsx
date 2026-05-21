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
    case "ADD":
      return [action.notification, ...state].slice(0, MAX_HISTORY);
    case "DISMISS":
      // Soft-hide: mark as dismissed but keep the row in history so
      // the notification center still surfaces it. Used by the
      // viewport close button and by `dismissAll`.
      return state.map((n) =>
        n.id === action.id && !n.dismissed
          ? { ...n, dismissed: true, dismissedAt: Date.now() }
          : n,
      );
    case "REMOVE":
      // Hard delete: drop the row entirely. Used by the per-item X
      // in the notification center, so the user can prune history
      // selectively without nuking the whole list (which is what
      // CLEAR is for).
      return state.filter((n) => n.id !== action.id);
    case "DISMISS_ALL": {
      const ts = Date.now();
      return state.map((n) =>
        n.dismissed ? n : { ...n, dismissed: true, dismissedAt: ts },
      );
    }
    case "CLEAR":
      return [];
    default:
      return state;
  }
}

function pickDefaultDuration(variant) {
  return variant === "info" ? 10000 : 5000;
}

export function NotificationProvider({ children }) {
  const [notifications, dispatch] = useReducer(reducer, []);
  // Per-notification auto-dismiss timers. Cleared on dismiss, on
  // dismissAll, on clear, and on unmount.
  const timersRef = useRef(new Map());

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
      dispatch({ type: "DISMISS", id });
    },
    [cancelTimer],
  );

  const remove = useCallback(
    (id) => {
      cancelTimer(id);
      dispatch({ type: "REMOVE", id });
    },
    [cancelTimer],
  );

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

  const notify = useCallback((spec) => {
    if (!spec) return null;
    const input = typeof spec === "string" ? { message: spec } : spec;
    const id = uid();
    const variant = input.variant || "info";
    const isPersistent =
      input.persistent === true ||
      input.duration === null ||
      input.duration === Infinity;
    const duration = isPersistent
      ? null
      : typeof input.duration === "number"
        ? input.duration
        : pickDefaultDuration(variant);

    const n = {
      id,
      type: input.type || "generic",
      title: input.title != null ? String(input.title) : null,
      message: input.message != null ? String(input.message) : "",
      variant,
      createdAt: Date.now(),
      duration,
      dismissible: input.dismissible !== false,
      action: input.action || null,
      metadata: input.metadata || null,
      dismissed: false,
      dismissedAt: null,
    };
    dispatch({ type: "ADD", notification: n });
    if (duration && duration > 0) {
      const handle = setTimeout(() => {
        timersRef.current.delete(id);
        dispatch({ type: "DISMISS", id });
      }, duration);
      timersRef.current.set(id, handle);
    }
    return id;
  }, []);

  const value = {
    notifications,
    notify,
    dismiss,
    remove,
    dismissAll,
    clear,
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
  dismissAll: () => {},
  clear: () => {},
};

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  return ctx || NOOP_VALUE;
}

export default NotificationProvider;
