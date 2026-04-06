import React from "react";
import { createPortal } from "react-dom";
import { t } from "../../i18n";
import { Hamburger, SearchIcon, Sparkles, CloseIcon, GridIcon, ListIcon, SunIcon, MoonIcon, CheckSquareIcon, SettingsIcon, ShieldIcon, LogOutIcon, Kebab } from "../../icons/index.jsx";
import SyncStatusIcon from "../../sync/SyncStatusIcon.jsx";
import UserAvatar from "../common/UserAvatar.jsx";

export default function NotesHeader({
  dark,
  headerVisible,
  windowWidth,
  sidebarPermanent,
  mobileSearchOpen,
  setMobileSearchOpen,
  mobileSearchRef,
  search,
  setSearch,
  localAiEnabled,
  onAiSearch,
  isOnline,
  listView,
  onToggleViewMode,
  toggleDark,
  syncStatus,
  handleSyncNow,
  onStartMulti,
  openSettingsPanel,
  openAdminPanel,
  currentUser,
  signOut,
  headerMenuOpen,
  setHeaderMenuOpen,
  headerMenuRef,
  headerBtnRef,
  importFileRef,
  gkeepFileRef,
  mdFileRef,
  onImportAll,
  onImportGKeep,
  onImportMd,
  sectionLabel,
  SectionIcon,
  openSidebar,
  activeTagFilter,
}) {
  return (
      <header
        className={`p-4 sm:p-6 flex justify-between items-center sticky top-0 ${mobileSearchOpen ? "z-[1000]" : "z-20"} glass-card mb-6 relative`}
        style={{
          transform: !headerVisible && windowWidth < 700 ? "translateY(-100%)" : "translateY(0)",
          transition: "transform 0.3s ease",
        }}
      >
        <div className="flex items-center gap-3 shrink-0">
          {/* Hamburger - show when sidebar is not permanently visible */}
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
          <div className="flex flex-col sm:hidden leading-tight min-w-0 max-w-[150px]">
            <h1 className="text-lg font-bold truncate">Glass Keep</h1>
            <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1 min-w-0">
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

          {/* Offline indicator - desktop only (mobile is inside stacked block above) */}
          {!isOnline && (
            <span className="hidden sm:inline ml-2 text-xs px-2 py-0.5 rounded-full bg-orange-600/10 text-orange-700 dark:text-orange-300 border border-orange-600/20">{t("offline")}</span>
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
            <div className="flex flex-col items-center gap-0.5">
              <SyncStatusIcon dark={dark} syncStatus={syncStatus} onSyncNow={handleSyncNow} />
              {!isOnline && (
                <span className="text-[9px] leading-none px-1.5 py-0.5 rounded-full bg-orange-600/10 text-orange-700 dark:text-orange-300 border border-orange-600/20 whitespace-nowrap">{t("offline")}</span>
              )}
            </div>
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
  );
}
