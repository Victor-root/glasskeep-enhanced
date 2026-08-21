import { useEffect } from "react";

/** Publishes the soft-keyboard height on <html> as `--keyboard-inset`.
 *
 *  The viewport meta keeps the browser default (`resizes-visual`): opening
 *  the keyboard shrinks the visual viewport but leaves the layout viewport
 *  alone, so `100dvh` and every `position: fixed` overlay keep covering the
 *  whole screen and their lower part stays behind the keyboard. On a note
 *  too short to scroll, nothing can then bring the caret back into view.
 *  Overlays subtract this value to stop at the top edge of the keyboard.
 *
 *  Below the threshold the shrink comes from the URL bar or an accessory
 *  bar, not from a keyboard, and must not move the layout. */

const MIN_KEYBOARD = 150;
const REVEAL_MARGIN = 8;

function isEditable(el) {
  return !!el && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA");
}

function caretRect(el) {
  if (el.isContentEditable) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.height || r.top) return r;
    }
  }
  return el.getBoundingClientRect();
}

function scrollableAncestor(el) {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const overflowY = getComputedStyle(n).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}

/** The panel just shrank under the focused field: scroll what is being
 *  typed back into it. The browser cannot do it on its own because the
 *  layout changed after it had already given up. */
function revealCaret() {
  const el = document.activeElement;
  if (!isEditable(el)) return;
  const scroller = scrollableAncestor(el);
  if (!scroller) return;
  const rect = caretRect(el);
  const box = scroller.getBoundingClientRect();
  if (rect.bottom > box.bottom - REVEAL_MARGIN) {
    scroller.scrollTop += rect.bottom - box.bottom + REVEAL_MARGIN;
  } else if (rect.top < box.top + REVEAL_MARGIN) {
    scroller.scrollTop -= box.top + REVEAL_MARGIN - rect.top;
  }
}

export default function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let current = 0;
    let raf = 0;

    const apply = () => {
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      const next = vv.scale > 1 || hidden < MIN_KEYBOARD ? 0 : Math.round(hidden);
      if (next === current) return;
      const opening = next > current;
      current = next;
      root.style.setProperty("--keyboard-inset", `${next}px`);
      if (!opening) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(revealCaret);
    };

    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      root.style.removeProperty("--keyboard-inset");
    };
  }, []);
}
