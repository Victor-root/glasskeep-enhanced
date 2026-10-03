// src/components/settings/OidcSettingsSection.jsx
//
// "Single sign-on" card of the user settings. The user declares their
// own OpenID Connect provider (Authentik, Keycloak, Authelia, …) and links
// their account to it by signing in there once; from then on the login
// screen's "Sign in with my provider" opens this account.
//
// GlassKeep's own address is never typed: it is the one this page is on,
// window.location.origin, like the federation pairing, and it is sent
// with every save so the redirect URI the server uses is the one shown
// here. The client secret is write-only.
//
// Renders nothing while the admin has not allowed single sign-on, unless
// the account still holds a configuration it may want to remove.

import React, { useCallback, useEffect, useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { RowIcon } from "../common/SettingsAccordion.jsx";
import CopyButton from "../common/CopyButton.jsx";
import {
  deleteMyOidc,
  getMyOidc,
  oidcErrorMessage,
  saveMyOidc,
  startOidcLink,
  testMyOidc,
  unlinkMyOidc,
} from "../../auth/oidcClient.js";

const FIELD_INPUT_CLASSES =
  "w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--gk-chrome-accent)] placeholder-gray-500 dark:placeholder-gray-400 text-sm";
const LABEL_CLASSES = "block text-xs font-semibold uppercase tracking-wide text-gray-500";
const SECONDARY_BTN =
  "px-4 py-2 rounded-lg font-semibold text-sm border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50";
const PRIMARY_BTN =
  "px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none";

const TEST_WARNING_KEYS = {
  issuer_not_https: "oidcTestWarnIssuerHttp",
  pkce_not_advertised: "oidcTestWarnPkce",
};

function formatDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
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

export default function OidcSettingsSection({ token, isAdmin, showToast, showGenericConfirm, visible = true }) {
  const [state, setState] = useState({ allowed: false, provider: null, identity: null });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [clientId, setClientId] = useState("");
  const [secretDraft, setSecretDraft] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkPassword, setLinkPassword] = useState("");

  const origin = window.location.origin;
  const callbackUrl = `${origin}/api/auth/oidc/callback`;
  const isHttps = window.location.protocol === "https:";

  const apply = useCallback((data) => {
    setState({ allowed: !!data?.allowed, provider: data?.provider || null, identity: data?.identity || null });
    setDisplayName(data?.provider?.displayName || "");
    setIssuer(data?.provider?.issuer || "");
    setClientId(data?.provider?.clientId || "");
    setSecretDraft("");
    setTestResult(null);
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await getMyOidc(token));
    } catch (e) {
      console.warn("[oidc] settings load failed:", e?.message);
    }
  }, [token, apply]);

  useEffect(() => {
    if (visible && token) load();
  }, [visible, token, load]);

  const { allowed, provider, identity } = state;
  if (!allowed && !provider) return null;

  // Runs one action, then shows what the server now holds.
  const run = async (action, successKey) => {
    setBusy(true);
    try {
      const data = await action();
      apply({ allowed, ...data });
      setEditing(false);
      if (successKey) showToast?.(t(successKey), "success");
    } catch (e) {
      showToast?.(oidcErrorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const onSave = (e) => {
    e.preventDefault();
    const body = { displayName: displayName.trim(), issuer: issuer.trim(), clientId: clientId.trim(), publicOrigin: origin };
    if (secretDraft) body.clientSecret = secretDraft;
    run(() => saveMyOidc(token, body), "oidcSaved");
  };

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testMyOidc(token, { issuer: issuer.trim(), clientId: clientId.trim() }));
    } catch (e) {
      setTestResult({ ok: false, error: e?.message, detail: null });
    } finally {
      setTesting(false);
    }
  };

  const onLink = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await startOidcLink(token, linkPassword);
    } catch (err) {
      showToast?.(oidcErrorMessage(err), "error");
      setBusy(false);
    }
  };

  const confirm = (titleKey, messageKey, confirmKey, action, successKey) => showGenericConfirm?.({
    title: t(titleKey),
    message: t(messageKey, { provider: provider?.displayName || "" }),
    confirmText: t(confirmKey),
    danger: true,
    onConfirm: () => run(action, successKey),
  });

  const showForm = allowed && (!provider || editing);

  return (
    <div className="mt-3 px-3 py-3 border border-[var(--border-light)] rounded-lg">
      <div className="flex items-center gap-3 mb-3">
        <RowIcon icon={TI.UserCircle} />
        <div className="min-w-0">
          <div className="font-medium">{t("oidcSettingsTitle")}</div>
          <div className="text-sm text-gray-500">{t("oidcSettingsSubtitle")}</div>
        </div>
      </div>

      {!allowed && <p className="text-sm text-gray-500 mb-3">{t("oidcDisabledByAdmin")}</p>}

      {provider && !editing && (
        <div className="space-y-3">
          <div className="rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2">
            <div className="text-sm font-medium flex items-center gap-1.5">
              {identity
                ? <TI.CircleCheck className="tabler-icon w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                : <TI.AlertTriangle className="tabler-icon w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />}
              <span className="truncate">{provider.displayName}</span>
            </div>
            <div className="text-xs text-gray-500 break-all">
              {identity
                ? [identity.email, t("oidcLinkedOn", { date: formatDate(identity.linkedAt) })].filter(Boolean).join(" · ")
                : t("oidcNotLinkedYet")}
            </div>
          </div>
          {provider.publicOrigin !== origin && (
            <Warning>{t("oidcOriginChanged", { saved: provider.publicOrigin })}</Warning>
          )}
          {linking && (
            <form onSubmit={onLink} className="space-y-2">
              <p className="text-xs text-gray-500">{t("oidcLinkPasswordHint")}</p>
              <div className="flex gap-2">
                <input
                  type="password"
                  autoFocus
                  autoComplete="current-password"
                  placeholder={t("oidcLinkPasswordPlaceholder")}
                  value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  disabled={busy}
                  className={`${FIELD_INPUT_CLASSES} min-w-0`}
                />
                <button type="submit" disabled={busy || !linkPassword} className={`${PRIMARY_BTN} shrink-0`}>
                  {t("oidcSignInContinue")}
                </button>
              </div>
            </form>
          )}
          <div className="flex flex-wrap gap-2">
            {allowed && !identity && !linking && (
              <button type="button" onClick={() => { setLinkPassword(""); setLinking(true); }} disabled={busy} className={PRIMARY_BTN}>
                {t("oidcLinkAccount")}
              </button>
            )}
            {allowed && (
              <button type="button" onClick={() => setEditing(true)} disabled={busy} className={SECONDARY_BTN}>
                {t("oidcEditConfig")}
              </button>
            )}
            {identity && (
              <button
                type="button"
                disabled={busy}
                onClick={() => confirm("oidcUnlinkTitle", "oidcUnlinkConfirm", "oidcUnlink", () => unlinkMyOidc(token), "oidcUnlinkedToast")}
                className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                {t("oidcUnlink")}
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => confirm("oidcDeleteTitle", "oidcDeleteConfirm", "oidcDelete", () => deleteMyOidc(token), "oidcDeletedToast")}
              className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
            >
              {t("oidcDelete")}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={onSave} className="space-y-4">
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
            {!isAdmin && <p className="text-xs text-gray-500">{t("oidcPublicAddressHint")}</p>}
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

          {provider && <p className="text-xs text-gray-500">{t("oidcRelinkNote")}</p>}

          <TestResult result={testResult} onUseIssuer={(value) => { setIssuer(value); setTestResult(null); }} />

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onTest} disabled={busy || testing || !issuer.trim() || !clientId.trim()} className={SECONDARY_BTN}>
              {testing ? t("oidcTesting") : t("oidcTestButton")}
            </button>
            <button type="submit" disabled={busy} className={PRIMARY_BTN}>
              {busy ? t("saving") : t("save")}
            </button>
            {provider && (
              <button type="button" onClick={() => { apply(state); setEditing(false); }} disabled={busy} className={SECONDARY_BTN}>
                {t("cancel")}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
