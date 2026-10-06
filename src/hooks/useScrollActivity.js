import { useEffect } from "react";

const IDLE_MS = 180;

// Flags <html data-gk-scrolling> while anything scrolls (capture phase catches
// the window and every inner scroll container) and clears it IDLE_MS after the
// last scroll event. The CSS keys off it to pause the decorative background
// and to hold back the note cards' hover effects while they slide under a
// resting pointer (the idle-hover variants in index.css). An attribute rather
// than a class: rules matching <html>'s class list (the workspace themes)
// would otherwise be re-evaluated at every scroll start and end.
export default function useScrollActivity() {
  useEffect(() => {
    const root = document.documentElement;
    let idleTimer = null;

    const clear = () => {
      idleTimer = null;
      root.removeAttribute("data-gk-scrolling");
    };
    const onScroll = () => {
      if (idleTimer) clearTimeout(idleTimer);
      else root.setAttribute("data-gk-scrolling", "");
      idleTimer = setTimeout(clear, IDLE_MS);
    };

    const opts = { capture: true, passive: true };
    document.addEventListener("scroll", onScroll, opts);
    return () => {
      document.removeEventListener("scroll", onScroll, opts);
      if (idleTimer) clearTimeout(idleTimer);
      clear();
    };
  }, []);
}
