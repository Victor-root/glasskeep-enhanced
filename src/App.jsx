import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { t } from "./i18n";
import { deleteNote as idbDeleteNote } from "./sync/localDb.js";
import { normalizeTypographyPresets } from "./utils/typographyPresets.js";
import { globalCSS } from "./styles/globalCSS.js";
import { ALL_IMAGES, REMINDERS } from "./utils/constants.js";
import TooltipPortal from "./components/common/TooltipPortal.jsx";
import AuthShell from "./components/auth/AuthShell.jsx";
import LoginView from "./components/auth/LoginView.jsx";
import RegisterView from "./components/auth/RegisterView.jsx";
import SecretLoginView from "./components/auth/SecretLoginView.jsx";
import ChangePasswordModal from "./components/auth/ChangePasswordModal.jsx";
import TagSidebar from "./components/panels/TagSidebar.jsx";
import SettingsPanel from "./components/panels/SettingsPanel.jsx";
import AdminPanel from "./components/panels/AdminPanel.jsx";
import FederationInviteWatcher from "./components/admin/federation/FederationInviteWatcher.jsx";
import SelfUpdateProgress from "./components/admin/SelfUpdateProgress.jsx";
import ChangelogModal from "./components/admin/ChangelogModal.jsx";
import { consumeChangelogShowFlag, onOpenChangelogRequest } from "./components/admin/changelogFlags.js";
import AdminView from "./components/notes/AdminView.jsx";
import NotesUI from "./components/notes/NotesUI.jsx";
import GenericConfirmDialog from "./components/common/GenericConfirmDialog.jsx";
import NotificationViewport from "./components/notifications/NotificationViewport.jsx";
import NotificationMobileToast from "./components/notifications/NotificationMobileToast.jsx";
import NotificationBell from "./components/notifications/NotificationBell.jsx";
import QrScannerModal from "./components/auth/QrScannerModal.jsx";
import FloatingCardsBackground from "./components/common/FloatingCardsBackground.jsx";
import NoteModal from "./components/modal/NoteModal.jsx";
import SecondaryNoteInstance from "./components/modal/SecondaryNoteInstance.jsx";
import useModalState from "./hooks/useModalState.js";
import useTouchScrollbars from "./hooks/useTouchScrollbars.js";
import useNoteSaveState from "./hooks/useNoteSaveState.js";
import useAdminActions from "./hooks/useAdminActions.js";
import { useBranding } from "./branding/BrandingContext.jsx";
import useImportExport from "./hooks/useImportExport.js";
import useCollaboration from "./hooks/useCollaboration.js";
import useKeyboardInset from "./hooks/useKeyboardInset.js";
import useNoteAiChat from "./hooks/useNoteAiChat.js";
import useUserPreferences from "./hooks/useUserPreferences.js";
import useAppNotifications from "./hooks/useAppNotifications.js";
import useServerUpdate from "./hooks/useServerUpdate.js";
import useHashRoute from "./hooks/useHashRoute.js";
import useDarkMode from "./hooks/useDarkMode.js";
import useWindowSize from "./hooks/useWindowSize.js";
import usePublicLoginInfo from "./hooks/usePublicLoginInfo.js";
import useInstanceLock from "./hooks/useInstanceLock.js";
import useSession from "./hooks/useSession.js";
import useAuthActions from "./hooks/useAuthActions.js";
import useAiSearch from "./hooks/useAiSearch.js";
import useMultiSelect from "./hooks/useMultiSelect.js";
import useBulkActions from "./hooks/useBulkActions.js";
import useLogoLibrary from "./hooks/useLogoLibrary.js";
import useOverlayBackStack from "./hooks/useOverlayBackStack.js";
import useSideBySide from "./hooks/useSideBySide.js";
import useLaunchShortcuts from "./hooks/useLaunchShortcuts.js";
import useNoteDeepLinks from "./hooks/useNoteDeepLinks.js";
import useAndroidReminderBridge from "./hooks/useAndroidReminderBridge.js";
import useNoteEditor from "./hooks/useNoteEditor.js";
import useNoteActions from "./hooks/useNoteActions.js";
import usePrimaryNoteModal from "./hooks/usePrimaryNoteModal.js";
import useNoteReorder from "./hooks/useNoteReorder.js";
import useNoteFilters from "./hooks/useNoteFilters.js";
import { initialTagsForNewNote } from "./utils/noteFilters.js";
import { runNotificationAction } from "./utils/notificationActions.js";
import useLocalLeases from "./sync/useLocalLeases.js";
import useNoteSync from "./sync/useNoteSync.js";
import useNotesLoader from "./sync/useNotesLoader.js";
import useServerEvents from "./sync/useServerEvents.js";
import { reconcileSyncResult } from "./sync/reconcileSyncResult.js";
import { patchNotes } from "./sync/remoteNotePatches.js";
import { dispatchServerEvent } from "./sync/dispatchServerEvent.js";
import { useStableCallback } from "./hooks/useStableCallback.js";
import InstanceUnlockScreen from "./components/lock/InstanceUnlockScreen.jsx";
import LockedBanner from "./components/lock/LockedBanner.jsx";
import { GRADIENT_BUTTON_CLASSES } from "./components/common/fieldClasses.js";

/** ---------- App ---------- */
export default function App() {
  const { route, navigate } = useHashRoute();

  const session = useSession({ navigate });
  const {
    token, currentUser, sessionId, currentUserRef,
    mustChangePassword, setMustChangePassword,
    applyProfileUpdate, completeLogin, applyPasswordChange,
  } = session;

  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const { windowWidth, windowHeight } = useWindowSize();
  const isMobileDevice = Math.min(windowWidth, windowHeight) < 500;
  const isLandscapeMobile = windowWidth > windowHeight && windowHeight < 500;

  // Detect Android WebView (APK): force mobile layout on tablets
  const isWebView = !!window.AndroidTheme;

  useKeyboardInset();

  // Notes & search
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState("");

  // Local-first sync: leases protecting unsent local changes, the sync
  // engine and its queue.
  const leases = useLocalLeases();
  const {
    acquireLocalLease, releaseLocalLease, releaseLocalLeaseWithPrune,
    isNoteLocallyProtected, addDeleteTombstone,
  } = leases;
  const {
    syncStatus, syncEngineRef, reloadCurrentViewRef,
    triggerSync, handleSyncNow, enqueueAndSync, enqueueWithLease, resetSync,
  } = useNoteSync({
    token,
    userId: currentUser?.id,
    sessionId,
    leases,
    onSyncComplete: (item, result) => reconcileSyncResult(item, result, {
      userId: currentUser?.id,
      sessionId,
      viewFilter: () => tagFilterRef.current,
      setNotes,
      leases,
      onNoteGone: closeNoteIfOpen,
      reloadCurrentView: () => reloadCurrentViewRef.current?.(),
    }),
    // 403 on a mutation: access was revoked while offline (the live event
    // was missed). The engine already purged the queue; drop the note
    // everywhere else.
    onNoteInaccessible: async (noteId) => {
      const nid = String(noteId);
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      idbDeleteNote(nid, currentUser?.id, sessionId).catch(() => {});
      leases.forgetNote(nid);
      closeNoteIfOpen(nid);
    },
  });

  // Tag filter & sidebar
  const [tagFilter, setTagFilter] = useState(null); // null = all, ALL_IMAGES = only notes with images
  const tagFilterRef = useRef(tagFilter);
  const [activeTagFilters, setActiveTagFilters] = useState([]); // multi-tag filter
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarHidden, setDesktopSidebarHidden] = useState(false);
  const {
    alwaysShowSidebarOnWide, setAlwaysShowSidebarOnWide,
    sidebarBreakpoint, setSidebarBreakpoint,
    readModeEnabled, setReadModeEnabled,
    sidebarWidth, setSidebarWidth,
    floatingCardsEnabled, setFloatingCardsEnabled,
    checklistInsertPosition, setChecklistInsertPosition,
    checklistRemoveSectionBehavior, setChecklistRemoveSectionBehavior,
    edgeToEdgeLandscape, setEdgeToEdgeLandscape,
    edgeToEdgePortrait, setEdgeToEdgePortrait,
    editorToolbarMode, setEditorToolbarMode,
    pasteMode, setPasteMode,
    notificationsPosition, setNotificationsPosition,
    notificationsPositionMobile, setNotificationsPositionMobile,
    notificationsSound, setNotificationsSound,
    notificationsSoundTypes, setNotificationsSoundTypes,
    notificationsFilterTypes, setNotificationsFilterTypes,
    notificationsDuration, setNotificationsDuration,
    typographyPresets, setTypographyPresets,
    reminderTimeChips, handleReminderTimeChipsChange,
    listView, onToggleViewMode,
    qrQuickEnabled, setQrQuickEnabled,
    applyRemoteUserSettings,
  } = useUserPreferences(token);
  // Per-section expansion state for the Settings side sheet. NOT
  // persisted: every time the user closes and reopens the panel,
  // categories should be fully collapsed again. The reset happens
  // in a small effect below that watches settingsPanelOpen flipping
  // to false.
  const [settingsOpenSections, setSettingsOpenSections] = useState({});
  // Same for the Admin panel.
  const [adminOpenSections, setAdminOpenSections] = useState({});
  // Set when the admin panel is opened from the passkey notice, so the
  // domain row can point itself out on arrival. Cleared once it has.
  const [highlightPasskeyDomain, setHighlightPasskeyDomain] = useState(false);
  // ─── Ref for closeModal (passed to useModalState for Escape handler) ───
  const closeModalRef = useRef(null);

  // ─── Modal state (hook) ───
  const modalState = useModalState({ notes, currentUser, closeModalRef });
  const {
    open, setOpen,
    activeId, setActiveId,
    mType,
    mTitle, setMTitle,
    mBody, setMBody,
    mTagList, setMTagList,
    tagInput, setTagInput,
    modalTagFocused, setModalTagFocused,
    mColor, setMColor,
    viewMode, setViewMode,
    mImages, setMImages,
    savingModal,
    confirmDeleteOpen, setConfirmDeleteOpen,
    isModalClosing, setIsModalClosing,
    mItems, setMItems,
    mDrawingData, setMDrawingData,
    showModalFmt, setShowModalFmt,
    showModalColorPop, setShowModalColorPop,
    modalKebabOpen, setModalKebabOpen,
    imageMenuOpen, setImageMenuOpen,
    logoPickerOpen, setLogoPickerOpen,
    imgViewOpen, setImgViewOpen, imgViewIndex,
    mobileNavVisible,
    modalScrollable,
    // Refs
    modalTagInputRef, modalTagBtnRef, suppressTagBlurRef,
    mBodyRef, modalFileRef, modalIconFileRef, modalFmtBtnRef, modalColorBtnRef,
    scrimClickStartRef,
    noteViewRef, modalScrollRef, savedModalScrollRatioRef,
    // Derived
    activeNoteObj, editedStamp, modalHasChanges,
    // Tag helpers
    addTags, handleTagKeyDown, handleTagBlur, handleTagPaste,
    // Image viewer
    openImageViewer, closeImageViewer, nextImage, prevImage, resetMobileNav,
    // Handlers
    onModalBodyClick, isCollaborativeNote,
  } = modalState;
  const noteSaveState = useNoteSaveState(open ? activeId : null, modalHasChanges, syncStatus);

  // Per-note AI chat panel. In side-by-side mode the panel takes over the
  // opposite pane's slot, so the shell follows its open/close.
  const noteAi = useNoteAiChat({
    open,
    activeId,
    note: { mTitle, mType, mTagList, mItems, mDrawingData, mBody },
    onOpen: () => {
      if (sbsSecondaryId) setSbsAiActiveSide("left");
    },
    onClose: () => {
      // Keep the SBS body class alive for the AI close animation so the
      // panel can slide out before the opposite note reappears.
      if (sbsAiActiveSide === "left") scheduleSbsAiClear();
    },
  });
  const { noteAiOpen, setNoteAiOpen } = noteAi;

  // Reminder picker open state: lifted here (not in ModalFooter) so it joins
  // the central overlay stack: the Android back button closes it and the
  // mobile full-screen panel pushes/pops a history entry like every other
  // overlay.
  const [reminderPopOpen, setReminderPopOpen] = useState(false);
  // Never leave the reminder picker "open" behind a closed note modal.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- close the reminder picker whenever the note modal closes, whatever closed it
  useEffect(() => { if (!open) setReminderPopOpen(false); }, [open]);

  // Generic confirmation dialog
  const [genericConfirmOpen, setGenericConfirmOpen] = useState(false);
  const [genericConfirmConfig, setGenericConfirmConfig] = useState({});

  // Cross-device QR sign-in: the in-app camera + approve flow. Opened
  // from two places (Settings row + optional header quick-access
  // button) so the modal is hoisted to App and the callback is
  // threaded down. The "show header button" preference is just a
  // boolean localStorage flag; we mirror it into React state so
  // toggling the switch in Settings flips the header without a reload.
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const openQrScanner = useCallback(() => setQrScannerOpen(true), []);
  const closeQrScanner = useCallback(() => setQrScannerOpen(false), []);

  // ChangelogModal open state is lifted here (instead of inside the
  // component) so it can be registered with the central Android
  // back-button stack (useOverlayBackStack below).
  // Without lifting, pressing back on Android while the changelog was
  // open backgrounded the entire app.
  const [changelogOpen, setChangelogOpen] = useState(false);
  const closeChangelog = useCallback(() => setChangelogOpen(false), [setChangelogOpen]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads and clears a one-shot flag, kept out of render because of that side effect
    if (consumeChangelogShowFlag()) setChangelogOpen(true);
  }, []);
  useEffect(() => onOpenChangelogRequest(() => setChangelogOpen(true)), []);
  const {
    notify,
    showToast,
    allNotifications,
    dismissNotification,
    removeNotification,
    dismissByServerIds: dismissByServerIdsNotif,
    removeByServerIds: removeByServerIdsNotif,
    clearServerBackedNotifications,
    clearAllNotificationsSynced,
    showShareToast: showShareNotificationToast,
    showRevokeToast: showRevokeNotificationToast,
    showPendingUserToast,
    showUserDeletedToast,
  } = useAppNotifications({
    token,
    userId: currentUser?.id,
    notificationsDuration,
    notificationsFilterTypes,
    notificationsSound,
    notificationsSoundTypes,
  });

  // Generic confirmation dialog helper
  const showGenericConfirm = (config) => {
    setGenericConfirmConfig(config);
    setGenericConfirmOpen(true);
  };

  const { updateInfo, selfUpdate } = useServerUpdate({ token, currentUser, notify });

  // Header menu refs + state
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef(null);
  const headerBtnRef = useRef(null);
  const importFileRef = useRef(null);
  const gkeepFileRef = useRef(null);
  const mdFileRef = useRef(null);

  // FAB open state (lifted for Android back button support)
  const [fabOpen, setFabOpen] = useState(false);

  const {
    multiMode, setMultiMode,
    selectedIds, setSelectedIds,
    onStartMulti, onExitMulti, onToggleSelect, onCtrlSelect, onSelectAll,
  } = useMultiSelect({ setFabOpen });

  const {
    aiAssistantEnabled, setAiAssistantEnabled,
    aiResponse, setAiResponse,
    aiCitedNoteIds, setAiCitedNoteIds,
    isAiLoading,
    aiLoadingProgress,
    handleAiSearch,
  } = useAiSearch({ token, notes });

  // Instance branding (custom app name / logo / login background +
  // blur). The provider owns the fetch; we only need refreshBranding to
  // re-pull after an admin saves so the live header / next login render
  // the new values without a reload.
  const { refreshBranding } = useBranding();

  const { allowRegistration, loginSlogan, setLoginSlogan, loginProfiles } = usePublicLoginInfo();

  // Admin panel state (hook)
  const {
    adminPanelOpen, setAdminPanelOpen,
    adminSettings,
    allUsers,
    pendingUsers,
    newUserForm, setNewUserForm,
    updateAdminSettings, createUser, deleteUser, updateUser,
    loadAdminSettings, loadAllUsers,
    loadPendingUsers, approvePendingUser, rejectPendingUser,
    openAdminPanel,
  } = useAdminActions(token, {
    onSettingsUpdated: (settings) => {
      if (typeof settings.loginSlogan === 'string') setLoginSlogan(settings.loginSlogan);
      // Branding (name/logo/background/blur) may have changed too:
      // re-pull the public branding so the live app reflects it.
      refreshBranding();
    },
  });

  const {
    instanceLockStatus,
    refreshLockStatus,
    isLocked,
    lockBannerDismissed,
    setLockBannerDismissed,
    lockOverlayOpen,
    setLockOverlayOpen,
    lockInstanceNow,
  } = useInstanceLock({ token, showToast });

  // Settings panel state
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  // Reset Settings / Admin section accordions whenever the panel
  // closes so the next open lands fully collapsed regardless of
  // what the user had expanded last time. NOT persisted: the panels
  // are deliberately ephemeral in their layout.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- collapse the sections whenever the panel closes, whatever closed it
    if (!settingsPanelOpen) setSettingsOpenSections({});
  }, [settingsPanelOpen]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- collapse the sections whenever the panel closes, whatever closed it
    if (!adminPanelOpen) setAdminOpenSections({});
  }, [adminPanelOpen]);
  // Lifted from SettingsPanel so the centralised overlay back-button
  // stack (and the safe-area-aware scrim) can react to the typography
  // sub-modal opening / closing.
  const [typographyModalOpen, setTypographyModalOpen] = useState(false);

  // Notification center open state. The actual open/closed state lives
  // inside NotificationBell (local, to avoid the desktop+mobile bell
  // duplicating the panel). The bell reports its state up via
  // onOpenChange and exposes a close handle via closeNotifBellRef so
  // App.jsx can include it in the overlay back stack (pull-to-refresh
  // lock + Android back button).
  const [notifCenterOpen, setNotifCenterOpen] = useState(false);
  const closeNotifBellRef = useRef(null);

  // Sync dropdown state (lifted for back button support)
  const [syncDropdownOpen, setSyncDropdownOpen] = useState(false);

  // Mobile search expand (lifted for back button support)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  useEffect(() => {
    // Only close header kebab on outside click (modal kebab is handled by Popover)
    function onDocClick(e) {
      if (headerMenuOpen) {
        const m = headerMenuRef.current;
        const b = headerBtnRef.current;
        if (m && m.contains(e.target)) return;
        if (b && b.contains(e.target)) return;
        setHeaderMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [headerMenuOpen]);

  // CSS inject
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = globalCSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
  useTouchScrollbars();

  // After the stylesheet injection above: the status bar colour is read
  // from its CSS tokens.
  const { dark, toggleDark } = useDarkMode();

  // Close sidebar with Escape
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  const { notesLoading, notesAreRegular, loadNotes } = useNotesLoader({
    token,
    userId: currentUser?.id,
    sessionId,
    tagFilter,
    tagFilterRef,
    setNotes,
    syncEngineRef,
    reloadCurrentViewRef,
    leases,
  });

  // Live server events. Taken from the render that opens the connection.
  useServerEvents({
    token,
    syncStatus,
    syncEngineRef,
    reloadCurrentViewRef,
    triggerSync,
    patchNotes: (ids) => patchNotes(ids, {
      token,
      userId: currentUser?.id,
      sessionId,
      viewFilter: () => tagFilterRef.current,
      setNotes,
      leases,
    }),
    onMessage: (msg, tools) => dispatchServerEvent(msg, tools, {
      token,
      userId: currentUser?.id,
      sessionId,
      isAdmin: () => currentUserRef.current?.is_admin,
      viewFilter: () => tagFilterRef.current,
      setNotes,
      leases,
      reloadCurrentView: () => reloadCurrentViewRef.current?.(),
      onNoteGone: closeNoteIfOpen,
      setLogoLibrary,
      notify,
      showShareToast: showShareNotificationToast,
      showRevokeToast: showRevokeNotificationToast,
      showPendingUserToast,
      showUserDeletedToast,
      clearServerBackedNotifications,
      dismissByServerIds: dismissByServerIdsNotif,
      removeByServerIds: removeByServerIdsNotif,
      loadPendingUsers,
      loadAllUsers,
      loadAdminSettings,
      refreshBranding,
      applyRemoteUserSettings,
      applyProfileUpdate,
    }),
  });

  const editor = useNoteEditor({
    modal: modalState,
    notes,
    setNotes,
    currentUser,
    sessionId,
    readModeEnabled,
    setSidebarOpen,
    getInitialTags: () => initialTagsForNewNote(tagFilter, activeTagFilters),
    acquireLocalLease,
    releaseLocalLease,
    releaseLocalLeaseWithPrune,
    isNoteLocallyProtected,
    enqueueAndSync,
    enqueueWithLease,
  });
  const {
    initialDrawMode, setInitialDrawMode,
    handleDirectText, handleDirectChecklist, handleDirectDraw, handleDirectAudio,
    flushPendingDrawingSave, syncChecklistItems,
  } = editor;

  const { signOut, signIn, signInById, signInWithSecret, register, oidcLoginError } = useAuthActions({
    token,
    session,
    navigate,
    showToast,
    resetSync,
    setNotes,
  });

  // Pre-load pending registrations count when an admin is logged in
  useEffect(() => {
    if (token && currentUser?.is_admin) {
      loadPendingUsers?.();
    }
  }, [token, currentUser?.is_admin, loadPendingUsers]);

  const openSettingsPanel = () => {
    setSettingsPanelOpen(true);
  };

  // Import/Export actions (hook)
  const { exportAll, importAll, importGKeep, importMd, downloadSecretKey } =
    useImportExport(token, { currentUser, loadNotes });

  // Collaboration actions (hook)
  const {
    collaborationModalOpen, setCollaborationModalOpen,
    addModalCollaborators,
    removeCollaborator,
    loadCollaboratorsForAddModal,
    addCollaboratorsBatch,
    setCollaboratorAccess,
    availableUsers,
    availableLoading,
  } = useCollaboration(token, {
    currentUser, activeId,
    showToast,
  });

  const {
    logoLibrary, setLogoLibrary,
    addLogoToLibrary, deleteLogoFromLibrary,
    applyNoteIcon, setNoteIconFromFile, removeNoteIcon, pickNoteIcon,
  } = useLogoLibrary({ token, currentUser, sessionId, setNotes, activeId });

  const {
    onBulkDelete, onEmptyTrash, onBulkPin, onBulkRestore, onBulkArchive,
    onBulkColor, onBulkSetIcon, onBulkAddLogoFromFile, onBulkDownloadZip,
  } = useBulkActions({
    notes,
    setNotes,
    selectedIds,
    onExitMulti,
    tagFilter,
    setTagFilter,
    currentUser,
    sessionId,
    acquireLocalLease,
    addDeleteTombstone,
    enqueueWithLease,
    showGenericConfirm,
    showToast,
    applyNoteIcon,
    addLogoToLibrary,
  });

  useLaunchShortcuts({
    token,
    openQrScanner,
    handleDirectText,
    handleDirectChecklist,
    handleDirectAudio,
  });

  // Set once the side-by-side right pane has closed: the surviving primary
  // modal's opening animation must not replay (a tiny close/reopen flash
  // on mobile). Cleared whenever a note opens or the modal closes.
  const [sbsSuppressOpenReplay, setSbsSuppressOpenReplay] = useState(false);

  const { openModal, closeNoteIfOpen, animateClose } = usePrimaryNoteModal({
    modal: modalState,
    editor,
    noteAi,
    notes,
    setSidebarOpen,
    setSbsSuppressOpenReplay,
    allNotifications,
    dismissNotification,
    releaseLocalLease,
  });

  const {
    closeModal, saveModal, deleteModal, restoreFromTrash,
    handleArchiveNote, togglePin, setNoteReminder, convertNoteType, duplicateActiveNote,
    handleDownloadNote, addImagesToState,
  } = useNoteActions({
    modal: modalState,
    editor,
    notes,
    setNotes,
    currentUser,
    sessionId,
    tagFilter,
    setTagFilter,
    acquireLocalLease,
    releaseLocalLeaseWithPrune,
    addDeleteTombstone,
    enqueueAndSync,
    enqueueWithLease,
    showToast,
    showGenericConfirm,
    applyNoteIcon,
    finishClose: animateClose,
  });

  // Re-created each render so it always uses the latest openModal.
  const handleNotificationAction = (notif, chosenAction) => runNotificationAction(notif, chosenAction, {
    token,
    approvePendingUser,
    rejectPendingUser,
    selfUpdate,
    openModal,
    showToast,
    showGenericConfirm,
    removeNotification,
    dismissNotification,
  });

  useNoteDeepLinks({ notes, openModal });

  const {
    sbsActive, sbsSecondaryId, sbsClosingSide, sbsBothClosing,
    sbsHandoffNoTransition,
    sbsAiActiveSide, setSbsAiActiveSide, scheduleSbsAiClear,
    onOpenSideBySide, requestCloseLeftPaneSBS, onSbsRightClosing,
    onSecondaryAiOpen, onSecondaryAiClose, closeBothSBS,
  } = useSideBySide({
    openModal,
    setSbsSuppressOpenReplay,
    setMultiMode,
    setSelectedIds,
    setSidebarOpen,
    mType,
    flushPendingDrawingSave,
    setOpen,
    setActiveId,
    setViewMode,
    setConfirmDeleteOpen,
    setShowModalFmt,
    setIsModalClosing,
  });

  // Overlays in closing priority for the back button, topmost first.
  useOverlayBackStack([
    { open: qrScannerOpen, close: closeQrScanner },
    { open: imgViewOpen, close: () => setImgViewOpen(false) },
    { open: changelogOpen, close: () => setChangelogOpen(false) },
    { open: confirmDeleteOpen, close: () => setConfirmDeleteOpen(false) },
    { open: genericConfirmOpen, close: () => setGenericConfirmOpen(false) },
    { open: collaborationModalOpen, close: () => setCollaborationModalOpen(false) },
    { open: showModalColorPop, close: () => setShowModalColorPop(false) },
    { open: showModalFmt, close: () => setShowModalFmt(false) },
    { open: modalKebabOpen, close: () => setModalKebabOpen(false) },
    { open: logoPickerOpen, close: () => setLogoPickerOpen(false) },
    { open: imageMenuOpen, close: () => setImageMenuOpen(false) },
    { open: reminderPopOpen, close: () => setReminderPopOpen(false) },
    { open: modalTagFocused, close: () => setModalTagFocused(false) },
    // The AI panel lives inside the note modal: back closes it first.
    { open: noteAiOpen, close: () => setNoteAiOpen(false) },
    { open, close: () => closeModalRef.current?.() },
    { open: fabOpen, close: () => setFabOpen(false) },
    { open: notifCenterOpen, close: () => closeNotifBellRef.current?.() },
    { open: syncDropdownOpen, close: () => setSyncDropdownOpen(false) },
    { open: mobileSearchOpen, close: () => { setSearch(""); setMobileSearchOpen(false); } },
    { open: headerMenuOpen, close: () => setHeaderMenuOpen(false) },
    { open: multiMode, close: () => setMultiMode(false) },
    { open: typographyModalOpen, close: () => setTypographyModalOpen(false) },
    { open: settingsPanelOpen, close: () => setSettingsPanelOpen(false) },
    { open: adminPanelOpen, close: () => setAdminPanelOpen(false) },
    { open: sidebarOpen, close: () => setSidebarOpen(false) },
    // Closed through the panes' own close buttons.
    { open: !!sbsSecondaryId },
  ]);

  useAndroidReminderBridge({ notes, token });

  const { resetNoteOrder, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd } = useNoteReorder({
    notes,
    setNotes,
    currentUser,
    sessionId,
    acquireLocalLease,
    holdReorderLeases: leases.holdReorderLeases,
    enqueueAndSync,
    showToast,
  });

  // Stable identities for the note-card callbacks. App.jsx recreates these
  // handlers on every render; handing the raw versions to NoteCard defeats
  // its React.memo, so the whole notes grid re-renders on every modal open
  // and every keystroke in the editor: the main-thread cost the LoAF trace
  // pinned to React render tasks (fn "q") and click handlers (fn "fE").
  // useStableCallback keeps a stable identity while always invoking the
  // latest closure, so the memo holds and only the modal subtree re-renders.
  const sOpenModal = useStableCallback(openModal);
  const sTogglePin = useStableCallback(togglePin);
  const sOnDragStart = useStableCallback(onDragStart);
  const sOnDragOver = useStableCallback(onDragOver);
  const sOnDragLeave = useStableCallback(onDragLeave);
  const sOnDrop = useStableCallback(onDrop);
  const sOnDragEnd = useStableCallback(onDragEnd);
  const sOnToggleSelect = useStableCallback(onToggleSelect);
  const sOnCtrlSelect = useStableCallback(onCtrlSelect);
  const sOnEmptyTrash = useStableCallback(onEmptyTrash);

  const { tagsWithCounts, pinned, others, filteredEmptyWithSearch, allEmpty } = useNoteFilters({
    notes,
    notesAreRegular,
    search,
    tagFilter,
    activeTagFilters,
  });

  /** -------- Modal JSX -------- */
  // In SBS mode the left pane's X / scrim click no longer tears down the
  // primary modal: it just animates the left half out and hands B to
  // the centre slot. Outside SBS, fall back to the regular closeModal.
  // Back and Escape close it the same way.
  const primaryCloseModal = sbsActive ? requestCloseLeftPaneSBS : closeModal;
  // eslint-disable-next-line react-hooks/refs -- latest-value ref read by useModalState's close path, outside render
  closeModalRef.current = primaryCloseModal;

  const modal = (
    <NoteModal
      open={open}
      isModalClosing={isModalClosing || sbsBothClosing}
      splitMode={sbsActive}
      splitSide={sbsActive ? "left" : undefined}
      splitClosing={sbsActive && sbsClosingSide === "left"}
      handoffNoTransition={sbsHandoffNoTransition}
      suppressOpenReplay={sbsSuppressOpenReplay}
      aiPanelSide={sbsActive ? "right" : undefined}
      sbsOppositeHidden={sbsActive && sbsAiActiveSide === "right"}
      dark={dark}
      windowWidth={windowWidth}
      isLandscapeMobile={isLandscapeMobile}
      isWebView={isWebView}
      edgeToEdgeLandscape={edgeToEdgeLandscape}
      activeId={activeId}
      mType={mType}
      mTitle={mTitle}
      setMTitle={setMTitle}
      mBody={mBody}
      setMBody={setMBody}
      mColor={mColor}
      setMColor={setMColor}
      viewMode={viewMode}
      setViewMode={setViewMode}
      readModeEnabled={readModeEnabled}
      mImages={mImages}
      setMImages={setMImages}
      mItems={mItems}
      setMItems={setMItems}
      mDrawingData={mDrawingData}
      setMDrawingData={setMDrawingData}
      mTagList={mTagList}
      setMTagList={setMTagList}
      tagInput={tagInput}
      setTagInput={setTagInput}
      modalTagFocused={modalTagFocused}
      setModalTagFocused={setModalTagFocused}
      modalScrollRef={modalScrollRef}
      mBodyRef={mBodyRef}
      noteViewRef={noteViewRef}
      modalFileRef={modalFileRef}
      modalIconFileRef={modalIconFileRef}
      modalFmtBtnRef={modalFmtBtnRef}
      modalTagInputRef={modalTagInputRef}
      modalTagBtnRef={modalTagBtnRef}
      suppressTagBlurRef={suppressTagBlurRef}
      modalColorBtnRef={modalColorBtnRef}
      scrimClickStartRef={scrimClickStartRef}
      savedModalScrollRatioRef={savedModalScrollRatioRef}
      activeNoteObj={activeNoteObj}
      onSetReminder={setNoteReminder}
      editedStamp={editedStamp}
      modalHasChanges={modalHasChanges}
      saveState={noteSaveState}
      modalScrollable={modalScrollable}
      tagsWithCounts={tagsWithCounts}
      addTags={addTags}
      handleTagKeyDown={handleTagKeyDown}
      handleTagBlur={handleTagBlur}
      handleTagPaste={handleTagPaste}
      showModalFmt={showModalFmt}
      setShowModalFmt={setShowModalFmt}
      showModalColorPop={showModalColorPop}
      setShowModalColorPop={setShowModalColorPop}
      reminderPopOpen={reminderPopOpen}
      setReminderPopOpen={setReminderPopOpen}
      reminderTimeChips={reminderTimeChips}
      onReminderTimeChipsChange={handleReminderTimeChipsChange}
      modalKebabOpen={modalKebabOpen}
      setModalKebabOpen={setModalKebabOpen}
      imageMenuOpen={imageMenuOpen}
      setImageMenuOpen={setImageMenuOpen}
      logoPickerOpen={logoPickerOpen}
      setLogoPickerOpen={setLogoPickerOpen}
      confirmDeleteOpen={confirmDeleteOpen}
      setConfirmDeleteOpen={setConfirmDeleteOpen}
      savingModal={savingModal}
      collaborationModalOpen={collaborationModalOpen}
      setCollaborationModalOpen={setCollaborationModalOpen}
      addModalCollaborators={addModalCollaborators}
      addCollaboratorsBatch={addCollaboratorsBatch}
      availableUsers={availableUsers}
      availableLoading={availableLoading}
      removeCollaborator={removeCollaborator}
      setCollaboratorAccess={setCollaboratorAccess}
      loadCollaboratorsForAddModal={loadCollaboratorsForAddModal}
      imgViewOpen={imgViewOpen}
      imgViewIndex={imgViewIndex}
      mobileNavVisible={mobileNavVisible}
      openImageViewer={openImageViewer}
      closeImageViewer={closeImageViewer}
      nextImage={nextImage}
      prevImage={prevImage}
      resetMobileNav={resetMobileNav}
      notes={notes}
      currentUser={currentUser}
      tagFilter={tagFilter}
      onScrimClose={sbsActive ? closeBothSBS : undefined}
      closeModal={primaryCloseModal}
      saveModal={saveModal}
      deleteModal={deleteModal}
      restoreFromTrash={restoreFromTrash}
      handleArchiveNote={handleArchiveNote}
      handleDownloadNote={handleDownloadNote}
      togglePin={togglePin}
      addImagesToState={addImagesToState}
      setNoteIconFromFile={setNoteIconFromFile}
      removeNoteIcon={removeNoteIcon}
      noteIcon={activeNoteObj?.icon || null}
      onPickIcon={pickNoteIcon}
      logoLibrary={logoLibrary}
      deleteLogoFromLibrary={deleteLogoFromLibrary}
      isCollaborativeNote={isCollaborativeNote}
      syncState={syncStatus.syncState}
      onModalBodyClick={onModalBodyClick}
      syncChecklistItems={syncChecklistItems}
      checklistInsertPosition={checklistInsertPosition}
      checklistRemoveSectionBehavior={checklistRemoveSectionBehavior}
      editorToolbarMode={editorToolbarMode}
      pasteMode={pasteMode}
      onConvertNoteType={convertNoteType}
      onDuplicateNote={duplicateActiveNote}
      initialDrawMode={initialDrawMode}
      onConsumeInitialDrawMode={() => setInitialDrawMode(null)}
      // Per-note AI chat: kebab entry, panel state, send/close handlers
      aiAssistantEnabled={aiAssistantEnabled}
      {...noteAi.modalProps}
    />
  );

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser?.email && route !== "#/notes" && route !== "#/admin") {
      navigate("#/notes");
    }
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the signed-in user changes, not on every route change

  // Close sidebar when navigating away or opening modal
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the sidebar when a note opens
    if (open && !(activeTagFilters && window.matchMedia?.("(min-width: 1024px)")?.matches)) setSidebarOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when the modal opens or closes, not when the filters change
  }, [open]);

  // ---- Routing ----
  // Lock handling has two flavours:
  //  - Unauthenticated visitor on a locked server → full unlock
  //    screen. They have no local cache to fall back on and no
  //    session to keep.
  //  - Logged-in user whose server got re-locked under them → keep
  //    the app rendered with a non-intrusive banner (added later in
  //    the JSX tree). They can keep reading their local-first cache
  //    and queue edits; the banner offers a one-click unlock.
  //  - Logged-in user who explicitly clicked the banner's unlock CTA
  //    → render the unlock screen as a full overlay (lockOverlayOpen).
  if (isLocked && (!currentUser?.email || lockOverlayOpen)) {
    // The "back to offline notes" escape hatch only makes sense when
    // the user has a session AND they reached this screen by clicking
    // the LockedBanner CTA (lockOverlayOpen). A cold first-visitor who
    // has no local-first cache lands here with currentUser unset, and
    // there's no offline state to fall back to in that case.
    const canGoBackToOffline = !!currentUser?.email && lockOverlayOpen;
    return (
      <InstanceUnlockScreen
        dark={dark}
        onToggleDark={toggleDark}
        onUnlocked={(payload) => {
          // Optimistically hide the banner the moment the unlock
          // request succeeds. Without this the banner lingers for the
          // ~500 ms it takes refreshLockStatus to round-trip: long
          // enough for the user to wonder if anything actually
          // happened. The next status fetch will reset
          // lockBannerDismissed back to false in the effect above
          // (since the server reports locked=false), so the banner
          // is ready to show again the next time the server locks.
          setLockBannerDismissed(true);
          setLockOverlayOpen(false);
          refreshLockStatus();
          // Passkey unlock returns { ok, token, user, ... }: when the
          // server signs the admin in alongside the unlock, install
          // the session through the same path password login uses so
          // the user lands on /notes already authenticated. The
          // passphrase / recovery-key flows return only { ok } and
          // skip this branch.
          if (payload && payload.token && payload.user) {
            completeLogin(payload);
          }
        }}
        onBackToOffline={canGoBackToOffline ? () => setLockOverlayOpen(false) : undefined}
      />
    );
  }

  if (route === "#/admin") {
    if (!currentUser?.email) {
      return (
        <AuthShell title={t("adminPanel")} dark={dark} onToggleDark={toggleDark}>
          <p className="text-sm mb-4">{t("mustSignInAdmin")}</p>
          <button
            className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${GRADIENT_BUTTON_CLASSES}`}
            onClick={() => (window.location.hash = "#/login")}
          >{t("goToSignIn")}</button>
        </AuthShell>
      );
    }
    if (!currentUser?.is_admin) {
      return (
        <AuthShell title={t("adminPanel")} dark={dark} onToggleDark={toggleDark}>
          <p className="text-sm">{t("notAuthorizedAdmin")}</p>
          <button
            className="mt-4 px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => (window.location.hash = "#/notes")}
          >{t("backToNotes")}</button>
        </AuthShell>
      );
    }
    return (
      <AdminView
        showGenericConfirm={showGenericConfirm}
      />
    );
  }

  if (!currentUser?.email) {
    if (route === "#/register") {
      return (
        <RegisterView
          dark={dark}
          onToggleDark={toggleDark}
          onRegister={register}
          goLogin={() => navigate("#/login")}
          floatingCardsEnabled={true}
          loginSlogan={loginSlogan}
        />
      );
    }
    if (route === "#/login-secret") {
      return (
        <SecretLoginView
          dark={dark}
          onToggleDark={toggleDark}
          onLoginWithKey={signInWithSecret}
          goLogin={() => navigate("#/login")}
          floatingCardsEnabled={true}
          loginSlogan={loginSlogan}
        />
      );
    }
    return (
      <LoginView
        dark={dark}
        onToggleDark={toggleDark}
        onLogin={signIn}
        onLoginById={signInById}
        onPasskeyLogin={completeLogin}
        oidcError={oidcLoginError}
        goRegister={() => navigate("#/register")}
        goSecret={() => navigate("#/login-secret")}
        allowRegistration={allowRegistration}
        floatingCardsEnabled={true}
        loginSlogan={loginSlogan}
        loginProfiles={loginProfiles}
      />
    );
  }

  return (
    <>
      <TooltipPortal />
      {/* Server is at-rest-locked under the user's feet. Render a
          non-intrusive banner instead of yanking them off their
          local cache; they can keep reading and queueing edits, and
          one click on the CTA opens the full unlock screen.
          The banner is rendered in normal flow so it pushes the
          header down (no overlap) and scrolls away with the page.
          When the permanent sidebar is pinned we offset the banner
          by sidebarWidth so it starts at the right edge of the
          sidebar: same horizontal alignment as the main content. */}
      {isLocked && currentUser?.email && !lockBannerDismissed && !lockOverlayOpen && (
        <LockedBanner
          onUnlock={() => setLockOverlayOpen(true)}
          onDismiss={() => setLockBannerDismissed(true)}
          sidebarOffset={
            alwaysShowSidebarOnWide && windowWidth >= sidebarBreakpoint && !isMobileDevice && !desktopSidebarHidden
              ? sidebarWidth
              : 0
          }
        />
      )}
      {floatingCardsEnabled && <FloatingCardsBackground />}
      {/* Tag Sidebar / Drawer */}
      <TagSidebar
        open={sidebarOpen}
        onClose={() => {
          if (alwaysShowSidebarOnWide && windowWidth >= sidebarBreakpoint && !isMobileDevice) {
            setDesktopSidebarHidden(true);
          } else {
            setSidebarOpen(false);
          }
        }}
        tagsWithCounts={tagsWithCounts}
        activeTag={tagFilter}
        activeTagFilters={activeTagFilters}
        onSelect={(tag, event) => {
          if (tag === "ARCHIVED" || tag === "TRASHED" || tag === ALL_IMAGES || tag === REMINDERS || tag === null) {
            // Only clear notes when SWITCHING views, not when re-clicking the same one.
            // REMINDERS is a client-side lens over the already-loaded regular
            // notes, so it deliberately does NOT clear/reload like archive/trash.
            if ((tag === "ARCHIVED" || tag === "TRASHED") && tag !== tagFilter) setNotes([]);
            setTagFilter(tag);
            setActiveTagFilters([]);
          } else if (event?.ctrlKey || event?.metaKey) {
            // Ctrl/Cmd+clic : multi-select (toggle)
            setTagFilter(null);
            setActiveTagFilters((prev) =>
              prev.includes(tag)
                ? prev.filter((t) => t !== tag)
                : [...prev, tag]
            );
          } else {
            // Clic simple : filtre unique (re-clic = désélectionne)
            setTagFilter(null);
            setActiveTagFilters((prev) =>
              prev.length === 1 && prev[0] === tag ? [] : [tag]
            );
          }
        }}
        dark={dark}
        permanent={alwaysShowSidebarOnWide && windowWidth >= sidebarBreakpoint && !isMobileDevice && !desktopSidebarHidden}
        width={sidebarWidth}
        onResize={setSidebarWidth}
      />

      {/* Settings Panel */}
      <SettingsPanel
        open={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        dark={dark}
        encryptionEnabled={!!instanceLockStatus?.enabled}
        instanceUnlocked={!!instanceLockStatus?.unlocked}
        onExportAll={exportAll}
        onImportAll={() => importFileRef.current?.click()}
        onImportGKeep={() => gkeepFileRef.current?.click()}
        onImportMd={() => mdFileRef.current?.click()}
        onDownloadSecretKey={downloadSecretKey}
        alwaysShowSidebarOnWide={alwaysShowSidebarOnWide}
        setAlwaysShowSidebarOnWide={setAlwaysShowSidebarOnWide}
        sidebarBreakpoint={sidebarBreakpoint}
        setSidebarBreakpoint={setSidebarBreakpoint}
        readModeEnabled={readModeEnabled}
        setReadModeEnabled={setReadModeEnabled}
        openSections={settingsOpenSections}
        setOpenSections={setSettingsOpenSections}
        // Shortcut out of the passkey section for an admin who is told the
        // instance has no confirmed domain: closes these settings and opens
        // the admin panel with the section holding that field already
        // unfolded, rather than making them go hunting for it.
        onOpenPasskeyDomainSetting={() => {
          setSettingsPanelOpen(false);
          setAdminOpenSections({ site: true });
          setHighlightPasskeyDomain(true);
          openAdminPanel();
        }}
        setAiAssistantEnabled={setAiAssistantEnabled}
        floatingCardsEnabled={floatingCardsEnabled}
        setFloatingCardsEnabled={setFloatingCardsEnabled}
        checklistInsertPosition={checklistInsertPosition}
        setChecklistInsertPosition={setChecklistInsertPosition}
        checklistRemoveSectionBehavior={checklistRemoveSectionBehavior}
        setChecklistRemoveSectionBehavior={setChecklistRemoveSectionBehavior}
        edgeToEdgeLandscape={edgeToEdgeLandscape}
        setEdgeToEdgeLandscape={setEdgeToEdgeLandscape}
        edgeToEdgePortrait={edgeToEdgePortrait}
        setEdgeToEdgePortrait={setEdgeToEdgePortrait}
        editorToolbarMode={editorToolbarMode}
        setEditorToolbarMode={setEditorToolbarMode}
        pasteMode={pasteMode}
        setPasteMode={setPasteMode}
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
        typographyPresets={typographyPresets}
        setTypographyPresets={(next) => setTypographyPresets(normalizeTypographyPresets(next))}
        typographyModalOpen={typographyModalOpen}
        setTypographyModalOpen={setTypographyModalOpen}
        showGenericConfirm={showGenericConfirm}
        showToast={showToast}
        isWebView={isWebView}
        onResetNoteOrder={resetNoteOrder}
        currentUser={currentUser}
        token={token}
        onProfileUpdated={applyProfileUpdate}
        onChangePassword={() => setChangePasswordOpen(true)}
        openQrScanner={openQrScanner}
        qrQuickEnabled={qrQuickEnabled}
        setQrQuickEnabled={setQrQuickEnabled}
      />

      {/* Admin Panel */}
      <AdminPanel
        open={adminPanelOpen}
        onClose={() => setAdminPanelOpen(false)}
        dark={dark}
        highlightPasskeyDomain={highlightPasskeyDomain}
        onPasskeyDomainHighlighted={() => setHighlightPasskeyDomain(false)}
        openSections={adminOpenSections}
        setOpenSections={setAdminOpenSections}
        adminSettings={adminSettings}
        allUsers={allUsers}
        pendingUsers={pendingUsers}
        newUserForm={newUserForm}
        setNewUserForm={setNewUserForm}
        updateAdminSettings={updateAdminSettings}
        createUser={createUser}
        deleteUser={deleteUser}
        updateUser={updateUser}
        approvePendingUser={approvePendingUser}
        rejectPendingUser={rejectPendingUser}
        currentUser={currentUser}
        showGenericConfirm={showGenericConfirm}
        showToast={showToast}
        authToken={token}
        selfUpdate={selfUpdate}
        updateInfo={updateInfo}
        syncStatus={syncStatus}
      />

      {/* Headless: surfaces incoming cross-server pairing requests as
          actionable (Accept / Decline) notifications for admins, even
          with the admin panel closed: and on next login for any that
          arrived while they were away. */}
      {currentUser?.is_admin && <FederationInviteWatcher token={token} />}

      <NotesUI
        currentUser={currentUser}
        dark={dark}
        instanceLocked={isLocked}
        toggleDark={toggleDark}
        signOut={signOut}
        onLockInstance={lockInstanceNow}
        encryptionEnabled={!!instanceLockStatus?.enabled}
        notes={notes}
        search={search}
        setSearch={setSearch}
        onDirectDraw={handleDirectDraw}
        onDirectText={handleDirectText}
        onDirectChecklist={handleDirectChecklist}
        onDirectAudio={handleDirectAudio}
        pinned={pinned}
        others={others}
        openModal={sOpenModal}
        onDragStart={sOnDragStart}
        onDragOver={sOnDragOver}
        onDragLeave={sOnDragLeave}
        onDrop={sOnDrop}
        onDragEnd={sOnDragEnd}
        togglePin={sTogglePin}
        filteredEmptyWithSearch={filteredEmptyWithSearch}
        allEmpty={allEmpty}
        onImportAll={importAll}
        onImportGKeep={importGKeep}
        onImportMd={importMd}
        importFileRef={importFileRef}
        gkeepFileRef={gkeepFileRef}
        mdFileRef={mdFileRef}
        headerMenuOpen={headerMenuOpen}
        setHeaderMenuOpen={setHeaderMenuOpen}
        headerMenuRef={headerMenuRef}
        headerBtnRef={headerBtnRef}
        openSidebar={() => {
          if (alwaysShowSidebarOnWide && windowWidth >= sidebarBreakpoint && !isMobileDevice) {
            setDesktopSidebarHidden(h => !h);
          } else {
            setSidebarOpen(true);
          }
        }}
        activeTagFilter={tagFilter}
        activeTagFilters={activeTagFilters}
        sidebarPermanent={alwaysShowSidebarOnWide && windowWidth >= sidebarBreakpoint && !isMobileDevice && !desktopSidebarHidden}
        sidebarWidth={sidebarWidth}
        // AI props
        aiAssistantEnabled={aiAssistantEnabled}
        aiResponse={aiResponse}
        setAiResponse={setAiResponse}
        aiCitedNoteIds={aiCitedNoteIds}
        setAiCitedNoteIds={setAiCitedNoteIds}
        isAiLoading={isAiLoading}
        aiLoadingProgress={aiLoadingProgress}
        onAiSearch={handleAiSearch}
        // loading
        notesLoading={notesLoading}
        // multi-select
        multiMode={multiMode}
        selectedIds={selectedIds}
        onStartMulti={onStartMulti}
        onExitMulti={onExitMulti}
        onToggleSelect={sOnToggleSelect}
        onCtrlSelect={sOnCtrlSelect}
        onBulkDelete={onBulkDelete}
        onBulkPin={onBulkPin}
        onBulkArchive={onBulkArchive}
        onBulkRestore={onBulkRestore}
        onBulkColor={onBulkColor}
        onBulkSetIcon={onBulkSetIcon}
        onBulkAddLogoFromFile={onBulkAddLogoFromFile}
        logoLibrary={logoLibrary}
        deleteLogoFromLibrary={deleteLogoFromLibrary}
        onBulkDownloadZip={onBulkDownloadZip}
        onSelectAll={onSelectAll}
        onOpenSideBySide={onOpenSideBySide}
        onEmptyTrash={sOnEmptyTrash}
        // view mode
        listView={listView}
        onToggleViewMode={onToggleViewMode}
        // sync
        syncStatus={syncStatus}
        handleSyncNow={handleSyncNow}
        syncDropdownOpen={syncDropdownOpen}
        setSyncDropdownOpen={setSyncDropdownOpen}
        mobileSearchOpen={mobileSearchOpen}
        setMobileSearchOpen={setMobileSearchOpen}
        fabOpen={fabOpen}
        setFabOpen={setFabOpen}
        // Admin panel
        openAdminPanel={openAdminPanel}
        hasUpdate={!!updateInfo?.updateAvailable && !!currentUser?.is_admin}
        // Settings panel
        openSettingsPanel={openSettingsPanel}
        // QR sign-in quick-access button (header, left of the kebab)
        qrQuickEnabled={qrQuickEnabled}
        onOpenQrScanner={openQrScanner}
        // header auto-hide (mobile)
        windowWidth={windowWidth}
        isLandscapeMobile={isLandscapeMobile}
        notificationBellDesktop={
          <NotificationBell
            dark={dark}
            onAction={handleNotificationAction}
            onClearAll={clearAllNotificationsSynced}
            onOpenChange={setNotifCenterOpen}
            closeRef={closeNotifBellRef}
          />
        }
        notificationBellMobile={
          <NotificationBell
            dark={dark}
            onAction={handleNotificationAction}
            onClearAll={clearAllNotificationsSynced}
            onOpenChange={setNotifCenterOpen}
            closeRef={closeNotifBellRef}
          />
        }
      />
      {modal}

      {sbsSecondaryId && (
        <SecondaryNoteInstance
          noteId={sbsSecondaryId}
          splitSide="right"
          splitClosing={sbsClosingSide === "right"}
          forceClosing={sbsBothClosing}
          onRequestClosing={onSbsRightClosing}
          aiPanelSide="left"
          sbsOppositeHidden={sbsAiActiveSide === "left"}
          onAiOpen={onSecondaryAiOpen}
          onAiClose={onSecondaryAiClose}
          notes={notes}
          setNotes={setNotes}
          currentUser={currentUser}
          sessionId={sessionId}
          token={token}
          dark={dark}
          windowWidth={windowWidth}
          isLandscapeMobile={isLandscapeMobile}
          isWebView={isWebView}
          edgeToEdgeLandscape={edgeToEdgeLandscape}
          tagFilter={tagFilter}
          tagsWithCounts={tagsWithCounts}
          logoLibrary={logoLibrary}
          addLogoToLibrary={addLogoToLibrary}
          deleteLogoFromLibrary={deleteLogoFromLibrary}
          applyNoteIcon={applyNoteIcon}
          editorToolbarMode={editorToolbarMode}
          pasteMode={pasteMode}
          checklistInsertPosition={checklistInsertPosition}
          checklistRemoveSectionBehavior={checklistRemoveSectionBehavior}
          aiAssistantEnabled={aiAssistantEnabled}
          syncState={syncStatus.syncState}
          acquireLocalLease={acquireLocalLease}
          releaseLocalLease={releaseLocalLease}
          releaseLocalLeaseWithPrune={releaseLocalLeaseWithPrune}
          enqueueAndSync={enqueueAndSync}
          enqueueWithLease={enqueueWithLease}
          addDeleteTombstone={addDeleteTombstone}
          showToast={showToast}
          showGenericConfirm={showGenericConfirm}
          isCollaborativeNote={isCollaborativeNote}
          readModeEnabled={readModeEnabled}
        />
      )}

      <GenericConfirmDialog
        open={genericConfirmOpen}
        config={genericConfirmConfig}
        onClose={() => setGenericConfirmOpen(false)}
      />

      <SelfUpdateProgress
        selfUpdate={selfUpdate}
        token={token}
        showGenericConfirm={showGenericConfirm}
      />

      <ChangelogModal open={changelogOpen} onClose={closeChangelog} />

      {/* Cross-device QR sign-in: the camera + Approve / Reject card
          lives at App level so both the SettingsPanel row and the
          optional header quick-access button can pop it without
          duplicating the modal in two subtrees. */}
      <QrScannerModal
        open={qrScannerOpen}
        onClose={closeQrScanner}
        token={token}
        showToast={showToast}
      />

      {/* Mobile vs. desktop floating display. On coarse-pointer
          devices we swap the glass-card stack for an Android-style
          dark pill at the bottom of the screen: the platform's
          native toast aesthetic feels less out of place on a phone
          than a multi-card overlay would. Width gate is the same
          640 px breakpoint the rest of the UI uses for "mobile",
          and the coarse-pointer check filters out desktop browsers
          with a touchscreen. The notification centre + bell stay
          on every form factor. */}
      {windowWidth < 640 ? (
        <NotificationMobileToast
          onAction={handleNotificationAction}
          position={notificationsPositionMobile}
          // Suppress the floating mobile pill while the notification
          // centre sheet is on screen: every active toast is already
          // visible inside the panel, so doubling it up just covers
          // part of the list the user just opened.
          suppressed={notifCenterOpen}
        />
      ) : (
        <NotificationViewport
          position={notificationsPosition}
          onAction={handleNotificationAction}
          // Same as the mobile pill: hide the floating stack while
          // the centre panel is open so new arrivals don't double up
          // on top of the panel that already shows them.
          suppressed={notifCenterOpen}
        />
      )}

      {/* Forced password change (first login with temp password) */}
      {mustChangePassword && (
        <ChangePasswordModal
          forced
          token={token}
          onSuccess={(res) => {
            setMustChangePassword(false);
            applyPasswordChange(res);
            showToast(t("passwordChangedSuccess"), "success", undefined, "key");
          }}
        />
      )}

      {/* Voluntary password change (from Settings) */}
      {changePasswordOpen && !mustChangePassword && (
        <ChangePasswordModal
          token={token}
          onClose={() => setChangePasswordOpen(false)}
          onSuccess={(res) => {
            setChangePasswordOpen(false);
            applyPasswordChange(res);
            showToast(t("passwordChangedSuccess"), "success", undefined, "key");
          }}
        />
      )}
    </>
  );
}
