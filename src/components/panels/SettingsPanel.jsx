import React, { useState } from "react";
import { t } from "../../i18n";
import { api } from "../../utils/api.js";
import UserAvatar from "../common/UserAvatar.jsx";
import { SunIcon, MoonIcon, FloatingCardsIcon, SettingsIcon, CloseIcon } from "../../icons/index.jsx";
import { fileToCompressedDataURL } from "../../utils/helpers.js";
import TypographyModal from "./TypographyModal.jsx";

export default function SettingsPanel({
  open,
  onClose,
  dark,
  onExportAll,
  onImportAll,
  onImportGKeep,
  onImportMd,
  onDownloadSecretKey,
  alwaysShowSidebarOnWide,
  setAlwaysShowSidebarOnWide,
  localAiEnabled,
  setLocalAiEnabled,
  floatingCardsEnabled,
  setFloatingCardsEnabled,
  checklistInsertPosition,
  setChecklistInsertPosition,
  checklistRemoveSectionBehavior,
  setChecklistRemoveSectionBehavior,
  edgeToEdgeLandscape,
  setEdgeToEdgeLandscape,
  typographyPresets,
  setTypographyPresets,
  showGenericConfirm,
  showToast,
  onResetNoteOrder,
  currentUser,
  token,
  onProfileUpdated,
  onChangePassword,
}) {
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [overridePositions, setOverridePositions] = useState(true);
  const [profileShowOnLogin, setProfileShowOnLogin] = useState(true);
  const [typographyModalOpen, setTypographyModalOpen] = useState(false);
  const avatarFileRef = React.useRef(null);

  // Load profile data when panel opens
  React.useEffect(() => {
    if (open && token) {
      api("/user/profile", { token }).then((data) => {
        if (data) setProfileShowOnLogin(data.show_on_login !== false);
      }).catch(() => {});
    }
  }, [open, token]);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataURL(file, 256, 0.85);
      await api("/user/avatar", { method: "PUT", body: { avatar_url: dataUrl }, token });
      onProfileUpdated?.({ avatar_url: dataUrl });
      showToast(t("photoUpdated"), "success");
    } catch (err) {
      showToast(err.message || "Upload failed", "error");
    }
    if (avatarFileRef.current) avatarFileRef.current.value = "";
  };

  const handleAvatarRemove = async () => {
    try {
      await api("/user/avatar", { method: "DELETE", token });
      onProfileUpdated?.({ avatar_url: null });
      showToast(t("photoRemoved"), "info");
    } catch (err) {
      showToast(err.message || "Remove failed", "error");
    }
  };

  const handleShowOnLoginToggle = async () => {
    const newVal = !profileShowOnLogin;
    setProfileShowOnLogin(newVal);
    try {
      await api("/user/profile", { method: "PATCH", body: { show_on_login: newVal }, token });
    } catch (err) {
      setProfileShowOnLogin(!newVal); // revert
      showToast(err.message || "Update failed", "error");
    }
  };

  // Prevent body scroll when settings panel is open
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
            <SettingsIcon />{t("settings")}</h3>
          <button
            className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
            data-tooltip={t("close")}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-4 overflow-y-auto h-[calc(100%-64px)]">
          {/* Profile Section */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4">{t("profileSettings")}</h4>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative group">
                <UserAvatar
                  name={currentUser?.name}
                  email={currentUser?.email}
                  avatarUrl={currentUser?.avatar_url}
                  size="w-16 h-16"
                  textSize="text-2xl"
                  dark={dark}
                />
                <button
                  onClick={() => avatarFileRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <input
                  ref={avatarFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{currentUser?.name || currentUser?.email}</div>
                <div className="flex gap-2 mt-1">
                  <button
                    className="text-xs text-indigo-600 hover:underline"
                    onClick={() => avatarFileRef.current?.click()}
                  >{currentUser?.avatar_url ? t("changePhoto") : t("uploadPhoto")}</button>
                  {currentUser?.avatar_url && (
                    <button
                      className="text-xs text-red-500 hover:underline"
                      onClick={handleAvatarRemove}
                    >{t("removePhoto")}</button>
                  )}
                </div>
                {window.AndroidTheme && (
                  <div className="mt-1">
                    <button
                      className="text-xs text-indigo-600 hover:underline"
                      onClick={() => window.AndroidTheme.changeServer()}
                    >{t("changeServer")}</button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-medium">{t("showOnLogin")}</div>
              </div>
              <button
                className={`relative inline-flex h-6 w-11 flex-shrink-0 ml-3 items-center rounded-full transition-colors ${
                  profileShowOnLogin ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"
                }`}
                onClick={handleShowOnLoginToggle}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    profileShowOnLogin ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <button
              className={`mt-3 block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
              onClick={() => {
                onClose();
                onChangePassword?.();
              }}
            >
              <div className="font-medium">{t("changePassword")}</div>
              <div className="text-sm text-gray-500">{t("changePasswordDesc")}</div>
            </button>
          </div>

          {/* Data Management Section */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4">{t("dataManagement")}</h4>
            <div className="space-y-3">
              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  onClose();
                  onExportAll?.();
                }}
              >
                <div className="font-medium">{t("exportAllNotesJson")}</div>
                <div className="text-sm text-gray-500">{t("downloadAllNotesJson")}</div>
              </button>

              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  onClose();
                  onImportAll?.();
                }}
              >
                <div className="font-medium">{t("importNotesJson")}</div>
                <div className="text-sm text-gray-500">{t("importNotesFromJsonFile")}</div>
              </button>

              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  onClose();
                  onImportGKeep?.();
                }}
              >
                <div className="font-medium">{t("importGoogleKeepNotes")}</div>
                <div className="text-sm text-gray-500">{t("importNotesFromGoogleKeepExport")}</div>
              </button>

              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  onClose();
                  onImportMd?.();
                }}
              >
                <div className="font-medium">{t("importMarkdownFilesMd")}</div>
                <div className="text-sm text-gray-500">{t("importNotesFromMarkdownFiles")}</div>
              </button>

              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  onClose();
                  onDownloadSecretKey?.();
                }}
              >
                <div className="font-medium">{t("downloadSecretKeyTxt")}</div>
                <div className="text-sm text-gray-500">{t("downloadEncryptionKeyBackup")}</div>
              </button>

              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  setOverridePositions(true);
                  setResetDialogOpen(true);
                }}
              >
                <div className="font-medium">{t("resetNoteOrder")}</div>
                <div className="text-sm text-gray-500">{t("resetNoteOrderDesc")}</div>
              </button>
            </div>
          </div>

          {/* UI Preferences Section */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4">{t("uiPreferences")}</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{t("localAiAssistant")}</div>
                  <div className="text-sm text-gray-500">{t("askQuestionsAboutNotes")}</div>
                </div>
                <button
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 ml-3 items-center rounded-full transition-colors ${
                    localAiEnabled
                      ? "bg-indigo-600"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                  onClick={() => {
                    if (!localAiEnabled) {
                      // Show confirmation dialog when enabling
                      showGenericConfirm({
                        title: t("enableAiAssistantQuestion"),
                        message:
                          t("enableAiAssistantWarning"),
                        confirmText: t("enableAi"),
                        cancelText: t("cancel"),
                        danger: false,
                        onConfirm: async () => {
                          setLocalAiEnabled(true);
                          showToast(
                            t("aiAssistantEnabledModelDownload"),
                            "success",
                          );
                        },
                      });
                    } else {
                      // Disable without confirmation
                      setLocalAiEnabled(false);
                      showToast(t("aiAssistantDisabled"), "info");
                    }
                  }}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      localAiEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{t("alwaysShowSidebarWide")}</div>
                  <div className="text-sm text-gray-500">{t("keepTagsPanelVisible")}</div>
                </div>
                <button
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 ml-3 items-center rounded-full transition-colors ${
                    alwaysShowSidebarOnWide
                      ? "bg-indigo-600"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                  onClick={() =>
                    setAlwaysShowSidebarOnWide(!alwaysShowSidebarOnWide)
                  }
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      alwaysShowSidebarOnWide
                        ? "translate-x-6"
                        : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{t("enableAnimationsMobile")}</div>
                  <div className="text-sm text-gray-500">{t("enableAnimationsMobileDesc")}</div>
                </div>
                <button
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 ml-3 items-center rounded-full transition-colors ${
                    floatingCardsEnabled
                      ? "bg-indigo-600"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                  onClick={() => setFloatingCardsEnabled(!floatingCardsEnabled)}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      floatingCardsEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{t("edgeToEdgeLandscape")}</div>
                  <div className="text-sm text-gray-500">{t("edgeToEdgeLandscapeDesc")}</div>
                </div>
                <button
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 ml-3 items-center rounded-full transition-colors ${
                    edgeToEdgeLandscape
                      ? "bg-indigo-600"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                  onClick={() => setEdgeToEdgeLandscape(!edgeToEdgeLandscape)}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      edgeToEdgeLandscape ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {/* Rich-text editor typography presets — opens its own
                  full-viewport modal so the 6 block cards have enough
                  room to show size / weight / colour / italic / underline
                  controls without being cut off on the narrow side sheet. */}
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{t("typographyTitle")}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{t("typographyDesc")}</div>
                </div>
                <button
                  type="button"
                  className="ml-3 shrink-0 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                  onClick={() => setTypographyModalOpen(true)}
                >
                  {t("typographyOpen")}
                </button>
              </div>

            </div>
          </div>

          {/* Checklist Settings Section */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4">{t("checklistSettings")}</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{t("checklistInsertPosition")}</div>
                  <div className="text-sm text-gray-500">{t("checklistInsertPositionDesc")}</div>
                </div>
                <div className="ml-3 flex-shrink-0 inline-flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                  <button
                    className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
                      checklistInsertPosition === "top"
                        ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                        : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                    onClick={() => setChecklistInsertPosition("top")}
                  >
                    {t("checklistInsertTop")}
                  </button>
                  <button
                    className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
                      checklistInsertPosition === "bottom"
                        ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                        : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                    onClick={() => setChecklistInsertPosition("bottom")}
                  >
                    {t("checklistInsertBottom")}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{t("checklistRemoveSection")}</div>
                  <div className="text-sm text-gray-500">{t("checklistRemoveSectionDesc")}</div>
                </div>
                <div className="ml-3 flex-shrink-0 inline-flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                  <button
                    className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
                      checklistRemoveSectionBehavior === "cascade"
                        ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                        : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                    onClick={() => setChecklistRemoveSectionBehavior("cascade")}
                  >
                    {t("checklistRemoveSectionCascade")}
                  </button>
                  <button
                    className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
                      checklistRemoveSectionBehavior === "keep"
                        ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                        : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                    onClick={() => setChecklistRemoveSectionBehavior("keep")}
                  >
                    {t("checklistRemoveSectionKeep")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reset Note Order Dialog */}
      {resetDialogOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setResetDialogOpen(false)}
          />
          <div
            className="glass-card rounded-xl shadow-2xl w-[90%] max-w-sm p-6 relative"
            style={{
              backgroundColor: dark
                ? "rgba(40,40,40,0.95)"
                : "rgba(255,255,255,0.95)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">{t("resetNoteOrder")}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              {t("resetNoteOrderConfirm")}
            </p>
            <label className="flex items-center gap-2 cursor-pointer mb-5">
              <input
                type="checkbox"
                checked={overridePositions}
                onChange={(e) => setOverridePositions(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm">{t("resetNoteOrderOverridePositions")}</span>
            </label>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => setResetDialogOpen(false)}
              >
                {t("cancel")}
              </button>
              <button
                className="px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                onClick={() => {
                  setResetDialogOpen(false);
                  onClose();
                  onResetNoteOrder?.(overridePositions);
                }}
              >
                {t("confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated modal for advanced typography customisation. */}
      <TypographyModal
        open={typographyModalOpen}
        onClose={() => setTypographyModalOpen(false)}
        presets={typographyPresets}
        setPresets={setTypographyPresets}
        dark={dark}
      />
    </>
  );
}
