// src/components/settings/UserAiSettingsSection.jsx
// User-side AI settings: enable / disable, choose between the shared
// "server" AI (configured by an admin) or a personal "custom" provider.
//
// Important: this component never receives the admin's base URL, model
// or API key — only a `serverAiAvailable` boolean flag tells it whether
// the "server" mode is permitted.

import React, { useEffect, useRef, useState } from "react";
import { api } from "../../utils/api.js";
import { t } from "../../i18n";
import { localizeServerError } from "../../utils/serverErrors.js";
import TI from "../../icons/editor/index.jsx";

const FIELD_INPUT_CLASSES =
  "w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400 text-sm";

function PrivacyWarning({ tone = "amber" }) {
  const palette =
    tone === "amber"
      ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100"
      : "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100";
  return (
    <div className={`rounded-lg border ${palette} px-3 py-2 text-sm flex items-start gap-2`}>
      <TI.ShieldLock className="tabler-icon w-5 h-5 mt-0.5 shrink-0" />
      <span>{t("aiPrivacyWarning")}</span>
    </div>
  );
}

export default function UserAiSettingsSection({ token, showToast, onEnabledChange }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState("server");
  const [serverAiAvailable, setServerAiAvailable] = useState(false);

  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(800);

  // Pinned in a ref to keep the load effect independent from each
  // parent re-render.
  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);
  const onEnabledChangeRef = useRef(onEnabledChange);
  useEffect(() => {
    onEnabledChangeRef.current = onEnabledChange;
  }, [onEnabledChange]);

  useEffect(() => {
    let cancelled = false;
    if (!token) return undefined;
    (async () => {
      setLoading(true);
      try {
        const data = await api("/user/ai/settings", { token });
        if (cancelled) return;
        setEnabled(!!data.enabled);
        setMode(data.mode === "custom" ? "custom" : "server");
        setServerAiAvailable(!!data.serverAiAvailable);
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
        onEnabledChangeRef.current?.(!!data.enabled);
      } catch (err) {
        if (!cancelled) {
          showToastRef.current?.(
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
  }, [token]);

  const buildPatch = (overrides = {}) => {
    const patch = {
      enabled,
      mode,
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      temperature: Number(temperature),
      maxTokens: Math.round(Number(maxTokens) || 0),
      ...overrides,
    };
    if (apiKeyDraft.length > 0) patch.apiKey = apiKeyDraft;
    return patch;
  };

  const persistPatch = async (patch) => {
    setSaving(true);
    setTestResult(null);
    try {
      const data = await api("/user/ai/settings", {
        method: "PUT",
        token,
        body: patch,
      });
      setEnabled(!!data.enabled);
      setMode(data.mode === "custom" ? "custom" : "server");
      setServerAiAvailable(!!data.serverAiAvailable);
      setBaseUrl(data.baseUrl || "");
      setModel(data.model || "");
      setHasApiKey(!!data.hasApiKey);
      setApiKeyDraft("");
      setTemperature(
        typeof data.temperature === "number" ? data.temperature : 0.2,
      );
      setMaxTokens(typeof data.maxTokens === "number" ? data.maxTokens : 800);
      onEnabledChangeRef.current?.(!!data.enabled);
      return data;
    } finally {
      setSaving(false);
    }
  };

  const onSave = async (e) => {
    e?.preventDefault?.();
    try {
      await persistPatch(buildPatch());
      showToast?.(t("aiSettingsSaved"), "success");
    } catch (err) {
      showToast?.(localizeServerError(err?.message, "saveFailed"), "error");
    }
  };

  const onToggleEnabled = async () => {
    try {
      await persistPatch(buildPatch({ enabled: !enabled }));
    } catch (err) {
      showToast?.(localizeServerError(err?.message, "saveFailed"), "error");
    }
  };

  const onSelectMode = async (nextMode) => {
    if (nextMode === mode) return;
    if (nextMode === "server" && !serverAiAvailable) return;
    try {
      await persistPatch(buildPatch({ mode: nextMode }));
    } catch (err) {
      showToast?.(localizeServerError(err?.message, "saveFailed"), "error");
    }
  };

  const onClearKey = async () => {
    try {
      await persistPatch({ apiKey: "" });
      showToast?.(t("aiApiKeyCleared"), "success");
    } catch (err) {
      showToast?.(localizeServerError(err?.message, "saveFailed"), "error");
    }
  };

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const body = { mode };
      if (mode === "custom") {
        body.baseUrl = baseUrl.trim();
        body.model = model.trim();
        body.temperature = Number(temperature);
        body.maxTokens = Math.round(Number(maxTokens) || 0);
        if (apiKeyDraft.length > 0) body.apiKey = apiKeyDraft;
      }
      const data = await api("/user/ai/test", {
        method: "POST",
        token,
        timeoutMs: 60000,
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

  const apiKeyPlaceholder = hasApiKey
    ? t("aiApiKeyPlaceholderSet")
    : t("aiApiKeyPlaceholder");

  return (
    <form onSubmit={onSave} className="space-y-4">
      {/* Enable toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{t("userAiEnableLabel")}</div>
          <div className="text-sm text-gray-500">{t("userAiEnableDesc")}</div>
        </div>
        <button
          type="button"
          disabled={loading || saving}
          onClick={onToggleEnabled}
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

      {enabled && (
        <>
          {/* Mode picker */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("userAiModeLabel")}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onSelectMode("server")}
                disabled={loading || saving || !serverAiAvailable}
                className={`text-left rounded-lg border px-3 py-2 transition-colors disabled:opacity-50 ${
                  mode === "server"
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30"
                    : "border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                }`}
                aria-pressed={mode === "server"}
              >
                <div className="font-medium flex items-center gap-2">
                  <TI.World className="tabler-icon w-4 h-4" />
                  {t("userAiModeServer")}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {serverAiAvailable
                    ? t("userAiModeServerDesc")
                    : t("userAiModeServerUnavailable")}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onSelectMode("custom")}
                disabled={loading || saving}
                className={`text-left rounded-lg border px-3 py-2 transition-colors disabled:opacity-50 ${
                  mode === "custom"
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30"
                    : "border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                }`}
                aria-pressed={mode === "custom"}
              >
                <div className="font-medium flex items-center gap-2">
                  <TI.Sparkles className="tabler-icon w-4 h-4" />
                  {t("userAiModeCustom")}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {t("userAiModeCustomDesc")}
                </div>
              </button>
            </div>
          </div>

          {mode === "server" && (
            <PrivacyWarning tone="blue" />
          )}

          {mode === "custom" && (
            <>
              <PrivacyWarning />

              {/* Base URL */}
              <div className="space-y-1">
                <label htmlFor="user-ai-base-url" className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("aiBaseUrlLabel")}
                </label>
                <input
                  id="user-ai-base-url"
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
                <label htmlFor="user-ai-model" className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("aiModelLabel")}
                </label>
                <input
                  id="user-ai-model"
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

              {/* API Key */}
              <div className="space-y-1">
                <label htmlFor="user-ai-api-key" className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("aiApiKeyLabel")}
                </label>
                <div className="flex gap-2">
                  <input
                    id="user-ai-api-key"
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
                  <label htmlFor="user-ai-temperature" className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t("aiTemperatureLabel")}
                  </label>
                  <input
                    id="user-ai-temperature"
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
                  <label htmlFor="user-ai-max-tokens" className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t("aiMaxTokensLabel")}
                  </label>
                  <input
                    id="user-ai-max-tokens"
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
            </>
          )}

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
              disabled={
                loading ||
                testing ||
                saving ||
                (mode === "server" && !serverAiAvailable) ||
                (mode === "custom" && (!baseUrl.trim() || !model.trim()))
              }
              className="px-4 py-2 rounded-lg font-semibold text-sm border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
            >
              {testing ? t("aiTesting") : t("aiTestConnection")}
            </button>
            {mode === "custom" && (
              <button
                type="submit"
                disabled={loading || saving}
                className="px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none disabled:opacity-50 disabled:pointer-events-none"
              >
                {saving ? t("saving") : t("save")}
              </button>
            )}
          </div>
        </>
      )}
    </form>
  );
}
