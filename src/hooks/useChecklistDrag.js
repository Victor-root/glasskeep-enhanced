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
        dragState.current.clone.remove();
        dragState.current = null;
      }
    };
  }, []);

  const handlePointerDown = useCallback((itemId, e) => {
    // Only primary button (mouse) or touch
    if (e.button && e.button !== 0) return;

    const handle = e.currentTarget;
    const rowEl = handle.closest("[data-checklist-item]");
    if (!rowEl) return;

    const containerEl = rowEl.parentElement;
    if (!containerEl) return;

    // Gather all unchecked item elements
    const itemEls = Array.from(containerEl.querySelectorAll("[data-checklist-item]"));
    const fromIndex = itemEls.indexOf(rowEl);
    if (fromIndex === -1) return;

    // Capture bounding rects before any transforms
    const rects = itemEls.map((el) => el.getBoundingClientRect());
    const rowRect = rects[fromIndex];

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
    };
  }, []);

  const handlePointerMove = useCallback((e) => {
    const ds = dragState.current;
    if (!ds) return;

    const deltaY = e.clientY - ds.startY;

    // Move clone
    ds.clone.style.top = `${ds.rects[ds.fromIndex].top + deltaY}px`;
    ds.lastY = e.clientY;

    // Determine which index the dragged item is hovering over
    const draggedCenterY = ds.rects[ds.fromIndex].top + deltaY + ds.rects[ds.fromIndex].height / 2;

    let newIndex = ds.fromIndex;
    for (let i = 0; i < ds.rects.length; i++) {
      const rect = ds.rects[i];
      const midY = rect.top + rect.height / 2;
      if (draggedCenterY > midY) {
        newIndex = i;
      }
    }
    // Clamp
    newIndex = Math.max(0, Math.min(ds.itemEls.length - 1, newIndex));

    if (newIndex !== ds.currentIndex) {
      ds.currentIndex = newIndex;
    }

    // Shift other items to make room
    const draggedHeight = ds.rects[ds.fromIndex].height;
    // Detect gap from actual spacing between consecutive items
    let gap = 0;
    if (ds.rects.length >= 2) {
      gap = ds.rects[1].top - ds.rects[0].bottom;
      if (gap < 0) gap = 0;
    }
    const shift = draggedHeight + gap;

    ds.itemEls.forEach((el, i) => {
      if (i === ds.fromIndex) return; // the original (hidden)

      let offset = 0;
      if (ds.fromIndex < ds.currentIndex) {
        // Dragged downward: items between fromIndex+1..currentIndex shift up
        if (i > ds.fromIndex && i <= ds.currentIndex) {
          offset = -shift;
        }
      } else if (ds.fromIndex > ds.currentIndex) {
        // Dragged upward: items between currentIndex..fromIndex-1 shift down
        if (i >= ds.currentIndex && i < ds.fromIndex) {
          offset = shift;
        }
      }
      el.style.transform = offset ? `translateY(${offset}px)` : "";
    });
  }, []);

  const handlePointerUp = useCallback((e) => {
    const ds = dragState.current;
    if (!ds) return;

    // Release capture
    try { ds.handle.releasePointerCapture(ds.pointerId); } catch (_) {}

    // Animate clone to final position
    const targetRect = ds.rects[ds.currentIndex];
    ds.clone.style.transition = "top 0.2s cubic-bezier(.2,0,0,1), box-shadow 0.2s, transform 0.2s";
    ds.clone.style.top = `${targetRect.top}px`;
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
