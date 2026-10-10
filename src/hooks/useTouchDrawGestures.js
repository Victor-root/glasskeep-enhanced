import { useEffect, useRef } from 'react';

/**
 * Touch input of the drawing canvas, in draw mode: 1 finger draws through
 * the stroke callbacks, 2 fingers scroll `wrapperRef` programmatically with
 * momentum (and cancel the stroke in progress). Listeners are registered
 * with passive: false so they can preventDefault the page's own touch
 * handling.
 */
export default function useTouchDrawGestures({
  canvasRef,
  wrapperRef,
  isDrawingRef,
  mode,
  readOnly,
  startDrawing,
  draw,
  stopDrawing,
  cancelCurrentStroke,
}) {
  const isScrollingRef = useRef(false);
  const pendingTouchRef = useRef(null);
  const scrollStateRef = useRef({ lastY: 0, velocity: 0, momentumId: null });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ss = scrollStateRef; // ref persists across effect re-runs

    const avgY = (touches) => {
      let s = 0;
      for (let i = 0; i < touches.length; i++) s += touches[i].clientY;
      return s / touches.length;
    };

    const stopMomentum = () => {
      if (ss.current.momentumId) {
        cancelAnimationFrame(ss.current.momentumId);
        ss.current.momentumId = null;
      }
    };

    const startMomentum = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper || Math.abs(ss.current.velocity) < 0.5) return;
      const step = () => {
        ss.current.velocity *= 0.92;
        wrapper.scrollTop -= ss.current.velocity;
        if (Math.abs(ss.current.velocity) > 0.5) {
          ss.current.momentumId = requestAnimationFrame(step);
        } else {
          ss.current.momentumId = null;
        }
      };
      ss.current.momentumId = requestAnimationFrame(step);
    };

    const handleTouchStart = (e) => {
      if (mode !== 'draw' || readOnly) return;
      e.preventDefault();
      stopMomentum();

      if (e.touches.length >= 2) {
        pendingTouchRef.current = null;
        if (isDrawingRef.current) cancelCurrentStroke();
        isScrollingRef.current = true;
        ss.current.lastY = avgY(e.touches);
        ss.current.velocity = 0;
        return;
      }

      if (!isScrollingRef.current) {
        const t = e.touches[0];
        pendingTouchRef.current = { clientX: t.clientX, clientY: t.clientY };
      }
    };

    const handleTouchMove = (e) => {
      if (mode !== 'draw' || readOnly) return;
      e.preventDefault();

      if (e.touches.length >= 2 || isScrollingRef.current) {
        pendingTouchRef.current = null;
        if (isDrawingRef.current) cancelCurrentStroke();
        isScrollingRef.current = true;
        const currentY = avgY(e.touches);
        const delta = currentY - ss.current.lastY;
        ss.current.velocity = delta;
        const wrapper = wrapperRef.current;
        if (wrapper) wrapper.scrollTop -= delta;
        ss.current.lastY = currentY;
        return;
      }

      if (pendingTouchRef.current) {
        startDrawing(pendingTouchRef.current);
        pendingTouchRef.current = null;
      }
      draw(e);
    };

    const handleTouchEnd = (e) => {
      if (mode !== 'draw' || readOnly) return;
      e.preventDefault();

      if (e.touches.length === 0) {
        if (pendingTouchRef.current) {
          startDrawing(pendingTouchRef.current);
          pendingTouchRef.current = null;
        }
        if (isScrollingRef.current) {
          isScrollingRef.current = false;
          startMomentum();
          return;
        }
        stopDrawing();
      }
    };

    const handleTouchCancel = () => {
      pendingTouchRef.current = null;
      isScrollingRef.current = false;
      stopMomentum();
      if (isDrawingRef.current) cancelCurrentStroke();
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchCancel);
      stopMomentum();
    };
  }, [canvasRef, wrapperRef, isDrawingRef, mode, readOnly, startDrawing, draw, stopDrawing, cancelCurrentStroke]);
}
