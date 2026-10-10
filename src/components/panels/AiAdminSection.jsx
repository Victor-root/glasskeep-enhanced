// src/components/panels/AiAdminSection.jsx
// Admin Panel section for the OpenAI-compatible AI provider.
//
// Loads the current settings from /api/admin/ai/settings (the API key
// is never returned — only a `hasApiKey` flag), lets the admin tweak
// them, runs a connectivity test, and persists changes via PUT.

import React, { useEffect, useState } from "react";
import { api } from "../../utils/api.js";
import { t } from "../../i18n";
import { localizeServerError } from "../../utils/serverErrors.js";
import { useStableCallback } from "../../hooks/useStableCallback.js";
import TI from "../../icons/editor/index.jsx";
import { FIELD_INPUT_CLASSES, GRADIENT_BUTTON_CLASSES } from "../common/fieldClasses.js";
import AiProviderFields, { AiTestResult } from "../settings/AiProviderFields.jsx";
import useAiProviderFields from "../../hooks/useAiProviderFields.js";

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
  const {
    testing, testResult, setTestResult, runTest,
    applyProviderConfig, providerBody, withApiKeyDraft, fields,
  } = useAiProviderFields(token);
  const { baseUrl, model } = fields;

  const [enabled, setEnabled] = useState(false);
  const [allowServerAiForUsers, setAllowServerAiForUsers] = useState(false);
  const [allowPrivateAiForUsers, setAllowPrivateAiForUsers] = useState(false);

  // Shared by the initial load, every local save, and an
  // admin_ai_settings_updated event relayed from another admin's tab —
  // one place applies the server's response to local state.
  const applyConfig = (data) => {
    setEnabled(!!data.enabled);
    setAllowServerAiForUsers(!!data.allowServerAiForUsers);
    setAllowPrivateAiForUsers(!!data.allowPrivateAiForUsers);
    applyProviderConfig(data);
  };
  // For the effects' callbacks, which run after the render they come from.
  const applyLatestConfig = useStableCallback(applyConfig);

  useEffect(() => {
    const onRemote = (e) => {
      if (e.detail) applyLatestConfig(e.detail);
    };
    window.addEventListener("admin-ai-settings-updated", onRemote);
    return () => window.removeEventListener("admin-ai-settings-updated", onRemote);
  }, [applyLatestConfig]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await api("/admin/ai/settings", { token });
        if (cancelled) return;
        applyLatestConfig(data);
      } catch (err) {
        // Background load: mounts (and fetches) with the admin panel even
        // when closed, so a failed initial fetch stays silent instead of
        // popping a raw "HTTP 503" toast when the server is down/restarting
        // (503 isn't classed as a network error). Match every other loader.
        if (!cancelled) console.warn("[ai] admin settings load failed:", err?.message);
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
    allowServerAiForUsers,
    allowPrivateAiForUsers,
    ...providerBody(),
    ...overrides,
  });

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
      applyConfig(data);
      showToast?.(t("aiSettingsSaved"), "success");
    } catch (err) {
      showToast?.(localizeServerError(err?.message, "saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  // Persist a single field immediately (used by the toggles so the
  // admin doesn't have to remember to hit Save before reloading).
  const persistOne = async (patch) => {
    setSaving(true);
    setTestResult(null);
    try {
      const data = await api("/admin/ai/settings", {
        method: "PUT",
        token,
        body: patch,
      });
      applyConfig(data);
    } catch (err) {
      showToast?.(localizeServerError(err?.message, "saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const onToggleEnabled = () => {
    const next = !enabled;
    setEnabled(next);
    // When the master switch goes off, the share flag becomes
    // meaningless; flip it off in the same write so the user-facing
    // serverAiAvailable also drops to false.
    const patch = { enabled: next };
    if (!next && allowServerAiForUsers) {
      patch.allowServerAiForUsers = false;
      setAllowServerAiForUsers(false);
    }
    if (!next && allowPrivateAiForUsers) {
      patch.allowPrivateAiForUsers = false;
      setAllowPrivateAiForUsers(false);
    }
    persistOne(patch);
  };

  // Users reaching private addresses only makes sense while the feature is
  // on at all, and follows it down when it is switched off, exactly like the
  // sharing toggle above.
  const onTogglePrivate = () => {
    if (!enabled) return;
    const next = !allowPrivateAiForUsers;
    setAllowPrivateAiForUsers(next);
    persistOne({ allowPrivateAiForUsers: next });
  };

  const onToggleShare = () => {
    if (!enabled) return;
    const next = !allowServerAiForUsers;
    setAllowServerAiForUsers(next);
    persistOne({ allowServerAiForUsers: next });
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
      applyConfig(data);
      showToast?.(t("aiApiKeyCleared"), "success");
    } catch (err) {
      showToast?.(localizeServerError(err?.message, "saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const onTest = () => runTest("/admin/ai/test", withApiKeyDraft(providerBody()));

  return (
    <form onSubmit={onSave} className="space-y-4">
      <PrivacyWarning />

      {/* Enable toggle — auto-saves */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{t("aiEnableLabel")}</div>
          <div className="text-sm text-gray-500">{t("aiEnableDesc")}</div>
        </div>
        <button
          type="button"
          disabled={loading || saving}
          onClick={onToggleEnabled}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
            enabled ? "bg-[var(--gk-switch-on)]" : "bg-gray-300 dark:bg-gray-600"
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

      {/* Share with users toggle — auto-saves */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{t("aiAllowServerAiForUsersLabel")}</div>
          <div className="text-sm text-gray-500">{t("aiAllowServerAiForUsersDesc")}</div>
        </div>
        <button
          type="button"
          disabled={loading || saving || !enabled}
          onClick={onToggleShare}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
            allowServerAiForUsers && enabled
              ? "bg-[var(--gk-switch-on)]"
              : "bg-gray-300 dark:bg-gray-600"
          } disabled:opacity-50`}
          aria-pressed={allowServerAiForUsers}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              allowServerAiForUsers && enabled
                ? "translate-x-6"
                : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Let users reach private addresses — auto-saves */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{t("aiAllowPrivateAiForUsersLabel")}</div>
          <div className="text-sm text-gray-500">{t("aiAllowPrivateAiForUsersDesc")}</div>
        </div>
        <button
          type="button"
          disabled={loading || saving || !enabled}
          onClick={onTogglePrivate}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
            allowPrivateAiForUsers && enabled
              ? "bg-[var(--gk-switch-on)]"
              : "bg-gray-300 dark:bg-gray-600"
          } disabled:opacity-50`}
          aria-pressed={allowPrivateAiForUsers}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              allowPrivateAiForUsers && enabled
                ? "translate-x-6"
                : "translate-x-1"
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

      <AiProviderFields
        idPrefix="ai"
        fields={fields}
        disabled={loading || saving}
        onClearKey={onClearKey}
      />

      <AiTestResult result={testResult} />

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
          className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${GRADIENT_BUTTON_CLASSES} disabled:opacity-50 disabled:pointer-events-none`}
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}
