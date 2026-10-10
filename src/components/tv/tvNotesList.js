import { getContentImages } from "../../utils/noteIcon.js";

// What the TV home screen lists, and in how many masonry columns.

function sortNotes(list) {
  return [...list].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    const at = a.updated_at || a.created_at || "";
    const bt = b.updated_at || b.created_at || "";
    return bt.localeCompare(at);
  });
}

export function partitionNotes(notes, filter) {
  const list = notes.filter((n) => {
    if (!n) return false;
    if (n.archived || n.trashed) return false;
    if (!filter || filter.type === "all") return true;
    if (filter.type === "images") return getContentImages(n.images).length > 0;
    if (filter.type === "tag") return Array.isArray(n.tags) && n.tags.includes(filter.value);
    return true;
  });
  return sortNotes(list);
}

// Column count from viewport width: independent of sidebar state so
// toggling the rail doesn't force the masonry to re-bucket every card
// (the root cause of the 3-4s freeze on older Shields). With ~7 cols
// at 1080p, each card still gets a comfortable ~220-260px regardless
// of whether the sidebar is open.
export function pickColumnCount(width) {
  if (width < 700) return 2;
  if (width < 950) return 3;
  if (width < 1200) return 4;
  if (width < 1500) return 5;
  if (width < 1800) return 6;
  return 7;
}
