import React, { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../i18n";
import { ALL_IMAGES, REMINDERS } from "../../utils/constants.js";
import { NotesIcon, ImagesIcon, ArchiveSidebarIcon, TrashSidebarIcon, TagIcon, RemindersSidebarIcon } from "../../icons/sidebarIcons.jsx";
import MultiSelectToolbar from "./MultiSelectToolbar.jsx";
import NotesHeader from "./NotesHeader.jsx";
import PageScrollbar from "../common/PageScrollbar.jsx";
import NotesComposer from "./NotesComposer.jsx";
import NotesSections from "./NotesSections.jsx";
import useScrollActivity from "../../hooks/useScrollActivity.js";
/** ---------- NotesUI (presentational) ---------- */
function NotesUI({
  currentUser,
  dark,
  toggleDark,
  notes,
  search,
  setSearch,
  onDirectDraw,
  onDirectText,
  onDirectChecklist,
  onDirectAudio,
  pinned,
  others,
  openModal,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  togglePin,
  onImportAll,
  onImportGKeep,
  onImportMd,
  importFileRef,
  gkeepFileRef,
  mdFileRef,
  signOut,
  onLockInstance,
  encryptionEnabled = false,
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
  // loading state
  notesLoading,
  // multi-select
  multiMode,
  selectedIds,
  onStartMulti,
  onExitMulti,
  onToggleSelect,
  onCtrlSelect,
  onBulkDelete,
  onBulkPin,
  onBulkArchive,
  onBulkRestore,
  onBulkColor,
  onBulkSetIcon,
  onBulkAddLogoFromFile,
  logoLibrary,
  deleteLogoFromLibrary,
  onBulkDownloadZip,
  onSelectAll,
  onOpenSideBySide,
  onEmptyTrash,
  // view mode
  listView,
  onToggleViewMode,
  // Admin panel
  openAdminPanel,
  hasUpdate = false,
  // Settings panel
  openSettingsPanel,
  // QR sign-in quick-access button in the header
  qrQuickEnabled = false,
  onOpenQrScanner,
  // AI props
  aiAssistantEnabled,
  aiResponse,
  setAiResponse,
  aiCitedNoteIds,
  setAiCitedNoteIds,
  isAiLoading,
  aiLoadingProgress,
  onAiSearch,
  // header auto-hide (mobile)
  windowWidth,
  isLandscapeMobile,
  // sync
  syncStatus,
  instanceLocked = false,
  handleSyncNow,
  syncDropdownOpen,
  setSyncDropdownOpen,
  mobileSearchOpen,
  setMobileSearchOpen,
  fabOpen,
  setFabOpen,
  notificationBellDesktop = null,
  notificationBellMobile = null,
}) {
  const mobileSearchRef = useRef(null);
  useScrollActivity();
  const isMobile = windowWidth < 700 || isLandscapeMobile;
  // Stable array reference for MultiSelectToolbar — avoids rebuilding on every render.
  const filteredNotesForMulti = useMemo(() => [...pinned, ...others], [pinned, others]);

  // Header auto-hide on scroll (mobile only)
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  useEffect(() => {
    if (windowWidth >= 700 && !isLandscapeMobile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- header auto-hide only runs on mobile: force the header back when switching to desktop
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-evaluated on width changes only, as before; isLandscapeMobile is read at that time
  }, [windowWidth]);
  const sectionLabel = (() => {
    // Multiple tags selected: show a compact count badge instead of the
    // concatenated list. Joining names produces "tag1, tag2, tag3…"
    // which gets truncated into an unhelpful "tag1, t…" in the header.
    if (activeTagFilters.length > 1) {
      return t("activeTagFiltersCount", { count: activeTagFilters.length });
    }
    if (activeTagFilters.length === 1) return activeTagFilters[0];
    if (activeTagFilter === ALL_IMAGES) return t("allImages");
    if (activeTagFilter === "ARCHIVED") return t("archivedNotes");
    if (activeTagFilter === "TRASHED") return t("trashedNotes");
    if (activeTagFilter === REMINDERS) return t("remindersNotes");
    if (activeTagFilter) return activeTagFilter;
    return t("notes");
  })();

  const SectionIcon = (() => {
    if (activeTagFilter === ALL_IMAGES) return ImagesIcon;
    if (activeTagFilter === "ARCHIVED") return ArchiveSidebarIcon;
    if (activeTagFilter === "TRASHED") return TrashSidebarIcon;
    if (activeTagFilter === REMINDERS) return RemindersSidebarIcon;
    if (activeTagFilter || activeTagFilters.length > 0) return TagIcon;
    return NotesIcon;
  })();

  // Close header menu when scrolling. Capture phase on document catches
  // scroll events from window (mobile) or from the desktop scroll area
  // (.notes-scroll-area) alike, since "scroll" doesn't bubble.
  React.useEffect(() => {
    if (!headerMenuOpen) return;

    const handleScroll = () => {
      setHeaderMenuOpen(false);
    };

    document.addEventListener("scroll", handleScroll, {
      capture: true,
      passive: true,
    });
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, [headerMenuOpen, setHeaderMenuOpen]);


  return (
    <div
      className={`min-h-screen overflow-x-clip${isMobile ? "" : " notes-shell-desktop"}`}
      style={{ marginLeft: sidebarPermanent ? `${sidebarWidth}px` : "0px", position:"relative", zIndex:2 }}
    >
      {/* In this stacking context, so the header (z-40) covers it. */}
      <PageScrollbar />
      <NotesHeader
        dark={dark}
        headerVisible={headerVisible}
        windowWidth={windowWidth}
        isLandscapeMobile={isLandscapeMobile}
        sidebarPermanent={sidebarPermanent}
        mobileSearchOpen={mobileSearchOpen}
        setMobileSearchOpen={setMobileSearchOpen}
        mobileSearchRef={mobileSearchRef}
        search={search}
        setSearch={setSearch}
        aiAssistantEnabled={aiAssistantEnabled}
        onAiSearch={onAiSearch}
        listView={listView}
        onToggleViewMode={onToggleViewMode}
        toggleDark={toggleDark}
        syncStatus={syncStatus}
        handleSyncNow={handleSyncNow}
        syncDropdownOpen={syncDropdownOpen}
        setSyncDropdownOpen={setSyncDropdownOpen}
        instanceLocked={instanceLocked}
        onStartMulti={onStartMulti}
        openSettingsPanel={openSettingsPanel}
        openAdminPanel={openAdminPanel}
        qrQuickEnabled={qrQuickEnabled}
        onOpenQrScanner={onOpenQrScanner}
        hasUpdate={hasUpdate}
        currentUser={currentUser}
        signOut={signOut}
        onLockInstance={onLockInstance}
        encryptionEnabled={encryptionEnabled}
        headerMenuOpen={headerMenuOpen}
        setHeaderMenuOpen={setHeaderMenuOpen}
        headerMenuRef={headerMenuRef}
        headerBtnRef={headerBtnRef}
        importFileRef={importFileRef}
        gkeepFileRef={gkeepFileRef}
        mdFileRef={mdFileRef}
        onImportAll={onImportAll}
        onImportGKeep={onImportGKeep}
        onImportMd={onImportMd}
        sectionLabel={sectionLabel}
        SectionIcon={SectionIcon}
        openSidebar={openSidebar}
        notificationBellDesktop={notificationBellDesktop}
        notificationBellMobile={notificationBellMobile}
      />

      {/* Wrapper that pushes the composer + sections down by the dock's
          height when multi-select is active. The dock itself stays
          position:fixed so it follows the user's scroll, but at the top
          of the page the dock would otherwise overlap the 3 creation
          buttons (text/checklist/draw). The padding-top transition
          slides the content down smoothly when entering multiMode and
          back up on exit. */}
      <div
        className="multi-select-content-shim notes-scroll-area"
        data-multimode={multiMode ? "true" : undefined}
      >
      <NotesComposer
        dark={dark}
        activeTagFilter={activeTagFilter}
        onDirectDraw={onDirectDraw}
        onDirectText={onDirectText}
        onDirectChecklist={onDirectChecklist}
        onDirectAudio={onDirectAudio}
        fabOpen={fabOpen}
        setFabOpen={setFabOpen}
        isDesktop={windowWidth >= 700 && !isLandscapeMobile}
        multiMode={multiMode}
        aiAssistantEnabled={aiAssistantEnabled}
        aiResponse={aiResponse}
        setAiResponse={setAiResponse}
        aiCitedNoteIds={aiCitedNoteIds}
        setAiCitedNoteIds={setAiCitedNoteIds}
        isAiLoading={isAiLoading}
        aiLoadingProgress={aiLoadingProgress}
        setSearch={setSearch}
        notes={notes}
        currentUser={currentUser}
        openModal={openModal}
      />

      <NotesSections
        pinned={pinned}
        others={others}
        dark={dark}
        openModal={openModal}
        togglePin={togglePin}
        multiMode={multiMode}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
        onCtrlSelect={onCtrlSelect}
        activeTagFilter={activeTagFilter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        currentUser={currentUser}
        listView={listView}
        notesLoading={notesLoading}
        filteredEmptyWithSearch={filteredEmptyWithSearch}
        allEmpty={allEmpty}
        syncStatus={syncStatus}
        windowWidth={windowWidth}
        onEmptyTrash={onEmptyTrash}
      />
      </div>

      {/* Floating multi-select dock — fixed at the bottom of the viewport,
          overlay-style. Lives outside the scrollable content so it doesn't
          push layout down or compete with NotesHeader. Receives the
          sidebar geometry so it can offset itself out from under a
          permanent sidebar and recompute its budget when it toggles. */}
      <MultiSelectToolbar
        multiMode={multiMode}
        dark={dark}
        activeTagFilter={activeTagFilter}
        selectedIds={selectedIds}
        filteredNotes={filteredNotesForMulti}
        onBulkDownloadZip={onBulkDownloadZip}
        onBulkRestore={onBulkRestore}
        onBulkDelete={onBulkDelete}
        onBulkColor={onBulkColor}
        onBulkSetIcon={onBulkSetIcon}
        onBulkAddLogoFromFile={onBulkAddLogoFromFile}
        logoLibrary={logoLibrary}
        deleteLogoFromLibrary={deleteLogoFromLibrary}
        onBulkPin={onBulkPin}
        onBulkArchive={onBulkArchive}
        onSelectAll={onSelectAll}
        onExitMulti={onExitMulti}
        onOpenSideBySide={onOpenSideBySide}
        sidebarPermanent={sidebarPermanent}
        sidebarWidth={sidebarWidth}
        headerVisible={headerVisible}
        isMobile={isMobile}
      />
    </div>
  );
}

export default NotesUI;
