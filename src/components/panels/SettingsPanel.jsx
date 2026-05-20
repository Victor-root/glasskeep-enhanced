import React, { useState, useRef } from "react";
import { t, getLanguageOverride, setLanguageOverride, SUPPORTED_LANGUAGES, LANGUAGE_NATIVE_LABELS } from "../../i18n";
import { api } from "../../utils/api.js";
import { localizeServerError } from "../../utils/serverErrors.js";
import UserAvatar from "../common/UserAvatar.jsx";
import Popover from "../common/Popover.jsx";
import { SunIcon, MoonIcon, FloatingCardsIcon, SettingsIcon, CloseIcon } from "../../icons/index.jsx";
import TI from "../../icons/editor/index.jsx";
import { fileToCompressedDataURL } from "../../utils/helpers.js";
import TypographyModal from "./TypographyModal.jsx";
import PasskeySettingsSection from "../settings/PasskeySettingsSection.jsx";
import UserAiSettingsSection from "../settings/UserAiSettingsSection.jsx";
import { RowIcon, SettingsSection, SettingsSubHeading as UISubHeading } from "../common/SettingsAccordion.jsx";

const SectionHeaderIcon = RowIcon;

const SIDEBAR_BREAKPOINT_PRESETS = [
  { value: 1024, labelKey: "sidebarBreakpoint1024" },
  { value: 1280, labelKey: "sidebarBreakpoint1280" },
  { value: 1366, labelKey: "sidebarBreakpoint1366" },
  { value: 1440, labelKey: "sidebarBreakpoint1440" },
  { value: 1600, labelKey: "sidebarBreakpoint1600" },
];

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
  sidebarBreakpoint,
  setSidebarBreakpoint,
  readModeEnabled,
  setReadModeEnabled,
  openSections = {},
  setOpenSections,
  aiAssistantEnabled,
  setAiAssistantEnabled,
  floatingCardsEnabled,
  setFloatingCardsEnabled,
  checklistInsertPosition,
  setChecklistInsertPosition,
  checklistRemoveSectionBehavior,
  setChecklistRemoveSectionBehavior,
  edgeToEdgeLandscape,
  setEdgeToEdgeLandscape,
  editorToolbarMode,
  setEditorToolbarMode,
  typographyPresets,
  setTypographyPresets,
  // Lifted into App.jsx so the centralised overlay back-button stack
  // can pop the typography sub-modal on Android back gesture.
  typographyModalOpen,
  setTypographyModalOpen,
  showGenericConfirm,
  showToast,
  isWebView,
  onResetNoteOrder,
  currentUser,
  token,
  onProfileUpdated,
  onChangePassword,
  encryptionEnabled,
  instanceUnlocked,
  // Cross-device QR sign-in — modal owner sits in App.jsx so the
  // header quick-access button (when enabled) and this panel both
  // pop the same dialog.
  openQrScanner,
  qrQuickEnabled,
  setQrQuickEnabled,
}) {
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [overridePositions, setOverridePositions] = useState(true);
  const [profileShowOnLogin, setProfileShowOnLogin] = useState(true);
  // "" represents "Automatic" (no override → follow browser/OS).
  const [languageChoice, setLanguageChoice] = useState(() => getLanguageOverride() || "");
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const languageBtnRef = useRef(null);
  const [breakpointMenuOpen, setBreakpointMenuOpen] = useState(false);
  const breakpointBtnRef = useRef(null);
  // openSections / setOpenSections come from App.jsx so the per-section
  // expansion state is server-synced (defaults to all collapsed).
  const toggleSection = (key) =>
    setOpenSections?.((prev) => ({ ...prev, [key]: !prev[key] }));
  // Current installed APK version, fetched once from the Android
  // bridge. Empty string when running on the web/PWA (no bridge) so
  // the "v…" line stays hidden.
  const [appVersion, setAppVersion] = useState("");
  // True when the APK was installed by F-Droid — we step out of the
  // updater UI in that case (F-Droid handles updates itself).
  const [installedFromFdroid, setInstalledFromFdroid] = useState(false);
  // Latest detected Android-app release as reported by the
  // AndroidTheme.getAvailableUpdate() bridge. The Settings card under
  // "Vérifier les mises à jour" renders when this is non-null.
  const [availableUpdate, setAvailableUpdate] = useState(null);
  React.useEffect(() => {
    if (!open) return;
    if (!isWebView) return;
    try {
      const v = window?.AndroidTheme?.getAppVersion?.();
      if (typeof v === "string" && v.length) setAppVersion(v);
    } catch (e) {}
    try {
      const fd = window?.AndroidTheme?.isFdroidInstall?.();
      setInstalledFromFdroid(fd === true);
    } catch (e) {}
    try {
      const json = window?.AndroidTheme?.getAvailableUpdate?.();
      if (typeof json === "string" && json.length) {
        const parsed = JSON.parse(json);
        if (parsed && typeof parsed === "object" && parsed.version) {
          setAvailableUpdate(parsed);
          return;
        }
      }
    } catch (e) {}
    setAvailableUpdate(null);
  }, [open, isWebView]);
  // Hook the Android-side notification callbacks for the manual check
  // (Settings → Application → "Check for updates" → check runs → bridge
  // calls back into JS with the result). Registered once for the
  // lifetime of the panel component.
  React.useEffect(() => {
    const onAvail = (info) => {
      if (info && typeof info === "object" && info.version) {
        setAvailableUpdate(info);
      }
    };
    const onUpToDate = () => setAvailableUpdate(null);
    if (typeof window !== "undefined") {
      window.__glasskeepUpdateAvailable = onAvail;
      window.__glasskeepUpdateUpToDate = onUpToDate;
    }
    return () => {
      if (typeof window === "undefined") return;
      if (window.__glasskeepUpdateAvailable === onAvail) {
        window.__glasskeepUpdateAvailable = undefined;
      }
      if (window.__glasskeepUpdateUpToDate === onUpToDate) {
        window.__glasskeepUpdateUpToDate = undefined;
      }
    };
  }, []);
  // typographyModalOpen / setTypographyModalOpen come from App.jsx props
  // (see destructure above) — lifted to plug into the centralised
  // overlay back-button stack.
  const avatarFileRef = React.useRef(null);

  // Load profile data when panel opens
  React.useEffect(() => {
    if (open && token) {
      api("/user/profile", { token }).then((data) => {
        if (!data) return;
        setProfileShowOnLogin(data.show_on_login !== false);
        // Server is the source of truth for language too; reflect it in
        // the picker so the segmented control matches the saved choice.
        setLanguageChoice(SUPPORTED_LANGUAGES.includes(data.language) ? data.language : "");
      }).catch(() => {});
    }
  }, [open, token]);

  const handleLanguageChange = async (next) => {
    const previous = languageChoice;
    if (next === previous) return;
    setLanguageChoice(next);
    try {
      await api("/user/profile", {
        method: "PATCH",
        body: { language: next || null },
        token,
      });
      setLanguageOverride(next || null);
      // Strings are bound at module load — reload so the new dict is used.
      window.location.reload();
    } catch (err) {
      setLanguageChoice(previous);
      showToast?.(localizeServerError(err.message, "languageSaveFailed"), "error");
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataURL(file, 256, 0.85);
      await api("/user/avatar", { method: "PUT", body: { avatar_url: dataUrl }, token });
      onProfileUpdated?.({ avatar_url: dataUrl });
      showToast(t("photoUpdated"), "success");
    } catch (err) {
      showToast(localizeServerError(err.message, "uploadFailed"), "error");
    }
    if (avatarFileRef.current) avatarFileRef.current.value = "";
  };

  const handleAvatarRemove = async () => {
    try {
      await api("/user/avatar", { method: "DELETE", token });
      onProfileUpdated?.({ avatar_url: null });
      showToast(t("photoRemoved"), "info");
    } catch (err) {
      showToast(localizeServerError(err.message, "removeFailed"), "error");
    }
  };

  const handleShowOnLoginToggle = async () => {
    const newVal = !profileShowOnLogin;
    setProfileShowOnLogin(newVal);
    try {
      await api("/user/profile", { method: "PATCH", body: { show_on_login: newVal }, token });
    } catch (err) {
      setProfileShowOnLogin(!newVal); // revert
      showToast(localizeServerError(err.message, "updateFailed"), "error");
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
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[28rem] lg:w-[32rem] transition-transform duration-200 ${open ? "translate-x-0 shadow-2xl" : "translate-x-full shadow-none"}`}
        style={{
          backgroundColor: dark ? "#222222" : "#f9f6ff",
          borderLeft: "1px solid var(--border-light)",
          paddingTop: "var(--safe-top)",
          paddingBottom: "var(--safe-bottom)",
          paddingRight: "var(--safe-right)",
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

        <div className="p-4 pb-12 overflow-y-auto h-[calc(100%-64px)]">
          {/* Profile Section — header (icon + "Profil" title) intentionally
              omitted; the avatar block is self-explanatory. */}
          <div className="mb-8">
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
          </div>

          {/* Security Section — login visibility, password change,
              cross-device QR sign-in and passkeys grouped together. */}
          <div className="mb-2">
            <SettingsSection
              icon={TI.ShieldLock}
              title={t("securitySectionTitle")}
              open={openSections.security}
              onToggle={() => toggleSection("security")}
            >
            <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 px-3">
              <div className="flex items-center gap-3 min-w-0">
                <RowIcon icon={TI.Eye} />
                <div className="min-w-0">
                  <div className="font-medium">{t("showOnLogin")}</div>
                </div>
              </div>
              <button
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full self-end sm:self-auto transition-colors ${
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
              className={`mt-3 flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
              onClick={() => {
                onClose();
                onChangePassword?.();
              }}
            >
              <RowIcon icon={TI.Key} />
              <div className="min-w-0">
                <div className="font-medium">{t("changePassword")}</div>
                <div className="text-sm text-gray-500">{t("changePasswordDesc")}</div>
              </div>
            </button>

            {/* Cross-device QR sign-in. Whole card is the primary
                action (tap → opens the scanner). The Show/Hide
                segmented control sits INSIDE the same clickable
                surface (HTML disallows nested <button>s, so the
                outer container is a div with role=button and the
                inner buttons stopPropagation on their clicks) — the
                user wanted both options to feel like one tightly-
                related feature, not two separate settings stacked. */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => openQrScanner?.()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openQrScanner?.();
                }
              }}
              className={`mt-5 cursor-pointer w-full flex items-start gap-3 px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500`}
            >
              <RowIcon icon={TI.Qrcode} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t("qrSignInRowTitle")}</div>
                <div className="text-sm text-gray-500">{t("qrSignInRowSubtitle")}</div>
                <div
                  className="mt-3 flex items-center justify-between flex-wrap gap-2"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {t("qrSignInQuickToggleLabel")}
                  </div>
                  <div className="inline-flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                    <button
                      type="button"
                      onClick={() => setQrQuickEnabled?.(true)}
                      className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
                        qrQuickEnabled
                          ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                          : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      {t("qrSignInQuickShow")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setQrQuickEnabled?.(false)}
                      className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
                        !qrQuickEnabled
                          ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                          : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      {t("qrSignInQuickHide")}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Passkeys / WebAuthn — register, rename, delete, and (for
                admins on a PRF-capable, unlocked instance) promote a
                credential to "can unlock the instance". The section
                handles its own list-fetching + ceremonies; we just
                hand it the token and the encryption status. */}
            <div className="mt-3 px-3 py-3 border border-[var(--border-light)] rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <RowIcon icon={TI.Key} />
                <div className="min-w-0">
                  <div className="font-medium">{t("passkeysSectionTitle")}</div>
                  <div className="text-sm text-gray-500">{t("passkeysSectionSubtitle")}</div>
                </div>
              </div>
              <PasskeySettingsSection
                token={token}
                isAdmin={!!currentUser?.is_admin}
                encryptionEnabled={!!encryptionEnabled}
                instanceUnlocked={!!instanceUnlocked}
                showToast={showToast}
                isWebView={!!isWebView}
              />
            </div>
            </div>
            </SettingsSection>
          </div>

          {/* UI Preferences Section — layout + animations live here. */}
          <div className="mb-2">
            <SettingsSection
              icon={TI.AdjustmentsHorizontal}
              title={t("uiPreferences")}
              open={openSections.ui}
              onToggle={() => toggleSection("ui")}
            >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 px-3">
                <div className="flex items-center gap-3 min-w-0">
                  <RowIcon icon={TI.LayoutSidebar} />
                  <div className="min-w-0">
                    <div className="font-medium">{t("alwaysShowSidebarWide")}</div>
                    <div className="text-sm text-gray-500">{t("keepTagsPanelVisible")}</div>
                  </div>
                </div>
                <button
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full self-end sm:self-auto transition-colors ${
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

              {alwaysShowSidebarOnWide && (
                <div className="flex flex-col gap-2 px-3 sm:pl-14">
                  <div className="min-w-0">
                    <div className="font-medium">{t("sidebarBreakpoint")}</div>
                    <div className="text-sm text-gray-500">{t("sidebarBreakpointDesc")}</div>
                  </div>
                  <button
                    ref={breakpointBtnRef}
                    type="button"
                    onClick={() => setBreakpointMenuOpen((v) => !v)}
                    className="w-full inline-flex items-center justify-between gap-2 pl-3 pr-1.5 py-1.5 text-sm rounded-lg font-semibold border border-[var(--border-light)] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.99] transition-all duration-200"
                    aria-haspopup="listbox"
                    aria-expanded={breakpointMenuOpen}
                  >
                    <span className="truncate text-left">
                      {t(
                        (SIDEBAR_BREAKPOINT_PRESETS.find((p) => p.value === sidebarBreakpoint) || {}).labelKey
                      ) || `≥ ${sidebarBreakpoint} px`}
                    </span>
                    <span className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-300/40 dark:shadow-none btn-gradient">
                      <TI.ChevronDown
                        className={`tabler-icon w-4 h-4 transition-transform ${breakpointMenuOpen ? "rotate-180" : ""}`}
                      />
                    </span>
                  </button>
                  <Popover
                    anchorRef={breakpointBtnRef}
                    open={breakpointMenuOpen}
                    onClose={() => setBreakpointMenuOpen(false)}
                    offset={6}
                  >
                    <ul
                      className="min-w-[16rem] rounded-xl border border-[var(--border-light)] bg-white dark:bg-[#222222] text-gray-800 dark:text-gray-100 shadow-xl py-1.5 overflow-hidden"
                      role="listbox"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {SIDEBAR_BREAKPOINT_PRESETS.map((p) => {
                        const selected = sidebarBreakpoint === p.value;
                        return (
                          <li key={p.value} role="option" aria-selected={selected}>
                            <button
                              type="button"
                              className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left transition-colors ${
                                selected
                                  ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 font-semibold"
                                  : "hover:bg-black/5 dark:hover:bg-white/10"
                              }`}
                              onClick={() => {
                                setBreakpointMenuOpen(false);
                                setSidebarBreakpoint(p.value);
                              }}
                            >
                              <span>{t(p.labelKey)}</span>
                              {selected && <TI.Check className="tabler-icon w-4 h-4 shrink-0" />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </Popover>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 px-3">
                <div className="flex items-center gap-3 min-w-0">
                  <RowIcon icon={TI.DeviceMobileRotated} />
                  <div className="min-w-0">
                    <div className="font-medium">{t("edgeToEdgeLandscape")}</div>
                    <div className="text-sm text-gray-500">{t("edgeToEdgeLandscapeDesc")}</div>
                  </div>
                </div>
                <button
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full self-end sm:self-auto transition-colors ${
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

              <div className="flex items-center justify-between gap-3 px-3">
                <div className="flex items-center gap-3 min-w-0">
                  <RowIcon icon={TI.Sparkles} />
                  <div className="min-w-0">
                    <div className="font-medium">{t("enableAnimationsMobile")}</div>
                    <div className="text-sm text-gray-500">{t("enableAnimationsMobileDesc")}</div>
                  </div>
                </div>
                <button
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full self-end sm:self-auto transition-colors ${
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
            </div>
            </SettingsSection>
          </div>

          {/* Notes Section — note-editing preferences (read mode, toolbar,
              typography) and the previously top-level Checklist Settings
              as a sub-group at the bottom. */}
          <div className="mb-2">
            <SettingsSection
              icon={TI.Note}
              title={t("notes")}
              open={openSections.notes}
              onToggle={() => toggleSection("notes")}
            >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 px-3">
                <div className="flex items-center gap-3 min-w-0">
                  <RowIcon icon={TI.Eye} />
                  <div className="min-w-0">
                    <div className="font-medium">{t("readModeOption")}</div>
                    <div className="text-sm text-gray-500 whitespace-pre-line">{t("readModeOptionDesc")}</div>
                  </div>
                </div>
                <button
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full self-end sm:self-auto transition-colors ${
                    readModeEnabled
                      ? "bg-indigo-600"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                  onClick={() => setReadModeEnabled(!readModeEnabled)}
                  aria-pressed={readModeEnabled}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      readModeEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 px-3">
                <div className="flex items-center gap-3 min-w-0">
                  <RowIcon icon={TI.Heading} />
                  <div className="min-w-0">
                    <div className="font-medium">{t("editorToolbarMode")}</div>
                    <div className="text-sm text-gray-500">
                      {editorToolbarMode === "simple"
                        ? t("editorToolbarModeSimpleDesc")
                        : t("editorToolbarModeAdvancedDesc")}
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0 inline-flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 self-end sm:self-auto">
                  <button
                    className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
                      editorToolbarMode === "simple"
                        ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                        : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                    onClick={() => setEditorToolbarMode("simple")}
                  >
                    {t("editorToolbarModeSimple")}
                  </button>
                  <button
                    className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
                      editorToolbarMode === "advanced"
                        ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                        : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                    onClick={() => setEditorToolbarMode("advanced")}
                  >
                    {t("editorToolbarModeAdvanced")}
                  </button>
                </div>
              </div>

              {/* Rich-text editor typography presets — opens its own
                  full-viewport modal so the 6 block cards have enough
                  room to show size / weight / colour / italic / underline
                  controls without being cut off on the narrow side sheet. */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 px-3">
                <div className="flex items-center gap-3 min-w-0">
                  <RowIcon icon={TI.Typography} />
                  <div className="min-w-0">
                    <div className="font-medium">{t("typographyTitle")}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{t("typographyDesc")}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 self-end sm:self-auto px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                  onClick={() => setTypographyModalOpen(true)}
                >
                  {t("typographyOpen")}
                </button>
              </div>

              <UISubHeading label={t("checklistSettings")} />

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 px-3">
                <div className="flex items-center gap-3 min-w-0">
                  <RowIcon icon={TI.IndentIncrease} />
                  <div className="min-w-0">
                    <div className="font-medium">{t("checklistInsertPosition")}</div>
                    <div className="text-sm text-gray-500">{t("checklistInsertPositionDesc")}</div>
                  </div>
                </div>
                <div className="flex-shrink-0 inline-flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 self-end sm:self-auto">
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

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 px-3">
                <div className="flex items-center gap-3 min-w-0">
                  <RowIcon icon={TI.Filter2Question} />
                  <div className="min-w-0">
                    <div className="font-medium">{t("checklistRemoveSection")}</div>
                    <div className="text-sm text-gray-500">{t("checklistRemoveSectionDesc")}</div>
                  </div>
                </div>
                <div className="flex-shrink-0 inline-flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 self-end sm:self-auto">
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
            </SettingsSection>
          </div>

          {/* Data Management Section */}
          <div className="mb-2">
            <SettingsSection
              icon={TI.Database}
              title={t("dataManagement")}
              open={openSections.data}
              onToggle={() => toggleSection("data")}
            >
            <div className="space-y-3">
              <button
                className={`flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  onClose();
                  onExportAll?.();
                }}
              >
                <RowIcon icon={TI.Upload} />
                <div className="min-w-0">
                  <div className="font-medium">{t("exportAllNotesJson")}</div>
                  <div className="text-sm text-gray-500">{t("downloadAllNotesJson")}</div>
                </div>
              </button>

              <button
                className={`flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  onClose();
                  onImportAll?.();
                }}
              >
                <RowIcon icon={TI.Download} />
                <div className="min-w-0">
                  <div className="font-medium">{t("importNotesJson")}</div>
                  <div className="text-sm text-gray-500">{t("importNotesFromJsonFile")}</div>
                </div>
              </button>

              <button
                className={`flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  onClose();
                  onImportGKeep?.();
                }}
              >
                <RowIcon icon={TI.BrandGoogle} />
                <div className="min-w-0">
                  <div className="font-medium">{t("importGoogleKeepNotes")}</div>
                  <div className="text-sm text-gray-500">
                    {t("importNotesFromGoogleKeepExport")}{" "}
                    {/* Inline help link to Google's Takeout instructions.
                        stopPropagation so clicking the link doesn't also
                        trigger the parent button's file-picker open. */}
                    <a
                      href="https://support.google.com/accounts/answer/3024190?hl=en-AM&utm"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-500 hover:text-indigo-600 dark:text-indigo-300 dark:hover:text-indigo-200 underline underline-offset-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t("howToExportGoogleKeep")}
                    </a>
                  </div>
                </div>
              </button>

              <button
                className={`flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  onClose();
                  onImportMd?.();
                }}
              >
                <RowIcon icon={TI.FileText} />
                <div className="min-w-0">
                  <div className="font-medium">{t("importMarkdownFilesMd")}</div>
                  <div className="text-sm text-gray-500">{t("importNotesFromMarkdownFiles")}</div>
                </div>
              </button>

              <button
                className={`flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  onClose();
                  onDownloadSecretKey?.();
                }}
              >
                <RowIcon icon={TI.Key} />
                <div className="min-w-0">
                  <div className="font-medium">{t("downloadSecretKeyTxt")}</div>
                  <div className="text-sm text-gray-500">{t("downloadEncryptionKeyBackup")}</div>
                </div>
              </button>

              <button
                className={`flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => {
                  setOverridePositions(true);
                  setResetDialogOpen(true);
                }}
              >
                <RowIcon icon={TI.ArrowsSort} />
                <div className="min-w-0">
                  <div className="font-medium">{t("resetNoteOrder")}</div>
                  <div className="text-sm text-gray-500">{t("resetNoteOrderDesc")}</div>
                </div>
              </button>
            </div>
            </SettingsSection>
          </div>

          {/* AI Assistant Section — per-user preferences. Mode picker
              (server vs. custom) and an optional personal OpenAI-
              compatible config. Never receives the admin's API key,
              base URL or model. */}
          <div className="mb-2">
            <SettingsSection
              icon={TI.Brain}
              title={t("aiSectionTitle")}
              open={openSections.ai}
              onToggle={() => toggleSection("ai")}
            >
            <div className="pl-3">
              <UserAiSettingsSection
                token={token}
                showToast={showToast}
                onEnabledChange={setAiAssistantEnabled}
              />
            </div>
            </SettingsSection>
          </div>

          {/* Application section — Android-only manual update check. The
              "AndroidTheme.checkForUpdate" bridge method ships in the
              APK starting with 1.4.0, so the section stays hidden on
              the web, on the desktop PWA, and on older APKs that don't
              know about it. */}
          {isWebView &&
            typeof window !== "undefined" &&
            window.AndroidTheme &&
            typeof window.AndroidTheme.checkForUpdate === "function" && (
            <div className="mb-2">
              <SettingsSection
                icon={TI.Refresh}
                title={t("appSectionTitle")}
                open={openSections.app}
                onToggle={() => toggleSection("app")}
              >
                <div className="space-y-3">
                  {installedFromFdroid ? (
                    /* F-Droid installs delegate updates to F-Droid
                       itself, so we hide the check button + update
                       card and only show the running APK version
                       with a one-liner explaining why nothing's
                       actionable here. */
                    <div className="flex items-center gap-3 px-3 py-3 border border-[var(--border-light)] rounded-lg">
                      <RowIcon icon={TI.Download} />
                      <div className="min-w-0">
                        {appVersion && (
                          <div className="font-medium tabular-nums">
                            {t("currentAppVersion").replace("{version}", appVersion)}
                          </div>
                        )}
                        <div className="text-sm text-gray-500 mt-0.5">
                          {t("appUpdatesManagedByFdroid")}
                        </div>
                      </div>
                    </div>
                  ) : availableUpdate ? (
                    /* When a release has been detected the card replaces
                       the "Check for updates" button entirely — keeping
                       both side-by-side made the section feel redundant
                       (the card is itself the answer to the check). */
                    <div className="px-3 py-3 border border-indigo-300/60 dark:border-indigo-500/40 rounded-lg bg-indigo-50/60 dark:bg-indigo-900/20">
                      <div className="flex items-start gap-3">
                        <RowIcon icon={TI.Sparkles} />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{t("updateAvailableHeader")}</div>
                          <div className="text-sm text-gray-700 dark:text-gray-200 mt-0.5">
                            {t("updateAvailableVersion").replace("{version}", availableUpdate.version)}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                            {t("updateAvailableServerHint")}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            try { window.AndroidTheme?.dismissAvailableUpdate?.(); } catch (e) {}
                            setAvailableUpdate(null);
                          }}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        >
                          {t("updateAvailableLater")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            try { window.AndroidTheme?.installAvailableUpdate?.(); } catch (e) {}
                          }}
                          className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                        >
                          {t("updateAvailableDownload")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className={`flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                      onClick={() => {
                        try { window.AndroidTheme.checkForUpdate(); } catch (e) {}
                      }}
                    >
                      <RowIcon icon={TI.Download} />
                      <div className="min-w-0">
                        <div className="font-medium">{t("checkForUpdateOption")}</div>
                        <div className="text-sm text-gray-500">{t("checkForUpdateDesc")}</div>
                        {appVersion && (
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 tabular-nums">
                            {t("currentAppVersion").replace("{version}", appVersion)}
                          </div>
                        )}
                      </div>
                    </button>
                  )}
                </div>
              </SettingsSection>
            </div>
          )}

          {/* Language section — was inline next to the profile / change-
              password rows; lives in its own bordered section now so
              "Language" feels like a top-level preference rather than an
              account control. Same Popover dropdown as before, no
              behaviour change beyond placement. */}
          <div className="mb-2">
            <SettingsSection
              icon={TI.World}
              title={t("languageSectionTitle")}
              open={openSections.language}
              onToggle={() => toggleSection("language")}
            >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 px-3 py-3 border border-[var(--border-light)] rounded-lg">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t("languageLabel")}</div>
                  <div className="text-sm text-gray-500">{t("languageDesc")}</div>
                </div>
                <button
                  ref={languageBtnRef}
                  type="button"
                  onClick={() => setLanguageMenuOpen((v) => !v)}
                  className="shrink-0 inline-flex items-center justify-between gap-2 min-w-[9rem] px-3 py-1.5 text-sm rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
                  aria-haspopup="listbox"
                  aria-expanded={languageMenuOpen}
                  data-tooltip={languageChoice ? undefined : t("languageAutoTooltip")}
                >
                  <span>
                    {languageChoice
                      ? LANGUAGE_NATIVE_LABELS[languageChoice] || languageChoice
                      : t("languageAuto")}
                  </span>
                  <TI.ChevronDown
                    className={`tabler-icon w-4 h-4 transition-transform ${languageMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <Popover
                  anchorRef={languageBtnRef}
                  open={languageMenuOpen}
                  onClose={() => setLanguageMenuOpen(false)}
                  offset={6}
                >
                  <ul
                    className="min-w-[10rem] rounded-xl border border-[var(--border-light)] bg-white dark:bg-[#222222] text-gray-800 dark:text-gray-100 shadow-xl py-1.5 overflow-hidden"
                    role="listbox"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {[
                      { value: "", label: t("languageAuto") },
                      ...SUPPORTED_LANGUAGES.map((code) => ({
                        value: code,
                        label: LANGUAGE_NATIVE_LABELS[code] || code,
                      })),
                    ].map((opt) => {
                      const selected = languageChoice === opt.value;
                      return (
                        <li key={opt.value || "auto"} role="option" aria-selected={selected}>
                          <button
                            type="button"
                            className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left transition-colors ${
                              selected
                                ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 font-semibold"
                                : "hover:bg-black/5 dark:hover:bg-white/10"
                            }`}
                            onClick={() => {
                              setLanguageMenuOpen(false);
                              handleLanguageChange(opt.value);
                            }}
                          >
                            <span>{opt.label}</span>
                            {selected && <TI.Check className="tabler-icon w-4 h-4 shrink-0" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </Popover>
              </div>
            </div>
            </SettingsSection>
          </div>
        </div>

        {/* Pinned panel footer — the app version stays anchored at the
            bottom-right of the side sheet regardless of scroll. */}
        <div className="pointer-events-none absolute bottom-2 right-3 select-none">
          <span className="text-xs text-gray-400 dark:text-gray-600 tabular-nums">
            v{__APP_VERSION__}
          </span>
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
