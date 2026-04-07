import React, { useState } from "react";
import { t } from "../../i18n";
import UserAvatar from "../common/UserAvatar.jsx";
import { CloseIcon } from "../../icons/index.jsx";

export default function AdminPanel({
  open,
  onClose,
  dark,
  adminSettings,
  setAdminSettings,
  allUsers,
  newUserForm,
  setNewUserForm,
  updateAdminSettings,
  createUser,
  deleteUser,
  updateUser,
  currentUser,
  showGenericConfirm,
  showToast,
}) {
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editUserForm, setEditUserForm] = useState({
    name: "",
    email: "",
    password: "",
    is_admin: false,
  });
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserForm.name || !newUserForm.email || !newUserForm.password) {
      showToast(t("pleaseFillRequiredFields"), "error");
      return;
    }

    setIsCreatingUser(true);
    try {
      await createUser(newUserForm);
      showToast(t("userCreatedSuccessfullyBang"), "success");
    } catch (e) {
      // Error already handled in createUser function
    } finally {
      setIsCreatingUser(false);
    }
  };

  const openEditUserModal = (user) => {
    setEditingUser(user);
    setEditUserForm({
      name: user.name,
      email: user.email,
      password: "",
      is_admin: user.is_admin,
    });
    setEditUserModalOpen(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editUserForm.name || !editUserForm.email) {
      showToast(t("nameAndEmailRequired"), "error");
      return;
    }

    setIsUpdatingUser(true);
    try {
      // Only include password if it's not empty
      const updateData = {
        name: editUserForm.name,
        email: editUserForm.email,
        is_admin: editUserForm.is_admin,
      };
      if (editUserForm.password) {
        updateData.password = editUserForm.password;
      }

      await updateUser(editingUser.id, updateData);
      showToast(t("userUpdatedSuccessfullyBang"), "success");
      setEditUserModalOpen(false);
      setEditingUser(null);
    } catch (e) {
      showToast(e.message || t("failedUpdateUser"), "error");
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Prevent body scroll when admin panel is open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        />
      )}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-96 transition-transform duration-200 ${open ? "translate-x-0 shadow-2xl" : "translate-x-full shadow-none"}`}
        style={{
          backgroundColor: dark
            ? "rgba(40,40,40,0.95)"
            : "rgba(255,255,255,0.95)",
          borderLeft: "1px solid var(--border-light)",
        }}
        aria-hidden={!open}
      >
        <div className="p-4 flex items-center justify-between border-b border-[var(--border-light)]">
          <h3 className="text-lg font-semibold">{t("adminPanel")}</h3>
          <button
            className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
            data-tooltip={t("close")}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-4 overflow-y-auto h-[calc(100%-64px)]">
          {/* Settings Section */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4">{t("settings")}</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">{t("allowNewAccountCreation")}</span>
                <button
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    adminSettings.allowNewAccounts
                      ? "bg-indigo-600"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                  onClick={() =>
                    updateAdminSettings({
                      allowNewAccounts: !adminSettings.allowNewAccounts,
                    })
                  }
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      adminSettings.allowNewAccounts
                        ? "translate-x-6"
                        : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              <div>
                <label className="text-sm block mb-1">{t("loginSloganLabel")}</label>
                <input
                  type="text"
                  maxLength={200}
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400 text-sm"
                  placeholder={t("loginSloganPlaceholder")}
                  value={adminSettings.loginSlogan || ""}
                  onChange={(e) =>
                    setAdminSettings((prev) => ({ ...prev, loginSlogan: e.target.value }))
                  }
                  onBlur={() =>
                    updateAdminSettings({ loginSlogan: adminSettings.loginSlogan || "" })
                  }
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {t("loginSlogan")}
                </p>
              </div>
            </div>
          </div>

          {/* Create User Section */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4">{t("createNewUser")}</h4>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <input
                type="text"
                placeholder={t("name")}
                value={newUserForm.name}
                onChange={(e) =>
                  setNewUserForm((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
              />
              <input
                type="text"
                placeholder={t("username")}
                value={newUserForm.email}
                onChange={(e) =>
                  setNewUserForm((prev) => ({ ...prev, email: e.target.value }))
                }
                className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
              />
              <input
                type="password"
                placeholder={t("password")}
                value={newUserForm.password}
                onChange={(e) =>
                  setNewUserForm((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
              />
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_admin"
                  checked={newUserForm.is_admin}
                  onChange={(e) =>
                    setNewUserForm((prev) => ({
                      ...prev,
                      is_admin: e.target.checked,
                    }))
                  }
                  className="mr-2"
                />
                <label htmlFor="is_admin" className="text-sm">{t("makeAdmin")}</label>
              </div>
              <button
                type="submit"
                disabled={isCreatingUser}
                className="w-full px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
              >
                {isCreatingUser ? t("creating") : t("createUser")}
              </button>
            </form>
          </div>

          {/* Users List Section */}
          <div>
            <h4 className="text-md font-semibold mb-4">{t("allUsers")} ({allUsers.length})
            </h4>
            <div className="space-y-3">
              {allUsers.map((user) => (
                <div
                  key={user.id}
                  className="p-3 border border-[var(--border-light)] rounded-lg"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {user.is_admin && (
                        <span className="px-2 py-1 text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 rounded">{t("admin")}</span>
                      )}
                      <button
                        onClick={() => openEditUserModal(user)}
                        className="px-2 py-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                      >{t("edit")}</button>
                      {user.id !== currentUser?.id && (
                        <button
                          onClick={() => {
                            showGenericConfirm({
                              title: t("deleteUser"),
                              message: t("deleteUserConfirm").replace("{name}", user.name),
                              confirmText: t("delete"),
                              danger: true,
                              onConfirm: () => deleteUser(user.id),
                            });
                          }}
                          className="px-2 py-1 text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-800"
                        >{t("delete")}</button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <div>{t("notes")}: {user.notes}</div>
                    <div>{t("storage")}: {formatBytes(user.storage_bytes ?? 0)}</div>
                    <div>
                      {t("joinedPrefix")} {new Date(user.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit User Modal */}
      {editUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">{t("editUser")}</h3>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t("name")}</label>
                <input
                  type="text"
                  value={editUserForm.name}
                  onChange={(e) =>
                    setEditUserForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("username")}</label>
                <input
                  type="text"
                  value={editUserForm.email}
                  onChange={(e) =>
                    setEditUserForm((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("passwordLeaveEmptyKeepCurrent")}</label>
                <input
                  type="password"
                  value={editUserForm.password}
                  onChange={(e) =>
                    setEditUserForm((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder={t("leaveEmptyKeepCurrentPassword")}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="edit_is_admin"
                  checked={editUserForm.is_admin}
                  onChange={(e) =>
                    setEditUserForm((prev) => ({
                      ...prev,
                      is_admin: e.target.checked,
                    }))
                  }
                  className="mr-2"
                />
                <label htmlFor="edit_is_admin" className="text-sm">{t("makeAdmin")}</label>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditUserModalOpen(false)}
                  className="px-4 py-2 border border-[var(--border-light)] rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                >{t("cancel")}</button>
                <button
                  type="submit"
                  disabled={isUpdatingUser}
                  className="px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isUpdatingUser ? t("updating") : t("updateUser")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
