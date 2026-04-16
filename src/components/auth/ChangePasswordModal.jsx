import React, { useState } from "react";
import { t } from "../../i18n";
import { api } from "../../utils/api.js";

/**
 * Full-screen modal that blocks the app when the user must change their password.
 * Also used from SettingsPanel for voluntary password changes.
 *
 * Props:
 *  - forced: boolean — if true, hides cancel and requires change (first login temp password)
 *  - token: string — current JWT
 *  - dark: boolean
 *  - onSuccess({ token, user }) — called after password changed successfully
 *  - onClose() — called when cancelled (only when !forced)
 */
export default function ChangePasswordModal({ forced, token, dark, onSuccess, onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    if (newPassword.length < 6) {
      setErr(t("passwordMin6Error"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr(t("passwordsDoNotMatch"));
      return;
    }

    setLoading(true);
    try {
      const body = { new_password: newPassword };
      if (!forced) body.current_password = currentPassword;

      const res = await api("/user/change-password", {
        method: "POST",
        token,
        body,
      });
      onSuccess?.(res);
    } catch (er) {
      setErr(er.message || t("somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-[90%] max-w-md rounded-xl shadow-2xl p-6"
        style={{
          backgroundColor: dark ? "rgba(40,40,40,0.98)" : "rgba(255,255,255,0.98)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-1">
          {forced ? t("changePasswordRequired") : t("changePassword")}
        </h2>
        {forced && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t("changePasswordRequiredDesc")}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-3">
          {!forced && (
            <div>
              <label className="block text-sm font-medium mb-1">{t("currentPassword")}</label>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
                placeholder={t("currentPassword")}
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">{t("newPassword")}</label>
            <input
              type="password"
              autoComplete="new-password"
              autoFocus
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
              placeholder={t("passwordMin6")}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t("confirmNewPassword")}</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
              placeholder={t("confirmPassword")}
              required
            />
          </div>

          {err && <p className="text-red-600 text-sm">{err}</p>}

          <div className="flex justify-end gap-3 pt-2">
            {!forced && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-[var(--border-light)] rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
              >
                {t("cancel")}
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? t("saving") : t("changePassword")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
