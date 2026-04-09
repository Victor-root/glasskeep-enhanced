import { useRef, useEffect } from "react";

/**
 * Touch-based long-press drag for note cards (mobile).
 * Uses DOM data attributes for drag state so it survives React re-renders.
 */
export default function useNoteTouchDrag(cardRef, { canDrag, multiMode, noteId, group, onDragStart, onDrop, onDragEnd }) {
  const propsRef = useRef({ canDrag, multiMode, noteId, group, onDragStart, onDrop, onDragEnd });
  propsRef.current = { canDrag, multiMode, noteId, group, onDragStart, onDrop, onDragEnd };

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    // Use DOM attributes for state that must survive React re-renders
    const isActive = () => card.dataset.dragActive === "1";
    const setActive = (v) => { if (v) card.dataset.dragActive = "1"; else delete card.dataset.dragActive; };

    let timer = null;
    let failsafeTimer = null;
    let noMoveTimer = null;
    let gotMove = false;
    let scrollRaf = null;
    let startX = 0;
    let startY = 0;
    let lastTouchY = 0;
    let lastTarget = null;

    const stopAutoScroll = () => { if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = null; } };

    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(failsafeTimer);
      clearTimeout(noMoveTimer);
      stopAutoScroll();
      timer = null;
      failsafeTimer = null;
      noMoveTimer = null;
      if (!isActive()) return;
      setActive(false);
      card.classList.remove("dragging");
      if (lastTarget) { lastTarget.classList.remove("drag-over"); lastTarget = null; }
      card.dataset.touchDragging = "1";
      setTimeout(() => { delete card.dataset.touchDragging; }, 300);
    };

    const autoScroll = () => {
      if (!isActive()) return;
      const edgeZone = 80;
      const vh = window.innerHeight;
      let speed = 0;
      if (lastTouchY > vh - edgeZone) speed = Math.min(15, ((lastTouchY - (vh - edgeZone)) / edgeZone) * 15);
      else if (lastTouchY < edgeZone) speed = -Math.min(15, ((edgeZone - lastTouchY) / edgeZone) * 15);
      if (speed !== 0) window.scrollBy(0, speed);
      scrollRaf = requestAnimationFrame(autoScroll);
    };

    const onTouchStart = (e) => {
      if (isActive()) cleanup();
      const p = propsRef.current;
      if (!p.canDrag || p.multiMode) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      gotMove = false;
      timer = setTimeout(() => {
        setActive(true);
        lastTouchY = startY;
        card.classList.add("dragging");
        p.onDragStart(p.noteId, { currentTarget: card });
        noMoveTimer = setTimeout(() => { if (isActive() && !gotMove) cleanup(); }, 600);
        failsafeTimer = setTimeout(cleanup, 3000);
        scrollRaf = requestAnimationFrame(autoScroll);
      }, 400);
    };

    const onTouchMove = (e) => {
      const touch = e.touches[0];
      if (!isActive() && timer) {
        if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
          clearTimeout(timer);
          timer = null;
        }
        return;
      }
      if (!isActive()) return;
      e.preventDefault();
      gotMove = true;
      lastTouchY = touch.clientY;

      clearTimeout(failsafeTimer);
      failsafeTimer = setTimeout(cleanup, 3000);

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
      if (!isActive()) return;
      const p = propsRef.current;
      const targetId = lastTarget?.dataset?.noteId;
      cleanup();
      if (targetId) {
        p.onDrop(targetId, p.group, { preventDefault() {}, currentTarget: { classList: { remove() {} } } });
      }
    };

    const onCardTouchCancel = () => cleanup();
    const onDocTouchEnd = () => { if (isActive()) cleanup(); };
    const onDocTouchCancel = () => { if (isActive()) cleanup(); };

    card.addEventListener("touchstart", onTouchStart, { passive: true });
    card.addEventListener("touchmove", onTouchMove, { passive: false });
    card.addEventListener("touchend", onTouchEnd);
    card.addEventListener("touchcancel", onCardTouchCancel);
    document.addEventListener("touchend", onDocTouchEnd);
    document.addEventListener("touchcancel", onDocTouchCancel);

    return () => {
      clearTimeout(timer);
      clearTimeout(failsafeTimer);
      clearTimeout(noMoveTimer);
      stopAutoScroll();
      // DON'T reset drag state here — DOM state persists across re-renders.
      // Only remove event listeners. The new effect run will re-attach them
      // and they'll read the current DOM state.
      card.removeEventListener("touchstart", onTouchStart);
      card.removeEventListener("touchmove", onTouchMove);
      card.removeEventListener("touchend", onTouchEnd);
      card.removeEventListener("touchcancel", onCardTouchCancel);
      document.removeEventListener("touchend", onDocTouchEnd);
      document.removeEventListener("touchcancel", onDocTouchCancel);
    };
  }, [cardRef]);
}
