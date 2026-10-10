import React from "react";
import { createPortal, flushSync } from "react-dom";
import { t } from "../../i18n";
import { SearchIcon, AskAiIcon } from "../../icons/index.jsx";
import { usePresence } from "../../hooks/usePresence.js";

// Matches the closing fold of .gk-mobile-search in globalCSS, plus a
// margin in case transitionend never fires.
const SEARCH_EXIT_MS = 260;

// Mobile: search icon of the notes header that unfolds into a search bar
// over the whole header. `headerRef` is the header the bar unfolds in.
export default function MobileHeaderSearch({
  headerRef,
  mobileOnly,
  qrQuickEnabled,
  mobileSearchOpen,
  setMobileSearchOpen,
  mobileSearchRef,
  search,
  setSearch,
  aiAssistantEnabled,
  onAiSearch,
}) {
  const searchBarRef = React.useRef(null);
  const searchPresence = usePresence(mobileSearchOpen, searchBarRef, SEARCH_EXIT_MS);
  // Header x of the search icon, where the bar unfolds from and folds back to.
  const [searchOrigin, setSearchOrigin] = React.useState(null);

  return (
    <>
      <div className={`${mobileOnly} flex items-center ml-auto mr-1`}>
        {!mobileSearchOpen && (
          <button
            type="button"
            className={`${qrQuickEnabled ? "p-1.5" : "p-2"} rounded-full hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-600 dark:text-gray-300`}
            aria-label={t("search")}
            onClick={(e) => {
              const header = headerRef.current.getBoundingClientRect();
              const btn = e.currentTarget.getBoundingClientRect();
              setSearchOrigin(btn.left + btn.width / 2 - header.left);
              // iOS Safari only opens the soft keyboard when focus() is
              // called synchronously inside the user-gesture handler.
              // flushSync forces React to mount the input immediately so
              // we can focus it within the same click without setTimeout
              // (which would let Safari drop the gesture context). Android
              // is unaffected, the call sequence stays equivalent.
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
      {/* Mobile search bar: unfolds left and right from the search icon
          over the whole header (.gk-mobile-search). */}
      {(mobileSearchOpen || searchPresence.mounted) && (
        <div
          ref={searchBarRef}
          className={`${mobileOnly} gk-mobile-search absolute inset-0 z-30 flex items-center gap-3 ${qrQuickEnabled ? "px-3" : "px-4"}`}
          data-state={searchPresence.shown ? "open" : "closed"}
          style={searchOrigin == null ? undefined : { "--gk-search-origin": `${searchOrigin}px` }}
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget && !mobileSearchOpen) searchPresence.unmount();
          }}
        >
          <span className="shrink-0 text-[var(--gk-chrome-accent)]" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            ref={mobileSearchRef}
            type="text"
            placeholder={aiAssistantEnabled ? t("searchOrAskAi") : t("search")}
            className="flex-1 min-w-0 h-full bg-transparent border-0 text-lg outline-none focus:outline-none focus:ring-0 placeholder-gray-500 dark:placeholder-gray-400"
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
          {aiAssistantEnabled && search.trim().length > 0 && (
            <button
              type="button"
              className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-indigo-600 hover:bg-indigo-600/10 transition-colors"
              onClick={() => onAiSearch?.(search)}
            >
              <AskAiIcon size="20" />
            </button>
          )}
          {search && (
            <button
              type="button"
              aria-label={t("clearSearch")}
              className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-2xl leading-none text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
              onClick={() => { setSearch(""); setMobileSearchOpen(false); }}
            >
              ×
            </button>
          )}
        </div>
      )}
    </>
  );
}
