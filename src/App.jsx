import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { askAI } from "./ai";
import DrawingCanvas from "./DrawingCanvas";
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
import { trColorName, LIGHT_COLORS, DARK_COLORS, COLOR_ORDER, solid, bgFor, parseRGBA, mixWithWhite, modalBgFor, scrollColorsFor } from "./utils/colors.js";
import { api, getAuth, setAuth, AUTH_KEY } from "./utils/api.js";
import { renderSafeMarkdown, mdToPlain, mdForDownload, linkifyPhoneNumbers } from "./utils/markdown.jsx";
import { uid, sanitizeFilename, downloadText, downloadDataUrl, triggerBlobDownload, ensureJSZip, imageExtFromDataURL, normalizeImageFilename, formatEditedStamp, fileToCompressedDataURL } from "./utils/helpers.js";
import { PinOutline, PinFilled, Trash, Sun, Moon, ImageIcon, GalleryIcon, CloseIcon, DownloadIcon, ArrowLeft, ArrowRight, SearchIcon, Kebab, Hamburger, FormatIcon, SettingsIcon, GridIcon, ListIcon, SunIcon, Sparkles, MoonIcon, CheckSquareIcon, ShieldIcon, LogOutIcon, FloatingCardsIcon, ArchiveIcon, PinIcon, TextNoteIcon, ChecklistIcon, BrushIcon, AddImageIcon } from "./icons/index.jsx";
import { globalCSS } from "./styles/globalCSS.js";
import ChecklistRow from "./components/common/ChecklistRow.jsx";
import { ColorDot } from "./components/common/ColorDot.jsx";
import PaletteColorIcon from "./components/common/PaletteColorIcon.jsx";
import ColorPickerPanel from "./components/common/ColorPickerPanel.jsx";
import { wrapSelection, fencedBlock, selectionBounds, toggleList, prefixLines, handleSmartEnter } from "./components/common/FormatToolbar.jsx";
import FormatToolbar from "./components/common/FormatToolbar.jsx";
import Popover from "./components/common/Popover.jsx";
import DrawingPreview from "./components/common/DrawingPreview.jsx";
import UserAvatar from "./components/common/UserAvatar.jsx";
import TooltipPortal from "./components/common/TooltipPortal.jsx";
import AuthShell from "./components/auth/AuthShell.jsx";
import LoginView from "./components/auth/LoginView.jsx";
import RegisterView from "./components/auth/RegisterView.jsx";
import SecretLoginView from "./components/auth/SecretLoginView.jsx";
import TagSidebar, { NotesIcon, ImagesIcon, ArchiveSidebarIcon, TrashSidebarIcon, TagIcon } from "./components/panels/TagSidebar.jsx";
import SettingsPanel from "./components/panels/SettingsPanel.jsx";
import AdminPanel from "./components/panels/AdminPanel.jsx";
import NoteCard from "./components/notes/NoteCard.jsx";
import AdminView from "./components/notes/AdminView.jsx";


/** ---------- Special tag filters ---------- */
const ALL_IMAGES = "__ALL_IMAGES__";

/** ---------- NotesUI (presentational) ---------- */
function NotesUI({
  currentUser,
  dark,
  toggleDark,
  search,
  setSearch,
  composerType,
  setComposerType,
  title,
  setTitle,
  content,
  setContent,
  contentRef,
  clInput,
  setClInput,
  addComposerItem,
  clItems,
  composerDrawingData,
  setComposerDrawingData,
  composerImages,
  setComposerImages,
  composerFileRef,
  tags,
  setTags,
  composerTagList,
  setComposerTagList,
  composerTagInput,
  setComposerTagInput,
  composerTagFocused,
  setComposerTagFocused,
  composerTagInputRef,
  tagsWithCounts,
  composerColor,
  setComposerColor,
  addNote,
  pinned,
  others,
  openModal,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  togglePin,
  addImagesToState,
  onExportAll,
  onImportAll,
  onImportGKeep,
  onImportMd,
  onDownloadSecretKey,
  importFileRef,
  gkeepFileRef,
  mdFileRef,
  signOut,
  filteredEmptyWithSearch,
  allEmpty,
  headerMenuOpen,
  setHeaderMenuOpen,
  headerMenuRef,
  headerBtnRef,
  // new for sidebar
  openSidebar,
  activeTagFilter,
  activeTagFilters = [],
  sidebarPermanent,
  sidebarWidth,
  // formatting
  formatComposer,
  showComposerFmt,
  setShowComposerFmt,
  composerFmtBtnRef,
  onComposerKeyDown,
  // collapsed composer
  composerCollapsed,
  setComposerCollapsed,
  titleRef,
  composerRef,
  // color popover
  colorBtnRef,
  showColorPop,
  setShowColorPop,
  // loading state
  notesLoading,
  // multi-select
  multiMode,
  selectedIds,
  onStartMulti,
  onExitMulti,
  onToggleSelect,
  onSelectAllPinned,
  onSelectAllOthers,
  onBulkDelete,
  onBulkPin,
  onBulkArchive,
  onBulkRestore,
  onBulkColor,
  onBulkDownloadZip,
  // view mode
  listView,
  onToggleViewMode,
  // SSE connection status
  sseConnected,
  isOnline,
  loadNotes,
  loadArchivedNotes,
  // checklist update
  onUpdateChecklistItem,
  // Admin panel
  openAdminPanel,
  // Settings panel
  openSettingsPanel,
  // AI props
  localAiEnabled,
  aiResponse,
  setAiResponse,
  isAiLoading,
  aiLoadingProgress,
  onAiSearch,
  // header auto-hide (mobile)
  windowWidth,
  // floating cards toggle
  floatingCardsEnabled,
  onToggleFloatingCards,
  // sync
  syncStatus,
  handleSyncNow,
}) {
  // Multi-select color popover (local UI state)
  const multiColorBtnRef = useRef(null);
  const [showMultiColorPop, setShowMultiColorPop] = useState(false);

  // Mobile search expand
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchRef = useRef(null);

  // Header auto-hide on scroll (mobile only)
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  useEffect(() => {
    if (windowWidth >= 700) {
      setHeaderVisible(true);
      return;
    }
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastScrollYRef.current;
      if (y < 10) {
        setHeaderVisible(true);
      } else if (delta > 4) {
        setHeaderVisible(false);
      } else if (delta < -4) {
        setHeaderVisible(true);
      }
      lastScrollYRef.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [windowWidth]);
  const sectionLabel = (() => {
    if (activeTagFilters.length > 1) return activeTagFilters.join(", ");
    if (activeTagFilters.length === 1) return activeTagFilters[0];
    if (activeTagFilter === ALL_IMAGES) return t("allImages");
    if (activeTagFilter === "ARCHIVED") return t("archivedNotes");
    if (activeTagFilter === "TRASHED") return t("trashedNotes");
    if (activeTagFilter) return activeTagFilter;
    return t("notes");
  })();

  const SectionIcon = (() => {
    if (activeTagFilter === ALL_IMAGES) return ImagesIcon;
    if (activeTagFilter === "ARCHIVED") return ArchiveSidebarIcon;
    if (activeTagFilter === "TRASHED") return TrashSidebarIcon;
    if (activeTagFilter || activeTagFilters.length > 0) return TagIcon;
    return NotesIcon;
  })();

  // Close header menu when scrolling
  React.useEffect(() => {
    if (!headerMenuOpen) return;

    const handleScroll = () => {
      setHeaderMenuOpen(false);
    };

    const scrollContainer = document.querySelector(".min-h-screen");
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", handleScroll, {
        passive: true,
      });
      return () => scrollContainer.removeEventListener("scroll", handleScroll);
    }
  }, [headerMenuOpen, setHeaderMenuOpen]);


  return (
    <div
      className="min-h-screen"
      style={{ marginLeft: sidebarPermanent ? `${sidebarWidth}px` : "0px", position:"relative", zIndex:2 }}
    >
      {/* Multi-select toolbar (floats above header when active) */}
      {multiMode && (
        <div
          className="p-3 sm:p-4 flex items-center justify-between sticky top-0 z-[25] glass-card mb-2"
          style={{ position: "sticky" }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
              onClick={onBulkDownloadZip}
            >{t("downloadZip")}</button>
            {activeTagFilter === "TRASHED" ? (
              <>
                <button
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm flex items-center gap-1"
                  onClick={onBulkRestore}
                >{t("restoreFromTrash")}</button>
                <button
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm"
                  onClick={onBulkDelete}
                >{t("permanentlyDelete")}</button>
              </>
            ) : (
              <>
                <button
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm"
                  onClick={onBulkDelete}
                >{t("moveToTrash")}</button>
                <button
                  ref={multiColorBtnRef}
                  type="button"
                  onClick={() => setShowMultiColorPop((v) => !v)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
                  data-tooltip={t("color")}
                >{t("colorEmoji")}</button>
                <ColorPickerPanel
                  anchorRef={multiColorBtnRef}
                  open={showMultiColorPop}
                  onClose={() => setShowMultiColorPop(false)}
                  colors={COLOR_ORDER.filter((name) => LIGHT_COLORS[name])}
                  selectedColor={null}
                  darkMode={dark}
                  onSelect={(name) => { onBulkColor(name); }}
                />
                {activeTagFilter !== "ARCHIVED" && (
                  <button
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm flex items-center gap-1"
                    onClick={() => onBulkPin(true)}
                  >
                    <PinIcon />{t("pin")}</button>
                )}
                <button
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm flex items-center gap-1"
                  onClick={onBulkArchive}
                >
                  <ArchiveIcon />
                  {activeTagFilter === "ARCHIVED" ? t("unarchive") : t("archive")}
                </button>
              </>
            )}
            <span className="text-xs opacity-70 ml-2">{t("selectedPrefix")} {selectedIds.length}
            </span>
          </div>
          <button
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            data-tooltip={t("exitMultiSelect")}
            onClick={onExitMulti}
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {/* Header */}
      <header
        className={`p-4 sm:p-6 flex justify-between items-center sticky top-0 ${mobileSearchOpen ? "z-[1000]" : "z-20"} glass-card mb-6 relative`}
        style={{
          transform: !headerVisible && windowWidth < 700 ? "translateY(-100%)" : "translateY(0)",
          transition: "transform 0.3s ease",
        }}
      >
        <div className="flex items-center gap-3 shrink-0">
          {/* Hamburger - only show when sidebar is not permanent */}
          {!sidebarPermanent && (
            <button
              onClick={openSidebar}
              className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              data-tooltip={t("openTags")}
              aria-label={t("openTags")}
            >
              <Hamburger />
            </button>
          )}

          {/* App logo */}
          <img
            src="/favicon-32x32.png"
            srcSet="/pwa-192.png 2x, /pwa-512.png 3x"
            alt={t("glassKeepLogo")}
            className="h-7 w-7 rounded-xl shadow-sm select-none pointer-events-none"
            draggable="false"
          />

          {/* Mobile: stacked name + badge */}
          <div className="flex flex-col sm:hidden leading-tight">
            <h1 className="text-lg font-bold">Glass Keep</h1>
            <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1 max-w-[160px]">
              <span className="shrink-0 w-3 h-3 [&>svg]:w-3 [&>svg]:h-3"><SectionIcon /></span>
              <span className="truncate">{sectionLabel}</span>
            </span>
          </div>

          {/* Desktop: inline name + separator + badge */}
          <h1 className="hidden sm:block text-2xl sm:text-3xl font-bold">
            Glass Keep
          </h1>
          <span className="hidden sm:inline-block h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />
          <span className="hidden sm:flex text-base font-medium px-3 py-1 rounded-lg bg-indigo-600/10 text-indigo-700 dark:text-indigo-300 border border-indigo-600/20 items-center gap-1.5 max-w-[200px]">
            <span className="shrink-0 w-4 h-4 [&>svg]:w-4 [&>svg]:h-4"><SectionIcon /></span>
            <span className="truncate">{sectionLabel}</span>
          </span>

          {/* Offline indicator */}
          {!isOnline && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-orange-600/10 text-orange-700 dark:text-orange-300 border border-orange-600/20">{t("offline")}</span>
          )}
        </div>

        {/* Desktop: full search bar */}
        <div className="hidden sm:flex flex-grow min-w-0 justify-center px-2 sm:px-8">
          <div className="relative w-full max-w-lg">
            <input
              type="text"
              placeholder={localAiEnabled ? t("searchOrAskAi") : t("search")}
              className={`w-full bg-transparent border border-[var(--border-light)] rounded-lg pl-4 ${localAiEnabled ? "pr-14" : "pr-8"} py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  localAiEnabled &&
                  search.trim().length > 0
                ) {
                  onAiSearch?.(search);
                }
              }}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {localAiEnabled && search.trim().length > 0 && (
                <button
                  type="button"
                  data-tooltip={t("askAi")}
                  className="h-7 w-7 rounded-full flex items-center justify-center text-indigo-600 hover:bg-indigo-600/10 transition-colors"
                  onClick={() => onAiSearch?.(search)}
                >
                  <Sparkles />
                </button>
              )}
              {search && (
                <button
                  type="button"
                  aria-label={t("clearSearch")}
                  className="h-6 w-6 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                  onClick={() => setSearch("")}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile: search icon that expands into a full search bar */}
        <div className="sm:hidden flex items-center ml-auto mr-1">
          {!mobileSearchOpen && (
            <button
              type="button"
              className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-600 dark:text-gray-300"
              aria-label={t("search")}
              onClick={() => {
                setMobileSearchOpen(true);
                setTimeout(() => mobileSearchRef.current?.focus(), 50);
              }}
            >
              <SearchIcon />
            </button>
          )}
        </div>
        {/* Mobile expanded search overlay - covers the header content */}
        {mobileSearchOpen && createPortal(
          <div
            className="sm:hidden fixed inset-0 z-[999]"
            onClick={() => setMobileSearchOpen(false)}
          />,
          document.body
        )}
        {mobileSearchOpen && (
          <div className="sm:hidden absolute inset-0 z-30 flex items-center px-3 gap-2 bg-[var(--bg-card,_var(--bg-primary))] backdrop-blur-xl">
            <div className="relative flex-1 min-w-0">
              <input
                ref={mobileSearchRef}
                type="text"
                placeholder={localAiEnabled ? t("searchOrAskAi") : t("search")}
                className={`w-full bg-transparent border border-[var(--border-light)] rounded-lg pl-3 ${localAiEnabled ? "pr-12" : "pr-8"} py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setMobileSearchOpen(false);
                  }
                  if (
                    e.key === "Enter" &&
                    localAiEnabled &&
                    search.trim().length > 0
                  ) {
                    onAiSearch?.(search);
                  }
                }}
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                {localAiEnabled && search.trim().length > 0 && (
                  <button
                    type="button"
                    className="h-6 w-6 rounded-full flex items-center justify-center text-indigo-600 hover:bg-indigo-600/10 transition-colors"
                    onClick={() => onAiSearch?.(search)}
                  >
                    <Sparkles />
                  </button>
                )}
                {search && (
                  <button
                    type="button"
                    aria-label={t("clearSearch")}
                    className="h-5 w-5 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                    onClick={() => setSearch("")}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="relative flex items-center gap-3 shrink-0">
          {/* Desktop: icon buttons directly in header bar */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => onToggleViewMode?.()}
              className={`p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${dark ? "text-blue-400 hover:text-blue-300 hover:bg-blue-500/15 focus:ring-blue-500" : "text-blue-600 hover:text-blue-700 hover:bg-blue-100 focus:ring-blue-400"}`}
              data-tooltip={listView ? t("gridView") : t("listView")}
              aria-label={listView ? t("gridView") : t("listView")}
            >
              {listView ? <GridIcon /> : <ListIcon />}
            </button>
            <button
              onClick={() => toggleDark?.()}
              className={`p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${dark ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/15 focus:ring-amber-500" : "text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 focus:ring-indigo-400"}`}
              data-tooltip={dark ? t("lightMode") : t("darkMode")}
              aria-label={dark ? t("lightMode") : t("darkMode")}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
            <SyncStatusIcon dark={dark} syncStatus={syncStatus} onSyncNow={handleSyncNow} />
            <button
              onClick={() => onStartMulti?.()}
              className={`p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${dark ? "text-violet-400 hover:text-violet-300 hover:bg-violet-500/15 focus:ring-violet-500" : "text-violet-600 hover:text-violet-700 hover:bg-violet-100 focus:ring-violet-400"}`}
              data-tooltip={t("multiSelect")}
              aria-label={t("multiSelect")}
            >
              <CheckSquareIcon />
            </button>
            <button
              onClick={() => openSettingsPanel?.()}
              className={`p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${dark ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700 focus:ring-gray-500" : "text-gray-500 hover:text-gray-700 hover:bg-gray-200 focus:ring-gray-400"}`}
              data-tooltip={t("settings")}
              aria-label={t("settings")}
            >
              <SettingsIcon />
            </button>
            <span className={`mx-1 w-px h-5 ${dark ? "bg-gray-600" : "bg-gray-300"}`} />
            {currentUser?.is_admin && (
              <button
                onClick={() => openAdminPanel?.()}
                className={`p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${dark ? "text-red-400 hover:text-red-300 hover:bg-red-500/15 focus:ring-red-500" : "text-red-600 hover:text-red-700 hover:bg-red-100 focus:ring-red-400"}`}
                data-tooltip={t("adminPanel")}
                aria-label={t("adminPanel")}
              >
                <ShieldIcon />
              </button>
            )}
            <span className="flex items-center gap-2">
              <UserAvatar
                name={currentUser?.name}
                email={currentUser?.email}
                avatarUrl={currentUser?.avatar_url}
                size="w-7 h-7"
                textSize="text-xs"
                dark={dark}
              />
              <span className={`text-sm font-medium ${dark ? "text-gray-200" : "text-gray-700"}`}>
                {currentUser?.name || currentUser?.email}
              </span>
            </span>
            <button
              onClick={() => signOut?.()}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 text-red-500 dark:text-red-400"
              data-tooltip={t("signOut")}
              aria-label={t("signOut")}
            >
              <LogOutIcon />
            </button>
          </div>

          {/* Mobile: sync icon + 3-dot menu */}
          <div className="sm:hidden flex items-center gap-1">
            <SyncStatusIcon dark={dark} syncStatus={syncStatus} onSyncNow={handleSyncNow} />
            <button
              ref={headerBtnRef}
              onClick={() => setHeaderMenuOpen((v) => !v)}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800"
              data-tooltip={t("menu")}
              aria-haspopup="menu"
              aria-expanded={headerMenuOpen}
            >
              <Kebab />
            </button>

            {headerMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-[1099]"
                  onClick={() => setHeaderMenuOpen(false)}
                />
                <div
                  ref={headerMenuRef}
                  className={`absolute top-12 right-0 min-w-[220px] z-[1100] border border-[var(--border-light)] rounded-lg shadow-lg overflow-hidden ${dark ? "text-gray-100" : "bg-white text-gray-800"}`}
                  style={{ backgroundColor: dark ? "#222222" : undefined }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      openSettingsPanel?.();
                    }}
                  >
                    <span className={dark ? "text-gray-400" : "text-gray-500"}><SettingsIcon /></span>{t("settings")}</button>
                  <button
                    className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      onToggleViewMode?.();
                    }}
                  >
                    <span className={dark ? "text-blue-400" : "text-blue-600"}>{listView ? <GridIcon /> : <ListIcon />}</span>
                    {listView ? t("gridView") : t("listView")}
                  </button>
                  <button
                    className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      toggleDark?.();
                    }}
                  >
                    <span className={dark ? "text-amber-400" : "text-indigo-600"}>{dark ? <SunIcon /> : <MoonIcon />}</span>
                    {dark ? t("lightMode") : t("darkMode")}
                  </button>
                  <button
                    className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      onStartMulti?.();
                    }}
                  >
                    <span className={dark ? "text-violet-400" : "text-violet-600"}><CheckSquareIcon /></span>{t("multiSelect")}</button>
                  {currentUser?.is_admin && (
                    <button
                      className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                      onClick={() => {
                        setHeaderMenuOpen(false);
                        openAdminPanel?.();
                      }}
                    >
                      <span className={dark ? "text-red-400" : "text-red-600"}><ShieldIcon /></span>{t("adminPanel")}</button>
                  )}
                  <button
                    className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "text-red-400 hover:bg-white/10" : "text-red-600 hover:bg-gray-100"}`}
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      signOut?.();
                    }}
                  >
                    <LogOutIcon />{t("signOut")}</button>
                </div>
              </>
            )}
          </div>

          {/* Hidden import input */}
          <input
            ref={importFileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              if (e.target.files && e.target.files.length) {
                await onImportAll?.(e.target.files);
                e.target.value = "";
              }
            }}
          />
          {/* Hidden Google Keep import input (multiple) */}
          <input
            ref={gkeepFileRef}
            type="file"
            accept="application/json"
            multiple
            className="hidden"
            onChange={async (e) => {
              if (e.target.files && e.target.files.length) {
                await onImportGKeep?.(e.target.files);
                e.target.value = "";
              }
            }}
          />
          {/* Hidden Markdown import input (multiple) */}
          <input
            ref={mdFileRef}
            type="file"
            accept=".md,text/markdown"
            multiple
            className="hidden"
            onChange={async (e) => {
              if (e.target.files && e.target.files.length) {
                await onImportMd?.(e.target.files);
                e.target.value = "";
              }
            }}
          />
        </div>
      </header>

      {/* AI Response Box */}
      {localAiEnabled && (aiResponse || isAiLoading) && (
        <div className="px-4 sm:px-6 md:px-8 lg:px-12 mb-6">
          <div className="max-w-2xl mx-auto glass-card rounded-xl shadow-lg p-5 border border-indigo-500/30 relative bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/30 dark:to-purple-950/30 z-[50]">
            {isAiLoading && (
              <div
                className="absolute top-0 left-0 h-1 bg-indigo-500 transition-all duration-300"
                style={{
                  width: aiLoadingProgress ? `${aiLoadingProgress}%` : "5%",
                }}
              />
            )}
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="text-indigo-600 dark:text-indigo-400" />
              <h3 className="font-semibold text-indigo-700 dark:text-indigo-300">{t("aiAssistant")}</h3>
              {aiResponse && !isAiLoading && (
                <button
                  onClick={() => {
                    setAiResponse(null);
                    setSearch("");
                  }}
                  className="ml-auto p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                  data-tooltip={t("clearResponse")}
                >
                  <CloseIcon />
                </button>
              )}
            </div>
            <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
              {isAiLoading ? (
                <p className="animate-pulse text-gray-500 italic flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" />{t("aiAssistantThinking")}</p>
              ) : (
                <div
                  className="text-gray-800 dark:text-gray-200 note-content"
                  dangerouslySetInnerHTML={{
                    __html: renderSafeMarkdown(aiResponse),
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Composer — hidden in trash and archive views */}
      {activeTagFilter !== "TRASHED" && activeTagFilter !== "ARCHIVED" && (
      <div className="px-4 sm:px-6 md:px-8 lg:px-12">
        <div className="max-w-2xl mx-auto">
          {(
            <div
              ref={composerRef}
              className="glass-card rounded-xl shadow-lg p-4 mb-8 relative"
              style={{ backgroundColor: bgFor(composerColor, dark) }}
            >
              {/* Collapsed single input */}
              {composerCollapsed ? (
                <input
                  value={content}
                  onChange={(e) => {}}
                  onFocus={() => {
                    // expand and focus title
                    setComposerCollapsed(false);
                    setTimeout(() => titleRef.current?.focus(), 10);
                  }}
                  placeholder={t("writeNote")}
                  className="w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2"
                />
              ) : (
                <>
                  {/* Title */}
                  <input
                    ref={titleRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("noteTitle")}
                    className="w-full bg-transparent text-lg font-semibold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none mb-2 p-2"
                  />

                  {/* Body, Checklist, or Drawing */}
                  {composerType === "text" ? (
                    <textarea
                      ref={contentRef}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      onKeyDown={onComposerKeyDown}
                      placeholder={t("writeNote")}
                      className="w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none p-2"
                      rows={1}
                    />
                  ) : composerType === "checklist" ? (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          value={clInput}
                          onChange={(e) => setClInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addComposerItem();
                            }
                          }}
                          placeholder={t("listItemEllipsis")}
                          className="flex-1 bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2 border-b border-[var(--border-light)]"
                        />
                        <button
                          onClick={addComposerItem}
                          className="px-3 py-1.5 rounded-lg whitespace-nowrap font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                        >{t("add")}</button>
                      </div>
                      {clItems.length > 0 && (
                        <div className="space-y-2">
                          {clItems.map((it) => (
                            <ChecklistRow
                              key={it.id}
                              item={it}
                              readOnly
                              disableToggle
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <DrawingCanvas
                      data={composerDrawingData}
                      onChange={setComposerDrawingData}
                      width={650}
                      height={450}
                      readOnly={false}
                      darkMode={dark}
                      hideModeToggle={true}
                    />
                  )}

                  {/* Composer image thumbnails */}
                  {composerImages.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto">
                      {composerImages.map((im) => (
                        <div key={im.id} className="relative">
                          <img
                            src={im.src}
                            alt={im.name}
                            className="h-16 w-24 object-cover rounded-md border border-[var(--border-light)]"
                          />
                          <button
                            data-tooltip={t("removeImage")}
                            className="absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-5 h-5 text-xs"
                            onClick={() =>
                              setComposerImages((prev) =>
                                prev.filter((x) => x.id !== im.id),
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Responsive composer footer */}
                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-3 relative" style={{ zIndex: 200, position: "relative" }}>
                    {/* Tag chips + suggestions (composer) */}
                    <div className="w-full sm:flex-1 flex flex-wrap items-center gap-1 p-2 min-h-[36px] relative z-[100]">
                      {composerTagList.map((ctag, i) => (
                        <span
                          key={ctag + i}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                        >
                          {ctag}
                          <button
                            type="button"
                            onClick={() => setComposerTagList((prev) => prev.filter((_, idx) => idx !== i))}
                            className="hover:text-red-500 font-bold"
                          >×</button>
                        </span>
                      ))}
                      {(
                        <div className="relative flex-1 min-w-[8ch]">
                          <input
                            ref={composerTagInputRef}
                            value={composerTagInput}
                            onChange={(e) => setComposerTagInput(e.target.value)}
                            onFocus={() => setComposerTagFocused(true)}
                            onKeyDown={(e) => {
                              if ((e.key === "Enter" || e.key === ",") && composerTagInput.trim()) {
                                e.preventDefault();
                                const val = composerTagInput.trim().replace(/,+$/, "");
                                if (val && !composerTagList.map((x) => x.toLowerCase()).includes(val.toLowerCase())) {
                                  setComposerTagList((prev) => [...prev, val]);
                                }
                                setComposerTagInput("");
                              } else if (e.key === "Backspace" && !composerTagInput && composerTagList.length) {
                                setComposerTagList((prev) => prev.slice(0, -1));
                              }
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                const val = composerTagInput.trim().replace(/,+$/, "");
                                if (val && !composerTagList.map((x) => x.toLowerCase()).includes(val.toLowerCase())) {
                                  setComposerTagList((prev) => [...prev, val]);
                                }
                                setComposerTagInput("");
                                setComposerTagFocused(false);
                              }, 200);
                            }}
                            onPaste={(e) => {
                              e.preventDefault();
                              const pasted = e.clipboardData.getData("text");
                              const newTags = pasted.split(",").map((t) => t.trim()).filter(Boolean);
                              const unique = newTags.filter(
                                (t) => !composerTagList.map((x) => x.toLowerCase()).includes(t.toLowerCase())
                              );
                              if (unique.length) setComposerTagList((prev) => [...prev, ...unique]);
                            }}
                            type="text"
                            placeholder={composerTagList.length ? t("addTag") : t("addTagsCommaSeparated")}
                            className="bg-transparent text-sm placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none w-full"
                          />
                          {composerTagFocused && (() => {
                            const suggestions = tagsWithCounts
                              .filter(
                                ({ tag: t }) =>
                                  (!composerTagInput.trim() || t.toLowerCase().includes(composerTagInput.toLowerCase())) &&
                                  !composerTagList.map((x) => x.toLowerCase()).includes(t.toLowerCase())
                              );
                            const trimmed = composerTagInput.trim();
                            const isNew = trimmed && !tagsWithCounts.some(({ tag: t }) => t.toLowerCase() === trimmed.toLowerCase()) && !composerTagList.some((t) => t.toLowerCase() === trimmed.toLowerCase());
                            if (suggestions.length === 0 && !isNew) return null;
                            const rect = composerTagInputRef.current?.getBoundingClientRect();
                            if (!rect) return null;
                            const spaceBelow = window.innerHeight - rect.bottom;
                            const dropUp = spaceBelow < 220;
                            return createPortal(
                              <div
                                style={{
                                  position: "fixed",
                                  ...(dropUp
                                    ? { bottom: window.innerHeight - rect.top + 6, left: rect.left }
                                    : { top: rect.bottom + 6, left: rect.left }),
                                  width: Math.max(rect.width, 220),
                                  zIndex: 99999,
                                }}
                                className="rounded-2xl shadow-2xl bg-white/98 dark:bg-gray-900/98 backdrop-blur-xl border border-indigo-100/80 dark:border-indigo-800/50 max-h-52 overflow-y-auto overflow-x-hidden ring-1 ring-black/5 dark:ring-white/5"
                              >
                                {suggestions.length > 0 && (
                                  <div className="px-3 pt-2.5 pb-1.5">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{t("existingTags") || "Tags"}</span>
                                  </div>
                                )}
                                <div className="px-1.5 pb-1.5">
                                  {suggestions.map(({ tag: stag, count }) => (
                                    <button
                                      key={stag}
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        if (!composerTagList.map((x) => x.toLowerCase()).includes(stag.toLowerCase())) {
                                          setComposerTagList((prev) => [...prev, stag]);
                                        }
                                        setComposerTagInput("");
                                        composerTagInputRef.current?.blur();
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-indigo-50/80 dark:hover:bg-indigo-900/30 text-sm text-gray-700 dark:text-gray-200 flex items-center justify-between gap-2 transition-all duration-150 group cursor-pointer"
                                    >
                                      <span className="flex items-center gap-2 min-w-0">
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-indigo-100/80 dark:bg-indigo-800/40 text-indigo-500 dark:text-indigo-400 shrink-0 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-700/50 transition-colors duration-150">
                                          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                            <path d="M2 2.5A.5.5 0 012.5 2h5.086a.5.5 0 01.353.146l5.915 5.915a.5.5 0 010 .707l-4.586 4.586a.5.5 0 01-.707 0L3.146 7.939A.5.5 0 013 7.586V2.5zM5 5a1 1 0 100-2 1 1 0 000 2z"/>
                                          </svg>
                                        </span>
                                        <span className="truncate font-medium">{stag}</span>
                                      </span>
                                      <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{count}</span>
                                    </button>
                                  ))}
                                </div>
                                {isNew && (
                                  <>
                                    {suggestions.length > 0 && <div className="mx-3 border-t border-gray-100 dark:border-gray-800"/>}
                                    <div className="px-1.5 py-1.5">
                                      <button
                                        type="button"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          if (!composerTagList.map((x) => x.toLowerCase()).includes(trimmed.toLowerCase())) {
                                            setComposerTagList((prev) => [...prev, trimmed]);
                                          }
                                          setComposerTagInput("");
                                          composerTagInputRef.current?.blur();
                                        }}
                                        className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-emerald-50/80 dark:hover:bg-emerald-900/20 text-sm flex items-center gap-2 transition-all duration-150 group cursor-pointer"
                                      >
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-100/80 dark:bg-emerald-800/40 text-emerald-500 dark:text-emerald-400 shrink-0 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-700/50 transition-colors duration-150">
                                          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                            <line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>
                                          </svg>
                                        </span>
                                        <span className="font-medium text-emerald-600 dark:text-emerald-400">{t("createTag") || "Créer"} "<span className="font-semibold">{trimmed}</span>"</span>
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>,
                              document.body
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:flex-none relative">
                      {/* Formatting button (composer) - only for text mode */}
                      {composerType === "text" && (
                        <>
                          <button
                            ref={composerFmtBtnRef}
                            type="button"
                            onClick={() => setShowComposerFmt((v) => !v)}
                            className="px-2.5 py-1.5 rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50 text-violet-600 hover:from-violet-100 hover:to-purple-100 hover:border-violet-300 hover:scale-105 hover:shadow-md hover:shadow-violet-200/60 dark:hover:shadow-none active:scale-95 dark:from-violet-900/30 dark:to-purple-900/20 dark:border-violet-700/60 dark:text-violet-400 dark:hover:from-violet-800/40 dark:hover:to-purple-800/30 flex items-center gap-1.5 text-sm font-medium transition-all duration-200 flex-shrink-0"
                            data-tooltip={t("formatting")}
                          >
                            <FormatIcon />{t("formatting")}</button>
                          <Popover
                            anchorRef={composerFmtBtnRef}
                            open={showComposerFmt}
                            onClose={() => setShowComposerFmt(false)}
                          >
                            <FormatToolbar
                              dark={dark}
                              onAction={(t) => {
                                setShowComposerFmt(false);
                                formatComposer(t);
                              }}
                            />
                          </Popover>
                        </>
                      )}

                      {/* Type selection buttons */}
                      <div className="flex gap-1 bg-black/5 dark:bg-white/5 rounded-2xl p-1">
                        <button
                          type="button"
                          onClick={() => setComposerType("text")}
                          className={`p-1.5 rounded-xl border-2 text-sm transition-all duration-200 ${
                            composerType === "text"
                              ? "bg-gradient-to-br from-rose-400 to-pink-500 text-white border-transparent shadow-md shadow-rose-300/50 dark:shadow-none scale-105"
                              : "border-rose-200/80 bg-gradient-to-br from-rose-50 to-pink-50/60 text-rose-400 hover:from-rose-100 hover:to-pink-100 hover:border-rose-300 hover:scale-105 hover:shadow-sm hover:shadow-rose-200/50 dark:hover:shadow-none dark:from-rose-900/20 dark:to-pink-900/10 dark:border-rose-700/50 dark:text-rose-400 dark:hover:from-rose-800/30 dark:hover:to-pink-800/20"
                          }`}
                          data-tooltip={t("textNote")}
                        >
                          <TextNoteIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => setComposerType("checklist")}
                          className={`p-1.5 rounded-xl border-2 text-sm transition-all duration-200 ${
                            composerType === "checklist"
                              ? "bg-gradient-to-br from-emerald-400 to-green-500 text-white border-transparent shadow-md shadow-emerald-300/50 dark:shadow-none scale-105"
                              : "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-green-50/60 text-emerald-500 hover:from-emerald-100 hover:to-green-100 hover:border-emerald-300 hover:scale-105 hover:shadow-sm hover:shadow-emerald-200/50 dark:hover:shadow-none dark:from-emerald-900/20 dark:to-green-900/10 dark:border-emerald-700/50 dark:text-emerald-400 dark:hover:from-emerald-800/30 dark:hover:to-green-800/20"
                          }`}
                          data-tooltip={t("checklist")}
                        >
                          <ChecklistIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => setComposerType("draw")}
                          className={`p-1.5 rounded-xl border-2 text-sm transition-all duration-200 ${
                            composerType === "draw"
                              ? "bg-gradient-to-br from-orange-400 to-amber-500 text-white border-transparent shadow-md shadow-orange-300/50 dark:shadow-none scale-105"
                              : "border-orange-200/80 bg-gradient-to-br from-orange-50 to-amber-50/60 text-orange-400 hover:from-orange-100 hover:to-amber-100 hover:border-orange-300 hover:scale-105 hover:shadow-sm hover:shadow-orange-200/50 dark:hover:shadow-none dark:from-orange-900/20 dark:to-amber-900/10 dark:border-orange-700/50 dark:text-orange-400 dark:hover:from-orange-800/30 dark:hover:to-amber-800/20"
                          }`}
                          data-tooltip={t("drawing")}
                        >
                          <BrushIcon />
                        </button>
                      </div>

                      {/* Color dropdown (composer) */}
                      <button
                        ref={colorBtnRef}
                        type="button"
                        onClick={() => setShowColorPop((v) => !v)}
                        className="p-1.5 rounded-xl border-2 border-gray-200/80 bg-gradient-to-br from-white to-gray-50/60 hover:from-gray-50 hover:to-slate-100/60 hover:border-gray-300 hover:scale-105 hover:shadow-sm active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:from-gray-800/60 dark:to-gray-700/40 dark:border-gray-600/60 dark:hover:from-gray-700/70 dark:hover:to-gray-600/50 dark:hover:border-gray-500 transition-all duration-200 flex items-center justify-center"
                        data-tooltip={t("color")}
                      >
                        <PaletteColorIcon size={22} />
                      </button>
                      <ColorPickerPanel
                        anchorRef={colorBtnRef}
                        open={showColorPop}
                        onClose={() => setShowColorPop(false)}
                        colors={COLOR_ORDER.filter((name) => LIGHT_COLORS[name])}
                        selectedColor={composerColor}
                        darkMode={dark}
                        onSelect={(name) => setComposerColor(name)}
                      />

                      {/* Add Image (composer) */}
                      <input
                        ref={composerFileRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          const results = [];
                          for (const f of files) {
                            try {
                              const src = await fileToCompressedDataURL(f);
                              results.push({ id: uid(), src, name: f.name });
                            } catch (e) {}
                          }
                          if (results.length)
                            setComposerImages((prev) => [...prev, ...results]);
                          e.target.value = "";
                        }}
                      />
                      <button
                        onClick={() => composerFileRef.current?.click()}
                        className="p-1.5 text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 flex-shrink-0 transition-colors duration-200"
                        data-tooltip={t("addImages")}
                      >
                        <AddImageIcon />
                      </button>

                      {/* Add Note */}
                      <button
                        onClick={addNote}
                        className="px-4 py-2 rounded-xl font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-all duration-200 whitespace-nowrap flex-shrink-0 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                      >{t("addNote")}</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Notes lists */}
      <main className="px-4 sm:px-6 md:px-8 lg:px-12 pb-12">
        {pinned.length > 0 && (
          <section className="mb-10">
            {listView ? (
              <div className="max-w-2xl mx-auto">
                <h2 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
                  {t("pinned")}
                </h2>
              </div>
            ) : (
              <h2 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
                {t("pinned")}
              </h2>
            )}
            {listView ? (
              <div className="max-w-2xl mx-auto space-y-6">
                {pinned.map((n) => (
                  <div key={n.id}>
                  <NoteCard
                    n={n}
                    dark={dark}
                    openModal={openModal}
                    togglePin={togglePin}
                    multiMode={multiMode}
                    selected={selectedIds.includes(String(n.id))}
                    onToggleSelect={onToggleSelect}
                    disablePin={
                      "ontouchstart" in window ||
                      navigator.maxTouchPoints > 0 ||
                      activeTagFilter === "ARCHIVED" || activeTagFilter === "TRASHED"
                    }
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                    isOnline={isOnline}
                    onUpdateChecklistItem={onUpdateChecklistItem}
                    currentUser={currentUser}
                  />
                  </div>
                ))}
              </div>
            ) : (
              <Masonry
                breakpointCols={{default: 7, 1835: 6, 1587: 5, 1339: 4, 1089: 3, 767: 2}}
                className="masonry-grid"
                columnClassName="masonry-grid-column"
              >
                {pinned.map((n) => (
                  <div key={n.id}>
                  <NoteCard
                    n={n}
                    dark={dark}
                    openModal={openModal}
                    togglePin={togglePin}
                    multiMode={multiMode}
                    selected={selectedIds.includes(String(n.id))}
                    onToggleSelect={onToggleSelect}
                    disablePin={
                      "ontouchstart" in window ||
                      navigator.maxTouchPoints > 0 ||
                      activeTagFilter === "ARCHIVED" || activeTagFilter === "TRASHED"
                    }
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                    isOnline={isOnline}
                    onUpdateChecklistItem={onUpdateChecklistItem}
                    currentUser={currentUser}
                  />
                  </div>
                ))}
              </Masonry>
            )}
          </section>
        )}

        {others.length > 0 && (
          <section>
            {pinned.length > 0 &&
              (listView ? (
                <div className="max-w-2xl mx-auto">
                  <h2 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
                    {t("others")}
                  </h2>
                </div>
              ) : (
                <h2 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
                  {t("others")}
                </h2>
              ))}
            {listView ? (
              <div className="max-w-2xl mx-auto space-y-6">
                {others.map((n) => (
                  <div key={n.id}>
                  <NoteCard
                    n={n}
                    dark={dark}
                    openModal={openModal}
                    togglePin={togglePin}
                    multiMode={multiMode}
                    selected={selectedIds.includes(String(n.id))}
                    onToggleSelect={onToggleSelect}
                    disablePin={
                      "ontouchstart" in window ||
                      navigator.maxTouchPoints > 0 ||
                      activeTagFilter === "ARCHIVED" || activeTagFilter === "TRASHED"
                    }
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                    isOnline={isOnline}
                    onUpdateChecklistItem={onUpdateChecklistItem}
                    currentUser={currentUser}
                  />
                  </div>
                ))}
              </div>
            ) : (
              <Masonry
                breakpointCols={{default: 7, 1835: 6, 1587: 5, 1339: 4, 1089: 3, 767: 2}}
                className="masonry-grid"
                columnClassName="masonry-grid-column"
              >
                {others.map((n) => (
                  <div key={n.id}>
                  <NoteCard
                    n={n}
                    dark={dark}
                    openModal={openModal}
                    togglePin={togglePin}
                    multiMode={multiMode}
                    selected={selectedIds.includes(String(n.id))}
                    onToggleSelect={onToggleSelect}
                    disablePin={
                      "ontouchstart" in window ||
                      navigator.maxTouchPoints > 0 ||
                      activeTagFilter === "ARCHIVED" || activeTagFilter === "TRASHED"
                    }
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                    isOnline={isOnline}
                    onUpdateChecklistItem={onUpdateChecklistItem}
                    currentUser={currentUser}
                  />
                  </div>
                ))}
              </Masonry>
            )}
          </section>
        )}

        {notesLoading && pinned.length + others.length === 0 && (
          <p className="text-center text-gray-500 dark:text-gray-400 mt-10">
            Loading Notes…
          </p>
        )}
        {!notesLoading && filteredEmptyWithSearch && (
          <p className="text-center text-gray-500 dark:text-gray-400 mt-10">{t("noMatchingNotes")}</p>
        )}
        {!notesLoading && allEmpty && (
          <div className="text-center mt-10 px-4">
            <p className="text-gray-500 dark:text-gray-400">
              {activeTagFilter === "TRASHED" ? t("noTrashedNotes") : activeTagFilter === "ARCHIVED" ? t("noMatchingNotes") : t("noNotesYet")}
            </p>
            {syncStatus?.syncState === "offline" && (
              <p className="mt-2 text-sm text-amber-500 dark:text-amber-400">
                {t("offlineViewNotLoaded")}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/** ---------- App ---------- */
export default function App() {
  const [route, setRoute] = useState(window.location.hash || "#/login");

  // auth session { token, user }
  const [session, setSession] = useState(getAuth());
  const token = session?.token;
  const currentUser = session?.user || null;
  const sessionId = session?.sessionId || null;

  // Theme
  const [dark, setDark] = useState(false);

  // Screen width for responsive behavior
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

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
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // Tag filter & sidebar
  const [tagFilter, setTagFilter] = useState(null); // null = all, ALL_IMAGES = only notes with images
  const tagFilterRef = useRef(tagFilter);
  const [activeTagFilters, setActiveTagFilters] = useState([]); // multi-tag filter
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  // Modal state
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const activeIdRef = useRef(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  const [mType, setMType] = useState("text");
  const [mTitle, setMTitle] = useState("");
  const [mBody, setMBody] = useState("");
  const [mTagList, setMTagList] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [modalTagFocused, setModalTagFocused] = useState(false);
  const modalTagInputRef = useRef(null);
  const modalTagBtnRef = useRef(null);
  const suppressTagBlurRef = useRef(false);
  const [mColor, setMColor] = useState("default");
  const [viewMode, setViewMode] = useState(true);
  const [mImages, setMImages] = useState([]);
  const [savingModal, setSavingModal] = useState(false);
  const mBodyRef = useRef(null);
  const modalFileRef = useRef(null);
  const [modalMenuOpen, setModalMenuOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [genericConfirmOpen, setGenericConfirmOpen] = useState(false);
  const [genericConfirmConfig, setGenericConfirmConfig] = useState({});
  const [isModalClosing, setIsModalClosing] = useState(false);
  const modalClosingTimerRef = useRef(null);

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
  const [mItems, setMItems] = useState([]);
  const skipNextItemsAutosave = useRef(false);
  const prevItemsRef = useRef([]);
  const [mInput, setMInput] = useState("");

  // Drawing modal
  const [mDrawingData, setMDrawingData] = useState({
    paths: [],
    dimensions: null,
  });
  const skipNextDrawingAutosave = useRef(false);
  const prevDrawingRef = useRef({ paths: [], dimensions: null });
  const pendingDrawingSaveRef = useRef(null); // { noteId, drawingData } when debounce is pending
  const drawingDebounceTimerRef = useRef(null);

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

  // Collaboration modal
  const [collaborationModalOpen, setCollaborationModalOpen] = useState(false);
  const [collaboratorUsername, setCollaboratorUsername] = useState("");
  const [addModalCollaborators, setAddModalCollaborators] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });
  const collaboratorInputRef = useRef(null);

  // Modal formatting
  const [showModalFmt, setShowModalFmt] = useState(false);
  const modalFmtBtnRef = useRef(null);

  // Modal color popover
  const modalColorBtnRef = useRef(null);
  const [showModalColorPop, setShowModalColorPop] = useState(false);

  // Image Viewer state (fullscreen)
  const [imgViewOpen, setImgViewOpen] = useState(false);
  const [imgViewIndex, setImgViewIndex] = useState(0);
  const [mobileNavVisible, setMobileNavVisible] = useState(true);
  const mobileNavTimer = useRef(null);
  const resetMobileNav = () => {
    setMobileNavVisible(true);
    clearTimeout(mobileNavTimer.current);
    mobileNavTimer.current = setTimeout(() => setMobileNavVisible(false), 3000);
  };

  // Drag
  const dragId = useRef(null);
  const dragGroup = useRef(null);

  // Checklist item drag (for modal reordering)
  const checklistDragId = useRef(null);


  // Header menu refs + state
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef(null);
  const headerBtnRef = useRef(null);
  const importFileRef = useRef(null);
  const gkeepFileRef = useRef(null);
  const mdFileRef = useRef(null);

  // Modal kebab anchor
  const modalMenuBtnRef = useRef(null);

  // Composer collapse + refs
  const [composerCollapsed, setComposerCollapsed] = useState(true);
  const titleRef = useRef(null);
  const composerRef = useRef(null);

  // Color dropdown (composer)
  const colorBtnRef = useRef(null);
  const [showColorPop, setShowColorPop] = useState(false);

  // Scrim click tracking to avoid closing when drag starts inside modal
  const scrimClickStartRef = useRef(false);

  // For code copy buttons in view mode
  const noteViewRef = useRef(null);

  // Loading state for notes
  const [notesLoading, setNotesLoading] = useState(false);
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

  // Window resize listener for responsive sidebar behavior
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
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
            const leaseId = acquireLocalLease(nid);
            try {
              const existing = await idbGetNote(nid, currentUser?.id, sessionId);
              if (existing) await idbPutNote({ ...existing, trashed: true, client_updated_at: nowIso }, currentUser?.id, sessionId);
            } catch (e) { console.error(e); }
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
      triggerBlobDownload(`glass-keep-selected-${ts}.zip`, blob);
    } catch (e) {
      alert(e.message || t("zipDownloadFailed"));
    }
  };

  // NEW: modal scroll container ref + state to place Edited at bottom when not scrollable
  const modalScrollRef = useRef(null);
  const [modalScrollable, setModalScrollable] = useState(false);
  const savedModalScrollRatioRef = useRef(0);

  // SSE connection status
  const [sseConnected, setSseConnected] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Admin panel state
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
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [loginSlogan, setLoginSlogan] = useState("");
  const [loginProfiles, setLoginProfiles] = useState([]);

  // Settings panel state
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

  // Derived: Active note + edited text
  const activeNoteObj = useMemo(
    () => notes.find((x) => String(x.id) === String(activeId)),
    [notes, activeId],
  );
  const editedStamp = useMemo(() => {
    const ts = activeNoteObj?.updated_at || activeNoteObj?.timestamp;
    const baseStamp = ts ? formatEditedStamp(ts) : "";

    // Add collaborator info if available
    if (activeNoteObj?.lastEditedBy && activeNoteObj?.lastEditedAt) {
      const editorName = activeNoteObj.lastEditedBy;
      const editTime = formatEditedStamp(activeNoteObj.lastEditedAt);
      return `${editorName}, ${editTime}`;
    }

    return baseStamp;
  }, [activeNoteObj]);

  const modalHasChanges = useMemo(() => {
    if (!activeNoteObj) return false;
    if ((mTitle || "") !== (activeNoteObj.title || "")) return true;
    if ((mColor || "default") !== (activeNoteObj.color || "default"))
      return true;
    const tagsA = JSON.stringify(mTagList || []);
    const tagsB = JSON.stringify(activeNoteObj.tags || []);
    if (tagsA !== tagsB) return true;
    const imagesA = JSON.stringify(mImages || []);
    const imagesB = JSON.stringify(activeNoteObj.images || []);
    if (imagesA !== imagesB) return true;
    if ((mType || "text") !== (activeNoteObj.type || "text")) return true;
    if ((mType || "text") === "text") {
      if ((mBody || "") !== (activeNoteObj.content || "")) return true;
    } else {
      const itemsA = JSON.stringify(mItems || []);
      const itemsB = JSON.stringify(activeNoteObj.items || []);
      if (itemsA !== itemsB) return true;
    }
    return false;
  }, [activeNoteObj, mTitle, mColor, mTagList, mImages, mType, mBody, mItems]);

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
    const savedDark =
      localStorage.getItem("glass-keep-dark-mode") === "true" ||
      (!("glass-keep-dark-mode" in localStorage) &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    setDark(savedDark);
    document.documentElement.classList.toggle("dark", savedDark);
  }, []);
  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("glass-keep-dark-mode", String(next));
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
                    return updated;
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

  // Cache invalidation functions
  const invalidateNotesCache = () => {
    try {
      localStorage.removeItem(NOTES_CACHE_KEY);
      localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    } catch (error) {
      console.error("Error invalidating notes cache:", error);
    }
  };

  const invalidateArchivedNotesCache = () => {
    try {
      localStorage.removeItem(ARCHIVED_NOTES_CACHE_KEY);
      localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    } catch (error) {
      console.error("Error invalidating archived notes cache:", error);
    }
  };

  const invalidateTrashedNotesCache = () => {
    try {
      localStorage.removeItem(TRASHED_NOTES_CACHE_KEY);
    } catch (error) {
      console.error("Error invalidating trashed notes cache:", error);
    }
  };

  const uniqueById = (arr) => {
    const m = new Map();
    for (const n of Array.isArray(arr) ? arr : []) {
      if (!n) continue;
      m.set(String(n.id), n);
    }
    return Array.from(m.values());
  };
  const persistNotesCache = (notes) => {
    try {
      localStorage.setItem(
        NOTES_CACHE_KEY,
        JSON.stringify(Array.isArray(notes) ? notes : []),
      );
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (e) {
      console.error("Error caching notes:", e);
    }
  };
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
      try {
        localStorage.setItem(ARCHIVED_NOTES_CACHE_KEY, JSON.stringify(final));
        localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
      } catch (e) {}
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
      try {
        localStorage.setItem(TRASHED_NOTES_CACHE_KEY, JSON.stringify(final));
      } catch (e) {}
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
    if (token) {
      loadNotes().catch(() => {});
    }
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
            } else if (msg && msg.type === "note_access_revoked" && msg.noteId) {
              // Collaboration access revoked — note owner removed us.
              // Remove from all local state immediately (any view).
              const nid = String(msg.noteId);
              setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
              idbDeleteNote(nid, currentUser?.id, sessionId).catch(() => {});
              idbPurgeQueueForNote(nid, currentUser?.id).catch(() => {});
              // Force-close if this note is currently open in modal
              if (String(activeIdRef.current) === nid) {
                forceCloseModalForRemoteDelete(nid);
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
        let ok = await engine.healthCheck();
        // On mobile after long background, the first fetch often fails because
        // Chrome reuses stale TCP sockets from before suspension. Retry with
        // increasing delays to give the browser time to recycle the socket pool.
        for (let i = 0; i < 3 && !ok; i++) {
          await new Promise((r) => setTimeout(r, 1500 + i * 1500));
          ok = await engine.healthCheck();
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
        let ok = await engine.healthCheck();
        // On mobile, stale TCP sockets survive the offline→online transition.
        // Retry with increasing delays so the browser can recycle them.
        for (let i = 0; i < 3 && !ok; i++) {
          await new Promise((r) => setTimeout(r, 1500 + i * 1500));
          ok = await engine.healthCheck();
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
    const drawingContent = JSON.stringify(drawingData);

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
      const prevJson = JSON.stringify(prevDrawingRef.current || []);
      const serverJson = JSON.stringify(normalizedData);
      if (serverJson !== prevJson) {
        setMDrawingData(normalizedData);
        prevDrawingRef.current = normalizedData;
      }
    } catch (e) {
      // Invalid JSON, ignore
    }
  }, [notes, open, activeId]);

  // No infinite scroll

  // Lock body scroll on modal & image viewer
  useEffect(() => {
    if (!open && !imgViewOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, imgViewOpen]);

  // Close image viewer if modal closes
  useEffect(() => {
    if (!open) setImgViewOpen(false);
  }, [open]);

  // Keyboard nav for image viewer
  useEffect(() => {
    if (!imgViewOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setImgViewOpen(false);
      if (e.key.toLowerCase() === "d") {
        const im = mImages[imgViewIndex];
        if (im) {
          const fname = normalizeImageFilename(
            im.name,
            im.src,
            imgViewIndex + 1,
          );
          downloadDataUrl(fname, im.src);
        }
      }
      if (e.key === "ArrowRight" && mImages.length > 1) {
        setImgViewIndex((i) => (i + 1) % mImages.length);
      }
      if (e.key === "ArrowLeft" && mImages.length > 1) {
        setImgViewIndex((i) => (i - 1 + mImages.length) % mImages.length);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [imgViewOpen, mImages, imgViewIndex]);

  // Close note modal with Escape key
  useEffect(() => {
    if (activeId == null) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !imgViewOpen) closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeId, imgViewOpen]);

  // Close note modal with Android back button (popstate)
  useEffect(() => {
    const onPopState = () => {
      if (modalHistoryRef.current) {
        modalHistoryRef.current = false;
        setOpen(false);
        setActiveId(null);
        setViewMode(true);
        setModalMenuOpen(false);
        setConfirmDeleteOpen(false);
        setShowModalFmt(false);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Auto-resize composer textarea
  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.style.height = "auto";
    contentRef.current.style.height = contentRef.current.scrollHeight + "px";
  }, [content, composerType]);

  // Auto-resize modal textarea with debouncing
  const resizeModalTextarea = useMemo(() => {
    let timeoutId = null;
    return () => {
      const el = mBodyRef.current;
      if (!el) return;

      // Clear previous timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Debounce the resize to prevent excessive updates
      timeoutId = setTimeout(() => {
        const modalScrollEl = modalScrollRef.current;

        // Save scroll position before collapsing textarea height
        const savedScrollTop = modalScrollEl ? modalScrollEl.scrollTop : 0;

        const MIN = 160;
        el.style.height = MIN + "px";
        el.style.height = Math.max(el.scrollHeight, MIN) + "px";

        requestAnimationFrame(() => {
          if (!modalScrollEl) return;
          // Mode-switch ratio takes priority, otherwise restore pre-resize position
          const ratio = savedModalScrollRatioRef.current;
          if (ratio > 0) {
            const maxScroll = modalScrollEl.scrollHeight - modalScrollEl.clientHeight;
            modalScrollEl.scrollTop = ratio * maxScroll;
            savedModalScrollRatioRef.current = 0;
          } else {
            modalScrollEl.scrollTop = savedScrollTop;
          }
        });
      }, 10); // Small delay to batch rapid changes
    };
  }, []);
  useEffect(() => {
    if (!open || mType !== "text") return;
    if (!viewMode) resizeModalTextarea();
  }, [open, viewMode, mBody, mType]);

  // Restore scroll ratio when switching edit→view (no textarea resize in this direction)
  useEffect(() => {
    if (!viewMode) return; // view→edit is handled inside resizeModalTextarea
    const el = modalScrollRef.current;
    const ratio = savedModalScrollRatioRef.current;
    if (!el || ratio === 0) return;
    requestAnimationFrame(() => {
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll > 0) el.scrollTop = ratio * maxScroll;
      savedModalScrollRatioRef.current = 0;
    });
  }, [viewMode]);

  // Ensure modal formatting menu hides when switching to view mode or non-text
  useEffect(() => {
    if (viewMode || mType !== "text") setShowModalFmt(false);
  }, [viewMode, mType]);

  // Detect if modal body is scrollable to decide Edited stamp placement
  useEffect(() => {
    if (!open) return;
    const el = modalScrollRef.current;
    if (!el) return;

    const check = () => {
      // +1 fudge factor to avoid off-by-one on some browsers
      setModalScrollable(el.scrollHeight > el.clientHeight + 1);
    };
    check();

    // React to container size changes and window resizes
    let ro;
    if ("ResizeObserver" in window) {
      ro = new ResizeObserver(check);
      ro.observe(el);
    }
    window.addEventListener("resize", check);

    // Also recheck shortly after (images rendering, fonts, etc.)
    const t1 = setTimeout(check, 50);
    const t2 = setTimeout(check, 200);

    return () => {
      window.removeEventListener("resize", check);
      clearTimeout(t1);
      clearTimeout(t2);
      ro?.disconnect();
    };
  }, [open, mBody, mTitle, mItems.length, mImages.length, viewMode, mType]);

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
  const signIn = async (email, password) => {
    const res = await api("/login", {
      method: "POST",
      body: { email, password },
    });
    const sessionWithId = { ...res, sessionId: crypto.randomUUID() };
    setSession(sessionWithId);
    setAuth(sessionWithId);
    navigate("#/notes");
    return { ok: true };
  };
  const signInById = async (userId, password) => {
    const res = await api("/login", {
      method: "POST",
      body: { user_id: userId, password },
    });
    const sessionWithId = { ...res, sessionId: crypto.randomUUID() };
    setSession(sessionWithId);
    setAuth(sessionWithId);
    navigate("#/notes");
    return { ok: true };
  };
  const signInWithSecret = async (key) => {
    const res = await api("/login/secret", { method: "POST", body: { key } });
    const sessionWithId = { ...res, sessionId: crypto.randomUUID() };
    setSession(sessionWithId);
    setAuth(sessionWithId);
    navigate("#/notes");
    return { ok: true };
  };
  const register = async (name, email, password) => {
    const res = await api("/register", {
      method: "POST",
      body: { name, email, password },
    });
    const sessionWithId = { ...res, sessionId: crypto.randomUUID() };
    setSession(sessionWithId);
    setAuth(sessionWithId);
    navigate("#/notes");
    return { ok: true };
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

  /** -------- Composer helpers -------- */
  const addComposerItem = () => {
    const t = clInput.trim();
    if (!t) return;
    setClItems((prev) => [...prev, { id: uid(), text: t, done: false }]);
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

    await enqueueWithLease(nid, { type: "archive", noteId: nid, payload: { archived: !!archived, client_updated_at: nowIso } }, leaseId);
  };

  /** -------- Admin Panel Functions -------- */
  const loadAdminSettings = async () => {
    try {
      console.log("Loading admin settings...");
      const settings = await api("/admin/settings", { token });
      console.log("Admin settings loaded:", settings);
      setAdminSettings(settings);
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
      if (typeof settings.loginSlogan === 'string') {
        setLoginSlogan(settings.loginSlogan);
      }
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

  /** -------- Export / Import All -------- */
  const triggerJSONDownload = (filename, jsonText) => {
    const blob = new Blob([jsonText], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportAll = async () => {
    try {
      const payload = await api("/notes/export", { token });
      const json = JSON.stringify(payload, null, 2);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const fname =
        sanitizeFilename(
          `glass-keep-notes-${currentUser?.email || "user"}-${ts}`,
        ) + ".json";
      triggerJSONDownload(fname, json);
    } catch (e) {
      alert(e.message || t("exportFailed"));
    }
  };

  const importAll = async (fileList) => {
    try {
      if (!fileList || !fileList.length) return;
      const file = fileList[0];
      const text = await file.text();
      const parsed = JSON.parse(text);
      const notesArr = Array.isArray(parsed?.notes)
        ? parsed.notes
        : Array.isArray(parsed)
          ? parsed
          : [];
      if (!notesArr.length) {
        alert(t("noNotesFoundInFile"));
        return;
      }
      await api("/notes/import", {
        method: "POST",
        token,
        body: { notes: notesArr },
      });
      await loadNotes();
      alert(t("importedNotesSuccessfully").replace("{count}", String(notesArr.length)));
    } catch (e) {
      alert(e.message || t("importFailed"));
    }
  };

  /** -------- Import Google Keep single-note JSON files (multiple) -------- */
  const importGKeep = async (fileList) => {
    try {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      const texts = await Promise.all(
        files.map((f) => f.text().catch(() => null)),
      );
      const notesArr = [];
      for (const t of texts) {
        if (!t) continue;
        try {
          const obj = JSON.parse(t);
          if (!obj || typeof obj !== "object") continue;
          const title = String(obj.title || "");
          const hasChecklist =
            Array.isArray(obj.listContent) && obj.listContent.length > 0;
          const items = hasChecklist
            ? obj.listContent.map((it) => ({
                id: uid(),
                text: String(it?.text || ""),
                done: !!it?.isChecked,
              }))
            : [];
          const content = hasChecklist ? "" : String(obj.textContent || "");
          const usec = Number(
            obj.userEditedTimestampUsec || obj.createdTimestampUsec || 0,
          );
          const ms =
            Number.isFinite(usec) && usec > 0
              ? Math.floor(usec / 1000)
              : Date.now();
          const timestamp = new Date(ms).toISOString();
          // Extract labels to tags
          const tags = Array.isArray(obj.labels)
            ? obj.labels
                .map((l) => (typeof l?.name === "string" ? l.name.trim() : ""))
                .filter(Boolean)
            : [];
          notesArr.push({
            id: uid(),
            type: hasChecklist ? "checklist" : "text",
            title,
            content,
            items,
            tags,
            images: [],
            color: "default",
            pinned: !!obj.isPinned,
            position: ms,
            timestamp,
          });
        } catch (e) {}
      }
      if (!notesArr.length) {
        alert(t("noValidGoogleKeepNotesFound"));
        return;
      }
      await api("/notes/import", {
        method: "POST",
        token,
        body: { notes: notesArr },
      });
      await loadNotes();
      alert(t("importedGoogleKeepNotes").replace("{count}", String(notesArr.length)));
    } catch (e) {
      alert(e.message || t("googleKeepImportFailed"));
    }
  };

  /** -------- Import Markdown files (multiple) -------- */
  const importMd = async (fileList) => {
    try {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      const notesArr = [];

      for (const file of files) {
        try {
          const text = await file.text();
          const lines = text.split("\n");

          // Extract title from first line if it starts with #
          let title = "";
          let contentStartIndex = 0;

          if (lines[0] && lines[0].trim().startsWith("#")) {
            // Remove # symbols and trim
            title = lines[0].replace(/^#+\s*/, "").trim();
            contentStartIndex = 1;
          } else {
            // Use filename as title (without .md extension)
            title = file.name.replace(/\.md$/i, "");
          }

          // Join remaining lines as content
          const content = lines.slice(contentStartIndex).join("\n").trim();

          if (title || content) {
            notesArr.push({
              id: uid(),
              type: "text",
              title,
              content,
              items: [],
              tags: [],
              images: [],
              color: "default",
              pinned: false,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (e) {
          console.error(`Failed to process file ${file.name}:`, e);
        }
      }

      if (!notesArr.length) {
        alert(t("noValidMarkdownFilesFound"));
        return;
      }

      await api("/notes/import", {
        method: "POST",
        token,
        body: { notes: notesArr },
      });
      await loadNotes();
      alert(t("importedMarkdownFilesSuccessfully").replace("{count}", String(notesArr.length)));
    } catch (e) {
      alert(e.message || t("markdownImportFailed"));
    }
  };

  /** -------- Collaboration actions -------- */
  const [collaborationDialogOpen, setCollaborationDialogOpen] = useState(false);
  const [collaborationDialogNoteId, setCollaborationDialogNoteId] =
    useState(null);
  const [noteCollaborators, setNoteCollaborators] = useState([]);
  const [isNoteOwner, setIsNoteOwner] = useState(false);

  const loadNoteCollaborators = useCallback(
    async (noteId) => {
      try {
        const collaborators = await api(`/notes/${noteId}/collaborators`, {
          token,
        });
        setNoteCollaborators(collaborators || []);

        // Check if current user is the owner
        // Try to get note from current notes list
        const note = notes.find((n) => String(n.id) === String(noteId));
        // If note has user_id, use it; otherwise check if user is in collaborators list
        if (note?.user_id) {
          setIsNoteOwner(note.user_id === currentUser?.id);
        } else {
          // If note doesn't have user_id, check if current user is NOT in collaborators
          // (if they're not a collaborator and can see the note, they're likely the owner)
          const isCollaborator = collaborators.some(
            (c) => c.id === currentUser?.id,
          );
          setIsNoteOwner(!isCollaborator);
        }
      } catch (e) {
        console.error("Failed to load collaborators:", e);
        setNoteCollaborators([]);
        setIsNoteOwner(false);
      }
    },
    [token, notes, currentUser],
  );

  const showCollaborationDialog = useCallback(
    (noteId) => {
      setCollaborationDialogNoteId(noteId);
      setCollaborationDialogOpen(true);
      loadNoteCollaborators(noteId);
    },
    [loadNoteCollaborators],
  );

  const removeCollaborator = async (collaboratorId, noteId = null) => {
    try {
      const targetNoteId = noteId || collaborationDialogNoteId || activeId;
      if (!targetNoteId) return;
      await api(`/notes/${targetNoteId}/collaborate/${collaboratorId}`, {
        method: "DELETE",
        token,
      });
      showToast(t("collaboratorRemovedSuccessfully"), "success");
      if (collaborationDialogNoteId) {
        loadNoteCollaborators(collaborationDialogNoteId);
      }
      if (activeId) {
        await loadCollaboratorsForAddModal(activeId);
      }
      invalidateNotesCache();
    } catch (e) {
      showToast(e.message || t("failedRemoveCollaborator"), "error");
    }
  };

  const loadCollaboratorsForAddModal = useCallback(
    async (noteId) => {
      try {
        const collaborators = await api(`/notes/${noteId}/collaborators`, {
          token,
        });
        setAddModalCollaborators(collaborators || []);
      } catch (e) {
        console.error("Failed to load collaborators:", e);
        setAddModalCollaborators([]);
      }
    },
    [token],
  );

  // Search users for collaboration dropdown
  const searchUsers = useCallback(
    async (query) => {
      setLoadingUsers(true);
      try {
        const searchQuery =
          query && query.trim().length > 0 ? query.trim() : "";
        const users = await api(
          `/users/search?q=${encodeURIComponent(searchQuery)}`,
          { token },
        );
        // Filter out current user and existing collaborators
        const existingCollaboratorIds = new Set(
          addModalCollaborators.map((c) => c.id),
        );
        const filtered = users.filter(
          (u) => u.id !== currentUser?.id && !existingCollaboratorIds.has(u.id),
        );
        setFilteredUsers(filtered);
        setShowUserDropdown(filtered.length > 0);
      } catch (e) {
        console.error("Failed to search users:", e);
        setFilteredUsers([]);
        setShowUserDropdown(false);
      } finally {
        setLoadingUsers(false);
      }
    },
    [token, addModalCollaborators, currentUser],
  );

  // Update dropdown position based on input field
  const updateDropdownPosition = useCallback(() => {
    if (collaboratorInputRef.current) {
      const rect = collaboratorInputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4, // fixed positioning is relative to viewport
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        collaboratorInputRef.current &&
        !collaboratorInputRef.current.contains(event.target) &&
        !event.target.closest("[data-user-dropdown]")
      ) {
        setShowUserDropdown(false);
      }
    };

    if (showUserDropdown) {
      updateDropdownPosition();
      // Use setTimeout to ensure the portal is rendered
      setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 0);
      window.addEventListener("scroll", updateDropdownPosition, true);
      window.addEventListener("resize", updateDropdownPosition);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        window.removeEventListener("scroll", updateDropdownPosition, true);
        window.removeEventListener("resize", updateDropdownPosition);
      };
    }
  }, [showUserDropdown, updateDropdownPosition]);

  // Load collaborators when Add Collaborator modal opens
  useEffect(() => {
    if (collaborationModalOpen && activeId) {
      loadCollaboratorsForAddModal(activeId);
    }
  }, [collaborationModalOpen, activeId, loadCollaboratorsForAddModal]);

  const addCollaborator = async (username) => {
    try {
      if (!activeId) return;

      // Add collaborator to the note
      const result = await api(`/notes/${activeId}/collaborate`, {
        method: "POST",
        token,
        body: { username },
      });

      // Update local note with collaborator info
      setNotes((prev) =>
        prev.map((n) =>
          String(n.id) === String(activeId)
            ? {
                ...n,
                collaborators: [...(n.collaborators || []), username],
                lastEditedBy: currentUser?.email || currentUser?.name,
                lastEditedAt: new Date().toISOString(),
              }
            : n,
        ),
      );

      showToast(t("addedCollaboratorSuccessfully").replace("{username}", String(username)), "success");
      setCollaboratorUsername("");
      setShowUserDropdown(false);
      setFilteredUsers([]);
      // Reload collaborators for both dialogs
      await loadCollaboratorsForAddModal(activeId);
      if (collaborationDialogNoteId === activeId) {
        loadNoteCollaborators(activeId);
      }
    } catch (e) {
      showToast(e.message || t("failedAddCollaborator"), "error");
    }
  };

  /** -------- Secret Key actions -------- */
  const downloadSecretKey = async () => {
    try {
      const data = await api("/secret-key", { method: "POST", token });
      if (!data?.key) throw new Error(t("secretKeyNotReturned"));
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const fname = `glass-keep-secret-key-${ts}.txt`;
      const content =
        `Glass Keep — Secret Recovery Key\n\n` +
        `Keep this key safe. Anyone with this key can sign in as you.\n\n` +
        `Secret Key:\n${data.key}\n\n` +
        `Instructions:\n` +
        `1) Go to the login page.\n` +
        `2) Click ${t("forgotUsernamePassword")}.\n` +
        `3) Choose "${t("signInWithSecretKey")}" and paste this key.\n`;
      downloadText(fname, content);
      alert(t("secretKeyDownloadedSafe"));
    } catch (e) {
      alert(e.message || t("couldNotGenerateSecretKey"));
    }
  };

  /** -------- Modal tag helpers -------- */
  const addTags = (raw) => {
    const parts = String(raw)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setMTagList((prev) => {
      const set = new Set(prev.map((x) => x.toLowerCase()));
      const merged = [...prev];
      for (const p of parts)
        if (!set.has(p.toLowerCase())) {
          merged.push(p);
          set.add(p.toLowerCase());
        }
      return merged;
    });
  };
  const handleTagKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      if (tagInput.trim()) {
        addTags(tagInput);
        setTagInput("");
      }
    } else if (e.key === "Backspace" && !tagInput) {
      setMTagList((prev) => prev.slice(0, -1));
    }
  };
  const handleTagBlur = () => {
    if (tagInput.trim()) {
      addTags(tagInput);
      setTagInput("");
    }
  };
  const handleTagPaste = (e) => {
    const text = e.clipboardData?.getData("text");
    if (text && text.includes(",")) {
      e.preventDefault();
      addTags(text);
    }
  };

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
  // Track if we pushed a history entry for the modal (Android back button support)
  const modalHistoryRef = useRef(false);

  const openModal = (id) => {
    const n = notes.find((x) => String(x.id) === String(id));
    if (!n) return;
    setSidebarOpen(false);
    setActiveId(String(id));
    setMType(n.type || "text");
    setMTitle(n.title || "");
    if (n.type === "draw") {
      try {
        const drawingData = JSON.parse(n.content || "[]");
        // Handle backward compatibility: if it's an array, convert to new format
        const normalizedData = Array.isArray(drawingData)
          ? { paths: drawingData, dimensions: null }
          : drawingData;
        setMDrawingData(normalizedData);
        prevDrawingRef.current = normalizedData;
      } catch (e) {
        setMDrawingData({ paths: [], dimensions: null });
        prevDrawingRef.current = { paths: [], dimensions: null };
      }
      setMBody("");
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
    const baselineState = {
      title: n.title || "",
      content: n.type === "draw" ? "" : n.content || "",
      tags: Array.isArray(n.tags) ? n.tags : [],
      images: Array.isArray(n.images) ? n.images : [],
      color: n.color || "default",
    };
    initialModalStateRef.current = baselineState;
    committedBaselineRef.current = { ...baselineState };

    setViewMode(true);
    setModalMenuOpen(false);
    setOpen(true);
    window.history.pushState({ noteModal: true }, "");
    modalHistoryRef.current = true;
  };

  // Check if note is collaborative (has collaborators or is owned by someone else)
  const isCollaborativeNote = useCallback(
    (noteId) => {
      if (!noteId) return false;
      const note = notes.find((n) => String(n.id) === String(noteId));
      if (!note) return false;
      const hasCollaborators =
        note.collaborators !== undefined && note.collaborators !== null;
      const isOwnedByOther =
        note.user_id && currentUser && note.user_id !== currentUser.id;
      return hasCollaborators || isOwnedByOther;
    },
    [notes, currentUser],
  );

  // Auto-save timeout ref - must be defined before closeModal


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
  const autoSaveTextNote = useCallback(async (noteId, fields, existingLeaseId) => {
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
        payload: { ...fields, type: "text", client_updated_at: nowIso },
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

  // Local-first auto-save for text metadata (color, tags, images) — immediate, no debounce
  useEffect(() => {
    if (!open || !activeId || mType !== "text") return;
    const initial = initialModalStateRef.current;
    if (!initial) return;

    const colorChanged = initial.color !== mColor;
    const tagsChanged = JSON.stringify(initial.tags) !== JSON.stringify(mTagList);
    const imagesChanged = JSON.stringify(initial.images) !== JSON.stringify(mImages);

    if (!colorChanged && !tagsChanged && !imagesChanged) return;

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

    autoSaveTextNote(activeId, metaPatch, leaseId).then((ok) => {
      if (ok && committedBaselineRef.current) {
        committedBaselineRef.current = { ...committedBaselineRef.current, ...committedFields };
      }
    });
  }, [mColor, mTagList, mImages, open, activeId, mType, autoSaveTextNote]);

  // Auto-save text content (title + body): debounced local-first persist + patch sync
  useEffect(() => {
    if (!open || !activeId || mType !== "text" || viewMode) return;
    const initial = initialModalStateRef.current;
    if (!initial) return;

    const titleChanged = initial.title !== mTitle.trim();
    const contentChanged = initial.content !== mBody;
    if (!titleChanged && !contentChanged) return;

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

      autoSaveTextNote(activeId, contentPatch, leaseId).then((ok) => {
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
  }, [mBody, mTitle, open, activeId, mType, viewMode, autoSaveTextNote]);

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
      // Update local modal state to match server (user hasn't edited, so safe to update)
      setMTitle(serverState.title);
      setMBody(serverState.content);
      setMTagList(serverState.tags);
      setMImages(serverState.images);
      setMColor(serverState.color);
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

    // Clean up history state without going through closeModal
    if (modalHistoryRef.current) {
      modalHistoryRef.current = false;
      window.history.back();
    }

    // Reset all modal state immediately — no animation, no save
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

    // Flush any pending drawing debounce before closing.
    // flushPendingDrawingSave restores pendingDrawingSaveRef on failure,
    // so a second close attempt can retry.
    if (activeId && mType === "draw") {
      flushPendingDrawingSave();
    }

    // Retry checklist if the last autosave failed (prevItemsRef wasn't advanced).
    if (activeId && mType === "checklist" && mItems) {
      const prevJson = JSON.stringify(prevItemsRef.current || []);
      const currentJson = JSON.stringify(mItems);
      if (prevJson !== currentJson) {
        syncChecklistItems(mItems);
      }
    }

    // Flush any pending text changes immediately before closing (local-first).
    // Use committedBaselineRef (not initialModalStateRef) so that a failed
    // autosave still produces a diff here and gets retried.
    if (activeId && mType === "text" && !viewMode) {
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
      if (modalHistoryRef.current) {
        modalHistoryRef.current = false;
        window.history.back();
      }
      setOpen(false);
      setActiveId(null);
      setViewMode(true);
      setModalMenuOpen(false);
      setConfirmDeleteOpen(false);
      setShowModalFmt(false);
      setIsModalClosing(false);
    }, 180);
  };

  const saveModal = async () => {
    if (activeId == null) return;
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
          : { ...base, type: "draw", content: JSON.stringify(mDrawingData), items: [], client_updated_at: nowIso };

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
  const deleteModal = async () => {
    if (activeId == null) return;
    // Check if user owns the note
    const note = notes.find((n) => String(n.id) === String(activeId));
    if (note && note.user_id !== currentUser?.id) {
      showToast(t("cannotDeleteNotOwner"), "error");
      return;
    }

    const nid = String(activeId);
    const leaseId = acquireLocalLease(nid);

    if (tagFilter === "TRASHED") {
      // Local-first: permanent delete — tombstone prevents resurrection by loaders/SSE
      addDeleteTombstone(nid);
      try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
      invalidateTrashedNotesCache();
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("notePermanentlyDeleted"), "success");
      await enqueueWithLease(nid, { type: "permanentDelete", noteId: nid, payload: { client_updated_at: new Date().toISOString() } }, leaseId);
    } else {
      // Local-first: move to trash
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
    const nid = String(id);
    const leaseId = acquireLocalLease(nid);
    const nowIso = new Date().toISOString();
    // Local-first: apply pin immediately
    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) await idbPutNote({ ...existing, pinned: !!toPinned, client_updated_at: nowIso }, currentUser?.id, sessionId);
    } catch (e) { console.error(e); }
    invalidateNotesCache();

    setNotes((prev) =>
      prev.map((n) =>
        String(n.id) === nid ? { ...n, pinned: !!toPinned } : n,
      ),
    );
    await enqueueWithLease(nid, { type: "patch", noteId: nid, payload: { pinned: !!toPinned, client_updated_at: nowIso } }, leaseId);
  };

  /** -------- Reset note order -------- */
  const resetNoteOrder = async (overridePositions = true) => {
    // Block if any note in the view is not owned — server rejects mixed payloads.
    if (currentUser && notes.some((n) => n.user_id && n.user_id !== currentUser.id)) {
      showToast(t("reorderBlockedCollabNotes"), "error");
      return;
    }

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

    // Block reorder if any note in the view is not owned by the current user.
    // Server rejects partial-ownership payloads, so don't even attempt it.
    if (currentUser && notes.some((n) => n.user_id && n.user_id !== currentUser.id)) {
      showToast(t("reorderBlockedCollabNotes"), "error");
      dragGroup.current = null;
      return;
    }

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

  const onChecklistDragStart = (itemId, ev) => {
    checklistDragId.current = String(itemId);
    ev.currentTarget.classList.add("dragging");
  };
  const onChecklistDragOver = (overItemId, ev) => {
    ev.preventDefault();
    if (!checklistDragId.current) return;
    if (String(checklistDragId.current) === String(overItemId)) return;
    ev.currentTarget.classList.add("drag-over");
  };
  const onChecklistDragLeave = (ev) => {
    ev.currentTarget.classList.remove("drag-over");
  };
  const onChecklistDrop = async (overItemId, ev) => {
    ev.preventDefault();
    ev.currentTarget.classList.remove("drag-over");
    const dragged = checklistDragId.current;
    checklistDragId.current = null;

    if (!dragged || String(dragged) === String(overItemId)) return;

    // Only allow reordering unchecked items
    const draggedItem = mItems.find((it) => String(it.id) === String(dragged));
    const overItem = mItems.find((it) => String(it.id) === String(overItemId));

    if (!draggedItem || !overItem || draggedItem.done || overItem.done) return;

    // Reorder the unchecked items
    const uncheckedItems = mItems.filter((it) => !it.done);
    const checkedItems = mItems.filter((it) => it.done);

    const draggedIndex = uncheckedItems.findIndex(
      (it) => String(it.id) === String(dragged),
    );
    const overIndex = uncheckedItems.findIndex(
      (it) => String(it.id) === String(overItemId),
    );

    if (draggedIndex === -1 || overIndex === -1) return;

    // Remove dragged item and insert at new position
    const [removed] = uncheckedItems.splice(draggedIndex, 1);
    uncheckedItems.splice(overIndex, 0, removed);

    // Combine back with checked items
    const newItems = [...uncheckedItems, ...checkedItems];

    setMItems(newItems);
    syncChecklistItems(newItems);
  };
  const onChecklistDragEnd = (ev) => {
    ev.currentTarget.classList.remove("dragging");
    // Clean up any remaining drag-over states
    document.querySelectorAll(".drag-over").forEach((el) => {
      el.classList.remove("drag-over");
    });
  };

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

  /** -------- Modal link handler: open links in new tab (no auto-enter edit) -------- */
  const onModalBodyClick = (e) => {
    if (!(viewMode && mType === "text")) return;

    const a = e.target.closest("a");
    if (a) {
      const href = a.getAttribute("href") || "";
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        e.preventDefault();
        e.stopPropagation();
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
    }
    // NO automatic edit-mode toggle
  };

  /** -------- Image viewer helpers -------- */
  const openImageViewer = (index) => {
    setImgViewIndex(index);
    setImgViewOpen(true);
    resetMobileNav();
  };
  const closeImageViewer = () => setImgViewOpen(false);
  const nextImage = () => setImgViewIndex((i) => (i + 1) % mImages.length);
  const prevImage = () =>
    setImgViewIndex((i) => (i - 1 + mImages.length) % mImages.length);

  /** -------- Formatting actions (composer & modal) -------- */
  const runFormat = (getter, setter, ref, type) => {
    const el = ref.current;
    if (!el) return;
    const value = getter();
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;

    // Insert defaults when editor is empty for quote / ul / ol
    if (
      (type === "ul" || type === "ol" || type === "quote") &&
      value.trim().length === 0
    ) {
      const snippet = type === "ul" ? "- " : type === "ol" ? "1. " : "> ";
      setter(snippet);
      requestAnimationFrame(() => {
        el.focus({ preventScroll: true });
        try {
          el.setSelectionRange(snippet.length, snippet.length);
        } catch (e) {}
      });
      return;
    }

    // Handle list formatting when no text is selected
    if ((type === "ul" || type === "ol") && start === end) {
      const snippet = type === "ul" ? "- " : "1. ";
      const newValue = value.slice(0, start) + snippet + value.slice(end);
      setter(newValue);
      requestAnimationFrame(() => {
        el.focus({ preventScroll: true });
        try {
          el.setSelectionRange(start + snippet.length, start + snippet.length);
        } catch (e) {}
      });
      return;
    }

    let result;
    switch (type) {
      case "h1":
        result = prefixLines(value, start, end, "# ");
        break;
      case "h2":
        result = prefixLines(value, start, end, "## ");
        break;
      case "h3":
        result = prefixLines(value, start, end, "### ");
        break;
      case "bold":
        result = wrapSelection(value, start, end, "**", "**");
        break;
      case "italic":
        result = wrapSelection(value, start, end, "_", "_");
        break;
      case "strike":
        result = wrapSelection(value, start, end, "~~", "~~");
        break;
      case "code":
        result = wrapSelection(value, start, end, "`", "`");
        break;
      case "codeblock":
        result = fencedBlock(value, start, end);
        break;
      case "quote":
        result = prefixLines(value, start, end, "> ");
        break;
      case "ul":
        result = toggleList(value, start, end, "ul");
        break;
      case "ol":
        result = toggleList(value, start, end, "ol");
        break;
      case "link":
        result = wrapSelection(value, start, end, "[", "](https://)");
        break;
      default:
        return;
    }
    setter(result.text);
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      try {
        el.setSelectionRange(result.range[0], result.range[1]);
      } catch (e) {}
    });
  };
  const formatComposer = (type) =>
    runFormat(() => content, setContent, contentRef, type);
  const formatModal = (type) =>
    runFormat(() => mBody, setMBody, mBodyRef, type);

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

  /** Add copy buttons to code (view mode, text notes) */
  useEffect(() => {
    if (!(open && viewMode && mType === "text")) return;
    const root = noteViewRef.current;
    if (!root) return;

    const attach = () => {
      // Wrap code blocks so the copy button can stay fixed even on horizontal scroll
      root.querySelectorAll("pre").forEach((pre) => {
        // Ensure wrapper
        let wrapper = pre.closest(".code-block-wrapper");
        if (!wrapper) {
          wrapper = document.createElement("div");
          wrapper.className = "code-block-wrapper";
          pre.parentNode?.insertBefore(wrapper, pre);
          wrapper.appendChild(pre);
        }
        if (wrapper.querySelector(".code-copy-btn")) return;
        const btn = document.createElement("button");
        btn.className = "code-copy-btn";
        btn.textContent = t("copy");
        btn.setAttribute("data-copy-btn", "1");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const codeEl = pre.querySelector("code");
          const text = codeEl ? codeEl.textContent : pre.textContent;
          navigator.clipboard?.writeText(text || "");
          btn.textContent = t("copied");
          setTimeout(() => (btn.textContent = t("copy")), 1200);
        });
        wrapper.appendChild(btn);

        // Keep copy button visible when code block top scrolls past the modal header
        const scrollEl = wrapper.closest(".modal-scroll-themed");
        if (scrollEl) {
          const stickyHeader = scrollEl.querySelector(".sticky");
          const adjustPos = () => {
            const headerBottom = stickyHeader
              ? stickyHeader.getBoundingClientRect().bottom
              : scrollEl.getBoundingClientRect().top;
            const wrapperTop = wrapper.getBoundingClientRect().top;
            const offset = headerBottom - wrapperTop;
            if (offset > 8) {
              const maxTop = wrapper.offsetHeight - btn.offsetHeight - 8;
              btn.style.top = Math.min(offset + 8, maxTop) + "px";
            } else {
              btn.style.top = "8px";
            }
          };
          scrollEl.addEventListener("scroll", adjustPos, { passive: true });
        }
      });

      // Inline code
      root.querySelectorAll("code").forEach((code) => {
        if (code.closest("pre")) return; // skip fenced
        if (
          code.nextSibling &&
          code.nextSibling.nodeType === 1 &&
          code.nextSibling.classList?.contains("inline-code-copy-btn")
        )
          return;
        const btn = document.createElement("button");
        btn.className = "inline-code-copy-btn";
        btn.textContent = t("copy");
        btn.setAttribute("data-copy-btn", "1");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          navigator.clipboard?.writeText(code.textContent || "");
          btn.textContent = t("copied");
          setTimeout(() => (btn.textContent = t("copy")), 1200);
        });
        code.insertAdjacentElement("afterend", btn);
      });
    };

    attach();
    // Ensure buttons after layout/async renders
    requestAnimationFrame(attach);
    const t1 = setTimeout(attach, 50);
    const t2 = setTimeout(attach, 200);

    // Observe DOM changes while in view mode
    const mo = new MutationObserver(() => attach());
    try {
      mo.observe(root, { childList: true, subtree: true });
    } catch (e) {}

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      mo.disconnect();
    };
  }, [open, viewMode, mType, mBody, activeId]);

  /** -------- Modal JSX -------- */
  const modal = (open || isModalClosing) && (
    <>
      <div
        className={`modal-scrim note-scrim-anim${isModalClosing ? ' closing' : ''} fixed inset-0 bg-black/40 z-40 flex items-center justify-center overscroll-contain`}
        onMouseDown={(e) => {
          // Only consider closing if the press STARTS on the scrim
          scrimClickStartRef.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          // Close only if press started AND ended on scrim (prevents drag-outside-close)
          if (scrimClickStartRef.current && e.target === e.currentTarget) {
            closeModal();
          }
          scrimClickStartRef.current = false;
        }}
      >
        <div
          className={`note-modal-anim${isModalClosing ? ' closing' : ''} glass-card rounded-none shadow-2xl w-full h-full max-w-none sm:w-11/12 sm:max-w-3xl lg:max-w-4xl sm:h-[95vh] sm:rounded-xl flex flex-col relative overflow-hidden`}
          style={{ backgroundColor: modalBgFor(mColor, dark, windowWidth < 640) }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Scroll container */}
          <div
            ref={modalScrollRef}
            className="relative flex-1 min-h-0 overflow-y-auto overflow-x-auto mobile-hide-scrollbar modal-scroll-themed"
            style={(() => {
              const sc = scrollColorsFor(mColor, dark);
              const noteColorBtn = (!dark && (!mColor || mColor === "default"))
                ? "#a78bfa"
                : solid(bgFor(mColor, dark));
              const noteColorOpaque = typeof noteColorBtn === "string" ? noteColorBtn.replace(/,\s*[\d.]+\)$/, ', 1)') : noteColorBtn;
              return { scrollbarColor: `${sc.thumb} ${sc.track}`, '--sb-thumb': sc.thumb, '--sb-track': sc.track, '--note-color': noteColorBtn, '--note-color-opaque': noteColorOpaque };
            })()}
          >
            {/* Sticky header (kept single line on desktop, wraps on mobile) */}
            <div
              className="sticky top-0 z-20 pt-4 modal-header-blur rounded-t-none sm:rounded-t-xl"
              style={{ backgroundColor: modalBgFor(mColor, dark, windowWidth < 640) }}
            >
              <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 pb-3">
                <input
                  className="flex-[1_0_50%] min-w-0 sm:min-w-[240px] shrink-0 bg-transparent font-bold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none pr-2"
                  style={windowWidth < 700 ? {
                    fontSize: mTitle.length > 40 ? "0.85rem"
                      : mTitle.length > 28 ? "1rem"
                      : mTitle.length > 18 ? "1.15rem"
                      : "1.25rem"
                  } : undefined}
                  value={mTitle}
                  onChange={(e) => setMTitle(e.target.value)}
                  placeholder={t("noteTitle")}
                />
                <div className="flex items-center gap-2 flex-none ml-auto">
                  {/* Icon buttons group – pill container */}
                  <div className="modal-icon-group">
                  {/* View/Edit toggle only for TEXT notes */}
                  {mType === "text" && (
                    <button
                      className="modal-icon-btn modal-icon-btn--mode btn-gradient hover:scale-[1.03] active:scale-[0.98]"
                      onClick={() => {
                        const el = modalScrollRef.current;
                        const maxScroll = el ? el.scrollHeight - el.clientHeight : 0;
                        savedModalScrollRatioRef.current = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
                        setViewMode((v) => !v);
                        setShowModalFmt(false);
                      }}
                      data-tooltip={
                        viewMode ? t("switchToEditMode") : t("switchToViewMode")
                      }
                      aria-label={viewMode ? t("editMode") : t("viewMode")}
                    >
                      {viewMode ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Z" fill="currentColor" />
                          <path d="m14.06 4.94 3.75 3.75 1.41-1.41a1.5 1.5 0 0 0 0-2.12l-1.63-1.63a1.5 1.5 0 0 0-2.12 0l-1.41 1.41Z" fill="currentColor" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7Z" stroke="currentColor" strokeWidth="1.8" />
                          <circle cx="12" cy="12" r="3.2" fill="currentColor" />
                        </svg>
                      )}
                    </button>
                  )}
                  {/* Collaboration button - always visible */}
                  <button
                    className="modal-icon-btn focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
                    data-tooltip={t("collaborate")}
                    onClick={async () => {
                      setCollaborationModalOpen(true);
                      if (activeId) {
                        await loadCollaboratorsForAddModal(activeId);
                      }
                    }}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                    </svg>
                    <svg
                      className="w-3 h-3 absolute -top-1 -right-1"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                    </svg>
                  </button>

                  {/* Formatting button + popover: mobile only (desktop uses inline toolbar below) */}
                  {mType === "text" && !viewMode && windowWidth < 768 && (
                    <>
                      <button
                        ref={modalFmtBtnRef}
                        className="modal-icon-btn focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
                        data-tooltip={t("formatting")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowModalFmt((v) => !v);
                        }}
                      >
                        <FormatIcon />
                      </button>
                      <Popover
                        anchorRef={modalFmtBtnRef}
                        open={showModalFmt}
                        onClose={() => setShowModalFmt(false)}
                      >
                        <FormatToolbar
                          dark={dark}
                          onAction={(t) => {
                            setShowModalFmt(false);
                            formatModal(t);
                          }}
                        />
                      </Popover>
                    </>
                  )}

                  {/* 3-dots menu */}
                  <>
                    <button
                      ref={modalMenuBtnRef}
                        className="modal-icon-btn focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
                        data-tooltip={t("moreOptions")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalMenuOpen((v) => !v);
                        }}
                      >
                        <Kebab />
                      </button>
                      <Popover
                        anchorRef={modalMenuBtnRef}
                        open={modalMenuOpen}
                        onClose={() => setModalMenuOpen(false)}
                      >
                        <div
                          className={`min-w-[180px] border border-[var(--border-light)] rounded-lg shadow-lg overflow-hidden ${dark ? "text-gray-100" : "bg-white text-gray-800"}`}
                          style={{
                            backgroundColor: dark ? "#222222" : undefined,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                            onClick={() => {
                              const n = notes.find(
                                (nn) => String(nn.id) === String(activeId),
                              );
                              if (n) handleDownloadNote(n);
                              setModalMenuOpen(false);
                            }}
                          >
                            <DownloadIcon />{t("downloadMd")}</button>
                          {tagFilter === "TRASHED" ? (
                            <>
                              <button
                                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                                onClick={() => {
                                  restoreFromTrash(activeId);
                                  setModalMenuOpen(false);
                                }}
                              >
                                <ArchiveIcon />{t("restoreFromTrash")}
                              </button>
                              <button
                                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-red-600 ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                                onClick={() => {
                                  setConfirmDeleteOpen(true);
                                  setModalMenuOpen(false);
                                }}
                              >
                                <Trash />{t("permanentlyDelete")}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                                onClick={() => {
                                  const note = notes.find(
                                    (nn) => String(nn.id) === String(activeId),
                                  );
                                  if (note) {
                                    handleArchiveNote(activeId, !note.archived);
                                    setModalMenuOpen(false);
                                  }
                                }}
                              >
                                <ArchiveIcon />
                                {activeNoteObj?.archived ? t("unarchive") : t("archive")}
                              </button>
                              <button
                                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-red-600 ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                                onClick={() => {
                                  setConfirmDeleteOpen(true);
                                  setModalMenuOpen(false);
                                }}
                              >
                                <Trash />{t("moveToTrash")}
                              </button>
                            </>
                          )}
                        </div>
                    </Popover>
                  </>

                  {/* Pin button - hidden in archived view */}
                  {tagFilter !== "ARCHIVED" && tagFilter !== "TRASHED" && (
                    <button
                      className={`modal-icon-btn focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)] ${
                        notes.find((n) => String(n.id) === String(activeId))?.pinned
                          ? "modal-icon-btn--active"
                          : ""
                      }`}
                      data-tooltip={t("pinUnpin")}
                      onClick={() =>
                        activeId != null &&
                        togglePin(
                          activeId,
                          !notes.find((n) => String(n.id) === String(activeId))
                            ?.pinned,
                        )
                      }
                    >
                      {notes.find((n) => String(n.id) === String(activeId))
                        ?.pinned ? (
                        <PinFilled />
                      ) : (
                        <PinOutline />
                      )}
                    </button>
                  )}

                  <button
                    className="modal-icon-btn modal-icon-btn--close focus:outline-none"
                    data-tooltip={t("close")}
                    onClick={closeModal}
                  >
                    <CloseIcon />
                  </button>
                  </div>{/* end icon pill group */}
                </div>

              </div>

              {/* Desktop inline formatting toolbar (always visible in edit mode) */}
              {mType === "text" && !viewMode && windowWidth >= 768 && (
                <div
                  className={`px-4 sm:px-6 pt-2 pb-3 border-t flex flex-wrap items-center gap-1 ${
                    dark ? "border-white/10" : "border-black/8"
                  }`}
                >
                  {(() => {
                    const base = `fmt-btn ${dark ? "hover:bg-white/10" : "hover:bg-black/5"}`;
                    return (
                      <>
                        <button className={base} onClick={() => formatModal("h1")}>H1</button>
                        <button className={base} onClick={() => formatModal("h2")}>H2</button>
                        <button className={base} onClick={() => formatModal("h3")}>H3</button>
                        <span className="mx-1 opacity-40">|</span>
                        <button className={base} onClick={() => formatModal("bold")}><strong>B</strong></button>
                        <button className={base} onClick={() => formatModal("italic")}><em>I</em></button>
                        <button className={base} onClick={() => formatModal("strike")}><span className="line-through">S</span></button>
                        <button className={base} onClick={() => formatModal("code")}>`code`</button>
                        <button className={base} onClick={() => formatModal("codeblock")}>&lt;/&gt;</button>
                        <span className="mx-1 opacity-40">|</span>
                        <button className={base} onClick={() => formatModal("quote")}>&gt;</button>
                        <button className={base} onClick={() => formatModal("ul")}>{t("bulletListLabel")}</button>
                        <button className={base} onClick={() => formatModal("ol")}>{t("orderedListLabel")}</button>
                        <button className={base} onClick={() => formatModal("link")}><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Images - Google Keep style grid */}
            {mImages.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center px-2 pb-2">
                {mImages.map((im, idx) => (
                  <div
                    key={im.id}
                    className="group relative overflow-hidden rounded-md border border-[var(--border-light)]"
                    style={{
                      width: mImages.length === 1 ? "100%" : "calc(50% - 4px)",
                    }}
                  >
                    <img
                      src={im.src}
                      alt={im.name}
                      className="w-full h-auto object-contain object-center cursor-pointer"
                      style={{ maxHeight: "360px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        openImageViewer(idx);
                      }}
                    />
                    <button
                      data-tooltip={t("removeImage")}
                      className="absolute -top-1 right-0 text-black dark:text-white text-2xl leading-none opacity-0 group-hover:opacity-100 hover:opacity-60 transition-opacity cursor-pointer"
                      onClick={() =>
                        setMImages((prev) =>
                          prev.filter((x) => x.id !== im.id),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Content area */}
            <div
              className={mType === "draw" ? "p-2 pb-6" : "p-6 pb-12"}
              onClick={onModalBodyClick}
            >

              {/* Text, Checklist, or Drawing */}
              {mType === "text" ? (
                viewMode ? (
                  <div
                    ref={noteViewRef}
                    className="note-content note-content--dense whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{
                      __html: renderSafeMarkdown(mBody),
                    }}
                  />
                ) : (
                  <div className="relative min-h-[160px]">
                    <textarea
                      ref={mBodyRef}
                      className="w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none overflow-hidden min-h-[160px]"
                      style={{ scrollBehavior: "unset" }}
                      value={mBody}
                      onChange={(e) => {
                        setMBody(e.target.value);
                        resizeModalTextarea();
                      }}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.altKey &&
                          !e.ctrlKey &&
                          !e.metaKey
                        ) {
                          const el = mBodyRef.current;
                          const value = mBody;
                          const start = el.selectionStart ?? value.length;
                          const end = el.selectionEnd ?? value.length;

                          // Check if cursor is on the last line before Enter
                          const lastNewlineIndex = value.lastIndexOf("\n");
                          const isOnLastLine = start > lastNewlineIndex;

                          const res = handleSmartEnter(value, start, end);
                          if (res) {
                            e.preventDefault();
                            setMBody(res.text);
                            requestAnimationFrame(() => {
                              try {
                                el.setSelectionRange(
                                  res.range[0],
                                  res.range[1],
                                );
                              } catch (e) {}
                              resizeModalTextarea();

                              // If we were on the last line, scroll down a bit to ensure cursor visibility
                              if (isOnLastLine) {
                                const modalScrollEl = modalScrollRef.current;
                                if (modalScrollEl) {
                                  setTimeout(() => {
                                    modalScrollEl.scrollTop += 30; // Scroll down by 30px
                                  }, 50);
                                }
                              }
                            });
                          } else if (isOnLastLine) {
                            // If not handled by smart enter but on last line, allow normal Enter but scroll down
                            setTimeout(() => {
                              const modalScrollEl = modalScrollRef.current;
                              if (modalScrollEl) {
                                modalScrollEl.scrollTop += 30; // Scroll down by 30px
                              }
                            }, 10);
                          }
                        }
                      }}
                      placeholder={t("writeYourNoteEllipsis")}
                    />
                  </div>
                )
              ) : mType === "checklist" ? (
                <div className="space-y-4 md:space-y-2">
                  {/* Add new item row */}
                  <div className="flex gap-2">
                      <input
                        value={mInput}
                        onChange={(e) => setMInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const t = mInput.trim();
                            if (t) {
                              const newItems = [
                                ...mItems,
                                { id: uid(), text: t, done: false },
                              ];
                              setMItems(newItems);
                              setMInput("");
                              syncChecklistItems(newItems);
                            }
                          }
                        }}
                        placeholder={t("listItemEllipsis")}
                        className="flex-1 bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2 border-b border-[var(--border-light)]"
                      />
                      <button
                        onClick={() => {
                          const t = mInput.trim();
                          if (t) {
                            const newItems = [
                              ...mItems,
                              { id: uid(), text: t, done: false },
                            ];
                            setMItems(newItems);
                            setMInput("");
                            syncChecklistItems(newItems);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                      >{t("add")}</button>
                  </div>

                  {mItems.length > 0 ? (
                    <div className="space-y-4 md:space-y-2">
                      {/* Unchecked items */}
                      {mItems
                        .filter((it) => !it.done)
                        .map((it) => (
                          <div
                            key={it.id}
                            data-checklist-item={it.id}
                            onDragOver={(e) => onChecklistDragOver(it.id, e)}
                            onDragLeave={onChecklistDragLeave}
                            onDrop={(e) => onChecklistDrop(it.id, e)}
                            className="group flex items-center gap-2"
                          >
                            {/* Drag handle */}
                            <div
                              draggable
                              onDragStart={(e) =>
                                onChecklistDragStart(it.id, e)
                              }
                              onDragEnd={onChecklistDragEnd}
                              onTouchStart={(e) => {
                                // Handle touch drag start - only when touching the handle
                                const target = e.currentTarget.closest(
                                  "[data-checklist-item]",
                                );
                                if (target) {
                                  checklistDragId.current = String(it.id);
                                  target.classList.add("dragging");
                                }
                              }}
                              onTouchMove={(e) => {
                                if (!checklistDragId.current) return;

                                const touch = e.touches[0];
                                const elementAtPoint =
                                  document.elementFromPoint(
                                    touch.clientX,
                                    touch.clientY,
                                  );
                                if (elementAtPoint) {
                                  // Find the checklist item container
                                  const checklistItem = elementAtPoint.closest(
                                    "[data-checklist-item]",
                                  );
                                  if (
                                    checklistItem &&
                                    checklistItem !==
                                      e.currentTarget.closest(
                                        "[data-checklist-item]",
                                      )
                                  ) {
                                    const dragOverEvent = new Event(
                                      "dragover",
                                      { bubbles: true },
                                    );
                                    checklistItem.dispatchEvent(dragOverEvent);
                                  }
                                }
                              }}
                              onTouchEnd={(e) => {
                                if (!checklistDragId.current) return;
                                const touch = e.changedTouches[0];
                                const elementAtPoint =
                                  document.elementFromPoint(
                                    touch.clientX,
                                    touch.clientY,
                                  );
                                const target = e.currentTarget.closest(
                                  "[data-checklist-item]",
                                );

                                if (elementAtPoint) {
                                  const checklistItem = elementAtPoint.closest(
                                    "[data-checklist-item]",
                                  );
                                  if (
                                    checklistItem &&
                                    checklistItem !== target
                                  ) {
                                    const dropEvent = new Event("drop", {
                                      bubbles: true,
                                    });
                                    checklistItem.dispatchEvent(dropEvent);
                                  }
                                }

                                if (target) {
                                  target.classList.remove("dragging");
                                }
                                checklistDragId.current = null;

                                // Clean up any remaining drag-over states
                                document
                                  .querySelectorAll(".drag-over")
                                  .forEach((el) => {
                                    el.classList.remove("drag-over");
                                  });
                              }}
                              className="flex items-center justify-center px-1 cursor-grab active:cursor-grabbing opacity-40 group-hover:opacity-70 transition-opacity"
                              style={{ touchAction: "none" }}
                            >
                              <div className="grid grid-cols-2 gap-0.5">
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                              </div>
                            </div>

                            <div className="flex-1">
                              <ChecklistRow
                                item={it}
                                readOnly={false}
                                disableToggle={false}
                                showRemove={true}
                                size="lg"
                                onToggle={(checked, e) => {
                                  e?.stopPropagation();
                                  const newItems = mItems.map((p) =>
                                    p.id === it.id ? { ...p, done: checked } : p,
                                  );
                                  setMItems(newItems);
                                  syncChecklistItems(newItems);
                                }}
                                onChange={(txt) => {
                                  const newItems = mItems.map((p) =>
                                    p.id === it.id ? { ...p, text: txt } : p,
                                  );
                                  setMItems(newItems);
                                  syncChecklistItems(newItems);
                                }}
                                onRemove={() => {
                                  const newItems = mItems.filter(
                                    (p) => p.id !== it.id,
                                  );
                                  setMItems(newItems);
                                  syncChecklistItems(newItems);
                                }}
                              />
                            </div>
                          </div>
                        ))}

                      {/* Done section */}
                      {mItems.filter((it) => it.done).length > 0 && (
                        <>
                          <div className="border-t border-[var(--border-light)] pt-4 mt-4">
                            <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">{t("done")}</h4>
                            {mItems
                              .filter((it) => it.done)
                              .map((it) => (
                                <ChecklistRow
                                  key={it.id}
                                  item={it}
                                  readOnly={false}
                                  disableToggle={false}
                                  showRemove={true}
                                  size="lg"
                                  onToggle={(checked, e) => {
                                    e?.stopPropagation();
                                    const newItems = mItems.map((p) =>
                                      p.id === it.id ? { ...p, done: checked } : p,
                                    );
                                    setMItems(newItems);
                                    syncChecklistItems(newItems);
                                  }}
                                  onChange={(txt) => {
                                    const newItems = mItems.map((p) =>
                                      p.id === it.id ? { ...p, text: txt } : p,
                                    );
                                    setMItems(newItems);
                                    syncChecklistItems(newItems);
                                  }}
                                  onRemove={() => {
                                    const newItems = mItems.filter(
                                      (p) => p.id !== it.id,
                                    );
                                    setMItems(newItems);
                                    syncChecklistItems(newItems);
                                  }}
                                />
                              ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">{t("noItemsYet")}</p>
                  )}
                </div>
              ) : (
                <DrawingCanvas
                  data={mDrawingData}
                  onChange={setMDrawingData}
                  width={750}
                  height={850}
                  readOnly={false}
                  darkMode={dark}
                  initialMode="view"
                />
              )}

              {/* Inline Edited stamp: only when scrollable (appears at very end) */}
              {editedStamp && modalScrollable && (
                <div className="mt-6 text-xs text-gray-600 dark:text-gray-300 text-right flex items-center justify-end gap-1.5">
                  <span>{t("editedPrefix")} {editedStamp}</span>
                  {activeId && (
                    <span
                      className="opacity-30 hover:opacity-100 cursor-default transition-opacity"
                      data-tooltip={`Note ID : ${activeId}`}
                    >ⓘ</span>
                  )}
                </div>
              )}
            </div>

            {/* Absolute Edited stamp: only when NOT scrollable (sits just above footer) */}
            {editedStamp && !modalScrollable && (
              <div className="absolute bottom-3 right-4 text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                <span className="pointer-events-none">{t("editedPrefix")} {editedStamp}</span>
                {activeId && (
                  <span
                    className="opacity-30 hover:opacity-100 cursor-default transition-opacity"
                    data-tooltip={`Note ID : ${activeId}`}
                  >ⓘ</span>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--border-light)] p-4 flex flex-wrap items-center gap-3">
            {/* Tags chips editor */}
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              {mTagList.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100/80 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-700/40 backdrop-blur-sm transition-all duration-150 hover:bg-indigo-200/90 dark:hover:bg-indigo-800/60 hover:scale-105 hover:shadow-sm"
                >
                  <svg className="w-3 h-3 opacity-70 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M2 2.5A.5.5 0 012.5 2h5.086a.5.5 0 01.353.146l5.915 5.915a.5.5 0 010 .707l-4.586 4.586a.5.5 0 01-.707 0L3.146 7.939A.5.5 0 013 7.586V2.5zM5 5a1 1 0 100-2 1 1 0 000 2z"/>
                  </svg>
                  {tag}
                  <button
                    className="w-3.5 h-3.5 rounded-full text-indigo-400 dark:text-indigo-300 hover:bg-red-400 dark:hover:bg-red-500 hover:text-white flex items-center justify-center transition-all duration-150 cursor-pointer focus:outline-none leading-none"
                    data-tooltip={t("removeTag")}
                    onClick={() =>
                      setMTagList((prev) => prev.filter((t) => t !== tag))
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
              {/* Tag add button */}
              <div className="relative">
                  <button
                    ref={modalTagBtnRef}
                    type="button"
                    onClick={() => {
                      setModalTagFocused((v) => {
                        if (!v) setTimeout(() => { if (windowWidth >= 640) modalTagInputRef.current?.focus(); }, 0);
                        return !v;
                      });
                      setTagInput("");
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-indigo-300 dark:border-indigo-600 text-indigo-500 dark:text-indigo-400 hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all duration-200 cursor-pointer"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>
                    </svg>
                    {t("addTag")}
                  </button>
                  {modalTagFocused && (() => {
                    const rect = modalTagBtnRef.current?.getBoundingClientRect();
                    if (!rect) return null;
                    const spaceBelow = window.innerHeight - rect.bottom;
                    const dropUp = spaceBelow < 280;
                    const dropWidth = 240;
                    const dropLeft = Math.min(rect.left, window.innerWidth - dropWidth - 8);
                    const suggestions = tagsWithCounts
                      .filter(
                        ({ tag: t }) =>
                          (!tagInput.trim() || t.toLowerCase().includes(tagInput.toLowerCase())) &&
                          !mTagList.map((x) => x.toLowerCase()).includes(t.toLowerCase())
                      );
                    const trimmed = tagInput.trim();
                    const isNew = trimmed && !tagsWithCounts.some(({ tag: t }) => t.toLowerCase() === trimmed.toLowerCase()) && !mTagList.some((t) => t.toLowerCase() === trimmed.toLowerCase());
                    return createPortal(
                      <div
                        style={{
                          position: "fixed",
                          ...(dropUp
                            ? { bottom: window.innerHeight - rect.top + 6, left: dropLeft }
                            : { top: rect.bottom + 6, left: dropLeft }),
                          width: dropWidth,
                          zIndex: 99999,
                        }}
                        className="rounded-2xl shadow-2xl bg-white/98 dark:bg-gray-900/98 backdrop-blur-xl border border-indigo-100/80 dark:border-indigo-800/50 overflow-hidden ring-1 ring-black/5 dark:ring-white/5"
                      >
                        {/* Search input inside dropdown */}
                        <div className="px-2 pt-2 pb-1.5">
                          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-700/60 focus-within:border-indigo-300 dark:focus-within:border-indigo-600 transition-colors duration-150">
                            <svg className="w-3 h-3 text-gray-400 dark:text-gray-500 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="6.5" cy="6.5" r="4"/><line x1="10" y1="10" x2="14" y2="14"/>
                            </svg>
                            <input
                              ref={modalTagInputRef}
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") { setTagInput(""); setModalTagFocused(false); return; }
                                handleTagKeyDown(e);
                              }}
                              onBlur={() => {
                                setTimeout(() => {
                                  if (!suppressTagBlurRef.current) handleTagBlur();
                                  suppressTagBlurRef.current = false;
                                  setModalTagFocused(false);
                                }, 200);
                              }}
                              onPaste={handleTagPaste}
                              placeholder={t("searchOrCreateTag") || "Rechercher ou créer…"}
                              className="flex-1 bg-transparent text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none min-w-0"
                            />
                          </div>
                        </div>
                        {/* Tag list */}
                        {suggestions.length > 0 && (
                          <>
                            <div className="px-3 pt-1 pb-1">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{t("existingTags") || "Tags"}</span>
                            </div>
                            <div className="px-1.5 pb-1.5 max-h-44 overflow-y-auto">
                              {suggestions.map(({ tag, count }) => (
                                <button
                                  key={tag}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    suppressTagBlurRef.current = true;
                                    addTags(tag);
                                    setTagInput("");
                                    setModalTagFocused(false);
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-indigo-50/80 dark:hover:bg-indigo-900/30 text-sm text-gray-700 dark:text-gray-200 flex items-center justify-between gap-2 transition-all duration-150 group cursor-pointer"
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-indigo-100/80 dark:bg-indigo-800/40 text-indigo-500 dark:text-indigo-400 shrink-0 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-700/50 transition-colors duration-150">
                                      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                        <path d="M2 2.5A.5.5 0 012.5 2h5.086a.5.5 0 01.353.146l5.915 5.915a.5.5 0 010 .707l-4.586 4.586a.5.5 0 01-.707 0L3.146 7.939A.5.5 0 013 7.586V2.5zM5 5a1 1 0 100-2 1 1 0 000 2z"/>
                                      </svg>
                                    </span>
                                    <span className="truncate font-medium">{tag}</span>
                                  </span>
                                  <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{count}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                        {suggestions.length === 0 && !isNew && (
                          <div className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 text-center">{t("noTagsFound") || "Aucun tag trouvé"}</div>
                        )}
                        {isNew && (
                          <>
                            {suggestions.length > 0 && <div className="mx-3 border-t border-gray-100 dark:border-gray-800"/>}
                            <div className="px-1.5 py-1.5">
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  suppressTagBlurRef.current = true;
                                  addTags(trimmed);
                                  setTagInput("");
                                  setModalTagFocused(false);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-emerald-50/80 dark:hover:bg-emerald-900/20 text-sm flex items-center gap-2 transition-all duration-150 group cursor-pointer"
                              >
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-100/80 dark:bg-emerald-800/40 text-emerald-500 dark:text-emerald-400 shrink-0 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-700/50 transition-colors duration-150">
                                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>
                                  </svg>
                                </span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">{t("createTag") || "Créer"} "<span className="font-semibold">{trimmed}</span>"</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>,
                      document.body
                    );
                  })()}
              </div>
            </div>

            {/* Right controls */}
            <div className="ml-auto flex items-center gap-3 flex-shrink-0">
              {/* Color dropdown (modal) */}
              <button
                ref={modalColorBtnRef}
                type="button"
                onClick={() => setShowModalColorPop((v) => !v)}
                className="w-6 h-6 flex items-center justify-center rounded hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-opacity"
                data-tooltip={t("color")}
              >
                <PaletteColorIcon size={22} />
              </button>
              <ColorPickerPanel
                anchorRef={modalColorBtnRef}
                open={showModalColorPop}
                onClose={() => setShowModalColorPop(false)}
                colors={COLOR_ORDER.filter((name) => LIGHT_COLORS[name])}
                selectedColor={mColor}
                darkMode={dark}
                onSelect={(name) => setMColor(name)}
              />

              {/* Add images */}
              <input
                ref={modalFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files;
                  if (f && f.length) {
                    await addImagesToState(f, setMImages);
                  }
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => modalFileRef.current?.click()}
                className="p-1.5 text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 flex-shrink-0 transition-colors duration-200"
                data-tooltip={t("addImages")}
              >
                <AddImageIcon />
              </button>

              {/* Save button - hidden for collaborative text notes (they auto-save) */}
              {modalHasChanges &&
                !(mType === "text" && isCollaborativeNote(activeId)) && (
                  <button
                    onClick={saveModal}
                    disabled={savingModal}
                    className={`px-4 py-2 rounded-xl font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 whitespace-nowrap transition-all duration-200 ${savingModal ? "bg-gradient-to-r from-indigo-400 to-violet-500 text-white cursor-not-allowed opacity-70" : "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient focus:ring-indigo-500"}`}
                  >
                    {savingModal ? t("saving") : t("save")}
                  </button>
                )}
              {/* Delete button moved to modal 3-dot menu */}
            </div>
          </div>

          {/* Confirm Delete Dialog */}
          {confirmDeleteOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setConfirmDeleteOpen(false)}
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
                <h3 className="text-lg font-semibold mb-2">
                  {tagFilter === "TRASHED" ? t("permanentlyDeleteQuestion") : t("moveToTrashQuestion")}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {tagFilter === "TRASHED" ? t("permanentlyDeleteConfirm") : t("moveToTrashConfirm")}
                </p>
                <div className="mt-5 flex justify-end gap-3">
                  <button
                    className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={() => setConfirmDeleteOpen(false)}
                  >{t("cancel")}</button>
                  <button
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    onClick={async () => {
                      setConfirmDeleteOpen(false);
                      await deleteModal();
                    }}
                  >{tagFilter === "TRASHED" ? t("permanentlyDelete") : t("moveToTrash")}</button>
                </div>
              </div>
            </div>
          )}

          {/* Collaboration Modal */}
          {collaborationModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => {
                  setCollaborationModalOpen(false);
                  setCollaboratorUsername("");
                  setShowUserDropdown(false);
                  setFilteredUsers([]);
                }}
              />
              <div
                className="glass-card rounded-xl shadow-2xl w-[90%] max-w-md p-6 relative max-h-[90vh] overflow-y-auto"
                style={{
                  backgroundColor: dark
                    ? "rgba(40,40,40,0.95)"
                    : "rgba(255,255,255,0.95)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  // Check if user owns the note (or if it's a new note)
                  const note = activeId
                    ? notes.find((n) => String(n.id) === String(activeId))
                    : null;
                  const isOwner =
                    !activeId || note?.user_id === currentUser?.id;

                  return (
                    <>
                      <h3 className="text-lg font-semibold mb-4">
                        {isOwner ? t("addCollaborator") : t("collaborators")}
                      </h3>

                      {/* Show existing collaborators with remove option */}
                      {addModalCollaborators.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("currentCollaborators")}</p>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {addModalCollaborators.map((collab) => {
                              const canRemove =
                                isOwner || collab.id === currentUser?.id;

                              return (
                                <div
                                  key={collab.id}
                                  className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded-lg"
                                >
                                  <div>
                                    <p className="font-medium text-sm">
                                      {collab.name || collab.email}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {collab.email}
                                    </p>
                                  </div>
                                  {canRemove && (
                                    <button
                                      onClick={async () => {
                                        await removeCollaborator(
                                          collab.id,
                                          activeId,
                                        );
                                      }}
                                      className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                      data-tooltip={
                                        collab.id === currentUser?.id
                                          ? "Remove yourself"
                                          : "Remove collaborator"
                                      }
                                    >
                                      {collab.id === currentUser?.id
                                        ? "Leave"
                                        : t("remove")}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Only show add collaborator input/button if user owns the note */}
                      {isOwner && (
                        <>
                          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                            {t("collaborateInstructions")}
                          </p>
                          <div ref={collaboratorInputRef} className="relative">
                            <input
                              type="text"
                              value={collaboratorUsername}
                              onChange={(e) => {
                                const value = e.target.value;
                                setCollaboratorUsername(value);
                                updateDropdownPosition();
                                searchUsers(value);
                              }}
                              onFocus={() => {
                                updateDropdownPosition();
                                searchUsers(collaboratorUsername || "");
                              }}
                              placeholder={t("searchByUsernameOrEmail")}
                              className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-transparent"
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" &&
                                  collaboratorUsername.trim()
                                ) {
                                  // If dropdown is open and there's a filtered user, select the first one
                                  if (
                                    showUserDropdown &&
                                    filteredUsers.length > 0
                                  ) {
                                    const firstUser = filteredUsers[0];
                                    setCollaboratorUsername(
                                      firstUser.name || firstUser.email,
                                    );
                                    setShowUserDropdown(false);
                                  } else {
                                    addCollaborator(
                                      collaboratorUsername.trim(),
                                    );
                                  }
                                } else if (e.key === "Escape") {
                                  setShowUserDropdown(false);
                                }
                              }}
                            />
                          </div>
                          <div className="mt-5 flex justify-end gap-3">
                            <button
                              className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                              onClick={() => {
                                setCollaborationModalOpen(false);
                                setCollaboratorUsername("");
                                setShowUserDropdown(false);
                                setFilteredUsers([]);
                              }}
                            >{t("cancel")}</button>
                            <button
                              className="px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                              onClick={async () => {
                                if (collaboratorUsername.trim()) {
                                  await addCollaborator(
                                    collaboratorUsername.trim(),
                                  );
                                }
                              }}
                            >{t("addCollaborator")}</button>
                          </div>
                        </>
                      )}

                      {/* If user doesn't own the note, show only cancel button */}
                      {!isOwner && (
                        <div className="mt-5 flex justify-end gap-3">
                          <button
                            className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                            onClick={() => {
                              setCollaborationModalOpen(false);
                              setCollaboratorUsername("");
                              setShowUserDropdown(false);
                              setFilteredUsers([]);
                            }}
                          >{t("close")}</button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* User dropdown portal - rendered outside modal */}
          {showUserDropdown &&
            filteredUsers.length > 0 &&
            createPortal(
              <div
                data-user-dropdown
                className="fixed z-[60] bg-white dark:bg-[#272727] border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                style={{
                  top: `${dropdownPosition.top}px`,
                  left: `${dropdownPosition.left}px`,
                  width: `${dropdownPosition.width}px`,
                }}
              >
                {loadingUsers ? (
                  <div className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{t("searching")}</div>
                ) : (
                  filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                      onClick={() => {
                        setCollaboratorUsername(user.name || user.email);
                        setShowUserDropdown(false);
                      }}
                    >
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {user.name || user.email}
                      </div>
                      {user.name && (
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {user.email}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>,
              document.body,
            )}
        </div>
      </div>

      {/* Fullscreen Image Viewer */}
      {imgViewOpen && mImages.length > 0 && createPortal(
        <div
          className="fixed inset-0 z-[9999] backdrop-blur-md bg-black/30 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeImageViewer();
            resetMobileNav();
          }}
        >
          {/* Controls */}
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            <button
              className="px-3 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
              data-tooltip={t("downloadShortcut")}
              onClick={async (e) => {
                e.stopPropagation();
                const im = mImages[imgViewIndex];
                if (im) {
                  const fname = normalizeImageFilename(
                    im.name,
                    im.src,
                    imgViewIndex + 1,
                  );
                  await downloadDataUrl(fname, im.src);
                }
              }}
            >
              <DownloadIcon />
            </button>
            <button
              className="px-3 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
              data-tooltip={t("closeEsc")}
              onClick={(e) => {
                e.stopPropagation();
                closeImageViewer();
              }}
            >
              <CloseIcon />
            </button>
          </div>

          {/* Prev / Next */}
          {mImages.length > 1 && (
            <>
              <button
                className={`absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-opacity duration-300 sm:opacity-100 ${mobileNavVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                data-tooltip={t("previousArrow")}
                onClick={(e) => {
                  e.stopPropagation();
                  prevImage();
                  resetMobileNav();
                }}
              >
                <ArrowLeft />
              </button>
              <button
                className={`absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-opacity duration-300 sm:opacity-100 ${mobileNavVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                data-tooltip={t("nextArrow")}
                onClick={(e) => {
                  e.stopPropagation();
                  nextImage();
                  resetMobileNav();
                }}
              >
                <ArrowRight />
              </button>
            </>
          )}

          {/* Image */}
          <img
            src={mImages[imgViewIndex].src}
            alt={mImages[imgViewIndex].name || `image-${imgViewIndex + 1}`}
            className="max-w-[92vw] max-h-[92vh] object-contain rounded-lg shadow-2xl"
            style={{ background: dark ? "#000" : "#fff" }}
            onClick={(e) => { e.stopPropagation(); resetMobileNav(); }}
          />
          {/* Caption */}
          <div className="absolute top-4 left-0 right-0 z-10 text-xs text-white text-center">
            <span className="hidden sm:inline">{mImages[imgViewIndex].name || `image-${imgViewIndex + 1}`} </span>
            {mImages.length > 1 && (
              <span>{imgViewIndex + 1}/{mImages.length}</span>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
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
      {/* Decorative floating background — fixed wallpaper, z-1 keeps it below all UI (desktop only) */}
      {floatingCardsEnabled && <div aria-hidden="true" style={{position:"fixed",inset:0,zIndex:1,pointerEvents:"none",overflow:"hidden"}}>
        {/* Colonne gauche */}
        <div className="login-deco-card" style={{"--rot":"-12deg","--dur":"7s","--delay":"0s",top:"5%",left:"2%",borderTop:"3px solid rgba(99,102,241,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(99,102,241,0.5)"}}/>
          <div className="deco-line" style={{width:"90%"}}/>
          <div className="deco-line" style={{width:"75%"}}/>
          <div className="deco-line" style={{width:"60%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"5deg","--dur":"9s","--delay":"-2s",top:"32%",left:"1%",borderTop:"3px solid rgba(168,85,247,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(168,85,247,0.5)"}}/>
          <div className="deco-line" style={{width:"85%"}}/>
          <div className="deco-line" style={{width:"55%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"8deg","--dur":"8s","--delay":"-4s",top:"60%",left:"3%",borderTop:"3px solid rgba(16,185,129,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(16,185,129,0.5)"}}/>
          <div className="deco-line" style={{width:"80%"}}/>
          <div className="deco-line" style={{width:"65%"}}/>
          <div className="deco-line" style={{width:"45%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"-6deg","--dur":"10s","--delay":"-7s",top:"83%",left:"5%",borderTop:"3px solid rgba(245,158,11,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(245,158,11,0.5)"}}/>
          <div className="deco-line" style={{width:"78%"}}/>
          <div className="deco-line" style={{width:"55%"}}/>
        </div>
        {/* Colonne centre-gauche */}
        <div className="login-deco-card" style={{"--rot":"10deg","--dur":"8.5s","--delay":"-1.5s",top:"12%",left:"22%",borderTop:"3px solid rgba(249,115,22,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(249,115,22,0.5)"}}/>
          <div className="deco-line" style={{width:"82%"}}/>
          <div className="deco-line" style={{width:"64%"}}/>
          <div className="deco-line" style={{width:"50%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"-7deg","--dur":"9.5s","--delay":"-6s",top:"46%",left:"20%",borderTop:"3px solid rgba(14,165,233,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(14,165,233,0.5)"}}/>
          <div className="deco-line" style={{width:"88%"}}/>
          <div className="deco-line" style={{width:"58%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"13deg","--dur":"7.5s","--delay":"-3.5s",top:"75%",left:"25%",borderTop:"3px solid rgba(132,204,22,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(132,204,22,0.5)"}}/>
          <div className="deco-line" style={{width:"76%"}}/>
          <div className="deco-line" style={{width:"52%"}}/>
          <div className="deco-line" style={{width:"68%"}}/>
        </div>
        {/* Colonne centre */}
        <div className="login-deco-card" style={{"--rot":"-4deg","--dur":"11s","--delay":"-0.5s",top:"4%",left:"44%",borderTop:"3px solid rgba(236,72,153,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(236,72,153,0.5)"}}/>
          <div className="deco-line" style={{width:"90%"}}/>
          <div className="deco-line" style={{width:"70%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"9deg","--dur":"9s","--delay":"-8s",top:"80%",left:"48%",borderTop:"3px solid rgba(20,184,166,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(20,184,166,0.5)"}}/>
          <div className="deco-line" style={{width:"74%"}}/>
          <div className="deco-line" style={{width:"88%"}}/>
          <div className="deco-line" style={{width:"55%"}}/>
        </div>
        {/* Colonne centre-droite */}
        <div className="login-deco-card" style={{"--rot":"-9deg","--dur":"10.5s","--delay":"-2.5s",top:"10%",left:"65%",borderTop:"3px solid rgba(244,63,94,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(244,63,94,0.5)"}}/>
          <div className="deco-line" style={{width:"76%"}}/>
          <div className="deco-line" style={{width:"92%"}}/>
          <div className="deco-line" style={{width:"55%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"7deg","--dur":"8s","--delay":"-7s",top:"44%",left:"63%",borderTop:"3px solid rgba(99,102,241,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(99,102,241,0.5)"}}/>
          <div className="deco-line" style={{width:"80%"}}/>
          <div className="deco-line" style={{width:"62%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"-11deg","--dur":"9s","--delay":"-4.5s",top:"73%",left:"67%",borderTop:"3px solid rgba(168,85,247,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(168,85,247,0.5)"}}/>
          <div className="deco-line" style={{width:"85%"}}/>
          <div className="deco-line" style={{width:"60%"}}/>
          <div className="deco-line" style={{width:"72%"}}/>
        </div>
        {/* Colonne droite */}
        <div className="login-deco-card" style={{"--rot":"6deg","--dur":"10s","--delay":"-1s",top:"6%",right:"3%",borderTop:"3px solid rgba(16,185,129,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(16,185,129,0.5)"}}/>
          <div className="deco-line" style={{width:"88%"}}/>
          <div className="deco-line" style={{width:"70%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"-8deg","--dur":"7.5s","--delay":"-3s",top:"35%",right:"2%",borderTop:"3px solid rgba(245,158,11,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(245,158,11,0.5)"}}/>
          <div className="deco-line" style={{width:"90%"}}/>
          <div className="deco-line" style={{width:"60%"}}/>
          <div className="deco-line" style={{width:"78%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"-15deg","--dur":"11s","--delay":"-5s",top:"62%",right:"4%",borderTop:"3px solid rgba(249,115,22,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(249,115,22,0.5)"}}/>
          <div className="deco-line" style={{width:"75%"}}/>
          <div className="deco-line" style={{width:"50%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"4deg","--dur":"8s","--delay":"-9s",top:"85%",right:"6%",borderTop:"3px solid rgba(14,165,233,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(14,165,233,0.5)"}}/>
          <div className="deco-line" style={{width:"82%"}}/>
          <div className="deco-line" style={{width:"66%"}}/>
          <div className="deco-line" style={{width:"50%"}}/>
        </div>
      </div>}
      {/* Tag Sidebar / Drawer */}
      <TagSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
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
        permanent={alwaysShowSidebarOnWide && windowWidth >= 700}
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
        showGenericConfirm={showGenericConfirm}
        showToast={showToast}
        onResetNoteOrder={resetNoteOrder}
        currentUser={currentUser}
        token={token}
        onProfileUpdated={(updates) => {
          setSession((prev) => prev ? { ...prev, user: { ...prev.user, ...updates } } : prev);
          setAuth({ ...getAuth(), user: { ...getAuth()?.user, ...updates } });
        }}
      />

      {/* Admin Panel */}
      <AdminPanel
        open={adminPanelOpen}
        onClose={() => setAdminPanelOpen(false)}
        dark={dark}
        adminSettings={adminSettings}
        setAdminSettings={setAdminSettings}
        allUsers={allUsers}
        newUserForm={newUserForm}
        setNewUserForm={setNewUserForm}
        updateAdminSettings={updateAdminSettings}
        createUser={createUser}
        deleteUser={deleteUser}
        updateUser={updateUser}
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
        openSidebar={() => setSidebarOpen(true)}
        activeTagFilter={tagFilter}
        activeTagFilters={activeTagFilters}
        sidebarPermanent={alwaysShowSidebarOnWide && windowWidth >= 700}
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
        // checklist update
        onUpdateChecklistItem={onUpdateChecklistItem}
        // Admin panel
        openAdminPanel={openAdminPanel}
        // Settings panel
        openSettingsPanel={openSettingsPanel}
        // header auto-hide (mobile)
        windowWidth={windowWidth}
        // floating cards toggle
        floatingCardsEnabled={floatingCardsEnabled}
        onToggleFloatingCards={toggleFloatingCards}
      />
      {modal}

      {/* Generic Confirmation Dialog */}
      {genericConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setGenericConfirmOpen(false)}
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
            <h3 className="text-lg font-semibold mb-2">
              {genericConfirmConfig.title || "Confirm Action"}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {genericConfirmConfig.message}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => setGenericConfirmOpen(false)}
              >
                {genericConfirmConfig.cancelText || t("cancel")}
              </button>
              <button
                className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] btn-gradient ${genericConfirmConfig.danger ? "bg-red-600 text-white hover:bg-red-700 shadow-md shadow-red-300/40 dark:shadow-none hover:shadow-lg hover:shadow-red-300/50 dark:hover:shadow-none" : "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none"}`}
                onClick={async () => {
                  setGenericConfirmOpen(false);
                  if (genericConfirmConfig.onConfirm) {
                    await genericConfirmConfig.onConfirm();
                  }
                }}
              >
                {genericConfirmConfig.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] space-y-2 flex flex-col items-center">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-4 py-2 rounded-lg shadow-lg max-w-sm animate-in slide-in-from-top-2 ${
                toast.type === "success"
                  ? "bg-green-600 text-white"
                  : toast.type === "error"
                    ? "bg-red-600 text-white"
                    : "bg-blue-600 text-white"
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
