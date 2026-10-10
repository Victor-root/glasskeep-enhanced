import React from "react";
import { t } from "../../i18n";
import { openExternalUrl } from "./changelogContent.js";

// GitHub star prompt at the bottom of the changelog.
export default function ChangelogStarCta({ onDismiss }) {
    return (
        <div className="shrink-0 flex items-center justify-center gap-2 px-5 py-2 border-t border-[var(--border-light)] bg-white/40 dark:bg-white/5">
            <span className="text-xs text-gray-400 dark:text-gray-500">
                {t("changelogStarUs")}{" "}
                <button
                    type="button"
                    onClick={() => openExternalUrl("https://github.com/Victor-root/glasskeep-enhanced")}
                    className="underline underline-offset-2 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                    {t("changelogStarUsLink")}
                </button>
            </span>
            <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">·</span>
            <button
                type="button"
                onClick={onDismiss}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
                {t("changelogStarUsDone")}
            </button>
        </div>
    );
}
