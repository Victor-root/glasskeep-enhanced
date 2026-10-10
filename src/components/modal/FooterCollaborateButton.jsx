import React from "react";
import UserAvatar from "../common/UserAvatar.jsx";
import CollaborateIcon from "./CollaborateIcon.jsx";
import { t } from "../../i18n";

// Collaborate button of the modal footer. Once the note is shared it shows
// the first collaborators' avatars on desktop, a count badge on phones.
export default function FooterCollaborateButton({
  dark,
  isDesktop,
  btnClass,
  addModalCollaborators,
  currentUser,
  onOpenCollaboration,
}) {
  const collabs = (addModalCollaborators || []).filter(c => c.id !== currentUser?.id);
  const hasCollabs = collabs.length > 0;
  return (
    <button
      className={`${hasCollabs && isDesktop ? "modal-footer-labeled-btn" : btnClass} modal-footer-btn--collab focus:outline-none relative`}
      onClick={onOpenCollaboration}
      data-tooltip={hasCollabs || !isDesktop ? t("collaborate") : undefined}
    >
      <CollaborateIcon className="w-4 h-4" />
      {hasCollabs && isDesktop && (
        <span className="modal-footer-avatars flex items-center -space-x-1">
          {collabs.slice(0, 3).map((c) => (
            <span key={c.id} data-tooltip={c.name || c.email}>
              <UserAvatar
                name={c.name}
                email={c.email}
                avatarUrl={c.avatar_url}
                size="w-5 h-5"
                textSize="text-[9px]"
                dark={dark}
                className="ring-1 ring-white dark:ring-gray-800"
                // Solid backing so transparent-PNG avatars stay
                // legible in this dense stack (collaboration footer only).
                imgClassName="bg-white"
              />
            </span>
          ))}
          {collabs.length > 3 && (
            <span
              className="text-[13px] font-bold opacity-90 pl-1.5"
              data-tooltip={collabs.slice(3).map((c) => c.name || c.email).join(", ")}
            >+{collabs.length - 3}</span>
          )}
        </span>
      )}
      {!hasCollabs && isDesktop && <span>{t("collaborate")}</span>}
      {hasCollabs && !isDesktop && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-[9px] font-bold leading-none shadow-md ring-[1.5px] ring-white dark:ring-gray-800 px-0.5">
          {collabs.length}
        </span>
      )}
    </button>
  );
}
