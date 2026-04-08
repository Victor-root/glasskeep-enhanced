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

    const cleanup = () => {
      clearTimeout(timer);
      timer = null;
      if (!active) return;
      active = false;
      card.classList.remove("dragging");
      if (lastTarget) { lastTarget.classList.remove("drag-over"); lastTarget = null; }
      // Block the click that fires after touchend (50ms window)
      card.dataset.touchDragging = "1";
      setTimeout(() => { delete card.dataset.touchDragging; }, 300);
    };

    const onTouchStart = (e) => {
      const p = propsRef.current;
      if (!p.canDrag || p.multiMode) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      timer = setTimeout(() => {
        active = true;
        try { navigator.vibrate?.(30); } catch (_) {}
        card.classList.add("dragging");
        p.onDragStart(p.noteId, { currentTarget: card });
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

    const onTouchEnd = (e) => {
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

    // Fallback: listen on document for touchend in case card doesn't receive it
    const onDocTouchEnd = () => {
      if (active) cleanup();
    };

    card.addEventListener("touchstart", onTouchStart, { passive: true });
    card.addEventListener("touchmove", onTouchMove, { passive: false });
    card.addEventListener("touchend", onTouchEnd);
    card.addEventListener("touchcancel", cleanup);
    document.addEventListener("touchend", onDocTouchEnd);

    return () => {
      clearTimeout(timer);
      // Always clean up visual state on unmount
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
    };
  }, [cardRef]);
}
