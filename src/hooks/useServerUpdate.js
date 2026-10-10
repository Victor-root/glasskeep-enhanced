import { useEffect, useRef } from "react";
import { t } from "../i18n";
import { api } from "../utils/api.js";
import { useUpdateCheck } from "./useUpdateCheck.js";
import { useSelfUpdate } from "./useSelfUpdate.js";

/**
 * Admin-only server update: the GitHub release check, the self-update
 * driver, and the "new version available" notification with its
 * one-click update action.
 *
 * The notification is pinned to 30 s whatever the user's duration
 * preference, and capped at 3 displays per admin and version. The counter
 * lives server-side so the cap holds across the admin's devices: the
 * /update-check payload carries it and each shown card increments it.
 */
export default function useServerUpdate({ token, currentUser, notify }) {
  const isAdmin = !!currentUser?.is_admin;
  const updateInfo = useUpdateCheck({ token, isAdmin });
  const selfUpdate = useSelfUpdate({ token, isAdmin });

  const updateNotifiedVersionRef = useRef(null);
  useEffect(() => {
    if (!currentUser?.is_admin) return;
    if (!updateInfo?.updateAvailable || !updateInfo?.latestVersion) return;
    if (updateNotifiedVersionRef.current === updateInfo.latestVersion) return;
    if ((updateInfo.notificationShownCount || 0) >= 3) return;
    updateNotifiedVersionRef.current = updateInfo.latestVersion;
    const tk = token;
    if (tk) {
      api("/update-check/mark-shown", {
        method: "POST",
        body: { version: updateInfo.latestVersion },
        token: tk,
      }).catch(() => {
        /* counter just won't tick this round; nothing else to do */
      });
    }
    notify({
      type: "update_available",
      variant: "success",
      icon: "refresh",
      title: t("serverUpdateAvailable"),
      message: t("serverUpdateAvailableDescription").replace(
        "{version}",
        updateInfo.latestVersion,
      ),
      duration: 30000,
      action: {
        kind: "start_self_update",
        label: t("selfUpdateButton"),
        latestVersion: updateInfo.latestVersion,
      },
      // Long message + a primary action: the button goes on its own row
      // so the description can use the full card width.
      actionLayout: "below",
    });
  }, [
    currentUser?.is_admin,
    currentUser?.id,
    updateInfo?.updateAvailable,
    updateInfo?.latestVersion,
    updateInfo?.notificationShownCount,
    notify,
    token,
  ]);

  return { updateInfo, selfUpdate };
}
