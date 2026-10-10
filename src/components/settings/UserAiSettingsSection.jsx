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
import { useStableCallback } from "../../hooks/useStableCallback.js";
import TI from "../../icons/editor/index.jsx";
import AiProviderFields, { AiTestResult } from "./AiProviderFields.jsx";
import useAiProviderFields from "../../hooks/useAiProviderFields.js";

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
  const {
    testing, testResult, setTestResult, runTest,
    applyProviderConfig, providerBody, withApiKeyDraft, fields,
  } = useAiProviderFields(token);
  const { baseUrl, model } = fields;

  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState("server");
  const [serverAiAvailable, setServerAiAvailable] = useState(false);
  // True when the admin has the master AI switch enabled. When false
  // the user toggle is greyed out and the rest of the form is hidden —
  // no mode is usable (not even custom) while AI is admin-disabled.
  const [adminAiEnabled, setAdminAiEnabled] = useState(true);

  // Pinned in a ref to keep the load effect independent from each
  // parent re-render.
  const onEnabledChangeRef = useRef(onEnabledChange);
  useEffect(() => {
    onEnabledChangeRef.current = onEnabledChange;
  }, [onEnabledChange]);

  // Shared by the initial load, every local save, and a
  // user_ai_settings_updated event relayed from another tab/device — one
  // place applies the server's response to local state.
  const applyConfig = (data) => {
    setEnabled(!!data.enabled);
    setMode(data.mode === "custom" ? "custom" : "server");
    setServerAiAvailable(!!data.serverAiAvailable);
    setAdminAiEnabled(data.adminAiEnabled !== false);
    applyProviderConfig(data);
    onEnabledChangeRef.current?.(
      !!data.enabled && data.adminAiEnabled !== false,
    );
  };
  // For the effects' callbacks, which run after the render they come from.
  const applyLatestConfig = useStableCallback(applyConfig);

  useEffect(() => {
    const onRemote = (e) => {
      if (e.detail) applyLatestConfig(e.detail);
    };
    window.addEventListener("user-ai-settings-updated", onRemote);
    return () => window.removeEventListener("user-ai-settings-updated", onRemote);
  }, [applyLatestConfig]);

  useEffect(() => {
    let cancelled = false;
    if (!token) return undefined;
    (async () => {
      setLoading(true);
      try {
        const data = await api("/user/ai/settings", { token });
        if (cancelled) return;
        applyLatestConfig(data);
      } catch (err) {
        // Background load: this panel mounts (and fetches) even while the
        // Settings panel is closed, so a failed initial fetch must stay
        // silent — never pop a toast the user didn't ask for. A server
        // that's down/restarting answers 503, which is NOT classed as a
        // network error and so previously slipped through to a raw
        // "HTTP 503" toast on a plain refresh. Match every other loader:
        // fail silently and keep the current defaults.
        if (!cancelled) console.warn("[ai] user settings load failed:", err?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, applyLatestConfig]);

  const buildPatch = (overrides = {}) => withApiKeyDraft({
    enabled,
    mode,
    ...providerBody(),
    ...overrides,
  });

  const persistPatch = async (patch) => {
    setSaving(true);
    setTestResult(null);
    try {
      const data = await api("/user/ai/settings", {
        method: "PUT",
        token,
        body: patch,
      });
      applyConfig(data);
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

  const onTest = () => runTest(
    "/user/ai/test",
    mode === "custom" ? withApiKeyDraft({ mode, ...providerBody() }) : { mode },
  );

  // When the admin has fully disabled AI, the user can't enable
  // anything — not even a custom provider. The toggle stays off and
  // the rest of the form is hidden.
  const effectiveEnabled = enabled && adminAiEnabled;

  return (
    <form onSubmit={onSave} className="space-y-4">
      {/* Enable toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div
            className={`font-medium ${adminAiEnabled ? "" : "text-gray-400 dark:text-gray-500"}`}
          >
            {t("userAiEnableLabel")}
          </div>
          <div
            className={`text-sm ${
              adminAiEnabled
                ? "text-gray-500"
                : "text-amber-700 dark:text-amber-400"
            }`}
          >
            {adminAiEnabled
              ? t("userAiEnableDesc")
              : t("userAiAdminDisabled")}
          </div>
        </div>
        <button
          type="button"
          disabled={loading || saving || !adminAiEnabled}
          onClick={onToggleEnabled}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
            effectiveEnabled ? "bg-[var(--gk-switch-on)]" : "bg-gray-300 dark:bg-gray-600"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-pressed={effectiveEnabled}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              effectiveEnabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {effectiveEnabled && (
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
                    ? "border-[var(--gk-chrome-accent)] bg-[var(--gk-accent-soft-bg)]"
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
                    ? "border-[var(--gk-chrome-accent)] bg-[var(--gk-accent-soft-bg)]"
                    : "border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                }`}
                aria-pressed={mode === "custom"}
              >
                <div className="font-medium flex items-center gap-2">
                  <TI.Brain className="tabler-icon w-4 h-4" />
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

              <AiProviderFields
                idPrefix="user-ai"
                fields={fields}
                disabled={loading || saving}
                onClearKey={onClearKey}
              />
            </>
          )}

          <AiTestResult result={testResult} />

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
                className="px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 hover:shadow-lg hover:shadow-indigo-300/50 disabled:opacity-50 disabled:pointer-events-none"
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
