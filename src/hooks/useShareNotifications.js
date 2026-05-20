// Persisted toast notifications for "User X shared note Y with you".
//
// Two delivery paths cooperate:
//
//   1. SSE (live)    — when the recipient is connected at the moment
//                      the share happens, the server pushes a
//                      `note_shared` event. The App-level SSE handler
//                      calls `showShareToast` on this hook directly,
//                      then `markDelivered` so the row doesn't replay
//                      on the next reload.
//
//   2. Pending fetch — on every auth (login or reload), this hook
//                      pulls every still-undelivered notification from
//                      the server and shows + marks them. Catches the
//                      cases where the recipient was offline (no SSE
//                      client) when the share happened.
//
// `shownIdsRef` deduplicates inside a single session so the rare race
// where the same notification surfaces via both paths (SSE arrives
// while the pending fetch is in flight) still only shows one toast.
// Cross-session deduplication is handled by the server marking
// `delivered_at`.
//
// 10-second display matches the spec; toast type "info" keeps the
// same blue styling as the other realtime notifications in the app
// (e.g. the admin "new pending user" toast).

import { useCallback, useEffect, useRef } from "react";
import { api } from "../utils/api";
import { t } from "../i18n";

const TOAST_DURATION_MS = 10000;

export function useShareNotifications({ token, userId, showToast }) {
  const shownIdsRef = useRef(new Set());
  // Latest-callable refs so the helpers we return have stable
  // identities. App's `showToast` is redefined on every render
  // (declared as a plain const inside the component); keeping it
  // behind a ref prevents the useEffect below from re-firing — and
  // re-fetching /notifications/pending — on every App render.
  const showToastRef = useRef(showToast);
  const tokenRef = useRef(token);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);
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
      // replay on next reload. Harmless modulo a duplicate toast.
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
    const title = rawTitle || t("untitledNote");
    // Toast renders the string as text content (React escapes
    // children), so there's no HTML-injection surface even if the
    // sender or title contains markup-like characters.
    const cb = showToastRef.current;
    if (typeof cb === "function") {
      cb(t("noteSharedToast", { sender, title }), "info", TOAST_DURATION_MS);
    }
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
