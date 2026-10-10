import React from "react";
import UserAvatar from "../common/UserAvatar.jsx";
import ServerBadge from "./ServerBadge.jsx";
import AccessToggle from "./AccessToggle.jsx";
import { t } from "../../i18n";

// People a note is already shared with, in the collaboration modal: the
// owner changes each one's access and removes them; a collaborator only
// sees the list.
export default function CurrentCollaboratorsList({
  collaborators,
  isOwner,
  currentUser,
  activeId,
  dark,
  asSheet,
  onSetCollaboratorAccess,
  onRemoveCollaborator,
  onConfirmRemove,
}) {
  return (
    <div className="mb-4">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {t("currentCollaborators")}
      </p>
      <div className={asSheet ? undefined : "space-y-2"}>
        {collaborators
          // The owner doesn't need to see their own row when managing;
          // but a collaborator viewing the list SHOULD see themselves
          // (with a "Moi" badge) so it's clear they're on the note.
          .filter((c) => (isOwner ? c.id !== currentUser?.id : true))
          .map((collab) => {
            const isSelf = collab.id === currentUser?.id;
            // Owner removes collaborators; a non-owner can't remove
            // anyone (their own row is display-only).
            const canRemove = isOwner && !collab.isOwner;
            const showAccess =
              isOwner && !collab.isOwner &&
              typeof onSetCollaboratorAccess === "function";

            return (
              <div
                key={collab.id}
                // Single aligned row: fixed square avatar, the name
                // truncates (badge stays beside it), actions pinned
                // right and vertically centred. No wrapping: that
                // looked unbalanced on mobile.
                className={asSheet ? "gk-sheet-row" : "flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg"}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                  <UserAvatar
                    name={collab.name}
                    email={collab.email}
                    avatarUrl={collab.avatar_url}
                    size="w-8 h-8"
                    textSize="text-xs"
                    dark={dark}
                    className="shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-medium text-sm flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{collab.name || collab.email}</span>
                      {collab.federated && <ServerBadge label={collab.serverLabel} />}
                      {isSelf && (
                        <span className="shrink-0 inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-[var(--gk-accent-soft-bg)] text-[var(--gk-chrome-accent)] border border-[var(--gk-accent-soft-border)]">
                          {t("youLabel")}
                        </span>
                      )}
                      {collab.isOwner && (
                        <span className="shrink-0 text-xs text-indigo-500 dark:text-indigo-400 font-normal">
                          {t("owner")}
                        </span>
                      )}
                    </div>
                    {!collab.federated && collab.email && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {collab.email}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {showAccess && (
                    <AccessToggle
                      canWrite={collab.canWrite}
                      onChange={(access) => onSetCollaboratorAccess(collab.id, access)}
                    />
                  )}
                  {canRemove && (
                    <button
                      onClick={async () => {
                        if (collab.id === currentUser?.id) {
                          await onRemoveCollaborator(collab.id, activeId);
                        } else {
                          onConfirmRemove(collab);
                        }
                      }}
                      className="shrink-0 p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                      data-tooltip={t("removeCollaborator")}
                      aria-label={t("remove")}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M6 6l12 12" />
                        <path d="M6 18L18 6" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
