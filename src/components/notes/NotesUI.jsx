import React, { useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { ALL_IMAGES } from "../../utils/constants.js";
import { NotesIcon, ImagesIcon, ArchiveSidebarIcon, TrashSidebarIcon, TagIcon } from "../../icons/sidebarIcons.jsx";
import MultiSelectToolbar from "./MultiSelectToolbar.jsx";
import NotesHeader from "./NotesHeader.jsx";
import NotesComposer from "./NotesComposer.jsx";
import NotesSections from "./NotesSections.jsx";

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
  onDirectDraw,
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
  isLandscapeMobile,
  // floating cards toggle
  floatingCardsEnabled,
  onToggleFloatingCards,
  // sync
  syncStatus,
  handleSyncNow,
  syncDropdownOpen,
  setSyncDropdownOpen,
  mobileSearchOpen,
  setMobileSearchOpen,
}) {
  const mobileSearchRef = useRef(null);

  // Header auto-hide on scroll (mobile only)
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  useEffect(() => {
    if (windowWidth >= 700 && !isLandscapeMobile) {
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
      className="min-h-screen overflow-x-clip"
      style={{ marginLeft: sidebarPermanent ? `${sidebarWidth}px` : "0px", position:"relative", zIndex:2 }}
    >
      <MultiSelectToolbar
        multiMode={multiMode}
        dark={dark}
        activeTagFilter={activeTagFilter}
        selectedIds={selectedIds}
        onBulkDownloadZip={onBulkDownloadZip}
        onBulkRestore={onBulkRestore}
        onBulkDelete={onBulkDelete}
        onBulkColor={onBulkColor}
        onBulkPin={onBulkPin}
        onBulkArchive={onBulkArchive}
        onExitMulti={onExitMulti}
        headerVisible={headerVisible}
      />

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
        localAiEnabled={localAiEnabled}
        onAiSearch={onAiSearch}
        isOnline={isOnline}
        listView={listView}
        onToggleViewMode={onToggleViewMode}
        toggleDark={toggleDark}
        syncStatus={syncStatus}
        handleSyncNow={handleSyncNow}
        syncDropdownOpen={syncDropdownOpen}
        setSyncDropdownOpen={setSyncDropdownOpen}
        onStartMulti={onStartMulti}
        openSettingsPanel={openSettingsPanel}
        openAdminPanel={openAdminPanel}
        currentUser={currentUser}
        signOut={signOut}
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
        activeTagFilter={activeTagFilter}
      />

      <NotesComposer
        dark={dark}
        activeTagFilter={activeTagFilter}
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
        composerTagList={composerTagList}
        setComposerTagList={setComposerTagList}
        composerTagInput={composerTagInput}
        setComposerTagInput={setComposerTagInput}
        composerTagFocused={composerTagFocused}
        setComposerTagFocused={setComposerTagFocused}
        composerTagInputRef={composerTagInputRef}
        tagsWithCounts={tagsWithCounts}
        composerColor={composerColor}
        setComposerColor={setComposerColor}
        addNote={addNote}
        onDirectDraw={onDirectDraw}
        formatComposer={formatComposer}
        showComposerFmt={showComposerFmt}
        setShowComposerFmt={setShowComposerFmt}
        composerFmtBtnRef={composerFmtBtnRef}
        onComposerKeyDown={onComposerKeyDown}
        composerCollapsed={composerCollapsed}
        setComposerCollapsed={setComposerCollapsed}
        titleRef={titleRef}
        composerRef={composerRef}
        colorBtnRef={colorBtnRef}
        showColorPop={showColorPop}
        setShowColorPop={setShowColorPop}
        localAiEnabled={localAiEnabled}
        aiResponse={aiResponse}
        setAiResponse={setAiResponse}
        isAiLoading={isAiLoading}
        aiLoadingProgress={aiLoadingProgress}
        onAiSearch={onAiSearch}
        search={search}
        setSearch={setSearch}
        syncStatus={syncStatus}
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
        activeTagFilter={activeTagFilter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        isOnline={isOnline}
        onUpdateChecklistItem={onUpdateChecklistItem}
        currentUser={currentUser}
        listView={listView}
        notesLoading={notesLoading}
        filteredEmptyWithSearch={filteredEmptyWithSearch}
        allEmpty={allEmpty}
        syncStatus={syncStatus}
        windowWidth={windowWidth}
      />
    </div>
  );
}

export default NotesUI;
