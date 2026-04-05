import { useState, useCallback } from "react";
import { api } from "../utils/api.js";
import { t } from "../i18n";

/**
 * Hook encapsulating admin panel state and API actions.
 * Purely mechanical extraction from App — same states, same actions, same behavior.
 */
export default function useAdminActions(token, { onSettingsUpdated } = {}) {
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [adminSettings, setAdminSettings] = useState({
    allowNewAccounts: true,
    loginSlogan: "",
  });
  const [allUsers, setAllUsers] = useState([]);
  const [newUserForm, setNewUserForm] = useState({
    name: "",
    email: "",
    password: "",
    is_admin: false,
  });

  const loadAdminSettings = async () => {
    try {
      console.log("Loading admin settings...");
      const settings = await api("/admin/settings", { token });
      console.log("Admin settings loaded:", settings);
      setAdminSettings(settings);
      return settings;
    } catch (e) {
      console.error("Failed to load admin settings:", e);
    }
  };

  const updateAdminSettings = async (newSettings) => {
    try {
      const settings = await api("/admin/settings", {
        method: "PATCH",
        token,
        body: newSettings,
      });
      setAdminSettings(settings);
      if (onSettingsUpdated) onSettingsUpdated(settings);
      return settings;
    } catch (e) {
      alert(e.message || t("failedUpdateAdminSettings"));
    }
  };

  const loadAllUsers = async () => {
    try {
      console.log("Loading all users...");
      const users = await api("/admin/users", { token });
      console.log("Users loaded:", users);
      setAllUsers(users);
    } catch (e) {
      console.error("Failed to load users:", e);
    }
  };

  const createUser = async (userData) => {
    try {
      const newUser = await api("/admin/users", {
        method: "POST",
        token,
        body: userData,
      });
      setAllUsers((prev) => [newUser, ...prev]);
      setNewUserForm({ name: "", email: "", password: "", is_admin: false });
      return newUser;
    } catch (e) {
      alert(e.message || t("failedCreateUser"));
      throw e;
    }
  };

  const deleteUser = async (userId) => {
    try {
      await api(`/admin/users/${userId}`, { method: "DELETE", token });
      setAllUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (e) {
      alert(e.message || t("failedDeleteUser"));
    }
  };

  const updateUser = async (userId, userData) => {
    const updatedUser = await api(`/admin/users/${userId}`, {
      method: "PATCH",
      token,
      body: userData,
    });
    setAllUsers((prev) => prev.map((u) => (u.id === userId ? updatedUser : u)));
    return updatedUser;
  };

  const openAdminPanel = async () => {
    console.log("Opening admin panel...");
    setAdminPanelOpen(true);
    try {
      await Promise.all([loadAdminSettings(), loadAllUsers()]);
      console.log("Admin panel data loaded successfully");
    } catch (error) {
      console.error("Error loading admin panel data:", error);
    }
  };

  return {
    adminPanelOpen,
    setAdminPanelOpen,
    adminSettings,
    setAdminSettings,
    allUsers,
    setAllUsers,
    newUserForm,
    setNewUserForm,
    loadAdminSettings,
    updateAdminSettings,
    loadAllUsers,
    createUser,
    deleteUser,
    updateUser,
    openAdminPanel,
  };
}
