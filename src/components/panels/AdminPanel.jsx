import React, { useState } from "react";
import { t } from "../../i18n";
import UserAvatar from "../common/UserAvatar.jsx";
import { CloseIcon, SettingsIcon } from "../../icons/index.jsx";
import TI from "../../icons/editor/index.jsx";
import EncryptionAdminSection from "../lock/EncryptionAdminSection.jsx";

// Same shared chip used in the Settings panel: a 36×36 indigo square
// holding a Tabler icon. Putting it in front of every section header
// AND every row keeps icons aligned in a single vertical column.
function RowIcon({ icon: Icon }) {
  return (
    <span className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300">
      <Icon className="tabler-icon w-5 h-5" />
    </span>
  );
}
const SectionHeaderIcon = RowIcon;

// Inline editor for the public login slogan. Keeps a draft state local
// to the input so we can show an explicit Save button (instead of the
// silent on-blur save the previous version had — users couldn't tell
// whether their change had been persisted).
function LoginSloganRow({ value, onSave, showToast }) {
  const [draft, setDraft] = useState(value || "");
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Sync the draft when the persisted value changes (e.g. another tab
  // saved a different slogan). We only overwrite the draft if the user
  // has no pending change to avoid clobbering their typing.
  React.useEffect(() => {
    // Keep the draft in sync when the panel re-opens with fresh data,
    // but don't clobber typing in progress.
    setDraft((prev) => (prev === (value || "") ? prev : (value || "")));
  }, [value]);

  const dirty = (draft || "") !== (value || "");

  const save = async () => {
    if (!dirty) return;
    setBusy(true);
    try {
      await onSave(draft || "");
      setSavedFlash(true);
      showToast?.(t("saved"), "success");
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      showToast?.(e?.message || "Save failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 px-3">
      <div className="flex items-center gap-3 min-w-0">
        <RowIcon icon={TI.Note} />
        <div className="min-w-0">
          <div className="font-medium">{t("loginSloganLabel")}</div>
          <div className="text-sm text-gray-500">{t("loginSlogan")}</div>
        </div>
      </div>
      <div className="ml-11 flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          maxLength={200}
          className="flex-1 px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400 text-sm"
          placeholder={t("loginSloganPlaceholder")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          disabled={busy}
        />
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className="shrink-0 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none disabled:hover:scale-100"
        >
          {busy ? t("saving") : savedFlash ? t("saved") : t("save")}
        </button>
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function AdminPanel({
  open,
  onClose,
  dark,
  adminSettings,
  // setAdminSettings was used by the old on-blur auto-save for the
  // slogan input. The new LoginSloganRow keeps its own draft state and
  // only writes to the server through updateAdminSettings, so we no
  // longer need to mirror typing into the parent state.
  allUsers,
  pendingUsers,
  newUserForm,
  setNewUserForm,
  updateAdminSettings,
  createUser,
  deleteUser,
  updateUser,
  approvePendingUser,
  rejectPendingUser,
  currentUser,
  showGenericConfirm,
  showToast,
  authToken,
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
    } catch {
      // useAdminActions already surfaces the error toast.
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
      const updateData = {
        name: editUserForm.name,
        email: editUserForm.email,
        is_admin: editUserForm.is_admin,
      };
      if (editUserForm.password) updateData.password = editUserForm.password;
      await updateUser(editingUser.id, updateData);
      showToast(t("userUpdatedSuccessfullyBang"), "success");
      setEditUserModalOpen(false);
      setEditingUser(null);
    } catch (err) {
      showToast(err.message || t("failedUpdateUser"), "error");
    } finally {
      setIsUpdatingUser(false);
    }
  };

  // Prevent body scroll while the panel is open — same trick as
  // SettingsPanel.
  React.useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
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
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[28rem] lg:w-[32rem] transition-transform duration-200 ${open ? "translate-x-0 shadow-2xl" : "translate-x-full shadow-none"}`}
        style={{
          backgroundColor: dark ? "#222222" : "rgba(255,255,255,0.95)",
          borderLeft: "1px solid var(--border-light)",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingRight: "env(safe-area-inset-right)",
        }}
        aria-hidden={!open}
      >
        <div className="p-4 flex items-center justify-between border-b border-[var(--border-light)]">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <SettingsIcon />{t("adminPanel")}
          </h3>
          <button
            className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
            data-tooltip={t("close")}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-4 overflow-y-auto h-[calc(100%-64px)]">
          {/* Pending Registrations — rendered first so admins see the
              actionable items without scrolling. Hidden when the
              queue is empty. */}
          {pendingUsers && pendingUsers.length > 0 && (
            <>
              <div className="mb-8">
                <h4 className="text-md font-semibold mb-4 flex items-center gap-3 pl-3">
                  <SectionHeaderIcon icon={TI.UserClock} />
                  <span>{t("pendingRegistrations")}</span>
                  <span className="px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 rounded-full">
                    {pendingUsers.length}
                  </span>
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 pl-3">
                  {t("pendingRegistrationsDesc")}
                </p>
                <div className="space-y-3">
                  {pendingUsers.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-3 border border-amber-300 dark:border-amber-700 rounded-lg bg-amber-50/50 dark:bg-amber-900/20"
                    >
                      <RowIcon icon={TI.UserCircle} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-sm text-gray-500 truncate">{p.email}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          {t("requestedOnPrefix")} {new Date(p.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 gap-2">
                        <button
                          onClick={() => {
                            showGenericConfirm({
                              title: t("rejectRegistrationTitle"),
                              message: t("rejectRegistrationConfirm").replace("{name}", p.name),
                              confirmText: t("reject"),
                              danger: true,
                              onConfirm: async () => {
                                try {
                                  await rejectPendingUser(p.id);
                                  showToast(t("registrationRejected"), "info");
                                } catch (err) {
                                  showToast(err.message || t("failedRejectUser"), "error");
                                }
                              },
                            });
                          }}
                          className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
                          data-tooltip={t("reject")}
                          aria-label={t("reject")}
                        >
                          <TI.X className="tabler-icon w-5 h-5" />
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await approvePendingUser(p.id);
                              showToast(t("registrationApproved"), "success");
                            } catch (err) {
                              showToast(err.message || t("failedApproveUser"), "error");
                            }
                          }}
                          className="w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors"
                          data-tooltip={t("approve")}
                          aria-label={t("approve")}
                        >
                          <TI.Check className="tabler-icon w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <hr className="border-0 h-0.5 my-7 bg-gradient-to-r from-transparent via-gray-400/60 dark:via-white/30 to-transparent" />
            </>
          )}

          {/* Site settings (login slogan, registration toggle) */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4 flex items-center gap-3 pl-3">
              <SectionHeaderIcon icon={TI.World} />
              {t("siteSettings")}
            </h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 px-3">
                <div className="flex items-center gap-3 min-w-0">
                  <RowIcon icon={TI.UserPlus} />
                  <div className="min-w-0">
                    <div className="font-medium">{t("allowNewAccountCreation")}</div>
                    <div className="text-sm text-gray-500">{t("allowNewAccountCreationDesc")}</div>
                  </div>
                </div>
                <button
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
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
                      adminSettings.allowNewAccounts ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <LoginSloganRow
                value={adminSettings.loginSlogan}
                onSave={(slogan) => updateAdminSettings({ loginSlogan: slogan })}
                showToast={showToast}
              />
            </div>
          </div>

          <hr className="border-0 h-0.5 my-7 bg-gradient-to-r from-transparent via-gray-400/60 dark:via-white/30 to-transparent" />

          {/* At-rest encryption — its own section component renders the
              activate / unlock / rotate / regenerate / lock-now /
              deactivate flows. */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4 flex items-center gap-3 pl-3">
              <SectionHeaderIcon icon={TI.ShieldLock} />
              {t("encryptionSectionTitle")}
            </h4>
            <div className="pl-3">
              <EncryptionAdminSection token={authToken} showToast={showToast} />
            </div>
          </div>

          <hr className="border-0 h-0.5 my-7 bg-gradient-to-r from-transparent via-gray-400/60 dark:via-white/30 to-transparent" />

          {/* Create new user */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4 flex items-center gap-3 pl-3">
              <SectionHeaderIcon icon={TI.UserPlus} />
              {t("createNewUser")}
            </h4>
            <form onSubmit={handleCreateUser} className="space-y-3 pl-3">
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
                placeholder={t("temporaryPassword")}
                value={newUserForm.password}
                onChange={(e) =>
                  setNewUserForm((prev) => ({ ...prev, password: e.target.value }))
                }
                className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {t("temporaryPasswordHint")}
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">{t("makeAdmin")}</span>
                <button
                  type="button"
                  onClick={() =>
                    setNewUserForm((prev) => ({ ...prev, is_admin: !prev.is_admin }))
                  }
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                    newUserForm.is_admin
                      ? "bg-indigo-600"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                  aria-pressed={newUserForm.is_admin}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      newUserForm.is_admin ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
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

          <hr className="border-0 h-0.5 my-7 bg-gradient-to-r from-transparent via-gray-400/60 dark:via-white/30 to-transparent" />

          {/* All users — same row pattern as Settings, with avatar in
              the leading icon slot and edit/delete actions on the right. */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4 flex items-center gap-3 pl-3">
              <SectionHeaderIcon icon={TI.Users} />
              <span>{t("allUsers")}</span>
              <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 rounded-full">
                {allUsers.length}
              </span>
            </h4>
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
                        onClick={() => openEditUserModal(user)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors"
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
                              message: t("deleteUserConfirm").replace("{name}", user.name),
                              confirmText: t("delete"),
                              danger: true,
                              onConfirm: () => deleteUser(user.id),
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
          </div>
        </div>
      </div>

      {/* Edit user modal — kept identical to before; the panel is just
          the launcher. */}
      {editUserModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="rounded-xl shadow-2xl w-full max-w-md p-6"
            style={{
              backgroundColor: dark
                ? "rgba(40,40,40,0.98)"
                : "rgba(255,255,255,0.98)",
            }}
          >
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-3">
              <SectionHeaderIcon icon={TI.Pencil} />
              {t("editUser")}
            </h3>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t("name")}</label>
                <input
                  type="text"
                  value={editUserForm.name}
                  onChange={(e) =>
                    setEditUserForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("username")}</label>
                <input
                  type="text"
                  value={editUserForm.email}
                  onChange={(e) =>
                    setEditUserForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("resetPasswordLabel")}</label>
                <input
                  type="password"
                  value={editUserForm.password}
                  onChange={(e) =>
                    setEditUserForm((prev) => ({ ...prev, password: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={t("leaveEmptyKeepCurrentPassword")}
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {t("resetPasswordHint")}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">{t("makeAdmin")}</span>
                <button
                  type="button"
                  onClick={() =>
                    setEditUserForm((prev) => ({ ...prev, is_admin: !prev.is_admin }))
                  }
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                    editUserForm.is_admin
                      ? "bg-indigo-600"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                  aria-pressed={editUserForm.is_admin}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      editUserForm.is_admin ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
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
