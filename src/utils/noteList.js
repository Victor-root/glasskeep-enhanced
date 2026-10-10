// Ordering and view-membership rules shared by every place that rebuilds
// the notes list (loaders, sync reconciliation, live server events).

// Pinned first, then by position (server-persisted DnD), falling back to
// updated_at/timestamp when position is missing.
export function sortNotesByRecency(arr) {
  try {
    const list = Array.isArray(arr) ? arr.slice() : [];
    return list.sort((a, b) => {
      const ap = a?.pinned ? 1 : 0;
      const bp = b?.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const apos = Number.isFinite(+a?.position) ? +a.position : null;
      const bpos = Number.isFinite(+b?.position) ? +b.position : null;
      if (
        apos != null &&
        bpos != null &&
        !Number.isNaN(apos) &&
        !Number.isNaN(bpos)
      ) {
        const posDiff = bpos - apos;
        if (posDiff !== 0) return posDiff; // higher position first (most recent/top)
      }
      const at = new Date(a?.updated_at || a?.timestamp || 0).getTime();
      const bt = new Date(b?.updated_at || b?.timestamp || 0).getTime();
      return bt - at;
    });
  } catch {
    return Array.isArray(arr) ? arr : [];
  }
}

// Order used by "reset note order": pinned first, then most recently
// updated, then most recently created.
export function sortNotesForOrderReset(arr) {
  return arr.slice().sort((a, b) => {
    const ap = a?.pinned ? 1 : 0;
    const bp = b?.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const aUpd = new Date(a?.updated_at || a?.timestamp || 0).getTime();
    const bUpd = new Date(b?.updated_at || b?.timestamp || 0).getTime();
    if (aUpd !== bUpd) return bUpd - aUpd;
    const aCre = new Date(a?.created_at || 0).getTime();
    const bCre = new Date(b?.created_at || 0).getTime();
    return bCre - aCre;
  });
}

// Whether a note belongs in the list shown for the given view filter
// (null / a tag = active notes, "ARCHIVED", "TRASHED").
export function noteBelongsInView(note, filter) {
  const archived = !!note.archived;
  const trashed = !!note.trashed;
  return (
    (filter === "ARCHIVED" && archived && !trashed) ||
    (filter === "TRASHED" && trashed) ||
    ((!filter || (filter !== "ARCHIVED" && filter !== "TRASHED")) && !archived && !trashed)
  );
}

// Position a note restored from the trash takes among the active notes
// (sorted by position DESC), so it lands at its chronological spot by
// creation timestamp.
export function computeRestoredPosition(note, activeSortedDesc) {
  if (activeSortedDesc.length === 0) return note.position;
  const noteTs = new Date(note.timestamp).getTime() || 0;
  let insertIdx = activeSortedDesc.length;
  for (let i = 0; i < activeSortedDesc.length; i++) {
    const ts = new Date(activeSortedDesc[i].timestamp).getTime() || 0;
    if (noteTs >= ts) { insertIdx = i; break; }
  }
  if (insertIdx === 0) {
    return (+activeSortedDesc[0].position || 0) + 1;
  }
  if (insertIdx >= activeSortedDesc.length) {
    return (+activeSortedDesc[activeSortedDesc.length - 1].position || 0) - 1;
  }
  return ((+activeSortedDesc[insertIdx - 1].position || 0) + (+activeSortedDesc[insertIdx].position || 0)) / 2;
}

export function sortByPositionDesc(notes) {
  return notes.slice().sort((a, b) => (+b.position || 0) - (+a.position || 0));
}
