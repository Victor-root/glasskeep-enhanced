// src/components/admin/CreateUserSection.jsx
//
// The "Create new user" block of the admin panel. The form values come
// from the caller; only the in-flight flag is local.

import React, { useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { SettingsSection } from "../common/SettingsAccordion.jsx";

export default function CreateUserSection({
  open,
  onToggle,
  newUserForm,
  setNewUserForm,
  createUser,
  showToast,
}) {
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserForm.name || !newUserForm.email || !newUserForm.password) {
      showToast(t("pleaseFillRequiredFields"), "error");
      return;
    }
    setIsCreatingUser(true);
    try {
      await createUser(newUserForm);
      showToast(t("userCreatedSuccessfullyBang"), "success", undefined, "user-plus");
    } catch {
      // useAdminActions already surfaces the error toast.
    } finally {
      setIsCreatingUser(false);
    }
  };

  return (
    <div className="mb-2">
      <SettingsSection
        icon={TI.UserPlus}
        title={t("createNewUser")}
        open={open}
        onToggle={onToggle}
      >
      <form onSubmit={handleCreateUser} className="space-y-3 pl-3">
        <input
          type="text"
          placeholder={t("name")}
          value={newUserForm.name}
          onChange={(e) =>
            setNewUserForm((prev) => ({ ...prev, name: e.target.value }))
          }
          className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--gk-chrome-accent)] placeholder-gray-500 dark:placeholder-gray-400"
        />
        <input
          type="text"
          placeholder={t("username")}
          value={newUserForm.email}
          onChange={(e) =>
            setNewUserForm((prev) => ({ ...prev, email: e.target.value }))
          }
          className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--gk-chrome-accent)] placeholder-gray-500 dark:placeholder-gray-400"
        />
        <input
          type="password"
          placeholder={t("temporaryPassword")}
          value={newUserForm.password}
          onChange={(e) =>
            setNewUserForm((prev) => ({ ...prev, password: e.target.value }))
          }
          className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--gk-chrome-accent)] placeholder-gray-500 dark:placeholder-gray-400"
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
                ? "bg-[var(--gk-switch-on)]"
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
          className="block w-[90%] mx-auto px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
        >
          {isCreatingUser ? t("creating") : t("createUser")}
        </button>
      </form>
      </SettingsSection>
    </div>
  );
}
