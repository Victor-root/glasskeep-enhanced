import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// How far a pressed mouse moves before the press becomes a drag, and how
// long a finger rests before it picks a card up (under Android's long-press
// text selection, still clearly intentional).
const MOUSE_SLOP = 5;
const TOUCH_SLOP = 10;
const LONG_PRESS_MS = 300;
// The cards make way, and the dropped one settles, in this time (shell.js).
const SETTLE_MS = 220;
// A new order must bring the held card's slot this much closer to the
// pointer: a pointer at rest never makes cards trade places back and forth.
const MIN_GAIN = 8;
// Scrolling while a card is held near the top or bottom of the view.
const EDGE = 72;
const MAX_SCROLL_STEP = 18;

const INTERACTIVE = "button, a, input, textarea, select, [contenteditable='true']";

function scrollParent(el) {
  for (let node = el?.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

// Each card goes into the shortest column, in order: the reading order runs
// along the rows, as in Google Keep.
function computeLayout(ids, heights, width, columns, gapX, gapY) {
  const colWidth = Math.max(0, (width - gapX * (columns - 1)) / columns);
  const tops = new Array(columns).fill(0);
  const slots = new Map();
  for (const id of ids) {
    let col = 0;
    for (let c = 1; c < columns; c++) if (tops[c] < tops[col]) col = c;
    const h = heights.get(id) || 0;
    slots.set(id, { x: col * (colWidth + gapX), y: tops[col], h });
    tops[col] += h + gapY;
  }
  const height = ids.length ? Math.max(...tops) - gapY : 0;
  return { colWidth, slots, height: Math.max(0, height) };
}

// The orders that put `id` next to `targetId`: just before it, just after.
const placesBeside = (ids, id, targetId) => {
  const rest = ids.filter((x) => x !== id);
  const at = rest.indexOf(targetId);
  return [at, at + 1].map((i) => [...rest.slice(0, i), id, ...rest.slice(i)]);
};

// How far a point is from a card's slot: 0 inside it.
const distanceTo = (slot, colWidth, x, y) => {
  const dx = Math.max(slot.x - x, 0, x - (slot.x + colWidth));
  const dy = Math.max(slot.y - y, 0, y - (slot.y + slot.h));
  return Math.hypot(dx, dy);
};

/**
 * Notes laid out in columns, reorderable by dragging: the held card follows
 * the pointer while the others make way, live. A mouse drags once it moves
 * with the button down; a finger first rests on the card.
 *
 * The cards keep their DOM order and only move through their transform, so
 * a card already gliding is never re-inserted mid-flight. The new order is
 * handed to `onReorder` once the dropped card has settled.
 */
export default function NotesGrid({ notes, columns, gapX, gapY, canDrag, renderCard, onReorder }) {
  const containerRef = useRef(null);
  const itemEls = useRef(new Map());
  const observerRef = useRef(null);
  const [heights, setHeights] = useState(() => new Map());
  const [width, setWidth] = useState(0);
  const [dragOrder, setDragOrder] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [animating, setAnimating] = useState(false);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const settleTimer = useRef(null);
  const pendingSettle = useRef(null);
  const propsRef = useRef({ onReorder, canDrag });
  // eslint-disable-next-line react-hooks/refs -- latest callbacks for the pointer listeners, read at event time
  propsRef.current = { onReorder, canDrag };

  const noteIds = useMemo(() => notes.map((n) => String(n.id)), [notes]);
  const order = dragOrder || noteIds;
  const layout = useMemo(
    () => computeLayout(order, heights, width, columns, gapX, gapY),
    [order, heights, width, columns, gapX, gapY],
  );
  const layoutArgs = useRef(null);
  // eslint-disable-next-line react-hooks/refs -- what the pointer handlers need to try other orders
  layoutArgs.current = { heights, width, columns, gapX, gapY };
  const layoutRef = useRef(layout);
  // eslint-disable-next-line react-hooks/refs -- the pointer handlers hit-test against the layout on screen
  layoutRef.current = layout;
  const orderRef = useRef(order);
  // eslint-disable-next-line react-hooks/refs -- same
  orderRef.current = order;

  // Width and heights are read before the first paint, then followed.
  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    setWidth((prev) => (prev === w ? prev : w));
    const measured = new Map();
    for (const [id, item] of itemEls.current) measured.set(id, item.offsetHeight);
    setHeights((prev) => {
      if (prev.size === measured.size && [...measured].every(([id, h]) => prev.get(id) === h)) return prev;
      return measured;
    });
  }, []);

  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => measure());
    observerRef.current = observer;
    observer.observe(containerRef.current);
    for (const item of itemEls.current.values()) observer.observe(item);
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [measure]);
  useLayoutEffect(() => {
    measure();
  }, [noteIds, columns, width, measure]);

  const registerItem = useCallback((el) => {
    const id = el.dataset.gridId;
    itemEls.current.set(id, el);
    observerRef.current?.observe(el);
    return () => {
      observerRef.current?.unobserve(el);
      if (itemEls.current.get(id) === el) itemEls.current.delete(id);
    };
  }, []);

  // ── Dragging ─────────────────────────────────────────────────────────
  const placeHeld = () => {
    const d = drag.current;
    const box = containerRef.current?.getBoundingClientRect();
    if (!d?.active || !box) return;
    d.el.style.transform = `translate3d(${d.clientX - box.left - d.offsetX}px, ${d.clientY - box.top - d.offsetY}px, 0)`;
  };

  // Over another card, the held card moves beside it, before or after:
  // whichever brings its empty slot closest to the pointer, and only if
  // closer than where it is. Columns repack when the order changes, so the
  // slot does not always land where the other card was: this keeps it
  // under the pointer instead of chasing it.
  const followPointer = () => {
    const d = drag.current;
    const box = containerRef.current?.getBoundingClientRect();
    if (!d?.active || !box) return;
    placeHeld();
    const px = d.clientX - box.left;
    const py = d.clientY - box.top;
    const { slots, colWidth } = layoutRef.current;
    const inside = (id) => {
      const s = slots.get(id);
      return s && px >= s.x && px < s.x + colWidth && py >= s.y && py < s.y + s.h;
    };
    const ids = orderRef.current;
    const target = ids.find((id) => id !== d.id && inside(id));
    if (!target) return;
    const { heights: hs, width: w, columns: cols, gapX: gx, gapY: gy } = layoutArgs.current;
    let best = null;
    let bestDistance = distanceTo(slots.get(d.id), colWidth, px, py) - MIN_GAIN;
    for (const candidate of placesBeside(ids, d.id, target)) {
      const tried = computeLayout(candidate, hs, w, cols, gx, gy);
      const dist = distanceTo(tried.slots.get(d.id), colWidth, px, py);
      if (dist < bestDistance) {
        best = candidate;
        bestDistance = dist;
      }
    }
    if (best) setDragOrder(best);
  };

  const autoScroll = () => {
    const d = drag.current;
    if (!d?.active) return;
    const scroller = d.scroller;
    const top = scroller ? scroller.getBoundingClientRect().top : 0;
    const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
    let step = 0;
    if (d.clientY < top + EDGE) step = -MAX_SCROLL_STEP * Math.min(1, (top + EDGE - d.clientY) / EDGE);
    else if (d.clientY > bottom - EDGE) step = MAX_SCROLL_STEP * Math.min(1, (d.clientY - (bottom - EDGE)) / EDGE);
    // A card picked up near an edge doesn't scroll the page at once: only
    // once the pointer has been away from the edges and comes back.
    if (!step) d.edgeArmed = true;
    if (step && d.edgeArmed) {
      if (scroller) scroller.scrollTop += step;
      else window.scrollBy(0, step);
      followPointer();
    }
    d.scrollRaf = requestAnimationFrame(autoScroll);
  };

  const startDrag = () => {
    const d = drag.current;
    const box = d.el.getBoundingClientRect();
    d.active = true;
    d.offsetX = d.startX - box.left;
    d.offsetY = d.startY - box.top;
    d.scroller = scrollParent(containerRef.current);
    d.startOrder = orderRef.current;
    finishSettle();
    try { d.el.setPointerCapture(d.pointerId); } catch { /* pointer already gone */ }
    setAnimating(true);
    setDragOrder(orderRef.current);
    setDraggingId(d.id);
    d.scrollRaf = requestAnimationFrame(autoScroll);
  };

  const endDrag = (commit) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    clearTimeout(d.pressTimer);
    cancelAnimationFrame(d.scrollRaf);
    d.detach();
    if (!d.active) return;
    suppressClick.current = true;
    const finalOrder = commit ? orderRef.current : d.startOrder;
    if (!commit) setDragOrder(d.startOrder);
    // The held card glides back into its slot from where it was let go.
    setDraggingId(null);
    pendingSettle.current = () => {
      setAnimating(false);
      const changed = finalOrder.some((id, i) => id !== d.startOrder[i]);
      if (changed) propsRef.current.onReorder?.(finalOrder);
      setDragOrder(null);
    };
    settleTimer.current = setTimeout(finishSettle, SETTLE_MS);
  };

  // Hands the order of the last drop over now: a card picked up again, or
  // the grid going away, must not lose it.
  const finishSettle = () => {
    clearTimeout(settleTimer.current);
    const settle = pendingSettle.current;
    pendingSettle.current = null;
    settle?.();
  };

  const onPointerDown = (id) => (e) => {
    // A click swallowed after a drag may never have come (a long press
    // fires none): it must not take this one.
    suppressClick.current = false;
    if (!propsRef.current.canDrag || drag.current) return;
    if (e.pointerType === "mouse" && (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey)) return;
    if (e.target.closest(INTERACTIVE)) return;
    const el = itemEls.current.get(id);
    if (!el) return;
    const touch = e.pointerType !== "mouse";
    const d = {
      id, el, touch, pointerId: e.pointerId, active: false,
      startX: e.clientX, startY: e.clientY, clientX: e.clientX, clientY: e.clientY,
    };

    const onMove = (ev) => {
      if (ev.pointerId !== d.pointerId) return;
      d.clientX = ev.clientX;
      d.clientY = ev.clientY;
      if (!d.active) {
        const moved = Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY);
        if (touch) {
          // Moving before the long press is a scroll, not a drag.
          if (moved > TOUCH_SLOP) endDrag(false);
        } else if (moved > MOUSE_SLOP) {
          startDrag();
        }
        return;
      }
      followPointer();
    };
    const onUp = (ev) => { if (ev.pointerId === d.pointerId) endDrag(true); };
    const onCancel = (ev) => { if (ev.pointerId === d.pointerId) endDrag(false); };
    const onKey = (ev) => { if (ev.key === "Escape") endDrag(false); };
    // A held card must not scroll the page under the finger.
    const onTouchMove = (ev) => { if (d.active && ev.cancelable) ev.preventDefault(); };
    const onScroll = () => followPointer();

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("scroll", onScroll, true);
    d.detach = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("scroll", onScroll, true);
    };
    if (touch) d.pressTimer = setTimeout(() => { if (drag.current === d) startDrag(); }, LONG_PRESS_MS);
    drag.current = d;
  };

  useEffect(() => () => {
    endDrag(false);
    finishSettle();
    // Listeners and timers only: refs read at unmount on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The held card is placed by hand on every pointer move: React leaves its
  // transform alone until it is let go.
  useLayoutEffect(() => { if (draggingId) placeHeld(); });

  // The click that ends a drag opens nothing.
  const onClickCapture = (e) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  const byId = useMemo(() => new Map(notes.map((n) => [String(n.id), n])), [notes]);

  return (
    <div
      ref={containerRef}
      className="gk-notes-grid"
      data-animating={animating ? "" : undefined}
      style={{ height: layout.height }}
    >
      {noteIds.map((id) => {
        const slot = layout.slots.get(id);
        const held = id === draggingId;
        return (
          <div
            key={id}
            ref={registerItem}
            data-grid-id={id}
            className="gk-grid-item"
            data-held={held ? "" : undefined}
            style={{
              width: layout.colWidth,
              transform: held || !slot ? undefined : `translate3d(${slot.x}px, ${slot.y}px, 0)`,
            }}
            onPointerDown={onPointerDown(id)}
            onClickCapture={onClickCapture}
          >
            {renderCard(byId.get(id))}
          </div>
        );
      })}
    </div>
  );
}
