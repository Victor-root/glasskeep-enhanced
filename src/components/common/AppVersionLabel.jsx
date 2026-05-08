import React from "react";
import { t } from "../../i18n";

export default function AppVersionLabel({ updateInfo }) {
  const fallback =
    typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "";
  const current = updateInfo?.currentVersion || fallback;
  const showUpdate =
    !!updateInfo?.updateAvailable && !!updateInfo?.latestVersion;

  return (
    <span className="text-xs text-gray-400 dark:text-gray-600 select-none tabular-nums">
      v{current}
      {showUpdate && (
        <>
          {" · "}
          <a
            href={updateInfo.releaseUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600 dark:hover:text-gray-400"
          >
            v{updateInfo.latestVersion} {t("updateAvailable")}
          </a>
        </>
      )}
    </span>
  );
}
