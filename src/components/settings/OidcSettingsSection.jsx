// src/components/settings/OidcSettingsSection.jsx
//
// "Single sign-on" card of the user settings. Lists the provider
// identities linked to the account and lets the user link the instance's
// provider to it, which is how an existing account starts signing in
// through the provider: the server never joins them on a matching email.
//
// Renders nothing while the instance has no provider and the account no
// identity, so the settings stay as they were for everyone else.

import React, { useCallback, useEffect, useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { RowIcon } from "../common/SettingsAccordion.jsx";
import {
  isOnProviderOrigin,
  listOidcIdentities,
  oidcErrorMessage,
  startOidcLink,
  unlinkOidcIdentity,
} from "../../auth/oidcClient.js";

function formatDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function OidcSettingsSection({ token, showToast, showGenericConfirm, visible = true }) {
  const [data, setData] = useState({ identities: [], providers: [], hasPassword: true });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await listOidcIdentities(token));
    } catch (e) {
      console.warn("[oidc] identities load failed:", e?.message);
    }
  }, [token]);

  useEffect(() => {
    if (visible && token) load();
  }, [visible, token, load]);

  const { identities, providers, hasPassword } = data;
  if (!identities.length && !providers.length) return null;

  const linkedProviderIds = new Set(identities.map((i) => i.providerId));
  const linkable = providers.filter((p) => !linkedProviderIds.has(p.id));

  const onLink = async (provider) => {
    if (!isOnProviderOrigin(provider)) {
      showToast?.(t("oidcWrongOrigin", { origin: provider.origin }), "error");
      return;
    }
    setBusy(true);
    try {
      await startOidcLink(token, provider.id);
    } catch (e) {
      showToast?.(oidcErrorMessage(e), "error");
      setBusy(false);
    }
  };

  const onUnlink = (identity) => {
    const provider = identity.providerName || t("oidcRemovedProvider");
    showGenericConfirm?.({
      title: t("oidcUnlinkTitle"),
      message: t("oidcUnlinkConfirm", { provider }),
      confirmText: t("oidcUnlink"),
      danger: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          await unlinkOidcIdentity(token, identity.id);
          showToast?.(t("oidcUnlinkedToast", { provider }), "success");
          await load();
        } catch (e) {
          showToast?.(oidcErrorMessage(e), "error");
        } finally {
          setBusy(false);
        }
      },
    });
  };

  return (
    <div className="mt-3 px-3 py-3 border border-[var(--border-light)] rounded-lg">
      <div className="flex items-center gap-3 mb-3">
        <RowIcon icon={TI.UserCircle} />
        <div className="min-w-0">
          <div className="font-medium">{t("oidcSettingsTitle")}</div>
          <div className="text-sm text-gray-500">{t("oidcSettingsSubtitle")}</div>
        </div>
      </div>

      <div className="space-y-2">
        {identities.map((identity) => (
          <div
            key={identity.id}
            className="flex items-center justify-between gap-3 rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium flex items-center gap-1.5">
                <TI.CircleCheck className="tabler-icon w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate">{identity.providerName || t("oidcRemovedProvider")}</span>
              </div>
              <div className="text-xs text-gray-500 truncate">
                {[identity.email, t("oidcLinkedOn", { date: formatDate(identity.linkedAt) })]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            {hasPassword && (
              <button
                type="button"
                onClick={() => onUnlink(identity)}
                disabled={busy}
                className="shrink-0 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                {t("oidcUnlink")}
              </button>
            )}
          </div>
        ))}

        {!hasPassword && identities.length > 0 && (
          <p className="text-xs text-gray-500">{t("oidcNoPasswordHint")}</p>
        )}

        {linkable.map((provider) => (
          <button
            key={provider.id}
            type="button"
            onClick={() => onLink(provider)}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-light)] text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-60"
          >
            <TI.Link className="tabler-icon w-4 h-4" />
            {t("oidcLinkWith", { provider: provider.name })}
          </button>
        ))}
      </div>
    </div>
  );
}
