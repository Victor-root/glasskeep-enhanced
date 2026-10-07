import { useEffect } from "react";

// About ScrollThumb's delay plus fade before it hides.
const SHOW_MS = 550;
export const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

/**
 * Touch screens: the page's inner scrollbars (globalCSS, data-gk-scrollbar)
 * only show while their box scrolls, like the page scrollbar (ScrollThumb).
 */
export default function useTouchScrollbars() {
  useEffect(() => {
    if (!window.matchMedia?.(TOUCH_QUERY).matches) return undefined;
    const timers = new Map();

    const onScroll = (e) => {
      const box = e.target;
      if (!(box instanceof Element)) return;
      const timer = timers.get(box);
      if (timer) clearTimeout(timer);
      else box.setAttribute("data-gk-scrollbar", "");
      timers.set(box, setTimeout(() => {
        timers.delete(box);
        box.removeAttribute("data-gk-scrollbar");
      }, SHOW_MS));
    };
    const opts = { capture: true, passive: true };
    document.addEventListener("scroll", onScroll, opts);

    return () => {
      document.removeEventListener("scroll", onScroll, opts);
      timers.forEach((timer, box) => {
        clearTimeout(timer);
        box.removeAttribute("data-gk-scrollbar");
      });
    };
  }, []);
}
