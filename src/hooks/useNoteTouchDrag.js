import { useRef, useEffect } from "react";

/**
 * Unified pointer-based drag for note cards (desktop + mobile).
 * - Mouse: activates after 5px movement (instant, no long-press needed)
 * - Touch: activates after 400ms long-press (avoids scroll conflict)
 * Uses DOM data attributes for state to survive React re-renders.
 */
export default function useNoteDrag(cardRef, { canDrag, multiMode, noteId, group, onDragStart, onDrop, onDragEnd }) {
  const propsRef = useRef({ canDrag, multiMode, noteId, group, onDragStart, onDrop, onDragEnd });
  propsRef.current = { canDrag, multiMode, noteId, group, onDragStart, onDrop, onDragEnd };

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const isActive = () => card.dataset.dragActive === "1";
    const setActive = (v) => { if (v) card.dataset.dragActive = "1"; else delete card.dataset.dragActive; };

    let timer = null;
    let failsafeTimer = null;
    let scrollRaf = null;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lastTarget = null;
    let pointerType = "";
    let pointerId = -1;
    let activated = false;

    const stopAutoScroll = () => { if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = null; } };

    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(failsafeTimer);
      stopAutoScroll();
      timer = null;
      failsafeTimer = null;
      activated = false;
      if (!isActive()) return;
      setActive(false);
      card.classList.remove("dragging");
      document.body.classList.remove("note-reordering");
      if (lastTarget) { lastTarget.classList.remove("drag-over"); lastTarget = null; }
      card.dataset.touchDragging = "1";
      setTimeout(() => { delete card.dataset.touchDragging; }, 300);
    };

    const autoScroll = () => {
      if (!isActive()) return;
      const edgeZone = 80;
      const vh = window.innerHeight;
      let speed = 0;
      if (lastY > vh - edgeZone) speed = Math.min(15, ((lastY - (vh - edgeZone)) / edgeZone) * 15);
      else if (lastY < edgeZone) speed = -Math.min(15, ((edgeZone - lastY) / edgeZone) * 15);
      if (speed !== 0) window.scrollBy(0, speed);
      scrollRaf = requestAnimationFrame(autoScroll);
    };

    const activate = () => {
      const p = propsRef.current;
      activated = true;
      setActive(true);
      lastY = startY;
      card.classList.add("dragging");
      document.body.classList.add("note-reordering");
      p.onDragStart(p.noteId, { currentTarget: card });
      failsafeTimer = setTimeout(cleanup, 4000);
      scrollRaf = requestAnimationFrame(autoScroll);
    };

    const onPointerDown = (e) => {
      if (isActive()) cleanup();
      const p = propsRef.current;
      if (!p.canDrag || p.multiMode) return;
      if (e.button && e.button !== 0) return;

      pointerType = e.pointerType;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      activated = false;

      if (pointerType === "touch") {
        // Touch: 400ms long-press to activate
        timer = setTimeout(activate, 400);
      }
      // Mouse: activate on movement (handled in pointermove)
    };

    const onPointerMove = (e) => {
      if (e.pointerId !== pointerId) return;
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);

      if (!isActive() && pointerType === "touch" && timer) {
        // Touch: cancel if moved before 400ms
        if (dx > 10 || dy > 10) {
          clearTimeout(timer);
          timer = null;
        }
        return;
      }

      if (!isActive() && pointerType === "mouse") {
        // Mouse: activate after 5px movement
        if (dx > 5 || dy > 5) {
          activate();
          // Capture pointer so we get events even outside the card
          try { card.setPointerCapture(pointerId); } catch (_) {}
        }
        return;
      }

      if (!isActive()) return;

      lastY = e.clientY;
      clearTimeout(failsafeTimer);
      failsafeTimer = setTimeout(cleanup, 4000);

      if (lastTarget) lastTarget.classList.remove("drag-over");
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target = el?.closest(".note-card");
      if (target && target !== card) {
        target.classList.add("drag-over");
        lastTarget = target;
      } else {
        lastTarget = null;
      }
    };

    const onPointerUp = (e) => {
      if (e.pointerId !== pointerId) return;
      clearTimeout(timer);
      timer = null;
      try { card.releasePointerCapture(pointerId); } catch (_) {}
      if (!isActive()) return;

      const p = propsRef.current;
      const targetId = lastTarget?.dataset?.noteId;
      cleanup();

      if (targetId) {
        p.onDrop(targetId, p.group, { preventDefault() {}, currentTarget: { classList: { remove() {} } } });
      }
    };

    const onPointerCancel = () => {
      clearTimeout(timer);
      timer = null;
      if (isActive()) cleanup();
    };

    const onContextMenu = (e) => e.preventDefault();

    card.addEventListener("pointerdown", onPointerDown);
    card.addEventListener("pointermove", onPointerMove);
    card.addEventListener("pointerup", onPointerUp);
    card.addEventListener("pointercancel", onPointerCancel);
    card.addEventListener("contextmenu", onContextMenu);

    return () => {
      clearTimeout(timer);
      clearTimeout(failsafeTimer);
      stopAutoScroll();
      card.removeEventListener("pointerdown", onPointerDown);
      card.removeEventListener("pointermove", onPointerMove);
      card.removeEventListener("pointerup", onPointerUp);
      card.removeEventListener("pointercancel", onPointerCancel);
      card.removeEventListener("contextmenu", onContextMenu);
    };
  }, [cardRef]);
}
