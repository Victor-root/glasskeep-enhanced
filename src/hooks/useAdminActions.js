import { useState, useCallback } from "react";
import { api } from "../utils/api.js";
import { t } from "../i18n";
import { localizeServerError } from "../utils/serverErrors.js";

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
  const [pendingUsers, setPendingUsers] = useState([]);
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
      alert(localizeServerError(e.message, "failedUpdateAdminSettings"));
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
      alert(localizeServerError(e.message, "failedCreateUser"));
      throw e;
    }
  };

  const deleteUser = async (userId) => {
    try {
      await api(`/admin/users/${userId}`, { method: "DELETE", token });
      setAllUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (e) {
      alert(localizeServerError(e.message, "failedDeleteUser"));
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

  const loadPendingUsers = useCallback(async () => {
    if (!token) return;
    try {
      const list = await api("/admin/pending-users", { token });
      setPendingUsers(list || []);
    } catch (e) {
      console.error("Failed to load pending users:", e);
    }
  }, [token]);

  const approvePendingUser = async (pendingId) => {
    try {
      const newUser = await api(`/admin/pending-users/${pendingId}/approve`, { method: "POST", token });
      setPendingUsers((prev) => prev.filter((p) => p.id !== pendingId));
      setAllUsers((prev) => [newUser, ...prev]);
      return newUser;
    } catch (e) {
      alert(localizeServerError(e.message, "failedApproveUser"));
      throw e;
    }
  };

  const rejectPendingUser = async (pendingId) => {
    try {
      await api(`/admin/pending-users/${pendingId}/reject`, { method: "POST", token });
      setPendingUsers((prev) => prev.filter((p) => p.id !== pendingId));
    } catch (e) {
      alert(localizeServerError(e.message, "failedRejectUser"));
      throw e;
    }
  };

  const openAdminPanel = async () => {
    console.log("Opening admin panel...");
    setAdminPanelOpen(true);
    try {
      await Promise.all([loadAdminSettings(), loadAllUsers(), loadPendingUsers()]);
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
    pendingUsers,
    setPendingUsers,
    newUserForm,
    setNewUserForm,
    loadAdminSettings,
    updateAdminSettings,
    loadAllUsers,
    loadPendingUsers,
    approvePendingUser,
    rejectPendingUser,
    createUser,
    deleteUser,
    updateUser,
    openAdminPanel,
  };
}
