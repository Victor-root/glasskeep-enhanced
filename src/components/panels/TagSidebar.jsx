import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { t } from "../../i18n";
import { SearchIcon, CloseIcon } from "../../icons/index.jsx";
import { ALL_IMAGES } from "../../utils/constants.js";

import { NotesIcon, ImagesIcon, ArchiveSidebarIcon, TrashSidebarIcon, TagIcon } from "../../icons/sidebarIcons.jsx";
export { NotesIcon, ImagesIcon, ArchiveSidebarIcon, TrashSidebarIcon, TagIcon };

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
        className={`fixed top-0 left-0 z-40 h-full shadow-2xl ${skipTransition ? "" : "transition-transform duration-200 "}${permanent || open ? "translate-x-0" : "-translate-x-full"}`}
        style={{
          width: permanent ? `${width}px` : "288px",
          backgroundColor: dark ? "#222222" : "rgba(240,232,255,0.97)",
          borderRight: "1px solid var(--border-light)",
        }}
        aria-hidden={!(permanent || open)}
      >
        <div className="p-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t("tags")}</h3>
          <button
            className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
            data-tooltip={t("close")}
          >
            <CloseIcon />
          </button>
        </div>
        <nav className="p-2 overflow-y-auto h-[calc(100%-56px)]">
          {/* Notes (All) */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md mb-1 flex items-center gap-3 ${isAllNotes ? (dark ? "bg-white/10" : "bg-black/5") : dark ? "hover:bg-white/10" : "hover:bg-black/5"}`}
            onClick={() => {
              onSelect(null);
              if (!permanent) onClose();
            }}
          ><NotesIcon />{t("notesAll")}</button>

          {/* All Images */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md mb-2 flex items-center gap-3 ${isAllImages ? (dark ? "bg-white/10" : "bg-black/5") : dark ? "hover:bg-white/10" : "hover:bg-black/5"}`}
            onClick={() => {
              onSelect(ALL_IMAGES);
              if (!permanent) onClose();
            }}
          ><ImagesIcon />{t("allImages")}</button>

          {/* Archived Notes */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md mb-2 flex items-center gap-3 ${activeTag === "ARCHIVED" ? (dark ? "bg-white/10" : "bg-black/5") : dark ? "hover:bg-white/10" : "hover:bg-black/5"}`}
            onClick={() => {
              onSelect("ARCHIVED");
              if (!permanent) onClose();
            }}
          ><ArchiveSidebarIcon />{t("archivedNotes")}</button>

          {/* Trash */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md mb-2 flex items-center gap-3 ${activeTag === "TRASHED" ? (dark ? "bg-white/10" : "bg-black/5") : dark ? "hover:bg-white/10" : "hover:bg-black/5"}`}
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
                className={`w-full text-left px-3 py-2 rounded-md mb-1 flex items-center justify-between cursor-pointer ${active ? (dark ? "bg-white/10" : "bg-black/5") : dark ? "hover:bg-white/10" : "hover:bg-black/5"}`}
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
          {activeTagFilters.length > 1 && (
            <div className="px-3 py-1 mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between">
              <span>🔀 {activeTagFilters.length} tags actifs</span>
              <button
                onClick={() => onSelect(null)}
                className="text-xs underline hover:no-underline cursor-pointer"
              >tout effacer</button>
            </div>
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
