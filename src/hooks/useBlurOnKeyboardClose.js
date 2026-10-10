import { useEffect } from "react";

// Blurs `inputRef` when the soft keyboard is dismissed (mobile back / swipe
// down) while `active`, so the field leaves edit mode.
// Skipped on iOS Safari: it emits unstable visualViewport.resize bounces while
// the keyboard is opening (URL bar / predictive bar animations), which would
// be misread as a keyboard close and immediately blur the field, making
// editing unusable on iPhone. iOS already blurs naturally on Done.
export default function useBlurOnKeyboardClose(active, inputRef) {
  useEffect(() => {
    if (!active || !window.visualViewport) return;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (typeof navigator !== "undefined" &&
        navigator.platform === "MacIntel" &&
        navigator.maxTouchPoints > 1);
    if (isIOS) return;
    let prevH = window.visualViewport.height;
    const onResize = () => {
      const h = window.visualViewport.height;
      if (h - prevH > 150) inputRef.current?.blur();
      prevH = h;
    };
    window.visualViewport.addEventListener("resize", onResize);
    return () => window.visualViewport.removeEventListener("resize", onResize);
  }, [active, inputRef]);
}
