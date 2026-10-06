// src/components/admin/OidcAdminSection.jsx
//
// Single sign-on, admin side, shown under the "Allow single sign-on"
// switch: which providers count (the instance's only, or each user's own
// as well), whether a user's own provider may sit on the local network,
// and the instance's provider itself. Each user then links their account
// from their own settings.

import React, { useCallback, useEffect, useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { RowIcon } from "../common/SettingsAccordion.jsx";
import OidcProviderForm, { SECONDARY_BTN } from "../settings/OidcProviderForm.jsx";
import {
  deleteInstanceOidc,
  getInstanceOidc,
  oidcErrorMessage,
  saveInstanceOidc,
  testInstanceOidc,
} from "../../auth/oidcClient.js";

const POLICIES = [
  { id: "admin", titleKey: "ssoPolicyAdmin", descKey: "ssoPolicyAdminDesc" },
  { id: "personal", titleKey: "ssoPolicyPersonal", descKey: "ssoPolicyPersonalDesc" },
];

export default function OidcAdminSection({ token, adminSettings, updateAdminSettings, showToast, showGenericConfirm }) {
  const [view, setView] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await getInstanceOidc(token));
    } catch (e) {
      console.warn("[oidc] instance provider load failed:", e?.message);
    }
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const run = async (action, successKey) => {
    setBusy(true);
    try {
      setView(await action());
      setEditing(false);
      showToast?.(t(successKey), "success");
    } catch (e) {
      showToast?.(oidcErrorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const provider = view?.provider;
  const personal = adminSettings.ssoPolicy === "personal";

  return (
    <div className="space-y-4 px-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label={t("ssoPolicy")}>
        {POLICIES.map((policy) => {
          const isSel = policy.id === adminSettings.ssoPolicy;
          return (
            <button
              key={policy.id}
              type="button"
              role="radio"
              aria-checked={isSel}
              onClick={() => !isSel && updateAdminSettings({ ssoPolicy: policy.id })}
              className={`rounded-xl border px-3 py-2 text-left transition-all active:scale-[0.99] ${
                isSel
                  ? "border-[var(--gk-chrome-accent)] ring-2 ring-[var(--gk-chrome-accent)]"
                  : "border-[var(--border-light)] hover:border-[var(--gk-accent-soft-border)]"
              }`}
            >
              <span className="flex items-center justify-between gap-1">
                <span className="text-sm font-medium">{t(policy.titleKey)}</span>
                {isSel && <TI.Check className="tabler-icon w-4 h-4 shrink-0 text-[var(--gk-chrome-accent)]" />}
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">{t(policy.descKey)}</span>
            </button>
          );
        })}
      </div>

      {personal && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <RowIcon icon={TI.Server} />
            <div className="min-w-0">
              <div className="font-medium">{t("ssoAllowPrivateNetwork")}</div>
              <div className="text-sm text-gray-500">{t("ssoAllowPrivateNetworkDesc")}</div>
            </div>
          </div>
          <button
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              adminSettings.ssoAllowPrivateNetwork
                ? "bg-[var(--gk-switch-on)]"
                : "bg-gray-300 dark:bg-gray-600"
            }`}
            onClick={() =>
              updateAdminSettings({
                ssoAllowPrivateNetwork: !adminSettings.ssoAllowPrivateNetwork,
              })
            }
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                adminSettings.ssoAllowPrivateNetwork ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      )}

      <div className="rounded-lg border border-[var(--border-light)] px-3 py-3 space-y-3">
        <div>
          <div className="font-medium">{t("ssoInstanceProvider")}</div>
          <div className="text-sm text-gray-500">{t("ssoInstanceProviderDesc")}</div>
        </div>

        {view && provider && !editing && (
          <div className="space-y-3">
            <div className="rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2">
              <div className="text-sm font-medium truncate">{provider.displayName}</div>
              <div className="text-xs text-gray-500 break-all">{provider.issuer}</div>
              <div className="text-xs text-gray-500">{t("ssoInstanceLinkedAccounts", { count: view.linkedAccounts })}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setEditing(true)} disabled={busy} className={SECONDARY_BTN}>
                {t("oidcEditConfig")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => showGenericConfirm?.({
                  title: t("ssoInstanceDeleteTitle"),
                  message: t("ssoInstanceDeleteConfirm", { provider: provider.displayName }),
                  confirmText: t("oidcDelete"),
                  danger: true,
                  onConfirm: () => run(() => deleteInstanceOidc(token), "oidcDeletedToast"),
                })}
                className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                {t("oidcDelete")}
              </button>
            </div>
          </div>
        )}

        {view && (!provider || editing) && (
          <OidcProviderForm
            provider={provider}
            busy={busy}
            onSave={(body) => run(() => saveInstanceOidc(token, body), "oidcSaved")}
            onTest={(body) => testInstanceOidc(token, body)}
            onCancel={provider ? () => setEditing(false) : null}
            relinkNoteKey="ssoInstanceRelinkNote"
          />
        )}
      </div>
    </div>
  );
}
