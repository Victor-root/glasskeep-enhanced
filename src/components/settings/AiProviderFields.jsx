// The OpenAI-compatible provider fields (base URL, model, API key,
// temperature, max tokens) and the connection test's result, shared by the
// admin's AI section and the user's custom AI settings. State and test
// live in hooks/useAiProviderFields.

import React from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { FIELD_INPUT_CLASSES } from "../common/fieldClasses.js";

export default function AiProviderFields({ idPrefix, fields, disabled, onClearKey }) {
  const {
    baseUrl, setBaseUrl,
    model, setModel,
    apiKeyDraft, setApiKeyDraft,
    hasApiKey,
    showKey, setShowKey,
    temperature, setTemperature,
    maxTokens, setMaxTokens,
  } = fields;
  const apiKeyPlaceholder = hasApiKey ? t("aiApiKeyPlaceholderSet") : t("aiApiKeyPlaceholder");

  return (
    <>
      {/* Base URL */}
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-base-url`} className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t("aiBaseUrlLabel")}
        </label>
        <input
          id={`${idPrefix}-base-url`}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={t("aiBaseUrlPlaceholder")}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          disabled={disabled}
          className={FIELD_INPUT_CLASSES}
        />
        <p className="text-xs text-gray-500">{t("aiBaseUrlHint")}</p>
      </div>

      {/* Model */}
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-model`} className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t("aiModelLabel")}
        </label>
        <input
          id={`${idPrefix}-model`}
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={t("aiModelPlaceholder")}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={disabled}
          className={FIELD_INPUT_CLASSES}
        />
        <p className="text-xs text-gray-500">{t("aiModelHint")}</p>
      </div>

      {/* API Key (replace / clear) */}
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-api-key`} className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t("aiApiKeyLabel")}
        </label>
        <div className="flex gap-2">
          <input
            id={`${idPrefix}-api-key`}
            type={showKey ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            placeholder={apiKeyPlaceholder}
            value={apiKeyDraft}
            onChange={(e) => setApiKeyDraft(e.target.value)}
            disabled={disabled}
            className={FIELD_INPUT_CLASSES}
          />
          {/* The toggle only makes sense when there's draft text to
              reveal: the saved key is hashed server-side and never
              returned, so flipping password→text on an empty field
              would do nothing visible. Hide the button entirely while
              hasApiKey is true and no replacement is being typed, and
              re-show it as soon as a new key is being typed (or when
              the slot is empty to begin with). */}
          {(!hasApiKey || apiKeyDraft.length > 0) && (
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              disabled={disabled}
              className="shrink-0 px-3 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
              aria-label={showKey ? t("hide") : t("show")}
              data-tooltip={showKey ? t("hide") : t("show")}
            >
              {showKey ? (
                <TI.EyeOff className="tabler-icon w-4 h-4" />
              ) : (
                <TI.Eye className="tabler-icon w-4 h-4" />
              )}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
          <span>{t("aiApiKeyHint")}</span>
          {hasApiKey && (
            <button
              type="button"
              onClick={onClearKey}
              disabled={disabled}
              className="text-red-600 hover:underline disabled:opacity-50"
            >
              {t("aiApiKeyClear")}
            </button>
          )}
        </div>
      </div>

      {/* Temperature + Max tokens */}
      <div className="space-y-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor={`${idPrefix}-temperature`} className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("aiTemperatureLabel")}
            </label>
            <input
              id={`${idPrefix}-temperature`}
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              disabled={disabled}
              className={FIELD_INPUT_CLASSES}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${idPrefix}-max-tokens`} className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("aiMaxTokensLabel")}
            </label>
            <input
              id={`${idPrefix}-max-tokens`}
              type="number"
              step="1"
              min="1"
              max="32768"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              disabled={disabled}
              className={FIELD_INPUT_CLASSES}
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 pt-1">
          {t("aiAdvancedFieldsHint")}
        </p>
      </div>
    </>
  );
}

export function AiTestResult({ result }) {
  if (!result) return null;
  return (
    <div
      className={`rounded-lg px-3 py-2 text-sm ${
        result.ok
          ? "bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
          : "bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
      }`}
    >
      {result.message}
    </div>
  );
}
