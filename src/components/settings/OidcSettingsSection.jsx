// src/components/settings/OidcSettingsSection.jsx
//
// "Single sign-on" card of the user settings. The account links itself to
// the instance's provider, set up by an admin, or, when the admin allows
// personal providers, declares its own OpenID Connect provider (Authentik,
// Keycloak, Authelia, Pocket ID, …) and links to that. One link at most:
// linking replaces the previous one. From then on the login screen's
// "Sign in with my provider" opens this account.
//
// Renders nothing while the admin has not allowed single sign-on, unless
// the account still holds a configuration it may want to remove.

import React, { useCallback, useEffect, useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { RowIcon } from "../common/SettingsAccordion.jsx";
import OidcProviderForm, { PRIMARY_BTN, SECONDARY_BTN, Warning } from "./OidcProviderForm.jsx";
import { FIELD_INPUT_CLASSES } from "./fieldClasses.js";
import {
  deleteMyOidc,
  getMyOidc,
  oidcErrorMessage,
  saveMyOidc,
  startOidcLink,
  testMyOidc,
  unlinkMyOidc,
} from "../../auth/oidcClient.js";

const DANGER_LINK = "text-sm font-medium text-red-600 hover:underline disabled:opacity-50";

function formatDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

// One provider the account can be linked through: its name, whether this
// account is linked through it, and the way to link. `children` are the
// provider's other actions.
function ProviderStatus({ name, badge, identity, originWarning, canLink, replaces, busy, onLink, children }) {
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState("");

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2">
        <div className="text-sm font-medium flex items-center gap-1.5">
          {identity
            ? <TI.CircleCheck className="tabler-icon w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            : <TI.AlertTriangle className="tabler-icon w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />}
          <span className="truncate">{name}</span>
          {badge && <span className="shrink-0 text-[11px] font-normal text-gray-500">{badge}</span>}
        </div>
        <div className="text-xs text-gray-500 wrap-anywhere">
          {identity
            ? [identity.email, t("oidcLinkedOn", { date: formatDate(identity.linkedAt) })].filter(Boolean).join(" · ")
            : t("oidcNotLinkedYet")}
        </div>
      </div>
      {originWarning && <Warning>{originWarning}</Warning>}
      {asking && (
        <form onSubmit={(e) => { e.preventDefault(); onLink(password); }} className="space-y-2">
          <p className="text-xs text-gray-500">{t("oidcLinkPasswordHint")}</p>
          {replaces && <p className="text-xs text-gray-500">{t("oidcLinkReplaces", { provider: replaces })}</p>}
          <div className="flex gap-2">
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder={t("oidcLinkPasswordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              className={`${FIELD_INPUT_CLASSES} min-w-0`}
            />
            <button type="submit" disabled={busy || !password} className={`${PRIMARY_BTN} shrink-0`}>
              {t("oidcSignInContinue")}
            </button>
          </div>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        {canLink && !identity && !asking && (
          <button type="button" onClick={() => { setPassword(""); setAsking(true); }} disabled={busy} className={PRIMARY_BTN}>
            {t("oidcLinkAccount")}
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export default function OidcSettingsSection({ token, showToast, showGenericConfirm, visible = true }) {
  const [state, setState] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await getMyOidc(token));
    } catch (e) {
      console.warn("[oidc] settings load failed:", e?.message);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() fetches the settings and sets state only after the request resolves
    if (visible && token) load();
  }, [visible, token, load]);

  if (!state) return null;
  const { allowed, personalAllowed, privateNetworkAllowed, instance, provider, identity } = state;
  if (!allowed && !provider) return null;

  const origin = window.location.origin;
  const linkedName = identity?.via === "instance" ? instance?.displayName : provider?.displayName;

  // Runs one action, then shows what the server now holds.
  const run = async (action, successKey) => {
    setBusy(true);
    try {
      setState(await action());
      setEditing(false);
      if (successKey) showToast?.(t(successKey), "success");
    } catch (e) {
      showToast?.(oidcErrorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const link = (which) => async (password) => {
    setBusy(true);
    try {
      if (await startOidcLink(token, password, which)) setBusy(false);
    } catch (err) {
      showToast?.(oidcErrorMessage(err), "error");
      setBusy(false);
    }
  };

  const confirm = (titleKey, messageKey, confirmKey, name, action, successKey) => showGenericConfirm?.({
    title: t(titleKey),
    message: t(messageKey, { provider: name || "" }),
    confirmText: t(confirmKey),
    danger: true,
    onConfirm: () => run(action, successKey),
  });

  const unlinkButton = (
    <button
      type="button"
      disabled={busy}
      onClick={() => confirm("oidcUnlinkTitle", "oidcUnlinkConfirm", "oidcUnlink", linkedName, () => unlinkMyOidc(token), "oidcUnlinkedToast")}
      className={DANGER_LINK}
    >
      {t("oidcUnlink")}
    </button>
  );

  const showInstance = allowed && !!instance;
  const showForm = allowed && personalAllowed && (editing || (!provider && !instance));

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
      {allowed && !instance && !personalAllowed && <p className="text-sm text-gray-500">{t("oidcInstanceMissing")}</p>}

      <div className="space-y-4">
        {showInstance && (
          <ProviderStatus
            name={instance.displayName}
            badge={t("oidcInstanceBadge")}
            identity={identity?.via === "instance" ? identity : null}
            originWarning={instance.publicOrigin !== origin ? t("oidcInstanceOriginChanged", { saved: instance.publicOrigin }) : null}
            canLink
            replaces={identity ? linkedName : null}
            busy={busy}
            onLink={link("instance")}
          >
            {identity?.via === "instance" && unlinkButton}
          </ProviderStatus>
        )}

        {provider && !editing && (
          <>
            {allowed && !personalAllowed && <p className="text-sm text-gray-500">{t("oidcPersonalDisabled")}</p>}
            <ProviderStatus
              name={provider.displayName}
              badge={showInstance ? t("oidcPersonalBadge") : null}
              identity={identity?.via === "personal" ? identity : null}
              originWarning={provider.publicOrigin !== origin ? t("oidcOriginChanged", { saved: provider.publicOrigin }) : null}
              canLink={allowed && personalAllowed}
              replaces={identity ? linkedName : null}
              busy={busy}
              onLink={link("personal")}
            >
              {allowed && personalAllowed && (
                <button type="button" onClick={() => setEditing(true)} disabled={busy} className={SECONDARY_BTN}>
                  {t("oidcEditConfig")}
                </button>
              )}
              {identity?.via === "personal" && unlinkButton}
              <button
                type="button"
                disabled={busy}
                onClick={() => confirm("oidcDeleteTitle", "oidcDeleteConfirm", "oidcDelete", provider.displayName, () => deleteMyOidc(token), "oidcDeletedToast")}
                className={DANGER_LINK}
              >
                {t("oidcDelete")}
              </button>
            </ProviderStatus>
          </>
        )}

        {showInstance && personalAllowed && !provider && !editing && (
          <button type="button" onClick={() => setEditing(true)} disabled={busy} className={SECONDARY_BTN}>
            {t("oidcUseOwnProvider")}
          </button>
        )}

        {showForm && (
          <OidcProviderForm
            provider={provider}
            busy={busy}
            onSave={(body) => run(() => saveMyOidc(token, body), "oidcSaved")}
            onTest={(body) => testMyOidc(token, body)}
            onCancel={provider || instance ? () => setEditing(false) : null}
            publicAddressHint={!privateNetworkAllowed}
            relinkNoteKey="oidcRelinkNote"
          />
        )}
      </div>
    </div>
  );
}
