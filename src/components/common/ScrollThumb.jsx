import React, { useEffect, useRef, useState } from "react";
import { TOUCH_QUERY } from "../../hooks/useTouchScrollbars.js";

// Android's own scrollbar timing: shown while scrolling, fades this long after.
const HIDE_DELAY_MS = 300;
const MIN_THUMB_PX = 32;

/**
 * Touch screens: a scrollbar drawn by the page (.gk-scroll-thumb), in the
 * look of the inner touch scrollbars, where the native one cannot be placed
 * right.
 * Without `scrollerRef` it tracks the page: it runs under the notes shell's
 * sticky header and, in the Android app, stands in for the WebView's own
 * scrollbar, turned off while this is mounted (an app without that switch
 * keeps its own one instead). With `scrollerRef` it tracks that box, from
 * inside the box's positioned parent; the box hides its own scrollbar.
 */
export default function ScrollThumb({ scrollerRef, className }) {
  const thumbRef = useRef(null);
  const page = !scrollerRef;
  const [enabled] = useState(() =>
    !!window.matchMedia?.(TOUCH_QUERY).matches
    && (!page || !window.AndroidTheme || typeof window.AndroidTheme.setNativePageScrollbar === "function"));

  useEffect(() => {
    if (!enabled) return undefined;
    const thumb = thumbRef.current;
    const box = page ? null : scrollerRef.current;
    if (!page && !box) return undefined;
    const setNative = (on) => {
      try { window.AndroidTheme?.setNativePageScrollbar?.(on); } catch (_) { /* no app */ }
    };
    if (page) setNative(false);

    const measure = page
      ? () => ({ view: window.innerHeight, total: document.documentElement.scrollHeight, pos: window.scrollY, offset: 0 })
      : () => ({ view: box.clientHeight, total: box.scrollHeight, pos: box.scrollTop, offset: box.offsetTop });
    let frame = 0;
    let hideTimer = 0;
    let length = 0;
    const draw = () => {
      frame = 0;
      const { view, total, pos, offset } = measure();
      if (total <= view) return;
      const next = Math.max(MIN_THUMB_PX, (view * view) / total);
      if (next !== length) {
        length = next;
        thumb.style.height = `${next}px`;
      }
      const top = offset + (pos / (total - view)) * (view - next);
      thumb.style.transform = `translateY(${top}px)`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(draw);
      thumb.setAttribute("data-active", "");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => thumb.removeAttribute("data-active"), HIDE_DELAY_MS);
    };
    const target = page ? window : box;
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      clearTimeout(hideTimer);
      if (page) setNative(true);
    };
  }, [enabled, page, scrollerRef]);

  if (!enabled) return null;
  return <div ref={thumbRef} className={className} aria-hidden="true" />;
}
