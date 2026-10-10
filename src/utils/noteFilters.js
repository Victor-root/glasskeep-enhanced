// The notes view's filters: tag selection, special views and search.
import { ALL_IMAGES, REMINDERS } from "./constants.js";

const isSpecialView = (tagFilter) =>
  tagFilter === "ARCHIVED" || tagFilter === "TRASHED" || tagFilter === ALL_IMAGES || tagFilter === REMINDERS;

// Tags pre-filled on a note created while a filter is active, so the new
// note still matches it: the selected tags (OR filter), or a tag held by
// tagFilter itself (defensive, the sidebar never sets one there). None in
// the special views.
export function initialTagsForNewNote(tagFilter, activeTagFilters) {
  if (isSpecialView(tagFilter)) return [];
  const collected = [];
  if (Array.isArray(activeTagFilters) && activeTagFilters.length > 0) {
    collected.push(...activeTagFilters);
  } else if (typeof tagFilter === "string" && tagFilter) {
    collected.push(tagFilter);
  }
  const seen = new Set();
  const out = [];
  for (const tag of collected) {
    const key = String(tag).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(String(tag));
  }
  return out;
}

// Every tag of the notes with its number of notes, sorted by name.
export function countTags(notes) {
  const map = new Map();
  for (const n of notes) {
    for (const tag of n.tags || []) {
      const key = String(tag).trim();
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()));
}

// The notes shown for a view filter, tag selection and search query.
export function filterNotes(notes, { query, tagFilter, activeTagFilters }) {
  const q = query.toLowerCase();
  const tag = isSpecialView(tagFilter) ? null : tagFilter?.toLowerCase() || null;

  return notes.filter((n) => {
    if (tagFilter === ALL_IMAGES) {
      if (!(n.images && n.images.length)) return false;
    } else if (tagFilter === "ARCHIVED" || tagFilter === "TRASHED") {
      // Already filtered by the server: only the search applies.
    } else if (tagFilter === REMINDERS) {
      // A client-side lens over the regular list: the notes with a
      // reminder, which stay in the normal view too.
      if (!n.reminderAt) return false;
    } else if (activeTagFilters.length > 0) {
      // Multi-tag filter: at least one of the selected tags.
      const noteTags = (n.tags || []).map((x) => String(x).toLowerCase());
      if (!activeTagFilters.some((f) => noteTags.includes(f.toLowerCase()))) {
        return false;
      }
    } else if (
      tag &&
      !(n.tags || []).some((x) => String(x).toLowerCase() === tag)
    ) {
      return false;
    }
    if (!q) return true;
    const title = (n.title || "").toLowerCase();
    const content = (n.content || "").toLowerCase();
    const tagsStr = (n.tags || []).join(" ").toLowerCase();
    const items = (n.items || [])
      .map((i) => i.text)
      .join(" ")
      .toLowerCase();
    const images = (n.images || [])
      .map((im) => im.name)
      .join(" ")
      .toLowerCase();
    return (
      title.includes(q) ||
      content.includes(q) ||
      tagsStr.includes(q) ||
      items.includes(q) ||
      images.includes(q)
    );
  });
}
