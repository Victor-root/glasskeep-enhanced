import React from "react";
import { t } from "../../i18n";
import Masonry from "react-masonry-css";
import NoteCard from "./NoteCard.jsx";

export default function NotesSections({
  pinned,
  others,
  dark,
  openModal,
  togglePin,
  multiMode,
  selectedIds,
  onToggleSelect,
  activeTagFilter,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  isOnline,
  onUpdateChecklistItem,
  currentUser,
  listView,
  notesLoading,
  filteredEmptyWithSearch,
  allEmpty,
  syncStatus,
  windowWidth,
  onEmptyTrash,
}) {
  const maxPreviewItems = windowWidth < 640 ? 4 : 8;
  return (
      <main className="px-4 sm:px-6 md:px-8 lg:px-12 pb-12">
        {activeTagFilter === "TRASHED" && (pinned.length > 0 || others.length > 0) && !multiMode && (
          <div className="flex justify-end mb-4">
            <button
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm font-medium"
              onClick={onEmptyTrash}
            >
              {t("emptyTrash")}
            </button>
          </div>
        )}
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
                    maxPreviewItems={maxPreviewItems}
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
                    maxPreviewItems={maxPreviewItems}
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
                    maxPreviewItems={maxPreviewItems}
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
                    maxPreviewItems={maxPreviewItems}
                  />
                  </div>
                ))}
              </Masonry>
            )}
          </section>
        )}

        {notesLoading && pinned.length + others.length === 0 && (
          <p className="text-center text-gray-500 dark:text-gray-400 mt-10">
            {t("loadingNotes")}
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
  );
}
