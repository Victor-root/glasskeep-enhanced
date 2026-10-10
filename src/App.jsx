import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  useCallback,
  useDeferredValue,
} from "react";
import { askAI } from "./ai";
import { t } from "./i18n";
import {
  getAllNotes as idbGetAllNotes,
  getNote as idbGetNote,
  putNote as idbPutNote,
  deleteNote as idbDeleteNote,
} from "./sync/localDb.js";
import { api, getAuth } from "./utils/api.js";
import { localizeServerError } from "./utils/serverErrors.js";
import { mdForDownload } from "./utils/markdown.jsx";
import { uid, sanitizeFilename, downloadText, triggerBlobDownload, ensureJSZip, fileToCompressedDataURL } from "./utils/helpers.js";
import { sortNotesByRecency, sortNotesForOrderReset, computeRestoredPosition, sortByPositionDesc } from "./utils/noteList.js";
import { textToChecklistItems, checklistItemsToText } from "./utils/noteConversion.js";
import { isRichContent, contentToPlain, serializeRichContent, legacyMarkdownToRichDoc } from "./utils/richText.js";
import { normalizeTypographyPresets } from "./utils/typographyPresets.js";
import { globalCSS } from "./styles/globalCSS.js";
import { ALL_IMAGES, REMINDERS } from "./utils/constants.js";
import { hasAndroidReminders, syncAndroidReminders, setAndroidReminderAuth } from "./utils/androidReminders.js";
import { fetchLogoLibrary, createLogo, deleteLogo as apiDeleteLogo } from "./utils/logoLibrary.js";
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
import { acceptFederationLink, refuseFederationLink, federationErrorMessage } from "./components/admin/federation/federationActions.js";
import SelfUpdateProgress from "./components/admin/SelfUpdateProgress.jsx";
import ChangelogModal, { consumeChangelogShowFlag, onOpenChangelogRequest } from "./components/admin/ChangelogModal.jsx";
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
import { parseAudioContent, isAudioContentEmpty, extensionForMime } from "./utils/audioNote.js";
import { dataUrlToBlob } from "./utils/audioConvert.js";
import useModalState from "./hooks/useModalState.js";
import useTouchScrollbars from "./hooks/useTouchScrollbars.js";
import useNoteSaveState from "./hooks/useNoteSaveState.js";
import useDraftNote from "./hooks/useDraftNote.js";
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

  // Detect Android WebView (APK) — force mobile layout on tablets
  const isWebView = !!window.AndroidTheme;

  useKeyboardInset();

  // Notes & search
  const [notes, setNotes] = useState([]);
  const [allNotesForTags, setAllNotesForTags] = useState([]);
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
  // Which Settings-panel categories are currently expanded. Defaults to
  // an empty object = all collapsed; persisted in localStorage and synced
  // to the user's server settings so the layout follows them across
  // devices.
  // Per-section expansion state for the Settings side sheet. NOT
  // persisted — every time the user closes and reopens the panel,
  // categories should be fully collapsed again. The reset happens
  // in a small effect below that watches settingsPanelOpen flipping
  // to false.
  const [settingsOpenSections, setSettingsOpenSections] = useState({});
  // Same for the Admin panel.
  const [adminOpenSections, setAdminOpenSections] = useState({});
  // Set when the admin panel is opened from the passkey notice, so the
  // domain row can point itself out on arrival. Cleared once it has.
  const [highlightPasskeyDomain, setHighlightPasskeyDomain] = useState(false);
  // AI assistant — visibility flag mirrored from the server. The
  // authoritative state lives in user_ai_settings (loaded by
  // UserAiSettingsSection, which calls back via setAiAssistantEnabled).
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState(false);

  const [aiResponse, setAiResponse] = useState(null);
  const [aiCitedNoteIds, setAiCitedNoteIds] = useState([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiLoadingProgress, setAiLoadingProgress] = useState(null);

  // ─── Ref for closeModal (passed to useModalState for Escape handler) ───
  const closeModalRef = useRef(null);

  // ─── Modal state (hook) ───
  const {
    open, setOpen,
    activeId, setActiveId,
    activeIdRef,
    mType, setMType,
    mTitle, setMTitle,
    mBody, setMBody,
    mTagList, setMTagList,
    tagInput, setTagInput,
    modalTagFocused, setModalTagFocused,
    mColor, setMColor,
    viewMode, setViewMode,
    mImages, setMImages,
    savingModal, setSavingModal,
    confirmDeleteOpen, setConfirmDeleteOpen,
    isModalClosing, setIsModalClosing,
    modalClosingTimerRef,
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
  } = useModalState({ notes, currentUser, closeModalRef });
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

  // Reminder picker open state — lifted here (not in ModalFooter) so it joins
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

  // App-shortcut entry point. The Android launcher's "Scan PC login"
  // shortcut routes through MainActivity → WebViewActivity with
  // ?qr=open in the URL. We consume the param (cleaning the URL so a
  // refresh doesn't loop us back), and only actually pop the scanner
  // when the user already has a session — otherwise the request would
  // race with the auth bootstrap and the modal would mount on top of
  // the login screen with no usable token. token from useState lives
  // on this same first render, so this useEffect sees the hydrated
  // value (no race condition with auth restore).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("qr") !== "open") return;
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("qr");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      } catch { /* non-fatal */ }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot consume of the ?qr=open launch parameter on mount
      if (token) setQrScannerOpen(true);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ChangelogModal open state is lifted here (instead of inside the
  // component) so it can be registered with the central Android
  // back-button stack — overlayOpenCount + the popstate handler below.
  // Without lifting, pressing back on Android while the changelog was
  // open backgrounded the entire app.
  const [changelogOpen, setChangelogOpen] = useState(false);
  const closeChangelog = useCallback(() => setChangelogOpen(false), []);
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

  // Sync-domain refs (owned by autosave, not by modal UI hook)
  const skipNextItemsAutosave = useRef(false);
  const prevItemsRef = useRef([]);
  const skipNextDrawingAutosave = useRef(false);
  const prevDrawingRef = useRef({ paths: [], dimensions: null });
  const pendingDrawingSaveRef = useRef(null);
  const drawingDebounceTimerRef = useRef(null);
  // Tracks latest mBody for draw notes so flushPendingDrawingSave can include text
  const drawNoteBodyRef = useRef("");

  // Initial draw mode for the modal (null = default "view", "draw" = open in edit mode)
  const [initialDrawMode, setInitialDrawMode] = useState(null);

  // Drag
  const dragId = useRef(null);
  const dragGroup = useRef(null);

  // Header menu refs + state
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef(null);
  const headerBtnRef = useRef(null);
  const importFileRef = useRef(null);
  const gkeepFileRef = useRef(null);
  const mdFileRef = useRef(null);

  // -------- Multi-select state --------
  const [multiMode, setMultiMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]); // array of string ids
  // On desktop the notes list scrolls inside .notes-scroll-area (so its
  // scrollbar starts below the sticky header) instead of the document;
  // on mobile that same element keeps overflow:visible and window scrolls
  // as before. Pick whichever one is actually the scrolling box.
  const getNotesScrollTarget = () => {
    const el = document.querySelector(".notes-scroll-area");
    return el && getComputedStyle(el).overflowY === "auto" ? el : null;
  };
  const onStartMulti = () => {
    // Toggle: a second click on the multi-select button closes the bar
    // instead of re-running the open logic (which re-added the dock's padding
    // to the scroll position, so each extra click scrolled the page down).
    if (multiMode) { onExitMulti(); return; }
    const scrollEl = getNotesScrollTarget();
    const scrollX = scrollEl ? scrollEl.scrollLeft : window.scrollX;
    const scrollY = scrollEl ? scrollEl.scrollTop : window.scrollY;
    setMultiMode(true);
    setSelectedIds([]);
    setFabOpen(false); // dock lives at bottom; close FAB to avoid overlap
    // Compensate the shim's padding-top so the visible content doesn't slide
    // down when the dock appears. Read the actual padding after the commit
    // so desktop (48px) and mobile (44px) both work.
    requestAnimationFrame(() => {
      const shim = document.querySelector(".multi-select-content-shim");
      const pad = shim ? parseFloat(getComputedStyle(shim).paddingTop) || 0 : 0;
      if (pad > 0) {
        const target = { left: scrollX, top: scrollY + pad, behavior: "instant" };
        if (scrollEl) scrollEl.scrollTo(target);
        else window.scrollTo(target);
      }
    });
  };
  const onExitMulti = () => {
    const scrollEl = getNotesScrollTarget();
    const scrollX = scrollEl ? scrollEl.scrollLeft : window.scrollX;
    const scrollY = scrollEl ? scrollEl.scrollTop : window.scrollY;
    // Read the padding BEFORE the state change — after the commit it's gone.
    const shim = document.querySelector(".multi-select-content-shim");
    const pad = shim ? parseFloat(getComputedStyle(shim).paddingTop) || 0 : 0;
    setMultiMode(false);
    setSelectedIds([]);
    // The shim's padding-top drops to 0 on the next paint; compensate by
    // scrolling up by the same amount so the visible content stays put.
    requestAnimationFrame(() => {
      const targetY = Math.max(0, scrollY - pad);
      const target = { left: scrollX, top: targetY, behavior: "instant" };
      if (scrollEl) scrollEl.scrollTo(target);
      else window.scrollTo(target);
    });
  };
  const onToggleSelect = (id, checked) => {
    const sid = String(id);
    setSelectedIds((prev) =>
      checked
        ? Array.from(new Set([...prev, sid]))
        : prev.filter((x) => x !== sid),
    );
  };
  // Ctrl / Cmd + click on a note card from non-multi mode: enter
  // multi-select with this note pre-selected. Lets the user gather two
  // notes and trigger "Open side by side" without first hitting the
  // multi-select toggle in the toolbar.
  const onCtrlSelect = (id) => {
    const sid = String(id);
    setMultiMode(true);
    setSelectedIds((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid],
    );
  };
  const onSelectAll = (filteredNotes) => {
    const filteredIds = filteredNotes.map((n) => String(n.id));
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : filteredIds);
  };

  useEffect(() => {
    if (!aiAssistantEnabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the AI answer whenever the assistant gets disabled, from any source
      setAiResponse(null);
      setAiCitedNoteIds([]);
    }
  }, [aiAssistantEnabled]);

  // Mirror the server-side AI preference into the local visibility flag
  // as soon as the session is authenticated. The Settings panel does
  // the same on open (and writes back), but this hydrates the search-
  // bar AI icon immediately on app start.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api("/user/ai/settings", { token })
      .then((data) => {
        if (!cancelled && data && typeof data.enabled === "boolean") {
          // Effective AI availability — even if the user has it enabled,
          // the admin's master switch overrides everything. Custom mode
          // is not a workaround anymore (server enforces this too).
          const adminGate = data.adminAiEnabled !== false;
          setAiAssistantEnabled(data.enabled && adminGate);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onBulkDelete = async () => {
    if (!selectedIds.length) return;

    if (tagFilter === "TRASHED") {
      showGenericConfirm({
        title: t("permanentlyDelete"),
        message: t("permanentlyDeleteConfirm"),
        confirmText: t("permanentlyDelete"),
        danger: true,
        onConfirm: async () => {
          const count = selectedIds.length;
          for (const id of selectedIds) {
            const nid = String(id);
            addDeleteTombstone(nid);
            const leaseId = acquireLocalLease(nid);
            try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
            await enqueueWithLease(nid, { type: "permanentDelete", noteId: nid, payload: { client_updated_at: new Date().toISOString() } }, leaseId);
          }
          setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
          onExitMulti();
          showToast(t("bulkDeletedSuccess").replace("{count}", String(count)), "success", undefined, "trash-x");
        },
      });
    } else {
      showGenericConfirm({
        title: t("moveToTrash"),
        message: t("bulkMoveToTrashConfirm").replace("{count}", String(selectedIds.length)),
        confirmText: t("moveToTrash"),
        danger: true,
        onConfirm: async () => {
          const count = selectedIds.length;
          const nowIso = new Date().toISOString();
          for (const id of selectedIds) {
            const nid = String(id);
            const note = notes.find((n) => String(n.id) === nid);
            const isCollab = note && (note.user_id !== currentUser?.id || note.collaborators?.length > 0);
            const leaseId = acquireLocalLease(nid);
            if (isCollab) {
              try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
            } else {
              try {
                const existing = await idbGetNote(nid, currentUser?.id, sessionId);
                if (existing) await idbPutNote({ ...existing, trashed: true, client_updated_at: nowIso }, currentUser?.id, sessionId);
              } catch (e) { console.error(e); }
            }
            await enqueueWithLease(nid, { type: "trash", noteId: nid, payload: { client_updated_at: nowIso } }, leaseId);
          }
          setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
          onExitMulti();
          showToast(t("bulkTrashedSuccess").replace("{count}", String(count)), "success", undefined, "trash");
        },
      });
    }
  };

  const onEmptyTrash = () => {
    if (notes.length === 0) return;
    showGenericConfirm({
      title: t("emptyTrash"),
      message: t("emptyTrashConfirm"),
      confirmText: t("emptyTrash"),
      danger: true,
      onConfirm: async () => {
        const count = notes.length;
        for (const n of notes) {
          const nid = String(n.id);
          addDeleteTombstone(nid);
          const leaseId = acquireLocalLease(nid);
          try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
          await enqueueWithLease(nid, { type: "permanentDelete", noteId: nid, payload: { client_updated_at: new Date().toISOString() } }, leaseId);
        }
        setNotes([]);
        showToast(t("bulkDeletedSuccess").replace("{count}", String(count)), "success");
      },
    });
  };

  const onBulkPin = async (pinnedVal) => {
    if (!selectedIds.length) return;
    const nowIso = new Date().toISOString();
    // Local-first: update UI + IndexedDB, then enqueue
    setNotes((prev) =>
      prev.map((n) =>
        selectedIds.includes(String(n.id))
          ? { ...n, pinned: !!pinnedVal }
          : n,
      ),
    );
    for (const id of selectedIds) {
      const nid = String(id);
      const leaseId = acquireLocalLease(nid);
      try {
        const existing = await idbGetNote(nid, currentUser?.id, sessionId);
        if (existing) await idbPutNote({ ...existing, pinned: !!pinnedVal, client_updated_at: nowIso }, currentUser?.id, sessionId);
      } catch (e) { console.error(e); }
      await enqueueWithLease(nid, { type: "patch", noteId: nid, payload: { pinned: !!pinnedVal, client_updated_at: nowIso } }, leaseId);
    }
  };

  const onBulkRestore = async () => {
    if (!selectedIds.length) return;
    const count = selectedIds.length;
    const nowIso = new Date().toISOString();
    // Pre-load active notes once for position calculation
    let activeNotes = [];
    try {
      activeNotes = sortByPositionDesc(await idbGetAllNotes(currentUser?.id, sessionId, "active"));
    } catch { /* IDB best-effort: positions computed without local notes */ }
    for (const id of selectedIds) {
      const nid = String(id);
      const leaseId = acquireLocalLease(nid);
      try {
        const existing = await idbGetNote(nid, currentUser?.id, sessionId);
        if (existing) {
          const restoredPosition = computeRestoredPosition(existing, activeNotes);
          await idbPutNote({ ...existing, trashed: false, position: restoredPosition, client_updated_at: nowIso }, currentUser?.id, sessionId);
        }
      } catch (e) { console.error(e); }
      await enqueueWithLease(nid, { type: "restore", noteId: nid, payload: { client_updated_at: nowIso } }, leaseId);
    }
    setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
    onExitMulti();
    showToast(t("bulkRestoredSuccess").replace("{count}", String(count)), "success", undefined, "restore");
  };

  const onBulkArchive = async () => {
    if (!selectedIds.length) return;

    const isArchiving = tagFilter !== "ARCHIVED";
    const archivedValue = isArchiving;
    const count = selectedIds.length;
    const nowIso = new Date().toISOString();

    // Local-first: update IndexedDB + UI, then enqueue
    setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
    for (const id of selectedIds) {
      const nid = String(id);
      const leaseId = acquireLocalLease(nid);
      try {
        const existing = await idbGetNote(nid, currentUser?.id, sessionId);
        if (existing) await idbPutNote({ ...existing, archived: !!archivedValue, client_updated_at: nowIso }, currentUser?.id, sessionId);
      } catch (e) { console.error(e); }
      await enqueueWithLease(nid, { type: "archive", noteId: nid, payload: { archived: !!archivedValue, client_updated_at: nowIso } }, leaseId);
    }

    if (!isArchiving && tagFilter === "ARCHIVED") {
      // Unarchiving from archived view — remove them from current list and switch view
      setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
      setTagFilter(null);
    } else if (isArchiving) {
      // Archiving from normal view — remove them from current list
      setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
    }

    onExitMulti();
    showToast(
      t(isArchiving ? "bulkArchivedSuccess" : "bulkUnarchivedSuccess").replace("{count}", String(count)),
      "success",
      undefined,
      isArchiving ? "archive" : "archive-off",
    );
  };

  const onBulkColor = async (colorName) => {
    if (!selectedIds.length) return;
    const nowIso = new Date().toISOString();
    setNotes((prev) =>
      prev.map((n) =>
        selectedIds.includes(String(n.id)) ? { ...n, color: colorName } : n,
      ),
    );
    for (const id of selectedIds) {
      const nid = String(id);
      const leaseId = acquireLocalLease(nid);
      try {
        const existing = await idbGetNote(nid, currentUser?.id, sessionId);
        if (existing) await idbPutNote({ ...existing, color: colorName, client_updated_at: nowIso }, currentUser?.id, sessionId);
      } catch (e) { console.error(e); }
      await enqueueWithLease(nid, { type: "patch", noteId: nid, payload: { color: colorName, client_updated_at: nowIso } }, leaseId);
    }
  };

  // Apply a note-icon (logo) to every selected note. The icon is per-user
  // (never synced), so each note's icon is saved through the dedicated
  // per-user endpoint via applyNoteIcon — not written into images_json.
  const onBulkSetIcon = async (logo) => {
    if (!selectedIds.length || !logo?.src) return;
    for (const id of selectedIds) {
      await applyNoteIcon(id, { id: uid(), src: logo.src, name: logo.name });
    }
  };

  // Upload a new logo via the OS file picker, register it in the user's
  // logo library AND apply it to every selected note in one shot.
  const onBulkAddLogoFromFile = async (file) => {
    if (!file || !selectedIds.length) return;
    try {
      const src = await fileToCompressedDataURL(file);
      addLogoToLibrary?.({ src, name: file.name });
      await onBulkSetIcon({ src, name: file.name });
    } catch (e) {
      console.error("Bulk logo upload failed", e);
    }
  };

  const onBulkDownloadZip = async () => {
    try {
      const ids = new Set(selectedIds);
      const chosen = notes.filter((n) => ids.has(String(n.id)));
      if (!chosen.length) return;
      const JSZip = await ensureJSZip();
      const zip = new JSZip();
      chosen.forEach((n, idx) => {
        const md = mdForDownload(n);
        const base = sanitizeFilename(
          n.title || `note-${String(n.id).slice(-6)}`,
        );
        zip.file(`${base || `note-${idx + 1}`}.md`, md);
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      await triggerBlobDownload(`glass-keep-selected-${ts}.zip`, blob);
    } catch (e) {
      alert(localizeServerError(e.message, "zipDownloadFailed"));
    }
  };

  // Instance branding (custom app name / logo / login background +
  // blur). The provider owns the fetch; we only need refreshBranding to
  // re-pull after an admin saves so the live header / next login render
  // the new values without a reload.
  const { refreshBranding } = useBranding();

  // Admin panel state (hook)
  const { allowRegistration, loginSlogan, setLoginSlogan, loginProfiles } = usePublicLoginInfo();
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
      // Branding (name/logo/background/blur) may have changed too —
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
  // App.jsx can include it in overlayOpenCount (PTR lock + Android
  // back-button history machinery).
  const [notifCenterOpen, setNotifCenterOpen] = useState(false);
  const closeNotifBellRef = useRef(null);

  // Sync dropdown state (lifted for back button support)
  const [syncDropdownOpen, setSyncDropdownOpen] = useState(false);

  // Mobile search expand (lifted for back button support)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  // FAB open state (lifted for Android back button support)
  const [fabOpen, setFabOpen] = useState(false);


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

  // Load notes
  const handleAiSearch = async (question) => {
    if (!question || question.trim().length < 3) return;
    setIsAiLoading(true);
    setAiResponse(null);
    setAiCitedNoteIds([]);
    setAiLoadingProgress(0);

    try {
      const result = await askAI(question, notes, (progress) => {
        if (progress.status === "progress") {
          setAiLoadingProgress(progress.progress);
        } else if (progress.status === "ready") {
          setAiLoadingProgress(100);
        }
      });
      setAiResponse(result.answer);
      setAiCitedNoteIds(result.citedNoteIds || []);
    } catch (err) {
      console.error("AI Error:", err);
      setAiResponse(t("aiErrorGeneric"));
      setAiCitedNoteIds([]);
    } finally {
      setIsAiLoading(false);
      setAiLoadingProgress(null);
    }
  };

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

  // Live-sync checklist items in open modal when remote updates arrive
  useEffect(() => {
    if (!open || !activeId) return;
    const n = notes.find((x) => String(x.id) === String(activeId));
    if (!n) return;
    if ((mType || n.type) !== "checklist") return;
    const serverItems = Array.isArray(n.items) ? n.items : [];
    const prevJson = JSON.stringify(prevItemsRef.current || []);
    const serverJson = JSON.stringify(serverItems);
    if (serverJson !== prevJson) {
      setMItems(serverItems);
      prevItemsRef.current = serverItems;
    }
  }, [notes, open, activeId, mType, setMItems]);

  // Flush any pending drawing debounce — shared persist logic used by both
  // the debounce timeout and the flush-on-close path.
  // Async: dirty flag stays active until queue write completes, closing the
  // micro-window where SSE patchSingleNote could slip through.
  const flushPendingDrawingSave = useCallback(async () => {
    const pending = pendingDrawingSaveRef.current;
    if (!pending) return;
    // Clear pending ref eagerly to prevent double-flush from concurrent callers,
    // but restore it on failure so closeModal retry can still pick it up.
    pendingDrawingSaveRef.current = null;

    if (drawingDebounceTimerRef.current) {
      clearTimeout(drawingDebounceTimerRef.current);
      drawingDebounceTimerRef.current = null;
    }

    const { noteId, drawingData, leaseId } = pending;
    const nowIso = new Date().toISOString();
    // Include text body alongside drawing data so it's not lost on draw saves
    const textBody = drawNoteBodyRef.current || "";
    const drawingContent = JSON.stringify({ ...drawingData, text: textBody });

    setNotes((prev) =>
      prev.map((n) =>
        String(n.id) === noteId
          ? { ...n, content: drawingContent, updated_at: nowIso, client_updated_at: nowIso }
          : n,
      ),
    );

    // Persist to IDB first — hasPendingChanges() reads from this store
    try {
      const existing = await idbGetNote(noteId, currentUser?.id, sessionId);
      if (existing) {
        await idbPutNote({ ...existing, content: drawingContent, updated_at: nowIso, client_updated_at: nowIso }, currentUser?.id, sessionId);
      }
    } catch (e) {
      console.error("IndexedDB drawing flush failed:", e);
      // IDB failed — restore pending ref so closeModal can retry
      pendingDrawingSaveRef.current = pending;
      return;
    }

    // Write queue item — after this, hasPendingChanges() returns true for noteId
    try {
      await enqueueAndSync({
        type: "patch",
        noteId,
        payload: { content: drawingContent, type: "draw", client_updated_at: nowIso },
      });
    } catch (e) {
      console.error("Drawing enqueue failed:", e);
      // Enqueue failed — restore pending ref so closeModal can retry.
      // Don't release lease on failure — keep SSE guard active.
      pendingDrawingSaveRef.current = pending;
      return;
    }

    // IDB + enqueue both succeeded — advance committed baseline
    prevDrawingRef.current = drawingData;
    // Queue item exists — release this lease + prune older zombies for this note
    releaseLocalLeaseWithPrune(noteId, leaseId);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the lease helpers only touch refs
  }, [currentUser?.id, sessionId, enqueueAndSync]);

  // Keep drawNoteBodyRef in sync with mBody for draw notes
  useEffect(() => { drawNoteBodyRef.current = mBody; }, [mBody]);

  // Auto-save drawing changes (local-first)
  useEffect(() => {
    if (!open || !activeId || mType !== "draw") return;
    if (skipNextDrawingAutosave.current) {
      skipNextDrawingAutosave.current = false;
      return;
    }

    const prevJson = JSON.stringify(
      prevDrawingRef.current || { paths: [], dimensions: null },
    );
    const currentJson = JSON.stringify(
      mDrawingData || { paths: [], dimensions: null },
    );
    if (prevJson === currentJson) return;

    // A real draw stroke reached us — materialise the draft before we save
    // against it. The create payload will carry the new drawing, and the
    // effect returns because baselines are realigned to the current state.
    // eslint-disable-next-line react-hooks/immutability -- the effect runs after render, once useDraftNote below has returned
    if (materializeDraftIfNeeded({ drawing: mDrawingData })) return;
    // If materialise was rejected because the draft is still empty (no
    // strokes, no caption, no metadata), keep the draft pending and skip
    // the autosave — there's nothing to patch, and acquiring a lease /
    // scheduling a flush for a non-existent server row destabilises
    // subsequent modal opens (the user reported a flaky "modal opens
    // then closes immediately" after closing an empty drawing draft).
    if (
      // eslint-disable-next-line react-hooks/immutability -- the effect runs after render, once useDraftNote below has returned
      pendingDraftRef.current &&
      String(activeId) === String(pendingDraftRef.current.id)
    ) {
      return;
    }

    const dirtyNoteId = String(activeId);

    // Release the lease from the previous superseded debounce (if it didn't fire yet).
    // If it DID fire, flush already consumed pendingDrawingSaveRef (set to null).
    const prev = pendingDrawingSaveRef.current;
    if (prev && prev.leaseId) {
      releaseLocalLease(prev.noteId, prev.leaseId);
    }

    // Acquire a fresh lease BEFORE debounce fires — prevents SSE patchSingleNote()
    // from overwriting local drawing state during the 500ms debounce window.
    const leaseId = acquireLocalLease(dirtyNoteId);

    // Store pending payload + lease so flush can pick it up if modal closes mid-debounce
    pendingDrawingSaveRef.current = { noteId: dirtyNoteId, drawingData: mDrawingData, leaseId };

    // Debounce local-first save by 500ms — timeout calls flush which consumes
    // and clears pendingDrawingSaveRef, so no double-execute is possible.
    const timeoutId = setTimeout(() => {
      drawingDebounceTimerRef.current = null;
      flushPendingDrawingSave();
    }, 500);
    drawingDebounceTimerRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
      drawingDebounceTimerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- materializeDraftIfNeeded is declared below and recreated each render; autosave runs only on drawing edits
  }, [mDrawingData, open, activeId, mType, flushPendingDrawingSave]);

  // Flush pending drawing save when modal closes or active note changes
  useEffect(() => {
    if (!open || !activeId || mType !== "draw") {
      flushPendingDrawingSave();
    }
  }, [open, activeId, mType, flushPendingDrawingSave]);

  // Live-sync drawing data in open modal when remote updates arrive
  useEffect(() => {
    if (!open || !activeId) return;
    const n = notes.find((x) => String(x.id) === String(activeId));
    if (!n || n.type !== "draw") return;

    try {
      const serverDrawingData = JSON.parse(n.content || "[]");
      // Handle backward compatibility: if it's an array, convert to new format
      const normalizedData = Array.isArray(serverDrawingData)
        ? { paths: serverDrawingData, dimensions: null }
        : serverDrawingData;
      // Separate text body from drawing data
      const { text: _text, ...serverCleanData } = normalizedData;
      const prevJson = JSON.stringify(prevDrawingRef.current || []);
      const serverJson = JSON.stringify(serverCleanData);
      if (serverJson !== prevJson) {
        setMDrawingData(serverCleanData);
        prevDrawingRef.current = serverCleanData;
      }
    } catch {
      // Invalid JSON, ignore
    }
  }, [notes, open, activeId, setMDrawingData]);

  // No infinite scroll

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

  /** -------- Download single note .md (or audio file for audio notes) -------- */
  const handleDownloadNote = async (note) => {
    if (note?.type === "audio") {
      const parsed = parseAudioContent(note.content);
      // Multi-clip notes still download from the kebab as a single file —
      // the first clip. The themed player offers per-clip downloads with
      // an explicit format choice (original / WAV); that's the richer UX.
      const clip = parsed.clips[0];
      if (clip?.audioDataUrl) {
        try {
          const blob = dataUrlToBlob(clip.audioDataUrl);
          const ext = extensionForMime(clip.mimeType || blob.type);
          const fname = sanitizeFilename(note.title || `audio-${note.id}`) + "." + ext;
          await triggerBlobDownload(fname, blob);
          return;
        } catch (e) {
          console.error("Audio download failed:", e);
        }
      }
      return;
    }
    const md = mdForDownload(note);
    const fname = sanitizeFilename(note.title || `note-${note.id}`) + ".md";
    downloadText(fname, md);
  };

  /** -------- Archive/Unarchive note -------- */
  const handleArchiveNote = async (noteId, archived) => {
    // Archiving a draft counts as a real action — materialise it first so the
    // create reaches the queue before the archive patch follows.
    if (pendingDraftRef.current && String(noteId) === String(pendingDraftRef.current.id)) {
      materializeDraftIfNeeded();
    }
    // Archiving is a durable commitment — clear the freshly-created marker
    // so the empty-on-close auto-trash doesn't undo it for an empty note.
    if (freshlyCreatedNoteRef.current === String(noteId)) {
      freshlyCreatedNoteRef.current = null;
    }
    const nid = String(noteId);
    const leaseId = acquireLocalLease(nid);
    const nowIso = new Date().toISOString();

    // Local-first: apply archive state immediately
    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) await idbPutNote({ ...existing, archived: !!archived, client_updated_at: nowIso }, currentUser?.id, sessionId);
    } catch (e) { console.error(e); }

    // Update UI: remove note from current view (it moved to another view)
    if (tagFilter === "ARCHIVED") {
      if (!archived) {
        setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
        setTagFilter(null);
      }
    } else {
      if (archived) {
        setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      }
    }

    if (archived) {
      closeModal();
    }

    showToast(
      t(archived ? "noteArchived" : "noteUnarchived"),
      "success",
      undefined,
      archived ? "archive" : "archive-off",
    );

    await enqueueWithLease(nid, { type: "archive", noteId: nid, payload: { archived: !!archived, client_updated_at: nowIso } }, leaseId);
  };

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

  // Side-by-side: open two selected notes simultaneously. The PRIMARY (left)
  // pane is the existing App-hosted modal driven by useModalState/openModal:
  // it keeps every feature wired through App. The SECONDARY (right) pane is
  // a self-contained SecondaryNoteInstance that owns its own modal state,
  // autosave, AI chat, and collaboration handlers. Both panes are real,
  // independently editable note modals; closing one animates it out and the
  // survivor recenters.
  const [sbsSecondaryId, setSbsSecondaryId] = useState(null);
  const [sbsClosingSide, setSbsClosingSide] = useState(null); // "left" | "right" | null
  const [sbsBothClosing, setSbsBothClosing] = useState(false);
  // Cuts CSS transitions on the primary modal during the final left-close
  // handoff frame. Without it, the primary keeps its closing transform
  // (translateX(-50%-36px) opacity:0) and would visibly transition back to
  // centre when the SBS rules drop, a left→right kick. Only transition is
  // suppressed; animation: noteModalIn must remain so it doesn't restart
  // when the class is removed.
  const [sbsHandoffNoTransition, setSbsHandoffNoTransition] = useState(false);
  // After right-pane close cleanup, mobile survivor's animation rule drops and
  // the base .note-modal-anim { animation: noteModalIn } would re-fire on the
  // primary, producing a tiny close/reopen flash. Suppress for two frames.
  const [sbsSuppressOpenReplay, setSbsSuppressOpenReplay] = useState(false);

  // Android back button: push a history entry each time an overlay opens,
  // pop entries when overlays close. Uses history.go(-n) for batch cleanup
  // instead of looping history.back() which can navigate out of the SPA.
  const overlayDepthRef = useRef(0);
  const popInProgressRef = useRef(false);

  const overlayOpenCount = [
    imgViewOpen, confirmDeleteOpen, genericConfirmOpen,
    collaborationModalOpen, showModalColorPop, showModalFmt,
    modalKebabOpen, imageMenuOpen, logoPickerOpen, reminderPopOpen, modalTagFocused, notifCenterOpen, syncDropdownOpen, mobileSearchOpen,
    headerMenuOpen, multiMode,
    typographyModalOpen, settingsPanelOpen, adminPanelOpen, sidebarOpen, open, fabOpen,
    noteAiOpen, changelogOpen, qrScannerOpen, sbsSecondaryId,
  ].filter(Boolean).length;
  const prevOverlayCountRef = useRef(0);

  useEffect(() => {
    const prev = prevOverlayCountRef.current;
    prevOverlayCountRef.current = overlayOpenCount;
    // Skip if this render was caused by our own popstate handler
    if (popInProgressRef.current) { popInProgressRef.current = false; return; }
    if (overlayOpenCount > prev) {
      const delta = overlayOpenCount - prev;
      for (let i = 0; i < delta; i++) window.history.pushState({ overlay: true }, "");
      overlayDepthRef.current += delta;
    } else if (overlayOpenCount < prev) {
      // Overlays closed via UI — clean up history entries in one go
      const delta = Math.min(prev - overlayOpenCount, overlayDepthRef.current);
      if (delta > 0) {
        overlayDepthRef.current -= delta;
        popInProgressRef.current = true;
        window.history.go(-delta);
      }
    }
  }, [overlayOpenCount]);

  // Disable pull-to-refresh when any overlay is open. Two delivery paths:
  //   1. Native Android — the JS bridge disables the SwipeRefreshLayout.
  //   2. Chrome PWA — html/body get overscroll-behavior:none via the
  //      data-gk-overlay-locked attribute (defined in globalCSS.js). An
  //      attribute rather than a class, like data-gk-scrolling: rules matching
  //      <html>'s class list (the workspace themes) would otherwise be
  //      re-evaluated as every overlay opens, stalling its opening animation.
  // notifCenterOpen is part of overlayOpenCount now that closeNotifBellRef
  // gives App.jsx a way to close the panel from the popstate handler.
  useEffect(() => {
    const locked = overlayOpenCount > 0;
    document.documentElement.toggleAttribute("data-gk-overlay-locked", locked);
    try { window.AndroidTheme?.setRefreshEnabled(!locked); } catch { /* Android bridge best-effort */ }
  }, [overlayOpenCount]);

  useEffect(() => {
    const onPopState = () => {
      // Skip popstate events triggered by our own history.go() cleanup
      if (popInProgressRef.current) { popInProgressRef.current = false; return; }
      if (overlayDepthRef.current <= 0) return;
      overlayDepthRef.current--;
      // Tell the count effect to skip (back button already popped the entry)
      popInProgressRef.current = true;
      // Close topmost overlay (highest z-index first)
      if (qrScannerOpen) { closeQrScanner(); return; }
      if (imgViewOpen) { setImgViewOpen(false); return; }
      if (changelogOpen) { setChangelogOpen(false); return; }
      if (confirmDeleteOpen) { setConfirmDeleteOpen(false); return; }
      if (genericConfirmOpen) { setGenericConfirmOpen(false); return; }
      if (collaborationModalOpen) { setCollaborationModalOpen(false); return; }
      if (showModalColorPop) { setShowModalColorPop(false); return; }
      if (showModalFmt) { setShowModalFmt(false); return; }
      if (modalKebabOpen) { setModalKebabOpen(false); return; }
      if (logoPickerOpen) { setLogoPickerOpen(false); return; }
      if (imageMenuOpen) { setImageMenuOpen(false); return; }
      if (reminderPopOpen) { setReminderPopOpen(false); return; }
      if (modalTagFocused) { setModalTagFocused(false); return; }
      // noteAiOpen lives INSIDE the NoteModal (open), so we close the
      // AI panel before the note itself — otherwise back inside the
      // AI panel would dismiss the entire note in one go.
      if (noteAiOpen) { setNoteAiOpen(false); return; }
      if (open) { closeModalRef.current?.(); return; }
      if (fabOpen) { setFabOpen(false); return; }
      if (notifCenterOpen) { closeNotifBellRef.current?.(); return; }
      if (syncDropdownOpen) { setSyncDropdownOpen(false); return; }
      if (mobileSearchOpen) { setSearch(""); setMobileSearchOpen(false); return; }
      if (headerMenuOpen) { setHeaderMenuOpen(false); return; }
      if (multiMode) { setMultiMode(false); return; }
      if (typographyModalOpen) { setTypographyModalOpen(false); return; }
      if (settingsPanelOpen) { setSettingsPanelOpen(false); return; }
      if (adminPanelOpen) { setAdminPanelOpen(false); return; }
      if (sidebarOpen) { setSidebarOpen(false); return; }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [imgViewOpen, confirmDeleteOpen, genericConfirmOpen, collaborationModalOpen,
      showModalColorPop, showModalFmt, modalKebabOpen, imageMenuOpen, logoPickerOpen, reminderPopOpen, modalTagFocused,
      notifCenterOpen, syncDropdownOpen, mobileSearchOpen,
      headerMenuOpen, multiMode, typographyModalOpen, settingsPanelOpen, adminPanelOpen, sidebarOpen, open, fabOpen,
      noteAiOpen, changelogOpen, qrScannerOpen,
      closeQrScanner, setImgViewOpen, setConfirmDeleteOpen, setCollaborationModalOpen, setShowModalColorPop, setShowModalFmt,
      setModalKebabOpen, setLogoPickerOpen, setImageMenuOpen, setModalTagFocused, setAdminPanelOpen, setNoteAiOpen]);

  const addImagesToState = async (fileList, setter) => {
    const files = Array.from(fileList || []);
    const results = [];
    for (const f of files) {
      try {
        const src = await fileToCompressedDataURL(f);
        results.push({ id: uid(), src, name: f.name });
      } catch (e) {
        console.error("Image load failed", e);
      }
    }
    if (results.length) setter((prev) => [...prev, ...results]);
  };

  // Persistent per-user logo library — server-backed (same list across
  // all devices/sessions of the same user). Logos here are independent
  // of any note: uploading a logo adds it to the library, deleting one
  // removes it from the library only (notes that already use it keep
  // their embedded copy).
  const [logoLibrary, setLogoLibrary] = useState([]);
  useEffect(() => {
    const token = getAuth()?.token;
    if (!currentUser?.id || !token) {
      setLogoLibrary([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchLogoLibrary(token);
        if (!cancelled) setLogoLibrary(rows);
      } catch (e) {
        console.error("[logoLibrary] load failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  const addLogoToLibrary = useCallback(async ({ src, name }) => {
    const token = getAuth()?.token;
    if (!token || !src) return null;
    try {
      const saved = await createLogo(token, { src, name });
      if (saved) {
        setLogoLibrary((prev) => {
          if (prev.some((l) => l.id === saved.id)) return prev;
          return [...prev, saved];
        });
      }
      return saved;
    } catch (e) {
      console.error("[logoLibrary] create failed", e);
      return null;
    }
  }, []);

  const deleteLogoFromLibrary = useCallback(async (id) => {
    const token = getAuth()?.token;
    if (!token || !id) return;
    // Optimistic remove — restore on failure.
    let removed = null;
    setLogoLibrary((prev) => {
      removed = prev.find((l) => l.id === id) || null;
      return prev.filter((l) => l.id !== id);
    });
    try {
      await apiDeleteLogo(token, id);
    } catch (e) {
      console.error("[logoLibrary] delete failed", e);
      if (removed) setLogoLibrary((prev) => [...prev, removed]);
    }
  }, []);

  // Note icon (logo badge) — PER-USER and never synced to collaborators.
  // It lives on note.icon and persists through its own endpoint, NOT in the
  // shared images_json. applyNoteIcon updates local state optimistically,
  // mirrors to IndexedDB, then saves to the per-user endpoint (best-effort).
  const applyNoteIcon = useCallback(async (noteId, icon) => {
    if (!noteId) return;
    const nid = String(noteId);
    setNotes((prev) => prev.map((n) => (String(n.id) === nid ? { ...n, icon: icon || null } : n)));
    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) await idbPutNote({ ...existing, icon: icon || null }, currentUser?.id, sessionId);
    } catch { /* IDB best-effort */ }
    try {
      if (icon) {
        await api(`/notes/${nid}/icon`, { method: "PUT", token, body: { icon } });
      } else {
        await api(`/notes/${nid}/icon`, { method: "DELETE", token });
      }
    } catch (e) {
      console.error("Note icon save failed", e);
    }
  }, [token, currentUser, sessionId, setNotes]);

  const setNoteIconFromFile = useCallback(async (file) => {
    if (!file || !activeId) return;
    try {
      const src = await fileToCompressedDataURL(file);
      const iconEntry = { id: uid(), src, name: file.name };
      await applyNoteIcon(activeId, iconEntry);
      addLogoToLibrary({ src, name: file.name });
    } catch (e) {
      console.error("Note icon load failed", e);
    }
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- false positive: these memoized callbacks are never mutated
  }, [activeId, applyNoteIcon, addLogoToLibrary]);

  const removeNoteIcon = useCallback(() => {
    if (activeId) applyNoteIcon(activeId, null);
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- false positive: this memoized callback is never mutated
  }, [activeId, applyNoteIcon]);

  // Pick an existing logo from the library as the active note's icon.
  const pickNoteIcon = useCallback((logo) => {
    if (!activeId || !logo?.src) return;
    applyNoteIcon(activeId, { id: uid(), src: logo.src, name: logo.name });
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- false positive: this memoized callback is never mutated
  }, [activeId, applyNoteIcon]);

  // Track initial state when opening modal to detect if user actually edited
  // Must be defined before openModal
  const initialModalStateRef = useRef(null);
  // Committed baseline: only advances when autoSaveTextNote actually succeeds
  // (IDB write + enqueue). closeModal uses this to detect unsaved diffs, so a
  // failed autosave still gets retried on close. initialModalStateRef may advance
  // eagerly to prevent effect re-triggers — this ref is the safety net.
  const committedBaselineRef = useRef(null);

  // Compute the tag context that should pre-fill a freshly created note.
  // Rule:
  //  - Special filters (ARCHIVED / TRASHED / ALL_IMAGES / REMINDERS) → no auto-tag.
  //  - activeTagFilters (real multi-tag selection, OR logic) → apply them all:
  //    the new note then satisfies the current filter and stays visible.
  //    Single-tag clicks also land in activeTagFilters, so this covers both.
  //  - Fallback on tagFilter if it ever held a real tag (defensive; the
  //    current sidebar never sets it to a tag string).
  const getInitialTagsForNewNote = useCallback(() => {
    const isSpecial =
      tagFilter === "ARCHIVED" || tagFilter === "TRASHED" || tagFilter === ALL_IMAGES || tagFilter === REMINDERS;
    if (isSpecial) return [];
    const collected = [];
    if (Array.isArray(activeTagFilters) && activeTagFilters.length > 0) {
      collected.push(...activeTagFilters);
    } else if (typeof tagFilter === "string" && tagFilter) {
      collected.push(tagFilter);
    }
    const seen = new Set();
    const out = [];
    for (const t of collected) {
      const key = String(t).toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(String(t));
    }
    return out;
  }, [tagFilter, activeTagFilters]);

  // Deferred-create lifecycle for the desktop creation buttons — see
  // src/hooks/useDraftNote.js. App.jsx keeps only the intercept calls in
  // autosave effects, the guard branches in togglePin/archive/save/delete,
  // and the closeModal early-exit branch; those are orchestration.
  const {
    pendingDraftRef,
    freshlyCreatedNoteRef,
    materializeDraftIfNeeded,
    handleDirectText,
    handleDirectChecklist,
    handleDirectDraw,
    handleDirectAudio,
  } = useDraftNote({
    activeId,
    currentUser,
    sessionId,
    mTitle, mBody, mItems, mDrawingData, mTagList, mImages, mColor,
    setSidebarOpen, setActiveId, setOpen,
    setMType, setMTitle, setMBody, setMItems, setMTagList, setMImages,
    setMColor, setMDrawingData, setTagInput,
    setInitialDrawMode, setViewMode, setNotes,
    skipNextDrawingAutosave, skipNextItemsAutosave,
    prevDrawingRef, prevItemsRef,
    initialModalStateRef, committedBaselineRef,
    acquireLocalLease, enqueueWithLease,
    idbPutNote,
    getInitialTags: getInitialTagsForNewNote,
  });

  // Android launcher shortcut entry: /?new=<type> comes from
  // MainActivity (long-press → "Note texte" / "Liste" / "Dessin" /
  // "Note audio"). Consume the param exactly once, clean it from the
  // URL so a refresh doesn't loop the action, and dispatch to the
  // matching handleDirect* helper — but only when the user already
  // has a session, otherwise the modal would mount on top of the
  // login screen with no way to save.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const newType = params.get("new");
      if (!newType) return;
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("new");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      } catch { /* non-fatal */ }
      if (!token) return;
      const handlers = {
        text: handleDirectText,
        checklist: handleDirectChecklist,
        audio: handleDirectAudio,
      };
      handlers[newType]?.();
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- the service worker listener is re-attached each render so it always calls the latest openModal
  const openModal = (id) => {
    const n = notes.find((x) => String(x.id) === String(id));
    if (!n) return;
    // Opening a note acknowledges any pending reminder for it: clear the
    // in-app reminder notification(s) for this note so they don't linger
    // after you've opened it (e.g. by tapping the system/push notification,
    // which deep-links here without going through the card's own button).
    // dismiss() acks "delivered", which also clears the card on the user's
    // other devices, so desktop ↔ mobile stay in sync.
    try {
      const sid = String(id);
      (allNotifications || []).forEach((notif) => {
        if (
          notif &&
          notif.type === "reminder" &&
          (String(notif.metadata?.noteId) === sid || String(notif.action?.noteId) === sid)
        ) {
          dismissNotification(notif.id);
        }
      });
    } catch {
      /* best-effort — never block opening the note */
    }
    // Clear any stale pending-draft state — we're opening a real, persisted
    // note, so the deferred-create path must not fire for it.
    // eslint-disable-next-line react-hooks/immutability -- pendingDraftRef is a ref from useDraftNote, cleared when the note opens
    pendingDraftRef.current = null;
    setSidebarOpen(false);
    setSbsSuppressOpenReplay(false);
    setActiveId(String(id));
    setMType(n.type || "text");
    setMTitle(n.title || "");
    let drawNoteText = "";
    if (n.type === "draw") {
      try {
        const drawingData = JSON.parse(n.content || "[]");
        // Handle backward compatibility: if it's an array, convert to new format
        const normalizedData = Array.isArray(drawingData)
          ? { paths: drawingData, dimensions: null }
          : drawingData;
        // Extract text body from drawing JSON (stored alongside paths/dimensions)
        drawNoteText = normalizedData.text || "";
        // Remove text from the drawing data object to keep mDrawingData clean
        const { text: _discardText, ...cleanDrawingData } = normalizedData;
        setMDrawingData(cleanDrawingData);
        prevDrawingRef.current = cleanDrawingData;
        setMBody(drawNoteText);
      } catch {
        setMDrawingData({ paths: [], dimensions: null });
        prevDrawingRef.current = { paths: [], dimensions: null };
        setMBody("");
      }
      skipNextDrawingAutosave.current = true;
    } else {
      setMBody(n.content || "");
      setMDrawingData({ paths: [], dimensions: null });
      prevDrawingRef.current = { paths: [], dimensions: null };
    }
    skipNextItemsAutosave.current = true;
    setMItems(Array.isArray(n.items) ? n.items : []);
    prevItemsRef.current = Array.isArray(n.items) ? n.items : [];
    setMTagList(Array.isArray(n.tags) ? n.tags : []);
    setMImages(Array.isArray(n.images) ? n.images : []);
    setTagInput("");
    setMColor(n.color || "default");

    // Store initial state to detect if user actually edited
    // For draw notes, baseline.content holds the text body (extracted from drawing JSON)
    const baselineState = {
      title: n.title || "",
      content: n.type === "draw" ? drawNoteText : (n.content || ""),
      tags: Array.isArray(n.tags) ? n.tags : [],
      images: Array.isArray(n.images) ? n.images : [],
      color: n.color || "default",
    };
    initialModalStateRef.current = baselineState;
    committedBaselineRef.current = { ...baselineState };

    // Audio notes have no read/edit distinction — the AudioNoteEditor always
    // shows the player + recorder controls regardless of viewMode. Open in
    // edit mode so the experience is identical to creating a new audio note.
    // Users who disabled the read-mode setting always open in edit mode.
    setViewMode(n.type !== "audio" && readModeEnabled);
    setOpen(true);

    // If this note has a saved AI conversation in localStorage, pre-load
    // the messages and mark the panel as "has been opened" so the header
    // toggle is immediately visible (the user can resume the saved chat
    // without having to re-open via the kebab menu).
    noteAi.restoreSavedNoteAi(id);
  };

  // Handler for notification action buttons (the "Ouvrir" affordance
  // on a shared-note toast, etc.). For an action carrying a noteId
  // the linked note opens in the modal and the notification is
  // dismissed. Defined as a plain function rather than useCallback so
  // it always closes over the freshest openModal / notes references.
  const handleNotificationAction = (notif, chosenAction) => {
    if (!notif) return;
    // Single-action notifications pass `notif.action`; multi-action
    // ones pass the chosen action explicitly so this dispatcher knows
    // which button was clicked.
    const a = chosenAction || notif.action;
    if (!a) return;
    if (a.kind === "approve_pending_user" && a.pendingUserId != null) {
      if (typeof approvePendingUser !== "function") return;
      approvePendingUser(a.pendingUserId)
        .then(() => {
          // Mirror AdminPanel's post-action confirmation so the two
          // entry points (panel button + notification action) give
          // the same feedback.
          showToast(t("registrationApproved"), "success", undefined, "user-check");
          // Server already broadcasts notification_removed to every
          // admin so the history entries vanish; explicit remove here
          // covers the local toast in the same session.
          removeNotification(notif.id);
        })
        .catch((e) => {
          if (e && /404/.test(String(e.message))) {
            showToast(t("pendingUserAlreadyHandled"), "warning");
            removeNotification(notif.id);
          }
        });
      return;
    }
    if (a.kind === "reject_pending_user" && a.pendingUserId != null) {
      if (typeof rejectPendingUser !== "function") return;
      rejectPendingUser(a.pendingUserId)
        .then(() => {
          showToast(t("registrationRejected"), "info", undefined, "user-x");
          removeNotification(notif.id);
        })
        .catch((e) => {
          if (e && /404/.test(String(e.message))) {
            showToast(t("pendingUserAlreadyHandled"), "warning");
            removeNotification(notif.id);
          }
        });
      return;
    }
    // Accept / decline a cross-server pairing request straight from the
    // notification toast. The API call lives in federationActions; this
    // only routes the click and gives the same feedback as the panel.
    if (a.kind === "federation_accept" && a.linkId) {
      acceptFederationLink({ token, linkId: a.linkId })
        .then(() => {
          showToast(t("fedAcceptedToast"), "success", undefined, "user-check");
          removeNotification(notif.id);
        })
        .catch((e) => showToast(federationErrorMessage(e), "error"));
      return;
    }
    if (a.kind === "federation_refuse" && a.linkId) {
      refuseFederationLink({ token, linkId: a.linkId })
        .then(() => {
          showToast(t("fedRefusedToast"), "info", undefined, "user-x");
          removeNotification(notif.id);
        })
        .catch((e) => showToast(federationErrorMessage(e), "error"));
      return;
    }
    if (a.kind === "start_self_update" && a.latestVersion) {
      // Same one-click path as the admin panel's "Mettre à jour
      // maintenant" button: surface the generic confirm dialog, then
      // hand off to selfUpdate.startUpdate which opens the existing
      // update-progress modal. Dismiss the notification either way so
      // the card doesn't linger behind the confirm.
      const latestVersion = a.latestVersion;
      const fire = () => {
        try {
          selfUpdate?.startUpdate({ latestVersion });
        } catch {
          /* startUpdate surfaces its own errors via the modal */
        }
      };
      showGenericConfirm({
        title: t("selfUpdateConfirmTitle").replace("{version}", latestVersion),
        message: t("selfUpdateConfirmMessage").replace(
          "{version}",
          latestVersion,
        ),
        confirmText: t("selfUpdateConfirmButton"),
        cancelText: t("cancel"),
        variant: "success",
        onConfirm: fire,
      });
      dismissNotification(notif.id);
      return;
    }
    if (a.noteId) {
      try { openModal(String(a.noteId)); } catch { /* opening the note is best-effort */ }
      dismissNotification(notif.id);
    }
  };

  // Tapping a Web Push reminder focuses the app (handled by push-sw.js)
  // and posts { type: "gk-open-note", noteId } to this client; route it to
  // the note modal. Focusing is guaranteed by the SW regardless of this.
  // eslint-disable-next-line react-hooks/immutability -- false positive: openModal only touches pendingDraftRef, a ref from useDraftNote, when called
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event) => {
      const data = event.data;
      if (data && data.type === "gk-open-note" && data.noteId) {
        try { openModal(String(data.noteId)); } catch { /* opening the note is best-effort */ }
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [openModal]);

  // Native (Android APK) reminder deep-link: a notification tap calls
  // window.__glasskeepOpenNote(noteId) (see WebViewActivity.maybeDispatchOpenNote)
  // to pop that note's modal — the native sibling of the SSE / Web-Push
  // "Open" actions above (the WebView has no Web Push). On a cold start the
  // notes list may not be hydrated when the tap arrives, so we stash the id
  // and open it the moment the note shows up.
  const openModalRef = useRef(openModal);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref read by the native deep-link handler, outside render
  openModalRef.current = openModal;
  const pendingOpenNoteIdRef = useRef(null);
  useEffect(() => {
    const tryOpen = (id) => {
      const sid = String(id);
      if (notes.some((n) => String(n.id) === sid)) {
        try { openModalRef.current?.(sid); } catch { /* opening the note is best-effort */ }
        return true;
      }
      return false;
    };
    window.__glasskeepOpenNote = (id) => {
      if (id == null || id === "") return;
      if (!tryOpen(id)) pendingOpenNoteIdRef.current = String(id);
    };
    // A deep-link that arrived before notes hydrated — retry now that this
    // effect re-ran on a notes change.
    if (pendingOpenNoteIdRef.current && tryOpen(pendingOpenNoteIdRef.current)) {
      pendingOpenNoteIdRef.current = null;
    }
    return () => { delete window.__glasskeepOpenNote; };
  }, [notes]);

  // SBS AI coordination — when one note opens its AI panel in SBS mode,
  // the AI panel takes over the OPPOSITE pane's slot and the opposite
  // note is hidden (kept mounted). Cleared on close/hide and on SBS exit.
  const [sbsAiActiveSide, setSbsAiActiveSide] = useState(null); // null | "left" | "right"
  // Timer that delays clearing sbsAiActiveSide so the AI close animation
  // (620ms in NoteModal) can complete before the opposite pane reappears
  // and the wrapper loses its absolute positioning. Cancelled immediately
  // when the whole SBS session closes (no need to wait).
  const sbsAiClearTimerRef = useRef(null);
  const scheduleSbsAiClear = useCallback(() => {
    if (sbsAiClearTimerRef.current) clearTimeout(sbsAiClearTimerRef.current);
    sbsAiClearTimerRef.current = setTimeout(() => {
      setSbsAiActiveSide(null);
      sbsAiClearTimerRef.current = null;
    }, 640); // 620ms (NoteModal aiClosing) + 20ms buffer
  }, []);
  // Cancel any pending delayed clear and wipe immediately (used when SBS
  // closes so there's no zombie state left after teardown).
  const cancelAndClearSbsAi = useCallback(() => {
    if (sbsAiClearTimerRef.current) {
      clearTimeout(sbsAiClearTimerRef.current);
      sbsAiClearTimerRef.current = null;
    }
    setSbsAiActiveSide(null);
  }, []);
  useEffect(() => () => {
    if (sbsAiClearTimerRef.current) clearTimeout(sbsAiClearTimerRef.current);
  }, []);

  const onOpenSideBySide = (ids) => {
    if (!Array.isArray(ids) || ids.length !== 2) return;
    setMultiMode(false);
    setSelectedIds([]);
    setSidebarOpen(false);
    // Add sbs-active to <body> synchronously before the React render so
    // both panes paint with the SBS positioning CSS already in effect.
    // Their noteModalIn keyframes compose with --note-anim-x via the SBS
    // CSS rules, so they animate scale+slide IN PLACE at their SBS
    // anchor positions (same animation as opening a single note).
    document.body.classList.add("sbs-active");
    // Open the left pane via the existing primary pipeline (full features
    // unchanged). Open the right pane via the SecondaryNoteInstance below.
    openModal(String(ids[0]));
    setSbsSecondaryId(String(ids[1]));
    setSbsClosingSide(null);
  };

  // SBS animation duration — 40ms longer than the CSS --sbs-anim (360ms) so
  // React cleanup fires after transitions have fully settled.
  const SBS_ANIM_MS = 400;

  // Intercepts the LEFT pane's close button while in SBS mode. The trick
  // is to NEVER tear down the primary modal here — instead we play a
  // pure-CSS close animation on the left half, glide the right pane to
  // centre, then in the SAME render swap the primary's active note from
  // A → B and unmount the secondary. Because primary's `open` state
  // never flips, there's no close-then-reopen flicker. The survivor
  // smoothly takes over the centre slot with full single-note features.
  const requestCloseLeftPaneSBS = useCallback(() => {
    if (!sbsSecondaryId || sbsClosingSide) return;
    const remaining = sbsSecondaryId;
    cancelAndClearSbsAi();
    setSbsClosingSide("left");
    setTimeout(() => {
      // Handoff: snap the primary back to centre WITHOUT transition. The
      // SBS rules drop in the same React commit as openModal/setSbsSecondaryId,
      // and without this snap the residual `transition: transform var(--sbs-anim)`
      // would animate the primary from translateX(-50%-36px) back to translateX(0)
      // — a left→right kick at the very end. Re-enable transitions after two
      // frames so the next render has settled.
      setSbsHandoffNoTransition(true);
      openModal(String(remaining));
      setSbsSecondaryId(null);
      setSbsClosingSide(null);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSbsHandoffNoTransition(false);
        });
      });
    }, SBS_ANIM_MS);
  }, [sbsSecondaryId, sbsClosingSide, cancelAndClearSbsAi]); // eslint-disable-line react-hooks/exhaustive-deps -- openModal is recreated on every render

  // Closing the RIGHT pane: the secondary instance only signals start
  // (via onRequestClosing) and then sits still while the shell drives
  // both sides' transitions in lockstep. After the recenter animation
  // finishes the shell unmounts the secondary and drops sbs-active so
  // the primary settles into normal single-modal layout at centre.
  const onSbsRightClosing = useCallback(() => {
    if (sbsClosingSide) return;
    cancelAndClearSbsAi();
    setSbsClosingSide("right");
    setTimeout(() => {
      // Sticky flag: stays true while the survivor remains mounted, so the
      // base .note-modal-anim { animation: noteModalIn } can never replay.
      // Cleared by openModal / onOpenSideBySide / closeModal — never on a timer.
      setSbsSuppressOpenReplay(true);
      setSbsSecondaryId(null);
      setSbsClosingSide(null);
    }, SBS_ANIM_MS);
  }, [sbsClosingSide, cancelAndClearSbsAi]);
  // Kept for backward-compat in case the secondary ever runs its own
  // exit animation outside SBS — currently a no-op in SBS path.
  const onSbsRightClosed = useCallback(() => {
    setSbsSecondaryId(null);
    setSbsClosingSide(null);
  }, []);

  // SBS AI callbacks for the secondary (right) pane. The secondary owns
  // its own AI state, so it must signal the shell when its AI opens or
  // closes/hides. The shell uses these to drive sbsAiActiveSide and the
  // body class that hides the opposite pane.
  const onSecondaryAiOpen = useCallback(() => {
    setSbsAiActiveSide("right");
  }, []);
  const onSecondaryAiClose = useCallback(() => {
    // Like closeNoteAi/hideNoteAi for the primary: keep sbsAiActiveSide="right"
    // alive for the AI close animation duration so the left pane stays hidden
    // and the wrapper keeps its absolute position at the left half.
    scheduleSbsAiClear();
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- false positive: scheduleSbsAiClear is a memoized callback never mutated
  }, [scheduleSbsAiClear]);

  // Backdrop click while in SBS mode: close BOTH notes together.
  // Strict separation of roles:
  //   - splitClosing → closes ONE pane, survivor recenters (NOT used here)
  //   - sbsClosingSide → drives the survivor's recenter (NOT used here)
  //   - isModalClosing + noteModalOut → closes the WHOLE modal (used here)
  // body.sbs-active stays on so --note-anim-x is still set on each pane;
  // noteModalOut composes with it and plays from each pane's own anchor
  // position (left from -50%-12px, right from +50%+12px). The secondary
  // is forced into closing via the forceClosing prop, which OR-s into its
  // NoteModal's isModalClosing.
  const MODAL_FADE_DURATION_SBS = 200; // noteModalOut 180ms + 20ms buffer
  const closeBothSBS = useCallback(() => {
    if (sbsBothClosing) return;
    if (mType === "draw") flushPendingDrawingSave();
    setSbsBothClosing(true);
    setIsModalClosing(true);
    setTimeout(() => {
      setSbsAiActiveSide(null);
      setSbsSecondaryId(null);
      setSbsClosingSide(null);
      setSbsBothClosing(false);
      setOpen(false);
      setActiveId(null);
      setViewMode(true);
      setConfirmDeleteOpen(false);
      setShowModalFmt(false);
      setIsModalClosing(false);
    }, MODAL_FADE_DURATION_SBS);
  }, [sbsBothClosing, mType, flushPendingDrawingSave, setActiveId, setConfirmDeleteOpen, setIsModalClosing, setOpen, setShowModalFmt, setViewMode]);

  // Check if the note has been modified from initial state
  const hasNoteBeenModified = useCallback(() => {
    if (!initialModalStateRef.current || !activeId) return false;
    const initial = initialModalStateRef.current;
    const current = {
      title: mTitle.trim(),
      content: mBody,
      tags: mTagList,
      images: mImages,
      color: mColor,
    };
    // Compare all fields
    return (
      initial.title !== current.title ||
      initial.content !== current.content ||
      JSON.stringify(initial.tags) !== JSON.stringify(current.tags) ||
      JSON.stringify(initial.images) !== JSON.stringify(current.images) ||
      initial.color !== current.color
    );
  }, [activeId, mTitle, mBody, mTagList, mImages, mColor]);


  // Local-first auto-save for text notes: persist to IndexedDB + enqueue patch
  // Works for ALL text notes (not just collaborative) — mirrors drawing/checklist pattern
  // If existingLeaseId is provided, this function owns that lease and releases it on
  // success. Otherwise acquires its own (used when called directly from closeModal).
  // Returns true if IDB + enqueue both succeeded, false otherwise.
  // Callers use this to decide whether to advance committedBaselineRef.
  const autoSaveTextNote = useCallback(async (noteId, fields, existingLeaseId, noteType = "text") => {
    const nId = String(noteId);
    const lid = existingLeaseId || acquireLocalLease(nId);
    const nowIso = new Date().toISOString();

    // Update notes state with only provided fields
    setNotes((prev) =>
      prev.map((n) =>
        String(n.id) === nId
          ? { ...n, ...fields, updated_at: nowIso, client_updated_at: nowIso }
          : n,
      ),
    );

    // Persist to IndexedDB
    try {
      const existing = await idbGetNote(nId, currentUser?.id, sessionId);
      if (existing) {
        await idbPutNote({ ...existing, ...fields, updated_at: nowIso, client_updated_at: nowIso }, currentUser?.id, sessionId);
      }
    } catch (e) {
      console.error("IndexedDB text auto-save failed:", e);
      // IDB failed — don't enqueue, keep lease, signal failure
      return false;
    }

    // Enqueue targeted patch (only the changed fields)
    try {
      await enqueueAndSync({
        type: "patch",
        noteId: nId,
        payload: { ...fields, type: noteType, client_updated_at: nowIso },
      });
    } catch (e) {
      console.error("Text enqueue failed:", e);
      // Don't release lease on failure — keep SSE guard active
      return false;
    }
    // hasPendingChanges() now returns true → SSE protection via queue takes over
    releaseLocalLeaseWithPrune(nId, lid);
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the lease helpers only touch refs
  }, [enqueueAndSync, currentUser?.id, sessionId]);

  // Local-first auto-save for metadata (color, tags, images) — immediate, no debounce
  // Works for text, checklist, AND draw notes (metadata fields are independent of content).
  useEffect(() => {
    if (!open || !activeId) return;
    const initial = initialModalStateRef.current;
    if (!initial) return;

    const colorChanged = initial.color !== mColor;
    const tagsChanged = JSON.stringify(initial.tags) !== JSON.stringify(mTagList);
    const imagesChanged = JSON.stringify(initial.images) !== JSON.stringify(mImages);

    if (!colorChanged && !tagsChanged && !imagesChanged) return;

    // A real metadata change reached us — materialise the draft before saving.
    // The create payload carries the new metadata so the subsequent patch is
    // redundant and the effect exits.
    if (materializeDraftIfNeeded()) return;

    // Acquire lease before async enqueue (prevents SSE overwrite)
    const leaseId = acquireLocalLease(String(activeId));

    // Build patch with only changed metadata fields
    const metaPatch = {};
    if (colorChanged) metaPatch.color = mColor;
    if (tagsChanged) metaPatch.tags = mTagList;
    if (imagesChanged) metaPatch.images = mImages;

    // Advance initialModalStateRef eagerly to prevent effect re-trigger,
    // but only advance committedBaselineRef after confirmed persistence.
    const committedFields = { ...(colorChanged ? { color: mColor } : {}), ...(tagsChanged ? { tags: mTagList } : {}), ...(imagesChanged ? { images: mImages } : {}) };
    initialModalStateRef.current = { ...initial, ...committedFields };

    const noteType = mType || "text";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the autosave updates the note list as part of persisting the edit
    autoSaveTextNote(activeId, metaPatch, leaseId, noteType).then((ok) => {
      if (ok && committedBaselineRef.current) {
        committedBaselineRef.current = { ...committedBaselineRef.current, ...committedFields };
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- materializeDraftIfNeeded is recreated each render; autosave runs only on edits
  }, [mColor, mTagList, mImages, open, activeId, mType, autoSaveTextNote]);

  // Auto-save text content (title + body): debounced local-first persist + patch sync.
  // Checklists share this effect for title changes (their body is always "").
  // NOTE: runs in BOTH view and edit mode. Toggling to view mode after a pending
  // edit used to cancel the debounce and leak the change (only a manual save or
  // closing from edit-mode would catch it). Read/write mode is a pure display
  // concern — the underlying mBody/mTitle state is equally dirty either way.
  useEffect(() => {
    if (!open || !activeId) return;
    if (mType !== "text" && mType !== "checklist" && mType !== "audio") return;
    const initial = initialModalStateRef.current;
    if (!initial) return;

    const titleChanged = initial.title !== mTitle.trim();
    // Audio notes piggyback on the text autosave path: their `content` field
    // is the serialised {clips, text} JSON stored in mBody. Treat it like
    // text-note content so PATCH carries the JSON when clips are added or
    // removed, materialising the draft on first recording.
    const bodyAppliesToType = mType === "text" || mType === "audio";
    const contentChanged = bodyAppliesToType && initial.content !== mBody;
    if (!titleChanged && !contentChanged) return;

    // Real keystroke reached us — materialise the draft. The create carries
    // the typed content and baselines are aligned, so the effect exits.
    if (materializeDraftIfNeeded()) return;

    // Acquire lease IMMEDIATELY (before debounce fires).
    // Prevents SSE overwriting IDB during the debounce window.
    const nId = String(activeId);
    const leaseId = acquireLocalLease(nId);
    let transferred = false;

    const timeoutId = setTimeout(() => {
      transferred = true;
      // Build patch with only changed content fields
      const contentPatch = {};
      if (titleChanged) contentPatch.title = mTitle.trim();
      if (contentChanged) contentPatch.content = mBody;

      // Transfer lease ownership to autoSaveTextNote — it will release after enqueue.
      // Advance initialModalStateRef eagerly (prevent re-trigger), but only advance
      // committedBaselineRef after confirmed IDB + enqueue success.
      const committedFields = { ...(titleChanged ? { title: mTitle.trim() } : {}), ...(contentChanged ? { content: mBody } : {}) };
      if (initialModalStateRef.current) {
        initialModalStateRef.current = { ...initialModalStateRef.current, ...committedFields };
      }

      autoSaveTextNote(activeId, contentPatch, leaseId, mType).then((ok) => {
        if (ok && committedBaselineRef.current) {
          committedBaselineRef.current = { ...committedBaselineRef.current, ...committedFields };
        }
      });
    }, 1000); // 1 second debounce

    return () => {
      clearTimeout(timeoutId);
      // If debounce was cancelled (new keystroke / modal close), release this lease.
      // If it fired, autoSaveTextNote owns the lease and will release it.
      if (!transferred) releaseLocalLease(nId, leaseId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- materializeDraftIfNeeded is recreated each render; autosave runs only on edits
  }, [mBody, mTitle, open, activeId, mType, autoSaveTextNote]);

  // Auto-save draw note title + text body: debounced local-first persist + patch sync.
  // Drawing data changes are handled by the drawing autosave effect above.
  // This effect handles title and text body changes only.
  useEffect(() => {
    if (!open || !activeId || mType !== "draw") return;
    const initial = initialModalStateRef.current;
    if (!initial) return;

    const titleChanged = initial.title !== mTitle.trim();
    const textChanged = initial.content !== mBody;
    if (!titleChanged && !textChanged) return;

    if (materializeDraftIfNeeded()) return;
    // Empty-draft rejection: keep pending, skip the patch enqueue.
    if (
      pendingDraftRef.current &&
      String(activeId) === String(pendingDraftRef.current.id)
    ) {
      return;
    }

    const nId = String(activeId);
    const leaseId = acquireLocalLease(nId);
    let transferred = false;

    const timeoutId = setTimeout(() => {
      transferred = true;
      const patch = {};
      if (titleChanged) patch.title = mTitle.trim();
      // For text body changes, re-serialize full drawing content (paths + dimensions + text)
      if (textChanged) {
        patch.content = JSON.stringify({
          ...(mDrawingData || { paths: [], dimensions: null }),
          text: mBody || "",
        });
      }

      const committedFields = {};
      if (titleChanged) committedFields.title = mTitle.trim();
      if (textChanged) committedFields.content = mBody;

      if (initialModalStateRef.current) {
        initialModalStateRef.current = { ...initialModalStateRef.current, ...committedFields };
      }

      autoSaveTextNote(activeId, patch, leaseId, "draw").then((ok) => {
        if (ok && committedBaselineRef.current) {
          committedBaselineRef.current = { ...committedBaselineRef.current, ...committedFields };
        }
      });
    }, 1000);

    return () => {
      clearTimeout(timeoutId);
      if (!transferred) releaseLocalLease(nId, leaseId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- materializeDraftIfNeeded is recreated each render; autosave runs only on edits
  }, [mBody, mTitle, open, activeId, mType, mDrawingData, autoSaveTextNote]);

  // Update initial state reference when note is updated from server (for collaborative notes)
  // This prevents overwriting server changes when user hasn't edited locally
  // Must be after hasNoteBeenModified is defined
  useEffect(() => {
    if (!open || !activeId || !initialModalStateRef.current) return;
    const n = notes.find((x) => String(x.id) === String(activeId));
    if (!n || n.type === "draw") return;

    // Check if server version is different from our initial state
    const serverState = {
      title: n.title || "",
      content: n.type === "draw" ? "" : n.content || "",
      tags: Array.isArray(n.tags) ? n.tags : [],
      images: Array.isArray(n.images) ? n.images : [],
      color: n.color || "default",
    };

    const initial = initialModalStateRef.current;
    const serverChanged =
      initial.title !== serverState.title ||
      initial.content !== serverState.content ||
      JSON.stringify(initial.tags) !== JSON.stringify(serverState.tags) ||
      JSON.stringify(initial.images) !== JSON.stringify(serverState.images) ||
      initial.color !== serverState.color;

    // If server changed and user hasn't edited locally, update initial state to server state
    // This prevents overwriting server changes when user closes without editing.
    // Skip if the note has an active local lease — a local save (auto-save metadata,
    // auto-save text, drawing save) is in flight and the `notes` state hasn't caught up
    // yet with the optimistic setNotes. Without this guard, the stale `notes` value
    // would briefly reset modal state, causing a visible flicker (e.g. deleted image
    // reappearing then disappearing).
    if (serverChanged && !hasNoteBeenModified() && !isNoteLocallyProtected(String(activeId))) {
      initialModalStateRef.current = serverState;
      committedBaselineRef.current = { ...serverState };
      // Only update fields that actually changed to avoid re-rendering
      // (re-render kills text selection in view mode)
      if (serverState.title !== mTitle) setMTitle(serverState.title);
      if (serverState.content !== mBody) setMBody(serverState.content);
      if (JSON.stringify(serverState.tags) !== JSON.stringify(mTagList)) setMTagList(serverState.tags);
      if (JSON.stringify(serverState.images) !== JSON.stringify(mImages)) setMImages(serverState.images);
      if (serverState.color !== mColor) setMColor(serverState.color);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only on server note changes, the edited fields must not re-run it on each keystroke
  }, [notes, open, activeId, hasNoteBeenModified]);

  // The note no longer exists for this user (deleted elsewhere, access
  // revoked): close it if it is the one open, without saving anything.
  const closeNoteIfOpen = (noteId) => {
    if (String(activeIdRef.current) === noteId) {
      forceCloseModalForRemoteDelete(noteId);
    }
  };

  // Force-close modal without any save/flush — used when a remote session
  // permanently deletes the note that is currently open. Must not trigger
  // autoSaveTextNote, flushPendingDrawingSave, or any enqueueAndSync.
  const forceCloseModalForRemoteDelete = (noteId) => {
    const nid = String(noteId);

    // Cancel any pending drawing debounce so flush never fires.
    // Release the lease since the note no longer exists.
    const pending = pendingDrawingSaveRef.current;
    if (pending && String(pending.noteId) === nid) {
      if (drawingDebounceTimerRef.current) {
        clearTimeout(drawingDebounceTimerRef.current);
        drawingDebounceTimerRef.current = null;
      }
      if (pending.leaseId) releaseLocalLease(nid, pending.leaseId);
      pendingDrawingSaveRef.current = null;
    }

    // Cancel in-flight close animation (if any)
    if (modalClosingTimerRef.current) {
      clearTimeout(modalClosingTimerRef.current);
      modalClosingTimerRef.current = null;
    }

    // Reset all modal state immediately — no animation, no save
    // (history cleanup is handled by the centralized overlay back-button system)
    setOpen(false);
    setActiveId(null);
    setViewMode(true);
    setConfirmDeleteOpen(false);
    setShowModalFmt(false);
    setIsModalClosing(false);
    setImgViewOpen(false);
  };

  // Run the modal exit animation. If the AI side panel is open, close
  // it first with its own slide-back animation, then kick off the modal
  // fade-out — this gives a clean sequential close instead of both
  // animations playing at the same time. The same modalClosingTimerRef
  // guards re-entry through both phases.
  const startModalExitAnimation = () => {
    const PANEL_CLOSE_DURATION = 640; // matches NoteModal's aiClosing window
    const MODAL_FADE_DURATION = 180;
    const beginFade = () => {
      setIsModalClosing(true);
      modalClosingTimerRef.current = setTimeout(() => {
        modalClosingTimerRef.current = null;
        setOpen(false);
        setActiveId(null);
        setViewMode(true);
        setConfirmDeleteOpen(false);
        setShowModalFmt(false);
        setIsModalClosing(false);
        noteAi.resetNoteAiAfterClose();
      }, MODAL_FADE_DURATION);
    };
    if (noteAiOpen) {
      setNoteAiOpen(false);
      // Cancel any in-flight AI request so chunks don't arrive after
      // the note has unmounted.
      noteAi.stopNoteAi();
      modalClosingTimerRef.current = setTimeout(() => {
        modalClosingTimerRef.current = null;
        beginFade();
      }, PANEL_CLOSE_DURATION);
    } else {
      beginFade();
    }
  };

  const closeModal = () => {
    // Prevent double-triggering while exit animation is running
    if (modalClosingTimerRef.current) return;
    // Clear the post-SBS replay-suppression flag so noteModalOut can run
    // unblocked when the user closes the survivor.
    setSbsSuppressOpenReplay(false);

    // Unmaterialised draft: the user opened a blank note via the creation
    // buttons and never touched it, so nothing was ever persisted. Just run
    // the exit animation and drop the pending state — no IDB/queue work.
    // Defensive: also remove the draft id from `notes` in case some path
    // accidentally added it before closeModal fired (this should be a no-op
    // in the normal flow, but it covers any reproducer where the user
    // reports "empty note appeared in the list" without a materialise step
    // they can identify). Drawing notes additionally fire the empty-note
    // toast so the user gets feedback that the discard happened.
    if (pendingDraftRef.current && String(activeId) === String(pendingDraftRef.current.id)) {
      const draftId = String(pendingDraftRef.current.id);
      const draftType = pendingDraftRef.current.type;
      // eslint-disable-next-line react-hooks/immutability -- pendingDraftRef is a ref from useDraftNote, cleared in the close handler
      pendingDraftRef.current = null;
      freshlyCreatedNoteRef.current = null;
      setNotes((prev) => {
        const next = prev.filter((n) => String(n.id) !== draftId);
        return next.length === prev.length ? prev : next;
      });
      if (draftType === "draw") {
        showToast(t("emptyNoteDeleted"), "info", 3000, "trash");
      }
      startModalExitAnimation();
      return;
    }

    // Auto-trash any note the user emptied before closing — fresh or not.
    // Body emptiness is checked through contentToPlain so the Tiptap JSON
    // envelope (which is never an empty STRING even when the doc is empty)
    // collapses to its actual user-visible text before the trim test.
    //
    // Tags don't count — a fresh note opened from inside a tag filter
    // auto-inherits the tag and would otherwise never qualify. Images
    // DO count as content though: a note that only carries pictures
    // (typical of Google Keep imports) is just as valid as a text-only
    // one and must NOT be auto-deleted on close.
    if (activeId) {
      const drawPaths = mType === "draw"
        ? (mDrawingData?.paths || (Array.isArray(mDrawingData) ? mDrawingData : []))
        : [];
      // A "real" stroke needs at least 2 points. A single tap on the
      // canvas (no drag) still commits a one-point path which the user
      // perceives as "I didn't draw anything" — without filtering, the
      // auto-trash would skip the note because drawPaths.length is
      // non-zero, and an empty card would stick around in the list.
      // The combination titleEmpty + bodyEmpty + noImages is already
      // conservative enough that a deliberate dot-only drawing with no
      // title and no images is vanishingly rare; applying the filter
      // here lets accidental taps on the canvas resolve to "empty"
      // without keeping a junk card around.
      const meaningfulPaths = drawPaths.filter(
        (p) => Array.isArray(p?.points) && p.points.length >= 2,
      );
      // For each note type, "body" means what the user actually authored —
      // the rich-text doc for text notes, the items list for checklists,
      // the drawing strokes (+ optional inline text) for draw notes.
      // Draw notes' body is the Tiptap text caption envelope (an empty
      // editor still serialises to {"v":1,"format":"tiptap","doc":{...}})
      // so we must collapse it through contentToPlain before trimming —
      // a raw `!mBody?.trim()` would always be false on an empty draw
      // caption and would block the auto-trash entirely.
      const bodyEmpty = mType === "text"
        ? !contentToPlain(mBody).trim()
        : mType === "checklist"
          ? !Array.isArray(mItems) || mItems.length === 0
          : mType === "audio"
            ? isAudioContentEmpty(mBody)
            : !contentToPlain(mBody).trim() && meaningfulPaths.length === 0;
      const titleEmpty = !mTitle?.trim();
      const noImages = !Array.isArray(mImages) || mImages.length === 0;
      if (titleEmpty && bodyEmpty && noImages) {
        const nid = String(activeId);
        const nowIso = new Date().toISOString();
        // Server contract: a note must be trashed before it can be
        // permanently deleted (DELETE /notes/:id/permanent returns 400
        // otherwise). Locally we still want the note gone immediately
        // — tombstone + idbDeleteNote handle the UI/storage side. The
        // queue then plays out in FIFO order: trash THEN permanent
        // delete, so the server walks through the legal transition
        // and the note doesn't end up stuck mid-pipeline.
        addDeleteTombstone(nid);
        setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
        showToast(t("emptyNoteDeleted"), "info", 3000, "trash");
        freshlyCreatedNoteRef.current = null;
        (async () => {
          try {
            await idbDeleteNote(nid, currentUser?.id, sessionId);
          } catch { /* IDB best-effort */ }
          const trashLease = acquireLocalLease(nid);
          await enqueueWithLease(
            nid,
            { type: "trash", noteId: nid, payload: { client_updated_at: nowIso } },
            trashLease,
          );
          const purgeLease = acquireLocalLease(nid);
          await enqueueWithLease(
            nid,
            { type: "permanentDelete", noteId: nid, payload: { client_updated_at: nowIso } },
            purgeLease,
          );
        })();

        startModalExitAnimation();
        return;
      }
    }
    freshlyCreatedNoteRef.current = null;

    // Flush any pending drawing debounce before closing.
    // flushPendingDrawingSave restores pendingDrawingSaveRef on failure,
    // so a second close attempt can retry.
    if (activeId && mType === "draw") {
      flushPendingDrawingSave();
    }

    // Flush title/text/metadata changes for draw notes on close.
    // flushPendingDrawingSave only covers drawing data changes (paths/dimensions).
    // Title, text body, color, tags, images need a separate flush.
    if (activeId && mType === "draw") {
      const baseline = committedBaselineRef.current;
      if (baseline) {
        const patch = {};
        if (baseline.title !== mTitle.trim()) patch.title = mTitle.trim();
        if (baseline.color !== mColor) patch.color = mColor;
        if (JSON.stringify(baseline.tags) !== JSON.stringify(mTagList)) patch.tags = mTagList;
        if (JSON.stringify(baseline.images) !== JSON.stringify(mImages)) patch.images = mImages;
        // For text body changes, re-serialize full drawing content
        const textChanged = baseline.content !== mBody;
        if (textChanged) {
          patch.content = JSON.stringify({ ...(mDrawingData || { paths: [], dimensions: null }), text: mBody || "" });
        }
        if (Object.keys(patch).length > 0) {
          autoSaveTextNote(activeId, patch, null, "draw");
        }
      }
    }

    // Retry checklist if the last autosave failed (prevItemsRef wasn't advanced).
    if (activeId && mType === "checklist" && mItems) {
      const prevJson = JSON.stringify(prevItemsRef.current || []);
      const currentJson = JSON.stringify(mItems);
      if (prevJson !== currentJson) {
        syncChecklistItems(mItems);
      }
    }

    // Flush pending title/metadata changes for checklists on close.
    // syncChecklistItems only covers the items array; title, color, tags
    // and images go through autoSaveTextNote with the debounced effect,
    // so closing within the debounce window could otherwise lose them.
    if (activeId && mType === "checklist") {
      const baseline = committedBaselineRef.current;
      if (baseline) {
        const patch = {};
        if (baseline.title !== mTitle.trim()) patch.title = mTitle.trim();
        if (baseline.color !== mColor) patch.color = mColor;
        if (JSON.stringify(baseline.tags) !== JSON.stringify(mTagList)) patch.tags = mTagList;
        if (JSON.stringify(baseline.images) !== JSON.stringify(mImages)) patch.images = mImages;
        if (Object.keys(patch).length > 0) {
          autoSaveTextNote(activeId, patch, null, "checklist");
        }
      }
    }

    // Flush any pending text changes immediately before closing (local-first).
    // Use committedBaselineRef (not initialModalStateRef) so that a failed
    // autosave still produces a diff here and gets retried.
    // Runs for both view and edit mode: a user may edit, toggle to view
    // to preview before the 1s debounce fires, then close — the change is
    // still dirty in mBody/mTitle and must be flushed.
    // Audio shares this path: its mBody is the {clips, text} JSON, so a
    // freshly-recorded clip whose autosave hasn't fired yet still gets
    // flushed here on close.
    if (activeId && (mType === "text" || mType === "audio")) {
      const baseline = committedBaselineRef.current;
      if (baseline) {
        const patch = {};
        if (baseline.title !== mTitle.trim()) patch.title = mTitle.trim();
        if (baseline.content !== mBody) patch.content = mBody;
        if (baseline.color !== mColor) patch.color = mColor;
        if (JSON.stringify(baseline.tags) !== JSON.stringify(mTagList)) patch.tags = mTagList;
        if (JSON.stringify(baseline.images) !== JSON.stringify(mImages)) patch.images = mImages;
        if (Object.keys(patch).length > 0) {
          autoSaveTextNote(activeId, patch, undefined, mType);
        }
      }
    }

    // No dirty flag management needed here — each flow (text, draw, checklist)
    // owns its own lease via acquireLocalLease/releaseLocalLease,
    // released only after successful enqueueAndSync.

    // Start exit animation, then actually unmount after it completes.
    // Sequential close: if the AI panel is open, it animates out first.
    startModalExitAnimation();
  };

  const saveModal = async () => {
    if (activeId == null) return;
    // Pressing save on a draft counts as committing it. materialize first so
    // the create carries the current state and patches below operate on an
    // existing note.
    if (pendingDraftRef.current && String(activeId) === String(pendingDraftRef.current.id)) {
      materializeDraftIfNeeded();
    }
    // Explicit save = user intent to keep this note even if it's empty.
    // Drop the freshly-created marker so closeModal's auto-trash branch
    // won't undo the commit.
    if (freshlyCreatedNoteRef.current === String(activeId)) {
      freshlyCreatedNoteRef.current = null;
    }
    setSavingModal(true);

    const noteId = String(activeId);
    const nowIso = new Date().toISOString();

    if (mType === "text" || mType === "audio") {
      // Text + audio notes: use targeted patch with only changed fields.
      // Use committedBaselineRef so a failed autosave is retried here.
      // Audio's mBody is the serialised {clips, text} JSON; same diff logic
      // applies — the JSON string changes when clips are added/removed.
      const patch = {};
      const baseline = committedBaselineRef.current;
      if (baseline) {
        if (baseline.title !== mTitle.trim()) patch.title = mTitle.trim();
        if (baseline.content !== mBody) patch.content = mBody;
        if (baseline.color !== mColor) patch.color = mColor;
        if (JSON.stringify(baseline.tags) !== JSON.stringify(mTagList)) patch.tags = mTagList;
        if (JSON.stringify(baseline.images) !== JSON.stringify(mImages)) patch.images = mImages;
      } else {
        // No initial state — send everything
        Object.assign(patch, { title: mTitle.trim(), content: mBody, color: mColor, tags: mTagList, images: mImages });
      }

      if (Object.keys(patch).length > 0) {
        autoSaveTextNote(activeId, patch, undefined, mType);
      }
    } else {
      // Checklist / Drawing: keep full update (they manage their own local-first flows)
      const base = {
        id: activeId,
        title: mTitle.trim(),
        tags: mTagList,
        images: mImages,
        color: mColor,
        pinned: !!notes.find((n) => String(n.id) === String(activeId))?.pinned,
      };
      const payload =
        mType === "checklist"
          ? { ...base, type: "checklist", content: "", items: mItems, client_updated_at: nowIso }
          : { ...base, type: "draw", content: JSON.stringify({ ...mDrawingData, text: mBody || "" }), items: [], client_updated_at: nowIso };

      const updatedFields = {
        ...payload,
        updated_at: nowIso,
        client_updated_at: nowIso,
        lastEditedBy: currentUser?.email || currentUser?.name,
        lastEditedAt: nowIso,
      };

      const leaseId = acquireLocalLease(noteId);
      try {
        const existing = await idbGetNote(noteId, currentUser?.id, sessionId);
        if (existing) {
          await idbPutNote({ ...existing, ...updatedFields }, currentUser?.id, sessionId);
        }
      } catch (e) {
        console.error("IndexedDB update failed:", e);
        // IDB failed — don't advance baselines
        setSavingModal(false);
        return;
      }

      setNotes((prev) =>
        prev.map((n) =>
          String(n.id) === noteId ? { ...n, ...updatedFields } : n,
        ),
      );
      const enqueued = await enqueueWithLease(noteId, { type: "update", noteId, payload }, leaseId);
      if (!enqueued) {
        // Enqueue failed — don't advance baselines so closeModal retry can detect diff
        setSavingModal(false);
        return;
      }

      // IDB + enqueue both succeeded — advance committed baselines
      prevItemsRef.current =
        mType === "checklist" ? (Array.isArray(mItems) ? mItems : []) : [];
      prevDrawingRef.current =
        mType === "draw"
          ? mDrawingData || { paths: [], dimensions: null }
          : { paths: [], dimensions: null };
    }

    setSavingModal(false);
  };
  const deleteModal = async (mode) => {
    if (activeId == null) return;
    // Draft that was never materialised — deleting it is identical to just
    // closing the modal (nothing has been persisted anywhere).
    if (pendingDraftRef.current && String(activeId) === String(pendingDraftRef.current.id)) {
      closeModal();
      return;
    }
    // The user is explicitly deleting — drop the freshly-created marker so
    // closeModal's auto-trash branch doesn't enqueue a redundant trash on
    // top of whatever delete-flow we're about to run.
    if (freshlyCreatedNoteRef.current === String(activeId)) {
      freshlyCreatedNoteRef.current = null;
    }
    const note = notes.find((n) => String(n.id) === String(activeId));
    const nid = String(activeId);
    const isOwner = !note || note.user_id === currentUser?.id;
    const isCollabNote = (note?.collaborators?.length || 0) > 0;

    if (tagFilter === "TRASHED") {
      // Local-first: permanent delete — tombstone prevents resurrection by loaders/SSE
      const leaseId = acquireLocalLease(nid);
      addDeleteTombstone(nid);
      try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("notePermanentlyDeleted"), "success", undefined, "trash-x");
      await enqueueWithLease(nid, { type: "permanentDelete", noteId: nid, payload: { client_updated_at: new Date().toISOString() } }, leaseId);
    } else if (isOwner && isCollabNote && mode === "delete_for_all") {
      // Owner chose to delete the shared note for everyone.
      // The note lands in the owner's trash (the server sets trashed=1 and
      // revokes collaborators); collaborators lose access via SSE note_deleted.
      const leaseId = acquireLocalLease(nid);
      const nowIso = new Date().toISOString();
      try {
        const existing = await idbGetNote(nid, currentUser?.id, sessionId);
        if (existing) await idbPutNote({ ...existing, trashed: true, collaborators: [], client_updated_at: nowIso }, currentUser?.id, sessionId);
      } catch (e) { console.error(e); }
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("noteDeletedForAll"), "success", undefined, "trash-x");
      await enqueueWithLease(nid, { type: "trash", noteId: nid, payload: { client_updated_at: nowIso, mode: "delete_for_all" } }, leaseId);
    } else if (isOwner && isCollabNote) {
      // Owner chose "remove for me" on a shared note. Server transfers
      // ownership to the first collaborator (note stays live for them) and
      // creates a trashed copy owned by the leaver so they can restore it.
      // The trashed copy has a new id; the next trash view fetches it from
      // the server.
      try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("noteMovedToTrash"), "success", undefined, "trash");
      const leaseId = acquireLocalLease(nid);
      await enqueueWithLease(nid, { type: "trash", noteId: nid, payload: { client_updated_at: new Date().toISOString(), mode: "remove_self" } }, leaseId);
    } else if (!isOwner) {
      // Collaborator "trash" — symmetric with the owner-leaves-shared
      // case below: they get a personal copy in their corbeille so
      // the action is recoverable. Without this, the previous spec
      // ("leave the collaboration cleanly, no recovery") read like a
      // permanent delete from the user's POV. The trashed copy is
      // created server-side and the next /notes/trashed fetch picks
      // it up.
      try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("noteMovedToTrash"), "success", undefined, "trash");
      const leaseId = acquireLocalLease(nid);
      await enqueueWithLease(nid, { type: "trash", noteId: nid, payload: { client_updated_at: new Date().toISOString(), mode: "remove_self" } }, leaseId);
    } else {
      // Owner of non-collaborative note: local-first move to trash
      const leaseId = acquireLocalLease(nid);
      const nowIso = new Date().toISOString();
      try {
        const existing = await idbGetNote(nid, currentUser?.id, sessionId);
        if (existing) await idbPutNote({ ...existing, trashed: true, client_updated_at: nowIso }, currentUser?.id, sessionId);
      } catch (e) { console.error(e); }
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("noteMovedToTrash"), "success", undefined, "trash");
      await enqueueWithLease(nid, { type: "trash", noteId: nid, payload: { client_updated_at: nowIso } }, leaseId);
    }
  };

  const restoreFromTrash = async (noteId) => {
    const nid = String(noteId);
    const leaseId = acquireLocalLease(nid);
    const nowIso = new Date().toISOString();
    // Local-first: restore immediately, computing a position that places the note
    // among active notes at the right chronological spot (by creation timestamp).
    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) {
        const activeNotes = await idbGetAllNotes(currentUser?.id, sessionId, "active");
        const sorted = sortByPositionDesc(activeNotes.filter((n) => String(n.id) !== nid));
        const restoredPosition = computeRestoredPosition(existing, sorted);
        await idbPutNote({ ...existing, trashed: false, position: restoredPosition, client_updated_at: nowIso }, currentUser?.id, sessionId);
      }
    } catch (e) { console.error(e); }
    setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
    closeModal();
    showToast(t("noteRestoredFromTrash"), "success", undefined, "restore");
    await enqueueWithLease(nid, { type: "restore", noteId: nid, payload: { client_updated_at: nowIso } }, leaseId);
  };
  const togglePin = async (id, toPinned) => {
    // Pinning a draft counts as a real action — materialise it first so the
    // create lands in the queue before the pin patch follows.
    if (pendingDraftRef.current && String(id) === String(pendingDraftRef.current.id)) {
      materializeDraftIfNeeded();
    }
    // Pinning is a durable commitment — clear the freshly-created marker so
    // the empty-on-close auto-trash doesn't undo a pinned empty note.
    if (freshlyCreatedNoteRef.current === String(id)) {
      freshlyCreatedNoteRef.current = null;
    }
    const nid = String(id);
    const leaseId = acquireLocalLease(nid);
    const nowIso = new Date().toISOString();

    // Update React state FIRST (synchronous, before any await) for instant UI.
    setNotes((prev) => {
      const updated = prev.map((n) => {
        if (String(n.id) !== nid) return n;
        if (toPinned) return { ...n, pinned: true };
        // When unpinning, just keep the note's existing position — it was
        // assigned when the note was originally in the "others" section and
        // is still valid. No need to recompute.
        return { ...n, pinned: false };
      });
      return sortNotesByRecency(updated);
    });

    // Then persist to IndexedDB and server
    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) await idbPutNote({ ...existing, pinned: !!toPinned, client_updated_at: nowIso }, currentUser?.id, sessionId);
    } catch (e) { console.error(e); }
    // Don't use enqueueWithLease here — it releases the lease immediately after
    // the server responds, but the server also sends an SSE note_updated event
    // that triggers patchSingleNote after a 300ms debounce. If the lease is
    // already released by then, patchSingleNote fetches the server note (which
    // may have a different position) and overwrites the optimistic state, causing
    // a visual flash in Masonry. Instead, release the lease with a delay that
    // covers the SSE debounce window.
    try {
      await enqueueAndSync({ type: "patch", noteId: nid, payload: { pinned: !!toPinned, client_updated_at: nowIso } });
    } catch {
      // On failure, lease stays active — SSE protection maintained
      return;
    }
    // Delay lease release past the SSE debounce (300ms) + patchSingleNote fetch time
    setTimeout(() => releaseLocalLeaseWithPrune(nid, leaseId), 1000);
  };

  /** -------- Set / update / clear a note's reminder -------- */
  // Offline-first like togglePin: optimistic React + IndexedDB update,
  // then a dedicated "reminder" sync op (POST /notes/:id/reminder). Pass
  // a null ISO to clear the reminder. Setting one always re-arms it
  // (clears reminderFiredAt) so a previously-fired reminder fires again.
  const setNoteReminder = async (id, reminderAtIso) => {
    // Reminding a draft counts as a real action — materialise it first so
    // the create lands in the queue before the reminder write follows.
    if (pendingDraftRef.current && String(id) === String(pendingDraftRef.current.id)) {
      materializeDraftIfNeeded();
    }
    // A reminder is a durable commitment — clear the freshly-created marker
    // so the empty-on-close auto-trash doesn't discard a reminded note.
    if (freshlyCreatedNoteRef.current === String(id)) {
      freshlyCreatedNoteRef.current = null;
    }
    const nid = String(id);
    const leaseId = acquireLocalLease(nid);
    const nowIso = new Date().toISOString();
    const reminderAt = reminderAtIso || null;
    console.log(`[reminders] setNoteReminder note=${nid} ->`, reminderAt || "(cleared)");

    // Optimistic state — the chip + the modal bell update instantly.
    setNotes((prev) =>
      prev.map((n) =>
        String(n.id) === nid ? { ...n, reminderAt, reminderFiredAt: null } : n,
      ),
    );

    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) {
        await idbPutNote(
          { ...existing, reminderAt, reminderFiredAt: null, client_updated_at: nowIso },
          currentUser?.id,
          sessionId,
        );
      }
    } catch (e) {
      console.error(e);
    }

    try {
      await enqueueAndSync({
        type: "reminder",
        noteId: nid,
        payload: { reminderAt, client_updated_at: nowIso },
      });
    } catch {
      // On failure the lease stays active so SSE patches can't clobber the
      // optimistic state; the queued op retries when connectivity returns.
      return;
    }
    setTimeout(() => releaseLocalLeaseWithPrune(nid, leaseId), 1000);

    try {
      if (reminderAt) {
        showToast(t("reminderSetToast"), "success", undefined, "reminder");
      } else {
        showToast(t("reminderRemovedToast"), "info", undefined, "reminder");
      }
    } catch {
      /* toast is best-effort feedback */
    }
  };

  // Android WebView only: mirror upcoming reminders to the native local
  // alarm scheduler (Web Push isn't available in a WebView, so the APK
  // fires reminders via AlarmManager instead). No-op in the PWA / browser,
  // where Web Push handles it. Reconciles the whole set on every change
  // (create / edit / delete, cross-device sync, app launch); the signature
  // guard skips redundant bridge calls.
  const androidReminderSyncRef = useRef("");
  useEffect(() => {
    if (!hasAndroidReminders()) return;
    const now = Date.now();
    const title = t("reminderNotificationTitle");
    const items = (notes || [])
      .filter((n) => n.reminderAt && new Date(n.reminderAt).getTime() > now)
      .map((n) => ({
        noteId: String(n.id),
        t: new Date(n.reminderAt).getTime(),
        title,
        body: (n.title || "").trim() || t("untitledNote"),
      }));
    const sig = JSON.stringify(items);
    if (sig === androidReminderSyncRef.current) return;
    androidReminderSyncRef.current = sig;
    syncAndroidReminders(items);
  }, [notes]);

  // Android WebView only: hand the session token to the native layer so its
  // background reminder sync (WorkManager) can poll the server while the APK
  // is closed — letting a reminder created on another device still fire on
  // the phone, with no push service (no Google). No-op in the PWA / browser.
  // Re-runs on login / logout / token refresh.
  useEffect(() => {
    setAndroidReminderAuth(token || "");
  }, [token]);

  /** -------- Reset note order -------- */
  const resetNoteOrder = async (overridePositions = true) => {
    // Reorder is per-user on the server (note_user_positions), so shared
    // notes are fine to include — each participant keeps their own order.
    const sorted = sortNotesForOrderReset(notes);

    // Acquire a lease per note BEFORE any local write — protects positions
    // from being overwritten by loaders / SSE until server confirms reorder.
    const noteLeases = sorted.map((n) => {
      const nid = String(n.id);
      return { noteId: nid, leaseId: acquireLocalLease(nid) };
    });

    // Assign new position values so the order persists across reloads
    if (overridePositions) {
      const now = Date.now();
      sorted.forEach((n, i) => {
        n.position = now - i;
      });
    }

    setNotes(sorted);

    // Local-first: update IndexedDB positions
    for (const n of sorted) {
      try {
        const existing = await idbGetNote(String(n.id), currentUser?.id, sessionId);
        if (existing) await idbPutNote({ ...existing, position: n.position }, currentUser?.id, sessionId);
      } catch { /* IDB best-effort */ }
    }

    const pinnedIds = sorted.filter((n) => n.pinned).map((n) => String(n.id));
    const otherIds = sorted.filter((n) => !n.pinned).map((n) => String(n.id));
    // Hold leases until onSyncComplete confirms server-side
    const reorderToken = leases.holdReorderLeases(noteLeases);
    try {
      await enqueueAndSync({ type: "reorder", noteId: "__reorder__", payload: { pinnedIds, otherIds, _reorderToken: reorderToken, client_reordered_at: new Date().toISOString() } });
    } catch {
      // enqueue failed — leases stay active
    }
    showToast?.(t("noteOrderReset"));
  };

  /** -------- Drag & Drop reorder (cards) -------- */
  const swapWithin = (arr, itemId, targetId) => {
    const a = arr.slice();
    const from = a.indexOf(itemId);
    const to = a.indexOf(targetId);
    if (from === -1 || to === -1) return arr;
    a[from] = targetId;
    a[to] = itemId;
    return a;
  };
  const onDragStart = (id, ev) => {
    dragId.current = String(id);
    const isPinned = !!notes.find((n) => String(n.id) === String(id))?.pinned;
    dragGroup.current = isPinned ? "pinned" : "others";
    ev.currentTarget.classList.add("dragging");
  };
  const onDragOver = (overId, group, ev) => {
    ev.preventDefault();
    if (!dragId.current) return;
    if (dragGroup.current !== group) return;
    ev.currentTarget.classList.add("drag-over");
  };
  const onDragLeave = (ev) => {
    ev.currentTarget.classList.remove("drag-over");
  };
  const onDrop = async (overId, group, ev) => {
    ev.preventDefault();
    ev.currentTarget.classList.remove("drag-over");
    const dragged = dragId.current;
    dragId.current = null;
    if (!dragged || String(dragged) === String(overId)) return;
    if (dragGroup.current !== group) return;

    // Reorder is stored per-user server-side, so shared notes can be moved
    // freely without affecting other participants' ordering.
    const pinnedIds = notes.filter((n) => n.pinned).map((n) => String(n.id));
    const otherIds = notes.filter((n) => !n.pinned).map((n) => String(n.id));
    let newPinned = pinnedIds,
      newOthers = otherIds;
    if (group === "pinned")
      newPinned = swapWithin(pinnedIds, String(dragged), String(overId));
    else
      newOthers = swapWithin(otherIds, String(dragged), String(overId));

    // Assign position values so order survives reload (higher = earlier)
    const now = Date.now();
    const orderedIds = [...newPinned, ...newOthers];
    const positionMap = new Map();
    orderedIds.forEach((id, i) => positionMap.set(id, now - i));

    // Acquire a lease per affected note BEFORE any local write
    const noteLeases = orderedIds.map((id) => ({
      noteId: id,
      leaseId: acquireLocalLease(id),
    }));

    // Optimistic update with positions baked in
    const byId = new Map(notes.map((n) => [String(n.id), n]));
    const reordered = orderedIds.map((id) => {
      const n = byId.get(id);
      return n ? { ...n, position: positionMap.get(id) } : n;
    });
    setNotes(reordered);

    // Persist new positions to IndexedDB (local-first)
    for (const id of orderedIds) {
      const pos = positionMap.get(id);
      try {
        const existing = await idbGetNote(id, currentUser?.id, sessionId);
        if (existing) await idbPutNote({ ...existing, position: pos }, currentUser?.id, sessionId);
      } catch { /* IDB best-effort */ }
    }


    // Enqueue reorder — leases are held until onSyncComplete confirms server-side.
    // Tag payload with token so onSyncComplete can find and release the leases.
    const reorderToken = leases.holdReorderLeases(noteLeases);
    try {
      await enqueueAndSync({ type: "reorder", noteId: "__reorder__", payload: { pinnedIds: newPinned, otherIds: newOthers, _reorderToken: reorderToken, client_reordered_at: new Date().toISOString() } });
    } catch {
      // enqueue failed — leases stay active (SSE protection maintained)
    }
    dragGroup.current = null;
  };
  const onDragEnd = (ev) => {
    ev.currentTarget.classList.remove("dragging");
  };

  // Stable identities for the note-card callbacks. App.jsx recreates these
  // handlers on every render; handing the raw versions to NoteCard defeats
  // its React.memo, so the whole notes grid re-renders on every modal open
  // and every keystroke in the editor — the main-thread cost the LoAF trace
  // pinned to React render tasks (fn "q") and click handlers (fn "fE").
  // useStableCallback keeps a stable identity while always invoking the
  // latest closure, so the memo holds and only the modal subtree re-renders.
  const sOpenModal = useStableCallback(openModal);
  // eslint-disable-next-line react-hooks/immutability -- false positive: togglePin only touches freshlyCreatedNoteRef, a ref from useDraftNote, when called
  const sTogglePin = useStableCallback(togglePin);
  const sOnDragStart = useStableCallback(onDragStart);
  const sOnDragOver = useStableCallback(onDragOver);
  const sOnDragLeave = useStableCallback(onDragLeave);
  const sOnDrop = useStableCallback(onDrop);
  const sOnDragEnd = useStableCallback(onDragEnd);
  const sOnToggleSelect = useStableCallback(onToggleSelect);
  const sOnCtrlSelect = useStableCallback(onCtrlSelect);
  const sOnEmptyTrash = useStableCallback(onEmptyTrash);

  // Checklist item drag handlers (for modal reordering)

  // Local-first helper: persist checklist changes to IndexedDB + sync queue
  const syncChecklistItems = async (newItems) => {
    if (!activeId) return;
    // A checklist edit is the first real action on a pending draft — materialise
    // the note first so the create payload already contains newItems and we
    // don't enqueue a patch for a note the server has never seen. mItems in
    // closure is still the previous value here (setMItems hasn't committed
    // yet), so hand newItems in explicitly.
    if (materializeDraftIfNeeded({ items: newItems })) return;
    const noteId = String(activeId);
    const nowIso = new Date().toISOString();

    // Acquire lease BEFORE any async work — prevents SSE patchSingleNote() from
    // overwriting local checklist state during the IDB write + enqueue window.
    const leaseId = acquireLocalLease(noteId);

    // Update notes state
    setNotes((prev) =>
      prev.map((n) =>
        String(n.id) === noteId
          ? { ...n, items: newItems, updated_at: nowIso, client_updated_at: nowIso }
          : n,
      ),
    );
    // Persist to IndexedDB
    try {
      const existing = await idbGetNote(noteId, currentUser?.id, sessionId);
      if (existing) {
        await idbPutNote({ ...existing, items: newItems, updated_at: nowIso, client_updated_at: nowIso }, currentUser?.id, sessionId);
      }
    } catch (e) {
      console.error("IndexedDB checklist update failed:", e);
      // IDB failed — don't advance baseline, keep lease, signal failure
      return;
    }
    // Enqueue for server sync — after this, hasPendingChanges() protects the note
    try {
      await enqueueAndSync({
        type: "patch",
        noteId,
        payload: { items: newItems, type: "checklist", content: "", client_updated_at: nowIso },
      });
    } catch (e) {
      console.error("Checklist enqueue failed:", e);
      // Don't release lease on failure — keep SSE guard active.
      // Don't advance prevItemsRef — closeModal retry can still detect the diff.
      return;
    }
    // IDB + enqueue both succeeded — advance committed baseline
    prevItemsRef.current = newItems;
    // Queue item exists — release this lease + prune older zombies for this note
    releaseLocalLeaseWithPrune(noteId, leaseId);
  };

  /**
   * Convert a note between "text" and "checklist" in place.
   * Preserves content: text lines become items (one per line, checkbox
   * syntax honoured), items become markdown-like lines.
   *
   * Server-side `type` is immutable under PATCH — we persist via a full
   * PUT update, mirroring the checklist branch of `saveModal`.
   */
  const performConvertNoteType = async () => {
    if (!activeId) return;
    if (mType !== "text" && mType !== "checklist") return;
    if (tagFilter === "TRASHED") return;

    const isDraft = !!pendingDraftRef.current && String(activeId) === String(pendingDraftRef.current.id);
    const targetType = mType === "text" ? "checklist" : "text";
    const toastKey = targetType === "checklist" ? "convertedToChecklist" : "convertedToText";

    // Text → checklist: flatten rich JSON (or legacy Markdown) to plain lines
    // so textToChecklistItems can parse bullets / tasks / headings.
    // Checklist → text: wrap the generated Markdown in our rich envelope so
    // the resulting text note opens directly in rich mode (no second-edit
    // upgrade needed).
    const textForConversion =
      mType === "text" && isRichContent(mBody)
        ? contentToPlain(mBody)
        : mBody || "";
    const newItems = targetType === "checklist" ? textToChecklistItems(textForConversion) : [];
    const newBody = targetType === "text"
      ? serializeRichContent(legacyMarkdownToRichDoc(checklistItemsToText(mItems)))
      : "";

    // Local state first — keep the UI responsive even if the sync call lags.
    skipNextItemsAutosave.current = true;
    setMBody(newBody);
    setMItems(newItems);
    setMType(targetType);
    prevItemsRef.current = newItems;
    if (initialModalStateRef.current) {
      initialModalStateRef.current = { ...initialModalStateRef.current, content: newBody };
    }
    if (committedBaselineRef.current) {
      committedBaselineRef.current = { ...committedBaselineRef.current, content: newBody };
    }

    // Draft note: fold the conversion into the pending create payload.
    if (isDraft) {
      // eslint-disable-next-line react-hooks/immutability -- pendingDraftRef is a ref from useDraftNote, updated in the conversion handler
      pendingDraftRef.current = { ...pendingDraftRef.current, type: targetType };
      materializeDraftIfNeeded({ items: newItems, body: newBody });
      showToast(t(toastKey), "success");
      return;
    }

    // Persisted note: full update via PUT so `type` is actually written server-side.
    const noteId = String(activeId);
    const nowIso = new Date().toISOString();
    const existingNote = notes.find((n) => String(n.id) === noteId);
    const payload = {
      id: activeId,
      title: mTitle.trim(),
      tags: mTagList,
      images: mImages,
      color: mColor,
      pinned: !!existingNote?.pinned,
      type: targetType,
      content: newBody,
      items: newItems,
      client_updated_at: nowIso,
    };
    const updatedFields = {
      ...payload,
      updated_at: nowIso,
      lastEditedBy: currentUser?.email || currentUser?.name,
      lastEditedAt: nowIso,
    };

    const leaseId = acquireLocalLease(noteId);
    try {
      const existing = await idbGetNote(noteId, currentUser?.id, sessionId);
      if (existing) {
        await idbPutNote({ ...existing, ...updatedFields }, currentUser?.id, sessionId);
      }
    } catch (e) {
      console.error("IndexedDB convert failed:", e);
      return;
    }
    setNotes((prev) =>
      prev.map((n) => (String(n.id) === noteId ? { ...n, ...updatedFields } : n)),
    );
    const enqueued = await enqueueWithLease(
      noteId,
      { type: "update", noteId, payload },
      leaseId,
    );
    if (enqueued) showToast(t(toastKey), "success");
  };

  // Public wrapper: gate the conversion behind a confirmation dialog so
  // a misclick on the kebab entry doesn't silently rewrite the note.
  const convertNoteType = () => {
    if (!activeId) return;
    if (mType !== "text" && mType !== "checklist") return;
    if (tagFilter === "TRASHED") return;
    const targetType = mType === "text" ? "checklist" : "text";
    setGenericConfirmConfig({
      title: t(targetType === "checklist" ? "convertToChecklist" : "convertToText"),
      message: t(targetType === "checklist" ? "convertToChecklistConfirm" : "convertToTextConfirm"),
      confirmText: t("convertConfirmAction"),
      onConfirm: () => performConvertNoteType(),
    });
    setGenericConfirmOpen(true);
  };

  /** -------- Duplicate the currently-open note --------
   *  Builds a fresh note from the modal's in-memory state (so unsaved
   *  edits are also captured), persists it via the standard create
   *  pipeline (IDB + setNotes + enqueue "create"), and closes the
   *  modal so the new card appears at the top of the grid. */
  const duplicateActiveNote = async () => {
    if (!activeId) return;
    if (tagFilter === "TRASHED") return;
    // If the modal still hosts an unmaterialised draft, materialise it
    // first so we don't end up with a duplicate of something that the
    // close flow would later drop as a never-persisted draft.
    if (pendingDraftRef.current && String(activeId) === String(pendingDraftRef.current.id)) {
      materializeDraftIfNeeded();
    }
    const newId = uid();
    const nowIso = new Date().toISOString();
    const baseTitle = (mTitle || "").trim();
    const newTitle = baseTitle
      ? `${baseTitle} ${t("duplicateSuffix")}`
      : t("duplicateSuffix");
    const items = Array.isArray(mItems)
      ? mItems.map((it) => ({ ...it, id: uid() }))
      : [];
    const isDraw = mType === "draw";
    const content = isDraw
      ? JSON.stringify({
          paths: mDrawingData?.paths || [],
          dimensions: mDrawingData?.dimensions || null,
          text: mBody || "",
        })
      : (mBody || "");
    const newNote = {
      id: newId,
      type: mType,
      title: newTitle,
      content,
      items,
      tags: Array.isArray(mTagList) ? [...mTagList] : [],
      images: Array.isArray(mImages) ? mImages.map((im) => ({ ...im, id: uid() })) : [],
      color: mColor || "default",
      pinned: false,
      position: Date.now(),
      timestamp: nowIso,
      updated_at: nowIso,
      client_updated_at: nowIso,
    };
    const localNote = {
      ...newNote,
      user_id: currentUser?.id,
      archived: false,
      trashed: false,
    };
    const leaseId = acquireLocalLease(newId);
    try {
      await idbPutNote(localNote, currentUser?.id, sessionId);
    } catch (e) {
      console.error("Duplicate note IDB put failed:", e);
    }
    setNotes((prev) =>
      sortNotesByRecency([localNote, ...(Array.isArray(prev) ? prev : [])]),
    );
    enqueueWithLease(newId, { type: "create", noteId: newId, payload: newNote }, leaseId);
    // The icon (logo badge) is per-user and lives outside the note payload
    // (its own table + endpoint — see applyNoteIcon), so it isn't carried by
    // the "create" enqueue above and must be copied over explicitly.
    if (activeNoteObj?.icon) {
      applyNoteIcon(newId, activeNoteObj.icon);
    }
    showToast(t("noteDuplicated"), "success", undefined, "copy");
    closeModal();
  };

  // Checklist drag-and-drop is handled by useChecklistDrag inside NoteModal

  /** -------- Tags list (unique + counts) -------- */
  // Keep allNotesForTags in sync with notes when in normal view,
  // so tags remain visible when navigating to archive/trash
  useEffect(() => {
    if (notesAreRegular.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the regular list each time it changes, whatever loaded it
      setAllNotesForTags(notes);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- notesAreRegular is a ref
  }, [notes]);

  const tagsWithCounts = useMemo(() => {
    const map = new Map();
    for (const n of allNotesForTags) {
      for (const t of n.tags || []) {
        const key = String(t).trim();
        if (!key) continue;
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()));
  }, [allNotesForTags]);

  /** -------- Derived lists (search + tag filter) -------- */
  // Deferred so fast typing in the search box stays responsive: the input
  // updates immediately (search) while the expensive grid re-filter/re-render
  // runs as a non-urgent update. No visual change — results settle a frame
  // later only under heavy load.
  const deferredSearch = useDeferredValue(search);
  const filtered = useMemo(() => {
    const q = deferredSearch.toLowerCase();
    const tag =
      tagFilter === ALL_IMAGES
        ? null
        : tagFilter === "ARCHIVED"
          ? null
          : tagFilter === "TRASHED"
            ? null
            : tagFilter === REMINDERS
              ? null
              : tagFilter?.toLowerCase() || null;

    return notes.filter((n) => {
      if (tagFilter === ALL_IMAGES) {
        if (!(n.images && n.images.length)) return false;
      } else if (tagFilter === "ARCHIVED") {
        // In archived view, show all notes (they're already filtered by the backend)
        // Just apply search filter
      } else if (tagFilter === "TRASHED") {
        // In trashed view, show all notes (they're already filtered by the backend)
        // Just apply search filter
      } else if (tagFilter === REMINDERS) {
        // Reminders view: a client-side lens over the regular notes list —
        // keep only notes that carry a reminder. They remain visible in the
        // normal view too (this filter doesn't load a separate data set).
        if (!n.reminderAt) return false;
      } else if (activeTagFilters.length > 0) {
        // Multi-tag filter : la note doit contenir AU MOINS UN des tags sélectionnés
        const noteTags = (n.tags || []).map((t) => String(t).toLowerCase());
        if (!activeTagFilters.some((f) => noteTags.includes(f.toLowerCase()))) {
          return false;
        }
      } else if (
        tag &&
        !(n.tags || []).some((t) => String(t).toLowerCase() === tag)
      ) {
        return false;
      }
      if (!q) return true;
      const t = (n.title || "").toLowerCase();
      const c = (n.content || "").toLowerCase();
      const tagsStr = (n.tags || []).join(" ").toLowerCase();
      const items = (n.items || [])
        .map((i) => i.text)
        .join(" ")
        .toLowerCase();
      const images = (n.images || [])
        .map((im) => im.name)
        .join(" ")
        .toLowerCase();
      return (
        t.includes(q) ||
        c.includes(q) ||
        tagsStr.includes(q) ||
        items.includes(q) ||
        images.includes(q)
      );
    });
  }, [notes, deferredSearch, tagFilter, activeTagFilters]);
  const pinned = useMemo(() => filtered.filter((n) => n.pinned), [filtered]);
  const others = useMemo(() => filtered.filter((n) => !n.pinned), [filtered]);
  const filteredEmptyWithSearch =
    filtered.length === 0 &&
    notes.length > 0 &&
    !!(deferredSearch || (tagFilter && tagFilter !== "ARCHIVED" && tagFilter !== "TRASHED") || activeTagFilters.length > 0);
  const allEmpty = notes.length === 0;

  /** -------- Modal JSX -------- */
  // Side-by-side mode is active whenever a secondary note id is set.
  // Both panes render under a shared scrim overlay (the .sbs-active body
  // class drives split-mode CSS so the two scrims align as flex siblings
  // and each note panel keeps its native modal dimensions).
  const sbsActive = !!sbsSecondaryId;

  // Body-level classes that drive split-mode CSS:
  //   .sbs-active            — both panes are mounted
  //   .sbs-closing-left      — left is fading out, right glides to centre
  //   .sbs-closing-right     — right is fading out, left glides to centre
  // Use useLayoutEffect (not useEffect) so the class change is applied
  // BEFORE the next paint, in the same commit cycle as data-split-* prop
  // updates on the primary scrim. This prevents an intermediate paint
  // where body still has sbs-active/sbs-closing-left while the primary's
  // data-split-mode has already become undefined — the surviving right
  // pane's anchor-x rule would briefly flip from the recenter (0) back
  // to its default (calc(50%+gap/2)), kicking it rightward for one frame
  // before the rule drops entirely.
  useLayoutEffect(() => {
    const body = document.body;
    body.classList.toggle("sbs-active", sbsActive);
    body.classList.toggle("sbs-closing-left", sbsActive && sbsClosingSide === "left");
    body.classList.toggle("sbs-closing-right", sbsActive && sbsClosingSide === "right");
    body.classList.toggle("sbs-ai-left", sbsActive && sbsAiActiveSide === "left");
    body.classList.toggle("sbs-ai-right", sbsActive && sbsAiActiveSide === "right");
    return () => {
      body.classList.remove("sbs-active");
      body.classList.remove("sbs-closing-left");
      body.classList.remove("sbs-closing-right");
      body.classList.remove("sbs-ai-left");
      body.classList.remove("sbs-ai-right");
    };
  }, [sbsActive, sbsClosingSide, sbsAiActiveSide]);

  // In SBS mode the left pane's X / scrim click no longer tears down the
  // primary modal — it just animates the left half out and hands B to
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
      // eslint-disable-next-line react-hooks/immutability -- false positive: the handler only touches freshlyCreatedNoteRef, a ref from useDraftNote, when called
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
      // eslint-disable-next-line react-hooks/immutability -- false positive: the handler only touches freshlyCreatedNoteRef, a ref from useDraftNote, when called
      saveModal={saveModal}
      // eslint-disable-next-line react-hooks/immutability -- false positive: the handler only touches freshlyCreatedNoteRef, a ref from useDraftNote, when called
      deleteModal={deleteModal}
      restoreFromTrash={restoreFromTrash}
      // eslint-disable-next-line react-hooks/immutability -- false positive: the handler only touches freshlyCreatedNoteRef, a ref from useDraftNote, when called
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
      // Per-note AI chat — kebab entry, panel state, send/close handlers
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
          // ~500 ms it takes refreshLockStatus to round-trip — long
          // enough for the user to wonder if anything actually
          // happened. The next status fetch will reset
          // lockBannerDismissed back to false in the effect above
          // (since the server reports locked=false), so the banner
          // is ready to show again the next time the server locks.
          setLockBannerDismissed(true);
          setLockOverlayOpen(false);
          refreshLockStatus();
          // Passkey unlock returns { ok, token, user, ... } — when the
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
            className="px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
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
          sidebar — same horizontal alignment as the main content. */}
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
          with the admin panel closed — and on next login for any that
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
            // eslint-disable-next-line react-hooks/immutability -- false positive: the handler only touches pendingDraftRef, a ref from useDraftNote, when called
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
          onRequestClose={onSbsRightClosed}
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
          idbGetNote={idbGetNote}
          idbPutNote={idbPutNote}
          idbDeleteNote={idbDeleteNote}
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
          dark pill at the bottom of the screen — the platform's
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
          // centre sheet is on screen — every active toast is already
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
