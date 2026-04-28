// src/hooks/useInstanceLockStatus.js
// Polls the public /api/instance/status endpoint to figure out whether
// the server is in at-rest-encryption "locked" mode. The lock screen in
// App.jsx uses this to short-circuit the normal app render.
//
// Polling cadence:
//   - When the instance is unlocked we poll slowly (30 s), since
//     locking is rare and we don't want to hammer the server.
//   - When the instance is locked we poll fast (3 s) so a parallel
//     browser tab notices an unlock done elsewhere within seconds
//     instead of having to wait for the slow tick or a manual refresh.
//     The endpoint is cheap and the screen the user sees while locked
//     is exactly where they're waiting for state to flip back.
// We also refresh immediately whenever the document regains visibility
// or focus — covers the "I unlocked in tab A, switched back to tab B"
// case, which is the most common parallel-session scenario.

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../utils/api.js";

const POLL_MS_UNLOCKED = 30 * 1000;
const POLL_MS_LOCKED = 3 * 1000;

export default function useInstanceLockStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);
  const statusRef = useRef(null);
  statusRef.current = status;

  const refresh = useCallback(async () => {
    try {
      const data = await api("/instance/status");
      if (cancelledRef.current) return null;
      setStatus(data);
      setLoading(false);
      return data;
    } catch {
      // A locked server still answers /api/instance/status (it is on
      // the allowlist). A failure here means a real network problem,
      // not a lock. We don't render the lock screen on network errors
      // so the user can keep using the cached notes.
      if (cancelledRef.current) return null;
      setLoading(false);
      return null;
    }
  }, []);

  // Adaptive polling: short interval when locked, long when unlocked.
  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    const isLocked = !!(statusRef.current?.enabled && statusRef.current?.locked);
    const interval = isLocked ? POLL_MS_LOCKED : POLL_MS_UNLOCKED;
    const id = setInterval(refresh, interval);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
    // Re-run when locked-ness changes so the interval matches the
    // current state. Reading status (not statusRef) on purpose so the
    // effect re-subscribes when the value flips.
  }, [refresh, status?.enabled, status?.locked]);

  // Refresh when the tab regains focus or visibility — covers the
  // "unlocked in tab A, switched back to tab B" case so the second
  // tab updates without waiting for the next tick.
  useEffect(() => {
    const onWake = () => { refresh(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [refresh]);

  // Listen to lock-events fired by the api wrapper when a 423 lands —
  // any in-flight request can flip us back into the lock screen. The
  // server also pushes an SSE 'instance_locked' that App.jsx forwards
  // here through the same custom event.
  useEffect(() => {
    const onLocked = () => {
      setStatus((prev) => prev
        ? { ...prev, locked: true, unlocked: false }
        : { enabled: true, locked: true, unlocked: false });
    };
    window.addEventListener("instance-locked", onLocked);
    return () => window.removeEventListener("instance-locked", onLocked);
  }, []);

  return { status, loading, refresh };
}
