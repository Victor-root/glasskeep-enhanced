import { useCallback, useEffect, useState } from "react";
import { api } from "../utils/api.js";

const initialState = () => ({
  updateAvailable: false,
  latestVersion: null,
  releaseUrl: null,
  notificationShownCount: 0,
  channel: "stable",
  targetKind: null,
  currentVersion:
    typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null,
  checkedAt: null,
  stale: false,
});

// `refresh` checks again, after the admin changed the update channel.
// `checkNow` asks the server to ask GitHub again instead of answering its
// cached check; `checking` is true until that answer arrives.
export function useUpdateCheck({ token, isAdmin }) {
  const [info, setInfo] = useState(initialState);
  const [round, setRound] = useState({ n: 0, now: false });
  const [checking, setChecking] = useState(false);
  const refresh = useCallback(() => setRound((r) => ({ n: r.n + 1, now: false })), []);
  const checkNow = useCallback(() => {
    setChecking(true);
    setRound((r) => ({ n: r.n + 1, now: true }));
  }, []);

  useEffect(() => {
    if (!token || !isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api(round.now ? "/update-check?now=1" : "/update-check", { token, timeoutMs: 8000 });
        if (cancelled || !data) return;
        setInfo({
          updateAvailable: !!data.updateAvailable,
          latestVersion: data.latestVersion || null,
          releaseUrl: data.releaseUrl || null,
          notificationShownCount:
            typeof data.notificationShownCount === "number"
              ? data.notificationShownCount
              : 0,
          channel: data.channel || "stable",
          targetKind: data.targetKind || null,
          currentVersion:
            data.currentVersion ||
            (typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null),
          checkedAt: data.checkedAt || null,
          stale: !!data.stale,
        });
      } catch {
        /* fail silently */
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, isAdmin, round]);

  return { ...info, refresh, checkNow, checking };
}
