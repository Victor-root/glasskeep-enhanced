import React from "react";
import { t } from "../../i18n";
import NoteCard from "./NoteCard.jsx";
import NotesGrid from "./NotesGrid.jsx";
import { REMINDERS } from "../../utils/constants.js";

const GAP_X = 12;
const LIST_GAP = 24;
// Columns by window width, as the grid always had.
const BREAKPOINTS = [[767, 2], [1089, 3], [1339, 4], [1587, 5], [1835, 6]];
const gridColumns = (width) => (BREAKPOINTS.find(([max]) => width <= max) || [0, 7])[1];

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
  onReorder,
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
  const renderCard = (n) => (
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
      currentUser={currentUser}
      maxPreviewItems={maxPreviewItems}
    />
  );
  const columns = listView ? 1 : gridColumns(windowWidth);
  const renderGroup = (notes, group) => {
    const grid = (
      <NotesGrid
        notes={notes}
        columns={columns}
        gapX={GAP_X}
        gapY={listView ? LIST_GAP : windowWidth < 640 ? 8 : 12}
        canDrag={!multiMode}
        renderCard={renderCard}
        onReorder={(ids) => onReorder(group, ids)}
      />
    );
    return listView ? <div className="max-w-2xl mx-auto">{grid}</div> : grid;
  };

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
            {renderGroup(pinned, "pinned")}
          </section>
        )}

        {others.length > 0 && (
          <section>
            {pinned.length > 0 && renderLabel("others")}
            {renderGroup(others, "others")}
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
// useStableCallback handlers + value-stable state), so the grid no longer
// re-renders when App re-renders for unrelated reasons (a toast auto-dismissing, opening
// a modal/panel, typing in the composer). It still updates when notes,
// selection, dark mode, sync status, etc. actually change.
export default React.memo(NotesSections);
