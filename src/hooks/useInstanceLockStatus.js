// src/hooks/useInstanceLockStatus.js
// Polls the public /api/instance/status endpoint to figure out whether
// the server is in at-rest-encryption "locked" mode. The lock screen in
// App.jsx uses this to short-circuit the normal app render.
//
// The poll runs at a slow cadence — locking/unlocking is rare and we
// don't want to hammer the server. After a successful unlock we expose
// `refresh()` so the caller (e.g. the unlock screen) can refresh
// immediately without waiting for the next tick.

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../utils/api.js";

const DEFAULT_POLL_MS = 30 * 1000;

export default function useInstanceLockStatus({ pollMs = DEFAULT_POLL_MS } = {}) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

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

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
  }, [refresh, pollMs]);

  // Listen to lock-events fired by the api wrapper when a 423 lands —
  // any in-flight request can flip us back into the lock screen.
  useEffect(() => {
    const onLocked = () => {
      setStatus((prev) => prev ? { ...prev, locked: true, unlocked: false } : { enabled: true, locked: true, unlocked: false });
    };
    window.addEventListener("instance-locked", onLocked);
    return () => window.removeEventListener("instance-locked", onLocked);
  }, []);

  return { status, loading, refresh };
}
