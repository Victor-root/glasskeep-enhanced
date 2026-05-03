// src/components/panels/AiAdminSection.jsx
// Admin Panel section for the OpenAI-compatible AI provider.
//
// Loads the current settings from /api/admin/ai/settings (the API key
// is never returned — only a `hasApiKey` flag), lets the admin tweak
// them, runs a connectivity test, and persists changes via PUT.

import React, { useEffect, useRef, useState } from "react";
import { api } from "../../utils/api.js";
import { t } from "../../i18n";
import { localizeServerError } from "../../utils/serverErrors.js";
import TI from "../../icons/editor/index.jsx";

const FIELD_INPUT_CLASSES =
  "w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400 text-sm";

function PrivacyWarning() {
  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-900 dark:text-amber-100 flex items-start gap-2">
      <TI.ShieldLock className="tabler-icon w-5 h-5 mt-0.5 shrink-0" />
      <span>{t("aiPrivacyWarning")}</span>
    </div>
  );
}

export default function AiAdminSection({ token, showToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, message }

  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(800);

  // Track the loaded baseline so we can render the API-key field as
  // either "set" (placeholder hint) or "empty" without confusing the
  // user about whether they're about to clear an existing key.
  const baselineRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await api("/admin/ai/settings", { token });
        if (cancelled) return;
        setEnabled(!!data.enabled);
        setBaseUrl(data.baseUrl || "");
        setModel(data.model || "");
        setHasApiKey(!!data.hasApiKey);
        setApiKeyDraft("");
        setTemperature(
          typeof data.temperature === "number" ? data.temperature : 0.2,
        );
        setMaxTokens(
          typeof data.maxTokens === "number" ? data.maxTokens : 800,
        );
        baselineRef.current = data;
      } catch (err) {
        if (!cancelled) {
          showToast?.(
            localizeServerError(err?.message, "genericError"),
            "error",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, showToast]);

  const buildPatch = (overrides = {}) => {
    const patch = {
      enabled,
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      temperature: Number(temperature),
      maxTokens: Math.round(Number(maxTokens) || 0),
      ...overrides,
    };
    // apiKeyDraft semantics:
    //  - empty   + hasApiKey true  -> keep existing key
    //  - empty   + hasApiKey false -> nothing to send
    //  - non-empty                 -> replace key
    if (apiKeyDraft.length > 0) patch.apiKey = apiKeyDraft;
    return patch;
  };

  const onSave = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    setTestResult(null);
    try {
      const data = await api("/admin/ai/settings", {
        method: "PUT",
        token,
        body: buildPatch(),
      });
      setEnabled(!!data.enabled);
      setBaseUrl(data.baseUrl || "");
      setModel(data.model || "");
      setHasApiKey(!!data.hasApiKey);
      setApiKeyDraft("");
      setTemperature(
        typeof data.temperature === "number" ? data.temperature : 0.2,
      );
      setMaxTokens(typeof data.maxTokens === "number" ? data.maxTokens : 800);
      baselineRef.current = data;
      showToast?.(t("aiSettingsSaved"), "success");
    } catch (err) {
      showToast?.(localizeServerError(err?.message, "saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const onClearKey = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const data = await api("/admin/ai/settings", {
        method: "PUT",
        token,
        body: { apiKey: "" },
      });
      setHasApiKey(!!data.hasApiKey);
      setApiKeyDraft("");
      baselineRef.current = data;
      showToast?.(t("aiApiKeyCleared"), "success");
    } catch (err) {
      showToast?.(localizeServerError(err?.message, "saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const body = {
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        temperature: Number(temperature),
        maxTokens: Math.round(Number(maxTokens) || 0),
      };
      if (apiKeyDraft.length > 0) body.apiKey = apiKeyDraft;
      const data = await api("/admin/ai/test", {
        method: "POST",
        token,
        body,
      });
      setTestResult({
        ok: true,
        message: data?.reply
          ? `${t("aiTestOk")} — ${data.reply}`
          : t("aiTestOk"),
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: localizeServerError(err?.message, "aiTestFailed"),
      });
    } finally {
      setTesting(false);
    }
  };

  const apiKeyPlaceholder = hasApiKey ? t("aiApiKeyPlaceholderSet") : t("aiApiKeyPlaceholder");

  return (
    <form onSubmit={onSave} className="space-y-4">
      <PrivacyWarning />

      {/* Enable toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{t("aiEnableLabel")}</div>
          <div className="text-sm text-gray-500">{t("aiEnableDesc")}</div>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => setEnabled((v) => !v)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
            enabled ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"
          } disabled:opacity-50`}
          aria-pressed={enabled}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Provider — single value in V1 */}
      <div className="space-y-1">
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t("aiProviderLabel")}
        </label>
        <div className={`${FIELD_INPUT_CLASSES} bg-black/5 dark:bg-white/5 cursor-not-allowed select-none`}>
          {t("aiProviderOpenAICompatible")}
        </div>
        <p className="text-xs text-gray-500">{t("aiProviderHint")}</p>
      </div>

      {/* Base URL */}
      <div className="space-y-1">
        <label htmlFor="ai-base-url" className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t("aiBaseUrlLabel")}
        </label>
        <input
          id="ai-base-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={t("aiBaseUrlPlaceholder")}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          disabled={loading || saving}
          className={FIELD_INPUT_CLASSES}
        />
        <p className="text-xs text-gray-500">{t("aiBaseUrlHint")}</p>
      </div>

      {/* Model */}
      <div className="space-y-1">
        <label htmlFor="ai-model" className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t("aiModelLabel")}
        </label>
        <input
          id="ai-model"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={t("aiModelPlaceholder")}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={loading || saving}
          className={FIELD_INPUT_CLASSES}
        />
        <p className="text-xs text-gray-500">{t("aiModelHint")}</p>
      </div>

      {/* API Key (replace / clear) */}
      <div className="space-y-1">
        <label htmlFor="ai-api-key" className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t("aiApiKeyLabel")}
        </label>
        <div className="flex gap-2">
          <input
            id="ai-api-key"
            type={showKey ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            placeholder={apiKeyPlaceholder}
            value={apiKeyDraft}
            onChange={(e) => setApiKeyDraft(e.target.value)}
            disabled={loading || saving}
            className={FIELD_INPUT_CLASSES}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            disabled={loading || saving}
            className="shrink-0 px-3 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
            aria-label={showKey ? t("hide") : t("show")}
            data-tooltip={showKey ? t("hide") : t("show")}
          >
            <TI.Eye className="tabler-icon w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
          <span>{t("aiApiKeyHint")}</span>
          {hasApiKey && (
            <button
              type="button"
              onClick={onClearKey}
              disabled={loading || saving}
              className="text-red-600 hover:underline disabled:opacity-50"
            >
              {t("aiApiKeyClear")}
            </button>
          )}
        </div>
      </div>

      {/* Temperature + Max tokens */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="ai-temperature" className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("aiTemperatureLabel")}
          </label>
          <input
            id="ai-temperature"
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            disabled={loading || saving}
            className={FIELD_INPUT_CLASSES}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="ai-max-tokens" className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("aiMaxTokensLabel")}
          </label>
          <input
            id="ai-max-tokens"
            type="number"
            step="1"
            min="1"
            max="32768"
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
            disabled={loading || saving}
            className={FIELD_INPUT_CLASSES}
          />
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            testResult.ok
              ? "bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
              : "bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
          }`}
        >
          {testResult.message}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onTest}
          disabled={loading || testing || saving || !baseUrl.trim() || !model.trim()}
          className="px-4 py-2 rounded-lg font-semibold text-sm border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
        >
          {testing ? t("aiTesting") : t("aiTestConnection")}
        </button>
        <button
          type="submit"
          disabled={loading || saving}
          className="px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none disabled:opacity-50 disabled:pointer-events-none"
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}
