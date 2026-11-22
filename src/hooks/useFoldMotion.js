// Unfolds and folds a collapsible section by moving things only, so nothing
// is laid out or painted again while it plays: on opening, the section takes
// its final layout at once, then its content is uncovered from the top while
// everything after it slides down. Folding plays the same movement
// backwards and collapses the layout once it has played. Toggling again
// midway plays the running movement back from where it is.
import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

// Unfolding decelerates, as the side panels do coming in. Folding eases in
// and out: an accelerating curve would keep what follows off screen for
// most of the movement, then bring it up at once.
const UNFOLD = { duration: 320, easing: "cubic-bezier(0.2, 0, 0, 1)" };
const FOLD = { duration: 280, easing: "cubic-bezier(0.4, 0, 0.2, 1)" };

const stillMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// What follows `el` on the page up to `stop`: its next siblings, then its
// parent's, and so on.
function following(el, stop) {
  const out = [];
  for (let node = el; node && node !== stop && node !== document.body; node = node.parentElement) {
    for (let next = node.nextElementSibling; next; next = next.nextElementSibling) out.push(next);
  }
  return out;
}

// `open`: whether the section should be open. `scrollerSelector`: its
// scrolling container. Returns the ref for the section's clip window (whose
// first child is the content) and whether its content is laid out.
export default function useFoldMotion(open, scrollerSelector) {
  const [laidOut, setLaidOut] = useState(open);
  // Laid out as soon as it opens; on closing, only once the fold has played.
  if (open !== laidOut && (open || stillMotion())) setLaidOut(open);
  const ref = useRef(null);
  const motion = useRef(null);
  const wasOpen = useRef(open);

  useLayoutEffect(() => {
    if (wasOpen.current === open) return;
    wasOpen.current = open;
    if (motion.current) {
      motion.current.unfolding = open;
      for (const a of motion.current.anims) a.reverse();
      return;
    }
    const win = ref.current;
    if (!win || stillMotion()) return;
    const height = win.offsetHeight;
    const scroller = win.closest(scrollerSelector);
    const timing = { ...(open ? UNFOLD : FOLD), fill: "both" };
    // Folding near the end of the list: the scroll position will have to
    // come back by `drop` once the section collapses, so the whole list moves
    // down by as much while it folds, as the browser does for a shrinking page.
    const drop = open || !scroller ? 0
      : Math.max(0, scroller.scrollTop - Math.max(0, scroller.scrollHeight - height - scroller.clientHeight));
    const anims = [];
    // `shut`: the element's offset when the section is folded.
    const slide = (el, shut, fade) => {
      const folded = { transform: `translateY(${shut}px)`, ...(fade && { opacity: 0 }) };
      const rest = { transform: "translateY(0px)", ...(fade && { opacity: 1 }) };
      anims.push(el.animate(open ? [folded, rest] : [rest, folded], timing));
    };
    // The clip window rises by the section's height while its content moves
    // down by as much: the content stays in place on screen and the window
    // uncovers it from the top.
    slide(win, -height);
    slide(win.firstElementChild, height, true);
    // One animation per element, each replacing the element's transform,
    // so that the compositor runs them all: what follows at the list's top
    // level also carries the drop, what follows deeper inherits it.
    const after = following(win, scroller);
    for (const el of after) slide(el, -height + (el.parentElement === scroller ? drop : 0));
    if (drop) for (const el of scroller.children) if (!after.includes(el)) slide(el, drop);
    win.dataset.moving = "";
    motion.current = { anims, unfolding: open };
    anims[0].onfinish = () => {
      const { unfolding } = motion.current;
      motion.current = null;
      delete win.dataset.moving;
      if (!unfolding) flushSync(() => setLaidOut(false));
      for (const a of anims) a.cancel();
    };
  }, [open, scrollerSelector]);

  useLayoutEffect(() => () => {
    for (const a of motion.current?.anims || []) a.cancel();
  }, []);

  return [ref, laidOut];
}
