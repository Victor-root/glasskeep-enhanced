import { useEffect, useState } from "react";
import { detectTvMode } from "../utils/tvMode.js";

/** React-friendly read of `detectTvMode()`. The value is established
 *  synchronously on mount (so the first render lands on the right tree)
 *  and re-evaluated when the hash changes — which lets `#tv` and
 *  `#phone` URL overrides take effect without a full reload. */
export default function useTvMode() {
  const [isTv, setIsTv] = useState(() => detectTvMode());

  useEffect(() => {
    const recompute = () => setIsTv(detectTvMode());
    window.addEventListener("hashchange", recompute);
    window.addEventListener("tv-mode-changed", recompute);
    return () => {
      window.removeEventListener("hashchange", recompute);
      window.removeEventListener("tv-mode-changed", recompute);
    };
  }, []);

  return isTv;
}
