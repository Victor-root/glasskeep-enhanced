import { useState } from "react";

// On desktop the notes list scrolls inside .notes-scroll-area (so its
// scrollbar starts below the sticky header) instead of the document; on
// mobile that element keeps overflow:visible and the window scrolls.
const getNotesScrollTarget = () => {
  const el = document.querySelector(".notes-scroll-area");
  return el && getComputedStyle(el).overflowY === "auto" ? el : null;
};

// Top padding of the shim, which grows while the selection dock shows.
const getShimPadding = () => {
  const shim = document.querySelector(".multi-select-content-shim");
  return shim ? parseFloat(getComputedStyle(shim).paddingTop) || 0 : 0;
};

// Applies a mode change, then scrolls by exactly what the shim's padding
// gained or lost, so the visible notes stay where they were. Only the
// change counts: on desktop the shim already has a base padding.
const keepContentInPlace = (applyChange) => {
  const scrollEl = getNotesScrollTarget();
  const scrollX = scrollEl ? scrollEl.scrollLeft : window.scrollX;
  const scrollY = scrollEl ? scrollEl.scrollTop : window.scrollY;
  const padBefore = getShimPadding();
  applyChange();
  requestAnimationFrame(() => {
    const delta = getShimPadding() - padBefore;
    if (!delta) return;
    const target = { left: scrollX, top: Math.max(0, scrollY + delta), behavior: "instant" };
    if (scrollEl) scrollEl.scrollTo(target);
    else window.scrollTo(target);
  });
};

/**
 * Multi-select mode of the notes grid. Entering and leaving it keeps the
 * visible content in place although the selection dock adds (then
 * removes) a top padding to the content.
 */
export default function useMultiSelect({ setFabOpen }) {
  const [multiMode, setMultiMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]); // array of string ids
  const onStartMulti = () => {
    // Toggle: a second click on the multi-select button closes the bar.
    if (multiMode) { onExitMulti(); return; }
    keepContentInPlace(() => {
      setMultiMode(true);
      setSelectedIds([]);
      setFabOpen(false); // dock lives at bottom; close FAB to avoid overlap
    });
  };
  const onExitMulti = () => {
    keepContentInPlace(() => {
      setMultiMode(false);
      setSelectedIds([]);
    });
  };
  const onToggleSelect = (id, checked) => {
    const sid = String(id);
    setSelectedIds((prev) =>
      checked
        ? Array.from(new Set([...prev, sid]))
        : prev.filter((x) => x !== sid),
    );
  };
  // Ctrl / Cmd + click on a note card from non-multi mode: enter
  // multi-select with this note pre-selected. Lets the user gather two
  // notes and trigger "Open side by side" without first hitting the
  // multi-select toggle in the toolbar.
  const onCtrlSelect = (id) => {
    const sid = String(id);
    keepContentInPlace(() => {
      setMultiMode(true);
      setSelectedIds((prev) =>
        prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid],
      );
    });
  };
  const onSelectAll = (filteredNotes) => {
    const filteredIds = filteredNotes.map((n) => String(n.id));
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : filteredIds);
  };

  return {
    multiMode, setMultiMode,
    selectedIds, setSelectedIds,
    onStartMulti, onExitMulti, onToggleSelect, onCtrlSelect, onSelectAll,
  };
}
