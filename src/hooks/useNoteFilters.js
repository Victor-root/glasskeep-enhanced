import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { countTags, filterNotes } from "../utils/noteFilters.js";

/**
 * The lists the notes view renders: the sidebar's tags with their counts
 * and the filtered notes split into pinned / others.
 */
export default function useNoteFilters({ notes, notesAreRegular, search, tagFilter, activeTagFilters }) {
  // The tags come from the regular list, so they stay visible in the
  // archive and trash views.
  const [allNotesForTags, setAllNotesForTags] = useState([]);
  useEffect(() => {
    if (notesAreRegular.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the regular list each time it changes, whatever loaded it
      setAllNotesForTags(notes);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- notesAreRegular is a ref
  }, [notes]);

  const tagsWithCounts = useMemo(() => countTags(allNotesForTags), [allNotesForTags]);

  // Deferred so fast typing stays responsive: the input updates at once,
  // the grid re-filter runs as a non-urgent update.
  const deferredSearch = useDeferredValue(search);
  const filtered = useMemo(
    () => filterNotes(notes, { query: deferredSearch, tagFilter, activeTagFilters }),
    [notes, deferredSearch, tagFilter, activeTagFilters],
  );
  const pinned = useMemo(() => filtered.filter((n) => n.pinned), [filtered]);
  const others = useMemo(() => filtered.filter((n) => !n.pinned), [filtered]);
  const filteredEmptyWithSearch =
    filtered.length === 0 &&
    notes.length > 0 &&
    !!(deferredSearch || (tagFilter && tagFilter !== "ARCHIVED" && tagFilter !== "TRASHED") || activeTagFilters.length > 0);
  const allEmpty = notes.length === 0;

  return { tagsWithCounts, pinned, others, filteredEmptyWithSearch, allEmpty };
}
