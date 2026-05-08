import { useEffect, useState } from "react";
import { api } from "../utils/api.js";
import { t } from "../i18n";

const TOAST_SESSION_KEY = "gk_update_toast_shown_for";

const initialState = () => ({
  updateAvailable: false,
  latestVersion: null,
  releaseUrl: null,
  currentVersion:
    typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null,
});

export function useUpdateCheck({ token, isAdmin, showToast }) {
  const [info, setInfo] = useState(initialState);

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
          currentVersion:
            data.currentVersion ||
            (typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null),
        });
        if (data.updateAvailable && data.latestVersion) {
          try {
            const shown = sessionStorage.getItem(TOAST_SESSION_KEY);
            if (shown !== data.latestVersion) {
              const msg = t("newVersionAvailable").replace(
                "{version}",
                data.latestVersion,
              );
              showToast?.(msg, "info");
              sessionStorage.setItem(TOAST_SESSION_KEY, data.latestVersion);
            }
          } catch (_) {
            /* sessionStorage unavailable — ignore silently */
          }
        }
      } catch (_) {
        /* fail silently */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin]);

  return info;
}
