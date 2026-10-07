import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePresence } from "../../hooks/usePresence.js";

// Past this share of its height, or this speed (px/ms) towards its own edge,
// a released drag closes the sheet instead of snapping it back.
const CLOSE_DISTANCE_RATIO = 0.3;
const CLOSE_VELOCITY = 0.5;
// Matches the closing transition in globalCSS (.gk-sheet), plus a margin in
// case transitionend never fires (tab hidden mid-animation).
const UNMOUNT_DELAY_MS = 320;

/**
 * Mobile sheet over a dimmed backdrop, sliding in from the bottom edge
 * (`edge="bottom"`, rounded top corners, handle and title on top) or from
 * the top edge (`edge="top"`, rounded bottom corners, title on top and the
 * handle at the bottom). A grab handle instead of a close button: dragging
 * it (or the title row) towards the sheet's edge follows the finger and
 * closes past a threshold or on a quick flick; tapping the backdrop closes
 * too. `titleAction` sits at the end of the title row. Only transform and
 * opacity animate, both on the compositor. Stays mounted through its
 * closing slide; with `keepMounted` it also stays in the page once closed,
 * hidden, so its content keeps its DOM (e.g. a portal target that must not
 * move).
 */
export default function Sheet({ open, onClose, title, titleAction, edge = "bottom", background, keepMounted = false, children }) {
  // +1 when the sheet closes downwards (bottom edge), -1 upwards (top edge).
  const dir = edge === "top" ? -1 : 1;
  const sheetRef = useRef(null);
  const scrimRef = useRef(null);
  const dragRef = useRef(null);
  const { mounted, shown, unmount } = usePresence(open, sheetRef, UNMOUNT_DELAY_MS);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const setDragStyles = (offset, height) => {
    const sheet = sheetRef.current;
    const scrim = scrimRef.current;
    if (sheet) sheet.style.transform = offset == null ? "" : `translateY(${offset * dir}px)`;
    if (scrim) scrim.style.opacity = offset == null ? "" : String(Math.max(0, 1 - offset / height));
  };

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    // A control in the title row (titleAction) keeps its own tap.
    if (e.target.closest("button, a, input")) return;
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
    if (dt > 0) drag.velocity = ((e.clientY - drag.lastY) * dir) / dt;
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
    setDragStyles(Math.max(0, (e.clientY - drag.startY) * dir), drag.height);
  };

  const onPointerUp = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    const offset = Math.max(0, (e.clientY - drag.startY) * dir);
    const close = offset > drag.height * CLOSE_DISTANCE_RATIO || drag.velocity > CLOSE_VELOCITY;
    // Handing the position back to the stylesheet with transitions restored
    // animates from where the finger left it: on to closed, or back open.
    delete sheetRef.current?.dataset.dragging;
    scrimRef.current?.removeAttribute("data-dragging");
    if (close) onClose();
    setDragStyles(null);
  };

  if (!mounted && !keepMounted) return null;
  const state = shown ? "open" : "closed";
  const dragHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };
  const grabber = <div className="gk-sheet-grabber" />;
  const titleRow = title && (
    <div className="gk-sheet-titlerow">
      <h2 className="gk-sheet-title">{title}</h2>
      {titleAction && <div className="gk-sheet-titleaction">{titleAction}</div>}
    </div>
  );
  return createPortal(
    <div className="gk-sheet-root" data-state={state} hidden={!mounted} inert={!open}>
      <div ref={scrimRef} className="gk-sheet-scrim" data-state={state} onClick={onClose} />
      <div
        ref={sheetRef}
        className="gk-sheet"
        data-edge={edge}
        data-state={state}
        style={background ? { background } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === "transform" && !open) unmount();
        }}
      >
        {edge === "top" ? (
          <>
            {titleRow && <div className="gk-sheet-head" {...dragHandlers}>{titleRow}</div>}
            <div className="gk-sheet-body">{children}</div>
            <div className="gk-sheet-head" {...dragHandlers}>{grabber}</div>
          </>
        ) : (
          <>
            <div className="gk-sheet-head" {...dragHandlers}>
              {grabber}
              {titleRow}
            </div>
            <div className="gk-sheet-body">{children}</div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** One action of a sheet: a coloured icon and its label. */
export function SheetRow({ icon, color, label, onClick }) {
  return (
    <button type="button" className="gk-sheet-row" onClick={onClick}>
      <span className="gk-sheet-row-icon" style={{ color }}>{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}
