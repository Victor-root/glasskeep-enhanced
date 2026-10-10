import React, { useState, useEffect } from "react";
import { t, getLanguageOverride, SUPPORTED_LANGUAGES } from "../../i18n";
import { api } from "../../utils/api.js";
import { SettingsIcon, CloseIcon } from "../../icons/index.jsx";
import TI from "../../icons/editor/index.jsx";
import TypographyModal from "./TypographyModal.jsx";
import ProfileSettingsSection from "../settings/ProfileSettingsSection.jsx";
import SecuritySettingsSection from "../settings/SecuritySettingsSection.jsx";
import UiPreferencesSettingsSection from "../settings/UiPreferencesSettingsSection.jsx";
import NotificationsSettingsSection from "../settings/NotificationsSettingsSection.jsx";
import NotesSettingsSection from "../settings/NotesSettingsSection.jsx";
import DataSettingsSection from "../settings/DataSettingsSection.jsx";
import UserAiSettingsSection from "../settings/UserAiSettingsSection.jsx";
import AppUpdateSettingsSection from "../settings/AppUpdateSettingsSection.jsx";
import LanguageSettingsSection from "../settings/LanguageSettingsSection.jsx";
import { SettingsSection } from "../common/SettingsAccordion.jsx";

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
  onOpenPasskeyDomainSetting,
  setAiAssistantEnabled,
  floatingCardsEnabled,
  setFloatingCardsEnabled,
  checklistInsertPosition,
  setChecklistInsertPosition,
  checklistRemoveSectionBehavior,
  setChecklistRemoveSectionBehavior,
  edgeToEdgeLandscape,
  setEdgeToEdgeLandscape,
  edgeToEdgePortrait,
  setEdgeToEdgePortrait,
  editorToolbarMode,
  setEditorToolbarMode,
  pasteMode,
  setPasteMode,
  notificationsPosition,
  setNotificationsPosition,
  notificationsPositionMobile,
  setNotificationsPositionMobile,
  notificationsSound,
  setNotificationsSound,
  notificationsSoundTypes,
  setNotificationsSoundTypes,
  notificationsFilterTypes,
  setNotificationsFilterTypes,
  notificationsDuration,
  setNotificationsDuration,
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
  // Mobile detection — track viewport width so rows that only make
  // sense on a phone (notification position picker variant, edge-
  // to-edge landscape toggle, …) can hide / swap their UI on
  // desktop without a refresh. Matches the < 640px breakpoint used
  // for the mobile pill mount in App.jsx.
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 640,
  );
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setIsMobileViewport(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read the app info from the Android bridge each time the panel opens
      if (typeof v === "string" && v.length) setAppVersion(v);
    } catch { /* bridge unavailable: keep the default */ }
    try {
      const fd = window?.AndroidTheme?.isFdroidInstall?.();
      setInstalledFromFdroid(fd === true);
    } catch { /* bridge unavailable: keep the default */ }
    try {
      const json = window?.AndroidTheme?.getAvailableUpdate?.();
      if (typeof json === "string" && json.length) {
        const parsed = JSON.parse(json);
        if (parsed && typeof parsed === "object" && parsed.version) {
          setAvailableUpdate(parsed);
          return;
        }
      }
    } catch { /* bridge or JSON failure: treated as no update below */ }
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

  // Live cross-tab/cross-device sync: App.jsx forwards the
  // user_profile_updated SSE event here (show_on_login has no useEffect
  // of its own to re-trigger, so no echo-suppression is needed).
  React.useEffect(() => {
    const onProfileUpdated = (e) => {
      if (typeof e.detail?.show_on_login === "boolean") {
        setProfileShowOnLogin(e.detail.show_on_login);
      }
    };
    window.addEventListener("user-profile-updated", onProfileUpdated);
    return () => window.removeEventListener("user-profile-updated", onProfileUpdated);
  }, []);

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
        className={`gk-side-panel fixed top-0 right-0 z-50 h-full w-full lg:w-[32rem] flex flex-col transition-transform duration-200 ${open ? "translate-x-0 shadow-2xl" : "translate-x-full shadow-none"}`}
        style={{
          borderLeft: "1px solid var(--border-light)",
          paddingTop: "var(--safe-top)",
          paddingBottom: "var(--safe-bottom)",
          paddingRight: "var(--safe-right)",
        }}
        inert={!open}
      >
        <div className="shrink-0 p-4 flex items-center justify-between border-b border-[var(--border-light)]">
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

        <div className="gk-side-panel-scroll mobile-hide-scrollbar p-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0 flex flex-col">
          {/* Profile Section — header (icon + "Profil" title) intentionally
              omitted; the avatar block is self-explanatory. */}
          <ProfileSettingsSection
            currentUser={currentUser}
            dark={dark}
            token={token}
            onProfileUpdated={onProfileUpdated}
            showToast={showToast}
          />

          {/* Security Section — login visibility, password change,
              cross-device QR sign-in and passkeys grouped together. */}
          <div className="mb-2">
            <SettingsSection
              icon={TI.ShieldLock}
              title={t("securitySectionTitle")}
              open={openSections.security}
              onToggle={() => toggleSection("security")}
            >
            <SecuritySettingsSection
              dark={dark}
              token={token}
              currentUser={currentUser}
              encryptionEnabled={encryptionEnabled}
              instanceUnlocked={instanceUnlocked}
              showToast={showToast}
              showGenericConfirm={showGenericConfirm}
              isWebView={isWebView}
              visible={open}
              onClose={onClose}
              onChangePassword={onChangePassword}
              onOpenPasskeyDomainSetting={onOpenPasskeyDomainSetting}
              openQrScanner={openQrScanner}
              qrQuickEnabled={qrQuickEnabled}
              setQrQuickEnabled={setQrQuickEnabled}
              profileShowOnLogin={profileShowOnLogin}
              setProfileShowOnLogin={setProfileShowOnLogin}
            />
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
            <UiPreferencesSettingsSection
              token={token}
              showToast={showToast}
              isMobileViewport={isMobileViewport}
              alwaysShowSidebarOnWide={alwaysShowSidebarOnWide}
              setAlwaysShowSidebarOnWide={setAlwaysShowSidebarOnWide}
              sidebarBreakpoint={sidebarBreakpoint}
              setSidebarBreakpoint={setSidebarBreakpoint}
              edgeToEdgePortrait={edgeToEdgePortrait}
              setEdgeToEdgePortrait={setEdgeToEdgePortrait}
              edgeToEdgeLandscape={edgeToEdgeLandscape}
              setEdgeToEdgeLandscape={setEdgeToEdgeLandscape}
              floatingCardsEnabled={floatingCardsEnabled}
              setFloatingCardsEnabled={setFloatingCardsEnabled}
            />
            </SettingsSection>
          </div>

          {/* Notifications Section — every preference governing how
              in-app notifications appear: position, sound (with a
              per-category chevron sub-list), and default duration. */}
          <div className="mb-2">
            <SettingsSection
              icon={TI.Bell}
              title={t("notificationsSectionTitle")}
              open={openSections.notifications}
              onToggle={() => toggleSection("notifications")}
            >
              <NotificationsSettingsSection
                token={token}
                isMobileViewport={isMobileViewport}
                notificationsPosition={notificationsPosition}
                setNotificationsPosition={setNotificationsPosition}
                notificationsPositionMobile={notificationsPositionMobile}
                setNotificationsPositionMobile={setNotificationsPositionMobile}
                notificationsSound={notificationsSound}
                setNotificationsSound={setNotificationsSound}
                notificationsSoundTypes={notificationsSoundTypes}
                setNotificationsSoundTypes={setNotificationsSoundTypes}
                notificationsFilterTypes={notificationsFilterTypes}
                setNotificationsFilterTypes={setNotificationsFilterTypes}
                notificationsDuration={notificationsDuration}
                setNotificationsDuration={setNotificationsDuration}
              />
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
            <NotesSettingsSection
              readModeEnabled={readModeEnabled}
              setReadModeEnabled={setReadModeEnabled}
              editorToolbarMode={editorToolbarMode}
              setEditorToolbarMode={setEditorToolbarMode}
              setTypographyModalOpen={setTypographyModalOpen}
              pasteMode={pasteMode}
              setPasteMode={setPasteMode}
              checklistInsertPosition={checklistInsertPosition}
              setChecklistInsertPosition={setChecklistInsertPosition}
              checklistRemoveSectionBehavior={checklistRemoveSectionBehavior}
              setChecklistRemoveSectionBehavior={setChecklistRemoveSectionBehavior}
            />
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
            <DataSettingsSection
              dark={dark}
              onClose={onClose}
              onExportAll={onExportAll}
              onImportAll={onImportAll}
              onImportGKeep={onImportGKeep}
              onImportMd={onImportMd}
              onDownloadSecretKey={onDownloadSecretKey}
              onOpenResetNoteOrder={() => {
                setOverridePositions(true);
                setResetDialogOpen(true);
              }}
            />
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
                <AppUpdateSettingsSection
                  dark={dark}
                  appVersion={appVersion}
                  installedFromFdroid={installedFromFdroid}
                  availableUpdate={availableUpdate}
                  setAvailableUpdate={setAvailableUpdate}
                />
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
            <LanguageSettingsSection
              token={token}
              showToast={showToast}
              languageChoice={languageChoice}
              setLanguageChoice={setLanguageChoice}
            />
            </SettingsSection>
          </div>

          {/* App version — last element of the scrollable flow. mt-auto
              pins it to the bottom-right while the settings fit without
              scrolling (e.g. all sections collapsed); once the expanded
              sections overflow, mt-auto collapses to 0 and the badge flows
              to the very end, scrolling off-screen until you reach the
              bottom. */}
          <div className="mt-auto pt-6 flex justify-end pointer-events-none select-none">
            <span className="text-xs text-gray-400 dark:text-gray-600 tabular-nums">
              v{__APP_VERSION__}
            </span>
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
                className="w-4 h-4 rounded border-gray-300 text-[var(--gk-chrome-accent)] focus:ring-[var(--gk-chrome-accent)]"
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
