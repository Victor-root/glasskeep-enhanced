// State of the notification history: every change the provider makes
// goes through this reducer.

// Cap the history list so a long-running session can't accumulate an
// unbounded array of dismissed entries. 100 is more than enough for the
// notification center to feel useful without becoming a memory leak.
const MAX_HISTORY = 100;

export function notificationReducer(state, action) {
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
