// What a notification's action button does. Single-action notifications
// pass `notif.action`; multi-action ones pass the button clicked. An
// action carrying a noteId opens that note and dismisses the notification.
import { t } from "../i18n";
import { acceptFederationLink, refuseFederationLink, federationErrorMessage } from "../components/admin/federation/federationActions.js";

export function runNotificationAction(notif, chosenAction, ctx) {
  const {
    token, approvePendingUser, rejectPendingUser, selfUpdate, openModal,
    showToast, showGenericConfirm, removeNotification, dismissNotification,
  } = ctx;
  if (!notif) return;
  const a = chosenAction || notif.action;
  if (!a) return;
  if (a.kind === "approve_pending_user" && a.pendingUserId != null) {
    if (typeof approvePendingUser !== "function") return;
    approvePendingUser(a.pendingUserId)
      .then(() => {
        // Mirror AdminPanel's post-action confirmation so the two
        // entry points (panel button + notification action) give
        // the same feedback.
        showToast(t("registrationApproved"), "success", undefined, "user-check");
        // Server already broadcasts notification_removed to every
        // admin so the history entries vanish; explicit remove here
        // covers the local toast in the same session.
        removeNotification(notif.id);
      })
      .catch((e) => {
        if (e && /404/.test(String(e.message))) {
          showToast(t("pendingUserAlreadyHandled"), "warning");
          removeNotification(notif.id);
        }
      });
    return;
  }
  if (a.kind === "reject_pending_user" && a.pendingUserId != null) {
    if (typeof rejectPendingUser !== "function") return;
    rejectPendingUser(a.pendingUserId)
      .then(() => {
        showToast(t("registrationRejected"), "info", undefined, "user-x");
        removeNotification(notif.id);
      })
      .catch((e) => {
        if (e && /404/.test(String(e.message))) {
          showToast(t("pendingUserAlreadyHandled"), "warning");
          removeNotification(notif.id);
        }
      });
    return;
  }
  // Accept / decline a cross-server pairing request straight from the
  // notification toast. The API call lives in federationActions; this
  // only routes the click and gives the same feedback as the panel.
  if (a.kind === "federation_accept" && a.linkId) {
    acceptFederationLink({ token, linkId: a.linkId })
      .then(() => {
        showToast(t("fedAcceptedToast"), "success", undefined, "user-check");
        removeNotification(notif.id);
      })
      .catch((e) => showToast(federationErrorMessage(e), "error"));
    return;
  }
  if (a.kind === "federation_refuse" && a.linkId) {
    refuseFederationLink({ token, linkId: a.linkId })
      .then(() => {
        showToast(t("fedRefusedToast"), "info", undefined, "user-x");
        removeNotification(notif.id);
      })
      .catch((e) => showToast(federationErrorMessage(e), "error"));
    return;
  }
  if (a.kind === "start_self_update" && a.latestVersion) {
    // Same one-click path as the admin panel's "Mettre à jour
    // maintenant" button: surface the generic confirm dialog, then
    // hand off to selfUpdate.startUpdate which opens the existing
    // update-progress modal. Dismiss the notification either way so
    // the card doesn't linger behind the confirm.
    const latestVersion = a.latestVersion;
    const fire = () => {
      try {
        selfUpdate?.startUpdate({ latestVersion });
      } catch {
        /* startUpdate surfaces its own errors via the modal */
      }
    };
    showGenericConfirm({
      title: t("selfUpdateConfirmTitle").replace("{version}", latestVersion),
      message: t("selfUpdateConfirmMessage").replace(
        "{version}",
        latestVersion,
      ),
      confirmText: t("selfUpdateConfirmButton"),
      cancelText: t("cancel"),
      variant: "success",
      onConfirm: fire,
    });
    dismissNotification(notif.id);
    return;
  }
  if (a.noteId) {
    try { openModal(String(a.noteId)); } catch { /* opening the note is best-effort */ }
    dismissNotification(notif.id);
  }
}
