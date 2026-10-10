import React from "react";
import { t } from "../../i18n";
import Masonry from "react-masonry-css";
import NoteCard from "./NoteCard.jsx";
import { REMINDERS } from "../../utils/constants.js";

function NotesSections({
  pinned,
  others,
  dark,
  openModal,
  togglePin,
  multiMode,
  selectedIds,
  onToggleSelect,
  onCtrlSelect,
  activeTagFilter,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
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
  const disablePin =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    activeTagFilter === "ARCHIVED" || activeTagFilter === "TRASHED";

  // The pinned and other notes render alike: a section label, then the
  // cards as a list or as the masonry grid.
  const renderLabel = (labelKey) => (listView ? (
    <div className="max-w-2xl mx-auto">
      <h2 className="gk-section-label text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
        {t(labelKey)}
      </h2>
    </div>
  ) : (
    <h2 className="gk-section-label text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
      {t(labelKey)}
    </h2>
  ));
  const renderCards = (notes) => notes.map((n) => (
    <div key={n.id}>
      <NoteCard
        n={n}
        dark={dark}
        openModal={openModal}
        togglePin={togglePin}
        multiMode={multiMode}
        selected={selectedIds.includes(String(n.id))}
        onToggleSelect={onToggleSelect}
        onCtrlSelect={onCtrlSelect}
        disablePin={disablePin}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        currentUser={currentUser}
        maxPreviewItems={maxPreviewItems}
      />
    </div>
  ));
  const renderGroup = (notes) => (listView ? (
    <div className="max-w-2xl mx-auto space-y-6">
      {renderCards(notes)}
    </div>
  ) : (
    <Masonry
      breakpointCols={{default: 7, 1835: 6, 1587: 5, 1339: 4, 1089: 3, 767: 2}}
      className="masonry-grid"
      columnClassName="masonry-grid-column"
    >
      {renderCards(notes)}
    </Masonry>
  ));

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
            {renderLabel("pinned")}
            {renderGroup(pinned)}
          </section>
        )}

        {others.length > 0 && (
          <section>
            {pinned.length > 0 && renderLabel("others")}
            {renderGroup(others)}
          </section>
        )}

        {notesLoading && pinned.length + others.length === 0 && (
          <p className="text-center text-gray-500 dark:text-gray-400 mt-10">
            {t("loadingNotes")}
          </p>
        )}
        {!notesLoading && filteredEmptyWithSearch && (
          <p className="text-center text-gray-500 dark:text-gray-400 mt-10">
            {activeTagFilter === REMINDERS ? t("noRemindersYet") : t("noMatchingNotes")}
          </p>
        )}
        {!notesLoading && allEmpty && (
          <div className="text-center mt-10 px-4">
            <p className="text-gray-500 dark:text-gray-400">
              {activeTagFilter === "TRASHED" ? t("noTrashedNotes") : activeTagFilter === "ARCHIVED" ? t("noMatchingNotes") : activeTagFilter === REMINDERS ? t("noRemindersYet") : t("noNotesYet")}
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

// Memoized: all props are referentially stable (memoized pinned/others +
// useStableCallback handlers + value-stable state), so the grid — and
// react-masonry-css's per-render column redistribution — no longer re-runs
// when App re-renders for unrelated reasons (a toast auto-dismissing, opening
// a modal/panel, typing in the composer). It still updates when notes,
// selection, dark mode, sync status, etc. actually change.
export default React.memo(NotesSections);
