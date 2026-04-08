import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

/** ---------- Portal Popover ---------- */
export default function Popover({ anchorRef, open, onClose, children, offset = 8, showArrow = false }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);
  const boxRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) { setReady(false); return; }
    const place = () => {
      const a = anchorRef?.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      let top = r.bottom + offset;
      let left = r.left;
      setPos({ top, left });
      requestAnimationFrame(() => {
        const el = boxRef.current;
        if (!el) return;
        const bw = el.offsetWidth;
        const bh = el.offsetHeight;
        let t = top;
        let l = left;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (l + bw + 8 > vw) l = Math.max(8, vw - bw - 8);
        if (t + bh + 8 > vh) {
          t = Math.max(8, r.top - bh - offset);
        }
        setPos({ top: t, left: l });
        setReady(true);

        // Set arrow CSS variables on the first child (the styled content div)
        if (showArrow) {
          const fc = el.firstElementChild;
          if (fc) {
            const arrowLeft = r.left + r.width / 2 - l - 6;
            const dir = t < r.top ? "down" : "up";
            fc.style.setProperty("--arrow-left", `${arrowLeft}px`);
            fc.dataset.arrow = dir;
            const nearLeft = arrowLeft < 20;
            const nearRight = arrowLeft > bw - 32;
            fc.style.borderTopLeftRadius     = (nearLeft && dir === "up")   ? "4px" : "";
            fc.style.borderTopRightRadius    = (nearRight && dir === "up")  ? "4px" : "";
            fc.style.borderBottomLeftRadius   = (nearLeft && dir === "down") ? "4px" : "";
            fc.style.borderBottomRightRadius  = (nearRight && dir === "down") ? "4px" : "";
          }
        }
      });
    };
    place();
    const onWin = () => place();
    window.addEventListener("scroll", onWin, true);
    window.addEventListener("resize", onWin);
    return () => {
      window.removeEventListener("scroll", onWin, true);
      window.removeEventListener("resize", onWin);
    };
  }, [open, anchorRef, offset, showArrow]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const el = boxRef.current;
      const a = anchorRef?.current;
      if (el && el.contains(e.target)) return;
      if (a && a.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={boxRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 10000, visibility: ready ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}
