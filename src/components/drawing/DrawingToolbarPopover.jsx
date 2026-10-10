import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/* ─── Compact Popover (portal, auto-position, outside click to close) ─── */
export default function DrawingToolbarPopover({ anchorRef, open, onClose, darkMode, children }) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);

  React.useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on close so the next opening stays hidden until it is placed
    if (!open) { setReady(false); return; }
    const place = () => {
      const a = anchorRef?.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const gap = 10;
      // Try below first
      let top = r.bottom + gap;
      let left = r.left + r.width / 2;
      setPos({ top, left });
      requestAnimationFrame(() => {
        const el = panelRef.current;
        if (!el) return;
        const bw = el.offsetWidth;
        const bh = el.offsetHeight;
        let t = top;
        let l = left - bw / 2; // center on anchor
        if (l + bw + 8 > window.innerWidth) l = window.innerWidth - bw - 8;
        if (l < 8) l = 8;
        if (t + bh + 8 > window.innerHeight) t = r.top - bh - gap;
        setPos({ top: t, left: l });
        setReady(true);
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      e.stopPropagation();
      onClose?.();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999, visibility: ready ? "visible" : "hidden" }}
      className={`rounded-2xl shadow-2xl backdrop-blur-xl border ring-1 ring-black/5 dark:ring-white/5 p-3 ${
        darkMode ? "bg-gray-900/98 border-gray-700/50" : "bg-white/98 border-gray-100/80"
      }`}
    >
      {children}
    </div>,
    document.body,
  );
}
