import { useRef, useCallback, useEffect } from "react";
import { reorderSections, canIndentItem, updateEntry, INDENT_STEP_PX } from "../utils/checklist.js";
import {
  autoScrollSpeed,
  dropItemEntries,
  findDragScrollContainer,
  restoreDraggedDom,
  settleDragClone,
  updateDropTarget,
} from "../utils/checklistDrag.js";

// Minimum movement (in either axis) before a gesture commits to being a
// vertical reorder or a horizontal indent/outdent. Below this, a light
// tremor in either direction does nothing -- this is what stops "a
// slight horizontal movement during a vertical drag" from ever being
// misread as an indent attempt: the axis is decided once, from whichever
// direction first clears this threshold, and locked for the rest of the
// gesture.
const AXIS_LOCK_PX = 8;

/**
 * Pointer-based drag & drop for checklist items AND sections.
 *
 * Item drag (handlePointerDown):
 *   Shifts every `[data-checklist-row]` element (items, headers,
 *   buttons) to keep the visual flow coherent when dragging across a
 *   section boundary. The commit walks the virtual new row order,
 *   extracts the ordered item IDs, and relocates the dragged entry in
 *   `entries` so its index among unchecked items matches.
 *
 *   The same gesture also drives indent/outdent: once the pointer clears
 *   AXIS_LOCK_PX, the dominant axis at that moment locks the whole
 *   gesture into either "vertical" (existing reorder behaviour, entirely
 *   untouched below) or "horizontal" (indent right / outdent left,
 *   following the pointer up to INDENT_STEP_PX with a commit-on-release
 *   threshold). The two never mix within one gesture.
 *
 * Section drag (handleSectionPointerDown):
 *   Each section block is wrapped with `data-section-block={id}`. On
 *   drag we move the whole block (marker + items) as a unit: clone the
 *   wrapper, shift sibling blocks to make room, then commit by calling
 *   `reorderSections` with the new block order.
 *
 * Usage:
 *   const { handlePointerDown, handleSectionPointerDown, ... } =
 *     useChecklistDrag(entries, setEntries, syncEntries);
 */
export default function useChecklistDrag(entries, setEntries, syncEntries) {
  const dragState = useRef(null);
  const sectionDragState = useRef(null);

  useEffect(() => {
    return () => {
      if (dragState.current?.clone) {
        if (dragState.current.autoScrollRaf) cancelAnimationFrame(dragState.current.autoScrollRaf);
        dragState.current.clone.remove();
        dragState.current = null;
      }
      if (sectionDragState.current?.clone) {
        if (sectionDragState.current.autoScrollRaf) cancelAnimationFrame(sectionDragState.current.autoScrollRaf);
        sectionDragState.current.clone.remove();
        sectionDragState.current = null;
      }
    };
  }, []);

  // Sets up the "pick up" presentation (floating clone, shadow, scale,
  // sibling reflow, auto-scroll) -- called lazily from handlePointerMove
  // ONLY once a gesture actually locks into "vertical". A horizontal
  // gesture never calls this, which is what keeps the lift animation
  // from ever playing for a horizontal drag (Google Keep only lifts the
  // row once you start moving it vertically). Returns false if the row
  // can't be found in a container (gesture aborts).
  const beginVerticalLift = useCallback((ds) => {
    const rowEl = ds.rowEl;
    const containerEl = rowEl.closest("[data-checklist-list]") || rowEl.parentElement;
    if (!containerEl) return false;

    const scrollEl = findDragScrollContainer(rowEl);

    // Visual rows = items + section headers + inline "+ list item" buttons.
    const rowEls = Array.from(containerEl.querySelectorAll("[data-checklist-row]"));
    const fromIndex = rowEls.indexOf(rowEl);
    if (fromIndex === -1) return false;

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

    Object.assign(ds, {
      clone, containerEl, rowEls, rects, fromIndex, currentIndex: fromIndex,
      scrollEl, startScrollTop,
    });

    const autoScroll = () => {
      const cur = dragState.current;
      if (!cur || cur.mode !== "vertical" || !cur.scrollEl) return;
      const speed = autoScrollSpeed(cur.scrollEl, cur.lastY);
      if (speed !== 0) {
        cur.scrollEl.scrollTop += speed;
        updateDropTarget(cur, cur.rowEls);
      }
      cur.autoScrollRaf = requestAnimationFrame(autoScroll);
    };
    ds.autoScrollRaf = requestAnimationFrame(autoScroll);
    return true;
  }, []);

  const handlePointerDown = useCallback((itemId, e) => {
    if (e.button && e.button !== 0) return;
    e.preventDefault();

    const handle = e.currentTarget;
    const rowEl = handle.closest("[data-checklist-item]");
    if (!rowEl) return;
    // The horizontal indent/outdent gesture only ever moves this inner
    // wrapper (handle + checkbox + text), not the whole row -- so the
    // delete button, which sits outside it, never chases the row
    // sideways. Falls back to the row itself if a caller doesn't mark
    // one (e.g. an older/simpler row layout).
    const slideEl = rowEl.querySelector("[data-checklist-slide]") || rowEl;

    handle.setPointerCapture(e.pointerId);

    const draggedItem = entries.find((x) => String(x?.id) === String(itemId));

    // Deliberately minimal: no clone, no DOM measurement, no hiding the
    // real row yet. Everything vertical-only is populated lazily by
    // beginVerticalLift() the moment (if ever) this gesture locks into
    // "vertical" -- see handlePointerMove.
    dragState.current = {
      id: String(itemId),
      rowEl,
      slideEl,
      handle,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastY: e.clientY,
      lastDeltaX: 0,
      // Decided lazily on the first move past AXIS_LOCK_PX: null | "vertical" | "horizontal".
      mode: null,
      // Precomputed once — indent state can't change mid-gesture (nothing
      // else can mutate `entries` while a pointer drag is in progress).
      canIndent: canIndentItem(entries, itemId),
      canOutdent: !!draggedItem?.indent,
      clone: null,
      containerEl: null,
      rowEls: null,
      rects: null,
      fromIndex: -1,
      currentIndex: -1,
      scrollEl: null,
      startScrollTop: 0,
      autoScrollRaf: null,
    };
  }, [entries]);

  const handlePointerMove = useCallback((e) => {
    const ds = dragState.current;
    if (!ds) return;
    ds.lastY = e.clientY;
    const deltaX = e.clientX - ds.startX;

    if (!ds.mode) {
      const deltaY = e.clientY - ds.startY;
      if (Math.abs(deltaX) < AXIS_LOCK_PX && Math.abs(deltaY) < AXIS_LOCK_PX) return;
      const wantsVertical = Math.abs(deltaX) <= Math.abs(deltaY);
      if (wantsVertical) {
        if (!beginVerticalLift(ds)) { dragState.current = null; return; }
        ds.mode = "vertical";
      } else {
        ds.mode = "horizontal";
        // Live-follow the real row directly -- no clone, no elevation,
        // no shadow. It stays exactly where it is in the list; only its
        // paint position shifts, which is what makes this read as "the
        // row slides in place" rather than "the row got picked up".
        ds.slideEl.style.transition = "none";
        ds.slideEl.style.willChange = "transform";
      }
    }

    if (ds.mode === "horizontal") {
      const dir = deltaX > 0 ? 1 : deltaX < 0 ? -1 : 0;
      const allowed = (dir > 0 && ds.canIndent) || (dir < 0 && ds.canOutdent);
      const clamped = allowed ? Math.max(-INDENT_STEP_PX, Math.min(INDENT_STEP_PX, deltaX)) : 0;
      ds.lastDeltaX = deltaX;
      ds.slideEl.style.transform = clamped ? `translateX(${clamped}px)` : "";
      return;
    }

    ds.clone.style.top = `${ds.rects[ds.fromIndex].top + (e.clientY - ds.startY)}px`;
    updateDropTarget(ds, ds.rowEls);
  }, [beginVerticalLift]);

  const handlePointerUp = useCallback(() => {
    const ds = dragState.current;
    if (!ds) return;

    if (ds.autoScrollRaf) cancelAnimationFrame(ds.autoScrollRaf);
    try { ds.handle.releasePointerCapture(ds.pointerId); } catch { /* capture already released */ }

    if (ds.mode === "horizontal") {
      const slideEl = ds.slideEl;
      const draggedId = ds.id;
      const deltaX = ds.lastDeltaX || 0;
      const shouldIndent = ds.canIndent && deltaX >= INDENT_STEP_PX;
      const shouldOutdent = ds.canOutdent && deltaX <= -INDENT_STEP_PX;

      if (shouldIndent || shouldOutdent) {
        // The row is already sitting at exactly the committed visual
        // offset (translateX clamps to the same distance the real margin
        // will apply once React re-renders with the new indent). Commit
        // now, then wait two paints before dropping the manual transform
        // -- clearing it any earlier would flash the row back to
        // unindented for a frame, before the new margin has landed.
        const next = updateEntry(entries, draggedId, { indent: shouldIndent ? 1 : 0 });
        setEntries(next);
        syncEntries(next);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            slideEl.style.transition = "";
            slideEl.style.transform = "";
            slideEl.style.willChange = "";
          });
        });
      } else {
        // Didn't cross the commit threshold -- spring back to unindented.
        slideEl.style.transition = "transform 0.15s cubic-bezier(.2,0,0,1)";
        slideEl.style.transform = "";
        setTimeout(() => {
          slideEl.style.transition = "";
          slideEl.style.willChange = "";
        }, 150);
      }
      dragState.current = null;
      return;
    }

    if (ds.mode !== "vertical") {
      // Never crossed the axis-lock threshold (e.g. a stray click on the
      // handle) -- beginVerticalLift/horizontal setup never ran, so
      // there's nothing to animate, commit, or tear down.
      dragState.current = null;
      return;
    }

    settleDragClone(ds);

    const fromIndex = ds.fromIndex;
    const toIndex = ds.currentIndex;
    const rowEls = ds.rowEls;
    const draggedId = rowEls[fromIndex].getAttribute("data-checklist-item");

    setTimeout(() => {
      restoreDraggedDom(ds.clone, ds.rowEl, ds.containerEl, ds.rowEls);

      if (fromIndex !== toIndex && draggedId) {
        const next = dropItemEntries(entries, rowEls, fromIndex, toIndex, draggedId);
        if (next) {
          setEntries(next);
          syncEntries(next);
        }
      }

      dragState.current = null;
    }, 220);
  }, [entries, setEntries, syncEntries]);

  const handlePointerCancel = useCallback(() => {
    const ds = dragState.current;
    if (!ds) return;
    if (ds.autoScrollRaf) cancelAnimationFrame(ds.autoScrollRaf);

    if (ds.mode === "horizontal") {
      ds.slideEl.style.transition = "";
      ds.slideEl.style.transform = "";
      ds.slideEl.style.willChange = "";
      dragState.current = null;
      return;
    }
    if (ds.mode !== "vertical") {
      dragState.current = null;
      return;
    }
    restoreDraggedDom(ds.clone, ds.rowEl, ds.containerEl, ds.rowEls);
    dragState.current = null;
  }, []);

  // ---------- Section drag ----------

  const handleSectionPointerDown = useCallback((sectionId, e) => {
    if (e.button && e.button !== 0) return;
    e.preventDefault();

    const handle = e.currentTarget;
    const blockEl = handle.closest("[data-section-block]");
    if (!blockEl) return;

    const containerEl = blockEl.parentElement;
    if (!containerEl) return;

    const scrollEl = findDragScrollContainer(blockEl);

    // Only named sections are draggable. The default (untitled) block,
    // if rendered, still carries a data-section-block attribute but its
    // id is "__default__" and we refuse to drag it.
    if (blockEl.getAttribute("data-section-block") === "__default__") return;

    const blockEls = Array.from(containerEl.querySelectorAll("[data-section-block]"));
    const fromIndex = blockEls.indexOf(blockEl);
    if (fromIndex === -1) return;

    const rects = blockEls.map((el) => el.getBoundingClientRect());
    const blockRect = rects[fromIndex];
    const startScrollTop = scrollEl ? scrollEl.scrollTop : 0;
    const modalEl = blockEl.closest(".glass-card");
    const noteBg = modalEl ? getComputedStyle(modalEl).backgroundColor : "";

    const clone = blockEl.cloneNode(true);
    clone.style.position = "fixed";
    clone.style.left = `${blockRect.left}px`;
    clone.style.top = `${blockRect.top}px`;
    clone.style.width = `${blockRect.width}px`;
    clone.style.zIndex = "9999";
    clone.style.pointerEvents = "none";
    clone.style.transition = "box-shadow 0.2s, transform 0.2s";
    clone.style.boxShadow = "0 8px 24px rgba(0,0,0,0.18)";
    clone.style.transform = "scale(1.02)";
    clone.style.borderRadius = "8px";
    clone.style.background = noteBg || "var(--bg-card, #fff)";
    clone.style.opacity = "1";
    clone.className = blockEl.className + " checklist-drag-clone";
    document.body.appendChild(clone);

    blockEl.style.opacity = "0";
    blockEl.style.transition = "none";
    containerEl.style.minHeight = `${containerEl.offsetHeight}px`;

    blockEls.forEach((el, i) => {
      if (i !== fromIndex) el.style.transition = "transform 0.2s cubic-bezier(.2,0,0,1)";
    });

    try { handle.setPointerCapture(e.pointerId); } catch { /* pointer no longer active: continue without capture */ }

    sectionDragState.current = {
      id: String(sectionId),
      clone,
      startY: e.clientY,
      lastY: e.clientY,
      containerEl,
      blockEls,
      rects,
      fromIndex,
      currentIndex: fromIndex,
      blockEl,
      pointerId: e.pointerId,
      handle,
      scrollEl,
      startScrollTop,
      autoScrollRaf: null,
    };

    const autoScroll = () => {
      const ds = sectionDragState.current;
      if (!ds || !ds.scrollEl) return;
      const speed = autoScrollSpeed(ds.scrollEl, ds.lastY);
      if (speed !== 0) {
        ds.scrollEl.scrollTop += speed;
        updateDropTarget(ds, ds.blockEls);
      }
      ds.autoScrollRaf = requestAnimationFrame(autoScroll);
    };
    sectionDragState.current.autoScrollRaf = requestAnimationFrame(autoScroll);
  }, []);

  const handleSectionPointerMove = useCallback((e) => {
    const ds = sectionDragState.current;
    if (!ds) return;
    ds.lastY = e.clientY;
    ds.clone.style.top = `${ds.rects[ds.fromIndex].top + (e.clientY - ds.startY)}px`;
    updateDropTarget(ds, ds.blockEls);
  }, []);

  const handleSectionPointerUp = useCallback(() => {
    const ds = sectionDragState.current;
    if (!ds) return;
    if (ds.autoScrollRaf) cancelAnimationFrame(ds.autoScrollRaf);
    try { ds.handle.releasePointerCapture(ds.pointerId); } catch { /* capture already released */ }

    settleDragClone(ds);

    const fromIndex = ds.fromIndex;
    const toIndex = ds.currentIndex;
    const blockEls = ds.blockEls;

    setTimeout(() => {
      restoreDraggedDom(ds.clone, ds.blockEl, ds.containerEl, ds.blockEls);

      if (fromIndex !== toIndex) {
        // New block order in the DOM.
        const shifted = blockEls.slice();
        const [moved] = shifted.splice(fromIndex, 1);
        shifted.splice(toIndex, 0, moved);
        const newOrderIds = shifted
          .map((el) => el.getAttribute("data-section-block"))
          .filter((id) => id && id !== "__default__");

        const next = reorderSections(entries, newOrderIds);
        setEntries(next);
        syncEntries(next);
      }

      sectionDragState.current = null;
    }, 220);
  }, [entries, setEntries, syncEntries]);

  const handleSectionPointerCancel = useCallback(() => {
    const ds = sectionDragState.current;
    if (!ds) return;
    if (ds.autoScrollRaf) cancelAnimationFrame(ds.autoScrollRaf);
    restoreDraggedDom(ds.clone, ds.blockEl, ds.containerEl, ds.blockEls);
    sectionDragState.current = null;
  }, []);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleSectionPointerDown,
    handleSectionPointerMove,
    handleSectionPointerUp,
    handleSectionPointerCancel,
  };
}
