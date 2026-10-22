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
});

// `refresh` checks again, after the admin changed the update channel.
export function useUpdateCheck({ token, isAdmin }) {
  const [info, setInfo] = useState(initialState);
  const [round, setRound] = useState(0);
  const refresh = useCallback(() => setRound((n) => n + 1), []);

  useEffect(() => {
    if (!token || !isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api("/update-check", { token, timeoutMs: 8000 });
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
        });
      } catch {
        /* fail silently */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, isAdmin, round]);

  return { ...info, refresh };
}
