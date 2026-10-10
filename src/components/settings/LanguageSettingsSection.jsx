import React, { useState, useRef } from "react";
import { t, setLanguageOverride, SUPPORTED_LANGUAGES, LANGUAGE_NATIVE_LABELS } from "../../i18n";
import { api } from "../../utils/api.js";
import { localizeServerError } from "../../utils/serverErrors.js";
import TI from "../../icons/editor/index.jsx";
import Popover from "../common/Popover.jsx";

// Language section of the Settings panel. languageChoice is owned by
// SettingsPanel, which loads it with the rest of the profile when the
// panel opens.
export default function LanguageSettingsSection({ token, showToast, languageChoice, setLanguageChoice }) {
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const languageBtnRef = useRef(null);

  const handleLanguageChange = async (next) => {
    const previous = languageChoice;
    if (next === previous) return;
    setLanguageChoice(next);
    try {
      await api("/user/profile", {
        method: "PATCH",
        body: { language: next || null },
        token,
      });
      setLanguageOverride(next || null);
      // Strings are bound at module load: reload so the new dict is used.
      window.location.reload();
    } catch (err) {
      setLanguageChoice(previous);
      showToast?.(localizeServerError(err.message, "languageSaveFailed"), "error");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-3 py-3 border border-[var(--border-light)] rounded-lg">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{t("languageLabel")}</div>
          <div className="text-sm text-gray-500">{t("languageDesc")}</div>
        </div>
        <button
          ref={languageBtnRef}
          type="button"
          onClick={() => setLanguageMenuOpen((v) => !v)}
          className="shrink-0 inline-flex items-center justify-between gap-2 min-w-[9rem] px-3 py-1.5 text-sm rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
          aria-haspopup="listbox"
          aria-expanded={languageMenuOpen}
          data-tooltip={languageChoice ? undefined : t("languageAutoTooltip")}
        >
          <span>
            {languageChoice
              ? LANGUAGE_NATIVE_LABELS[languageChoice] || languageChoice
              : t("languageAuto")}
          </span>
          <TI.ChevronDown
            className={`tabler-icon w-4 h-4 transition-transform ${languageMenuOpen ? "rotate-180" : ""}`}
          />
        </button>
        <Popover
          anchorRef={languageBtnRef}
          open={languageMenuOpen}
          onClose={() => setLanguageMenuOpen(false)}
          offset={6}
        >
          <ul
            className="min-w-[10rem] rounded-xl border border-[var(--border-light)] bg-white dark:bg-[#222222] text-gray-800 dark:text-gray-100 shadow-xl py-1.5 overflow-hidden"
            role="listbox"
            onClick={(e) => e.stopPropagation()}
          >
            {[
              { value: "", label: t("languageAuto") },
              ...SUPPORTED_LANGUAGES.map((code) => ({
                value: code,
                label: LANGUAGE_NATIVE_LABELS[code] || code,
              })),
            ].map((opt) => {
              const selected = languageChoice === opt.value;
              return (
                <li key={opt.value || "auto"} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left transition-colors ${
                      selected
                        ? "bg-[var(--gk-accent-soft-bg)] text-[var(--gk-chrome-accent)] font-semibold"
                        : "hover:bg-black/5 dark:hover:bg-white/10"
                    }`}
                    onClick={() => {
                      setLanguageMenuOpen(false);
                      handleLanguageChange(opt.value);
                    }}
                  >
                    <span>{opt.label}</span>
                    {selected && <TI.Check className="tabler-icon w-4 h-4 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </Popover>
      </div>
    </div>
  );
}
