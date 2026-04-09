import { useRef, useEffect } from "react";

/**
 * Touch-based long-press drag for note cards (mobile).
 * After 400ms hold, enters drag mode.
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
    let noMoveTimer = null;
    let gotMoveAfterActivation = false;
    let scrollRaf = null;
    let lastTouchY = 0;

    const stopAutoScroll = () => {
      if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = null; }
    };

    const log = (...args) => console.log("[DRAG]", ...args);

    const cleanup = (reason) => {
      if (reason) log("cleanup:", reason);
      clearTimeout(timer);
      clearTimeout(failsafeTimer);
      clearTimeout(noMoveTimer);
      stopAutoScroll();
      timer = null;
      failsafeTimer = null;
      noMoveTimer = null;
      if (!active) return;
      log("→ deactivating, removing dragging class");
      active = false;
      card.classList.remove("dragging");
      if (lastTarget) { lastTarget.classList.remove("drag-over"); lastTarget = null; }
      card.dataset.touchDragging = "1";
      setTimeout(() => { delete card.dataset.touchDragging; }, 300);
    };

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
      if (speed !== 0) window.scrollBy(0, speed);
      scrollRaf = requestAnimationFrame(autoScroll);
    };

    const onTouchStart = (e) => {
      log("touchstart", { active, hasTimer: !!timer, touches: e.touches.length, noteId: propsRef.current.noteId });
      if (active) { log("⚠ still active, forcing cleanup"); cleanup("stale active"); }
      const p = propsRef.current;
      if (!p.canDrag || p.multiMode) { log("skip: canDrag=", p.canDrag, "multi=", p.multiMode); return; }
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      timer = setTimeout(() => {
        log("✅ 400ms timer → ACTIVATE", { noteId: p.noteId, classList: [...card.classList] });
        active = true;
        gotMoveAfterActivation = false;
        lastTouchY = startY;
        card.classList.add("dragging");
        p.onDragStart(p.noteId, { currentTarget: card });
        // If browser stole the touch, no touchmove will arrive → cancel quickly
        noMoveTimer = setTimeout(() => {
          if (active && !gotMoveAfterActivation) {
            log("⚠ no touchmove after 600ms → browser stole touch, cancelling");
            cleanup("no-move-abort");
          }
        }, 600);
        failsafeTimer = setTimeout(() => cleanup("failsafe 3s"), 3000);
        scrollRaf = requestAnimationFrame(autoScroll);
      }, 400);
    };

    const onTouchMove = (e) => {
      const touch = e.touches[0];
      if (!active && timer) {
        const dx = Math.abs(touch.clientX - startX);
        const dy = Math.abs(touch.clientY - startY);
        if (dx > 10 || dy > 10) {
          log("❌ moved before activation (dx=" + dx.toFixed(0) + " dy=" + dy.toFixed(0) + ") → cancel");
          clearTimeout(timer);
          timer = null;
        }
        return;
      }
      if (!active) return;
      e.preventDefault();
      gotMoveAfterActivation = true;
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
      log("touchend on card", { active, hasTimer: !!timer, targetId: lastTarget?.dataset?.noteId });
      clearTimeout(timer);
      timer = null;
      if (!active) { log("touchend ignored (not active)"); return; }

      const p = propsRef.current;
      const targetId = lastTarget?.dataset?.noteId;
      log("→ drop", { targetId });
      cleanup();

      if (targetId) {
        p.onDrop(targetId, p.group, { preventDefault() {}, currentTarget: { classList: { remove() {} } } });
      }
    };

    const onCardTouchCancel = () => { log("touchcancel on card"); cleanup("card touchcancel"); };
    const onDocTouchEnd = () => { if (active) { log("touchend on DOCUMENT fallback"); cleanup("doc touchend"); } };
    const onDocTouchCancel = () => { if (active) { log("touchcancel on DOCUMENT fallback"); cleanup("doc touchcancel"); } };

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
      if (active) {
        active = false;
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
