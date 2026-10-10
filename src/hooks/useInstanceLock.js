import { useEffect, useState } from "react";
import useInstanceLockStatus from "./useInstanceLockStatus.js";

/**
 * At-rest encryption lock, as the app presents it. A visitor without a
 * session gets the full unlock screen; a signed-in user keeps the app
 * (and its local-first cache) with a dismissible banner, whose action
 * opens the unlock screen as an overlay.
 */
export default function useInstanceLock() {
  const { status: instanceLockStatus, refresh: refreshLockStatus } = useInstanceLockStatus();
  // Comes back on every fresh lock event, so a service-side re-lock is
  // always announced.
  const [lockBannerDismissed, setLockBannerDismissed] = useState(false);
  const [lockOverlayOpen, setLockOverlayOpen] = useState(false);

  useEffect(() => {
    // Unlocked (here or in another tab): re-arm the banner, close the overlay.
    if (instanceLockStatus && !instanceLockStatus.locked) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- react to lock changes reported by the polling hook
      setLockBannerDismissed(false);
      setLockOverlayOpen(false);
    }
    if (instanceLockStatus && instanceLockStatus.locked) {
      setLockBannerDismissed(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when the locked flag flips, not on every poll result
  }, [instanceLockStatus?.locked]);

  const isLocked = !!(instanceLockStatus && instanceLockStatus.enabled && instanceLockStatus.locked);

  return {
    instanceLockStatus,
    refreshLockStatus,
    isLocked,
    lockBannerDismissed,
    setLockBannerDismissed,
    lockOverlayOpen,
    setLockOverlayOpen,
  };
}
