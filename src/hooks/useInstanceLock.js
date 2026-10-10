import { useCallback, useEffect, useState } from "react";
import { api } from "../utils/api.js";
import { localizeServerError } from "../utils/serverErrors.js";
import useInstanceLockStatus from "./useInstanceLockStatus.js";

/**
 * At-rest encryption lock, as the app presents it. A visitor without a
 * session gets the full unlock screen; a signed-in user keeps the app
 * (and its local-first cache) with a dismissible banner, whose action
 * opens the unlock screen as an overlay.
 */
export default function useInstanceLock({ token, showToast }) {
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

  // Admin quick lock (header): drops the encryption key from the server's
  // RAM at once, like the admin panel's "Lock now". The next request would
  // get a 423 anyway; the event moves every tab to the unlock screen now.
  const lockInstanceNow = useCallback(async () => {
    try {
      await api("/instance/lock", { method: "POST", token });
      window.dispatchEvent(new CustomEvent("instance-locked"));
    } catch (e) {
      showToast(localizeServerError(e?.message, "lockInstanceFailed"), "error");
    }
  }, [token, showToast]);

  const isLocked = !!(instanceLockStatus && instanceLockStatus.enabled && instanceLockStatus.locked);

  return {
    instanceLockStatus,
    refreshLockStatus,
    isLocked,
    lockBannerDismissed,
    setLockBannerDismissed,
    lockOverlayOpen,
    setLockOverlayOpen,
    lockInstanceNow,
  };
}
