// src/components/admin/OidcAdminSection.jsx
//
// Admin Panel section for single sign-on through an OpenID Connect
// provider (Authentik, Keycloak, Authelia, …).
//
// The admin enters what the provider gave them (issuer, client ID,
// client secret); GlassKeep's own address is never typed. It is the one
// this browser is on, window.location.origin, exactly like the
// federation pairing, and it is sent with every save so the callback the
// server uses is the one shown here. The client secret is write-only:
// the server only says whether one is stored.

import React, { useEffect, useState } from "react";
import { api } from "../../utils/api.js";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import CopyButton from "../common/CopyButton.jsx";
import { oidcErrorMessage } from "../../auth/oidcClient.js";

const FIELD_INPUT_CLASSES =
  "w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--gk-chrome-accent)] placeholder-gray-500 dark:placeholder-gray-400 text-sm";
const LABEL_CLASSES = "block text-xs font-semibold uppercase tracking-wide text-gray-500";

const TEST_WARNING_KEYS = {
  issuer_not_https: "oidcTestWarnIssuerHttp",
  pkce_not_advertised: "oidcTestWarnPkce",
};

function Switch({ on, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={on}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
        on ? "bg-[var(--gk-switch-on)]" : "bg-gray-300 dark:bg-gray-600"
      } disabled:opacity-50`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          on ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function CopyRow({ label, value }) {
  return (
    <div className="space-y-1">
      <div className={LABEL_CLASSES}>{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 text-xs font-mono text-gray-800 dark:text-gray-100 bg-white dark:bg-black/40 border border-[var(--border-light)] rounded-md px-2 py-1.5 whitespace-nowrap overflow-x-auto">
          {value}
        </code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function Warning({ children }) {
  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-900 dark:text-amber-100 flex items-start gap-2">
      <TI.AlertTriangle className="tabler-icon w-5 h-5 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export default function OidcAdminSection({ token, showToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [enabled, setEnabled] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [clientId, setClientId] = useState("");
  const [secretDraft, setSecretDraft] = useState("");
  const [hasClientSecret, setHasClientSecret] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [autoCreateAccounts, setAutoCreateAccounts] = useState(true);
  const [savedOrigin, setSavedOrigin] = useState("");

  const origin = window.location.origin;
  const callbackUrl = `${origin}/api/auth/oidc/callback`;
  const isHttps = window.location.protocol === "https:";

  const applyConfig = (provider) => {
    setEnabled(!!provider?.enabled);
    setDisplayName(provider?.displayName || "");
    setIssuer(provider?.issuer || "");
    setClientId(provider?.clientId || "");
    setHasClientSecret(!!provider?.hasClientSecret);
    setSecretDraft("");
    setAutoCreateAccounts(provider ? !!provider.autoCreateAccounts : true);
    setSavedOrigin(provider?.publicOrigin || "");
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api("/admin/oidc", { token });
        if (!cancelled) applyConfig(data?.provider);
      } catch (err) {
        // Mounted with the admin panel even while closed: stay silent like
        // the other background loaders rather than toast a raw error.
        if (!cancelled) console.warn("[oidc] admin settings load failed:", err?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const save = async (overrides = {}) => {
    setSaving(true);
    setTestResult(null);
    try {
      const body = {
        displayName: displayName.trim(),
        issuer: issuer.trim(),
        clientId: clientId.trim(),
        enabled,
        autoCreateAccounts,
        publicOrigin: origin,
        ...overrides,
      };
      if (secretDraft) body.clientSecret = secretDraft;
      const data = await api("/admin/oidc", { method: "PUT", token, timeoutMs: 30000, body });
      applyConfig(data?.provider);
      showToast?.(t("oidcSaved"), "success");
    } catch (err) {
      showToast?.(oidcErrorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await api("/admin/oidc/test", {
        method: "POST",
        token,
        timeoutMs: 30000,
        body: { issuer: issuer.trim(), clientId: clientId.trim() },
      }));
    } catch (err) {
      setTestResult({ ok: false, error: err?.message, detail: null });
    } finally {
      setTesting(false);
    }
  };

  const busy = loading || saving;
  const canTest = !!issuer.trim() && !!clientId.trim();

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); save(); }}
      className="space-y-4"
    >
      <p className="text-sm text-gray-500">{t("oidcIntro")}</p>

      {!isHttps && <Warning>{t("oidcHttpWarning")}</Warning>}

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{t("oidcEnableLabel")}</div>
          <div className="text-sm text-gray-500">{t("oidcEnableDesc")}</div>
        </div>
        <Switch on={enabled} disabled={busy} onClick={() => save({ enabled: !enabled })} />
      </div>

      <div className="rounded-lg border border-[var(--border-light)] bg-gray-50 dark:bg-black/30 p-3 space-y-3">
        <CopyRow label={t("oidcPublicUrlLabel")} value={origin} />
        <CopyRow label={t("oidcCallbackLabel")} value={callbackUrl} />
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("oidcCallbackHint")}</p>
      </div>

      {savedOrigin && savedOrigin !== origin && (
        <Warning>{t("oidcOriginChanged", { saved: savedOrigin })}</Warning>
      )}

      <div className="space-y-1">
        <label htmlFor="oidc-display-name" className={LABEL_CLASSES}>{t("oidcDisplayNameLabel")}</label>
        <input
          id="oidc-display-name"
          type="text"
          maxLength={40}
          autoComplete="off"
          placeholder={t("oidcDisplayNamePlaceholder")}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={busy}
          className={FIELD_INPUT_CLASSES}
        />
        <p className="text-xs text-gray-500">{t("oidcDisplayNameHint")}</p>
      </div>

      <div className="space-y-1">
        <label htmlFor="oidc-issuer" className={LABEL_CLASSES}>{t("oidcIssuerLabel")}</label>
        <input
          id="oidc-issuer"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://auth.example.com/application/o/glasskeep/"
          value={issuer}
          onChange={(e) => setIssuer(e.target.value)}
          disabled={busy}
          className={FIELD_INPUT_CLASSES}
        />
        <p className="text-xs text-gray-500">{t("oidcIssuerHint")}</p>
      </div>

      <div className="space-y-1">
        <label htmlFor="oidc-client-id" className={LABEL_CLASSES}>{t("oidcClientIdLabel")}</label>
        <input
          id="oidc-client-id"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          disabled={busy}
          className={FIELD_INPUT_CLASSES}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="oidc-client-secret" className={LABEL_CLASSES}>{t("oidcClientSecretLabel")}</label>
        <div className="flex gap-2">
          <input
            id="oidc-client-secret"
            type={showSecret ? "text" : "password"}
            autoComplete="new-password"
            spellCheck={false}
            placeholder={hasClientSecret ? t("oidcClientSecretPlaceholderSet") : ""}
            value={secretDraft}
            onChange={(e) => setSecretDraft(e.target.value)}
            disabled={busy}
            className={FIELD_INPUT_CLASSES}
          />
          {secretDraft.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="shrink-0 px-3 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
              aria-label={showSecret ? t("hide") : t("show")}
              data-tooltip={showSecret ? t("hide") : t("show")}
            >
              {showSecret ? <TI.EyeOff className="tabler-icon w-4 h-4" /> : <TI.Eye className="tabler-icon w-4 h-4" />}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500">{t("oidcClientSecretHint")}</p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{t("oidcAutoCreateLabel")}</div>
          <div className="text-sm text-gray-500">{t("oidcAutoCreateDesc")}</div>
        </div>
        <Switch
          on={autoCreateAccounts}
          disabled={busy}
          onClick={() => save({ autoCreateAccounts: !autoCreateAccounts })}
        />
      </div>

      <p className="text-xs text-gray-500">{t("oidcAdminRightsNote")}</p>

      {testResult && (
        <div
          className={`rounded-lg px-3 py-2 text-sm space-y-1 ${
            testResult.ok
              ? "bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
              : "bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
          }`}
        >
          {testResult.ok ? (
            <>
              <div className="font-medium">{t("oidcTestOk", { count: testResult.keyCount })}</div>
              <div className="text-xs break-all">{testResult.authorizationEndpoint}</div>
              {testResult.warnings?.map((w) => (
                <div key={w} className="text-xs text-amber-700 dark:text-amber-300">
                  {t(TEST_WARNING_KEYS[w] || w)}
                </div>
              ))}
              <div className="text-xs">{t("oidcTestCredentialsNote")}</div>
            </>
          ) : (
            <>
              <div className="font-medium">{oidcErrorMessage(testResult.error)}</div>
              {testResult.detail && <div className="text-xs break-all">{testResult.detail}</div>}
              {testResult.advertisedIssuer && (
                <div className="text-xs flex flex-wrap items-center gap-2">
                  <span className="break-all">
                    {t("oidcAdvertisedIssuer", { issuer: testResult.advertisedIssuer })}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setIssuer(testResult.advertisedIssuer); setTestResult(null); }}
                    className="font-semibold underline"
                  >
                    {t("oidcUseAdvertisedIssuer")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onTest}
          disabled={busy || testing || !canTest}
          className="px-4 py-2 rounded-lg font-semibold text-sm border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
        >
          {testing ? t("oidcTesting") : t("oidcTestButton")}
        </button>
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}
