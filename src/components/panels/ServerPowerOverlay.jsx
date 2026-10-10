import React from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";

// Blocking card shown while the server restarts or shuts down: the
// spinning action icon while waiting, then a check and the reload
// countdown.
export default function ServerPowerOverlay({ phase, Icon, inProgressTitle, waitingText, doneTitle, countdown }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="rounded-xl shadow-2xl w-[90%] max-w-sm p-6 relative text-center bg-white dark:bg-[#282828] border border-[var(--border-light)]"
      >
        {phase === "waiting" ? (
          <>
            <div className="flex justify-center mb-4">
              <Icon className="tabler-icon w-10 h-10 text-[var(--gk-chrome-accent)] animate-spin" />
            </div>
            <h3 className="text-lg font-semibold mb-1">{inProgressTitle}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{waitingText}</p>
          </>
        ) : (
          <>
            <div className="flex justify-center mb-4">
              <TI.Check className="tabler-icon w-10 h-10 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold mb-1">{doneTitle}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("restartServerReloadIn").replace("{n}", countdown)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
