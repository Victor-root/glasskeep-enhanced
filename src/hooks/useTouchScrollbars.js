import { useEffect } from "react";

// About the Android scrollbar's own delay plus fade before it hides.
const SHOW_MS = 550;
const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

/**
 * Touch screens: the page's inner scrollbars (globalCSS, data-gk-scrollbar)
 * only show while their box scrolls, like the Android app's page scrollbar,
 * whose thumb is handed the theme accent so both look the same.
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

    // The accent follows the theme and dark classes on <html>.
    const root = document.documentElement;
    let sentAccent = null;
    const sendAccent = () => {
      const accent = getComputedStyle(root).getPropertyValue("--gk-chrome-accent").trim();
      if (accent === sentAccent || !/^#[0-9a-f]{6}$/i.test(accent)) return;
      sentAccent = accent;
      try { window.AndroidTheme?.onScrollbarColor?.(accent); } catch (_) { /* older app */ }
    };
    sendAccent();
    const observer = new MutationObserver(sendAccent);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => {
      document.removeEventListener("scroll", onScroll, opts);
      observer.disconnect();
      timers.forEach((timer, box) => {
        clearTimeout(timer);
        box.removeAttribute("data-gk-scrollbar");
      });
    };
  }, []);
}
