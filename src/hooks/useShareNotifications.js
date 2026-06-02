// Persisted notifications (share, revoke, test, generic), routed
// through the central notification provider.
//
// Three delivery paths cooperate so every device sees the same state:
//
//   1. SSE (live)    — when the recipient is connected at the moment
//                      the event happens, the server pushes a typed
//                      event (note_shared, note_access_revoked, …).
//                      The App-level SSE handler calls showShareToast /
//                      showRevokeToast directly, then markDelivered so
//                      the row doesn't replay on the next reload.
//
//   2. Pending fetch — on every auth (login or reload), the hook pulls
//                      every still-undelivered notification and shows
//                      them as active toasts. Catches the cases where
//                      the recipient was offline when the event fired.
//
//   3. History fetch — runs alongside the pending fetch. Pulls the last
//                      100 already-delivered rows and injects them into
//                      the provider as dismissed entries so the
//                      notification center history panel is identical
//                      on every device, tab, and after every reconnect.
//
// `shownIdsRef` deduplicates paths 1 and 2 inside a single session so
// the rare race where the same notification arrives via both doesn't
// show duplicate toasts. The provider's ADD reducer deduplicates by
// serverNotificationId across sessions. History items are deduplicated
// by the MERGE_HISTORY reducer action.

import React, { useCallback, useEffect, useRef } from "react";
import { api } from "../utils/api";
import { t } from "../i18n";
import { useNotifications } from "../components/notifications/NotificationProvider.jsx";

// Build a localized notification body as JSX with the user-provided
// values rendered as plain text and the chosen ones wrapped in
// <strong>. Replaces the previous approach of injecting
// `**${userValue}**` markdown markers into the t() result, which
// fed user content straight through the renderMessage parser and
// made `**foo**` inside a note title look bold in the toast.
//
// Each highlightKey is substituted into the template with a unique
// control-character marker, then the resulting string is walked
// once and every marker is replaced by a <strong>{value}</strong>
// React element. Markers use  padding bytes that never appear
// in normal text input, so they survive even if the template (or a
// user value) contains regular ASCII punctuation.
function buildHighlightedMessage(templateKey, params, highlightKeys = []) {
  if (!Array.isArray(highlightKeys) || highlightKeys.length === 0) {
    return t(templateKey, params);
  }
  const mark = (k) => `${k}`;
  const sub = { ...params };
  for (const k of highlightKeys) {
    if (k in sub) sub[k] = mark(k);
  }
  const template = t(templateKey, sub);
  const markers = highlightKeys.map((k) => ({ key: k, marker: mark(k) }));
  const out = [];
  let buf = "";
  let i = 0;
  while (i < template.length) {
    let hit = null;
    for (const m of markers) {
      if (template.startsWith(m.marker, i)) { hit = m; break; }
    }
    if (hit) {
      if (buf) { out.push(buf); buf = ""; }
      out.push(
        React.createElement("strong", { key: `hl-${out.length}` }, params[hit.key]),
      );
      i += hit.marker.length;
    } else {
      buf += template[i];
      i += 1;
    }
  }
  if (buf) out.push(buf);
  if (out.length === 1 && typeof out[0] === "string") return out[0];
  return React.createElement(React.Fragment, null, ...out);
}

// Build a fully-formed notification object from a server history row
// (delivered_at IS NOT NULL). The shape must satisfy the provider's
// notification structure so it can be passed directly to mergeHistory.
function buildHistoryEntry(n) {
  const sid = n.id;
  const sender = String(n.sender_name ?? "").trim();
  const rawTitle = String(n.note_title ?? "").trim();
  const noteTitle = rawTitle || t("untitledNote");
  const noteId = n.note_id ?? null;
  const createdAt = n.created_at ? new Date(n.created_at).getTime() : Date.now();
  const dismissedAt = n.delivered_at ? new Date(n.delivered_at).getTime() : createdAt;

  let type = n.type || "generic";
  let title = null;
  let message = "";
  let variant = n.variant || "info";
  let action = null;
  let pendingActions = null;
  let icon = n.icon || null;

  if (type === "note_shared") {
    title = t("noteSharedTitle");
    message = buildHighlightedMessage(
      "noteSharedToast",
      { sender, title: noteTitle },
      ["title"],
    );
    variant = "info";
    action = noteId ? { label: t("noteSharedAction"), noteId: String(noteId) } : null;
  } else if (
    type === "note_access_revoked" ||
    type === "note_access_revoked_with_copy" ||
    type === "collaborator_removed" ||
    type === "collaborator_removed_with_copy" ||
    type === "collaborator_left"
  ) {
    const titleKeyMap = {
      collaborator_removed: "collaboratorRemovedTitle",
      collaborator_removed_with_copy: "collaboratorRemovedTitle",
      collaborator_left: "collaboratorLeftTitle",
      note_access_revoked_with_copy: "noteAccessRevokedTitle",
    };
    const msgKeyMap = {
      collaborator_removed: "collaboratorRemovedToast",
      collaborator_removed_with_copy: "collaboratorRemovedWithCopyToast",
      collaborator_left: "collaboratorLeftToast",
      note_access_revoked_with_copy: "noteAccessRevokedWithCopyToast",
    };
    title = t(titleKeyMap[type] || "noteAccessRevokedTitle");
    message = buildHighlightedMessage(
      msgKeyMap[type] || "noteAccessRevokedToast",
      { sender, title: noteTitle },
      ["title"],
    );
    variant = "warning";
    // When a copy was conserved, expose an "Ouvrir" shortcut that
    // points to the copy. The server persists the copy's id in the
    // note_id column for this type so we can read it straight off
    // the history row.
    if (type === "note_access_revoked_with_copy" && noteId) {
      action = { label: t("noteSharedAction"), noteId: String(noteId) };
    }
  } else if (type === "user_deleted") {
    // Admin-side audit notification. note_title holds the deleted
    // user's display name; sender_name holds the acting admin's name.
    const deletedName = n.note_title || "";
    const adminName = n.sender_name || "";
    title = t("userDeletedNotifTitle");
    message = buildHighlightedMessage(
      "userDeletedNotifMessage",
      { name: deletedName, admin: adminName },
      ["name", "admin"],
    );
    variant = "warning";
    icon = icon || "user-x";
  } else if (type === "pending_user_registered") {
    // Admin alert. note_id is NULL (FK conflict with notes table);
    // pending_users.id is stashed in `message` instead. note_title
    // holds the registrant's email; sender_name holds the
    // registrant's display name. Build a multi-action notification
    // so the admin can approve / reject straight from the panel.
    const rawPid = n.message != null ? Number(n.message) : NaN;
    const pendingId = Number.isFinite(rawPid) ? rawPid : null;
    const userName = n.sender_name || "";
    const userEmail = n.note_title || "";
    title = t("pendingUserNotifTitle");
    message = buildHighlightedMessage(
      "pendingUserNotifMessage",
      { name: userName, email: userEmail },
      ["name"],
    );
    variant = "info";
    icon = icon || "user-clock";
    if (pendingId != null) {
      pendingActions = [
        { label: t("approve"), kind: "approve_pending_user", pendingUserId: pendingId },
        { label: t("reject"), kind: "reject_pending_user", pendingUserId: pendingId },
      ];
    }
  } else if (type === "reminder") {
    // Reminder: render the title in the viewer's locale (the stored
    // note_title can be English when the recipient's language is on
    // "auto"). The note's own title/preview lives in `message`.
    title = t("reminderNotificationTitle");
    message = n.message || "";
    variant = "info";
    icon = icon || "reminder";
    action = noteId ? { label: t("reminderOpenNoteAction"), noteId: String(noteId) } : null;
  } else if (n.message) {
    // Generic / test notification — use stored fields directly.
    title = n.note_title || null;
    message = n.message;
    variant = n.variant || "info";
  }

  return {
    id: `hist_${sid}`,
    type,
    title,
    message,
    variant,
    icon,
    createdAt,
    duration: null,
    dismissible: true,
    action,
    actions: pendingActions,
    metadata: { serverNotificationId: sid, noteId },
    dismissed: true,
    dismissedAt,
  };
}

export function useShareNotifications({ token, userId }) {
  const { notify, mergeHistory } = useNotifications();
  const shownIdsRef = useRef(new Set());
  // Latest-callable refs so the helpers we return stay identity-stable
  // — token comes from App state and notify is provided by context;
  // tying them via refs lets the pending-fetch effect only re-run on
  // login/logout rather than on every App render.
  const notifyRef = useRef(notify);
  const mergeHistoryRef = useRef(mergeHistory);
  const tokenRef = useRef(token);
  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);
  useEffect(() => {
    mergeHistoryRef.current = mergeHistory;
  }, [mergeHistory]);
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

  const markRemoved = useCallback((ids) => {
    const tk = tokenRef.current;
    if (!tk) return;
    if (!Array.isArray(ids) || ids.length === 0) return;
    api("/notifications/remove", {
      method: "POST",
      token: tk,
      body: { ids },
    }).catch(() => {
      // Best-effort: if the DELETE fails the row stays server-side and
      // /history will return it again next reload. Not data loss.
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
    // Wrap the note title with the `**...**` marker the card's message
    // renderer recognises so the title appears in bold inside the
    // sentence (the user asked for the title to stand out from the
    // surrounding "X a partagé la note … avec vous").
    fn({
      type: "note_shared",
      variant: "info",
      title: t("noteSharedTitle"),
      message: buildHighlightedMessage(
        "noteSharedToast",
        { sender, title: noteTitle },
        ["title"],
      ),
      // No `persistent` here — let the user's notification-duration
      // preference decide. If they set 10 s, the toast auto-dismisses
      // after 10 s; if they set "persistent" globally, it stays.
      dismissible: true,
      action: noteId
        ? { label: t("noteSharedAction"), noteId: String(noteId) }
        : null,
      metadata: { serverNotificationId: id, noteId },
    });
  }, []);

  // Admin audit notification when another admin deletes a user.
  const showUserDeletedToast = useCallback((n) => {
    if (!n) return;
    const id = n.notificationId ?? n.id;
    if (id != null) {
      if (shownIdsRef.current.has(id)) return;
      shownIdsRef.current.add(id);
    }
    const deletedName = String(n.deletedName ?? n.note_title ?? "").trim();
    const adminName = String(n.adminName ?? n.sender_name ?? "").trim();
    const fn = notifyRef.current;
    if (typeof fn !== "function") return;
    fn({
      type: "user_deleted",
      variant: "warning",
      title: t("userDeletedNotifTitle"),
      message: buildHighlightedMessage(
        "userDeletedNotifMessage",
        { name: deletedName, admin: adminName },
        ["name", "admin"],
      ),
      icon: "user-x",
      dismissible: true,
      metadata: { serverNotificationId: id },
    });
  }, []);

  // Pending-user registration alert for admins. Carries the
  // pending_user_id so the approve / reject actions know which row to
  // act on; the same id matches what the server stores in note_id,
  // so the live toast and the history entry are interchangeable
  // surfaces for the same row.
  const showPendingUserToast = useCallback((n) => {
    if (!n) return;
    const id = n.notificationId ?? n.id;
    if (id != null) {
      if (shownIdsRef.current.has(id)) return;
      shownIdsRef.current.add(id);
    }
    const userName = String(n.name ?? n.sender_name ?? "").trim();
    const userEmail = String(n.email ?? n.note_title ?? "").trim();
    const pendingId = n.pendingId ?? n.note_id ?? null;
    const fn = notifyRef.current;
    if (typeof fn !== "function") return;
    fn({
      type: "pending_user_registered",
      variant: "info",
      title: t("pendingUserNotifTitle"),
      message: buildHighlightedMessage(
        "pendingUserNotifMessage",
        { name: userName, email: userEmail },
        ["name"],
      ),
      icon: "user-clock",
      dismissible: true,
      actions: pendingId != null
        ? [
            { label: t("approve"), kind: "approve_pending_user", pendingUserId: pendingId },
            { label: t("reject"), kind: "reject_pending_user", pendingUserId: pendingId },
          ]
        : null,
      metadata: { serverNotificationId: id, pendingUserId: pendingId },
    });
  }, []);

  // Revoke side — either "your access was removed" (the ex-
  // collaborator perspective) or "you removed X" (the owner's
  // confirmation). The exact wording also branches on whether the
  // owner kept a copy of the note for the removed user. The
  // `notificationType` carries the four-variant key; we map it to
  // the right title/message pair here so the rendering stays the
  // same across all four cases.
  const showRevokeToast = useCallback((n) => {
    if (!n) return;
    const id = n.id ?? n.notificationId;
    if (id != null) {
      if (shownIdsRef.current.has(id)) return;
      shownIdsRef.current.add(id);
    }
    const sender = String(n.senderName ?? n.sender_name ?? "").trim();
    const rawTitle = String(n.noteTitle ?? n.note_title ?? "").trim();
    const noteTitle = rawTitle || t("untitledNote");
    // For `note_access_revoked_with_copy` the server now sends the
    // surviving copy's id as `noteId`; for the other revoke variants
    // there's nothing to open so this is unused.
    const noteId = n.noteId ?? n.note_id ?? null;
    const fn = notifyRef.current;
    if (typeof fn !== "function") return;

    const typeKey =
      n.notificationType || n.type || "note_access_revoked";
    let titleKey;
    let messageKey;
    if (typeKey === "collaborator_removed_with_copy") {
      titleKey = "collaboratorRemovedTitle";
      messageKey = "collaboratorRemovedWithCopyToast";
    } else if (typeKey === "collaborator_removed") {
      titleKey = "collaboratorRemovedTitle";
      messageKey = "collaboratorRemovedToast";
    } else if (typeKey === "collaborator_left") {
      titleKey = "collaboratorLeftTitle";
      messageKey = "collaboratorLeftToast";
    } else if (typeKey === "note_access_revoked_with_copy") {
      titleKey = "noteAccessRevokedTitle";
      messageKey = "noteAccessRevokedWithCopyToast";
    } else {
      titleKey = "noteAccessRevokedTitle";
      messageKey = "noteAccessRevokedToast";
    }

    fn({
      type: typeKey,
      variant: "warning",
      title: t(titleKey),
      message: buildHighlightedMessage(
        messageKey,
        { sender, title: noteTitle },
        ["title"],
      ),
      // Same as the share toast: defer to the user's duration pref.
      dismissible: true,
      action:
        typeKey === "note_access_revoked_with_copy" && noteId
          ? { label: t("noteSharedAction"), noteId: String(noteId) }
          : null,
      metadata: { serverNotificationId: id, noteId },
    });
  }, []);

  useEffect(() => {
    if (!token || !userId) {
      // Logout / auth-expired path. Wipe the in-session dedup set so
      // the next login's pending replay can re-show notifications that
      // were already surfaced in the previous session but never acked
      // server-side (markDelivered POST failure, user never closed
      // them, etc.). Without this, a returning user would silently
      // miss their still-undelivered notifications.
      shownIdsRef.current.clear();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Fetch pending (undelivered) and history (delivered) in
        // parallel — both are needed to reconstruct the full,
        // consistent notification state across every device and tab.
        const [pendingData, historyData] = await Promise.all([
          api("/notifications/pending", { token }),
          api("/notifications/history", { token }),
        ]);
        if (cancelled) return;

        // ── Pending: replay as active toasts ────────────────────────
        const pending = pendingData?.notifications || [];
        for (const n of pending) {
          const payload = {
            id: n.id,
            notificationType: n.type,
            senderName: n.sender_name,
            noteTitle: n.note_title,
            noteId: n.note_id,
          };
          if (n.type === "note_shared") {
            showShareToast(payload);
          } else if (
            n.type === "note_access_revoked" ||
            n.type === "note_access_revoked_with_copy" ||
            n.type === "collaborator_removed" ||
            n.type === "collaborator_removed_with_copy" ||
            n.type === "collaborator_left"
          ) {
            showRevokeToast(payload);
          } else if (n.type === "pending_user_registered") {
            // pendingId lives in `message` for this type (see
            // server's /register handler — note_id is NULL because
            // it has a FK on notes(id), so we stash the pending id
            // alongside instead).
            const rawPid = n.message != null ? Number(n.message) : NaN;
            showPendingUserToast({
              notificationId: n.id,
              pendingId: Number.isFinite(rawPid) ? rawPid : null,
              name: n.sender_name,
              email: n.note_title,
            });
          } else if (n.type === "user_deleted") {
            showUserDeletedToast({
              notificationId: n.id,
              deletedName: n.note_title,
              adminName: n.sender_name,
            });
          } else if (n.type === "reminder") {
            // Reminder replayed after being offline. Title rendered in
            // this client's locale (stored note_title can be English for
            // "auto"-language users); body is the note title/preview.
            const fn = notifyRef.current;
            if (typeof fn === "function") {
              fn({
                type: "reminder",
                variant: "info",
                title: t("reminderNotificationTitle"),
                message: n.message || "",
                persistent: !!n.persistent,
                icon: n.icon || "reminder",
                action: n.note_id
                  ? { label: t("reminderOpenNoteAction"), noteId: String(n.note_id) }
                  : null,
                metadata: {
                  serverNotificationId: n.id,
                  ...(n.note_id ? { noteId: n.note_id } : {}),
                },
              });
            }
          } else if (n.variant || n.message) {
            // Generic persisted notification (test-CLI, future events).
            const fn = notifyRef.current;
            if (typeof fn === "function") {
              fn({
                type: n.type || "generic",
                variant: n.variant || "info",
                title: n.note_title || null,
                message: n.message || "",
                persistent: !!n.persistent,
                icon: n.icon || null,
                metadata: { serverNotificationId: n.id },
              });
            }
          }
        }
        // We do NOT call markDelivered here: the server would broadcast
        // notification_delivered back immediately and dismiss the cards
        // we just rendered. Each card self-acks on resolution (X click,
        // auto-dismiss timer, bell open).

        // ── History: inject as dismissed entries for the history panel ─
        // Build every delivered row into a dismissed notification object
        // and merge into the provider. The reducer deduplicates by
        // serverNotificationId so rows already in state (pending cards
        // that were dismissed live, or history from a previous page load)
        // are not duplicated.
        const history = historyData?.notifications || [];
        if (history.length > 0) {
          const entries = history
            .map(buildHistoryEntry)
            .filter((e) => e.message || e.title);
          const fn = mergeHistoryRef.current;
          if (typeof fn === "function") fn(entries);
        }
      } catch {
        // Offline / 401 — rows remain pending; we'll retry next session.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, userId, showShareToast, showRevokeToast, showPendingUserToast, showUserDeletedToast, markDelivered]);

  return { showShareToast, showRevokeToast, showPendingUserToast, showUserDeletedToast, markDelivered, markRemoved };
}

export default useShareNotifications;
