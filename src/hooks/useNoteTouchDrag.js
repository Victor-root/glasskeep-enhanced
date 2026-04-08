import { useRef, useEffect } from "react";

/**
 * Touch-based long-press drag for note cards (mobile).
 * After 400ms hold, enters drag mode. Moving finger highlights
 * the target card (via .drag-over). On release, calls onDrop.
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

    const onTouchEnd = () => {
      clearTimeout(timer);
      timer = null;
      if (!active) return;
      active = false;

      const p = propsRef.current;
      if (lastTarget) {
        const targetId = lastTarget.dataset.noteId;
        lastTarget.classList.remove("drag-over");
        lastTarget = null;
        if (targetId) {
          p.onDrop(targetId, p.group, { preventDefault() {}, currentTarget: { classList: { remove() {} } } });
        }
      }
      card.classList.remove("dragging");
    };

    const onTouchCancel = () => {
      clearTimeout(timer);
      timer = null;
      if (active) {
        active = false;
        card.classList.remove("dragging");
        if (lastTarget) { lastTarget.classList.remove("drag-over"); lastTarget = null; }
      }
    };

    card.addEventListener("touchstart", onTouchStart, { passive: true });
    card.addEventListener("touchmove", onTouchMove, { passive: false });
    card.addEventListener("touchend", onTouchEnd);
    card.addEventListener("touchcancel", onTouchCancel);

    return () => {
      clearTimeout(timer);
      card.removeEventListener("touchstart", onTouchStart);
      card.removeEventListener("touchmove", onTouchMove);
      card.removeEventListener("touchend", onTouchEnd);
      card.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [cardRef]);
}
