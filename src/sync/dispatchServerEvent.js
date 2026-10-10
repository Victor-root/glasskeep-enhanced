// Routes a live server event (SSE message) to the part of the app it
// concerns. Note content changes are only queued for a batched patch
// (`queueNotePatch`); everything else is applied here.
import { t, syncLanguageFromServer } from "../i18n";
import { api, getClientId } from "../utils/api.js";
import {
  putNote as idbPutNote,
  deleteNote as idbDeleteNote,
  purgeQueueForNote as idbPurgeQueueForNote,
} from "./localDb.js";
import { notifyAndroidNow } from "../utils/androidReminders.js";
import { sortNotesByRecency } from "../utils/noteList.js";

/**
 * ctx: {
 *   token, userId, sessionId, isAdmin(), viewFilter(),
 *   setNotes, leases, reloadCurrentView(),
 *   onNoteGone(noteId),        // the note no longer exists for this user
 *   setLogoLibrary,
 *   notify, showShareToast, showRevokeToast, showPendingUserToast,
 *   showUserDeletedToast, clearServerBackedNotifications,
 *   dismissByServerIds, removeByServerIds,
 *   loadPendingUsers, loadAllUsers, loadAdminSettings, refreshBranding,
 *   applyRemoteUserSettings, applyProfileUpdate,
 * }
 */
export function dispatchServerEvent(msg, { queueNotePatch }, ctx) {
  if (msg && msg.type === "instance_locked") {
    // Another admin (or the CLI) locked the instance. Drop
    // the user straight onto the unlock screen instead of
    // waiting for the next status poll. The api wrapper
    // already fires `instance-locked` on a 423 response;
    // this just makes the redirect immediate.
    window.dispatchEvent(new CustomEvent("instance-locked"));
  } else if (msg && msg.type === "instance_unlocked") {
    // An admin unlocked the instance elsewhere — leave the unlock
    // screen at once (mirror of instance_locked above).
    window.dispatchEvent(new CustomEvent("instance-unlocked"));
  } else if (msg && msg.type === "note_updated" && msg.noteId) {
    queueNotePatch(msg.noteId);
    // The participant list is announced by this same event (the
    // server broadcasts it whenever a collaborator is added,
    // removed or has their access changed, locally or via a
    // federated peer's roster). Forward it on its own bus rather
    // than letting the collaborator list ride the note patch
    // above: that patch is deliberately skipped while the note
    // holds unsaved local edits, and who the note is shared with
    // has no reason to be held hostage to content protection.
    try {
      window.dispatchEvent(new CustomEvent("note-updated", { detail: { noteId: msg.noteId } }));
    } catch { /* bus is best-effort */ }
  } else if (msg && msg.type === "note_access_changed" && msg.noteId) {
    // The owner changed THIS user's read/write permission on a
    // shared note. Apply it immediately — even when the note is open
    // and locally protected (which suppresses the generic patch) —
    // by updating ONLY the `access` field, so the editor locks /
    // unlocks live without a reload and without touching content.
    const nid = String(msg.noteId);
    const nextAccess = msg.access === "read" ? "read" : "write";
    ctx.setNotes((prev) => prev.map((n) => {
      if (String(n.id) !== nid || n.access === nextAccess) return n;
      const updated = { ...n, access: nextAccess };
      idbPutNote(updated, ctx.userId, ctx.sessionId).catch(() => {});
      return updated;
    }));
  } else if (msg && msg.type === "logo_added" && msg.logo) {
    ctx.setLogoLibrary((prev) => {
      if (prev.some((l) => l.id === msg.logo.id)) return prev;
      return [...prev, msg.logo];
    });
  } else if (msg && msg.type === "logo_deleted" && msg.id) {
    ctx.setLogoLibrary((prev) => prev.filter((l) => l.id !== msg.id));
  } else if (msg && msg.type === "notes_reordered") {
    // Another session reordered notes — reload the full list once
    // instead of fetching each note individually (avoids rate limits).
    ctx.reloadCurrentView();
  } else if (msg && msg.type === "notes_imported") {
    // Another session restored a backup. Same treatment as a
    // reorder: one reload of the whole view rather than one fetch
    // per imported note, which would be hundreds of requests.
    ctx.reloadCurrentView();
  } else if (msg && msg.type === "note_deleted" && msg.noteId) {
    // Another session permanently deleted this note — remove locally
    const nid = String(msg.noteId);
    if (!ctx.leases.isDeleteTombstoned(nid)) {
      ctx.setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      idbDeleteNote(nid, ctx.userId, ctx.sessionId).catch(() => {});
      idbPurgeQueueForNote(nid, ctx.userId).catch(() => {});
      ctx.onNoteGone(nid);
    }
  } else if (msg && msg.type === "note_shared") {
    // A live share notification. The bell calls markDelivered
    // when the panel is opened — we don't ack here because the
    // server's notification_delivered broadcast would race with
    // the just-rendered card and clear it on the same tick.
    ctx.showShareToast({
      id: msg.notificationId,
      senderName: msg.senderName,
      noteTitle: msg.noteTitle,
      noteId: msg.noteId,
      readOnly: msg.readOnly,
    });
  } else if (msg && msg.type === "note_access_revoked_notification") {
    // Live notification for either side of a revoke. The
    // notificationType field on the payload picks the right
    // title/message pair (ex-collaborator vs owner, with
    // copy vs without). The accompanying `note_access_revoked`
    // event still drives the local note removal on the
    // ex-collaborator side. Delivery ack is deferred to the
    // bell (same reason as note_shared above).
    ctx.showRevokeToast({
      id: msg.notificationId,
      notificationType: msg.notificationType,
      senderName: msg.senderName,
      noteTitle: msg.noteTitle,
      noteId: msg.noteId,
    });
  } else if (msg && msg.type === "test_notification") {
    // Dev/test notification dispatched via the
    // scripts/test-notification.cjs CLI. Routed through the
    // generic ctx.notify() so it inherits the standard card UI,
    // history entry and unread badge. metadata carries the
    // server-side id so the cross-device dismiss broadcast
    // (`notification_delivered`) can find this card in
    // state — without it, dismissByServerIds would have
    // nothing to match against.
    ctx.notify({
      type: "test",
      variant: msg.variant || "info",
      title: msg.title || null,
      message: msg.message || "",
      persistent: !!msg.persistent,
      icon: msg.icon || null,
      metadata: msg.notificationId
        ? { serverNotificationId: msg.notificationId }
        : null,
    });
    // Do NOT mark delivered here: that would trigger a
    // `notification_delivered` SSE back from the server which
    // immediately dismisses the card we just showed. The bell
    // calls markDelivered when the panel is opened, which is
    // the right moment to record "user has seen this".
  } else if (msg && msg.type === "reminder_due") {
    // A note's reminder came due (server scheduler). Same generic
    // ctx.notify() path as test_notification so it gets the standard
    // card, history entry, unread badge and ding. Persistent: a
    // reminder stays until the user closes it (no auto-dismiss /
    // timer bar). The action opens the linked note; metadata
    // carries the server id (cross-device dismiss) and the noteId.
    console.log("[reminders] reminder_due received", {
      noteId: msg.noteId,
      notificationId: msg.notificationId,
    });
    ctx.notify({
      type: "reminder",
      variant: msg.variant || "info",
      // Always render the title in THIS client's locale (the
      // server-sent title can be English when the recipient's
      // language is on "auto"). The body is the note's own
      // title/preview, which is language-neutral.
      title: t("reminderNotificationTitle"),
      message: msg.message || "",
      icon: msg.icon || "reminder",
      persistent: true,
      action: msg.noteId
        ? { label: t("reminderOpenNoteAction"), noteId: String(msg.noteId) }
        : null,
      metadata: {
        ...(msg.notificationId ? { serverNotificationId: msg.notificationId } : {}),
        ...(msg.noteId ? { noteId: msg.noteId } : {}),
      },
    });
    // Android APK: if the app isn't in the foreground, the in-app
    // card is invisible — so post a real SYSTEM notification
    // natively (this SSE event already reached us, so no push
    // service is needed). Foreground stays in-app only. Same note
    // id as the local-alarm path → they collapse, no duplicate.
    // No-op in the browser/PWA, where Web Push covers the
    // backgrounded/closed case.
    if (
      msg.noteId &&
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    ) {
      notifyAndroidNow(msg.noteId, t("reminderNotificationTitle"), msg.message || "");
    }
  } else if (msg && msg.type === "notifications_cleared") {
    // Another device wiped the user's notification history.
    // Only drop server-backed rows: local-only toasts (e.g.
    // "Note moved to trash", in-app UI feedback) have no DB
    // counterpart and a remote clear must not erase them
    // from this device.
    ctx.clearServerBackedNotifications();
  } else if (msg && msg.type === "notification_delivered" && Array.isArray(msg.ids)) {
    // Cross-device dismissal — another tab/device (or this
    // one) just acknowledged these server notification ids.
    // We route through the reducer dispatcher because
    // notificationsRef hasn't necessarily caught up with a
    // just-added card (React commits the mirror useEffect
    // after the current microtask). The reducer sees the
    // latest state for every row, including the one whose
    // ADD action ran one microtask ago.
    ctx.dismissByServerIds(msg.ids);
  } else if (msg && msg.type === "notification_removed" && Array.isArray(msg.ids)) {
    // Cross-device per-item removal — another tab/device
    // permanently deleted these notifications. Drop matching
    // rows from local state so the history panel stays
    // identical everywhere.
    ctx.removeByServerIds(msg.ids);
  } else if (msg && msg.type === "pending_user_registered") {
    // Admin notification: a new user is awaiting approval.
    // Routes through ctx.showPendingUserToast so the live toast
    // carries the same Accepter / Refuser actions as its
    // history twin (built from the persisted DB row).
    if (ctx.isAdmin()) {
      ctx.showPendingUserToast({
        notificationId: msg.notificationId,
        pendingId: msg.pendingId,
        name: msg.name,
        email: msg.email,
      });
      ctx.loadPendingUsers?.();
    }
  } else if (msg && msg.type === "pending_user_resolved") {
    // Another admin (or this one on a different tab) just
    // approved / rejected a pending registration. Refresh
    // the AdminPanel lists so the row disappears for every
    // admin in real time. The bell-notification card is
    // already cleared by the existing notification_removed
    // SSE the server sends alongside (via
    // cleanupPendingUserNotifications), so we only handle
    // the panel state here.
    if (ctx.isAdmin()) {
      ctx.loadPendingUsers?.();
      if (msg.action === "approved") ctx.loadAllUsers?.();
    }
  } else if (msg && msg.type === "user_list_changed") {
    // Another admin created / updated a user. Reload the
    // users list so every admin's AdminPanel reflects the
    // change in real time. Deletion is handled separately
    // by user_deleted_notification.
    if (ctx.isAdmin()) {
      ctx.loadAllUsers?.();
    }
  } else if (msg && msg.type === "admin_settings_updated") {
    // Another admin flipped the "allow new accounts"
    // toggle or changed the login slogan / branding. Pull the
    // fresh server-side admin settings so this admin's panel
    // shows the new values immediately, and refresh the live
    // branding so the header logo/name update without a reload.
    // (This event is only broadcast to admins.)
    if (ctx.isAdmin()) {
      ctx.loadAdminSettings?.();
      ctx.refreshBranding();
    }
  } else if (msg && msg.type === "user_settings_updated" && msg.settings) {
    // Live sync of user preferences from another session of
    // the same user. Skip our own echo (originClientId
    // matches this tab's getClientId()); otherwise mark the
    // affected keys so each PATCH-trigger useEffect knows
    // to skip its outbound write, then apply state updates
    // through the same validators the initial load uses.
    if (msg.originClientId && msg.originClientId === getClientId()) {
      // Our own write — server confirmed it, nothing else to do.
    } else {
      ctx.applyRemoteUserSettings(msg.settings);
    }
  } else if (msg && msg.type === "user_profile_updated" && msg.profile) {
    // Live sync for the profile fields that live outside the
    // settings blob (/api/user/settings): whether the account
    // shows up on the login screen, the interface language, and
    // the avatar (/api/user/profile and /api/user/avatar). Same
    // echo-skip as user_settings_updated above.
    if (!(msg.originClientId && msg.originClientId === getClientId())) {
      if (typeof msg.profile.language === "string") {
        if (syncLanguageFromServer(msg.profile.language)) window.location.reload();
      }
      if (typeof msg.profile.show_on_login === "boolean") {
        try {
          window.dispatchEvent(
            new CustomEvent("user-profile-updated", { detail: msg.profile }),
          );
        } catch { /* bus is best-effort */ }
      }
      if (
        "avatar_url" in msg.profile &&
        (msg.profile.avatar_url === null || typeof msg.profile.avatar_url === "string")
      ) {
        ctx.applyProfileUpdate({ avatar_url: msg.profile.avatar_url });
      }
    }
  } else if (msg && msg.type === "user_ai_settings_updated" && msg.settings) {
    // Live sync of the personal AI settings (/api/user/ai/settings)
    // — enable/mode/provider — to every other session of this
    // user. Setting state directly here never re-triggers a
    // PATCH, so no echo-skip is needed beyond ignoring our own
    // write (the sender already applied it locally on success).
    if (!(msg.originClientId && msg.originClientId === getClientId())) {
      try {
        window.dispatchEvent(
          new CustomEvent("user-ai-settings-updated", { detail: msg.settings }),
        );
      } catch { /* bus is best-effort */ }
    }
  } else if (msg && msg.type === "admin_ai_settings_updated" && msg.settings) {
    // Live sync of the shared/server AI configuration to every
    // other connected admin, mirroring admin_settings_updated.
    if (ctx.isAdmin()) {
      try {
        window.dispatchEvent(
          new CustomEvent("admin-ai-settings-updated", { detail: msg.settings }),
        );
      } catch { /* bus is best-effort */ }
    }
  } else if (msg && msg.type === "user_deleted_notification") {
    // Audit notification for OTHER admins: someone got
    // deleted. The acting admin doesn't receive this — they
    // saw the success toast in the panel.
    if (ctx.isAdmin()) {
      ctx.showUserDeletedToast({
        notificationId: msg.notificationId,
        deletedName: msg.deletedName,
        adminName: msg.adminName,
      });
      // Refresh the user list so the deleted row disappears
      // from this admin's panel without a manual reload.
      ctx.loadAllUsers?.();
    }
  } else if (msg && msg.type === "note_access_revoked" && msg.noteId) {
    // Collaboration access revoked — note owner removed us.
    const nid = String(msg.noteId);
    if (msg.copyNoteId) {
      // Grant-copy path: fetch the copy first, then swap the
      // original out and the copy in within a single setNotes
      // update so the user doesn't see a flash of empty slot.
      (async () => {
        let copy = null;
        // A transient blip on this ONE fetch used to silently drop
        // the note from view with nothing to replace it — the copy
        // genuinely exists server-side, only this request failed —
        // until the next full reload quietly fixed it. Retry a
        // couple of times before falling back to a full resync.
        for (let attempt = 0; attempt < 3 && !copy; attempt++) {
          try {
            copy = await api(`/notes/${msg.copyNoteId}`, { token: ctx.token });
          } catch (e) {
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            } else {
              console.warn("[note_access_revoked] could not fetch the kept copy after retries:", e?.message);
            }
          }
        }
        if (!copy) {
          // Still nothing — don't silently lose the note from view.
          // Re-sync from the authoritative server list instead,
          // exactly what a manual refresh already does today.
          ctx.reloadCurrentView();
          return;
        }
        const currentFilter = ctx.viewFilter();
        const belongsInView =
          copy.id
          && !copy.archived && !copy.trashed
          && (!currentFilter || (currentFilter !== "ARCHIVED" && currentFilter !== "TRASHED"));
        ctx.setNotes((prev) => {
          const filtered = prev.filter((n) => String(n.id) !== nid);
          return belongsInView ? sortNotesByRecency([...filtered, copy]) : filtered;
        });
        try { await idbPutNote(copy, ctx.userId, ctx.sessionId); } catch { /* IDB best-effort */ }
        idbDeleteNote(nid, ctx.userId, ctx.sessionId).catch(() => {});
        idbPurgeQueueForNote(nid, ctx.userId).catch(() => {});
        ctx.onNoteGone(nid);
      })();
    } else {
      // Legacy revoke-only path: drop the note immediately.
      ctx.setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      idbDeleteNote(nid, ctx.userId, ctx.sessionId).catch(() => {});
      idbPurgeQueueForNote(nid, ctx.userId).catch(() => {});
      ctx.onNoteGone(nid);
    }
  } else if (msg && typeof msg.type === "string" && msg.type.startsWith("federation_")) {
    // Cross-server collaboration (federation) events. The app
    // stays out of the feature's logic: it just forwards the
    // event on a window bus that the Federation admin section
    // (useFederation hook) listens to.
    try {
      window.dispatchEvent(new CustomEvent("federation-event", { detail: msg }));
    } catch { /* bus is best-effort */ }
  }
}
