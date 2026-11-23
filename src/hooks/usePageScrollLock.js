import useRootFlag from "./useRootFlag.js";

// Panels laid over the notes (tag drawer, settings, admin) hold the page
// still while they are open. On a phone the page itself scrolls: a swipe
// reaching the end of a panel's list, or dragging its header or shade,
// scrolled the notes behind it, and the whole grid laid out and repainted
// under the panel at every frame (CSS: html[data-gk-page-locked]).
export default function usePageScrollLock(active) {
  useRootFlag("data-gk-page-locked", active);
}
