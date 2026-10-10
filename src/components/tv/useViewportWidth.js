import { useEffect, useState } from "react";

// Window width, re-read on resize.
export default function useViewportWidth() {
  const [w, setW] = useState(() => window.innerWidth || 1280);
  useEffect(() => {
    // Debounced resize listener. TVs almost never resize once running,
    // but the launcher / system overlays can fire a few synthetic
    // resize events at boot; debouncing keeps the masonry recompute
    // from running multiple times back-to-back.
    let t = null;
    const onResize = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => setW(window.innerWidth || 1280), 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (t) clearTimeout(t);
    };
  }, []);
  return w;
}
