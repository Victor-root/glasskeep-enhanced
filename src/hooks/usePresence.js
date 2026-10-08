import { useEffect, useLayoutEffect, useState } from "react";

/**
 * Keeps an animated overlay in the page through its closing transition.
 * `mounted`: render it. `shown`: its open state, set one frame after mounting
 * so the opening transition starts from the closed styles. `unmount` drops it
 * early (on its closing transitionend); otherwise it goes after `exitMs`.
 * `ref` points at the element whose closed styles must be resolved first.
 */
export function usePresence(open, ref, exitMs) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mounts or starts closing the overlay before paint when `open` flips
    if (open) setMounted(true);
    else setShown(false);
  }, [open]);

  useEffect(() => {
    if (!mounted || !open) return undefined;
    void ref.current?.offsetHeight;
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [mounted, open, ref]);

  useEffect(() => {
    if (open || !mounted) return undefined;
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, mounted, exitMs]);

  return { mounted, shown, unmount: () => setMounted(false) };
}
