import React from "react";
import { createPortal, flushSync } from "react-dom";
import { t } from "../../i18n";
import { Hamburger, SearchIcon, CloseIcon, GridIcon, ListIcon, SunIcon, MoonIcon, CheckSquareIcon, SettingsIcon, ShieldIcon, LogOutIcon, LockIcon, Kebab } from "../../icons/index.jsx";
import TI from "../../icons/editor/index.jsx";
import SyncStatusIcon from "../../sync/SyncStatusIcon.jsx";
import UserAvatar from "../common/UserAvatar.jsx";
import { useBranding, DEFAULT_APP_NAME } from "../../branding/BrandingContext.jsx";

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
  aiAssistantEnabled,
  onAiSearch,
  listView,
  onToggleViewMode,
  toggleDark,
  syncStatus,
  handleSyncNow,
  syncDropdownOpen,
  setSyncDropdownOpen,
  instanceLocked = false,
  onStartMulti,
  openSettingsPanel,
  openAdminPanel,
  hasUpdate = false,
  currentUser,
  signOut,
  // Header instance-lock (admin + at-rest encryption only). onLockInstance
  // re-locks the server; encryptionEnabled gates the whole affordance.
  onLockInstance,
  encryptionEnabled = false,
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
  isLandscapeMobile,
  multiMode,
  qrQuickEnabled = false,
  onOpenQrScanner,
  // Notification bell slots. Two separate instances are passed because
  // the desktop and mobile icon clusters live in different containers,
  // and a single instance shared via React props would render twice
  // anyway. Each instance has its own popover state but they read the
  // same NotificationProvider, so the badge count stays consistent.
  notificationBellDesktop = null,
  notificationBellMobile = null,
}) {
  const { branding } = useBranding();
  const appName = branding.appName || DEFAULT_APP_NAME;

  // Desktop sign-out, two-step in place: the first click "arms" the account
  // button — the avatar crossfades into a red logout glyph (and the pseudo
  // turns red) — and the second click signs out. It disarms on an outside
  // click or after a few idle seconds so it never gets stuck. This keeps the
  // header clean (no bare logout icon) while making room for the lock button.
  // Mobile keeps sign-out in the kebab menu.
  const [signOutArmed, setSignOutArmed] = React.useState(false);
  const userBtnRef = React.useRef(null);
  const signOutDisarmTimerRef = React.useRef(null);

  React.useEffect(() => {
    if (!signOutArmed) return undefined;
    // Auto-disarm after a short idle window.
    signOutDisarmTimerRef.current = setTimeout(() => setSignOutArmed(false), 3500);
    // Disarm on any pointer-down outside the account button.
    const onDown = (e) => {
      if (userBtnRef.current?.contains(e.target)) return;
      setSignOutArmed(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      clearTimeout(signOutDisarmTimerRef.current);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [signOutArmed]);

  // Header instance-lock: shown only for admins on an encryption-enabled
  // server. POST /api/instance/lock is admin-only, so a non-admin tap would
  // just 403 — gate the affordance on both conditions. On desktop it's an
  // icon button beside the bell; on mobile it lives in the kebab menu (an
  // extra header icon overflowed narrow phones and pushed the kebab off-screen).
  const showLockBtn = !!encryptionEnabled && !!currentUser?.is_admin;
  const renderLockBtn = () => {
    if (!showLockBtn) return null;
    return (
      <button
        type="button"
        onClick={() => onLockInstance?.()}
        className="p-2 rounded-full cursor-pointer gk-header-icon-btn focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-red-400 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
        data-tooltip={t("lockInstanceTooltip")}
        aria-label={t("lockInstanceTooltip")}
      >
        <LockIcon />
      </button>
    );
  };

  // The kebab dropdown can't rely on the typical "fixed inset-0
  // backdrop captures the click" pattern: the host <header> has a
  // permanent `transform: translateY(0)` for its slide-in animation,
  // which turns the header into the containing block for any
  // descendant `position: fixed`. A backdrop-fixed-inset-0 would
  // therefore be clipped to the header's bounding rect, leaving the
  // notes grid underneath fully clickable. So we listen at the
  // document level in capture phase instead.
  //
  // The tricky bit: a single tap fires `pointerdown` → `pointerup` →
  // `click` as a sequence. If we close the menu on `pointerdown` and
  // then drop our listeners (via useEffect cleanup), the subsequent
  // `click` fires with NO listener attached and the underlying note
  // card opens. To avoid that race we:
  //   1. Keep a PERMANENT click-capture listener that just consumes
  //      any click marked by the ref flag below. It's attached on
  //      mount and never torn down, so it's always there when the
  //      click arrives — even after the menu has been state-closed.
  //   2. On `pointerdown` while the menu is open, flip the flag,
  //      stopPropagation + preventDefault, then close the menu.
  //   3. The permanent click listener catches the click, swallows
  //      it (stopPropagation + preventDefault), and clears the flag.
  //
  // A 500 ms safety timer clears the flag too — covers the rare case
  // where pointerdown fires but the browser never produces a click
  // (long-press, drag-cancel, etc.) so the flag doesn't leak into
  // the next legitimate click.
  const swallowNextClickRef = React.useRef(false);
  const swallowClearTimerRef = React.useRef(null);

  // Publish the header's exact rendered height as --gk-header-h so the
  // sidebar can mask its right-edge line precisely over the header strip
  // (the top-left header/sidebar corner reads as one surface, to the pixel).
  // ResizeObserver keeps it correct across breakpoints, font/zoom changes,
  // and the offline-badge row that adds height on narrow widths.
  const headerRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const apply = () => {
      document.documentElement.style.setProperty(
        "--gk-header-h",
        `${el.getBoundingClientRect().height}px`,
      );
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const onClick = (e) => {
      if (!swallowNextClickRef.current) return;
      swallowNextClickRef.current = false;
      if (swallowClearTimerRef.current) {
        clearTimeout(swallowClearTimerRef.current);
        swallowClearTimerRef.current = null;
      }
      e.stopPropagation();
      e.preventDefault();
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (swallowClearTimerRef.current) {
        clearTimeout(swallowClearTimerRef.current);
        swallowClearTimerRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (!headerMenuOpen) return undefined;
    const onPointerDown = (e) => {
      const target = e.target;
      if (headerMenuRef?.current?.contains(target)) return;
      if (headerBtnRef?.current?.contains(target)) return;
      e.preventDefault();
      e.stopPropagation();
      swallowNextClickRef.current = true;
      if (swallowClearTimerRef.current) {
        clearTimeout(swallowClearTimerRef.current);
      }
      swallowClearTimerRef.current = setTimeout(() => {
        swallowNextClickRef.current = false;
        swallowClearTimerRef.current = null;
      }, 500);
      setHeaderMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [headerMenuOpen, setHeaderMenuOpen, headerMenuRef, headerBtnRef]);

  // In landscape mobile, force mobile layout regardless of sm: breakpoint
  const mobileOnly = isLandscapeMobile ? "" : "sm:hidden";
  const desktopOnly = isLandscapeMobile ? "hidden" : "hidden sm:flex";
  const desktopOnlyBlock = isLandscapeMobile ? "hidden" : "hidden sm:block";
  const desktopOnlyInline = isLandscapeMobile ? "hidden" : "hidden sm:inline-block";
  const desktopOnlyInlineText = isLandscapeMobile ? "hidden" : "hidden sm:inline";
  // Drive the offline badge from the sync engine's real reachability, NOT
  // navigator.onLine. The latter is a stale `false` at cold start in the
  // Android WebView, which flashed the badge on every refresh while the engine
  // was still doing its first health check ("checking" → serverReachable is
  // null, not false, so it correctly shows nothing here). A genuine
  // disconnect sets serverReachable === false immediately (window "offline"
  // event → engine.notifyOffline → emit), so the badge still appears at once
  // when we're really offline.
  const showOfflineBadge = syncStatus?.syncState === "offline" || syncStatus?.serverReachable === false;
  return (
      <header
        ref={headerRef}
        className={`${qrQuickEnabled ? "px-1.5" : "px-2.5"} py-4 sm:p-6 flex justify-between items-center sticky top-0 ${mobileSearchOpen ? "z-[1000]" : "z-40"} glass-card mb-6${showOfflineBadge && windowWidth < 640 ? " pb-7" : ""}`}
        style={{
          // Keep the sticky header tight against the status bar.
          // `--safe-top` falls back to the standard env() value in any
          // non-WebView context, but inside the Android app it picks up
          // the Activity-injected inset (works around an Android 15
          // WebView bug where env() returns 0 even in edge-to-edge).
          top: "var(--safe-top)",
          transform: !headerVisible && (windowWidth < 700 || isLandscapeMobile) ? "translateY(-100%)" : "translateY(0)",
          transition: "transform 0.3s ease",
        }}
      >
        {/* Tighter gap on mobile when the QR quick-access button is
            pinned in the header — without this the badge / app name
            risks wrapping or overflowing on narrow phones because the
            right-side icon cluster grew by one extra button. */}
        <div className={`flex items-center ${qrQuickEnabled ? "gap-1.5 sm:gap-3" : "gap-3"} shrink-0`}>
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

          {/* App logo — custom logo (single src, no srcSet so it isn't
              overridden by the bundled 2x/3x defaults) or the bundled
              favicon with its retina set. */}
          {branding.logo ? (
            <img
              src={branding.logo}
              alt={appName}
              className="h-7 w-7 select-none pointer-events-none object-contain"
              draggable="false"
            />
          ) : (
            <img
              src="/favicon-32x32.png"
              srcSet="/pwa-192.png 2x, /pwa-512.png 3x"
              alt={appName}
              className="h-7 w-7 rounded-xl shadow-sm select-none pointer-events-none"
              draggable="false"
            />
          )}

          {/* Mobile: stacked name + badge */}
          <div className={`flex flex-col ${mobileOnly} leading-tight relative`}>
            <h1 className="text-lg font-bold">{appName}</h1>
            <span className="text-xs font-medium text-[var(--gk-chrome-accent)] flex items-center gap-1 max-w-[160px]">
              <span className="shrink-0 w-3 h-3 [&>svg]:w-3 [&>svg]:h-3"><SectionIcon /></span>
              <span className="truncate">{sectionLabel}</span>
            </span>
            {showOfflineBadge && (
              <span className="absolute -bottom-5 left-0 text-[11px] leading-none px-2 py-0.5 rounded-full bg-orange-600/10 text-orange-700 dark:text-orange-300 border border-orange-600/20 font-medium whitespace-nowrap">{t("offline")}</span>
            )}
          </div>

          {/* Desktop: inline name + separator + badge. The "Glass Keep"
              wordmark is gated at xl: so on 1024-px-wide tablet viewports
              the title + section badge combo doesn't squeeze the search
              input down to a few characters ("Reche..."). The section
              badge is the more informative anchor of the two and stays. */}
          <h1 className={`hidden xl:block text-2xl sm:text-3xl font-bold ${isLandscapeMobile ? "!hidden" : ""}`}>
            {appName}
          </h1>
          <span className={`hidden xl:inline-block h-6 w-px bg-slate-400/60 dark:bg-gray-600 mx-1 ${isLandscapeMobile ? "!hidden" : ""}`} />
          <span className={`${desktopOnly} text-base font-medium px-3 py-1 rounded-lg bg-[var(--gk-accent-soft-bg)] text-[var(--gk-chrome-accent)] border border-[var(--gk-accent-soft-border)] items-center gap-1.5 max-w-[200px]`}>
            <span className="shrink-0 w-4 h-4 [&>svg]:w-4 [&>svg]:h-4"><SectionIcon /></span>
            <span className="truncate">{sectionLabel}</span>
          </span>

          {/* Offline indicator - desktop only (mobile is inside stacked block above) */}
          {showOfflineBadge && (
            <span className={`${desktopOnlyInlineText} ml-2 text-xs px-2 py-0.5 rounded-full bg-orange-600/10 text-orange-700 dark:text-orange-300 border border-orange-600/20`}>{t("offline")}</span>
          )}
        </div>

        {/* Desktop: full search bar. Padding ladder: tight on tablet
            widths (sm/lg) so the input has room for the full
            "Rechercher ou demander à l'IA" placeholder, generous at xl+
            where the layout has space again. */}
        <div className={`${desktopOnly} flex-grow min-w-0 justify-center px-2 xl:px-8`}>
          <div className="relative w-full max-w-lg">
            <input
              type="text"
              placeholder={aiAssistantEnabled ? t("searchOrAskAi") : t("search")}
              className={`w-full bg-transparent border border-transparent rounded-lg pl-4 ${aiAssistantEnabled ? "pr-20" : "pr-8"} py-2 ring-1 ring-slate-400/15 transition-shadow focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  aiAssistantEnabled &&
                  search.trim().length > 0
                ) {
                  onAiSearch?.(search);
                }
              }}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {aiAssistantEnabled && search.trim().length > 0 && (
                <button
                  type="button"
                  data-tooltip={t("askAi")}
                  className="h-7 w-7 rounded-full flex items-center justify-center text-indigo-600 hover:bg-indigo-600/10 transition-colors"
                  onClick={() => onAiSearch?.(search)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M10 21h-3a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v3.5"/><path d="M9 9h1"/><path d="M9 13h2.5"/><path d="M9 17h1"/><path d="M14 21v-4a2 2 0 1 1 4 0v4"/><path d="M14 19h4"/><path d="M21 15v6"/></svg>
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
        <div className={`${mobileOnly} flex items-center ml-auto mr-1`}>
          {!mobileSearchOpen && (
            <button
              type="button"
              className={`${qrQuickEnabled ? "p-1.5" : "p-2"} rounded-full hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-600 dark:text-gray-300`}
              aria-label={t("search")}
              onClick={() => {
                // iOS Safari only opens the soft keyboard when focus() is
                // called synchronously inside the user-gesture handler.
                // flushSync forces React to mount the input immediately so
                // we can focus it within the same click without setTimeout
                // (which would let Safari drop the gesture context). Android
                // is unaffected — the call sequence stays equivalent.
                flushSync(() => setMobileSearchOpen(true));
                mobileSearchRef.current?.focus();
              }}
            >
              <SearchIcon />
            </button>
          )}
        </div>
        {/* Mobile expanded search overlay - covers the header content */}
        {mobileSearchOpen && !search && createPortal(
          <div
            className={`${mobileOnly} fixed inset-0 z-[999]`}
            onClick={() => setMobileSearchOpen(false)}
          />,
          document.body
        )}
        {mobileSearchOpen && (
          <div className={`${mobileOnly} absolute inset-0 z-30 flex items-center px-3 gap-2 bg-[var(--bg-card,_var(--bg-primary))] backdrop-blur-xl`}>
            <div className="relative flex-1 min-w-0">
              <input
                ref={mobileSearchRef}
                type="text"
                placeholder={aiAssistantEnabled ? t("searchOrAskAi") : t("search")}
                className={`w-full bg-transparent border border-transparent rounded-lg pl-3 ${aiAssistantEnabled ? "pr-16" : "pr-8"} py-2 text-sm ring-1 ring-slate-400/15 transition-shadow focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    if (search) {
                      setSearch("");
                    } else {
                      setMobileSearchOpen(false);
                    }
                  }
                  if (
                    e.key === "Enter" &&
                    aiAssistantEnabled &&
                    search.trim().length > 0
                  ) {
                    onAiSearch?.(search);
                  }
                }}
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                {aiAssistantEnabled && search.trim().length > 0 && (
                  <button
                    type="button"
                    className="h-6 w-6 rounded-full flex items-center justify-center text-indigo-600 hover:bg-indigo-600/10 transition-colors"
                    onClick={() => onAiSearch?.(search)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M10 21h-3a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v3.5"/><path d="M9 9h1"/><path d="M9 13h2.5"/><path d="M9 17h1"/><path d="M14 21v-4a2 2 0 1 1 4 0v4"/><path d="M14 19h4"/><path d="M21 15v6"/></svg>
                  </button>
                )}
                {search && (
                  <button
                    type="button"
                    aria-label={t("clearSearch")}
                    className="h-5 w-5 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                    onClick={() => { setSearch(""); setMobileSearchOpen(false); }}
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
          <div className={`${desktopOnly} items-center gap-1`}>
            {renderLockBtn()}
            {notificationBellDesktop}
            <button
              onClick={() => onToggleViewMode?.()}
              className={`p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 gk-header-icon-btn ${dark ? "text-blue-400 hover:text-blue-300 focus:ring-blue-500" : "text-blue-600 hover:text-blue-700 focus:ring-blue-400"}`}
              data-tooltip={listView ? t("gridView") : t("listView")}
              aria-label={listView ? t("gridView") : t("listView")}
            >
              {listView ? <GridIcon /> : <ListIcon />}
            </button>
            <button
              onClick={() => toggleDark?.()}
              className={`p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 gk-header-icon-btn ${dark ? "text-amber-400 hover:text-amber-300 focus:ring-amber-500" : "text-indigo-500 hover:text-indigo-700 focus:ring-indigo-400"}`}
              data-tooltip={dark ? t("lightMode") : t("darkMode")}
              aria-label={dark ? t("lightMode") : t("darkMode")}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
            <SyncStatusIcon dark={dark} syncStatus={syncStatus} onSyncNow={handleSyncNow} syncDropdownOpen={syncDropdownOpen} setSyncDropdownOpen={setSyncDropdownOpen} instanceLocked={instanceLocked} />
            <button
              onClick={() => onStartMulti?.()}
              className={`p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 gk-header-icon-btn ${dark ? "text-violet-400 hover:text-violet-300 focus:ring-violet-500" : "text-violet-600 hover:text-violet-700 focus:ring-violet-400"}`}
              data-tooltip={t("multiSelect")}
              aria-label={t("multiSelect")}
            >
              <CheckSquareIcon />
            </button>
            <button
              onClick={() => openSettingsPanel?.()}
              className={`p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 gk-header-icon-btn ${dark ? "text-gray-400 hover:text-gray-200 focus:ring-gray-500" : "text-gray-500 hover:text-gray-700 focus:ring-gray-400"}`}
              data-tooltip={t("settings")}
              aria-label={t("settings")}
            >
              <SettingsIcon />
            </button>
            <span className={`mx-1 w-px h-5 ${dark ? "bg-gray-600" : "bg-slate-400/60"}`} />
            {currentUser?.is_admin && (
              <div className="relative flex items-center justify-center">
                <button
                  onClick={() => openAdminPanel?.()}
                  className={`relative p-2 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 gk-header-icon-btn ${dark ? "text-red-400 hover:text-red-300 focus:ring-red-500" : "text-red-600 hover:text-red-700 focus:ring-red-400"}`}
                  data-tooltip={t("adminPanel")}
                  aria-label={t("adminPanel")}
                >
                  <ShieldIcon />
                  {hasUpdate && (
                    <span
                      aria-hidden="true"
                      className="absolute top-1 right-1 flex items-center justify-center"
                    >
                      <span className="absolute inline-flex w-2.5 h-2.5 rounded-full bg-emerald-400 opacity-75 animate-ping" />
                      <span
                        className={`relative inline-flex w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ${dark ? "ring-gray-800" : "ring-white"}`}
                      />
                    </span>
                  )}
                </button>
              </div>
            )}
            {/* Account button with two-step in-place sign-out. First click
                arms it: the avatar crossfades into a red logout glyph and the
                pseudo turns red. Second click signs out. Disarms on outside
                click / idle timeout (handled in the effect above). */}
            <button
              ref={userBtnRef}
              type="button"
              onClick={() => {
                if (signOutArmed) { signOut?.(); return; }
                setSignOutArmed(true);
              }}
              className={`flex items-center gap-2 rounded-full pl-1 pr-2.5 py-1 transition-colors duration-200 focus:outline-none focus:ring-2 ${
                signOutArmed
                  ? "bg-red-500/10 hover:bg-red-500/[0.15] focus:ring-red-400"
                  : "hover:bg-black/5 dark:hover:bg-white/10 focus:ring-indigo-500"
              }`}
              aria-label={signOutArmed ? t("signOut") : (currentUser?.name || currentUser?.email)}
              data-tooltip={signOutArmed ? t("signOut") : undefined}
            >
              {/* Fixed-size slot: avatar and logout glyph are layered and
                  crossfade + scale between the two states for a smooth swap. */}
              <span className="relative w-7 h-7 shrink-0">
                <span
                  className="absolute inset-0 transition-all duration-300 ease-out"
                  style={{
                    opacity: signOutArmed ? 0 : 1,
                    transform: signOutArmed ? "scale(0.8)" : "scale(1)",
                  }}
                  aria-hidden={signOutArmed}
                >
                  <UserAvatar
                    name={currentUser?.name}
                    email={currentUser?.email}
                    avatarUrl={currentUser?.avatar_url}
                    size="w-7 h-7"
                    textSize="text-xs"
                    dark={dark}
                  />
                </span>
                <span
                  className="absolute inset-0 flex items-center justify-center text-red-500 dark:text-red-400 transition-all duration-300 ease-out pointer-events-none"
                  style={{
                    opacity: signOutArmed ? 1 : 0,
                    transform: signOutArmed ? "scale(1)" : "scale(0.8)",
                  }}
                  aria-hidden={!signOutArmed}
                >
                  <LogOutIcon />
                </span>
              </span>
              <span
                className={`text-sm font-medium transition-colors duration-200 ${
                  signOutArmed
                    ? "text-red-500 dark:text-red-400"
                    : (dark ? "text-gray-200" : "text-gray-700")
                }`}
              >
                {currentUser?.name || currentUser?.email}
              </span>
            </button>
          </div>

          {/* Mobile: bell + sync + (optional QR) + 3-dot menu. When the
              QR quick-action is pinned (qrQuickEnabled), five buttons
              + the title overflow narrow phones, so we tighten the gap
              and per-button padding ONLY in that case. Without the QR,
              the row keeps the original looser spacing. */}
          <div className={`${mobileOnly} flex items-center ${qrQuickEnabled ? "gap-0" : "gap-1"}`}>
            {notificationBellMobile}
            <SyncStatusIcon dark={dark} syncStatus={syncStatus} onSyncNow={handleSyncNow} syncDropdownOpen={syncDropdownOpen} setSyncDropdownOpen={setSyncDropdownOpen} instanceLocked={instanceLocked} />
            {qrQuickEnabled && (
              <button
                type="button"
                onClick={() => onOpenQrScanner?.()}
                className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 text-gray-700 dark:text-gray-200"
                data-tooltip={t("qrSignInRowTitle")}
                aria-label={t("qrSignInRowTitle")}
              >
                {/* Direct inline SVG (rather than <TI.Qrcode/>) so the
                    icon's baseline matches the sibling Kebab / Search /
                    SyncStatus glyphs — TI.* renders inside a <span
                    display:inline-flex> whose vertical-align defaults
                    differ slightly and shift the icon a couple pixels
                    upward in this row. */}
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="4" y="4" width="6" height="6" rx="1" />
                  <rect x="4" y="14" width="6" height="6" rx="1" />
                  <rect x="14" y="4" width="6" height="6" rx="1" />
                  <path d="M14 14h3" />
                  <path d="M14 14v3" />
                  <path d="M17 17h3v3" />
                  <path d="M20 14v.01" />
                  <path d="M14 20h.01" />
                  <path d="M17 20h.01" />
                  <path d="M20 17h.01" />
                  <path d="M20 20h.01" />
                </svg>
              </button>
            )}
            <button
              ref={headerBtnRef}
              onClick={() => setHeaderMenuOpen((v) => !v)}
              className={`relative ${qrQuickEnabled ? "p-1.5" : "p-2"} rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800`}
              data-tooltip={t("menu")}
              aria-haspopup="menu"
              aria-expanded={headerMenuOpen}
            >
              {/* When the menu is open we hide the kebab dots so the
                  dropdown can paint on top of them — keeps the click
                  target where it is (the same button still toggles
                  the menu closed) but removes the visual stutter of
                  the dots peeking behind the dropdown corner. */}
              <span style={{ visibility: headerMenuOpen ? "hidden" : "visible" }}>
                <Kebab />
              </span>
              {hasUpdate && currentUser?.is_admin && (
                <span aria-hidden="true" className="absolute top-1 right-1 flex items-center justify-center">
                  <span className="absolute inline-flex w-2.5 h-2.5 rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className={`relative inline-flex w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ${dark ? "ring-gray-800" : "ring-white"}`} />
                </span>
              )}
            </button>

            {headerMenuOpen && (
              <>
                {/* The dropdown's top is anchored to the kebab button
                    itself on mobile (top-0) so it paints OVER the 3
                    dots — combined with the visibility:hidden on the
                    Kebab glyph above, the menu visually replaces the
                    button. On wider viewports we keep the legacy
                    "hangs below the button" placement.
                    Width hugs the WIDEST single-line item (every row
                    has whitespace-nowrap below) — never narrower than
                    220px on desktop for visual rhythm, never wider
                    than ~95vw so it can't overflow on tiny phones. */}
                <div
                  ref={headerMenuRef}
                  className={`absolute top-0 sm:top-12 right-0 w-max max-w-[95vw] sm:min-w-[220px] sm:max-w-[360px] max-h-[72vh] sm:max-h-[80vh] overflow-y-auto z-[1100] border border-[var(--border-light)] rounded-lg shadow-lg ${dark ? "text-gray-100" : "bg-white text-gray-800"}`}
                  style={{ backgroundColor: dark ? "#222222" : undefined }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className={`flex items-center gap-3 sm:gap-2 w-full text-left px-4 sm:px-3 py-3.5 sm:py-2 text-base sm:text-sm whitespace-nowrap ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      openSettingsPanel?.();
                    }}
                  >
                    <span className={dark ? "text-gray-400" : "text-gray-500"}><SettingsIcon /></span>{t("settings")}</button>
                  <button
                    className={`flex items-center gap-3 sm:gap-2 w-full text-left px-4 sm:px-3 py-3.5 sm:py-2 text-base sm:text-sm whitespace-nowrap ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      onToggleViewMode?.();
                    }}
                  >
                    <span className={dark ? "text-blue-400" : "text-blue-600"}>{listView ? <GridIcon /> : <ListIcon />}</span>
                    {listView ? t("gridView") : t("listView")}
                  </button>
                  <button
                    className={`flex items-center gap-3 sm:gap-2 w-full text-left px-4 sm:px-3 py-3.5 sm:py-2 text-base sm:text-sm whitespace-nowrap ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      toggleDark?.();
                    }}
                  >
                    <span className={dark ? "text-amber-400" : "text-indigo-600"}>{dark ? <SunIcon /> : <MoonIcon />}</span>
                    {dark ? t("lightMode") : t("darkMode")}
                  </button>
                  <button
                    className={`flex items-center gap-3 sm:gap-2 w-full text-left px-4 sm:px-3 py-3.5 sm:py-2 text-base sm:text-sm whitespace-nowrap ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      onStartMulti?.();
                    }}
                  >
                    <span className={dark ? "text-violet-400" : "text-violet-600"}><CheckSquareIcon /></span>{t("multiSelect")}</button>
                  <button
                    className={`flex items-center gap-3 sm:gap-2 w-full text-left px-4 sm:px-3 py-3.5 sm:py-2 text-base sm:text-sm whitespace-nowrap ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      onOpenQrScanner?.();
                    }}
                  >
                    <span className={dark ? "text-teal-400" : "text-teal-600"}><TI.Qrcode style={{ width: "1.5rem", height: "1.5rem" }} /></span>{t("qrScanTitle")}</button>
                  {currentUser?.is_admin && (
                    <button
                      className={`flex items-start gap-3 sm:gap-2 w-full text-left px-4 sm:px-3 py-3.5 sm:py-2 text-base sm:text-sm whitespace-nowrap ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                      onClick={() => {
                        setHeaderMenuOpen(false);
                        openAdminPanel?.();
                      }}
                    >
                      <span className={`relative mt-0.5 shrink-0 ${dark ? "text-red-400" : "text-red-600"}`}>
                        <ShieldIcon />
                        {hasUpdate && (
                          <span aria-hidden="true" className="absolute top-0 right-0 flex items-center justify-center">
                            <span className="absolute inline-flex w-2 h-2 rounded-full bg-emerald-400 opacity-75 animate-ping" />
                            <span className={`relative inline-flex w-2 h-2 rounded-full bg-emerald-500 ring-2 ${dark ? "ring-[#222222]" : "ring-white"}`} />
                          </span>
                        )}
                      </span>
                      <span>{t("adminPanel")}</span>
                    </button>
                  )}
                  {showLockBtn && (
                    <button
                      className={`flex items-center gap-3 sm:gap-2 w-full text-left px-4 sm:px-3 py-3.5 sm:py-2 text-base sm:text-sm whitespace-nowrap ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                      onClick={() => {
                        setHeaderMenuOpen(false);
                        onLockInstance?.();
                      }}
                    >
                      <span className={dark ? "text-red-400" : "text-red-600"}><LockIcon /></span>{t("lockInstanceTooltip")}</button>
                  )}
                  <button
                    className={`flex items-center gap-3 sm:gap-2 w-full text-left px-4 sm:px-3 py-3.5 sm:py-2 text-base sm:text-sm whitespace-nowrap ${dark ? "text-red-400 hover:bg-white/10" : "text-red-600 hover:bg-gray-100"}`}
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
          {/* Hidden Google Keep import input. Accepts the raw Takeout
              .zip (recommended), or any combination of the loose .json
              metadata files and their image attachments — importGKeep
              expands zips and sorts files by extension on its side. */}
          <input
            ref={gkeepFileRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed,application/json,.json,image/*"
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
