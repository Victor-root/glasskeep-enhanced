import { useEffect, useRef, useState } from "react";

// The armed state of a confirm-on-second-click button (a delete that flips
// to a checkmark first): it disarms itself after 3 seconds of inaction.
// Shared by the checklist section header and the audio clip rows, so the
// muscle memory is the same.
export default function useTimedConfirm() {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => {
    if (!confirming) return;
    timerRef.current = setTimeout(() => setConfirming(false), 3000);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [confirming]);
  return [confirming, setConfirming];
}
