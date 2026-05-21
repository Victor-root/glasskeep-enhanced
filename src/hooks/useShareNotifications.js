// Persisted "Note shared with you" notifications, routed through the
// central notification provider.
//
// Two delivery paths cooperate:
//
//   1. SSE (live)    — when the recipient is connected at the moment
//                      the share happens, the server pushes a
//                      `note_shared` event. The App-level SSE handler
//                      calls `showShareToast` directly, then
//                      `markDelivered` so the row doesn't replay on
//                      the next reload.
//
//   2. Pending fetch — on every auth (login or reload), the hook
//                      pulls every still-undelivered notification from
//                      the server and shows + marks them. Catches the
//                      cases where the recipient was offline (no SSE
//                      client) when the share happened.
//
// `shownIdsRef` deduplicates inside a single session so the rare race
// where the same notification surfaces via both paths (SSE arrives
// while the pending fetch is in flight) still only shows one card.
// Cross-session deduplication is handled by the server marking
// `delivered_at` once the client has received the row.
//
// Notifications are dispatched as `persistent` cards so they stay on
// screen until the user closes them or clicks the "Ouvrir" action
// (which opens the note + dismisses). They also appear in the
// notification center history.

import { useCallback, useEffect, useRef } from "react";
import { api } from "../utils/api";
import { t } from "../i18n";
import { useNotifications } from "../components/notifications/NotificationProvider.jsx";

export function useShareNotifications({ token, userId }) {
  const { notify } = useNotifications();
  const shownIdsRef = useRef(new Set());
  // Latest-callable refs so the helpers we return stay identity-stable
  // — token comes from App state and notify is provided by context;
  // tying them via refs lets the pending-fetch effect only re-run on
  // login/logout rather than on every App render.
  const notifyRef = useRef(notify);
  const tokenRef = useRef(token);
  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const markDelivered = useCallback((ids) => {
    const tk = tokenRef.current;
    if (!tk) return;
    if (!Array.isArray(ids) || ids.length === 0) return;
    api("/notifications/mark-delivered", {
      method: "POST",
      token: tk,
      body: { ids },
    }).catch(() => {
      // Best-effort: if this fails the rows stay pending and will
      // replay on next reload. Harmless modulo a duplicate card.
    });
  }, []);

  const showShareToast = useCallback((n) => {
    if (!n) return;
    const id = n.id ?? n.notificationId;
    if (id != null) {
      if (shownIdsRef.current.has(id)) return;
      shownIdsRef.current.add(id);
    }
    const sender = String(n.senderName ?? n.sender_name ?? "").trim();
    const rawTitle = String(n.noteTitle ?? n.note_title ?? "").trim();
    const noteTitle = rawTitle || t("untitledNote");
    const noteId = n.noteId ?? n.note_id ?? null;
    const fn = notifyRef.current;
    if (typeof fn !== "function") return;
    fn({
      type: "note_shared",
      variant: "info",
      title: t("noteSharedTitle"),
      message: t("noteSharedToast", { sender, title: noteTitle }),
      persistent: true,
      dismissible: true,
      action: noteId
        ? { label: t("noteSharedAction"), noteId: String(noteId) }
        : null,
      metadata: { serverNotificationId: id, noteId },
    });
  }, []);

  useEffect(() => {
    if (!token || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api("/notifications/pending", { token });
        const list = data?.notifications || [];
        if (cancelled || list.length === 0) return;
        const handled = [];
        for (const n of list) {
          if (n.type === "note_shared") {
            showShareToast({
              id: n.id,
              senderName: n.sender_name,
              noteTitle: n.note_title,
              noteId: n.note_id,
            });
            handled.push(n.id);
          }
        }
        if (handled.length > 0) markDelivered(handled);
      } catch {
        // Offline / 401 — the rows remain pending and we'll retry on
        // the next session.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, userId, showShareToast, markDelivered]);

  return { showShareToast, markDelivered };
}

export default useShareNotifications;
