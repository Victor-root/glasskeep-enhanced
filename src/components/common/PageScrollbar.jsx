import React, { useEffect, useRef, useState } from "react";
import { TOUCH_QUERY } from "../../hooks/useTouchScrollbars.js";
import { netLog } from "../../utils/netDebug.js";

// Android's own scrollbar timing: shown while scrolling, fades this long after.
const HIDE_DELAY_MS = 300;
const MIN_THUMB_PX = 32;

/**
 * Touch screens: the page's scrollbar, drawn by the page so it runs under the
 * sticky header, in the look of the inner touch scrollbars (globalCSS). In the
 * Android app it stands in for the WebView's own scrollbar, turned off while
 * this is mounted; an app without that switch keeps its own one instead.
 */
export default function PageScrollbar() {
  const thumbRef = useRef(null);
  const [enabled] = useState(() =>
    !!window.matchMedia?.(TOUCH_QUERY).matches
    && (!window.AndroidTheme || typeof window.AndroidTheme.setNativePageScrollbar === "function"));

  useEffect(() => {
    netLog("PageScrollbar", {
      enabled,
      touch: !!window.matchMedia?.(TOUCH_QUERY).matches,
      bridge: typeof window.AndroidTheme?.setNativePageScrollbar,
    });
    if (!enabled) return undefined;
    const thumb = thumbRef.current;
    const setNative = (on) => {
      try { window.AndroidTheme?.setNativePageScrollbar?.(on); } catch (_) { /* no app */ }
    };
    setNative(false);

    let frame = 0;
    let hideTimer = 0;
    let length = 0;
    const draw = () => {
      frame = 0;
      const view = window.innerHeight;
      const total = document.documentElement.scrollHeight;
      if (total <= view) return;
      const next = Math.max(MIN_THUMB_PX, (view * view) / total);
      if (next !== length) {
        length = next;
        thumb.style.height = `${next}px`;
      }
      const top = (window.scrollY / (total - view)) * (view - next);
      thumb.style.transform = `translateY(${top}px)`;
    };
    let logged = false;
    const onScroll = () => {
      if (!logged) {
        logged = true;
        const rect = thumb.getBoundingClientRect();
        netLog("PageScrollbar first scroll", { scrollY: window.scrollY, total: document.documentElement.scrollHeight, view: window.innerHeight, thumbTop: Math.round(rect.top), thumbZ: getComputedStyle(thumb).zIndex });
      }
      if (!frame) frame = requestAnimationFrame(draw);
      thumb.setAttribute("data-active", "");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => thumb.removeAttribute("data-active"), HIDE_DELAY_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      clearTimeout(hideTimer);
      setNative(true);
    };
  }, [enabled]);

  if (!enabled) return null;
  return <div ref={thumbRef} className="gk-page-scrollbar" aria-hidden="true" />;
}
