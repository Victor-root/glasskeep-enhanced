import { useRef, useCallback, useEffect } from "react";

/**
 * Pointer-based drag & drop for checklist items.
 *
 * Visual shifting happens on every `[data-checklist-row]` element
 * (items, section headers, per-section "+ list item" buttons, the
 * global "+ list item" button). This way dragging across a section
 * boundary pushes the header/buttons out of the way cleanly instead of
 * overlapping them.
 *
 * Commit logic uses `[data-checklist-item]` only: it simulates the new
 * visual order of all rows, extracts the resulting order of item IDs,
 * and moves the dragged entry in the full `entries` array so that its
 * new index among unchecked items matches that simulated order.
 *
 * Usage:
 *   const { handlePointerDown, ... } = useChecklistDrag(entries, setEntries, syncEntries);
 */
export default function useChecklistDrag(entries, setEntries, syncEntries) {
  const dragState = useRef(null);

  useEffect(() => {
    return () => {
      if (dragState.current?.clone) {
        if (dragState.current.autoScrollRaf) cancelAnimationFrame(dragState.current.autoScrollRaf);
        dragState.current.clone.remove();
        dragState.current = null;
      }
    };
  }, []);

  const updateDragPosition = (ds) => {
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
    newIndex = Math.max(0, Math.min(ds.rowEls.length - 1, newIndex));
    ds.currentIndex = newIndex;

    // All displaced rows shift by the same amount: the dragged row's
    // height + the gap just after it. This is geometrically correct for
    // heterogeneous row heights (the invariant is that every row below
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

    ds.rowEls.forEach((el, i) => {
      if (i === ds.fromIndex) return;
      let offset = 0;
      if (ds.fromIndex < ds.currentIndex) {
        if (i > ds.fromIndex && i <= ds.currentIndex) offset = -shift;
      } else if (ds.fromIndex > ds.currentIndex) {
        if (i >= ds.currentIndex && i < ds.fromIndex) offset = shift;
      }
      el.style.transform = offset ? `translateY(${offset}px)` : "";
    });
  };

  const handlePointerDown = useCallback((itemId, e) => {
    if (e.button && e.button !== 0) return;
    e.preventDefault();

    const handle = e.currentTarget;
    const rowEl = handle.closest("[data-checklist-item]");
    if (!rowEl) return;

    const containerEl = rowEl.closest("[data-checklist-list]") || rowEl.parentElement;
    if (!containerEl) return;

    const scrollEl = rowEl.closest("[data-modal-scroll]") || rowEl.closest(".overflow-y-auto") || rowEl.closest(".glass-card");

    // Visual rows = items + section headers + inline "+ list item" buttons.
    const rowEls = Array.from(containerEl.querySelectorAll("[data-checklist-row]"));
    const fromIndex = rowEls.indexOf(rowEl);
    if (fromIndex === -1) return;

    const rects = rowEls.map((el) => el.getBoundingClientRect());
    const rowRect = rects[fromIndex];
    const startScrollTop = scrollEl ? scrollEl.scrollTop : 0;
    const modalEl = rowEl.closest(".glass-card");
    const noteBg = modalEl ? getComputedStyle(modalEl).backgroundColor : "";

    const clone = rowEl.cloneNode(true);
    clone.style.position = "fixed";
    clone.style.left = `${rowRect.left}px`;
    clone.style.top = `${rowRect.top}px`;
    clone.style.width = "fit-content";
    clone.style.maxWidth = `${rowRect.width}px`;
    clone.style.zIndex = "9999";
    clone.style.pointerEvents = "none";
    clone.style.transition = "box-shadow 0.2s, transform 0.2s";
    clone.style.boxShadow = "0 8px 24px rgba(0,0,0,0.18)";
    clone.style.transform = "scale(1.03)";
    clone.style.borderRadius = "8px";
    clone.style.background = noteBg || "var(--bg-card, #fff)";
    clone.style.padding = "4px 12px 4px 4px";
    clone.style.opacity = "1";
    clone.className = rowEl.className + " checklist-drag-clone";
    document.body.appendChild(clone);

    rowEl.style.opacity = "0";
    rowEl.style.transition = "none";
    containerEl.style.minHeight = `${containerEl.offsetHeight}px`;

    rowEls.forEach((el, i) => {
      if (i !== fromIndex) {
        el.style.transition = "transform 0.2s cubic-bezier(.2,0,0,1)";
      }
    });

    handle.setPointerCapture(e.pointerId);

    dragState.current = {
      id: String(itemId),
      clone,
      startY: e.clientY,
      lastY: e.clientY,
      containerEl,
      rowEls,
      rects,
      fromIndex,
      currentIndex: fromIndex,
      rowEl,
      pointerId: e.pointerId,
      handle,
      scrollEl,
      startScrollTop,
      autoScrollRaf: null,
    };

    const autoScroll = () => {
      const ds = dragState.current;
      if (!ds || !ds.scrollEl) return;
      const scrollRect = ds.scrollEl.getBoundingClientRect();
      const edgeZone = 60;
      const cursorY = ds.lastY;
      let speed = 0;
      if (cursorY > scrollRect.bottom - edgeZone) {
        speed = Math.min(12, ((cursorY - (scrollRect.bottom - edgeZone)) / edgeZone) * 12);
      } else if (cursorY < scrollRect.top + edgeZone) {
        speed = -Math.min(12, (((scrollRect.top + edgeZone) - cursorY) / edgeZone) * 12);
      }
      if (speed !== 0) {
        ds.scrollEl.scrollTop += speed;
        updateDragPosition(ds);
      }
      ds.autoScrollRaf = requestAnimationFrame(autoScroll);
    };
    dragState.current.autoScrollRaf = requestAnimationFrame(autoScroll);
  }, []);

  const handlePointerMove = useCallback((e) => {
    const ds = dragState.current;
    if (!ds) return;
    ds.lastY = e.clientY;
    ds.clone.style.top = `${ds.rects[ds.fromIndex].top + (e.clientY - ds.startY)}px`;
    updateDragPosition(ds);
  }, []);

  const handlePointerUp = useCallback(() => {
    const ds = dragState.current;
    if (!ds) return;

    if (ds.autoScrollRaf) cancelAnimationFrame(ds.autoScrollRaf);
    try { ds.handle.releasePointerCapture(ds.pointerId); } catch (_) {}

    const scrollDelta = ds.scrollEl ? (ds.scrollEl.scrollTop - ds.startScrollTop) : 0;
    const targetRect = ds.rects[ds.currentIndex];
    ds.clone.style.transition = "top 0.2s cubic-bezier(.2,0,0,1), box-shadow 0.2s, transform 0.2s";
    ds.clone.style.top = `${targetRect.top - scrollDelta}px`;
    ds.clone.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
    ds.clone.style.transform = "scale(1)";

    const fromIndex = ds.fromIndex;
    const toIndex = ds.currentIndex;
    const rowEls = ds.rowEls;
    const draggedId = rowEls[fromIndex].getAttribute("data-checklist-item");

    setTimeout(() => {
      ds.clone.remove();
      ds.rowEl.style.opacity = "";
      ds.rowEl.style.transition = "";
      ds.containerEl.style.minHeight = "";
      ds.rowEls.forEach((el) => {
        el.style.transition = "";
        el.style.transform = "";
      });

      if (fromIndex !== toIndex && draggedId) {
        // Simulate the new visual order of all rows.
        const shiftedRows = rowEls.slice();
        const [movedRow] = shiftedRows.splice(fromIndex, 1);
        shiftedRows.splice(toIndex, 0, movedRow);

        // Extract item IDs in the new visual order (skip section
        // headers and buttons, which don't carry an item id).
        const newOrderedItemIds = shiftedRows
          .map((el) => el.getAttribute("data-checklist-item"))
          .filter(Boolean);
        const targetUncheckedPos = newOrderedItemIds.indexOf(draggedId);
        if (targetUncheckedPos === -1) { dragState.current = null; return; }

        const isSection = (x) => !!x && x.kind === "section";
        const isUncheckedItem = (x) => !!x && !isSection(x) && !x.done;

        const src = entries.slice();
        const srcIdx = src.findIndex((x) => String(x?.id) === String(draggedId));
        if (srcIdx === -1) { dragState.current = null; return; }
        const [movedEntry] = src.splice(srcIdx, 1);

        let seen = 0;
        let insertAt = src.length;
        for (let i = 0; i < src.length; i++) {
          if (isUncheckedItem(src[i])) {
            if (seen === targetUncheckedPos) { insertAt = i; break; }
            seen++;
          }
        }
        src.splice(insertAt, 0, movedEntry);

        setEntries(src);
        syncEntries(src);
      }

      dragState.current = null;
    }, 220);
  }, [entries, setEntries, syncEntries]);

  const handlePointerCancel = useCallback(() => {
    const ds = dragState.current;
    if (!ds) return;
    if (ds.autoScrollRaf) cancelAnimationFrame(ds.autoScrollRaf);
    ds.clone.remove();
    ds.rowEl.style.opacity = "";
    ds.rowEl.style.transition = "";
    ds.containerEl.style.minHeight = "";
    ds.rowEls.forEach((el) => {
      el.style.transition = "";
      el.style.transform = "";
    });
    dragState.current = null;
  }, []);

  return { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel };
}
