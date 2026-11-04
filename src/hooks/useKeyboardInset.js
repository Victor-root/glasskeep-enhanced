import { useEffect } from "react";
import { caretRect, focusedEditable } from "../utils/caret.js";

/** Publishes the soft-keyboard geometry on <html>: `--keyboard-inset` is its
 *  height, `--keyboard-pan` how far a full-screen overlay has to ride up so
 *  what is being typed clears it.
 *
 *  The viewport meta keeps the browser default (`resizes-visual`): opening
 *  the keyboard shrinks the visual viewport but leaves the layout viewport
 *  alone, so `100dvh` and every `position: fixed` overlay keep covering the
 *  whole screen and their lower part stays behind the keyboard. The overlay
 *  slides up as one block rather than being shortened, so its header travels
 *  with the text instead of staying pinned while only the content moves. It
 *  never rides higher than the keyboard is tall, and only as far as the caret
 *  actually needs, so a short note stays exactly where it is.
 *
 *  Below the threshold the shrink comes from the URL bar or an accessory
 *  bar, not from a keyboard, and must not move the layout.
 *
 *  Inside the Android WebView the visual viewport says nothing at all: the
 *  window draws edge-to-edge, so the keyboard never resizes it. WebViewActivity
 *  forwards the real IME inset as `--android-keyboard-inset`, which takes over
 *  when it is present, and `gk-keyboard-frame` events while the keyboard slides.
 *  An open note lays itself out around the keyboard (useNoteKeyboardLayout);
 *  the rest of the app rides up as described above. Each frame only touches
 *  the open sheets: a custom property changed on <html> restyles the whole
 *  page, so <html> just gets where the keyboard is heading. */

const MIN_KEYBOARD = 150;
const PAN_MARGIN = 8;

function scrollableAncestor(el) {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const overflowY = getComputedStyle(n).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}

export default function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    let keyboard = 0;
    let pan = 0;
    let raf = 0;
    let sliding = null;

    const measure = () => {
      if (sliding) return Math.round(sliding.live);
      const android = root.style.getPropertyValue("--android-keyboard-inset");
      if (android) return Math.max(0, Math.round(parseFloat(android)) || 0);
      if (!vv) return 0;
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      return vv.scale > 1 || hidden < MIN_KEYBOARD ? 0 : Math.round(hidden);
    };

    const setPan = (next) => {
      const clamped = Math.min(Math.max(Math.round(next), 0), keyboard);
      if (clamped === pan) return;
      pan = clamped;
      root.style.setProperty("--keyboard-pan", `${pan}px`);
    };

    // Caret behind the keyboard: ride the whole overlay up by the difference,
    // and once it has given all it can, scroll the editor for the remainder.
    // Caret pushed past the top of the screen: give that height back. In
    // between, hold still so the overlay does not follow every keystroke.
    const track = () => {
      raf = 0;
      if (!keyboard) return;
      const el = focusedEditable();
      if (!el || el.closest("[data-keyboard-managed]")) return;
      const rect = caretRect(el);
      const ceiling = window.innerHeight - keyboard - PAN_MARGIN;
      if (rect.bottom > ceiling) {
        const from = pan;
        setPan(pan + rect.bottom - ceiling);
        const left = rect.bottom - (pan - from) - ceiling;
        const scroller = left > 0 ? scrollableAncestor(el) : null;
        if (scroller) scroller.scrollTop += left;
      } else if (rect.top < PAN_MARGIN) {
        setPan(pan - (PAN_MARGIN - rect.top));
      }
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(track);
    };

    const apply = () => {
      const next = measure();
      if (next !== keyboard) {
        keyboard = next;
        publish();
        if (!keyboard) setPan(0);
      }
      schedule();
    };

    const publish = () => {
      const resting = sliding ? Math.round(sliding.target) : keyboard;
      root.style.setProperty("--keyboard-inset", `${resting}px`);
      document.querySelectorAll('.gk-sheet-root[data-state="open"]').forEach((sheet) => {
        if (sliding) sheet.style.setProperty("--keyboard-inset", `${keyboard}px`);
        else sheet.style.removeProperty("--keyboard-inset");
      });
    };

    const onFrame = (e) => {
      sliding = e.detail;
      apply();
    };

    const onSettled = () => {
      if (sliding) {
        sliding = null;
        publish();
      }
      apply();
    };

    apply();
    window.addEventListener("gk-keyboard-frame", onFrame);
    window.addEventListener("gk-android-insets", onSettled);
    document.addEventListener("selectionchange", schedule);
    document.addEventListener("input", schedule);
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("gk-keyboard-frame", onFrame);
      window.removeEventListener("gk-android-insets", onSettled);
      document.removeEventListener("selectionchange", schedule);
      document.removeEventListener("input", schedule);
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      root.style.removeProperty("--keyboard-inset");
      root.style.removeProperty("--keyboard-pan");
    };
  }, []);
}
