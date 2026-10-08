import React, { useEffect, useRef, useState } from "react";
import { TOUCH_QUERY } from "../../hooks/useTouchScrollbars.js";

// Android's own scrollbar timing: shown while scrolling, fades this long after.
const HIDE_DELAY_MS = 300;
const MIN_THUMB_PX = 32;

/**
 * Touch screens: the page's scrollbar, drawn by the page so it runs under the
 * sticky header, in the look of the inner touch scrollbars (globalCSS). It
 * travels along a track between the system bars, clear of the screen's
 * rounded corners. In the
 * Android app it stands in for the WebView's own scrollbar, turned off while
 * this is mounted; an app without that switch keeps its own one instead.
 */
export default function PageScrollbar() {
  const trackRef = useRef(null);
  const thumbRef = useRef(null);
  const [enabled] = useState(() =>
    !!window.matchMedia?.(TOUCH_QUERY).matches
    && (!window.AndroidTheme || typeof window.AndroidTheme.setNativePageScrollbar === "function"));

  useEffect(() => {
    if (!enabled) return undefined;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    const setNative = (on) => {
      try { window.AndroidTheme?.setNativePageScrollbar?.(on); } catch { /* no app */ }
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
      const span = track.clientHeight;
      const next = Math.max(MIN_THUMB_PX, (span * view) / total);
      if (next !== length) {
        length = next;
        thumb.style.height = `${next}px`;
      }
      const top = (window.scrollY / (total - view)) * (span - next);
      thumb.style.transform = `translateY(${top}px)`;
    };
    const onScroll = () => {
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
  return (
    <div ref={trackRef} className="gk-page-scrollbar-track" aria-hidden="true">
      <div ref={thumbRef} className="gk-page-scrollbar" />
    </div>
  );
}
