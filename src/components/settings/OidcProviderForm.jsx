// src/components/settings/OidcProviderForm.jsx
//
// The form that declares an OpenID Connect provider, shared by the user
// settings (an account's own provider) and the admin panel (the
// instance's). The caller decides where it is saved and tested.
//
// GlassKeep's own address is never typed: it is the one this page is on,
// window.location.origin, like the federation pairing, and it is sent
// with every save so the redirect URI the server uses is the one shown
// here. The client secret is write-only.

import React, { useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { FIELD_INPUT_CLASSES } from "../common/fieldClasses.js";
import CopyButton from "../common/CopyButton.jsx";
import { oidcErrorMessage } from "../../auth/oidcClient.js";

const LABEL_CLASSES = "block text-xs font-semibold uppercase tracking-wide text-gray-500";
export const SECONDARY_BTN =
  "px-4 py-2 rounded-lg font-semibold text-sm border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50";
export const PRIMARY_BTN =
  "px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none";

const TEST_WARNING_KEYS = {
  issuer_not_https: "oidcTestWarnIssuerHttp",
  pkce_not_advertised: "oidcTestWarnPkce",
};

function CopyRow({ label, value }) {
  return (
    <div className="space-y-1">
      <div className={LABEL_CLASSES}>{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 text-xs font-mono text-gray-800 dark:text-gray-100 bg-white dark:bg-black/40 border border-[var(--border-light)] rounded-md px-2 py-1.5 break-all">
          {value}
        </code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

export function Warning({ children }) {
  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-900 dark:text-amber-100 flex items-start gap-2">
      <TI.AlertTriangle className="tabler-icon w-5 h-5 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function TestResult({ result, onUseIssuer }) {
  if (!result) return null;
  return (
    <div
      className={`rounded-lg px-3 py-2 text-sm space-y-1 ${
        result.ok
          ? "bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
          : "bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
      }`}
    >
      {result.ok ? (
        <>
          <div className="font-medium">{t("oidcTestOk", { count: result.keyCount })}</div>
          <div className="text-xs break-all">{result.authorizationEndpoint}</div>
          {result.warnings?.map((w) => (
            <div key={w} className="text-xs text-amber-700 dark:text-amber-300">
              {t(TEST_WARNING_KEYS[w] || w)}
            </div>
          ))}
          <div className="text-xs">{t("oidcTestCredentialsNote")}</div>
        </>
      ) : (
        <>
          <div className="font-medium">{oidcErrorMessage(result.error)}</div>
          {result.detail && <div className="text-xs break-all">{result.detail}</div>}
          {result.advertisedIssuer && (
            <div className="text-xs flex flex-wrap items-center gap-2">
              <span className="break-all">{t("oidcAdvertisedIssuer", { issuer: result.advertisedIssuer })}</span>
              <button type="button" onClick={() => onUseIssuer(result.advertisedIssuer)} className="font-semibold underline">
                {t("oidcUseAdvertisedIssuer")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// `provider` is what is saved (null for a new one). `onSave(body)` and
// `onTest(body)` reach the server; `onCancel`, when given, adds a Cancel
// button. `publicAddressHint` says the provider has to be public, and
// `relinkNoteKey` what changing the issuer or client does to linked
// accounts.
export default function OidcProviderForm({ provider, busy, onSave, onTest, onCancel, publicAddressHint, relinkNoteKey }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [displayName, setDisplayName] = useState(provider?.displayName || "");
  const [issuer, setIssuer] = useState(provider?.issuer || "");
  const [clientId, setClientId] = useState(provider?.clientId || "");
  const [secretDraft, setSecretDraft] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const origin = window.location.origin;
  const callbackUrl = `${origin}/api/auth/oidc/callback`;
  const isHttps = window.location.protocol === "https:";

  const submit = (e) => {
    e.preventDefault();
    const body = { displayName: displayName.trim(), issuer: issuer.trim(), clientId: clientId.trim(), publicOrigin: origin };
    if (secretDraft) body.clientSecret = secretDraft;
    onSave(body);
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await onTest({ issuer: issuer.trim(), clientId: clientId.trim() }));
    } catch (e) {
      setTestResult({ ok: false, error: e?.message, detail: null });
    } finally {
      setTesting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-gray-500">{t("oidcIntro")}</p>
      {!isHttps && <Warning>{t("oidcHttpWarning")}</Warning>}

      <div className="rounded-lg border border-[var(--border-light)] bg-gray-50 dark:bg-black/30 p-3 space-y-3">
        <CopyRow label={t("oidcPublicUrlLabel")} value={origin} />
        <CopyRow label={t("oidcCallbackLabel")} value={callbackUrl} />
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("oidcCallbackHint")}</p>
      </div>

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
        {publicAddressHint && <p className="text-xs text-gray-500">{t("oidcPublicAddressHint")}</p>}
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
            placeholder={provider ? t("oidcClientSecretPlaceholderSet") : ""}
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

      {provider && <p className="text-xs text-gray-500">{t(relinkNoteKey)}</p>}

      <TestResult result={testResult} onUseIssuer={(value) => { setIssuer(value); setTestResult(null); }} />

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={test} disabled={busy || testing || !issuer.trim() || !clientId.trim()} className={SECONDARY_BTN}>
          {testing ? t("oidcTesting") : t("oidcTestButton")}
        </button>
        <button type="submit" disabled={busy} className={PRIMARY_BTN}>
          {busy ? t("saving") : t("save")}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className={SECONDARY_BTN}>
            {t("cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
