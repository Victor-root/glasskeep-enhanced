import { uid } from "./helpers.js";

/**
 * Checklist data model
 * ====================
 *
 * A checklist is persisted as a single flat `items` array on the note
 * (same field that already existed — 100% backward-compatible).
 *
 * Two entry kinds coexist in the array:
 *
 *   Regular item (legacy shape, still the default):
 *     { id, text, done }
 *
 *   Section header (new, optional):
 *     { id, kind: "section", title }
 *
 * Rules:
 *   - The array order IS the logical order. We never reshuffle on
 *     toggle, so unchecking an item restores it to its original slot
 *     "for free".
 *   - Items before the first section marker belong to the implicit
 *     default (untitled) section.
 *   - Items after a section marker belong to that section until the
 *     next section marker.
 *   - Rendering decides where checked items appear (grouped at the
 *     bottom), but the underlying array stays stable.
 *
 * This means old notes with only `{id, text, done}` entries load as a
 * single-section checklist with no header — exactly the previous UX.
 */

export const SECTION_KIND = "section";

export const isSection = (entry) => !!entry && entry.kind === SECTION_KIND;
export const isItem = (entry) => !!entry && entry.kind !== SECTION_KIND;

export const makeItem = (text = "", done = false) => ({
  id: uid(),
  text,
  done: !!done,
});

export const makeSection = (title = "") => ({
  id: uid(),
  kind: SECTION_KIND,
  title,
});

/**
 * Defensive normalization. Accepts anything the server or legacy storage
 * might hand us and returns a clean array of entries.
 */
export function normalizeItems(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    if (isSection(e)) {
      const id = e.id || uid();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, kind: SECTION_KIND, title: typeof e.title === "string" ? e.title : "" });
    } else {
      const id = e.id || uid();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        text: typeof e.text === "string" ? e.text : "",
        done: !!e.done,
      });
    }
  }
  return out;
}

/**
 * Walk entries and emit logical sections. Always emits a leading default
 * section (id: DEFAULT_SECTION_ID) so callers can treat the list
 * uniformly.
 */
export const DEFAULT_SECTION_ID = "__default__";

export function getSections(entries) {
  const arr = Array.isArray(entries) ? entries : [];
  const sections = [{ id: DEFAULT_SECTION_ID, title: "", items: [] }];
  for (const e of arr) {
    if (isSection(e)) {
      sections.push({ id: e.id, title: e.title || "", items: [] });
    } else if (isItem(e)) {
      sections[sections.length - 1].items.push(e);
    }
  }
  return sections;
}

/** Returns the section id an item with the given id belongs to (walking markers before it). */
export function sectionIdForItem(entries, itemId) {
  const arr = Array.isArray(entries) ? entries : [];
  let current = DEFAULT_SECTION_ID;
  for (const e of arr) {
    if (isSection(e)) current = e.id;
    else if (e.id === itemId) return current;
  }
  return null;
}

/** Insert a new item right after the entry with id=afterId. */
export function insertAfter(entries, afterId, newEntry) {
  const arr = entries.slice();
  const idx = arr.findIndex((e) => e.id === afterId);
  if (idx === -1) {
    arr.push(newEntry);
    return arr;
  }
  arr.splice(idx + 1, 0, newEntry);
  return arr;
}

/** Insert a new item at the end of the section containing anchorId. */
export function insertAtSectionEnd(entries, sectionId, newEntry) {
  const arr = entries.slice();
  // Walk entries, find range of target section, append before the next
  // section marker (or at the end).
  let inSection = sectionId === DEFAULT_SECTION_ID;
  let insertIdx = arr.length;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (isSection(e)) {
      if (inSection) {
        insertIdx = i;
        break;
      }
      if (e.id === sectionId) inSection = true;
    }
  }
  arr.splice(insertIdx, 0, newEntry);
  return arr;
}

/** Insert a new item at the start of the given section (right after the section marker). */
export function insertAtSectionStart(entries, sectionId, newEntry) {
  const arr = entries.slice();
  if (sectionId === DEFAULT_SECTION_ID) {
    // Default section = everything before the first explicit section.
    // Place at the very beginning (or after any leading section marker,
    // but for DEFAULT there isn't one).
    arr.splice(0, 0, newEntry);
    return arr;
  }
  const markerIdx = arr.findIndex((e) => isSection(e) && e.id === sectionId);
  if (markerIdx === -1) {
    arr.push(newEntry);
    return arr;
  }
  arr.splice(markerIdx + 1, 0, newEntry);
  return arr;
}

export function insertAtTop(entries, newEntry) {
  // Insert before the first item, but AFTER any leading section markers
  // so default items remain in the default section. If the list starts
  // with a section, we insert inside that section.
  const arr = entries.slice();
  let idx = 0;
  // If the first entry is already a section, insert inside it.
  // Otherwise insert at position 0 (default section).
  if (arr.length > 0 && isSection(arr[0])) idx = 1;
  arr.splice(idx, 0, newEntry);
  return arr;
}

export function insertAtBottom(entries, newEntry) {
  return [...entries, newEntry];
}

/** Remove an entry by id. Removing a section keeps its items (they merge into the previous section). */
export function removeEntry(entries, id) {
  return entries.filter((e) => e.id !== id);
}

export function updateEntry(entries, id, patch) {
  return entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
}

/**
 * Returns the previous focusable entry (non-section item) before the
 * entry with id=itemId, or null.
 */
export function findPrevItemId(entries, itemId) {
  const arr = Array.isArray(entries) ? entries : [];
  let last = null;
  for (const e of arr) {
    if (e.id === itemId) return last;
    if (isItem(e)) last = e.id;
  }
  return null;
}

/**
 * Returns the next focusable entry (non-section item) after the entry
 * with id=itemId, or null.
 */
export function findNextItemId(entries, itemId) {
  const arr = Array.isArray(entries) ? entries : [];
  let found = false;
  for (const e of arr) {
    if (found && isItem(e)) return e.id;
    if (e.id === itemId) found = true;
  }
  return null;
}

/** True if the entries array contains at least one section marker. */
export function hasSections(entries) {
  return Array.isArray(entries) && entries.some(isSection);
}

/** Total count of regular items (used by cards). */
export function countItems(entries) {
  if (!Array.isArray(entries)) return 0;
  return entries.reduce((n, e) => (isItem(e) ? n + 1 : n), 0);
}

/** Count of checked items. */
export function countChecked(entries) {
  if (!Array.isArray(entries)) return 0;
  return entries.reduce((n, e) => (isItem(e) && e.done ? n + 1 : n), 0);
}
