import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

/** ---------- App ---------- */
export default function TooltipPortal() {
  const [tooltip, setTooltip] = useState(null);
  useEffect(() => {
    let timer = null;

    const getTooltipData = (el) => {
      const label = el.getAttribute('data-tooltip');
      if (!label) return null;
      const rect = el.getBoundingClientRect();
      const below = rect.top < 60;
      return { label, x: rect.left + rect.width / 2, y: below ? rect.bottom : rect.top, below };
    };

    // Desktop: mouse pointer only (pointerType === 'mouse' excludes touch/pen)
    const show = (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target.closest('[data-tooltip]');
      if (!el) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const data = getTooltipData(el);
        if (data) setTooltip(data);
      }, 600);
    };
    const hide = (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(timer);
      setTooltip(null);
    };

    // Mobile: show only after 2s long press, stay visible 2s after release
    let hideTimer = null;
    const touchStart = (e) => {
      const el = e.target.closest('[data-tooltip]');
      if (!el) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const data = getTooltipData(el);
        if (data) {
          setTooltip(data);
          clearTimeout(hideTimer);
          hideTimer = setTimeout(() => setTooltip(null), 5000);
        }
      }, 1000);
    };
    const touchEnd = () => clearTimeout(timer); // cancel pending show, keep visible if already shown
    const touchCancel = () => {
      clearTimeout(timer);
      setTooltip(null); // scroll/move cancels immediately
    };

    document.addEventListener('pointerover', show);
    document.addEventListener('pointerout', hide);
    document.addEventListener('touchstart', touchStart, { passive: true });
    document.addEventListener('touchend', touchEnd);
    document.addEventListener('touchmove', touchCancel, { passive: true });
    return () => {
      clearTimeout(timer);
      clearTimeout(hideTimer);
      document.removeEventListener('pointerover', show);
      document.removeEventListener('pointerout', hide);
      document.removeEventListener('touchstart', touchStart);
      document.removeEventListener('touchend', touchEnd);
      document.removeEventListener('touchmove', touchCancel);
    };
  }, []);
  const boxRef = useRef(null);
  useLayoutEffect(() => {
    if (!tooltip || !boxRef.current) return;
    const el = boxRef.current;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    let shift = 0;
    if (rect.left < pad) shift = pad - rect.left;
    else if (rect.right > vw - pad) shift = vw - pad - rect.right;
    if (shift !== 0) {
      el.style.transform = tooltip.below
        ? `translateX(calc(-50% + ${shift}px))`
        : `translate(calc(-50% + ${shift}px), -100%)`;
    }
  }, [tooltip]);

  if (!tooltip) return null;
  return createPortal(
    <div
      ref={boxRef}
      className="pointer-events-none fixed z-[100001]"
      style={tooltip.below
        ? { top: tooltip.y + 8, left: tooltip.x, transform: 'translateX(-50%)' }
        : { top: tooltip.y - 8, left: tooltip.x, transform: 'translate(-50%, -100%)' }
      }
    >
      <div className="px-2.5 py-1 text-xs font-medium text-white bg-gray-800 rounded-lg whitespace-nowrap shadow-xl">
        {tooltip.label}
        <div className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${tooltip.below ? 'bottom-full border-b-gray-800' : 'top-full border-t-gray-800'}`} />
      </div>
    </div>,
    document.body
  );
}
