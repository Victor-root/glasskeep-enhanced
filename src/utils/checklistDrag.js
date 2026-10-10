// DOM helpers of the checklist drag & drop (hooks/useChecklistDrag.js),
// shared by the item drag and the section drag. A drag state `ds` holds
// the measured rects of the draggable elements, the dragged index
// (fromIndex), the pointer's start / last Y and the scroll container.

const DEFAULT_SECTION = "__default__";

// The element that scrolls under a dragged row: the note modal body, a
// scrollable list, or the card itself.
export function findDragScrollContainer(el) {
  return el.closest("[data-modal-scroll]") || el.closest(".overflow-y-auto") || el.closest(".glass-card");
}

// Picks the drop index under the dragged clone's centre and slides the
// elements between the source and that index out of the way.
export function updateDropTarget(ds, els) {
  if (!ds) return;
  const scrollDelta = ds.scrollEl ? (ds.scrollEl.scrollTop - ds.startScrollTop) : 0;
  const cloneTopViewport = ds.rects[ds.fromIndex].top + (ds.lastY - ds.startY);
  const draggedCenterY = cloneTopViewport + ds.rects[ds.fromIndex].height / 2;

  let newIndex = ds.fromIndex;
  for (let i = 0; i < ds.rects.length; i++) {
    const rect = ds.rects[i];
    const midY = rect.top - scrollDelta + rect.height / 2;
    if (draggedCenterY > midY) newIndex = i;
  }
  newIndex = Math.max(0, Math.min(els.length - 1, newIndex));
  ds.currentIndex = newIndex;

  // All displaced elements shift by the same amount: the dragged one's
  // height + the gap just after it. This is geometrically correct for
  // heterogeneous heights (the invariant is that every element below
  // the removed one slides up by exactly (dragged + gap)).
  const draggedHeight = ds.rects[ds.fromIndex].height;
  let gap = 0;
  if (ds.fromIndex + 1 < ds.rects.length) {
    gap = ds.rects[ds.fromIndex + 1].top - ds.rects[ds.fromIndex].bottom;
  } else if (ds.fromIndex > 0) {
    gap = ds.rects[ds.fromIndex].top - ds.rects[ds.fromIndex - 1].bottom;
  }
  if (gap < 0) gap = 0;
  const shift = draggedHeight + gap;

  els.forEach((el, i) => {
    if (i === ds.fromIndex) return;
    let offset = 0;
    if (ds.fromIndex < ds.currentIndex) {
      if (i > ds.fromIndex && i <= ds.currentIndex) offset = -shift;
    } else if (ds.fromIndex > ds.currentIndex) {
      if (i >= ds.currentIndex && i < ds.fromIndex) offset = shift;
    }
    el.style.transform = offset ? `translateY(${offset}px)` : "";
  });
}

// Auto-scroll step (px per frame) when the pointer is within 60px of the
// scroll container's top or bottom edge, 0 elsewhere.
export function autoScrollSpeed(scrollEl, cursorY) {
  const scrollRect = scrollEl.getBoundingClientRect();
  const edgeZone = 60;
  let speed = 0;
  if (cursorY > scrollRect.bottom - edgeZone) {
    speed = Math.min(12, ((cursorY - (scrollRect.bottom - edgeZone)) / edgeZone) * 12);
  } else if (cursorY < scrollRect.top + edgeZone) {
    speed = -Math.min(12, (((scrollRect.top + edgeZone) - cursorY) / edgeZone) * 12);
  }
  return speed;
}

// Drop animation: the clone glides into the target slot and settles.
export function settleDragClone(ds) {
  const scrollDelta = ds.scrollEl ? (ds.scrollEl.scrollTop - ds.startScrollTop) : 0;
  const targetRect = ds.rects[ds.currentIndex];
  ds.clone.style.transition = "top 0.2s cubic-bezier(.2,0,0,1), box-shadow 0.2s, transform 0.2s";
  ds.clone.style.top = `${targetRect.top - scrollDelta}px`;
  ds.clone.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
  ds.clone.style.transform = "scale(1)";
}

// Removes the clone and every inline style the drag put on the dragged
// element, its container and its siblings.
export function restoreDraggedDom(clone, draggedEl, containerEl, els) {
  clone.remove();
  draggedEl.style.opacity = "";
  draggedEl.style.transition = "";
  containerEl.style.minHeight = "";
  els.forEach((el) => {
    el.style.transition = "";
    el.style.transform = "";
  });
}

// New entries after dropping item `draggedId` from visual row `fromIndex`
// to `toIndex` of `rowEls`, or null when the drop can't be resolved.
export function dropItemEntries(entries, rowEls, fromIndex, toIndex, draggedId) {
  // Simulate the new visual order of all rows.
  const shiftedRows = rowEls.slice();
  const [movedRow] = shiftedRows.splice(fromIndex, 1);
  shiftedRows.splice(toIndex, 0, movedRow);

  // Determine the dragged item's target section by inspecting
  // the NEIGHBORS of its new position in the simulated row order.
  // (The dragged DOM element itself hasn't physically moved, so
  // calling closest() on it still returns its source section,
  // which is why we look at what's next to it instead.)
  const draggedIdxInShifted = shiftedRows.findIndex(
    (el) => el.getAttribute("data-checklist-item") === draggedId,
  );
  if (draggedIdxInShifted === -1) return null;

  const blockIdOf = (el) => {
    if (!el) return DEFAULT_SECTION;
    const b = el.closest("[data-section-block]");
    return b ? (b.getAttribute("data-section-block") || DEFAULT_SECTION) : DEFAULT_SECTION;
  };

  const nextEl = shiftedRows[draggedIdxInShifted + 1] || null;
  const prevEl = shiftedRows[draggedIdxInShifted - 1] || null;

  let targetSection;
  if (nextEl) {
    // If the next row is a section header, the dragged item sits
    // just before that header, i.e. in the previous block.
    const nextIsHeader = !!nextEl.getAttribute("data-section-header");
    if (nextIsHeader) {
      targetSection = blockIdOf(prevEl);
    } else {
      targetSection = blockIdOf(nextEl);
    }
  } else {
    targetSection = blockIdOf(prevEl);
  }

  // Position among unchecked items of the target section = number
  // of non-header rows before draggedIdxInShifted whose own block
  // matches targetSection.
  let targetPosInSection = 0;
  for (let i = 0; i < draggedIdxInShifted; i++) {
    const el = shiftedRows[i];
    const itemId = el.getAttribute("data-checklist-item");
    if (!itemId) continue;
    if (blockIdOf(el) === targetSection) targetPosInSection++;
  }

  const isSection = (x) => !!x && x.kind === "section";
  const isUncheckedItem = (x) => !!x && !isSection(x) && !x.done;

  const src = entries.slice();
  const srcIdx = src.findIndex((x) => String(x?.id) === String(draggedId));
  if (srcIdx === -1) return null;
  const [movedEntry] = src.splice(srcIdx, 1);

  // Locate the target section's range [sectionStart, sectionEnd)
  // in the rebuilt (post-removal) entries array.
  let sectionStart = 0;
  let sectionEnd;
  if (targetSection === DEFAULT_SECTION) {
    const firstMarker = src.findIndex(isSection);
    sectionEnd = firstMarker === -1 ? src.length : firstMarker;
  } else {
    const markerIdx = src.findIndex((x) => isSection(x) && x.id === targetSection);
    if (markerIdx === -1) {
      // Section vanished between render and commit: fall back to end.
      src.push(movedEntry);
      return src;
    }
    sectionStart = markerIdx + 1;
    sectionEnd = src.length;
    for (let j = sectionStart; j < src.length; j++) {
      if (isSection(src[j])) { sectionEnd = j; break; }
    }
  }

  // Walk the section and find the k-th unchecked slot.
  let seen = 0;
  let insertAt = sectionEnd;
  for (let j = sectionStart; j < sectionEnd; j++) {
    if (isUncheckedItem(src[j])) {
      if (seen === targetPosInSection) { insertAt = j; break; }
      seen++;
    }
  }
  src.splice(insertAt, 0, movedEntry);
  return src;
}
