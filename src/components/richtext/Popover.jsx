// Anchored popover primitives for the rich-text toolbar.
//
// Problem we solve: the v2 popovers were `position: absolute` inside the
// toolbar, which meant a popover opened near the right edge of the modal
// extended the modal's scroll width and produced a horizontal scrollbar.
// We switch to `position: fixed` with coordinates derived from the anchor
// button's bounding rect, clamped to the viewport. The popover now floats
// above everything else without influencing parent layout.

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const POP_GAP = 6;
const POP_EDGE_MARGIN = 8;

export function usePopoverPosition(anchorRef, open, popRef, preferredWidth = 220) {
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open) return;
    const compute = () => {
      const btn = anchorRef?.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const popEl = popRef?.current;
      const measuredW = popEl?.offsetWidth || preferredWidth;
      const measuredH = popEl?.offsetHeight || 0;

      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;

      let left = r.left;
      // Keep fully inside the viewport horizontally.
      if (left + measuredW + POP_EDGE_MARGIN > vw) {
        left = Math.max(POP_EDGE_MARGIN, vw - measuredW - POP_EDGE_MARGIN);
      }
      if (left < POP_EDGE_MARGIN) left = POP_EDGE_MARGIN;

      // Prefer below; flip above if not enough room.
      let top = r.bottom + POP_GAP;
      if (measuredH && top + measuredH + POP_EDGE_MARGIN > vh) {
        const above = r.top - POP_GAP - measuredH;
        if (above >= POP_EDGE_MARGIN) top = above;
        else top = Math.max(POP_EDGE_MARGIN, vh - measuredH - POP_EDGE_MARGIN);
      }

      setPos({ top, left });
    };

    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true); // capture phase — catches modal scroll
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open, anchorRef, popRef, preferredWidth]);

  return pos;
}

export function Popover({ open, onClose, anchorRef, children, className = "", preferredWidth }) {
  const ref = useRef(null);
  const pos = usePopoverPosition(anchorRef, open, ref, preferredWidth);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose?.();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    };
    // Capture phase: ProseMirror calls stopPropagation on some mousedowns
    // inside the editor (its selection handling), which otherwise swallowed
    // this document-level listener. Listening at capture phase guarantees we
    // see the event before the editor handles it, so clicking on the note
    // body now reliably closes an open popover.
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorRef, onClose]);

  if (!open) return null;
  const style = pos
    ? { top: `${pos.top}px`, left: `${pos.left}px` }
    : { top: "-9999px", left: "-9999px" }; // first-frame measurement off-screen

  // Render into document.body so the popover escapes any ancestor that holds
  // a `transform` (the modal card keeps one after its open animation), which
  // would otherwise turn `position: fixed` into "fixed relative to the
  // transformed ancestor" — that's what put popovers in the middle of the
  // modal instead of next to the button.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      className={`rt-pop ${className}`.trim()}
      style={style}
      role="dialog"
    >
      {children}
    </div>,
    document.body,
  );
}

export default Popover;
