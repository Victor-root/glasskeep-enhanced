import { useEffect } from "react";

// Android's keyboard curves: it rises along cubic-bezier(0.2, 0, 0, 1) and
// leaves faster, accelerating.
const RISE_MS = 285;
const FALL_MS = 200;
const rise = (t) => 1 - (1 - t) ** 4;
const fall = (t) => t * t;
const COURSE_STEPS = 16;

/** While `active`, gives a mobile browser or installed PWA the same keyboard
 *  hand-off as the Android app (see KeyboardFollower): `gk-keyboard-slide` and
 *  `gk-keyboard-frame` during the slide, `--android-keyboard-inset` and
 *  `gk-android-insets` at rest.
 *
 *  The VirtualKeyboard API lays the keyboard over the page instead of resizing
 *  it, which also stops the browser from re-centring the caret. It says only
 *  where the keyboard ends up, so the slide is replayed on Android's curves.
 *  A rising keyboard is `clipped`: the browser cuts the page at its final
 *  height as soon as the slide starts, so nothing can be drawn below that. */
export default function useVirtualKeyboardBridge(active) {
  useEffect(() => {
    const vk = navigator.virtualKeyboard;
    if (!active || !vk) return undefined;
    const root = document.documentElement;
    let live = 0;
    let raf = 0;

    const settle = (target) => {
      live = target;
      root.style.setProperty("--android-keyboard-inset", `${target}px`);
      window.dispatchEvent(new Event("gk-android-insets"));
    };

    const slide = (target) => {
      cancelAnimationFrame(raf);
      const from = live;
      const rising = target > from;
      const duration = rising ? RISE_MS : FALL_MS;
      const ease = rising ? rise : fall;
      const start = performance.now();
      window.dispatchEvent(new CustomEvent("gk-keyboard-slide", {
        detail: {
          from,
          target,
          duration,
          course: Array.from({ length: COURSE_STEPS + 1 }, (_, step) => ease(step / COURSE_STEPS)),
          startedAt: Date.now(),
          clipped: rising,
        },
      }));
      const step = (now) => {
        const t = Math.min((now - start) / duration, 1);
        if (t === 1) {
          settle(target);
          return;
        }
        live = from + (target - from) * ease(t);
        window.dispatchEvent(new CustomEvent("gk-keyboard-frame", { detail: { live, target } }));
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const onGeometryChange = () => {
      const rect = vk.boundingRect;
      const target = rect.height ? Math.max(0, window.innerHeight - rect.y) : 0;
      if (target !== live) slide(target);
    };

    vk.overlaysContent = true;
    onGeometryChange();
    vk.addEventListener("geometrychange", onGeometryChange);
    return () => {
      cancelAnimationFrame(raf);
      vk.removeEventListener("geometrychange", onGeometryChange);
      vk.overlaysContent = false;
      root.style.removeProperty("--android-keyboard-inset");
      window.dispatchEvent(new Event("gk-android-insets"));
    };
  }, [active]);
}
