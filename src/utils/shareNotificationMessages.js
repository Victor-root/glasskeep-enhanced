// Notification bodies of the persisted notifications delivered by
// hooks/useShareNotifications.js: localized messages with highlighted
// values, the revoke family's wording, and the provider entry built from
// a server history row.

import React from "react";
import { t } from "../i18n";

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
export function buildHighlightedMessage(templateKey, params, highlightKeys = []) {
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

// Title and message keys of the revoke family, by notification type;
// anything else reads as a plain access revocation.
const REVOKE_KEYS = {
  collaborator_removed: ["collaboratorRemovedTitle", "collaboratorRemovedToast"],
  collaborator_removed_with_copy: ["collaboratorRemovedTitle", "collaboratorRemovedWithCopyToast"],
  collaborator_left: ["collaboratorLeftTitle", "collaboratorLeftToast"],
  note_access_revoked_with_copy: ["noteAccessRevokedTitle", "noteAccessRevokedWithCopyToast"],
  shared_note_deleted: ["sharedNoteDeletedTitle", "sharedNoteDeletedToast"],
  shared_note_deleted_with_copy: ["sharedNoteDeletedTitle", "sharedNoteDeletedWithCopyToast"],
};

export function revokeKeys(type) {
  const [titleKey, messageKey] = REVOKE_KEYS[type] || ["noteAccessRevokedTitle", "noteAccessRevokedToast"];
  return { titleKey, messageKey };
}

// Revoke variants that kept a copy of the note for the removed user: their
// note id is the copy's, which the "open" action points to.
export function revokeKeptCopy(type) {
  return type === "note_access_revoked_with_copy" || type === "shared_note_deleted_with_copy";
}

// Build a fully-formed notification object from a server history row
// (delivered_at IS NOT NULL). The shape must satisfy the provider's
// notification structure so it can be passed directly to mergeHistory.
export function buildHistoryEntry(n) {
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
    const isReadOnly = n.variant === "read_only";
    title = t("noteSharedTitle");
    message = buildHighlightedMessage(
      isReadOnly ? "noteSharedReadOnlyToast" : "noteSharedToast",
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
    type === "collaborator_left" ||
    type === "shared_note_deleted" ||
    type === "shared_note_deleted_with_copy"
  ) {
    const { titleKey, messageKey } = revokeKeys(type);
    title = t(titleKey);
    message = buildHighlightedMessage(
      messageKey,
      { sender, title: noteTitle },
      ["title"],
    );
    variant = "warning";
    // When a copy was conserved, expose an "Ouvrir" shortcut that
    // points to the copy. The server persists the copy's id in the
    // note_id column for this type so we can read it straight off
    // the history row.
    if (revokeKeptCopy(type) && noteId) {
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
    // Generic / test notification: use stored fields directly.
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
