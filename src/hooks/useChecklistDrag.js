import { useRef, useCallback, useEffect } from "react";

/**
 * Pointer-based drag & drop for checklist items.
 * Renders a floating clone that follows the cursor and smoothly
 * shifts sibling items out of the way (Google Keep style).
 *
 * Usage:
 *   const { handlePointerDown } = useChecklistDrag(mItems, setMItems, syncChecklistItems);
 *   <div onPointerDown={(e) => handlePointerDown(itemId, e)} ...>handle</div>
 */
export default function useChecklistDrag(mItems, setMItems, syncChecklistItems) {
  const dragState = useRef(null); // { id, clone, startY, lastY, containerEl, itemEls, rects, fromIndex }

  // Clean up clone if component unmounts mid-drag
  useEffect(() => {
    return () => {
      if (dragState.current?.clone) {
        if (dragState.current.autoScrollRaf) cancelAnimationFrame(dragState.current.autoScrollRaf);
        dragState.current.clone.remove();
        dragState.current = null;
      }
    };
  }, []);

  /** Recalculate which index the dragged item hovers over and shift siblings */
  const updateDragPosition = (ds) => {
    if (!ds) return;

    const scrollDelta = ds.scrollEl ? (ds.scrollEl.scrollTop - ds.startScrollTop) : 0;

    // Clone center in viewport coordinates
    const cloneTopViewport = ds.rects[ds.fromIndex].top + (ds.lastY - ds.startY);
    const draggedCenterY = cloneTopViewport + ds.rects[ds.fromIndex].height / 2;

    // Items' current viewport positions = original rect - scrollDelta
    let newIndex = ds.fromIndex;
    for (let i = 0; i < ds.rects.length; i++) {
      const rect = ds.rects[i];
      const midY = rect.top - scrollDelta + rect.height / 2;
      if (draggedCenterY > midY) {
        newIndex = i;
      }
    }
    newIndex = Math.max(0, Math.min(ds.itemEls.length - 1, newIndex));
    ds.currentIndex = newIndex;

    // Shift other items to make room
    const draggedHeight = ds.rects[ds.fromIndex].height;
    let gap = 0;
    if (ds.rects.length >= 2) {
      gap = ds.rects[1].top - ds.rects[0].bottom;
      if (gap < 0) gap = 0;
    }
    const shift = draggedHeight + gap;

    ds.itemEls.forEach((el, i) => {
      if (i === ds.fromIndex) return;

      let offset = 0;
      if (ds.fromIndex < ds.currentIndex) {
        if (i > ds.fromIndex && i <= ds.currentIndex) {
          offset = -shift;
        }
      } else if (ds.fromIndex > ds.currentIndex) {
        if (i >= ds.currentIndex && i < ds.fromIndex) {
          offset = shift;
        }
      }
      el.style.transform = offset ? `translateY(${offset}px)` : "";
    });
  };

  const handlePointerDown = useCallback((itemId, e) => {
    // Only primary button (mouse) or touch
    if (e.button && e.button !== 0) return;

    const handle = e.currentTarget;
    const rowEl = handle.closest("[data-checklist-item]");
    if (!rowEl) return;

    const containerEl = rowEl.parentElement;
    if (!containerEl) return;

    // Find the scrollable modal container
    const scrollEl = rowEl.closest("[data-modal-scroll]") || rowEl.closest(".overflow-y-auto") || rowEl.closest(".glass-card");

    // Gather all unchecked item elements
    const itemEls = Array.from(containerEl.querySelectorAll("[data-checklist-item]"));
    const fromIndex = itemEls.indexOf(rowEl);
    if (fromIndex === -1) return;

    // Capture bounding rects before any transforms
    const rects = itemEls.map((el) => el.getBoundingClientRect());
    const rowRect = rects[fromIndex];

    // Capture initial scroll position
    const startScrollTop = scrollEl ? scrollEl.scrollTop : 0;

    // Resolve the modal's background color (open note color)
    const modalEl = rowEl.closest(".glass-card");
    const noteBg = modalEl ? getComputedStyle(modalEl).backgroundColor : "";

    // Create floating clone
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

    // Dim the original
    rowEl.style.opacity = "0";
    rowEl.style.transition = "none";

    // Lock container height to prevent collapse
    containerEl.style.minHeight = `${containerEl.offsetHeight}px`;

    // Prepare transition on all siblings
    itemEls.forEach((el, i) => {
      if (i !== fromIndex) {
        el.style.transition = "transform 0.2s cubic-bezier(.2,0,0,1)";
      }
    });

    // Capture pointer so we get events even outside the element
    handle.setPointerCapture(e.pointerId);

    dragState.current = {
      id: String(itemId),
      clone,
      startY: e.clientY,
      lastY: e.clientY,
      containerEl,
      itemEls,
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

    // Start auto-scroll loop
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
        // Recalculate positions after scroll (cursor didn't move but items did)
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

    // Move clone (position:fixed, viewport coords)
    ds.clone.style.top = `${ds.rects[ds.fromIndex].top + (e.clientY - ds.startY)}px`;

    updateDragPosition(ds);
  }, []);

  const handlePointerUp = useCallback((e) => {
    const ds = dragState.current;
    if (!ds) return;

    // Stop auto-scroll
    if (ds.autoScrollRaf) cancelAnimationFrame(ds.autoScrollRaf);

    // Release capture
    try { ds.handle.releasePointerCapture(ds.pointerId); } catch (_) {}

    // Animate clone to final position
    // Target item's current viewport position = original rect - scrollDelta
    const scrollDelta = ds.scrollEl ? (ds.scrollEl.scrollTop - ds.startScrollTop) : 0;
    const targetRect = ds.rects[ds.currentIndex];
    ds.clone.style.transition = "top 0.2s cubic-bezier(.2,0,0,1), box-shadow 0.2s, transform 0.2s";
    ds.clone.style.top = `${targetRect.top - scrollDelta}px`;
    ds.clone.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
    ds.clone.style.transform = "scale(1)";

    // After animation, clean up and commit reorder
    const fromIndex = ds.fromIndex;
    const toIndex = ds.currentIndex;

    setTimeout(() => {
      // Remove clone
      ds.clone.remove();

      // Reset all inline styles
      ds.rowEl.style.opacity = "";
      ds.rowEl.style.transition = "";
      ds.containerEl.style.minHeight = "";
      ds.itemEls.forEach((el) => {
        el.style.transition = "";
        el.style.transform = "";
      });

      // Commit reorder if changed
      if (fromIndex !== toIndex) {
        const unchecked = mItems.filter((it) => !it.done);
        const checked = mItems.filter((it) => it.done);

        const [removed] = unchecked.splice(fromIndex, 1);
        unchecked.splice(toIndex, 0, removed);

        const newItems = [...unchecked, ...checked];
        setMItems(newItems);
        syncChecklistItems(newItems);
      }

      dragState.current = null;
    }, 220);
  }, [mItems, setMItems, syncChecklistItems]);

  const handlePointerCancel = useCallback(() => {
    const ds = dragState.current;
    if (!ds) return;

    if (ds.autoScrollRaf) cancelAnimationFrame(ds.autoScrollRaf);
    ds.clone.remove();
    ds.rowEl.style.opacity = "";
    ds.rowEl.style.transition = "";
    ds.containerEl.style.minHeight = "";
    ds.itemEls.forEach((el) => {
      el.style.transition = "";
      el.style.transform = "";
    });
    dragState.current = null;
  }, []);

  return { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel };
}
