import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Past this share of its height, or this downward speed (px/ms), a released
// drag closes the sheet instead of snapping it back.
const CLOSE_DISTANCE_RATIO = 0.3;
const CLOSE_VELOCITY = 0.5;
// Matches the closing transition in globalCSS (.gk-sheet), plus a margin in
// case transitionend never fires (tab hidden mid-animation).
const UNMOUNT_DELAY_MS = 320;

/**
 * Mobile bottom sheet: rises from the bottom over a dimmed backdrop, rounded
 * top corners, a grab handle instead of a close button. Dragging the handle
 * (or the title row) follows the finger and closes past a threshold or on a
 * quick flick; tapping the backdrop closes too. Only transform and opacity
 * animate, both on the compositor. Stays mounted through its closing slide.
 */
export default function BottomSheet({ open, onClose, title, children }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const sheetRef = useRef(null);
  const scrimRef = useRef(null);
  const dragRef = useRef(null);

  useLayoutEffect(() => {
    if (open) setMounted(true);
    else setShown(false);
  }, [open]);

  // Mounted closed first, its closed position resolved (the read below),
  // then opened on the next frame so the slide-in starts off-screen.
  useEffect(() => {
    if (!mounted || !open) return undefined;
    void sheetRef.current?.offsetHeight;
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [mounted, open]);

  useEffect(() => {
    if (open || !mounted) return undefined;
    const timer = setTimeout(() => setMounted(false), UNMOUNT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const setDragStyles = (offset, height) => {
    const sheet = sheetRef.current;
    const scrim = scrimRef.current;
    if (sheet) sheet.style.transform = offset == null ? "" : `translateY(${offset}px)`;
    if (scrim) scrim.style.opacity = offset == null ? "" : String(Math.max(0, 1 - offset / height));
  };

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    dragRef.current = {
      startY: e.clientY,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      height: sheet.getBoundingClientRect().height,
    };
    sheet.dataset.dragging = "";
    scrimRef.current?.setAttribute("data-dragging", "");
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.velocity = (e.clientY - drag.lastY) / dt;
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
    setDragStyles(Math.max(0, e.clientY - drag.startY), drag.height);
  };

  const onPointerUp = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    const offset = Math.max(0, e.clientY - drag.startY);
    const close = offset > drag.height * CLOSE_DISTANCE_RATIO || drag.velocity > CLOSE_VELOCITY;
    // Handing the position back to the stylesheet with transitions restored
    // animates from where the finger left it: down to closed, or back up.
    delete sheetRef.current?.dataset.dragging;
    scrimRef.current?.removeAttribute("data-dragging");
    if (close) onClose();
    setDragStyles(null);
  };

  if (!mounted) return null;
  const state = shown ? "open" : "closed";
  return createPortal(
    <div className="gk-sheet-root" data-state={state}>
      <div ref={scrimRef} className="gk-sheet-scrim" data-state={state} onClick={onClose} />
      <div
        ref={sheetRef}
        className="gk-sheet"
        data-state={state}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === "transform" && !open) setMounted(false);
        }}
      >
        <div
          className="gk-sheet-head"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="gk-sheet-grabber" />
          {title && <h2 className="gk-sheet-title">{title}</h2>}
        </div>
        <div className="gk-sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
