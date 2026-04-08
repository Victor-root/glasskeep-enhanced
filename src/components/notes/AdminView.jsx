import React, { useState, useEffect } from "react";
import { t } from "../../i18n";
import { api, getAuth, API_BASE } from "../../utils/api.js";

export default function AdminView({ dark, showGenericConfirm }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const sess = getAuth();
  const token = sess?.token;

  const formatBytes = (n = 0) => {
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const e = Math.min(Math.floor(Math.log10(n) / 3), units.length - 1);
    const v = n / Math.pow(1024, e);
    return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[e]}`;
  };

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load users");
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      alert(t("failedLoadAdminData") + (e.message ? `\n\n${e.message}` : ""));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  async function removeUser(id) {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Delete failed");
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      alert(t("deleteFailed") + (e.message ? `\n\n${e.message}` : ""));
    }
  }

  useEffect(() => {
    load();
  }, []); // load once

  return (
    <div className="min-h-screen px-4 sm:px-6 md:px-8 lg:px-12 py-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold mb-4">{t("admin")}</h1>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
          Manage registered users. You can remove users (this also deletes their
          notes).
        </p>

        <div className="glass-card rounded-xl p-4 shadow-lg overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-lg">{t("users")}</h2>
            <button
              onClick={load}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
            >
              {loading ? t("refreshing") : t("refresh")}
            </button>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-[var(--border-light)]">
                <th className="py-2 pr-3">{t("name")}</th>
                <th className="py-2 pr-3">{t("emailOrUsername")}</th>
                <th className="py-2 pr-3">{t("notes")}</th>
                <th className="py-2 pr-3">{t("storage")}</th>
                <th className="py-2 pr-3">{t("admin")}</th>
                <th className="py-2 pr-3">{t("created")}</th>
                <th className="py-2 pr-3">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-6 text-center text-gray-500 dark:text-gray-400"
                  >{t("noUsersFound")}</td>
                </tr>
              )}
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-[var(--border-light)] last:border-0"
                >
                  <td className="py-2 pr-3">{u.name}</td>
                  <td className="py-2 pr-3">{u.email}</td>
                  <td className="py-2 pr-3">{u.notes ?? 0}</td>
                  <td className="py-2 pr-3">
                    {formatBytes(u.storage_bytes ?? 0)}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.is_admin
                          ? "bg-green-500/15 text-green-700 dark:text-green-300 border border-green-500/30"
                          : "bg-gray-500/10 text-gray-700 dark:text-gray-300 border border-gray-500/20"
                      }`}
                    >
                      {u.is_admin ? t("yes") : t("no")}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {new Date(u.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      className="px-2.5 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
                      onClick={() => {
                        showGenericConfirm({
                          title: t("deleteUser"),
                          message: t("deleteUserAllNotesConfirm"),
                          confirmText: t("delete"),
                          danger: true,
                          onConfirm: () => removeUser(u.id),
                        });
                      }}
                      data-tooltip={t("deleteUser")}
                    >{t("delete")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {loading && (
            <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Loading…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
