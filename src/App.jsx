import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  useCallback,
} from "react";
import { askAI } from "./ai";
import { t } from "./i18n";
import Masonry from "react-masonry-css";
import SyncStatusIcon from "./sync/SyncStatusIcon.jsx";
import { SyncEngine } from "./sync/syncEngine.js";
import {
  getAllNotes as idbGetAllNotes,
  getNote as idbGetNote,
  putNote as idbPutNote,
  putNotes as idbPutNotes,
  deleteNote as idbDeleteNote,
  enqueue as idbEnqueue,
  getQueueStats,
  hasPendingChanges,
  clearQueueForUser as idbClearQueueForUser,
  clearNotesForSession as idbClearNotesForSession,
  purgeQueueForNote as idbPurgeQueueForNote,
} from "./sync/localDb.js";
import { api, getAuth, setAuth, AUTH_KEY } from "./utils/api.js";
import { mdForDownload } from "./utils/markdown.jsx";
import { uid, sanitizeFilename, downloadText, triggerBlobDownload, ensureJSZip, imageExtFromDataURL, fileToCompressedDataURL, setThemeColor } from "./utils/helpers.js";
import { textToChecklistItems, checklistItemsToText } from "./utils/noteConversion.js";
import { isRichContent, contentToPlain, serializeRichContent, legacyMarkdownToRichDoc } from "./utils/richText.js";
import { globalCSS } from "./styles/globalCSS.js";
import { ALL_IMAGES } from "./utils/constants.js";
import { ColorDot } from "./components/common/ColorDot.jsx";
import { handleSmartEnter } from "./components/common/FormatToolbar.jsx";
import DrawingPreview from "./components/common/DrawingPreview.jsx";
import UserAvatar from "./components/common/UserAvatar.jsx";
import TooltipPortal from "./components/common/TooltipPortal.jsx";
import AuthShell from "./components/auth/AuthShell.jsx";
import LoginView from "./components/auth/LoginView.jsx";
import RegisterView from "./components/auth/RegisterView.jsx";
import SecretLoginView from "./components/auth/SecretLoginView.jsx";
import ChangePasswordModal from "./components/auth/ChangePasswordModal.jsx";
import TagSidebar from "./components/panels/TagSidebar.jsx";
import SettingsPanel from "./components/panels/SettingsPanel.jsx";
import AdminPanel from "./components/panels/AdminPanel.jsx";
import NoteCard from "./components/notes/NoteCard.jsx";
import AdminView from "./components/notes/AdminView.jsx";
import NotesUI from "./components/notes/NotesUI.jsx";
import GenericConfirmDialog from "./components/common/GenericConfirmDialog.jsx";
import ToastContainer from "./components/common/ToastContainer.jsx";
import FloatingCardsBackground from "./components/common/FloatingCardsBackground.jsx";
import NoteModal from "./components/modal/NoteModal.jsx";
import useModalState from "./hooks/useModalState.js";
import useDraftNote from "./hooks/useDraftNote.js";
import useAdminActions from "./hooks/useAdminActions.js";
import useImportExport from "./hooks/useImportExport.js";
import useCollaboration from "./hooks/useCollaboration.js";
import useFormatting from "./hooks/useFormatting.js";

/** ---------- App ---------- */
export default function App() {
  const [route, setRoute] = useState(window.location.hash || "#/login");

  // auth session { token, user }
  const [session, setSession] = useState(getAuth());
  const token = session?.token;
  const currentUser = session?.user || null;
  const sessionId = session?.sessionId || null;

  // Password change state
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  // Theme
  const [dark, setDark] = useState(false);

  // Screen width for responsive behavior
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const isMobileDevice = Math.min(windowWidth, windowHeight) < 500;
  const isLandscapeMobile = windowWidth > windowHeight && windowHeight < 500;

  // Detect Android WebView (APK) — force mobile layout on tablets
  const isWebView = !!window.AndroidTheme;

  // Notes & search
  const [notes, setNotes] = useState([]);
  const [allNotesForTags, setAllNotesForTags] = useState([]);
  const [search, setSearch] = useState("");

  // ─── Local-first sync state ───
  // Canonical reset shape — used at init, cleanup, and sign-out to avoid divergence.
  const SYNC_STATUS_RESET = useMemo(() => ({
    syncState: "checking", serverReachable: null, hasPendingChanges: false, isSyncing: false,
    lastSyncAt: null, lastSyncError: null,
    pending: 0, processing: 0, failed: 0, total: 0, items: [],
  }), []);
  const [syncStatus, setSyncStatus] = useState(SYNC_STATUS_RESET);
  const syncEngineRef = useRef(null);
  const reconnectSseRef = useRef(null); // called when server recovers to revive SSE
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const currentUserIdRef = useRef(currentUser?.id);
  currentUserIdRef.current = currentUser?.id;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const isAdminRef = useRef(!!currentUser?.is_admin);
  isAdminRef.current = !!currentUser?.is_admin;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // Tag filter & sidebar
  const [tagFilter, setTagFilter] = useState(null); // null = all, ALL_IMAGES = only notes with images
  const tagFilterRef = useRef(tagFilter);
  const [activeTagFilters, setActiveTagFilters] = useState([]); // multi-tag filter
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarHidden, setDesktopSidebarHidden] = useState(false);
  const [alwaysShowSidebarOnWide, setAlwaysShowSidebarOnWide] = useState(() => {
    try {
      const stored = localStorage.getItem("sidebarAlwaysVisible");
      // Use localStorage value if available, otherwise null (wait for server)
      return stored !== null ? stored === "true" : null;
    } catch (e) {
      return null;
    }
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      return parseInt(localStorage.getItem("sidebarWidth")) || 288;
    } catch (e) {
      return 288;
    }
  });

  // Floating cards decoration toggle
  const [floatingCardsEnabled, setFloatingCardsEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem("floatingCardsEnabled");
      if (stored !== null) return stored === "true";
      // Default: enabled on desktop (pointer:fine), disabled on mobile/tablet
      return window.matchMedia?.("(pointer: fine)").matches ?? true;
    } catch (e) {
      return true;
    }
  });
  const toggleFloatingCards = useCallback(() => {
    setFloatingCardsEnabled((v) => {
      const next = !v;
      try { localStorage.setItem("floatingCardsEnabled", String(next)); } catch (e) {}
      return next;
    });
  }, []);

  // Local AI
  const [localAiEnabled, setLocalAiEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem("localAiEnabled");
      return stored === null ? false : stored === "true";
    } catch (e) {
      return false;
    }
  });
  // Checklist insert position: "top" or "bottom"
  const [checklistInsertPosition, setChecklistInsertPosition] = useState(() => {
    try {
      const stored = localStorage.getItem("checklistInsertPosition");
      return stored === "bottom" ? "bottom" : "top";
    } catch (e) {
      return "top";
    }
  });
  // Behavior when the user deletes a section: "cascade" (also delete
  // items) or "keep" (move items to the default section).
  const [checklistRemoveSectionBehavior, setChecklistRemoveSectionBehavior] = useState(() => {
    try {
      const stored = localStorage.getItem("checklistRemoveSectionBehavior");
      return stored === "keep" ? "keep" : "cascade";
    } catch (e) {
      return "cascade";
    }
  });
  // Edge-to-edge landscape: extend content under status bar on the left
  const [edgeToEdgeLandscape, setEdgeToEdgeLandscape] = useState(() => {
    try {
      const stored = localStorage.getItem("edgeToEdgeLandscape");
      return stored === null ? true : stored === "true";
    } catch (e) {
      return true;
    }
  });
  const [aiResponse, setAiResponse] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiLoadingProgress, setAiLoadingProgress] = useState(null);

  // Composer
  const [composerType, setComposerType] = useState("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [composerTagList, setComposerTagList] = useState([]);
  const [composerTagInput, setComposerTagInput] = useState("");
  const [composerTagFocused, setComposerTagFocused] = useState(false);
  const composerTagInputRef = useRef(null);
  const [composerColor, setComposerColor] = useState("default");
  const [composerImages, setComposerImages] = useState([]);
  const contentRef = useRef(null);
  const composerFileRef = useRef(null);

  // Formatting (composer)
  const [showComposerFmt, setShowComposerFmt] = useState(false);
  const composerFmtBtnRef = useRef(null);

  // Checklist composer
  const [clItems, setClItems] = useState([]);
  const [clInput, setClInput] = useState("");

  // Drawing composer
  const [composerDrawingData, setComposerDrawingData] = useState({
    paths: [],
    dimensions: null,
  });

  // ─── Ref for closeModal (passed to useModalState for Escape handler) ───
  const closeModalRef = useRef(null);

  // ─── Shared formatting helper (used by both composer and modal) ───
  const runFormat = useFormatting();

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
    modalMenuOpen, setModalMenuOpen,
    confirmDeleteOpen, setConfirmDeleteOpen,
    isModalClosing, setIsModalClosing,
    modalClosingTimerRef,
    mItems, setMItems,
    mInput, setMInput,
    mDrawingData, setMDrawingData,
    showModalFmt, setShowModalFmt,
    showModalColorPop, setShowModalColorPop,
    modalKebabOpen, setModalKebabOpen,
    imgViewOpen, setImgViewOpen, imgViewIndex,
    mobileNavVisible,
    modalScrollable,
    // Refs
    modalTagInputRef, modalTagBtnRef, suppressTagBlurRef,
    mBodyRef, modalFileRef, modalFmtBtnRef, modalColorBtnRef,
    checklistDragId, modalMenuBtnRef, scrimClickStartRef,
    noteViewRef, modalScrollRef, savedModalScrollRatioRef,
    modalHistoryRef,
    // Derived
    activeNoteObj, editedStamp, modalHasChanges,
    // Tag helpers
    addTags, handleTagKeyDown, handleTagBlur, handleTagPaste,
    // Image viewer
    openImageViewer, closeImageViewer, nextImage, prevImage, resetMobileNav,
    // Handlers
    onModalBodyClick, isCollaborativeNote, formatModal, resizeModalTextarea,
  } = useModalState({ notes, currentUser, closeModalRef, runFormat });

  // Generic confirmation dialog
  const [genericConfirmOpen, setGenericConfirmOpen] = useState(false);
  const [genericConfirmConfig, setGenericConfirmConfig] = useState({});

  // Toast notification system
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = "success", duration = 3000) => {
    const id = Date.now();
    const toast = { id, message, type };
    setToasts((prev) => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }

    return id;
  };

  // Generic confirmation dialog helper
  const showGenericConfirm = (config) => {
    setGenericConfirmConfig(config);
    setGenericConfirmOpen(true);
  };

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

  // Clear data when switching composer types
  useEffect(() => {
    if (composerType === "text") {
      setClItems([]);
      setClInput("");
      setComposerDrawingData({ paths: [], dimensions: null });
    } else if (composerType === "checklist") {
      setComposerDrawingData({ paths: [], dimensions: null });
    } else if (composerType === "draw") {
      setClItems([]);
      setClInput("");
    }
  }, [composerType]);

  // Collaboration (ref must be declared before hook)
  const collaboratorInputRef = useRef(null);

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

  // Composer collapse + refs
  const [composerCollapsed, setComposerCollapsed] = useState(true);
  const titleRef = useRef(null);
  const composerRef = useRef(null);

  // Color dropdown (composer)
  const colorBtnRef = useRef(null);
  const [showColorPop, setShowColorPop] = useState(false);

  // Loading state for notes
  const [notesLoading, setNotesLoading] = useState(!!token);
  const notesAreRegular = useRef(true); // tracks whether notes[] holds regular (non-archive/trash) notes

  // ─── Per-noteId lease-based protection against SSE overwrite ───
  // Each local mutation acquires a unique lease with a monotonic sequence number.
  // A note is protected as long as it holds at least one active lease.
  // On successful enqueue, the caller releases its lease AND prunes all older
  // leases for the same note (seq <= its own), clearing zombie leases left by
  // earlier failed operations. Newer leases (higher seq) are never touched.
  // Map<noteId, Map<leaseId, { seq: number }>>
  const localLeaseRef = useRef(new Map());
  const leaseSeqRef = useRef(0);

  const acquireLocalLease = (noteId) => {
    const seq = ++leaseSeqRef.current;
    const leaseId = `L${seq}`;
    const map = localLeaseRef.current;
    if (!map.has(noteId)) map.set(noteId, new Map());
    map.get(noteId).set(leaseId, { seq });
    return leaseId;
  };
  const releaseLocalLease = (noteId, leaseId) => {
    const map = localLeaseRef.current;
    const leases = map.get(noteId);
    if (!leases) return;
    leases.delete(leaseId);
    if (leases.size === 0) map.delete(noteId);
  };
  // Release own lease + prune all older leases for the same note.
  // Called after a successful enqueueAndSync — any earlier failed lease on this
  // note is now superseded because a newer mutation reached the queue safely.
  const releaseLocalLeaseWithPrune = (noteId, leaseId) => {
    const map = localLeaseRef.current;
    const leases = map.get(noteId);
    if (!leases) return;
    const own = leases.get(leaseId);
    const maxSeq = own ? own.seq : -1;
    // Collect IDs to delete (cannot mutate Map during iteration in all engines)
    const toDelete = [];
    for (const [lid, meta] of leases) {
      if (meta.seq <= maxSeq) toDelete.push(lid);
    }
    for (const lid of toDelete) leases.delete(lid);
    if (leases.size === 0) map.delete(noteId);
  };
  const isNoteLocallyProtected = (noteId) => {
    const leases = localLeaseRef.current.get(noteId);
    return !!leases && leases.size > 0;
  };
  const clearAllLocalLeases = () => {
    localLeaseRef.current.clear();
  };
  // Acquire lease → await enqueue → prune on success. Lease stays on failure.
  // Caller acquires lease BEFORE local mutations, passes leaseId here.
  const enqueueWithLease = async (noteId, syncAction, leaseId) => {
    try {
      await enqueueAndSync(syncAction);
    } catch (e) {
      return false; // lease stays active — SSE protection maintained
    }
    releaseLocalLeaseWithPrune(noteId, leaseId);
    return true;
  };
  // ─── Pending reorder leases ───
  // Reorder queue items use noteId:"__reorder__", so hasPendingChanges(realNoteId)
  // returns false after enqueue. We hold per-note leases here until onSyncComplete
  // confirms the reorder server-side. Map<reorderToken, Array<{noteId, leaseId}>>
  const pendingReorderLeasesRef = useRef(new Map());
  const reorderTokenSeqRef = useRef(0);

  // ─── Permanent-delete tombstones ───
  // When a note is permanently deleted locally but not yet confirmed by the
  // server, its id lives here. Loaders and patchSingleNote skip tombstoned
  // notes entirely — they cannot reappear from server data while pending.
  // Cleared per-note by onSyncComplete after server confirms, or globally
  // by cleanupClientSession on sign-out.
  const localDeleteTombstoneRef = useRef(new Set());
  const addDeleteTombstone = (noteId) => localDeleteTombstoneRef.current.add(String(noteId));
  const removeDeleteTombstone = (noteId) => localDeleteTombstoneRef.current.delete(String(noteId));
  const isDeleteTombstoned = (noteId) => localDeleteTombstoneRef.current.has(String(noteId));

  // Remove lazy loading state

  // -------- Multi-select state --------
  const [multiMode, setMultiMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]); // array of string ids
  const isSelected = (id) => selectedIds.includes(String(id));
  const onStartMulti = () => {
    setMultiMode(true);
    setSelectedIds([]);
  };
  const onExitMulti = () => {
    setMultiMode(false);
    setSelectedIds([]);
  };
  const onToggleSelect = (id, checked) => {
    const sid = String(id);
    setSelectedIds((prev) =>
      checked
        ? Array.from(new Set([...prev, sid]))
        : prev.filter((x) => x !== sid),
    );
  };
  const onSelectAllPinned = () => {
    const ids = notes.filter((n) => n.pinned).map((n) => String(n.id));
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  };
  const onSelectAllOthers = () => {
    const ids = notes.filter((n) => !n.pinned).map((n) => String(n.id));
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  };
  const onSelectAll = (filteredNotes) => {
    const filteredIds = filteredNotes.map((n) => String(n.id));
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : filteredIds);
  };

  // -------- View mode: Grid vs List --------
  const [listView, setListView] = useState(() => {
    try {
      return localStorage.getItem("viewMode") === "list";
    } catch (e) {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("viewMode", listView ? "list" : "grid");
    } catch (e) {}
  }, [listView]);
  const onToggleViewMode = () => setListView((v) => !v);

  // Load user settings from server on login
  const sidebarSettingsLoadedRef = useRef(false);
  useEffect(() => {
    if (!token) return;
    sidebarSettingsLoadedRef.current = false;
    // Immediately hide sidebar while loading server preference
    try {
      if (localStorage.getItem("sidebarAlwaysVisible") === null) {
        setAlwaysShowSidebarOnWide(null);
      }
    } catch (e) {}
    (async () => {
      try {
        const settings = await api("/user/settings", { token });
        if (settings && typeof settings.alwaysShowSidebarOnWide === "boolean") {
          setAlwaysShowSidebarOnWide(settings.alwaysShowSidebarOnWide);
          localStorage.setItem("sidebarAlwaysVisible", String(settings.alwaysShowSidebarOnWide));
        } else {
          // No server setting yet — default to true (new user)
          setAlwaysShowSidebarOnWide(true);
        }
        if (settings && typeof settings.floatingCardsEnabled === "boolean") {
          setFloatingCardsEnabled(settings.floatingCardsEnabled);
          localStorage.setItem("floatingCardsEnabled", String(settings.floatingCardsEnabled));
        }
        if (settings?.checklistInsertPosition) {
          setChecklistInsertPosition(settings.checklistInsertPosition);
          localStorage.setItem("checklistInsertPosition", settings.checklistInsertPosition);
        }
        if (settings?.checklistRemoveSectionBehavior === "keep" || settings?.checklistRemoveSectionBehavior === "cascade") {
          setChecklistRemoveSectionBehavior(settings.checklistRemoveSectionBehavior);
          localStorage.setItem("checklistRemoveSectionBehavior", settings.checklistRemoveSectionBehavior);
        }
        if (typeof settings?.edgeToEdgeLandscape === "boolean") {
          setEdgeToEdgeLandscape(settings.edgeToEdgeLandscape);
          localStorage.setItem("edgeToEdgeLandscape", String(settings.edgeToEdgeLandscape));
        }
      } catch (e) {
        // Network error — default to true
        setAlwaysShowSidebarOnWide((prev) => prev === null ? true : prev);
      } finally {
        sidebarSettingsLoadedRef.current = true;
      }
    })();
  }, [token]);

  // Save sidebar settings to localStorage and server
  useEffect(() => {
    try {
      localStorage.setItem(
        "sidebarAlwaysVisible",
        String(alwaysShowSidebarOnWide),
      );
    } catch (e) {}
    // Only sync to server after initial load from server is done
    if (!sidebarSettingsLoadedRef.current) return;
    if (token) {
      api("/user/settings", {
        method: "PATCH",
        token,
        body: { alwaysShowSidebarOnWide },
      }).catch(() => {});
    }
  }, [alwaysShowSidebarOnWide]);

  // Save floating cards preference to localStorage and server
  useEffect(() => {
    try { localStorage.setItem("floatingCardsEnabled", String(floatingCardsEnabled)); } catch (e) {}
    if (!sidebarSettingsLoadedRef.current) return;
    if (token) {
      api("/user/settings", {
        method: "PATCH",
        token,
        body: { floatingCardsEnabled },
      }).catch(() => {});
    }
  }, [floatingCardsEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem("sidebarWidth", String(sidebarWidth));
    } catch (e) {}
  }, [sidebarWidth]);

  useEffect(() => {
    try {
      localStorage.setItem("localAiEnabled", String(localAiEnabled));
    } catch (e) {}
    if (!localAiEnabled) setAiResponse(null);
  }, [localAiEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem("checklistInsertPosition", checklistInsertPosition);
    } catch (e) {}
    if (!sidebarSettingsLoadedRef.current) return;
    if (token) {
      api("/user/settings", {
        method: "PATCH",
        token,
        body: { checklistInsertPosition },
      }).catch(() => {});
    }
  }, [checklistInsertPosition]);

  useEffect(() => {
    try {
      localStorage.setItem("checklistRemoveSectionBehavior", checklistRemoveSectionBehavior);
    } catch (e) {}
    if (!sidebarSettingsLoadedRef.current) return;
    if (token) {
      api("/user/settings", {
        method: "PATCH",
        token,
        body: { checklistRemoveSectionBehavior },
      }).catch(() => {});
    }
  }, [checklistRemoveSectionBehavior]);

  // Edge-to-edge landscape: save + dynamically toggle body padding-left
  useEffect(() => {
    try { localStorage.setItem("edgeToEdgeLandscape", String(edgeToEdgeLandscape)); } catch (e) {}
    document.body.style.paddingLeft = edgeToEdgeLandscape ? "" : "env(safe-area-inset-left)";
    if (!sidebarSettingsLoadedRef.current) return;
    if (token) {
      api("/user/settings", {
        method: "PATCH",
        token,
        body: { edgeToEdgeLandscape },
      }).catch(() => {});
    }
  }, [edgeToEdgeLandscape]);

  // Window resize listener for responsive sidebar behavior
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Collapse composer when clicking outside
  useEffect(() => {
    if (composerCollapsed) return;
    const handleClickOutside = (e) => {
      if (composerRef.current && !composerRef.current.contains(e.target)) {
        setComposerCollapsed(true);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [composerCollapsed]);

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
          invalidateTrashedNotesCache();
          setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
          onExitMulti();
          showToast(t("bulkDeletedSuccess").replace("{count}", String(count)), "success");
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
          invalidateNotesCache();
          invalidateArchivedNotesCache();
          invalidateTrashedNotesCache();
          setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
          onExitMulti();
          showToast(t("bulkTrashedSuccess").replace("{count}", String(count)), "success");
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
        invalidateTrashedNotesCache();
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
    invalidateNotesCache();
    invalidateArchivedNotesCache();
  };

  const onBulkRestore = async () => {
    if (!selectedIds.length) return;
    const count = selectedIds.length;
    const nowIso = new Date().toISOString();
    // Pre-load active notes once for position calculation
    let activeNotes = [];
    try {
      activeNotes = (await idbGetAllNotes(currentUser?.id, sessionId, "active"))
        .sort((a, b) => (+b.position || 0) - (+a.position || 0));
    } catch (e) {}
    for (const id of selectedIds) {
      const nid = String(id);
      const leaseId = acquireLocalLease(nid);
      try {
        const existing = await idbGetNote(nid, currentUser?.id, sessionId);
        if (existing) {
          // Compute restored position by timestamp among active notes
          const noteTs = new Date(existing.timestamp).getTime() || 0;
          let restoredPosition = existing.position;
          if (activeNotes.length > 0) {
            let insertIdx = activeNotes.length;
            for (let i = 0; i < activeNotes.length; i++) {
              const ts = new Date(activeNotes[i].timestamp).getTime() || 0;
              if (noteTs >= ts) { insertIdx = i; break; }
            }
            if (insertIdx === 0) {
              restoredPosition = (+activeNotes[0].position || 0) + 1;
            } else if (insertIdx >= activeNotes.length) {
              restoredPosition = (+activeNotes[activeNotes.length - 1].position || 0) - 1;
            } else {
              restoredPosition = ((+activeNotes[insertIdx - 1].position || 0) + (+activeNotes[insertIdx].position || 0)) / 2;
            }
          }
          await idbPutNote({ ...existing, trashed: false, position: restoredPosition, client_updated_at: nowIso }, currentUser?.id, sessionId);
        }
      } catch (e) { console.error(e); }
      await enqueueWithLease(nid, { type: "restore", noteId: nid, payload: { client_updated_at: nowIso } }, leaseId);
    }
    invalidateNotesCache();
    invalidateArchivedNotesCache();
    invalidateTrashedNotesCache();
    setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
    onExitMulti();
    showToast(t("bulkRestoredSuccess").replace("{count}", String(count)), "success");
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
    invalidateNotesCache();
    invalidateArchivedNotesCache();

    if (!isArchiving && tagFilter === "ARCHIVED") {
      // Unarchiving from archived view — remove them from current list and switch view
      setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
      setTagFilter(null);
    } else if (isArchiving) {
      // Archiving from normal view — remove them from current list
      setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
    }

    onExitMulti();
    showToast(t(isArchiving ? "bulkArchivedSuccess" : "bulkUnarchivedSuccess").replace("{count}", String(count)), "success");
  };

  const onUpdateChecklistItem = async (noteId, itemId, checked) => {
    const note = notes.find((n) => String(n.id) === String(noteId));
    if (!note) return;

    const nid = String(noteId);
    const leaseId = acquireLocalLease(nid);
    const nowIso = new Date().toISOString();

    const updatedItems = (note.items || []).map((item) =>
      item.id === itemId ? { ...item, done: checked } : item,
    );
    const updatedNote = { ...note, items: updatedItems };

    // Local-first: update UI + IndexedDB, then enqueue
    setNotes((prev) =>
      prev.map((n) => (String(n.id) === nid ? updatedNote : n)),
    );
    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) await idbPutNote({ ...existing, items: updatedItems, client_updated_at: nowIso }, currentUser?.id, sessionId);
    } catch (e) { console.error(e); }

    invalidateNotesCache();
    invalidateArchivedNotesCache();
    await enqueueWithLease(nid, { type: "patch", noteId: nid, payload: { items: updatedItems, type: "checklist", content: "", client_updated_at: nowIso } }, leaseId);
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
      alert(e.message || t("zipDownloadFailed"));
    }
  };

  // SSE connection status
  const [sseConnected, setSseConnected] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Admin panel state (hook)
  const {
    adminPanelOpen, setAdminPanelOpen,
    adminSettings, setAdminSettings,
    allUsers,
    pendingUsers,
    newUserForm, setNewUserForm,
    updateAdminSettings, createUser, deleteUser, updateUser,
    loadPendingUsers, approvePendingUser, rejectPendingUser,
    openAdminPanel,
  } = useAdminActions(token, {
    onSettingsUpdated: (settings) => {
      if (typeof settings.loginSlogan === 'string') setLoginSlogan(settings.loginSlogan);
    },
  });
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [loginSlogan, setLoginSlogan] = useState("");
  const [loginProfiles, setLoginProfiles] = useState([]);

  // Settings panel state
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

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

  // Router
  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || "#/login");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const navigate = (to) => {
    if (window.location.hash !== to) window.location.hash = to;
    setRoute(to);
  };

  // Theme init/toggle
  useEffect(() => {
    // Legacy localStorage keys from previous iterations — drop them so old installs reset cleanly.
    // The manual preference now lives in sessionStorage so it's scoped to the current app session
    // (preserved while backgrounded, cleared on full close/swipe-kill → next open follows system).
    localStorage.removeItem("glass-keep-dark-mode");
    localStorage.removeItem("glass-keep-dark-mode-manual");

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const manualPref = sessionStorage.getItem("glass-keep-dark-mode-manual");
    const savedDark = manualPref !== null ? manualPref === "true" : (mq?.matches ?? false);
    setDark(savedDark);
    document.documentElement.classList.toggle("dark", savedDark);
    setThemeColor(savedDark ? "#1a1a1a" : "#f0e8ff");

    // Apply dark mode from system/bridge without persisting — only toggleDark marks a manual pref
    const applyDark = (isDark) => {
      setDark(isDark);
      document.documentElement.classList.toggle("dark", isDark);
      // Skip if note modal is open — NoteModal effect handles its own color
      if (!window.__noteModalOpen) setThemeColor(isDark ? "#1a1a1a" : "#f0e8ff");
    };
    const hasManualPref = () => sessionStorage.getItem("glass-keep-dark-mode-manual") !== null;

    // Android WebView bridge: system preference doesn't propagate via matchMedia in WebView,
    // so the native side calls this. Ignored when the user has set a manual preference.
    window.__setDarkMode = (isDark) => {
      if (hasManualPref()) return;
      applyDark(isDark);
    };

    if (!mq) return () => { delete window.__setDarkMode; };
    // Only follow system changes when no manual preference is set
    const onChange = (e) => {
      if (hasManualPref()) return;
      applyDark(e.matches);
    };
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      delete window.__setDarkMode;
    };
  }, []);
  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    sessionStorage.setItem("glass-keep-dark-mode-manual", String(next));
    // Skip if note modal is open — NoteModal effect handles its own color
    if (!window.__noteModalOpen) setThemeColor(next ? "#1a1a1a" : "#f0e8ff");
  };

  // Close sidebar with Escape
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  // ─── SyncEngine lifecycle ───
  //
  // CANONICAL SYNC PATH (single source of truth):
  //
  //   User action → IDB write → enqueueAndSync(action) → idbEnqueue → triggerSync
  //     → syncEngineRef.current.processQueue() → HTTP calls → onStatusChange → setSyncStatus
  //
  //   Remote updates: SSE → patchSingleNote(noteId) → hasPendingChanges guard → IDB + setNotes
  //   Retry:          processQueue self-reschedules on retryable failures
  //   Recovery:       healthCheck (adaptive 5s/10s/30s) resets transient failures → processQueue
  //   Manual:         handleSyncNow → syncEngine.forceSync() → healthCheck + reset all + processQueue
  //
  //   State ownership:
  //   - syncStatus (React state)     ← ONLY written by syncEngine.onStatusChange + reset points
  //   - IndexedDB syncQueue          ← ONLY written by idbEnqueue + syncEngine queue updates
  //   - IndexedDB notes store        ← Written by load functions, auto-save, patchSingleNote
  //   - localLeaseRef                 ← Per-noteId lease-based SSE protection (Map<noteId, Map<leaseId, { seq }>>); success prunes older leases
  //   - localDeleteTombstoneRef       ← Set<noteId> of pending permanent deletes; prevents resurrection by loaders/SSE
  //
  useEffect(() => {
    if (!token || !currentUser?.id) {
      if (syncEngineRef.current) {
        syncEngineRef.current.destroy();
        syncEngineRef.current = null;
      }
      setSyncStatus(SYNC_STATUS_RESET);
      return;
    }

    const engine = new SyncEngine({
      getToken: () => tokenRef.current,
      userId: currentUser.id,
      sessionId,
      onStatusChange: (status) => setSyncStatus(status),
      onSyncComplete: async (item, result) => {
        // Reconcile local cache with server response after successful sync.
        // Only act when the server returned useful canonical data.
        try {
          const uid = currentUser?.id;
          const sid = sessionId;
          if (!uid || !sid) return;

          // ── LWW stale write reconciliation ──
          // Server returned { ok, stale: true, note } → our write was older than
          // what's already stored. Replace local state with the canonical server note
          // so the client converges immediately (no full reload needed).
          if (result && result.stale && result.note) {
            const canonical = result.note;
            const nid = String(canonical.id || item.noteId);
            const pending = await hasPendingChanges(nid, uid);
            if (!pending && !isNoteLocallyProtected(nid)) {
              await idbPutNote(canonical, uid, sid);
              // Determine if canonical note belongs in the current view
              const currentFilter = tagFilterRef.current;
              const noteArchived = !!canonical.archived;
              const noteTrashed = !!canonical.trashed;
              const belongsInView =
                (currentFilter === "ARCHIVED" && noteArchived && !noteTrashed) ||
                (currentFilter === "TRASHED" && noteTrashed) ||
                (!currentFilter || (currentFilter !== "ARCHIVED" && currentFilter !== "TRASHED"))
                  && !noteArchived && !noteTrashed;
              setNotes((prev) => {
                const idx = prev.findIndex((n) => String(n.id) === nid);
                if (belongsInView) {
                  if (idx !== -1) {
                    // Update in place
                    const updated = prev.slice();
                    updated[idx] = canonical;
                    return updated;
                  }
                  // Note should appear in this view but isn't present — insert it
                  return sortNotesByRecency([...prev, canonical]);
                }
                // Note doesn't belong in this view — remove if present
                if (idx !== -1) return prev.filter((n) => String(n.id) !== nid);
                return prev;
              });
            }
            return; // stale write fully handled — skip normal reconciliation
          }

          // ── Dropped mutation (404): note gone on server ──
          // Purge local ghost so UI converges without a full reload.
          const DROPPABLE_TYPES = new Set(["update", "patch", "archive", "trash", "restore"]);
          if (result?.dropped && DROPPABLE_TYPES.has(item.type) && item.noteId) {
            const nid = String(item.noteId);
            console.warn(`[Sync] ${item.type} dropped (404) for note ${nid}, purging locally`);
            setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
            try { await idbDeleteNote(nid, uid, sid); } catch {}
            localLeaseRef.current.delete(nid);
            if (String(activeIdRef.current) === nid) {
              forceCloseModalForRemoteDelete(nid);
            }
            return;
          }

          // ── Normal reconciliation: server accepted the write ──
          // Endpoints now return { ok, note } — reconcile with canonical note.
          const serverNote = result?.note || (result?.id ? result : null);

          if (item.type === "create" && serverNote && serverNote.id) {
            const nid = String(serverNote.id);
            const pending = await hasPendingChanges(nid, uid);
            if (!pending) {
              await idbPutNote(serverNote, uid, sid);
              // Determine if the created note belongs in the current view
              const currentFilter = tagFilterRef.current;
              const noteArchived = !!serverNote.archived;
              const noteTrashed = !!serverNote.trashed;
              const belongsInView =
                (currentFilter === "ARCHIVED" && noteArchived && !noteTrashed) ||
                (currentFilter === "TRASHED" && noteTrashed) ||
                (!currentFilter || (currentFilter !== "ARCHIVED" && currentFilter !== "TRASHED"))
                  && !noteArchived && !noteTrashed;
              setNotes((prev) => {
                const idx = prev.findIndex((n) => String(n.id) === nid);
                if (idx !== -1) {
                  const updated = prev.slice();
                  updated[idx] = { ...prev[idx], ...serverNote };
                  return updated;
                }
                // Note not in state (e.g. state cleared by page refresh while
                // queue item was pending) — insert if it belongs in current view
                if (belongsInView) {
                  return sortNotesByRecency([...prev, serverNote]);
                }
                return prev;
              });
            }
          } else if (serverNote && item.noteId) {
            // update/patch/archive/trash/restore — reconcile with canonical note
            const nid = String(item.noteId);
            const pending = await hasPendingChanges(nid, uid);
            if (!pending && !isNoteLocallyProtected(nid)) {
              const canonical = { ...serverNote, id: nid };
              await idbPutNote(canonical, uid, sid);
              // Converge React state: note may have changed view membership
              // (e.g. archive from active view, restore from trash view)
              const currentFilter = tagFilterRef.current;
              const noteArchived = !!canonical.archived;
              const noteTrashed = !!canonical.trashed;
              const belongsInView =
                (currentFilter === "ARCHIVED" && noteArchived && !noteTrashed) ||
                (currentFilter === "TRASHED" && noteTrashed) ||
                (!currentFilter || (currentFilter !== "ARCHIVED" && currentFilter !== "TRASHED"))
                  && !noteArchived && !noteTrashed;
              setNotes((prev) => {
                const idx = prev.findIndex((n) => String(n.id) === nid);
                if (belongsInView) {
                  if (idx !== -1) {
                    const updated = prev.slice();
                    updated[idx] = canonical;
                    return sortNotesByRecency(updated);
                  }
                  return sortNotesByRecency([...prev, canonical]);
                }
                if (idx !== -1) return prev.filter((n) => String(n.id) !== nid);
                return prev;
              });
            }
          } else if (item.type === "permanentDelete" && item.noteId) {
            const nid = String(item.noteId);
            removeDeleteTombstone(nid);
            if (result?.stale && result?.note) {
              // Server rejected delete (note was restored by another device).
              // Re-add the canonical note to local state so it reappears.
              console.warn(`[Sync] permanentDelete stale for ${nid}, note was restored — re-adding`);
              const canonical = result.note;
              await idbPutNote(canonical, uid, sid);
              setNotes((prev) => {
                if (prev.some((n) => String(n.id) === nid)) return prev;
                return sortNotesByRecency([...prev, canonical]);
              });
            } else {
              try { await idbDeleteNote(nid, uid, sid); } catch {}
            }
          } else if (item.type === "reorder" && item.payload?._reorderToken) {
            const token = item.payload._reorderToken;
            const leases = pendingReorderLeasesRef.current.get(token);
            if (leases) {
              for (const { noteId, leaseId } of leases) {
                releaseLocalLeaseWithPrune(noteId, leaseId);
              }
              pendingReorderLeasesRef.current.delete(token);
            }
            // If server rejected the reorder as stale or the item was dropped,
            // reload canonical positions so local state converges.
            if (result?.stale || result?.dropped) {
              console.warn("[Sync] Reorder not applied (stale/dropped), reloading notes for canonical order");
              const cf = tagFilterRef.current;
              if (cf === "ARCHIVED") loadArchivedNotes().catch(() => {});
              else if (cf === "TRASHED") loadTrashedNotes().catch(() => {});
              else loadNotes().catch(() => {});
            }
          }
        } catch (e) {
          console.error("[Sync] reconciliation error:", e);
        }
      },
      onSyncError: (item, err) => console.warn("[Sync] Failed:", item.type, item.noteId, err.message),
      onNoteInaccessible: async (noteId) => {
        // Server returned 403 on a note mutation — access was revoked while
        // we were offline (SSE note_access_revoked was missed). Force full
        // local convergence: remove note from UI, IDB, leases, and modal.
        const nid = String(noteId);
        setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
        idbDeleteNote(nid, currentUser?.id, sessionId).catch(() => {});
        // Queue already purged by the sync engine before calling us
        localLeaseRef.current.delete(nid);
        if (String(activeIdRef.current) === nid) {
          forceCloseModalForRemoteDelete(nid);
        }
      },
    });
    syncEngineRef.current = engine;
    engine.startHealthChecks();

    // Process leftover queue from previous session
    engine.processQueue();

    return () => {
      engine.destroy();
      syncEngineRef.current = null;
    };
  }, [token, currentUser?.id, sessionId]);

  const triggerSync = useCallback(() => {
    syncEngineRef.current?.processQueue();
  }, []);

  // Ref to always hold the latest reload function (avoids stale closure in handleSyncNow)
  const reloadCurrentViewRef = useRef(null);

  const handleSyncNow = useCallback(async () => {
    const engine = syncEngineRef.current;
    await engine?.forceSync();
    // After syncing the queue, also reload notes from server to pick up
    // changes made by other devices (new notes, edits, etc.)
    if (engine?.serverReachable) {
      if (engine) await engine.beginPull();
      try {
        await reloadCurrentViewRef.current?.();
      } finally {
        if (engine) await engine.endPull();
      }
    }
  }, []);

  // Warn before closing if there are pending local changes
  useEffect(() => {
    const handler = (e) => {
      if (syncStatus.hasPendingChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [syncStatus.hasPendingChanges]);

  // ─── Local-first helpers ───
  // Enqueue a sync action and immediately trigger the engine
  const enqueueAndSync = useCallback(async (action) => {
    await idbEnqueue({ ...action, userId: currentUser?.id, sessionId });
    triggerSync();
  }, [triggerSync, currentUser?.id, sessionId]);

  // Cache keys for localStorage
  const NOTES_CACHE_KEY = `glass-keep-notes-${currentUser?.id || "anonymous"}-${sessionId || "no-session"}`;
  const ARCHIVED_NOTES_CACHE_KEY = `glass-keep-archived-${currentUser?.id || "anonymous"}-${sessionId || "no-session"}`;
  const TRASHED_NOTES_CACHE_KEY = `glass-keep-trashed-${currentUser?.id || "anonymous"}-${sessionId || "no-session"}`;
  const CACHE_TIMESTAMP_KEY = `glass-keep-cache-timestamp-${currentUser?.id || "anonymous"}-${sessionId || "no-session"}`;

  // Purge stale localStorage notes caches to free quota (IndexedDB is now primary)
  useEffect(() => {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("glass-keep-notes-") || k.startsWith("glass-keep-archived-") || k.startsWith("glass-keep-trashed-"))) {
          keys.push(k);
        }
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
  }, []);

  // Cache invalidation functions (no-op now, kept for call-site compatibility)
  const invalidateNotesCache = () => {};

  const invalidateArchivedNotesCache = () => {};
  const invalidateTrashedNotesCache = () => {};

  const uniqueById = (arr) => {
    const m = new Map();
    for (const n of Array.isArray(arr) ? arr : []) {
      if (!n) continue;
      m.set(String(n.id), n);
    }
    return Array.from(m.values());
  };
  const persistNotesCache = () => {};
  // Consistent ordering: pinned first, then by position (server-persisted DnD),
  // fallback to updated_at/timestamp when position is missing
  const sortNotesByRecency = (arr) => {
    try {
      const list = Array.isArray(arr) ? arr.slice() : [];
      return list.sort((a, b) => {
        const ap = a?.pinned ? 1 : 0;
        const bp = b?.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap; // pinned first
        const apos = Number.isFinite(+a?.position) ? +a.position : null;
        const bpos = Number.isFinite(+b?.position) ? +b.position : null;
        if (
          apos != null &&
          bpos != null &&
          !Number.isNaN(apos) &&
          !Number.isNaN(bpos)
        ) {
          const posDiff = bpos - apos;
          if (posDiff !== 0) return posDiff; // higher position first (most recent/top)
        }
        const at = new Date(a?.updated_at || a?.timestamp || 0).getTime();
        const bt = new Date(b?.updated_at || b?.timestamp || 0).getTime();
        return bt - at; // fallback newest first
      });
    } catch {
      return Array.isArray(arr) ? arr : [];
    }
  };

  // Load notes
  const handleAiSearch = async (question) => {
    if (!question || question.trim().length < 3) return;
    setIsAiLoading(true);
    setAiResponse(null);
    setAiLoadingProgress(0);

    try {
      const answer = await askAI(question, notes, (progress) => {
        if (progress.status === "progress") {
          setAiLoadingProgress(progress.progress);
        } else if (progress.status === "ready") {
          setAiLoadingProgress(100);
        }
      });
      setAiResponse(answer);
    } catch (err) {
      console.error("AI Error:", err);
      setAiResponse(
        "Sorry, I encountered an error while processing your request.",
      );
    } finally {
      setIsAiLoading(false);
      setAiLoadingProgress(null);
    }
  };

  // Helper: combines queue-based protection (hasPendingChanges, async/IDB) with
  // in-memory lease protection (isNoteLocallyProtected, sync/ref) and delete
  // tombstones. Used as both early snapshot AND late "final guard before write"
  // to close TOCTOU races where protection appears between check and write.
  const isProtectedFromServerOverwrite = async (noteId, userId) => {
    if (isDeleteTombstoned(noteId)) return true;
    if (isNoteLocallyProtected(noteId)) return true;
    return hasPendingChanges(noteId, userId);
  };

  const loadNotes = async () => {
    if (!token) return;
    const expectedFilter = tagFilterRef.current;
    // Guard: only load active notes when we're actually in the active view
    if (expectedFilter === "ARCHIVED" || expectedFilter === "TRASHED") return;
    notesAreRegular.current = true;
    setNotesLoading(true);

    try {
      // First: show notes from IndexedDB immediately (local-first)
      try {
        const localNotes = await idbGetAllNotes(currentUser?.id, sessionId, "active");
        if (localNotes.length > 0) {
          if (tagFilterRef.current !== expectedFilter) return; // view changed
          setNotes(sortNotesByRecency(localNotes));
        }
      } catch (e) {
        console.error("IndexedDB read failed:", e);
      }

      // Then: fetch from server and merge (protecting pending local changes)
      // If server status is unknown, resolve with a quick health check first (2s max)
      if (syncEngineRef.current && syncEngineRef.current.serverReachable === null) {
        await syncEngineRef.current.healthCheck();
      }
      // Skip API call entirely if sync engine knows server is down
      if (syncEngineRef.current?.serverReachable === false) throw new Error("Server offline (skip)");
      const data = await api("/notes", { token });
      if (tagFilterRef.current !== expectedFilter) return; // view changed during fetch
      const serverNotes = Array.isArray(data) ? data : [];

      // Snapshot protection status ONCE to avoid race conditions:
      // The sync queue runs concurrently — if we check multiple times, an
      // item could be removed between checks. We also check in-memory leases
      // so notes in the pre-enqueue or failed-enqueue window are protected.
      const pendingSet = new Set();
      for (const sn of serverNotes) {
        if (await isProtectedFromServerOverwrite(String(sn.id), currentUser?.id)) pendingSet.add(String(sn.id));
      }

      // Hydrate IndexedDB, skipping protected notes.
      // Late-check each note: a mutation may have started since the pendingSet snapshot.
      const toWrite = [];
      for (const sn of serverNotes) {
        const nid = String(sn.id);
        if (pendingSet.has(nid) || await isProtectedFromServerOverwrite(nid, currentUser?.id)) continue;
        toWrite.push({ ...sn, id: nid, user_id: sn.user_id || currentUser?.id, archived: false, trashed: false });
      }
      if (toWrite.length > 0) await idbPutNotes(toWrite, currentUser?.id, sessionId);

      // Build final list: server notes + locally-only notes with pending sync
      const serverIds = new Set(serverNotes.map((n) => String(n.id)));
      const localOnly = [];
      const deadIds = [];
      try {
        const allLocal = await idbGetAllNotes(currentUser?.id, sessionId, "active");
        for (const ln of allLocal) {
          if (!serverIds.has(String(ln.id))) {
            if (await isProtectedFromServerOverwrite(String(ln.id), currentUser?.id)) {
              localOnly.push(ln);
            } else {
              deadIds.push(String(ln.id));
            }
          }
        }
      } catch (e) {}
      // Purge dead notes from IDB in parallel
      if (deadIds.length > 0) {
        await Promise.allSettled(deadIds.map((id) => idbDeleteNote(id, currentUser?.id, sessionId)));
      }

      // Merge: for each server note, late-check protection again before inclusion.
      // A mutation may have started during the IDB hydration / dead-note pass above.
      const merged = [];
      for (const sn of serverNotes) {
        const nid = String(sn.id);
        if (await isProtectedFromServerOverwrite(nid, currentUser?.id)) {
          const localVer = await idbGetNote(nid, currentUser?.id, sessionId);
          if (localVer) merged.push(localVer);
        } else {
          merged.push(sn);
        }
      }

      // Filter: only keep notes that belong in the active view
      // (local versions of notes with pending changes might have trashed/archived flags)
      const final = [...merged, ...localOnly].filter((n) => !n.archived && !n.trashed);
      if (tagFilterRef.current !== expectedFilter) return; // view changed
      setNotes(sortNotesByRecency(final));
      persistNotesCache(final);
      return true; // server data fetched successfully
    } catch (error) {
      console.error("Error loading notes from server:", error);
      // Notify sync engine so it detects offline state quickly
      syncEngineRef.current?.healthCheck();
      if (tagFilterRef.current !== expectedFilter) return; // view changed
      // Fallback: use IndexedDB data (already shown above), or localStorage
      try {
        const localNotes = await idbGetAllNotes(currentUser?.id, sessionId, "active");
        if (localNotes.length > 0) {
          if (tagFilterRef.current === expectedFilter) setNotes(sortNotesByRecency(localNotes));
        } else {
          const cachedData = localStorage.getItem(NOTES_CACHE_KEY);
          if (cachedData) {
            if (tagFilterRef.current === expectedFilter) setNotes(sortNotesByRecency(JSON.parse(cachedData)));
          }
        }
      } catch (e) {
        console.error("Fallback load failed:", e);
      }
    } finally {
      setNotesLoading(false);
    }
  };

  // Load archived notes
  const loadArchivedNotes = async () => {
    if (!token) return;
    const expectedFilter = "ARCHIVED";
    if (tagFilterRef.current !== expectedFilter) return;
    notesAreRegular.current = false;
    setNotesLoading(true);

    try {
      // Show IndexedDB archived notes immediately
      try {
        const localArchived = await idbGetAllNotes(currentUser?.id, sessionId, "archived");
        if (localArchived.length > 0) {
          if (tagFilterRef.current !== expectedFilter) return;
          setNotes(sortNotesByRecency(localArchived));
        }
      } catch (e) {}

      // If server status is unknown, resolve with a quick health check first (2s max)
      if (syncEngineRef.current && syncEngineRef.current.serverReachable === null) {
        await syncEngineRef.current.healthCheck();
      }
      if (syncEngineRef.current?.serverReachable === false) throw new Error("Server offline (skip)");
      const data = await api("/notes/archived", { token });
      if (tagFilterRef.current !== expectedFilter) return;
      const notesArray = Array.isArray(data) ? data : [];

      // Snapshot protection status once to avoid race with concurrent queue processing
      const pendingSet = new Set();
      for (const sn of notesArray) {
        if (await isProtectedFromServerOverwrite(String(sn.id), currentUser?.id)) pendingSet.add(String(sn.id));
      }

      // Hydrate IndexedDB, late-checking each note for protection
      const toWrite = [];
      for (const sn of notesArray) {
        const nid = String(sn.id);
        if (pendingSet.has(nid) || await isProtectedFromServerOverwrite(nid, currentUser?.id)) continue;
        toWrite.push({ ...sn, id: nid, user_id: sn.user_id || currentUser?.id, archived: true, trashed: false });
      }
      if (toWrite.length > 0) await idbPutNotes(toWrite, currentUser?.id, sessionId);

      // Merge with local-only archived notes that have pending sync
      const serverIds = new Set(notesArray.map((n) => String(n.id)));
      const localOnly = [];
      const deadIds = [];
      try {
        const allLocal = await idbGetAllNotes(currentUser?.id, sessionId, "archived");
        for (const ln of allLocal) {
          if (!serverIds.has(String(ln.id))) {
            if (await isProtectedFromServerOverwrite(String(ln.id), currentUser?.id)) {
              localOnly.push(ln);
            } else {
              deadIds.push(String(ln.id));
            }
          }
        }
      } catch (e) {}
      if (deadIds.length > 0) {
        await Promise.allSettled(deadIds.map((id) => idbDeleteNote(id, currentUser?.id, sessionId)));
      }

      // Merge: late-check each note before inclusion
      const merged = [];
      for (const sn of notesArray) {
        const nid = String(sn.id);
        if (await isProtectedFromServerOverwrite(nid, currentUser?.id)) {
          const localVer = await idbGetNote(nid, currentUser?.id, sessionId);
          if (localVer) merged.push(localVer);
        } else {
          merged.push(sn);
        }
      }

      // Filter: only keep notes that belong in the archived view
      const final = [...merged, ...localOnly].filter((n) => !!n.archived && !n.trashed);
      if (tagFilterRef.current !== expectedFilter) return;
      setNotes(sortNotesByRecency(final));
      return true; // server data fetched successfully
    } catch (error) {
      console.error("Error loading archived notes from server:", error);
      syncEngineRef.current?.healthCheck();
      // Keep IndexedDB data already shown
    } finally {
      setNotesLoading(false);
    }
  };

  // Load trashed notes
  const loadTrashedNotes = async () => {
    if (!token) return;
    const expectedFilter = "TRASHED";
    if (tagFilterRef.current !== expectedFilter) return;
    notesAreRegular.current = false;
    setNotesLoading(true);

    try {
      // Show IndexedDB trashed notes immediately
      try {
        const localTrashed = await idbGetAllNotes(currentUser?.id, sessionId, "trashed");
        if (localTrashed.length > 0) {
          if (tagFilterRef.current !== expectedFilter) return;
          setNotes(sortNotesByRecency(localTrashed));
        }
      } catch (e) {}

      // If server status is unknown, resolve with a quick health check first (2s max)
      if (syncEngineRef.current && syncEngineRef.current.serverReachable === null) {
        await syncEngineRef.current.healthCheck();
      }
      if (syncEngineRef.current?.serverReachable === false) throw new Error("Server offline (skip)");
      const data = await api("/notes/trashed", { token });
      if (tagFilterRef.current !== expectedFilter) return;
      const notesArray = Array.isArray(data) ? data : [];

      // Snapshot protection status once to avoid race with concurrent queue processing
      const pendingSet = new Set();
      for (const sn of notesArray) {
        if (await isProtectedFromServerOverwrite(String(sn.id), currentUser?.id)) pendingSet.add(String(sn.id));
      }

      // Hydrate IndexedDB, late-checking each note for protection
      const toWrite = [];
      for (const sn of notesArray) {
        const nid = String(sn.id);
        if (pendingSet.has(nid) || await isProtectedFromServerOverwrite(nid, currentUser?.id)) continue;
        toWrite.push({ ...sn, id: nid, user_id: sn.user_id || currentUser?.id, archived: false, trashed: true });
      }
      if (toWrite.length > 0) await idbPutNotes(toWrite, currentUser?.id, sessionId);

      // Merge with locally-trashed notes that have pending sync
      const serverIds = new Set(notesArray.map((n) => String(n.id)));
      const localOnly = [];
      const deadIds = [];
      try {
        const allLocal = await idbGetAllNotes(currentUser?.id, sessionId, "trashed");
        for (const ln of allLocal) {
          if (!serverIds.has(String(ln.id))) {
            if (await isProtectedFromServerOverwrite(String(ln.id), currentUser?.id)) {
              localOnly.push(ln);
            } else {
              deadIds.push(String(ln.id));
            }
          }
        }
      } catch (e) {}
      if (deadIds.length > 0) {
        await Promise.allSettled(deadIds.map((id) => idbDeleteNote(id, currentUser?.id, sessionId)));
      }

      // Merge: late-check each note before inclusion
      const merged = [];
      for (const sn of notesArray) {
        const nid = String(sn.id);
        if (await isProtectedFromServerOverwrite(nid, currentUser?.id)) {
          const localVer = await idbGetNote(nid, currentUser?.id, sessionId);
          if (localVer) merged.push(localVer);
        } else {
          merged.push(sn);
        }
      }

      // Filter: only keep notes that belong in the trashed view
      const final = [...merged, ...localOnly].filter((n) => !!n.trashed);
      if (tagFilterRef.current !== expectedFilter) return;
      setNotes(sortNotesByRecency(final));
      return true; // server data fetched successfully
    } catch (error) {
      console.error("Error loading trashed notes from server:", error);
      syncEngineRef.current?.healthCheck();
      if (tagFilterRef.current !== expectedFilter) return;
      // Keep IndexedDB data already shown, or fallback to localStorage
      try {
        const localTrashed = await idbGetAllNotes(currentUser?.id, sessionId, "trashed");
        if (localTrashed.length > 0) {
          if (tagFilterRef.current === expectedFilter) setNotes(sortNotesByRecency(localTrashed));
        } else {
          const cachedData = localStorage.getItem(TRASHED_NOTES_CACHE_KEY);
          if (cachedData) {
            if (tagFilterRef.current === expectedFilter) setNotes(sortNotesByRecency(JSON.parse(cachedData)));
          } else {
            if (tagFilterRef.current === expectedFilter) setNotes([]);
          }
        }
      } catch {
        if (tagFilterRef.current === expectedFilter) setNotes([]);
      }
    } finally {
      setNotesLoading(false);
    }
  };

  // Keep ref up to date so handleSyncNow always calls the latest version
  // Returns true if server data was fetched, false/undefined if fallback to IDB
  reloadCurrentViewRef.current = async () => {
    const currentFilter = tagFilterRef.current;
    try {
      if (currentFilter === "ARCHIVED") {
        return await loadArchivedNotes();
      } else if (currentFilter === "TRASHED") {
        return await loadTrashedNotes();
      } else {
        return await loadNotes();
      }
    } catch (_) {
      return false;
    }
  };

  useEffect(() => {
    if (!token) return;

    // Update ref FIRST so load functions can use it for async staleness checks
    tagFilterRef.current = tagFilter;

    // Load appropriate notes based on tag filter
    if (tagFilter === "ARCHIVED") {
      loadArchivedNotes().catch((error) => {
        console.error("Failed to load archived notes:", error);
      });
    } else if (tagFilter === "TRASHED") {
      loadTrashedNotes().catch((error) => {
        console.error("Failed to load trashed notes:", error);
      });
    } else {
      loadNotes().catch((error) => {
        console.error("Failed to load regular notes:", error);
      });
    }
  }, [token, tagFilter]);

  // tagFilterRef is now updated inside the load useEffect above (before calling load functions)

  // Fetch login profiles (public)
  const fetchLoginProfiles = async () => {
    try {
      const profiles = await api("/login/profiles");
      setLoginProfiles(Array.isArray(profiles) ? profiles : []);
    } catch (e) {
      console.error("Failed to fetch login profiles:", e);
      setLoginProfiles([]);
    }
  };

  // Check registration setting and login slogan on app load
  useEffect(() => {
    checkRegistrationSetting();
    fetchLoginSlogan();
    fetchLoginProfiles();
  }, []);

  // Handle token expiration globally - must be after signOut is defined
  // This will be added after signOut is defined below

  useEffect(() => {
    if (!token) return;

    let es;
    let reconnectTimeout;
    let reconnectAttempts = 0;
    let hasConnectedOnce = false; // track first vs reconnection
    const maxReconnectDelay = 30000; // cap backoff at 30s, never give up
    let reloadCooldownUntil = 0; // suppress patches during full reload

    // ─── Debounced batch patch: collect noteIds, reload once ───
    let patchBatchTimeout = null;
    const patchBatchIds = new Set();
    let cooldownDeferredIds = new Set(); // events received during reload cooldown

    const flushPatchBatch = async () => {
      patchBatchTimeout = null;
      const ids = [...patchBatchIds];
      patchBatchIds.clear();
      if (ids.length === 0) return;

      // Single note — fast path, no batching overhead
      if (ids.length === 1) {
        await patchSingleNote(ids[0]);
        return;
      }

      // Multiple notes — fetch all in parallel, then apply ONE setNotes update
      // to avoid N sequential re-renders that cause grid flicker.
      const uid = currentUser?.id;
      const sid = sessionId;
      const currentFilter = tagFilterRef.current;

      // Pre-filter: skip protected notes before fetching
      const toFetch = [];
      for (const nid of ids) {
        if (isDeleteTombstoned(nid)) continue;
        if (isNoteLocallyProtected(nid)) continue;
        if (await hasPendingChanges(nid, uid)) continue;
        toFetch.push(nid);
      }
      if (toFetch.length === 0) return;

      // Fetch all in parallel
      const results = await Promise.allSettled(
        toFetch.map(async (nid) => {
          try {
            const serverNote = await api(`/notes/${nid}`, { token });
            if (!serverNote || !serverNote.id) return null;
            // Final TOCTOU guard
            if (await isProtectedFromServerOverwrite(nid, uid)) return null;
            return serverNote;
          } catch (e) {
            return e.status === 404 ? { _deleted: true, _nid: nid } : null;
          }
        })
      );

      // Collect updates and removals
      const upserts = new Map();  // nid → serverNote
      const removals = new Set(); // nids to remove from view
      const idbWrites = [];

      for (const r of results) {
        if (r.status !== "fulfilled" || !r.value) continue;
        const val = r.value;

        if (val._deleted) {
          removals.add(val._nid);
          idbWrites.push(idbDeleteNote(val._nid, uid, sid).catch(() => {}));
          continue;
        }

        const nid = String(val.id);
        const noteArchived = !!val.archived;
        const noteTrashed = !!val.trashed;
        const belongsInView =
          (currentFilter === "ARCHIVED" && noteArchived && !noteTrashed) ||
          (currentFilter === "TRASHED" && noteTrashed) ||
          (!currentFilter || (currentFilter !== "ARCHIVED" && currentFilter !== "TRASHED"))
            && !noteArchived && !noteTrashed;

        idbWrites.push(
          idbPutNote({ ...val, id: nid, user_id: val.user_id || uid }, uid, sid).catch(() => {})
        );

        if (belongsInView) {
          upserts.set(nid, val);
        } else {
          removals.add(nid);
        }
      }

      // Fire IDB writes in parallel (best-effort)
      await Promise.allSettled(idbWrites);

      // Single atomic state update — no intermediate re-renders
      if (upserts.size > 0 || removals.size > 0) {
        setNotes((prev) => {
          let next = prev;
          // Apply removals
          if (removals.size > 0) {
            next = next.filter((n) => !removals.has(String(n.id)));
          }
          // Apply upserts
          if (upserts.size > 0) {
            const updated = next.map((n) => {
              const sn = upserts.get(String(n.id));
              return sn ? sn : n;
            });
            // Add any truly new notes (not already in list)
            const existingIds = new Set(updated.map((n) => String(n.id)));
            const newNotes = [];
            for (const [nid, sn] of upserts) {
              if (!existingIds.has(nid)) newNotes.push(sn);
            }
            next = newNotes.length > 0
              ? sortNotesByRecency([...updated, ...newNotes])
              : sortNotesByRecency(updated);
          }
          return next;
        });
      }
    };

    const debouncedPatch = (noteId) => {
      // During reload cooldown, buffer instead of dropping — the full reload
      // may have started BEFORE these notes existed on the server (e.g. another
      // device synced while the reload was in flight).
      if (Date.now() < reloadCooldownUntil) {
        cooldownDeferredIds.add(String(noteId));
        return;
      }
      patchBatchIds.add(String(noteId));
      if (patchBatchTimeout) clearTimeout(patchBatchTimeout);
      patchBatchTimeout = setTimeout(flushPatchBatch, 300);
    };

    // ─── Targeted single-note patch (local-first safe) ───
    const patchSingleNote = async (noteId) => {
      if (!noteId) return;
      const nid = String(noteId);

      // Note permanently deleted locally — never resurrect from server
      if (isDeleteTombstoned(nid)) return;

      // Don't overwrite notes with pending local changes (already in sync queue)
      const pending = await hasPendingChanges(nid, currentUser?.id);
      if (pending) return;

      // Don't overwrite note with an active local lease (debounce, pending IDB write,
      // in-flight enqueue, or failed enqueue not yet recovered)
      if (isNoteLocallyProtected(nid)) return;

      try {
        const serverNote = await api(`/notes/${nid}`, { token });
        if (!serverNote || !serverNote.id) return;

        // ── Final guard before write (closes TOCTOU race) ──
        // A local mutation may have started while the fetch was in flight.
        if (await isProtectedFromServerOverwrite(nid, currentUser?.id)) return;

        const currentFilter = tagFilterRef.current;
        const noteArchived = !!serverNote.archived;
        const noteTrashed = !!serverNote.trashed;

        // Determine if this note belongs in the current view
        const belongsInView =
          (currentFilter === "ARCHIVED" && noteArchived && !noteTrashed) ||
          (currentFilter === "TRASHED" && noteTrashed) ||
          (!currentFilter || (currentFilter !== "ARCHIVED" && currentFilter !== "TRASHED"))
            && !noteArchived && !noteTrashed;

        // Update IndexedDB
        try {
          await idbPutNote({
            ...serverNote,
            id: nid,
            user_id: serverNote.user_id || currentUser?.id,
          }, currentUser?.id, sessionId);
        } catch (e) {}

        if (belongsInView) {
          // Upsert into current notes list and re-sort (position/pinned may have changed)
          setNotes((prev) => {
            const idx = prev.findIndex((n) => String(n.id) === nid);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = serverNote;
              return sortNotesByRecency(updated);
            } else {
              // New note that belongs in this view - add to list
              return sortNotesByRecency([...prev, serverNote]);
            }
          });
        } else {
          // Note no longer belongs in the current view — remove it
          setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
        }
      } catch (e) {
        // Fetch failed (404, network, etc.) — if 404, note was deleted
        if (e.status === 404) {
          setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
          try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (_) {}
        }
        // Other errors: silently ignore, state stays as-is
      }
    };

    const connectSSE = () => {
      try {
        const url = new URL(`${window.location.origin}/api/events`);
        url.searchParams.set("token", token);
        url.searchParams.set("_t", Date.now());
        es = new EventSource(url.toString());

        es.onopen = () => {
          console.log("SSE connected");
          setSseConnected(true);
          // SSE onopen through a reverse proxy does NOT prove the backend is
          // alive — the proxy accepts the TCP connection even when the backend
          // is down. Only a real SSE data message (onmessage) is proof.
          // Trigger a health check instead to verify properly.
          if (syncEngineRef.current && !syncEngineRef.current.isRateLimited) {
            syncEngineRef.current.healthCheck();
          }
          // On reconnection (not first connect), reload the view — but only
          // AFTER the sync queue has finished processing. If we reload while
          // processQueue is running, the server may return stale data (patches
          // not yet applied) and overwrite correct local state.
          if (hasConnectedOnce) {
            console.log("[SSE] reconnected — will reload after queue drains");
            const waitForQueue = async () => {
              const engine = syncEngineRef.current;
              if (engine && engine._processing) {
                // Queue still running — check again in 500ms
                setTimeout(waitForQueue, 500);
                return;
              }
              // Skip reload if:
              // 1. Server not confirmed reachable — loadNotes() would skip the
              //    server fetch and we'd go green with stale IDB data.
              // 2. A pull is already in progress (recovery useEffect owns it) —
              //    avoid duplicate reloads racing each other.
              // In both cases, the recovery useEffect handles the reload.
              if (engine && (engine.serverReachable !== true || engine.isPulling)) {
                console.log("[SSE] queue idle but %s — skipping reload (recovery useEffect will handle it)",
                  engine.isPulling ? "pull already in progress" : "server not confirmed reachable");
                return;
              }
              console.log("[SSE] queue idle — reloading current view");
              cooldownDeferredIds = new Set(); // clear before cooldown starts
              reloadCooldownUntil = Date.now() + 3000;
              // Use beginPull/endPull so status stays "syncing" until reload completes
              if (engine) await engine.beginPull();
              try {
                await reloadCurrentViewRef.current?.();
              } finally {
                if (engine) await engine.endPull();
              }
              // After cooldown expires, flush any SSE events that arrived during the
              // reload window (e.g. another device synced while reload was in flight).
              setTimeout(() => {
                if (cooldownDeferredIds.size > 0) {
                  console.log("[SSE] flushing", cooldownDeferredIds.size, "deferred events");
                  for (const nid of cooldownDeferredIds) patchBatchIds.add(nid);
                  cooldownDeferredIds = new Set();
                  if (patchBatchTimeout) clearTimeout(patchBatchTimeout);
                  patchBatchTimeout = setTimeout(flushPatchBatch, 300);
                }
              }, 3100);
            };
            // Small initial delay to let processQueue start if it hasn't yet
            setTimeout(waitForQueue, 300);
          }
          hasConnectedOnce = true;
          reconnectAttempts = 0;
        };

        // SSE message handler (server sends generic data: messages)
        es.onmessage = (e) => {
          try {
            // A real SSE data message = proof the GlassKeep backend is alive.
            // This is the ONLY place we call notifyServerReachable from SSE
            // (onopen doesn't count — the proxy can accept connections even
            // when the backend is down).
            if (syncEngineRef.current) {
              syncEngineRef.current.notifyServerReachable();
            }
            const msg = JSON.parse(e.data || "{}");
            if (msg && msg.type === "note_updated" && msg.noteId) {
              debouncedPatch(msg.noteId);
            } else if (msg && msg.type === "notes_reordered") {
              // Another session reordered notes — reload the full list once
              // instead of fetching each note individually (avoids rate limits).
              reloadCurrentViewRef.current?.();
            } else if (msg && msg.type === "note_deleted" && msg.noteId) {
              // Another session permanently deleted this note — remove locally
              const nid = String(msg.noteId);
              if (!isDeleteTombstoned(nid)) {
                setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
                idbDeleteNote(nid, currentUser?.id, sessionId).catch(() => {});
                idbPurgeQueueForNote(nid, currentUser?.id).catch(() => {});
                // If this note is currently open in the modal, force-close
                // without triggering any save/flush (the note no longer exists)
                if (String(activeIdRef.current) === nid) {
                  forceCloseModalForRemoteDelete(nid);
                }
              }
            } else if (msg && msg.type === "pending_user_registered") {
              // Admin notification: a new user is awaiting approval.
              if (currentUserRef.current?.is_admin) {
                showToast(
                  t("pendingUserToast", { name: msg.name || msg.email || "" }),
                  "info",
                );
                loadPendingUsers?.();
              }
            } else if (msg && msg.type === "note_access_revoked" && msg.noteId) {
              // Collaboration access revoked — note owner removed us.
              const nid = String(msg.noteId);
              if (msg.copyNoteId) {
                // Grant-copy path: fetch the copy first, then swap the
                // original out and the copy in within a single setNotes
                // update so the user doesn't see a flash of empty slot.
                (async () => {
                  let copy = null;
                  try {
                    copy = await api(`/notes/${msg.copyNoteId}`, { token });
                  } catch (_) {}
                  const currentFilter = tagFilterRef.current;
                  const belongsInView =
                    copy && copy.id
                    && !copy.archived && !copy.trashed
                    && (!currentFilter || (currentFilter !== "ARCHIVED" && currentFilter !== "TRASHED"));
                  setNotes((prev) => {
                    const filtered = prev.filter((n) => String(n.id) !== nid);
                    return belongsInView ? sortNotesByRecency([...filtered, copy]) : filtered;
                  });
                  if (copy && copy.id) {
                    try { await idbPutNote(copy, currentUser?.id, sessionId); } catch (_) {}
                  }
                  idbDeleteNote(nid, currentUser?.id, sessionId).catch(() => {});
                  idbPurgeQueueForNote(nid, currentUser?.id).catch(() => {});
                  if (String(activeIdRef.current) === nid) {
                    forceCloseModalForRemoteDelete(nid);
                  }
                })();
              } else {
                // Legacy revoke-only path: drop the note immediately.
                setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
                idbDeleteNote(nid, currentUser?.id, sessionId).catch(() => {});
                idbPurgeQueueForNote(nid, currentUser?.id).catch(() => {});
                if (String(activeIdRef.current) === nid) {
                  forceCloseModalForRemoteDelete(nid);
                }
              }
            }
          } catch (_) {}
        };

        es.onerror = (error) => {
          console.log("SSE error, attempting reconnect...", error);
          setSseConnected(false);
          const engine = syncEngineRef.current;
          if (engine) {
            engine.notifySseDisconnected();
            // SSE died — trigger a health check to detect server outage fast.
            // healthCheck() has built-in throttling (3s min gap) so rapid SSE
            // errors won't flood the server.
            if (!engine.isRateLimited) {
              engine.healthCheck();
            }
          }

          if (es.readyState === EventSource.CLOSED) {
            const currentAuth = getAuth();
            if (!currentAuth || !currentAuth.token) {
              return;
            }
          }

          es.close();

          // Backoff: exponential with cap. When rate-limited (403/429),
          // use a much longer minimum delay to let the proxy cool down.
          const isRL = engine?.isRateLimited;
          const minDelay = isRL ? 10000 : 1000;
          const delay = Math.max(minDelay, Math.min(1000 * Math.pow(2, reconnectAttempts), maxReconnectDelay));
          reconnectTimeout = setTimeout(() => {
            reconnectAttempts++;
            const currentAuth = getAuth();
            if (!currentAuth || !currentAuth.token) return;
            connectSSE();
          }, delay);
        };
      } catch (error) {
        console.error("Failed to create EventSource:", error);
      }
    };

    connectSSE();

    // Expose reconnect for use when sync engine detects server recovery
    reconnectSseRef.current = () => {
      if (!es || es.readyState === EventSource.CLOSED) {
        // Cancel any pending backoff timer to avoid duplicate connections
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectAttempts = 0; // reset backoff on explicit reconnect
        connectSSE();
      }
    };

    // Fallback polling: only when SSE is dead, and only every 60s
    let pollInterval;
    const startPolling = () => {
      pollInterval = setInterval(() => {
        if (!es || es.readyState === EventSource.CLOSED) {
          // SSE is dead — do a full reload as last resort
          const currentFilter = tagFilterRef.current;
          if (currentFilter === "ARCHIVED") {
            loadArchivedNotes().catch(() => {});
          } else if (currentFilter === "TRASHED") {
            loadTrashedNotes().catch(() => {});
          } else {
            loadNotes().catch(() => {});
          }
        }
        // When SSE is connected, polling does nothing
      }, 60000);
    };

    const pollTimeout = setTimeout(startPolling, 15000);

    // Visibility change: reconnect SSE if dead, kick sync engine recovery.
    // CRITICAL: use the engine's healthCheck() — NOT a separate api("/health") —
    // so that _serverReachable gets updated. Without this, processQueue()
    // early-exits when _serverReachable===false (stuck "offline" on mobile
    // after the health-check timer chain breaks during tab suspension).
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;

      const engine = syncEngineRef.current;

      // Run engine health check — this updates _serverReachable and
      // auto-triggers processQueue on recovery. Also restarts the
      // health timer chain if it was broken by tab suspension.
      if (engine) {
        // force=true on every attempt: the retry gap (1.5s) is shorter than
        // the 3s throttle in healthCheck(), so unforced retries silently
        // return the cached "offline" value and waste a slot in the loop.
        let ok = await engine.healthCheck(true);
        // On mobile after long background, the first fetch often fails because
        // Chrome reuses stale TCP sockets from before suspension. Retry with
        // increasing delays to give the browser time to recycle the socket pool.
        for (let i = 0; i < 3 && !ok; i++) {
          await new Promise((r) => setTimeout(r, 1500 + i * 1500));
          ok = await engine.healthCheck(true);
        }
        // Restart the health timer chain unconditionally — mobile browsers
        // may have GC'd the previous setTimeout during background suspension.
        engine.restartHealthTimer();

        // Reconnect SSE if dead and server is reachable
        if (ok && es && es.readyState === EventSource.CLOSED) {
          connectSSE();
        }
      } else if (es && es.readyState === EventSource.CLOSED) {
        // No engine but SSE dead — try to reconnect SSE anyway
        try {
          await api("/health", { token });
          connectSSE();
        } catch (error) {
          if (error.status === 401) return;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Handle online/offline events
    const handleOnline = async () => {
      setIsOnline(true);
      // Browser detected network recovery — run health check first,
      // then process queue and reconnect SSE only after confirming
      // the server is reachable. Avoids racing SSE reconnect against
      // the health check that sets _serverReachable = true.
      const engine = syncEngineRef.current;
      if (engine) {
        // force=true: same reason as in visibilitychange — the 1.5s retry
        // gap would otherwise trip the 3s throttle inside healthCheck().
        let ok = await engine.healthCheck(true);
        // On mobile, stale TCP sockets survive the offline→online transition.
        // Retry with increasing delays so the browser can recycle them.
        for (let i = 0; i < 3 && !ok; i++) {
          await new Promise((r) => setTimeout(r, 1500 + i * 1500));
          ok = await engine.healthCheck(true);
        }
        engine.restartHealthTimer();
        if (ok) {
          triggerSync();
          // Reconnect SSE after confirmed server reachability
          if (es && es.readyState === EventSource.CLOSED) {
            reconnectAttempts = 0;
            connectSSE();
          }
        }
      } else if (es && es.readyState === EventSource.CLOSED) {
        reconnectAttempts = 0;
        connectSSE();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      // Immediately tell the sync engine — don't wait for the next health check.
      // The browser "offline" event is instant proof the network is down.
      const engine = syncEngineRef.current;
      if (engine) {
        engine.notifySseDisconnected();
        engine.notifyOffline();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      setSseConnected(false);
      try { if (es) es.close(); } catch (e) {}
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (patchBatchTimeout) clearTimeout(patchBatchTimeout);
      if (pollTimeout) clearTimeout(pollTimeout);
      if (pollInterval) clearInterval(pollInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [token]);

  // Reconnect SSE and reload view when server recovers from offline
  const prevSyncStateRef = useRef(syncStatus.syncState);
  useEffect(() => {
    const prev = prevSyncStateRef.current;
    prevSyncStateRef.current = syncStatus.syncState;
    if (prev === "offline" && syncStatus.syncState !== "offline" && syncStatus.syncState !== "checking") {
      // Server just recovered — reconnect SSE immediately
      reconnectSseRef.current?.();
      // Reload the view to pick up changes from other devices, but WAIT for
      // the local queue to drain first. Otherwise we fetch stale server data
      // that overwrites local offline edits that haven't been pushed yet.
      // Use beginPull()/endPull() so the status stays "syncing" (not green)
      // until the view has been fully refreshed.
      //
      // After the initial reload, wait a settling period (3s) then reload
      // again. This gives OTHER devices time to push their pending changes
      // (e.g. PC reordered notes while offline — it needs a few seconds to
      // push the reorder after it also detects recovery).
      const waitThenReload = async () => {
        const engine = syncEngineRef.current;
        if (engine && engine._processing) {
          setTimeout(waitThenReload, 500);
          return;
        }
        // Signal that we're now pulling remote changes — keeps status "syncing"
        if (engine) await engine.beginPull();
        try {
          // First reload: get whatever the server has right now
          let ok = await reloadCurrentViewRef.current?.();
          if (!ok) {
            // Server fetch failed — retry a few times
            for (let i = 1; i <= 4 && !ok; i++) {
              await new Promise((r) => setTimeout(r, 2000 * i));
              ok = await reloadCurrentViewRef.current?.();
            }
          }
          if (ok) {
            // Settling period: other devices may still be pushing changes.
            // Wait 3s then reload once more to catch late arrivals.
            await new Promise((r) => setTimeout(r, 3000));
            await reloadCurrentViewRef.current?.();
          }
        } catch (_) {}
        if (engine) await engine.endPull();
      };
      // Small delay to let processQueue start (healthCheck triggers it)
      setTimeout(waitThenReload, 500);
    }
  }, [syncStatus.syncState]);

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
  }, [notes, open, activeId, mType]);

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
    invalidateNotesCache();

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
    if (materializeDraftIfNeeded({ drawing: mDrawingData })) return;

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
      const { text: serverText, ...serverCleanData } = normalizedData;
      const prevJson = JSON.stringify(prevDrawingRef.current || []);
      const serverJson = JSON.stringify(serverCleanData);
      if (serverJson !== prevJson) {
        setMDrawingData(serverCleanData);
        prevDrawingRef.current = serverCleanData;
      }
    } catch (e) {
      // Invalid JSON, ignore
    }
  }, [notes, open, activeId]);

  // No infinite scroll

  // Auto-resize composer textarea
  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.style.height = "auto";
    contentRef.current.style.height = contentRef.current.scrollHeight + "px";
  }, [content, composerType]);

  /** -------- Auth actions -------- */

  // Centralised cleanup for sign-out AND auth-expired — single source of truth.
  // Uses refs so it's safe to call from stale closures (e.g. event listeners).
  // Shared teardown: resets UI state, clears notes cache, tears down sync engine.
  // Does NOT purge the sync queue — that is handled separately depending on context.
  const cleanupClientSession = (purgeQueue = false) => {
    const userId = currentUserIdRef.current;
    const sid = sessionIdRef.current;
    // Notes cache is session-scoped and disposable — always clear it.
    if (userId && sid) {
      idbClearNotesForSession(userId, sid).catch(() => {});
    }
    // Only purge the sync queue on explicit sign-out / user change.
    // Token expiration must NOT purge the queue — pending offline mutations
    // will be replayed after re-login with a fresh token.
    if (purgeQueue && userId) {
      idbClearQueueForUser(userId).catch(() => {});
    }
    // Clear all local leases, delete tombstones, pending reorder refs — no zombies between sessions
    clearAllLocalLeases();
    localDeleteTombstoneRef.current.clear();
    pendingReorderLeasesRef.current.clear();
    // Tear down sync engine
    if (syncEngineRef.current) {
      syncEngineRef.current.destroy();
      syncEngineRef.current = null;
    }
    // Reset React state
    setAuth(null);
    setSession(null);
    setNotes([]);
    setSyncStatus(SYNC_STATUS_RESET);
    // Clear session-scoped localStorage caches only (preserve UI prefs like dark mode)
    const uid = userId || "anonymous";
    const s = sid || "no-session";
    try {
      localStorage.removeItem(`glass-keep-notes-${uid}-${s}`);
      localStorage.removeItem(`glass-keep-archived-${uid}-${s}`);
      localStorage.removeItem(`glass-keep-trashed-${uid}-${s}`);
      localStorage.removeItem(`glass-keep-cache-timestamp-${uid}-${s}`);
      // Clean up legacy user-scoped fallback keys (pre-session-scope)
      localStorage.removeItem(`glass-keep-notes-${uid}`);
      localStorage.removeItem(`glass-keep-archived-${uid}`);
      localStorage.removeItem(`glass-keep-trashed-${uid}`);
      localStorage.removeItem(`glass-keep-cache-timestamp-${uid}`);
    } catch (e) {}
    navigate("#/login");
  };

  const signOut = () => {
    cleanupClientSession(true); // explicit sign-out → purge queue
  };
  const completeLogin = (res) => {
    const sessionId = crypto.randomUUID?.() ??
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    const sessionWithId = { ...res, sessionId };
    setSession(sessionWithId);
    setAuth(sessionWithId);
    if (res.must_change_password) {
      setMustChangePassword(true);
    }
    navigate("#/notes");
    return { ok: true };
  };
  const signIn = async (email, password) => {
    const res = await api("/login", {
      method: "POST",
      body: { email, password },
    });
    return completeLogin(res);
  };
  const signInById = async (userId, password) => {
    const res = await api("/login", {
      method: "POST",
      body: { user_id: userId, password },
    });
    return completeLogin(res);
  };
  const signInWithSecret = async (key) => {
    const res = await api("/login/secret", { method: "POST", body: { key } });
    return completeLogin(res);
  };
  const register = async (name, email, password) => {
    const res = await api("/register", {
      method: "POST",
      body: { name, email, password },
    });
    // New flow: registrations are held as pending until an admin approves them.
    if (res?.pending) {
      return { ok: true, pending: true };
    }
    // Fallback for legacy flows that might still return a token directly.
    if (res?.token) {
      return completeLogin(res);
    }
    return { ok: true, pending: true };
  };

  // Handle token expiration globally — same cleanup as signOut
  useEffect(() => {
    const handleAuthExpired = () => {
      console.warn("[Auth] Token expired, cleaning up session...");
      cleanupClientSession();
    };
    window.addEventListener("auth-expired", handleAuthExpired);
    return () => window.removeEventListener("auth-expired", handleAuthExpired);
  }, []);

  // Pre-load pending registrations count when an admin is logged in
  useEffect(() => {
    if (token && currentUser?.is_admin) {
      loadPendingUsers?.();
    }
  }, [token, currentUser?.is_admin, loadPendingUsers]);

  /** -------- Composer helpers -------- */
  const addComposerItem = () => {
    const t = clInput.trim();
    if (!t) return;
    const newItem = { id: uid(), text: t, done: false };
    setClItems((prev) =>
      checklistInsertPosition === "top" ? [newItem, ...prev] : [...prev, newItem]
    );
    setClInput("");
  };

  const addNote = async () => {
    const isText = composerType === "text";
    const isChecklist = composerType === "checklist";
    const isDraw = composerType === "draw";

    if (isText) {
      if (
        !title.trim() &&
        !content.trim() &&
        composerTagList.length === 0 &&
        composerImages.length === 0
      )
        return;
    } else if (isChecklist) {
      if (!title.trim() && clItems.length === 0) return;
    } else if (isDraw) {
      const drawPaths = Array.isArray(composerDrawingData)
        ? composerDrawingData
        : composerDrawingData?.paths || [];
      if (!title.trim() && drawPaths.length === 0) return;
    }

    const nowIso = new Date().toISOString();
    const newNote = {
      id: uid(),
      type: composerType,
      title: title.trim(),
      content: isText
        ? content
        : isDraw
          ? JSON.stringify(composerDrawingData)
          : "",
      items: isChecklist ? clItems : [],
      tags: composerTagList,
      images: composerImages,
      color: composerColor,
      pinned: false,
      position: Date.now(),
      timestamp: nowIso,
      updated_at: nowIso,
      client_updated_at: nowIso,
    };

    // Local-first: apply immediately, then sync in background
    const localNote = {
      ...newNote,
      user_id: currentUser?.id,
      archived: false,
      trashed: false,
    };
    const leaseId = acquireLocalLease(String(newNote.id));
    try {
      await idbPutNote(localNote, currentUser?.id, sessionId);
    } catch (e) {
      console.error("IndexedDB put failed:", e);
    }

    // Update UI immediately from local state
    setNotes((prev) =>
      sortNotesByRecency([localNote, ...(Array.isArray(prev) ? prev : [])]),
    );
    invalidateNotesCache();

    // Enqueue for server sync (lease protects until queue takes over)
    enqueueWithLease(String(newNote.id), { type: "create", noteId: newNote.id, payload: newNote }, leaseId);

    // Reset composer immediately (don't wait for server)
    setTitle("");
    setContent("");
    setTags("");
    setComposerTagList([]);
    setComposerTagInput("");
    setComposerTagFocused(false);
    setComposerImages([]);
    setComposerColor("default");
    setClItems([]);
    setClInput("");
    setComposerDrawingData({ paths: [], dimensions: null });
    setComposerType("text");
    setComposerCollapsed(true);
    if (contentRef.current) contentRef.current.style.height = "auto";
  };

  /** -------- Download single note .md -------- */
  const handleDownloadNote = (note) => {
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
    const nid = String(noteId);
    const leaseId = acquireLocalLease(nid);
    const nowIso = new Date().toISOString();

    // Local-first: apply archive state immediately
    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) await idbPutNote({ ...existing, archived: !!archived, client_updated_at: nowIso }, currentUser?.id, sessionId);
    } catch (e) { console.error(e); }

    // Invalidate all caches since archiving affects multiple views
    invalidateNotesCache();
    invalidateArchivedNotesCache();
    invalidateTrashedNotesCache();

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

    showToast(t(archived ? "noteArchived" : "noteUnarchived"), "success");

    await enqueueWithLease(nid, { type: "archive", noteId: nid, payload: { archived: !!archived, client_updated_at: nowIso } }, leaseId);
  };

  const openSettingsPanel = () => {
    setSettingsPanelOpen(true);
  };

  // Fetch the login slogan (public)
  const fetchLoginSlogan = async () => {
    try {
      const response = await api("/admin/login-slogan");
      setLoginSlogan(response.loginSlogan || "");
    } catch (e) {
      console.error("Failed to fetch login slogan:", e);
    }
  };

  // Check if registration is allowed
  const checkRegistrationSetting = async () => {
    try {
      const response = await api("/admin/allow-registration");
      setAllowRegistration(response.allowNewAccounts);
    } catch (e) {
      console.error("Failed to check registration setting:", e);
      setAllowRegistration(false); // Default to false if check fails
    }
  };

  // Import/Export actions (hook)
  const { exportAll, importAll, importGKeep, importMd, downloadSecretKey } =
    useImportExport(token, { currentUser, loadNotes });

  // Collaboration actions (hook)
  const {
    collaborationModalOpen, setCollaborationModalOpen,
    collaboratorUsername, setCollaboratorUsername,
    addModalCollaborators,
    filteredUsers, setFilteredUsers,
    showUserDropdown, setShowUserDropdown,
    loadingUsers,
    dropdownPosition,
    loadNoteCollaborators,
    showCollaborationDialog,
    removeCollaborator,
    loadCollaboratorsForAddModal,
    searchUsers,
    updateDropdownPosition,
    addCollaborator,
  } = useCollaboration(token, {
    notes, currentUser, activeId,
    showToast, invalidateNotesCache, setNotes,
    collaboratorInputRef,
  });

  // Android back button: push a history entry each time an overlay opens,
  // pop entries when overlays close. Uses history.go(-n) for batch cleanup
  // instead of looping history.back() which can navigate out of the SPA.
  const overlayDepthRef = useRef(0);
  const popInProgressRef = useRef(false);

  const overlayOpenCount = [
    imgViewOpen, confirmDeleteOpen, genericConfirmOpen,
    collaborationModalOpen, showModalColorPop, showModalFmt, modalMenuOpen,
    modalKebabOpen, modalTagFocused, syncDropdownOpen, mobileSearchOpen,
    showColorPop, showComposerFmt, headerMenuOpen, multiMode,
    settingsPanelOpen, adminPanelOpen, sidebarOpen, open, fabOpen,
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

  // Disable pull-to-refresh on Android when any overlay is open
  useEffect(() => {
    try { window.AndroidTheme?.setRefreshEnabled(overlayOpenCount === 0); } catch (_) {}
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
      if (imgViewOpen) { setImgViewOpen(false); return; }
      if (confirmDeleteOpen) { setConfirmDeleteOpen(false); return; }
      if (genericConfirmOpen) { setGenericConfirmOpen(false); return; }
      if (collaborationModalOpen) { setCollaborationModalOpen(false); return; }
      if (showModalColorPop) { setShowModalColorPop(false); return; }
      if (showModalFmt) { setShowModalFmt(false); return; }
      if (modalMenuOpen) { setModalMenuOpen(false); return; }
      if (modalKebabOpen) { setModalKebabOpen(false); return; }
      if (modalTagFocused) { setModalTagFocused(false); return; }
      if (open) { closeModalRef.current?.(); return; }
      if (fabOpen) { setFabOpen(false); return; }
      if (syncDropdownOpen) { setSyncDropdownOpen(false); return; }
      if (mobileSearchOpen) { setSearch(""); setMobileSearchOpen(false); return; }
      if (showColorPop) { setShowColorPop(false); return; }
      if (showComposerFmt) { setShowComposerFmt(false); return; }
      if (headerMenuOpen) { setHeaderMenuOpen(false); return; }
      if (multiMode) { setMultiMode(false); return; }
      if (settingsPanelOpen) { setSettingsPanelOpen(false); return; }
      if (adminPanelOpen) { setAdminPanelOpen(false); return; }
      if (sidebarOpen) { setSidebarOpen(false); return; }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [imgViewOpen, confirmDeleteOpen, genericConfirmOpen, collaborationModalOpen,
      showModalColorPop, showModalFmt, modalMenuOpen, modalKebabOpen, modalTagFocused,
      syncDropdownOpen, mobileSearchOpen, showColorPop, showComposerFmt,
      headerMenuOpen, multiMode, settingsPanelOpen, adminPanelOpen, sidebarOpen, open, fabOpen]);

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
  //  - Special filters (ARCHIVED / TRASHED / ALL_IMAGES) → no auto-tag.
  //  - activeTagFilters (real multi-tag selection, OR logic) → apply them all:
  //    the new note then satisfies the current filter and stays visible.
  //    Single-tag clicks also land in activeTagFilters, so this covers both.
  //  - Fallback on tagFilter if it ever held a real tag (defensive; the
  //    current sidebar never sets it to a tag string).
  const getInitialTagsForNewNote = useCallback(() => {
    const isSpecial =
      tagFilter === "ARCHIVED" || tagFilter === "TRASHED" || tagFilter === ALL_IMAGES;
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
    materializeDraftIfNeeded,
    handleDirectText,
    handleDirectChecklist,
    handleDirectDraw,
  } = useDraftNote({
    activeId,
    currentUser,
    sessionId,
    mTitle, mBody, mItems, mDrawingData, mTagList, mImages, mColor,
    setTitle, setContent,
    setComposerTagList, setComposerTagInput, setComposerTagFocused,
    setComposerImages, setComposerColor, setComposerDrawingData,
    setComposerType, setComposerCollapsed,
    setSidebarOpen, setActiveId, setOpen,
    setMType, setMTitle, setMBody, setMItems, setMTagList, setMImages,
    setMColor, setMDrawingData, setTagInput,
    setInitialDrawMode, setViewMode, setModalMenuOpen, setNotes,
    skipNextDrawingAutosave, skipNextItemsAutosave,
    prevDrawingRef, prevItemsRef,
    initialModalStateRef, committedBaselineRef,
    acquireLocalLease, enqueueWithLease,
    idbPutNote, invalidateNotesCache, sortNotesByRecency,
    getInitialTags: getInitialTagsForNewNote,
  });

  const openModal = (id) => {
    const n = notes.find((x) => String(x.id) === String(id));
    if (!n) return;
    // Clear any stale pending-draft state — we're opening a real, persisted
    // note, so the deferred-create path must not fire for it.
    pendingDraftRef.current = null;
    setSidebarOpen(false);
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
      } catch (e) {
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

    setViewMode(true);
    setModalMenuOpen(false);
    setOpen(true);
  };

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
    invalidateNotesCache();

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
  }, [enqueueAndSync]);

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
    autoSaveTextNote(activeId, metaPatch, leaseId, noteType).then((ok) => {
      if (ok && committedBaselineRef.current) {
        committedBaselineRef.current = { ...committedBaselineRef.current, ...committedFields };
      }
    });
  }, [mColor, mTagList, mImages, open, activeId, mType, autoSaveTextNote]);

  // Auto-save text content (title + body): debounced local-first persist + patch sync.
  // Checklists share this effect for title changes (their body is always "").
  // NOTE: runs in BOTH view and edit mode. Toggling to view mode after a pending
  // edit used to cancel the debounce and leak the change (only a manual save or
  // closing from edit-mode would catch it). Read/write mode is a pure display
  // concern — the underlying mBody/mTitle state is equally dirty either way.
  useEffect(() => {
    if (!open || !activeId) return;
    if (mType !== "text" && mType !== "checklist") return;
    const initial = initialModalStateRef.current;
    if (!initial) return;

    const titleChanged = initial.title !== mTitle.trim();
    const bodyAppliesToType = mType === "text";
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
  }, [notes, open, activeId, hasNoteBeenModified]);

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
    setModalMenuOpen(false);
    setConfirmDeleteOpen(false);
    setShowModalFmt(false);
    setIsModalClosing(false);
    setImgViewOpen(false);
  };

  const closeModal = () => {
    // Prevent double-triggering while exit animation is running
    if (modalClosingTimerRef.current) return;

    // Unmaterialised draft: the user opened a blank note via the creation
    // buttons and never touched it, so nothing was ever persisted. Just run
    // the exit animation and drop the pending state — no IDB/queue work.
    if (pendingDraftRef.current && String(activeId) === String(pendingDraftRef.current.id)) {
      pendingDraftRef.current = null;
      setIsModalClosing(true);
      modalClosingTimerRef.current = setTimeout(() => {
        modalClosingTimerRef.current = null;
        setOpen(false);
        setActiveId(null);
        setViewMode(true);
        setModalMenuOpen(false);
        setConfirmDeleteOpen(false);
        setShowModalFmt(false);
        setIsModalClosing(false);
      }, 180);
      return;
    }

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
    if (activeId && mType === "text") {
      const baseline = committedBaselineRef.current;
      if (baseline) {
        const patch = {};
        if (baseline.title !== mTitle.trim()) patch.title = mTitle.trim();
        if (baseline.content !== mBody) patch.content = mBody;
        if (baseline.color !== mColor) patch.color = mColor;
        if (JSON.stringify(baseline.tags) !== JSON.stringify(mTagList)) patch.tags = mTagList;
        if (JSON.stringify(baseline.images) !== JSON.stringify(mImages)) patch.images = mImages;
        if (Object.keys(patch).length > 0) {
          autoSaveTextNote(activeId, patch);
        }
      }
    }

    // No dirty flag management needed here — each flow (text, draw, checklist)
    // owns its own lease via acquireLocalLease/releaseLocalLease,
    // released only after successful enqueueAndSync.

    // Start exit animation, then actually unmount after it completes
    setIsModalClosing(true);
    modalClosingTimerRef.current = setTimeout(() => {
      modalClosingTimerRef.current = null;
      setOpen(false);
      setActiveId(null);
      setViewMode(true);
      setModalMenuOpen(false);
      setConfirmDeleteOpen(false);
      setShowModalFmt(false);
      setIsModalClosing(false);
    }, 180);
  };
  closeModalRef.current = closeModal;

  const saveModal = async () => {
    if (activeId == null) return;
    // Pressing save on a draft counts as committing it. materialize first so
    // the create carries the current state and patches below operate on an
    // existing note.
    if (pendingDraftRef.current && String(activeId) === String(pendingDraftRef.current.id)) {
      materializeDraftIfNeeded();
    }
    setSavingModal(true);

    const noteId = String(activeId);
    const nowIso = new Date().toISOString();

    if (mType === "text") {
      // Text notes: use targeted patch with only changed fields.
      // Use committedBaselineRef so a failed autosave is retried here.
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
        autoSaveTextNote(activeId, patch);
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
      invalidateNotesCache();
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
    const note = notes.find((n) => String(n.id) === String(activeId));
    const nid = String(activeId);
    const isOwner = !note || note.user_id === currentUser?.id;
    const isCollabNote = (note?.collaborators?.length || 0) > 0;

    if (tagFilter === "TRASHED") {
      // Local-first: permanent delete — tombstone prevents resurrection by loaders/SSE
      const leaseId = acquireLocalLease(nid);
      addDeleteTombstone(nid);
      try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
      invalidateTrashedNotesCache();
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("notePermanentlyDeleted"), "success");
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
      invalidateNotesCache();
      invalidateTrashedNotesCache();
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("noteDeletedForAll"), "success");
      await enqueueWithLease(nid, { type: "trash", noteId: nid, payload: { client_updated_at: nowIso, mode: "delete_for_all" } }, leaseId);
    } else if (isOwner && isCollabNote) {
      // Owner chose "remove for me" on a shared note. Server transfers
      // ownership to the first collaborator (note stays live for them) and
      // creates a trashed copy owned by the leaver so they can restore it.
      // The trashed copy has a new id — local trash cache is invalidated so
      // the next trash view fetches it from the server.
      try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
      invalidateNotesCache();
      invalidateTrashedNotesCache();
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("noteMovedToTrash"), "success");
      const leaseId = acquireLocalLease(nid);
      await enqueueWithLease(nid, { type: "trash", noteId: nid, payload: { client_updated_at: new Date().toISOString(), mode: "remove_self" } }, leaseId);
    } else if (!isOwner) {
      // Collaborator leaves the shared note. Nothing to put in their trash —
      // they lose access cleanly, matching the original spec.
      try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
      invalidateNotesCache();
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("leftCollaboration"), "success");
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
      invalidateNotesCache();
      invalidateArchivedNotesCache();
      invalidateTrashedNotesCache();
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("noteMovedToTrash"), "success");
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
        // Compute restored position: find where this note fits by timestamp
        // among currently active notes sorted by position DESC.
        const activeNotes = await idbGetAllNotes(currentUser?.id, sessionId, "active");
        const sorted = activeNotes
          .filter((n) => String(n.id) !== nid)
          .sort((a, b) => (+b.position || 0) - (+a.position || 0));
        const noteTs = new Date(existing.timestamp).getTime() || 0;
        let restoredPosition = existing.position;
        if (sorted.length > 0) {
          let insertIdx = sorted.length;
          for (let i = 0; i < sorted.length; i++) {
            const ts = new Date(sorted[i].timestamp).getTime() || 0;
            if (noteTs >= ts) { insertIdx = i; break; }
          }
          if (insertIdx === 0) {
            restoredPosition = (+sorted[0].position || 0) + 1;
          } else if (insertIdx >= sorted.length) {
            restoredPosition = (+sorted[sorted.length - 1].position || 0) - 1;
          } else {
            restoredPosition = ((+sorted[insertIdx - 1].position || 0) + (+sorted[insertIdx].position || 0)) / 2;
          }
        }
        await idbPutNote({ ...existing, trashed: false, position: restoredPosition, client_updated_at: nowIso }, currentUser?.id, sessionId);
      }
    } catch (e) { console.error(e); }
    invalidateNotesCache();
    invalidateArchivedNotesCache();
    invalidateTrashedNotesCache();
    setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
    closeModal();
    showToast(t("noteRestoredFromTrash"), "success");
    await enqueueWithLease(nid, { type: "restore", noteId: nid, payload: { client_updated_at: nowIso } }, leaseId);
  };
  const togglePin = async (id, toPinned) => {
    // Pinning a draft counts as a real action — materialise it first so the
    // create lands in the queue before the pin patch follows.
    if (pendingDraftRef.current && String(id) === String(pendingDraftRef.current.id)) {
      materializeDraftIfNeeded();
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
    invalidateNotesCache();
    // Don't use enqueueWithLease here — it releases the lease immediately after
    // the server responds, but the server also sends an SSE note_updated event
    // that triggers patchSingleNote after a 300ms debounce. If the lease is
    // already released by then, patchSingleNote fetches the server note (which
    // may have a different position) and overwrites the optimistic state, causing
    // a visual flash in Masonry. Instead, release the lease with a delay that
    // covers the SSE debounce window.
    try {
      await enqueueAndSync({ type: "patch", noteId: nid, payload: { pinned: !!toPinned, client_updated_at: nowIso } });
    } catch (e) {
      // On failure, lease stays active — SSE protection maintained
      return;
    }
    // Delay lease release past the SSE debounce (300ms) + patchSingleNote fetch time
    setTimeout(() => releaseLocalLeaseWithPrune(nid, leaseId), 1000);
  };

  /** -------- Reset note order -------- */
  const resetNoteOrder = async (overridePositions = true) => {
    // Reorder is per-user on the server (note_user_positions), so shared
    // notes are fine to include — each participant keeps their own order.
    const sorted = notes.slice().sort((a, b) => {
      const ap = a?.pinned ? 1 : 0;
      const bp = b?.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const aUpd = new Date(a?.updated_at || a?.timestamp || 0).getTime();
      const bUpd = new Date(b?.updated_at || b?.timestamp || 0).getTime();
      if (aUpd !== bUpd) return bUpd - aUpd;
      const aCre = new Date(a?.created_at || 0).getTime();
      const bCre = new Date(b?.created_at || 0).getTime();
      return bCre - aCre;
    });

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
      } catch (e) {}
    }

    const pinnedIds = sorted.filter((n) => n.pinned).map((n) => String(n.id));
    const otherIds = sorted.filter((n) => !n.pinned).map((n) => String(n.id));
    // Hold leases until onSyncComplete confirms server-side
    const reorderToken = `R${++reorderTokenSeqRef.current}`;
    pendingReorderLeasesRef.current.set(reorderToken, noteLeases);
    try {
      await enqueueAndSync({ type: "reorder", noteId: "__reorder__", payload: { pinnedIds, otherIds, _reorderToken: reorderToken, client_reordered_at: new Date().toISOString() } });
    } catch (e) {
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
      } catch (e) {}
    }

    invalidateNotesCache();

    // Enqueue reorder — leases are held until onSyncComplete confirms server-side.
    // Tag payload with token so onSyncComplete can find and release the leases.
    const reorderToken = `R${++reorderTokenSeqRef.current}`;
    pendingReorderLeasesRef.current.set(reorderToken, noteLeases);
    try {
      await enqueueAndSync({ type: "reorder", noteId: "__reorder__", payload: { pinnedIds: newPinned, otherIds: newOthers, _reorderToken: reorderToken, client_reordered_at: new Date().toISOString() } });
    } catch (e) {
      // enqueue failed — leases stay active (SSE protection maintained)
    }
    dragGroup.current = null;
  };
  const onDragEnd = (ev) => {
    ev.currentTarget.classList.remove("dragging");
  };

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
    invalidateNotesCache();
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
    invalidateNotesCache();
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

  // Checklist drag-and-drop is handled by useChecklistDrag inside NoteModal

  /** -------- Tags list (unique + counts) -------- */
  // Keep allNotesForTags in sync with notes when in normal view,
  // so tags remain visible when navigating to archive/trash
  useEffect(() => {
    if (notesAreRegular.current) {
      setAllNotesForTags(notes);
    }
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
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const tag =
      tagFilter === ALL_IMAGES
        ? null
        : tagFilter === "ARCHIVED"
          ? null
          : tagFilter === "TRASHED"
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
  }, [notes, search, tagFilter, activeTagFilters]);
  const pinned = filtered.filter((n) => n.pinned);
  const others = filtered.filter((n) => !n.pinned);
  const filteredEmptyWithSearch =
    filtered.length === 0 &&
    notes.length > 0 &&
    !!(search || (tagFilter && tagFilter !== "ARCHIVED" && tagFilter !== "TRASHED") || activeTagFilters.length > 0);
  const allEmpty = notes.length === 0;

  const formatComposer = (type) =>
    runFormat(() => content, setContent, contentRef, type);

  /** Composer smart-enter handler */
  const onComposerKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey)
      return;
    const el = contentRef.current;
    if (!el) return;
    const value = content;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const res = handleSmartEnter(value, start, end);
    if (res) {
      e.preventDefault();
      setContent(res.text);
      requestAnimationFrame(() => {
        try {
          el.setSelectionRange(res.range[0], res.range[1]);
        } catch (e) {}
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
      });
    }
  };

  /** -------- Modal JSX -------- */
  const modal = (
    <NoteModal
      open={open}
      isModalClosing={isModalClosing}
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
      mImages={mImages}
      setMImages={setMImages}
      mItems={mItems}
      setMItems={setMItems}
      mInput={mInput}
      setMInput={setMInput}
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
      modalMenuBtnRef={modalMenuBtnRef}
      modalFmtBtnRef={modalFmtBtnRef}
      modalTagInputRef={modalTagInputRef}
      modalTagBtnRef={modalTagBtnRef}
      suppressTagBlurRef={suppressTagBlurRef}
      modalColorBtnRef={modalColorBtnRef}
      scrimClickStartRef={scrimClickStartRef}
      savedModalScrollRatioRef={savedModalScrollRatioRef}
      activeNoteObj={activeNoteObj}
      editedStamp={editedStamp}
      modalHasChanges={modalHasChanges}
      modalScrollable={modalScrollable}
      tagsWithCounts={tagsWithCounts}
      addTags={addTags}
      handleTagKeyDown={handleTagKeyDown}
      handleTagBlur={handleTagBlur}
      handleTagPaste={handleTagPaste}
      modalMenuOpen={modalMenuOpen}
      setModalMenuOpen={setModalMenuOpen}
      showModalFmt={showModalFmt}
      setShowModalFmt={setShowModalFmt}
      formatModal={formatModal}
      showModalColorPop={showModalColorPop}
      setShowModalColorPop={setShowModalColorPop}
      modalKebabOpen={modalKebabOpen}
      setModalKebabOpen={setModalKebabOpen}
      confirmDeleteOpen={confirmDeleteOpen}
      setConfirmDeleteOpen={setConfirmDeleteOpen}
      savingModal={savingModal}
      collaborationModalOpen={collaborationModalOpen}
      setCollaborationModalOpen={setCollaborationModalOpen}
      collaboratorUsername={collaboratorUsername}
      setCollaboratorUsername={setCollaboratorUsername}
      addModalCollaborators={addModalCollaborators}
      showUserDropdown={showUserDropdown}
      setShowUserDropdown={setShowUserDropdown}
      filteredUsers={filteredUsers}
      setFilteredUsers={setFilteredUsers}
      loadingUsers={loadingUsers}
      dropdownPosition={dropdownPosition}
      collaboratorInputRef={collaboratorInputRef}
      addCollaborator={addCollaborator}
      removeCollaborator={removeCollaborator}
      searchUsers={searchUsers}
      updateDropdownPosition={updateDropdownPosition}
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
      closeModal={closeModal}
      saveModal={saveModal}
      deleteModal={deleteModal}
      restoreFromTrash={restoreFromTrash}
      handleArchiveNote={handleArchiveNote}
      handleDownloadNote={handleDownloadNote}
      togglePin={togglePin}
      addImagesToState={addImagesToState}
      isCollaborativeNote={isCollaborativeNote}
      syncState={syncStatus.syncState}
      onModalBodyClick={onModalBodyClick}
      resizeModalTextarea={resizeModalTextarea}
      syncChecklistItems={syncChecklistItems}
      checklistInsertPosition={checklistInsertPosition}
      checklistRemoveSectionBehavior={checklistRemoveSectionBehavior}
      onConvertNoteType={convertNoteType}
      initialDrawMode={initialDrawMode}
      onConsumeInitialDrawMode={() => setInitialDrawMode(null)}
    />
  );

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser?.email && route !== "#/notes" && route !== "#/admin")
      navigate("#/notes");
  }, [currentUser]); // eslint-disable-line

  // Close sidebar when navigating away or opening modal
  useEffect(() => {
    if (open && !(activeTagFilters && window.matchMedia?.("(min-width: 1024px)")?.matches)) setSidebarOpen(false);
  }, [open]);

  // ---- Routing ----
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
        token={token}
        currentUser={currentUser}
        dark={dark}
        showGenericConfirm={showGenericConfirm}
        onToggleDark={toggleDark}
        onBackToNotes={() => (window.location.hash = "#/notes")}
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
      {floatingCardsEnabled && <FloatingCardsBackground />}
      {/* Tag Sidebar / Drawer */}
      <TagSidebar
        open={sidebarOpen}
        onClose={() => {
          if (alwaysShowSidebarOnWide && windowWidth >= 700 && !isMobileDevice) {
            setDesktopSidebarHidden(true);
          } else {
            setSidebarOpen(false);
          }
        }}
        tagsWithCounts={tagsWithCounts}
        activeTag={tagFilter}
        activeTagFilters={activeTagFilters}
        onSelect={(tag, event) => {
          if (tag === "ARCHIVED" || tag === "TRASHED" || tag === ALL_IMAGES || tag === null) {
            // Only clear notes when SWITCHING views, not when re-clicking the same one
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
        permanent={alwaysShowSidebarOnWide && windowWidth >= 700 && !isMobileDevice && !desktopSidebarHidden}
        width={sidebarWidth}
        onResize={setSidebarWidth}
      />

      {/* Settings Panel */}
      <SettingsPanel
        open={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        dark={dark}
        onExportAll={exportAll}
        onImportAll={() => importFileRef.current?.click()}
        onImportGKeep={() => gkeepFileRef.current?.click()}
        onImportMd={() => mdFileRef.current?.click()}
        onDownloadSecretKey={downloadSecretKey}
        alwaysShowSidebarOnWide={alwaysShowSidebarOnWide}
        setAlwaysShowSidebarOnWide={setAlwaysShowSidebarOnWide}
        localAiEnabled={localAiEnabled}
        setLocalAiEnabled={setLocalAiEnabled}
        floatingCardsEnabled={floatingCardsEnabled}
        setFloatingCardsEnabled={setFloatingCardsEnabled}
        checklistInsertPosition={checklistInsertPosition}
        setChecklistInsertPosition={setChecklistInsertPosition}
        checklistRemoveSectionBehavior={checklistRemoveSectionBehavior}
        setChecklistRemoveSectionBehavior={setChecklistRemoveSectionBehavior}
        edgeToEdgeLandscape={edgeToEdgeLandscape}
        setEdgeToEdgeLandscape={setEdgeToEdgeLandscape}
        showGenericConfirm={showGenericConfirm}
        showToast={showToast}
        onResetNoteOrder={resetNoteOrder}
        currentUser={currentUser}
        token={token}
        onProfileUpdated={(updates) => {
          setSession((prev) => prev ? { ...prev, user: { ...prev.user, ...updates } } : prev);
          setAuth({ ...getAuth(), user: { ...getAuth()?.user, ...updates } });
        }}
        onChangePassword={() => setChangePasswordOpen(true)}
      />

      {/* Admin Panel */}
      <AdminPanel
        open={adminPanelOpen}
        onClose={() => setAdminPanelOpen(false)}
        dark={dark}
        adminSettings={adminSettings}
        setAdminSettings={setAdminSettings}
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
      />

      <NotesUI
        currentUser={currentUser}
        dark={dark}
        toggleDark={toggleDark}
        signOut={signOut}
        search={search}
        setSearch={setSearch}
        composerType={composerType}
        setComposerType={setComposerType}
        title={title}
        setTitle={setTitle}
        content={content}
        setContent={setContent}
        contentRef={contentRef}
        clInput={clInput}
        setClInput={setClInput}
        addComposerItem={addComposerItem}
        clItems={clItems}
        composerDrawingData={composerDrawingData}
        setComposerDrawingData={setComposerDrawingData}
        composerImages={composerImages}
        setComposerImages={setComposerImages}
        composerFileRef={composerFileRef}
        tags={tags}
        composerTagList={composerTagList}
        setComposerTagList={setComposerTagList}
        composerTagInput={composerTagInput}
        setComposerTagInput={setComposerTagInput}
        composerTagFocused={composerTagFocused}
        setComposerTagFocused={setComposerTagFocused}
        composerTagInputRef={composerTagInputRef}
        tagsWithCounts={tagsWithCounts}
        setTags={setTags}
        composerColor={composerColor}
        setComposerColor={setComposerColor}
        addNote={addNote}
        onDirectDraw={handleDirectDraw}
        onDirectText={handleDirectText}
        onDirectChecklist={handleDirectChecklist}
        pinned={pinned}
        others={others}
        openModal={openModal}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        togglePin={togglePin}
        addImagesToState={addImagesToState}
        filteredEmptyWithSearch={filteredEmptyWithSearch}
        allEmpty={allEmpty}
        onExportAll={exportAll}
        onImportAll={importAll}
        onImportGKeep={importGKeep}
        onImportMd={importMd}
        onDownloadSecretKey={downloadSecretKey}
        importFileRef={importFileRef}
        gkeepFileRef={gkeepFileRef}
        mdFileRef={mdFileRef}
        headerMenuOpen={headerMenuOpen}
        setHeaderMenuOpen={setHeaderMenuOpen}
        headerMenuRef={headerMenuRef}
        headerBtnRef={headerBtnRef}
        openSidebar={() => {
          if (alwaysShowSidebarOnWide && windowWidth >= 700 && !isMobileDevice) {
            setDesktopSidebarHidden(h => !h);
          } else {
            setSidebarOpen(true);
          }
        }}
        activeTagFilter={tagFilter}
        activeTagFilters={activeTagFilters}
        sidebarPermanent={alwaysShowSidebarOnWide && windowWidth >= 700 && !isMobileDevice && !desktopSidebarHidden}
        sidebarWidth={sidebarWidth}
        // AI props
        localAiEnabled={localAiEnabled}
        aiResponse={aiResponse}
        setAiResponse={setAiResponse}
        isAiLoading={isAiLoading}
        aiLoadingProgress={aiLoadingProgress}
        onAiSearch={handleAiSearch}
        // formatting props
        formatComposer={formatComposer}
        showComposerFmt={showComposerFmt}
        setShowComposerFmt={setShowComposerFmt}
        composerFmtBtnRef={composerFmtBtnRef}
        onComposerKeyDown={onComposerKeyDown}
        // collapsed composer
        composerCollapsed={composerCollapsed}
        setComposerCollapsed={setComposerCollapsed}
        titleRef={titleRef}
        composerRef={composerRef}
        // color popover
        colorBtnRef={colorBtnRef}
        showColorPop={showColorPop}
        setShowColorPop={setShowColorPop}
        // loading
        notesLoading={notesLoading}
        // multi-select
        multiMode={multiMode}
        selectedIds={selectedIds}
        onStartMulti={onStartMulti}
        onExitMulti={onExitMulti}
        onToggleSelect={onToggleSelect}
        onSelectAllPinned={onSelectAllPinned}
        onSelectAllOthers={onSelectAllOthers}
        onBulkDelete={onBulkDelete}
        onBulkPin={onBulkPin}
        onBulkArchive={onBulkArchive}
        onBulkRestore={onBulkRestore}
        onBulkColor={onBulkColor}
        onBulkDownloadZip={onBulkDownloadZip}
        onSelectAll={onSelectAll}
        onEmptyTrash={onEmptyTrash}
        // view mode
        listView={listView}
        onToggleViewMode={onToggleViewMode}
        // SSE connection status
        sseConnected={sseConnected}
        isOnline={isOnline}
        loadNotes={loadNotes}
        loadArchivedNotes={loadArchivedNotes}
        // sync
        syncStatus={syncStatus}
        handleSyncNow={handleSyncNow}
        syncDropdownOpen={syncDropdownOpen}
        setSyncDropdownOpen={setSyncDropdownOpen}
        mobileSearchOpen={mobileSearchOpen}
        setMobileSearchOpen={setMobileSearchOpen}
        fabOpen={fabOpen}
        setFabOpen={setFabOpen}
        // checklist update
        onUpdateChecklistItem={onUpdateChecklistItem}
        // Admin panel
        openAdminPanel={openAdminPanel}
        // Settings panel
        openSettingsPanel={openSettingsPanel}
        // header auto-hide (mobile)
        windowWidth={windowWidth}
        isLandscapeMobile={isLandscapeMobile}
        // floating cards toggle
        floatingCardsEnabled={floatingCardsEnabled}
        onToggleFloatingCards={toggleFloatingCards}
      />
      {modal}

      <GenericConfirmDialog
        open={genericConfirmOpen}
        dark={dark}
        config={genericConfirmConfig}
        onClose={() => setGenericConfirmOpen(false)}
      />

      <ToastContainer toasts={toasts} />

      {/* Forced password change (first login with temp password) */}
      {mustChangePassword && (
        <ChangePasswordModal
          forced
          token={token}
          dark={dark}
          onSuccess={(res) => {
            setMustChangePassword(false);
            if (res.token && res.user) {
              setSession((prev) => ({ ...prev, token: res.token, user: res.user }));
              setAuth({ ...getAuth(), token: res.token, user: res.user });
            }
            showToast(t("passwordChangedSuccess"), "success");
          }}
        />
      )}

      {/* Voluntary password change (from Settings) */}
      {changePasswordOpen && !mustChangePassword && (
        <ChangePasswordModal
          token={token}
          dark={dark}
          onClose={() => setChangePasswordOpen(false)}
          onSuccess={(res) => {
            setChangePasswordOpen(false);
            if (res.token && res.user) {
              setSession((prev) => ({ ...prev, token: res.token, user: res.user }));
              setAuth({ ...getAuth(), token: res.token, user: res.user });
            }
            showToast(t("passwordChangedSuccess"), "success");
          }}
        />
      )}
    </>
  );
}
