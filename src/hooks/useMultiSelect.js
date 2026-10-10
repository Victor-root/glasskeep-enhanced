import { useState } from "react";

// On desktop the notes list scrolls inside .notes-scroll-area (so its
// scrollbar starts below the sticky header) instead of the document; on
// mobile that element keeps overflow:visible and the window scrolls.
const getNotesScrollTarget = () => {
  const el = document.querySelector(".notes-scroll-area");
  return el && getComputedStyle(el).overflowY === "auto" ? el : null;
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
    // Toggle: a second click on the multi-select button closes the bar
    // instead of re-running the open logic (which re-added the dock's padding
    // to the scroll position, so each extra click scrolled the page down).
    if (multiMode) { onExitMulti(); return; }
    const scrollEl = getNotesScrollTarget();
    const scrollX = scrollEl ? scrollEl.scrollLeft : window.scrollX;
    const scrollY = scrollEl ? scrollEl.scrollTop : window.scrollY;
    setMultiMode(true);
    setSelectedIds([]);
    setFabOpen(false); // dock lives at bottom; close FAB to avoid overlap
    // Compensate the shim's padding-top so the visible content doesn't slide
    // down when the dock appears. Read the actual padding after the commit
    // so desktop (48px) and mobile (44px) both work.
    requestAnimationFrame(() => {
      const shim = document.querySelector(".multi-select-content-shim");
      const pad = shim ? parseFloat(getComputedStyle(shim).paddingTop) || 0 : 0;
      if (pad > 0) {
        const target = { left: scrollX, top: scrollY + pad, behavior: "instant" };
        if (scrollEl) scrollEl.scrollTo(target);
        else window.scrollTo(target);
      }
    });
  };
  const onExitMulti = () => {
    const scrollEl = getNotesScrollTarget();
    const scrollX = scrollEl ? scrollEl.scrollLeft : window.scrollX;
    const scrollY = scrollEl ? scrollEl.scrollTop : window.scrollY;
    // Read the padding BEFORE the state change: after the commit it's gone.
    const shim = document.querySelector(".multi-select-content-shim");
    const pad = shim ? parseFloat(getComputedStyle(shim).paddingTop) || 0 : 0;
    setMultiMode(false);
    setSelectedIds([]);
    // The shim's padding-top drops to 0 on the next paint; compensate by
    // scrolling up by the same amount so the visible content stays put.
    requestAnimationFrame(() => {
      const targetY = Math.max(0, scrollY - pad);
      const target = { left: scrollX, top: targetY, behavior: "instant" };
      if (scrollEl) scrollEl.scrollTo(target);
      else window.scrollTo(target);
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
    setMultiMode(true);
    setSelectedIds((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid],
    );
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
