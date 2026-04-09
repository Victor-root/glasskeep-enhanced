import { useRef, useEffect } from "react";

/**
 * Touch-based long-press drag for note cards (mobile).
 * After 400ms hold, enters drag mode with scroll locked.
 * Moving finger highlights the target card (via .drag-over).
 * Dragging near top/bottom edge auto-scrolls the page.
 * On release, calls onDrop.
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
    let scrollRaf = null;
    let lastTouchY = 0;
    let prevOverflow = "";

    const lockScroll = () => {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    };

    const unlockScroll = () => {
      document.body.style.overflow = prevOverflow;
    };

    const stopAutoScroll = () => {
      if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = null; }
    };

    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(failsafeTimer);
      stopAutoScroll();
      timer = null;
      failsafeTimer = null;
      if (!active) return;
      active = false;
      unlockScroll();
      card.classList.remove("dragging");
      if (lastTarget) { lastTarget.classList.remove("drag-over"); lastTarget = null; }
      card.dataset.touchDragging = "1";
      setTimeout(() => { delete card.dataset.touchDragging; }, 300);
    };

    // Auto-scroll when finger is near top/bottom edge
    const autoScroll = () => {
      if (!active) return;
      const edgeZone = 80;
      const vh = window.innerHeight;
      let speed = 0;
      if (lastTouchY > vh - edgeZone) {
        speed = Math.min(15, ((lastTouchY - (vh - edgeZone)) / edgeZone) * 15);
      } else if (lastTouchY < edgeZone) {
        speed = -Math.min(15, ((edgeZone - lastTouchY) / edgeZone) * 15);
      }
      if (speed !== 0) {
        // Temporarily unlock scroll to programmatically scroll
        document.body.style.overflow = prevOverflow;
        window.scrollBy(0, speed);
        document.body.style.overflow = "hidden";
      }
      scrollRaf = requestAnimationFrame(autoScroll);
    };

    const onTouchStart = (e) => {
      if (active) cleanup();
      const p = propsRef.current;
      if (!p.canDrag || p.multiMode) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      timer = setTimeout(() => {
        active = true;
        lockScroll();
        try { navigator.vibrate?.(30); } catch (_) {}
        card.classList.add("dragging");
        p.onDragStart(p.noteId, { currentTarget: card });
        failsafeTimer = setTimeout(cleanup, 8000);
        scrollRaf = requestAnimationFrame(autoScroll);
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
      lastTouchY = touch.clientY;

      // Reset failsafe
      clearTimeout(failsafeTimer);
      failsafeTimer = setTimeout(cleanup, 8000);

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
      stopAutoScroll();
      if (active) {
        active = false;
        unlockScroll();
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
