import { useEffect, useLayoutEffect, useState } from "react";
import { anchoredArrowLeft } from "../utils/anchoredPanel.js";

/**
 * Places a fixed panel `width` px wide under its anchor button, or above
 * it when less than `minSpaceBelow` px remain below, kept on screen, and
 * closes it on a mousedown outside both. Shared by ColorPickerPanel and
 * LogoPickerPopover. `followScroll` also re-places it on any scroll.
 */
export default function useAnchoredPanel({ open, anchorRef, panelRef, onClose, width, minSpaceBelow, followScroll = false }) {
  const [pos, setPos] = useState({ top: 0, left: 0, dropUp: false, arrowLeft: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef?.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const dropUp = spaceBelow < minSpaceBelow;
      let left = Math.min(r.left, window.innerWidth - width - 8);
      left = Math.max(8, left);
      const arrowLeft = anchoredArrowLeft(r, left);
      setPos({ top: dropUp ? r.top - 8 : r.bottom + 8, left, dropUp, arrowLeft });
    };
    place();
    window.addEventListener("resize", place);
    if (followScroll) window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      if (followScroll) window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef, width, minSpaceBelow, followScroll]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open, onClose, anchorRef, panelRef]);

  return pos;
}
