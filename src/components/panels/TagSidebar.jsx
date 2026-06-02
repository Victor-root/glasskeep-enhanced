import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { t } from "../../i18n";
import { SearchIcon, CloseIcon } from "../../icons/index.jsx";
import { ALL_IMAGES, REMINDERS } from "../../utils/constants.js";

import { NotesIcon, ImagesIcon, ArchiveSidebarIcon, TrashSidebarIcon, TagIcon, RemindersSidebarIcon } from "../../icons/sidebarIcons.jsx";
export { NotesIcon, ImagesIcon, ArchiveSidebarIcon, TrashSidebarIcon, TagIcon, RemindersSidebarIcon };

export default function TagSidebar({
  open,
  onClose,
  tagsWithCounts,
  activeTag,
  activeTagFilters = [],
  onSelect,
  dark,
  permanent = false,
  width = 288,
  onResize,
}) {
  const isAllNotes = activeTag === null && activeTagFilters.length === 0;
  const isAllImages = activeTag === ALL_IMAGES;

  // Active / hover styling for sidebar entries — driven by the chrome theme
  // tokens (see .gk-side-item in globalCSS) so they follow the workspace
  // theme and the glass identity in both light and dark.
  const itemClass = (active) =>
    active ? "gk-side-item gk-side-item--active" : "gk-side-item";

  // Long-press support for multi-tag selection on touch devices
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);

  const handleTagTouchStart = (tag) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      onSelect(tag, { ctrlKey: true });
    }, 500);
  };
  const handleTagTouchEnd = () => clearTimeout(longPressTimer.current);

  // Suppress slide animation when sidebar first becomes permanent (server load)
  const hasBeenPermanentRef = useRef(permanent);
  const [skipTransition, setSkipTransition] = useState(false);
  useLayoutEffect(() => {
    if (permanent && !hasBeenPermanentRef.current) {
      hasBeenPermanentRef.current = true;
      setSkipTransition(true);
    }
  }, [permanent]);
  useEffect(() => {
    if (skipTransition) {
      // Re-enable transitions after the browser has painted the instant position
      requestAnimationFrame(() => setSkipTransition(false));
    }
  }, [skipTransition]);

  return (
    <>
      {open && !permanent && (
        <div
          className="fixed inset-0 z-30 bg-black/30"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        />
      )}
      <aside
        className={`gk-sidebar fixed top-0 left-0 z-40 h-full ${skipTransition ? "" : "transition-[transform,background-color] duration-200 "}${permanent || open ? "translate-x-0" : "-translate-x-full"}`}
        style={{
          // Visuals (background, border, glass shadow) live in the .gk-sidebar
          // CSS rule so they follow the chrome theme tokens; only layout here.
          width: permanent ? `${width}px` : "288px",
          paddingTop: "var(--safe-top)",
          paddingBottom: "var(--safe-bottom)",
          paddingLeft: "var(--safe-left)",
        }}
        aria-hidden={!(permanent || open)}
      >
        <div className="px-4 flex items-center justify-between h-[var(--gk-header-h,56px)] shrink-0">
          <h3 className="text-lg font-semibold">{t("tags")}</h3>
          <button
            className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
            data-tooltip={t("close")}
          >
            <CloseIcon />
          </button>
        </div>
        <nav className="p-2 overflow-y-auto h-[calc(100%-var(--gk-header-h,56px))]">
          {/* Multi-tag filter indicator — at the top so it's impossible to miss */}
          {activeTagFilters.length > 1 && (
            <div
              className={`mx-1 mb-3 rounded-lg border px-3 py-2 flex items-center gap-2 ${
                dark
                  ? "bg-indigo-500/15 border-indigo-400/40 text-indigo-200"
                  : "bg-indigo-100/90 border-indigo-300 text-indigo-800"
              }`}
            >
              <svg
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <span className="text-sm font-semibold flex-1">
                {t("activeTagFiltersCount", { count: activeTagFilters.length })}
              </span>
              <button
                onClick={() => onSelect(null)}
                className={`text-xs font-medium px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                  dark
                    ? "hover:bg-indigo-400/20 text-indigo-200"
                    : "hover:bg-indigo-200 text-indigo-700"
                }`}
              >
                {t("clearTagFilters")}
              </button>
            </div>
          )}

          {/* Notes (All) */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md mb-1 flex items-center gap-3 transition-colors ${itemClass(isAllNotes)}`}
            onClick={() => {
              onSelect(null);
              if (!permanent) onClose();
            }}
          ><NotesIcon />{t("notesAll")}</button>

          {/* All Images */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md mb-2 flex items-center gap-3 transition-colors ${itemClass(isAllImages)}`}
            onClick={() => {
              onSelect(ALL_IMAGES);
              if (!permanent) onClose();
            }}
          ><ImagesIcon />{t("allImages")}</button>

          {/* Archived Notes */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md mb-2 flex items-center gap-3 transition-colors ${itemClass(activeTag === "ARCHIVED")}`}
            onClick={() => {
              onSelect("ARCHIVED");
              if (!permanent) onClose();
            }}
          ><ArchiveSidebarIcon />{t("archivedNotes")}</button>

          {/* Reminders — a filtered view over the regular notes (notes
              that carry a reminder), not a separate folder. */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md mb-2 flex items-center gap-3 transition-colors ${itemClass(activeTag === REMINDERS)}`}
            onClick={() => {
              onSelect(REMINDERS);
              if (!permanent) onClose();
            }}
          ><RemindersSidebarIcon />{t("remindersNotes")}</button>

          {/* Trash */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md mb-2 flex items-center gap-3 transition-colors ${itemClass(activeTag === "TRASHED")}`}
            onClick={() => {
              onSelect("TRASHED");
              if (!permanent) onClose();
            }}
          ><TrashSidebarIcon />{t("trashedNotes")}</button>

          {/* User tags */}
          {tagsWithCounts.map(({ tag, count }) => {
            const active =
              activeTagFilters.length > 0
                ? activeTagFilters.map((t) => t.toLowerCase()).includes(tag.toLowerCase())
                : typeof activeTag === "string" &&
                  activeTag !== ALL_IMAGES &&
                  activeTag.toLowerCase() === tag.toLowerCase();
            return (
              <button
                key={tag}
                className={`w-full text-left px-3 py-2 rounded-md mb-1 flex items-center justify-between cursor-pointer transition-colors ${itemClass(active)}`}
                onClick={(e) => {
                  if (longPressTriggered.current) {
                    longPressTriggered.current = false;
                    return;
                  }
                  onSelect(tag, e);
                  // Ne ferme la sidebar que si c'est un clic simple et pas en mode permanent
                  if (!permanent && !e.ctrlKey && !e.metaKey) {
                    onClose();
                  }
                }}
                onTouchStart={() => handleTagTouchStart(tag)}
                onTouchEnd={handleTagTouchEnd}
                onTouchCancel={handleTagTouchEnd}
              >
                <span className="flex items-center gap-2 truncate"><TagIcon />{tag}</span>
                <span className="text-xs opacity-70">{count}</span>
              </button>
            );
          })}
          {tagsWithCounts.length === 0 && (
            <p className="text-sm text-gray-500 mt-2">{t("noTagsYet")}</p>
          )}
        </nav>

        {/* Resize handle - only show when permanent */}
        {permanent && (
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startWidth = width;

              const handleMouseMove = (moveEvent) => {
                const newWidth = Math.max(
                  200,
                  Math.min(500, startWidth + (moveEvent.clientX - startX)),
                );
                onResize(newWidth);
              };

              const handleMouseUp = () => {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
              };

              document.addEventListener("mousemove", handleMouseMove);
              document.addEventListener("mouseup", handleMouseUp);
              document.body.style.cursor = "ew-resize";
              document.body.style.userSelect = "none";
            }}
          />
        )}
      </aside>
    </>
  );
}
