import { useEffect } from "react";

// Panels laid over the notes (tag drawer, settings, admin) hold the page
// still while they are open. On a phone the page itself scrolls: a swipe
// reaching the end of a panel's list, or dragging its header or shade,
// scrolled the notes behind it, and the whole grid laid out and repainted
// under the panel at every frame. Counted, so one panel closing does not
// free the page under another (CSS: html[data-gk-page-locked]).
let holders = 0;

export default function usePageScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    holders += 1;
    document.documentElement.setAttribute("data-gk-page-locked", "");
    return () => {
      holders -= 1;
      if (holders === 0) document.documentElement.removeAttribute("data-gk-page-locked");
    };
  }, [active]);
}
