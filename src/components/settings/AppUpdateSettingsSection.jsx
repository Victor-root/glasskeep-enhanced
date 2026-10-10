import React from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { RowIcon } from "../common/SettingsAccordion.jsx";

// Application section of the Settings panel (Android app only): F-Droid
// shortcut, detected update card or manual update check. The app info
// comes from SettingsPanel, which reads it from the Android bridge.
export default function AppUpdateSettingsSection({
  dark,
  appVersion,
  installedFromFdroid,
  availableUpdate,
  setAvailableUpdate,
}) {
  return (
    <div className="space-y-3">
      {installedFromFdroid ? (
        /* F-Droid installs delegate updates to F-Droid
           itself. Rather than a passive "managed by
           F-Droid" note, surface a button that opens
           F-Droid straight on this app's page so the
           user can update in one tap. */
        <button
          type="button"
          onClick={() => {
            try { window.AndroidTheme?.openFdroidPage?.(); } catch { /* bridge unavailable: nothing to open */ }
          }}
          className={`flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
        >
          <RowIcon icon={TI.Download} />
          <div className="min-w-0">
            <div className="font-medium">{t("openFdroid")}</div>
            <div className="text-sm text-gray-500 mt-0.5">
              {t("appUpdatesManagedByFdroid")}
            </div>
            {appVersion && (
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 tabular-nums">
                {t("currentAppVersion").replace("{version}", appVersion)}
              </div>
            )}
          </div>
        </button>
      ) : availableUpdate ? (
        /* When a release has been detected the card replaces
           the "Check for updates" button entirely; keeping
           both side-by-side made the section feel redundant
           (the card is itself the answer to the check). */
        <div className="px-3 py-3 border border-[var(--gk-accent-soft-border)] rounded-lg bg-[var(--gk-accent-soft-bg)]">
          <div className="flex items-start gap-3">
            <RowIcon icon={TI.Sparkles} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t("updateAvailableHeader")}</div>
              <div className="text-sm text-gray-700 dark:text-gray-200 mt-0.5">
                {t("updateAvailableVersion").replace("{version}", availableUpdate.version)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                {t("updateAvailableServerHint")}
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                try { window.AndroidTheme?.dismissAvailableUpdate?.(); } catch { /* bridge unavailable: the card is still hidden below */ }
                setAvailableUpdate(null);
              }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              {t("updateAvailableLater")}
            </button>
            <button
              type="button"
              onClick={() => {
                try { window.AndroidTheme?.installAvailableUpdate?.(); } catch { /* bridge unavailable: nothing to install */ }
              }}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 hover:scale-[1.03] active:scale-[0.98] btn-gradient"
            >
              {t("updateAvailableDownload")}
            </button>
          </div>
        </div>
      ) : (
        <button
          className={`flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
          onClick={() => {
            try { window.AndroidTheme.checkForUpdate(); } catch { /* bridge unavailable: no check to run */ }
          }}
        >
          <RowIcon icon={TI.Download} />
          <div className="min-w-0">
            <div className="font-medium">{t("checkForUpdateOption")}</div>
            <div className="text-sm text-gray-500">{t("checkForUpdateDesc")}</div>
            {appVersion && (
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 tabular-nums">
                {t("currentAppVersion").replace("{version}", appVersion)}
              </div>
            )}
          </div>
        </button>
      )}
    </div>
  );
}
