// src/components/admin/EditUserModal.jsx
//
// The dialog the admin panel opens to edit an account. The panel owns the
// form state and the submit handler; this only renders them.

import React from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { RowIcon } from "../common/SettingsAccordion.jsx";
import { GRADIENT_BUTTON_CLASSES } from "../common/fieldClasses.js";

export default function EditUserModal({
  dark,
  editUserForm,
  setEditUserForm,
  isUpdatingUser,
  onSubmit,
  onCancel,
}) {
  return (
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
          <RowIcon icon={TI.Pencil} />
          {t("editUser")}
        </h3>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t("name")}</label>
            <input
              type="text"
              value={editUserForm.name}
              onChange={(e) =>
                setEditUserForm((prev) => ({ ...prev, name: e.target.value }))
              }
              className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--gk-chrome-accent)]"
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
              className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--gk-chrome-accent)]"
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
              className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--gk-chrome-accent)]"
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
                  ? "bg-[var(--gk-switch-on)]"
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
              onClick={onCancel}
              className="px-4 py-2 border border-[var(--border-light)] rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
            >{t("cancel")}</button>
            <button
              type="submit"
              disabled={isUpdatingUser}
              className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${GRADIENT_BUTTON_CLASSES} disabled:opacity-50 disabled:pointer-events-none`}
            >
              {isUpdatingUser ? t("updating") : t("updateUser")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
