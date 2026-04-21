import React from "react";
import { createPortal } from "react-dom";
import UserAvatar from "../common/UserAvatar.jsx";
import ConfirmRemoveCollaboratorDialog from "./ConfirmRemoveCollaboratorDialog.jsx";
import { t } from "../../i18n";

/**
 * Collaboration modal — allows adding/removing collaborators on a note.
 * Includes the user search dropdown portal.
 */
export default function CollaborationModal({
  open,
  dark,
  activeId,
  notes,
  currentUser,
  collaboratorUsername,
  setCollaboratorUsername,
  addModalCollaborators,
  showUserDropdown,
  setShowUserDropdown,
  filteredUsers,
  setFilteredUsers,
  loadingUsers,
  dropdownPosition,
  collaboratorInputRef,
  onClose,
  onAddCollaborator,
  onRemoveCollaborator,
  searchUsers,
  updateDropdownPosition,
}) {
  const [confirmRemove, setConfirmRemove] = React.useState(null);
  if (!open) return null;

  const note = activeId
    ? notes.find((n) => String(n.id) === String(activeId))
    : null;
  const isOwner = !activeId || note?.user_id === currentUser?.id;

  const handleClose = () => {
    onClose();
    setCollaboratorUsername("");
    setShowUserDropdown(false);
    setFilteredUsers([]);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/40"
          onClick={handleClose}
        />
        <div
          className="glass-card rounded-xl shadow-2xl w-[90%] max-w-md p-6 relative max-h-[90vh] overflow-y-auto"
          style={{
            backgroundColor: dark
              ? "#282828"
              : "#ffffff",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold mb-4">
            {isOwner ? t("addCollaborator") : t("collaborators")}
          </h3>

          {/* Show existing collaborators with remove option */}
          {addModalCollaborators.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("currentCollaborators")}</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {addModalCollaborators
                  .filter((c) => c.id !== currentUser?.id)
                  .map((collab) => {
                  const canRemove =
                    !collab.isOwner && (isOwner || collab.id === currentUser?.id);

                  return (
                    <div
                      key={collab.id}
                      className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded-lg"
                    >
                      <div className="flex items-center gap-2.5">
                        <UserAvatar
                          name={collab.name}
                          email={collab.email}
                          avatarUrl={collab.avatar_url}
                          size="w-8 h-8"
                          textSize="text-xs"
                          dark={dark}
                        />
                        <div>
                          <p className="font-medium text-sm">
                            {collab.name || collab.email}
                            {collab.isOwner && (
                              <span className="ml-2 text-xs text-indigo-500 dark:text-indigo-400 font-normal">
                                {t("owner")}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {collab.email}
                          </p>
                        </div>
                      </div>
                      {canRemove && (
                        <button
                          onClick={async () => {
                            // Self-remove (collaborator leaving themselves)
                            // keeps the current one-step flow. Owner removing
                            // a specific collaborator gets the explicit choice.
                            if (collab.id === currentUser?.id) {
                              await onRemoveCollaborator(collab.id, activeId);
                            } else {
                              setConfirmRemove(collab);
                            }
                          }}
                          className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                          data-tooltip={t("removeCollaborator")}
                        >
                          {t("remove")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Only show add collaborator input/button if user owns the note */}
          {isOwner && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                {t("collaborateInstructions")}
              </p>
              <div ref={collaboratorInputRef} className="relative">
                <input
                  type="text"
                  value={collaboratorUsername}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCollaboratorUsername(value);
                    updateDropdownPosition();
                    searchUsers(value);
                  }}
                  onFocus={() => {
                    updateDropdownPosition();
                    searchUsers(collaboratorUsername || "");
                  }}
                  placeholder={t("searchByUsernameOrEmail")}
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-transparent"
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      collaboratorUsername.trim()
                    ) {
                      if (
                        showUserDropdown &&
                        filteredUsers.length > 0
                      ) {
                        const firstUser = filteredUsers[0];
                        setCollaboratorUsername(
                          firstUser.name || firstUser.email,
                        );
                        setShowUserDropdown(false);
                      } else {
                        onAddCollaborator(
                          collaboratorUsername.trim(),
                        );
                      }
                    } else if (e.key === "Escape") {
                      setShowUserDropdown(false);
                    }
                  }}
                />
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={handleClose}
                >{t("cancel")}</button>
                <button
                  className="px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                  onClick={async () => {
                    if (collaboratorUsername.trim()) {
                      await onAddCollaborator(
                        collaboratorUsername.trim(),
                      );
                    }
                  }}
                >{t("addCollaborator")}</button>
              </div>
            </>
          )}

          {/* If user doesn't own the note, show only cancel button */}
          {!isOwner && (
            <div className="mt-5 flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                onClick={handleClose}
              >{t("close")}</button>
            </div>
          )}
        </div>
      </div>

      <ConfirmRemoveCollaboratorDialog
        open={!!confirmRemove}
        dark={dark}
        collaboratorName={confirmRemove?.name || confirmRemove?.email || ""}
        onClose={() => setConfirmRemove(null)}
        onConfirm={async (mode) => {
          const target = confirmRemove;
          setConfirmRemove(null);
          if (target) {
            await onRemoveCollaborator(target.id, activeId, mode);
          }
        }}
      />

      {/* User dropdown portal - rendered outside modal */}
      {showUserDropdown &&
        filteredUsers.length > 0 &&
        createPortal(
          <div
            data-user-dropdown
            className="fixed z-[60] bg-white dark:bg-[#272727] border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto"
            style={{
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
            }}
          >
            {loadingUsers ? (
              <div className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{t("searching")}</div>
            ) : (
              filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-200 dark:border-gray-700 last:border-b-0 flex items-center gap-2.5"
                  onClick={() => {
                    setCollaboratorUsername(user.name || user.email);
                    setShowUserDropdown(false);
                  }}
                >
                  <UserAvatar
                    name={user.name}
                    email={user.email}
                    avatarUrl={user.avatar_url}
                    size="w-7 h-7"
                    textSize="text-[10px]"
                    dark={dark}
                  />
                  <div>
                    <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                      {user.name || user.email}
                    </div>
                    {user.name && (
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        {user.email}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
