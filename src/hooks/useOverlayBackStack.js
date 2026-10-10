import { useEffect, useRef } from "react";

/**
 * Back button / gesture handling for the app's overlays (the Android back
 * button above all): each opened overlay pushes a history entry, the back
 * button closes the topmost one, and overlays closed from the UI pop their
 * entries in one history.go(-n), since looping history.back() can leave
 * the app.
 *
 * `layers` lists every overlay in closing priority, topmost first:
 * { open, close }. A layer without `close` only counts as open (it is
 * closed through another layer).
 *
 * While any overlay is open, pull-to-refresh is disabled: natively in the
 * Android app, and through the data-gk-overlay-locked attribute in the
 * PWA (an attribute rather than a class: rules matching <html>'s class
 * list, the workspace themes, would be re-evaluated on every overlay and
 * stall its opening animation).
 */
export default function useOverlayBackStack(layers) {
  const overlayDepthRef = useRef(0);
  const popInProgressRef = useRef(false);
  const prevOverlayCountRef = useRef(0);
  const layersRef = useRef(layers);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref read by the popstate listener, outside render
  layersRef.current = layers;

  const overlayOpenCount = layers.filter((layer) => layer.open).length;

  useEffect(() => {
    const prev = prevOverlayCountRef.current;
    prevOverlayCountRef.current = overlayOpenCount;
    // This render was caused by our own popstate handling.
    if (popInProgressRef.current) { popInProgressRef.current = false; return; }
    if (overlayOpenCount > prev) {
      const delta = overlayOpenCount - prev;
      for (let i = 0; i < delta; i++) window.history.pushState({ overlay: true }, "");
      overlayDepthRef.current += delta;
    } else if (overlayOpenCount < prev) {
      const delta = Math.min(prev - overlayOpenCount, overlayDepthRef.current);
      if (delta > 0) {
        overlayDepthRef.current -= delta;
        popInProgressRef.current = true;
        window.history.go(-delta);
      }
    }
  }, [overlayOpenCount]);

  useEffect(() => {
    const locked = overlayOpenCount > 0;
    document.documentElement.toggleAttribute("data-gk-overlay-locked", locked);
    try { window.AndroidTheme?.setRefreshEnabled(!locked); } catch { /* Android bridge best-effort */ }
  }, [overlayOpenCount]);

  useEffect(() => {
    const onPopState = () => {
      // Our own history.go() cleanup.
      if (popInProgressRef.current) { popInProgressRef.current = false; return; }
      if (overlayDepthRef.current <= 0) return;
      overlayDepthRef.current--;
      // The back button already popped the entry: the count effect skips.
      popInProgressRef.current = true;
      const topmost = layersRef.current.find((layer) => layer.open && layer.close);
      topmost?.close();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
}
