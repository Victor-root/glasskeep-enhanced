import React from "react";
import { t } from "../../i18n";
import { AskAiIcon } from "../../icons/index.jsx";

// Desktop: full search bar of the notes header. Enter (or the AI button)
// sends a non-empty query to the AI assistant when it is enabled.
export default function DesktopHeaderSearch({ desktopOnly, search, setSearch, aiAssistantEnabled, onAiSearch }) {
  return (
    <div className={`${desktopOnly} flex-grow min-w-0 justify-center px-2 xl:px-8`}>
      <div className="relative w-full max-w-lg">
        <input
          type="text"
          placeholder={aiAssistantEnabled ? t("searchOrAskAi") : t("search")}
          className={`w-full bg-transparent border border-transparent rounded-lg pl-4 ${aiAssistantEnabled ? "pr-20" : "pr-8"} py-2 ring-1 ring-slate-400/15 transition-shadow focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              aiAssistantEnabled &&
              search.trim().length > 0
            ) {
              onAiSearch?.(search);
            }
          }}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {aiAssistantEnabled && search.trim().length > 0 && (
            <button
              type="button"
              data-tooltip={t("askAi")}
              className="h-7 w-7 rounded-full flex items-center justify-center text-indigo-600 hover:bg-indigo-600/10 transition-colors"
              onClick={() => onAiSearch?.(search)}
            >
              <AskAiIcon size="18" />
            </button>
          )}
          {search && (
            <button
              type="button"
              aria-label={t("clearSearch")}
              className="h-6 w-6 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
              onClick={() => setSearch("")}
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
