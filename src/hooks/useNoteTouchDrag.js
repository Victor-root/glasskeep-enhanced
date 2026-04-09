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

    const cleanup = (reason) => {
      if (reason) log("cleanup:", reason);
      clearTimeout(timer);
      clearTimeout(failsafeTimer);
      stopAutoScroll();
      timer = null;
      failsafeTimer = null;
      if (!active) return;
      log("→ removing dragging class, unlocking scroll");
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

    const log = (...args) => console.log("[DRAG]", ...args);

    const onTouchStart = (e) => {
      log("touchstart", { active, hasTimer: !!timer, touches: e.touches.length, noteId: propsRef.current.noteId });
      if (active) { log("⚠ was still active, forcing cleanup"); cleanup(); }
      const p = propsRef.current;
      if (!p.canDrag || p.multiMode) { log("skip: canDrag=", p.canDrag, "multiMode=", p.multiMode); return; }
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      timer = setTimeout(() => {
        log("✅ 400ms timer fired → ACTIVATE drag");
        active = true;
        lockScroll();
        try { navigator.vibrate?.(30); } catch (_) {}
        card.classList.add("dragging");
        p.onDragStart(p.noteId, { currentTarget: card });
        failsafeTimer = setTimeout(() => { log("⚠ failsafe 8s triggered"); cleanup(); }, 8000);
        scrollRaf = requestAnimationFrame(autoScroll);
      }, 400);
    };

    const onTouchMove = (e) => {
      const touch = e.touches[0];
      if (!active && timer) {
        const dx = Math.abs(touch.clientX - startX);
        const dy = Math.abs(touch.clientY - startY);
        if (dx > 10 || dy > 10) {
          log("❌ moved too much before activation (dx=" + dx.toFixed(0) + " dy=" + dy.toFixed(0) + ") → cancel timer");
          clearTimeout(timer);
          timer = null;
        }
        return;
      }
      if (!active) return;
      e.preventDefault();
      lastTouchY = touch.clientY;

      clearTimeout(failsafeTimer);
      failsafeTimer = setTimeout(() => { log("⚠ failsafe 8s triggered"); cleanup(); }, 8000);

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
      log("touchend on card", { active, hasTimer: !!timer, targetId: lastTarget?.dataset?.noteId });
      clearTimeout(timer);
      timer = null;
      if (!active) { log("touchend ignored (not active)"); return; }

      const p = propsRef.current;
      const targetId = lastTarget?.dataset?.noteId;
      log("→ cleanup + drop", { targetId });
      cleanup();

      if (targetId) {
        p.onDrop(targetId, p.group, { preventDefault() {}, currentTarget: { classList: { remove() {} } } });
      }
    };

    const onDocTouchEnd = () => { if (active) { log("touchend on DOCUMENT (fallback)"); cleanup(); } };
    const onDocTouchCancel = () => { if (active) { log("touchcancel on DOCUMENT (fallback)"); cleanup(); } };

    const onCardTouchCancel = () => { log("touchcancel on card"); cleanup("card touchcancel"); };

    card.addEventListener("touchstart", onTouchStart, { passive: true });
    card.addEventListener("touchmove", onTouchMove, { passive: false });
    card.addEventListener("touchend", onTouchEnd);
    card.addEventListener("touchcancel", onCardTouchCancel);
    document.addEventListener("touchend", onDocTouchEnd);
    document.addEventListener("touchcancel", onDocTouchCancel);

    return () => {
      log("useEffect cleanup (unmount/re-run)");
      clearTimeout(timer);
      clearTimeout(failsafeTimer);
      stopAutoScroll();
      if (active) {
        log("→ was active during cleanup, forcing reset");
        active = false;
        unlockScroll();
        card.classList.remove("dragging");
        if (lastTarget) { lastTarget.classList.remove("drag-over"); lastTarget = null; }
      }
      card.removeEventListener("touchstart", onTouchStart);
      card.removeEventListener("touchmove", onTouchMove);
      card.removeEventListener("touchend", onTouchEnd);
      card.removeEventListener("touchcancel", onCardTouchCancel);
      document.removeEventListener("touchend", onDocTouchEnd);
      document.removeEventListener("touchcancel", onDocTouchCancel);
    };
  }, [cardRef]);
}
