import { useRef, useEffect } from "react";

/**
 * Touch-based long-press drag for note cards (mobile).
 * After 400ms hold, enters drag mode. Moving finger highlights
 * the target card (via .drag-over). On release, calls onDrop.
 *
 * Sets data-touch-dragging="1" on the card while active so
 * click handlers can ignore the synthetic click after release.
 */
export default function useNoteTouchDrag(cardRef, { canDrag, multiMode, noteId, group, onDragStart, onDrop, onDragEnd }) {
  const propsRef = useRef({ canDrag, multiMode, noteId, group, onDragStart, onDrop, onDragEnd });
  propsRef.current = { canDrag, multiMode, noteId, group, onDragStart, onDrop, onDragEnd };

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    let timer = null;
    let active = false;
    let startX = 0;
    let startY = 0;
    let lastTarget = null;
    let failsafeTimer = null;
    let moveCount = 0;

    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(failsafeTimer);
      timer = null;
      failsafeTimer = null;
      moveCount = 0;
      if (!active) return;
      active = false;
      card.classList.remove("dragging");
      if (lastTarget) { lastTarget.classList.remove("drag-over"); lastTarget = null; }
      card.dataset.touchDragging = "1";
      setTimeout(() => { delete card.dataset.touchDragging; }, 300);
    };

    const onTouchStart = (e) => {
      // If a previous drag is stuck, clean it up first
      if (active) cleanup();

      const p = propsRef.current;
      if (!p.canDrag || p.multiMode) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      moveCount = 0;
      timer = setTimeout(() => {
        active = true;
        try { navigator.vibrate?.(30); } catch (_) {}
        card.classList.add("dragging");
        p.onDragStart(p.noteId, { currentTarget: card });
        // Failsafe: if no touch events come for 6s, force cleanup
        failsafeTimer = setTimeout(cleanup, 6000);
      }, 400);
    };

    const onTouchMove = (e) => {
      const touch = e.touches[0];
      if (!active && timer) {
        if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
          clearTimeout(timer);
          timer = null;
        }
        return;
      }
      if (!active) return;
      e.preventDefault();

      // Reset failsafe on each move (user is still interacting)
      moveCount++;
      clearTimeout(failsafeTimer);
      failsafeTimer = setTimeout(cleanup, 6000);

      if (lastTarget) lastTarget.classList.remove("drag-over");
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const target = el?.closest(".note-card");
      if (target && target !== card) {
        target.classList.add("drag-over");
        lastTarget = target;
      } else {
        lastTarget = null;
      }
    };

    const onTouchEnd = () => {
      clearTimeout(timer);
      timer = null;
      if (!active) return;

      const p = propsRef.current;
      const targetId = lastTarget?.dataset?.noteId;
      cleanup();

      if (targetId) {
        p.onDrop(targetId, p.group, { preventDefault() {}, currentTarget: { classList: { remove() {} } } });
      }
    };

    // Fallback listeners on document for missed events
    const onDocTouchEnd = () => { if (active) cleanup(); };
    const onDocTouchCancel = () => { if (active) cleanup(); };

    card.addEventListener("touchstart", onTouchStart, { passive: true });
    card.addEventListener("touchmove", onTouchMove, { passive: false });
    card.addEventListener("touchend", onTouchEnd);
    card.addEventListener("touchcancel", cleanup);
    document.addEventListener("touchend", onDocTouchEnd);
    document.addEventListener("touchcancel", onDocTouchCancel);

    return () => {
      clearTimeout(timer);
      clearTimeout(failsafeTimer);
      if (active) {
        active = false;
        card.classList.remove("dragging");
        if (lastTarget) { lastTarget.classList.remove("drag-over"); lastTarget = null; }
      }
      card.removeEventListener("touchstart", onTouchStart);
      card.removeEventListener("touchmove", onTouchMove);
      card.removeEventListener("touchend", onTouchEnd);
      card.removeEventListener("touchcancel", cleanup);
      document.removeEventListener("touchend", onDocTouchEnd);
      document.removeEventListener("touchcancel", onDocTouchCancel);
    };
  }, [cardRef]);
}
