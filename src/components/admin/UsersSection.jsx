// src/components/admin/UsersSection.jsx
//
// The "All users" block of the admin panel: one row per account with its
// avatar, usage figures and the edit / delete actions.

import React from "react";
import { t } from "../../i18n";
import UserAvatar from "../common/UserAvatar.jsx";
import TI from "../../icons/editor/index.jsx";
import { SettingsSection } from "../common/SettingsAccordion.jsx";

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function UsersSection({
  open,
  onToggle,
  allUsers,
  currentUser,
  deleteUser,
  onEditUser,
  showGenericConfirm,
  showToast,
}) {
  return (
    <div className="mb-2">
      <SettingsSection
        icon={TI.Users}
        title={
          <span className="flex items-center gap-2">
            <span>{t("allUsers")}</span>
            <span className="px-2 py-0.5 text-xs font-semibold bg-[var(--gk-accent-soft-bg)] text-[var(--gk-chrome-accent)] rounded-full">
              {allUsers.length}
            </span>
          </span>
        }
        open={open}
        onToggle={onToggle}
      >
      <div className="space-y-3">
        {allUsers.map((user) => (
          <div
            key={user.id}
            className="flex flex-col gap-2 px-3 py-3 border border-[var(--border-light)] rounded-lg"
          >
            <div className="flex items-center gap-3">
              <UserAvatar
                name={user.name}
                email={user.email}
                avatarUrl={user.avatar_url}
                size="w-9 h-9"
                textSize="text-sm"
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium flex items-center gap-2">
                  <span className="truncate">{user.name}</span>
                  {user.is_admin && (
                    <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200 rounded uppercase tracking-wide">
                      {t("admin")}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500 truncate">{user.email}</div>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <button
                  onClick={() => onEditUser(user)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg gk-admin-edit-btn transition-colors"
                  data-tooltip={t("edit")}
                  aria-label={t("edit")}
                >
                  <TI.Pencil className="tabler-icon w-5 h-5" />
                </button>
                {user.id !== currentUser?.id && (
                  <button
                    onClick={() => {
                      showGenericConfirm({
                        title: t("deleteUser"),
                        // Include the email in the danger message
                        // so the admin can tell two same-named
                        // accounts apart before confirming.
                        message: t("deleteUserConfirm", {
                          name: user.name,
                          email: user.email,
                        }),
                        confirmText: t("delete"),
                        danger: true,
                        onConfirm: async () => {
                          // Only show the success toast AFTER
                          // the server confirms: useAdminActions
                          // throws on error and the alert there
                          // surfaces the failure.
                          try {
                            const deleted = await deleteUser(user.id);
                            if (deleted) {
                              showToast?.(
                                t("userDeletedToast", {
                                  name: deleted.name || deleted.email,
                                }),
                                "success",
                                undefined,
                                "user-x",
                              );
                            }
                          } catch {
                            // Error already surfaced by deleteUser
                          }
                        },
                      });
                    }}
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
                    data-tooltip={t("delete")}
                    aria-label={t("delete")}
                  >
                    <TI.Trash className="tabler-icon w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pl-12 text-xs text-gray-500 dark:text-gray-400">
              <span>{t("notes")}: {user.notes}</span>
              <span>{t("storage")}: {formatBytes(user.storage_bytes ?? 0)}</span>
              <span>{t("joinedPrefix")} {new Date(user.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
      </SettingsSection>
    </div>
  );
}
