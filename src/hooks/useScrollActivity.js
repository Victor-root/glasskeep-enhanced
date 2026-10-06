import { useEffect } from "react";

const IDLE_MS = 180;

// Flags <html data-gk-scrolling> while anything scrolls (capture phase catches
// the window and every inner scroll container) and clears it IDLE_MS after the
// last scroll event. The CSS keys off it to pause the decorative background
// and to stop note cards reacting to a resting pointer while they slide under
// it (see globalCSS.js). An attribute rather than a class: rules matching
// <html>'s class list (the workspace themes) would otherwise be re-evaluated
// at every scroll start and end.
//
// Ignored during a native drag: the browser auto-scrolls the list when a note
// is dragged near its edge, and the cards must keep receiving the drop.
export default function useScrollActivity() {
  useEffect(() => {
    const root = document.documentElement;
    let idleTimer = null;
    let dragging = false;

    const clear = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
      root.removeAttribute("data-gk-scrolling");
    };
    const onScroll = () => {
      if (dragging) return;
      if (idleTimer) clearTimeout(idleTimer);
      else root.setAttribute("data-gk-scrolling", "");
      idleTimer = setTimeout(clear, IDLE_MS);
    };
    const onDragStart = () => { dragging = true; clear(); };
    const onDragEnd = () => { dragging = false; };

    const opts = { capture: true, passive: true };
    document.addEventListener("scroll", onScroll, opts);
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("dragend", onDragEnd, true);
    document.addEventListener("drop", onDragEnd, true);
    return () => {
      document.removeEventListener("scroll", onScroll, opts);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("dragend", onDragEnd, true);
      document.removeEventListener("drop", onDragEnd, true);
      clear();
    };
  }, []);
}
