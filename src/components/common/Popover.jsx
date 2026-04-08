import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

/** ---------- Popover Arrow ---------- */
export function PopoverArrow({ anchorRef }) {
  const ref = React.useRef(null);
  const [left, setLeft] = React.useState(0);
  const [dir, setDir] = React.useState("up");
  const [ready, setReady] = React.useState(false);

  useLayoutEffect(() => {
    setReady(false);
    const anchor = anchorRef?.current;
    const el = ref.current;
    if (!anchor || !el) return;
    const update = () => {
      const aRect = anchor.getBoundingClientRect();
      const parent = el.parentElement;
      const pRect = parent.getBoundingClientRect();
      const raw = aRect.left + aRect.width / 2 - pRect.left - 6;
      setLeft(Math.max(2, Math.min(raw, pRect.width - 14)));
      const d = pRect.bottom < aRect.top + aRect.height / 2 ? "down" : "up";
      setDir(d);

      // Flatten the corner nearest the arrow when it's close to the edge
      const nearLeft = raw < 20;
      const nearRight = raw > pRect.width - 32;
      parent.style.borderTopLeftRadius    = (nearLeft && d === "up")   ? "4px" : "";
      parent.style.borderTopRightRadius   = (nearRight && d === "up")  ? "4px" : "";
      parent.style.borderBottomLeftRadius  = (nearLeft && d === "down") ? "4px" : "";
      parent.style.borderBottomRightRadius = (nearRight && d === "down") ? "4px" : "";

      setReady(true);
    };
    const t = setTimeout(update, 80);
    window.addEventListener("resize", update);
    return () => { clearTimeout(t); window.removeEventListener("resize", update); };
  }, [anchorRef]);

  return (
    <div
      ref={ref}
      className={`popover-arrow popover-arrow--${dir}`}
      style={{ left, visibility: ready ? "visible" : "hidden" }}
    />
  );
}

/** ---------- Portal Popover ---------- */
export default function Popover({ anchorRef, open, onClose, children, offset = 8 }) {
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
  }, [open, anchorRef, offset]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const el = boxRef.current;
      const a = anchorRef?.current;
      if (el && el.contains(e.target)) return;
      if (a && a.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener("mousedown", onDown, true); // useCapture: true
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
