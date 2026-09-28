import { useCallback, useEffect, useRef } from "react";

// Swallows the click that ends the gesture an outside pointerdown closed a
// popover with, so that tap does not also reach what lies under the popover.
//
// The listeners stay attached for the component's whole life: the click
// comes after the popover has already closed and dropped its own listeners.
// Only that gesture's click is swallowed. A gesture that turns into a scroll
// or a long press ends without one, and the next gesture's own pointerdown
// drops the pending swallow before its click can come.
//
// Returns swallowClickOf(event), to call with the closing pointerdown.
export function useSwallowClosingClick() {
  const closingRef = useRef(null);
  useEffect(() => {
    // The closing pointerdown reaches this listener too, before or after
    // the popover's own marks it, hence the identity check.
    const onGestureEvent = (e) => {
      if (closingRef.current !== e) closingRef.current = null;
    };
    const onClick = (e) => {
      if (!closingRef.current) return;
      closingRef.current = null;
      e.stopPropagation();
      e.preventDefault();
    };
    document.addEventListener("pointerdown", onGestureEvent, true);
    document.addEventListener("pointercancel", onGestureEvent, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", onGestureEvent, true);
      document.removeEventListener("pointercancel", onGestureEvent, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return useCallback((e) => {
    closingRef.current = e;
  }, []);
}

export default useSwallowClosingClick;
