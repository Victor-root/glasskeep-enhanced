import { useEffect } from "react";
import { caretRect, focusedEditable } from "../utils/caret.js";

const CARET_MARGIN = 16;

const insetProperty = (name) =>
  parseFloat(document.documentElement.style.getPropertyValue(name)) || 0;

/** Keeps an open note laid out around the Android keyboard, the way a native
 *  screen is: the title stays put, the footer rides the top of the keyboard
 *  and the text only moves if the caret would end up hidden.
 *
 *  Resizing a long note on every frame is out of the question, so a slide only
 *  moves the footer (a transform) and scrolls. The card takes its new height
 *  while that cannot be seen: once the keyboard has covered what it cuts off,
 *  or before the keyboard uncovers what it gives back. For the slide itself,
 *  a padding at the bottom of the scroller stands in for the scroll range the
 *  card does not have yet (or no longer has).
 *
 *  Inactive without `gk-keyboard-frame` events: browsers and Android 10 and
 *  below, where the keyboard resizes the page for real. */
export default function useNoteKeyboardLayout(enabled, cardRef, scrollRef, footerRef) {
  useEffect(() => {
    if (!enabled) return undefined;
    const card = cardRef.current;
    const scroller = scrollRef.current;
    const footer = footerRef.current;
    const scrim = card?.parentElement;
    if (!card || !scroller || !footer) return undefined;

    // Heights above the bottom of the footer: the footer keeps its navigation
    // bar padding, which slides under the keyboard instead of above it.
    const lift = (keyboard) => Math.max(0, keyboard - insetProperty("--android-inset-bottom"));

    let rest = 0; // what the card has been shortened by
    let target = 0; // the keyboard height being reached
    let live = 0;
    let from = 0;
    let scroll = null; // { top, delta }: the scroll that goes with the slide
    let raf = 0;

    const setRest = (px) => {
      rest = px;
      card.style.setProperty("--note-keyboard-rest", `${px}px`);
      // In landscape the keyboard can leave a strip beside it, where the
      // shortened card no longer hides the notes list.
      scrim.style.backgroundColor = px ? getComputedStyle(card).backgroundColor : "";
    };
    const setSpacer = (px) => {
      scroller.style.paddingBottom = px > 0 ? `${px}px` : "";
    };
    const placeFooter = (running) => {
      const offset = rest - lift(live);
      footer.style.willChange = running ? "transform" : "";
      // Not left on at rest: a transform would capture position: fixed menus.
      footer.style.transform = offset ? `translateY(${offset}px)` : "";
    };

    // How far the caret ends up behind the footer once the keyboard is at `keyboard`.
    const caretOverrun = (keyboard) => {
      const el = focusedEditable();
      if (!el || !card.contains(el)) return 0;
      const footerTop = window.innerHeight - footer.offsetHeight - lift(keyboard);
      return caretRect(el).bottom + CARET_MARGIN - footerTop;
    };

    const planOpening = () => {
      const delta = caretOverrun(target);
      scroll = null;
      if (delta <= 0 || getComputedStyle(scroller).overflowY === "hidden") return;
      const top = scroller.scrollTop;
      const room = scroller.scrollHeight - scroller.clientHeight - top;
      if (delta > room) setSpacer(delta - room);
      scroll = { top, delta };
    };

    // The card grows first: what it gives back is still behind the keyboard.
    // A note read to its very end would lose that scroll range at once, so
    // it stays as padding and the text follows the keyboard down.
    const planClosing = () => {
      const top = scroller.scrollTop;
      setRest(lift(target));
      const excess = top - (scroller.scrollHeight - scroller.clientHeight);
      scroll = null;
      if (excess > 0) {
        setSpacer(excess);
        scroller.scrollTop = top;
        scroll = { top, delta: -excess };
      }
    };

    const follow = () => {
      if (!scroll) return;
      const span = lift(target) - lift(from);
      const progress = span ? (lift(live) - lift(from)) / span : 1;
      scroller.scrollTop = scroll.top + scroll.delta * progress;
    };

    const settle = () => {
      const top = scroll ? scroll.top + scroll.delta : null;
      setRest(lift(target));
      setSpacer(0);
      placeFooter(false);
      if (top !== null) scroller.scrollTop = top;
      scroll = null;
    };

    const onFrame = (e) => {
      live = e.detail.live;
      if (e.detail.target !== target) {
        from = live;
        target = e.detail.target;
        if (lift(target) < rest) planClosing();
        else planOpening();
      }
      placeFooter(true);
      follow();
    };

    const onSettled = () => {
      live = insetProperty("--android-keyboard-inset");
      if (live !== target) {
        from = target = live;
        planOpening();
      }
      settle();
    };

    // Keyboard up and resting: the caret just moved under the footer (a new
    // line, a new checklist row, a tap on a half hidden line).
    const reveal = () => {
      raf = 0;
      if (!target || live !== target || !window.getSelection()?.isCollapsed) return;
      const overrun = caretOverrun(target);
      if (overrun > 0) scroller.scrollTop += overrun;
    };
    const scheduleReveal = () => {
      if (!raf) raf = requestAnimationFrame(reveal);
    };

    onSettled();
    window.addEventListener("gk-keyboard-frame", onFrame);
    window.addEventListener("gk-android-insets", onSettled);
    document.addEventListener("selectionchange", scheduleReveal);
    document.addEventListener("input", scheduleReveal);
    document.addEventListener("focusin", scheduleReveal);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("gk-keyboard-frame", onFrame);
      window.removeEventListener("gk-android-insets", onSettled);
      document.removeEventListener("selectionchange", scheduleReveal);
      document.removeEventListener("input", scheduleReveal);
      document.removeEventListener("focusin", scheduleReveal);
      card.style.removeProperty("--note-keyboard-rest");
      scrim.style.backgroundColor = "";
      scroller.style.paddingBottom = "";
      footer.style.transform = "";
      footer.style.willChange = "";
    };
  }, [enabled, cardRef, scrollRef, footerRef]);
}
