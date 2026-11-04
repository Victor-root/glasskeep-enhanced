import { useEffect } from "react";
import { caretRect, focusedEditable } from "../utils/caret.js";

const CARET_MARGIN = 16;
// The animation reaches the screen on the next frame.
const FIRST_FRAME_MS = 16;

const restingKeyboard = () =>
  parseFloat(document.documentElement.style.getPropertyValue("--android-keyboard-inset")) || 0;

/** Keeps an open note laid out around the keyboard, the way a native screen
 *  is: the title stays put, the footer rides the top of the keyboard and the
 *  text only moves if the caret would end up hidden.
 *
 *  The note keeps its full height at all times: its text lies under the
 *  keyboard, so a closing keyboard uncovers it line by line, with nothing for
 *  the page to do. The footer sits higher (`bottom`, no transform, which would
 *  capture position: fixed menus) and the scroller makes up for it with a
 *  padding that keeps the end of the note reachable.
 *
 *  A slide is played in one go on the compositor, along the keyboard's own
 *  course (`gk-keyboard-slide`): following it from the page would lag behind
 *  on a phone, the main thread being too busy. The text is translated for the
 *  time of the slide, then the same frame swaps that for a scroll.
 *
 *  Fed by the Android app, or by useVirtualKeyboardBridge in a browser.
 *  Inactive without these events: iOS, Firefox and Android 10 and below, where
 *  the keyboard resizes the page or the visual viewport. */
export default function useNoteKeyboardLayout(enabled, scrollRef, footerRef) {
  useEffect(() => {
    if (!enabled) return undefined;
    const scroller = scrollRef.current;
    const footer = footerRef.current;
    if (!scroller || !footer) return undefined;

    // Heights above the bottom of the footer: the footer keeps its navigation
    // bar padding, which slides under the keyboard instead of above it.
    let navBar = 0;
    const measureNavBar = () => {
      navBar = parseFloat(getComputedStyle(footer).paddingBottom) || 0;
    };
    const lift = (keyboard) => Math.max(0, keyboard - navBar);

    let rest = 0; // how far the footer sits above its place
    let target = 0; // the keyboard height being reached
    let sliding = false;
    let footerRide = null;
    let textRides = [];
    let textShift = 0; // how far the running slide scrolls the text
    let raf = 0;

    const paddingFor = (keyboard) => (lift(keyboard) ? lift(keyboard) + CARET_MARGIN : 0);

    const place = (keyboard) => {
      rest = lift(keyboard);
      footer.style.bottom = rest ? `${rest}px` : "";
      scroller.style.paddingBottom = rest ? `${paddingFor(keyboard)}px` : "";
    };

    // The furthest the text can scroll once the keyboard is at `keyboard`.
    const rangeAt = (keyboard) => {
      const content = Math.max(...[...scroller.children].map((el) => el.offsetTop + el.offsetHeight));
      return Math.max(0, content + paddingFor(keyboard) - scroller.clientHeight);
    };

    // How far the caret ends up behind the footer once the keyboard is at `keyboard`.
    const caretOverrun = (keyboard) => {
      const el = focusedEditable();
      if (!el || !scroller.contains(el)) return 0;
      const footerTop = window.innerHeight - footer.offsetHeight - lift(keyboard);
      return caretRect(el).bottom + CARET_MARGIN - footerTop;
    };

    // Up for a caret that would end up hidden, down when a closing keyboard
    // takes back the scroll range of a note read to its very end.
    const textShiftFor = (from, to) => {
      if (getComputedStyle(scroller).overflowY === "hidden") return 0;
      const top = scroller.scrollTop;
      if (to > from) return Math.max(0, Math.min(caretOverrun(to), rangeAt(to) - top));
      return Math.min(0, rangeAt(to) - top);
    };

    const stopRides = () => {
      footerRide?.cancel();
      footerRide = null;
      textRides.forEach((ride) => ride.cancel());
      textRides = [];
    };

    // A slide cut short by the next one: the text stays where it has got to.
    const keepTextWhereItIs = () => {
      const moved = textRides[0]?.effect.target;
      const offset = moved ? new DOMMatrixReadOnly(getComputedStyle(moved).transform).m42 : 0;
      stopRides();
      scroller.scrollTop -= offset;
      textShift = 0;
    };

    const onSlide = (e) => {
      const { from, target: to, duration, course, startedAt, clipped } = e.detail;
      keepTextWhereItIs();
      measureNavBar();
      sliding = true;
      target = to;
      textShift = textShiftFor(from, to);
      const timing = { duration, fill: "forwards" };
      const elapsed = Date.now() - startedAt + FIRST_FRAME_MS;
      const ride = (el, frames) => {
        const animation = el.animate(frames, timing);
        animation.currentTime = elapsed;
        return animation;
      };
      if (clipped) place(to);
      else {
        footerRide = ride(footer, course.map((c) => ({
          transform: `translateY(${rest - lift(from + (to - from) * c)}px)`,
        })));
      }
      if (textShift) {
        const frames = course.map((c) => ({ transform: `translateY(${-textShift * c}px)` }));
        textRides = [...scroller.children]
          .filter((el) => !el.classList.contains("sticky"))
          .map((el) => ride(el, frames));
      }
    };

    // Keyboard up and resting: the caret just moved under the footer (a new
    // line, a new checklist row, a tap on a half hidden line).
    const reveal = () => {
      raf = 0;
      if (!target || sliding || !window.getSelection()?.isCollapsed) return;
      const overrun = caretOverrun(target);
      if (overrun > 0) scroller.scrollTop += overrun;
    };
    const scheduleReveal = () => {
      if (!raf) raf = requestAnimationFrame(reveal);
    };

    const onSettled = () => {
      const keyboard = restingKeyboard();
      if (sliding && keyboard !== target) return;
      measureNavBar();
      const top = scroller.scrollTop + textShift;
      sliding = false;
      target = keyboard;
      place(keyboard);
      stopRides();
      scroller.scrollTop = top;
      textShift = 0;
      scheduleReveal();
    };

    onSettled();
    window.addEventListener("gk-keyboard-slide", onSlide);
    window.addEventListener("gk-android-insets", onSettled);
    document.addEventListener("selectionchange", scheduleReveal);
    document.addEventListener("input", scheduleReveal);
    document.addEventListener("focusin", scheduleReveal);
    return () => {
      cancelAnimationFrame(raf);
      stopRides();
      window.removeEventListener("gk-keyboard-slide", onSlide);
      window.removeEventListener("gk-android-insets", onSettled);
      document.removeEventListener("selectionchange", scheduleReveal);
      document.removeEventListener("input", scheduleReveal);
      document.removeEventListener("focusin", scheduleReveal);
      footer.style.bottom = "";
      scroller.style.paddingBottom = "";
    };
  }, [enabled, scrollRef, footerRef]);
}
