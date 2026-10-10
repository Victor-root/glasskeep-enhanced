import React, { useState } from "react";
import { t } from "../../i18n";
import { CloseIcon, ShieldIcon } from "../../icons/index.jsx";
import TI from "../../icons/editor/index.jsx";
import EncryptionAdminSection from "../lock/EncryptionAdminSection.jsx";
import AiAdminSection from "./AiAdminSection.jsx";
import AdminUpdateSection from "../admin/AdminUpdateSection.jsx";
import FederationSection from "../admin/federation/FederationSection.jsx";
import PendingRegistrationsSection from "../admin/PendingRegistrationsSection.jsx";
import SiteSettingsSection from "../admin/SiteSettingsSection.jsx";
import UsersSection from "../admin/UsersSection.jsx";
import CreateUserSection from "../admin/CreateUserSection.jsx";
import EditUserModal from "../admin/EditUserModal.jsx";
import { localizeServerError } from "../../utils/serverErrors.js";
import { SettingsSection } from "../common/SettingsAccordion.jsx";
import useServerPowerActions from "./useServerPowerActions.js";
import ServerPowerOverlay from "./ServerPowerOverlay.jsx";

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
  updateInfo,
  selfUpdate,
  syncStatus,
  highlightPasskeyDomain,
  onPasskeyDomainHighlighted,
  openSections = {},
  setOpenSections,
}) {
  const toggleSection = (key) =>
    setOpenSections?.((prev) => ({ ...prev, [key]: !prev[key] }));
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editUserForm, setEditUserForm] = useState({
    name: "",
    email: "",
    password: "",
    is_admin: false,
  });
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const {
    isRestarting,
    restartPhase,
    restartCountdown,
    isShuttingDown,
    shutdownPhase,
    shutdownCountdown,
    handleRestart,
    handleShutdown,
  } = useServerPowerActions({ showGenericConfirm, showToast, authToken });

  const serverOffline = syncStatus?.syncState === "offline" || syncStatus?.serverReachable === false;

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
      showToast(t("userUpdatedSuccessfullyBang"), "success", undefined, "user-check");
      setEditUserModalOpen(false);
      setEditingUser(null);
    } catch (err) {
      showToast(localizeServerError(err.message, "failedUpdateUser"), "error");
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

  // Non-admins should never see this panel — also avoids mounting the
  // admin-only sections (AiAdminSection, EncryptionAdminSection …) which
  // immediately fetch admin endpoints on mount and would surface a
  // spurious "Admin only" toast right after login.
  if (!currentUser?.is_admin) return null;

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
        className={`gk-side-panel fixed top-0 right-0 z-50 h-full w-full lg:w-[32rem] transition-transform duration-200 ${open ? "translate-x-0 shadow-2xl" : "translate-x-full shadow-none"}`}
        style={{
          borderLeft: "1px solid var(--border-light)",
          paddingTop: "var(--safe-top)",
          paddingBottom: "var(--safe-bottom)",
          paddingRight: "var(--safe-right)",
        }}
        inert={!open}
      >
        <div className="p-4 flex items-center justify-between border-b border-[var(--border-light)]">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <span className={dark ? "text-red-400" : "text-red-600"}>
              <ShieldIcon />
            </span>
            {t("adminPanel")}
          </h3>
          <div className="flex items-center gap-2">
            {!serverOffline && <button
              className="w-9 h-9 flex items-center justify-center rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
              onClick={handleShutdown}
              disabled={isShuttingDown || isRestarting}
              data-tooltip={t("shutdownServer")}
              aria-label={t("shutdownServer")}
            >
              <TI.Power className={`tabler-icon w-4 h-4${isShuttingDown ? " animate-spin" : ""}`} />
            </button>}
            {!serverOffline && <button
              className="w-9 h-9 flex items-center justify-center rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
              onClick={handleRestart}
              disabled={isRestarting || isShuttingDown}
              data-tooltip={t("restartServer")}
              aria-label={t("restartServer")}
            >
              <TI.Refresh className={`tabler-icon w-4 h-4${isRestarting ? " animate-spin" : ""}`} />
            </button>}
            <button
              className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10"
              onClick={onClose}
              data-tooltip={t("close")}
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="gk-side-panel-scroll mobile-hide-scrollbar p-4 overflow-y-auto overflow-x-hidden h-[calc(100%-64px)]">
          <AdminUpdateSection
            updateInfo={updateInfo}
            selfUpdate={selfUpdate}
            showGenericConfirm={showGenericConfirm}
          />

          {/* Pending Registrations — rendered first so admins see the
              actionable items without scrolling. Hidden when the
              queue is empty. */}
          {pendingUsers && pendingUsers.length > 0 && (
            <PendingRegistrationsSection
              open={openSections.pending}
              onToggle={() => toggleSection("pending")}
              pendingUsers={pendingUsers}
              approvePendingUser={approvePendingUser}
              rejectPendingUser={rejectPendingUser}
              showGenericConfirm={showGenericConfirm}
              showToast={showToast}
            />
          )}

          {/* Site settings (login slogan, registration toggle) */}
          <SiteSettingsSection
            open={openSections.site}
            onToggle={() => toggleSection("site")}
            dark={dark}
            adminSettings={adminSettings}
            updateAdminSettings={updateAdminSettings}
            authToken={authToken}
            showToast={showToast}
            showGenericConfirm={showGenericConfirm}
            highlightPasskeyDomain={highlightPasskeyDomain}
            onPasskeyDomainHighlighted={onPasskeyDomainHighlighted}
          />

          {/* All users — same row pattern as Settings, with avatar in
              the leading icon slot and edit/delete actions on the right. */}
          <UsersSection
            open={openSections.users}
            onToggle={() => toggleSection("users")}
            allUsers={allUsers}
            currentUser={currentUser}
            deleteUser={deleteUser}
            onEditUser={openEditUserModal}
            showGenericConfirm={showGenericConfirm}
            showToast={showToast}
          />

          {/* Create new user */}
          <CreateUserSection
            open={openSections.createUser}
            onToggle={() => toggleSection("createUser")}
            newUserForm={newUserForm}
            setNewUserForm={setNewUserForm}
            createUser={createUser}
            showToast={showToast}
          />

          {/* AI provider — OpenAI-compatible endpoint (Ollama, Open
              WebUI, LiteLLM, OpenAI, …). Configuration is admin-only;
              the API key never leaves the server in plain form. */}
          <div className="mb-2">
            <SettingsSection
              icon={TI.Brain}
              title={t("aiSectionTitle")}
              open={openSections.ai}
              onToggle={() => toggleSection("ai")}
            >
            <div className="pl-3">
              <AiAdminSection token={authToken} showToast={showToast} />
            </div>
            </SettingsSection>
          </div>

          {/* At-rest encryption — its own section component renders the
              activate / unlock / rotate / regenerate / lock-now /
              deactivate flows. */}
          <div className="mb-2">
            <SettingsSection
              icon={TI.ShieldLock}
              title={t("encryptionSectionTitle")}
              open={openSections.encryption}
              onToggle={() => toggleSection("encryption")}
            >
            <div className="pl-3">
              <EncryptionAdminSection token={authToken} showToast={showToast} />
            </div>
            </SettingsSection>
          </div>

          {/* Cross-server collaboration — pair this server with another
              GlassKeep instance so their users can share notes. The
              section component owns the pairing + link-management UI. */}
          <div className="mb-2">
            <SettingsSection
              icon={TI.Server}
              title={t("fedSectionTitle")}
              open={openSections.federation}
              onToggle={() => toggleSection("federation")}
            >
            <div className="pl-3">
              <FederationSection
                open={!!openSections.federation}
                authToken={authToken}
                showToast={showToast}
                showGenericConfirm={showGenericConfirm}
              />
            </div>
            </SettingsSection>
          </div>

        </div>
      </div>

      {/* Edit user modal — kept identical to before; the panel is just
          the launcher. */}
      {editUserModalOpen && (
        <EditUserModal
          dark={dark}
          editUserForm={editUserForm}
          setEditUserForm={setEditUserForm}
          isUpdatingUser={isUpdatingUser}
          onSubmit={handleUpdateUser}
          onCancel={() => setEditUserModalOpen(false)}
        />
      )}

      {restartPhase && (
        <ServerPowerOverlay
          phase={restartPhase}
          Icon={TI.Refresh}
          inProgressTitle={t("restartServerInProgress")}
          waitingText={t("restartServerWaiting")}
          doneTitle={t("restartServerDone")}
          countdown={restartCountdown}
        />
      )}
      {shutdownPhase && (
        <ServerPowerOverlay
          phase={shutdownPhase}
          Icon={TI.Power}
          inProgressTitle={t("shutdownServerInProgress")}
          waitingText={t("shutdownServerWaiting")}
          doneTitle={t("shutdownServerDone")}
          countdown={shutdownCountdown}
        />
      )}
    </>
  );
}
