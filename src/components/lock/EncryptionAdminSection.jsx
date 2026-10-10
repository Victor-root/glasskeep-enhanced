// src/components/lock/EncryptionAdminSection.jsx
// Admin Panel section for at-rest encryption.
//
// Three flows live here:
//   - Activation when encryption is OFF (passphrase + confirm + show
//     the freshly-generated recovery key once)
//   - Passphrase rotation when encryption is ON
//   - Recovery-key regeneration when encryption is ON
//
// V1 deliberately does NOT offer "disable encryption" — see the
// comment in the disabled state of the panel for the rationale.

import React, { useEffect, useState } from "react";
import { api } from "../../utils/api.js";
import { t } from "../../i18n";
import { localizeServerError } from "../../utils/serverErrors.js";
import EncryptionActivationForm from "./EncryptionActivationForm.jsx";
import EncryptionPassphraseForm from "./EncryptionPassphraseForm.jsx";
import EncryptionDeactivationForm from "./EncryptionDeactivationForm.jsx";
import EncryptionRecoveryRegenSection from "./EncryptionRecoveryRegenSection.jsx";
import { WIDE_SUBMIT_CLASSES } from "../common/fieldClasses.js";

export default function EncryptionAdminSection({ token, showToast }) {
  const [status, setStatus] = useState(null);
  // Only the activate form needs controlled state — the rest of the
  // sub-panels are uncontrolled <details> so the browser owns their
  // open/close lifecycle. Earlier we kept all of them controlled and
  // hit a React 19 crash where the synthetic onToggle event's
  // currentTarget had already been nullified by the time our state
  // setter ran, blanking the panel.
  const [activateOpen, setActivateOpen] = useState(false);

  const refresh = async () => {
    try {
      const s = await api("/instance/status");
      setStatus(s);
    } catch {
      // Network error — leave status null so we render a neutral state.
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- poll the instance status; state is set only after each request resolves
    refresh();
    const id = setInterval(refresh, 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const lockNow = async () => {
    try {
      await api("/instance/lock", { method: "POST", token });
      // The very next request to a non-allowlisted endpoint will return
      // 423 and our api wrapper will fire `instance-locked`, which the
      // useInstanceLockStatus hook (via useInstanceLock) listens to. The user
      // immediately drops to the unlock screen.
      window.dispatchEvent(new CustomEvent("instance-locked"));
    } catch (e) {
      showToast && showToast(localizeServerError(e?.message, "unlockFailed"), "error");
    }
  };

  // The parent (AdminPanel) renders the section title + leading icon
  // via SectionHeaderIcon, so we only emit the body here. Description,
  // threat-model recap and live status badge stay in this component
  // because they are tied to the data we fetch.
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t("encryptionSectionDescription")}
      </p>

      <div className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-md ${
        status?.enabled
          ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
          : "bg-gray-50 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300"
      }`}>
        <span className={`inline-block w-2 h-2 rounded-full ${
          status?.enabled ? "bg-green-500" : "bg-gray-400"
        }`} />
        <span>{status?.enabled ? t("encryptionStatusEnabled") : t("encryptionStatusDisabled")}</span>
      </div>

      {!status?.enabled && (
        <div className="space-y-2">
          {!activateOpen ? (
            <button
              type="button"
              onClick={() => setActivateOpen(true)}
              className={WIDE_SUBMIT_CLASSES}
            >
              {t("encryptionActivateCta")}
            </button>
          ) : (
            <EncryptionActivationForm
              onActivated={() => {
                setActivateOpen(false);
                refresh();
              }}
              showToast={showToast}
            />
          )}
        </div>
      )}

      {status?.enabled && (
        <div className="space-y-3">
          <details className="rounded-md border border-[var(--border-light)] p-3">
            <summary className="cursor-pointer text-sm font-medium">{t("encryptionRotatePassphraseCta")}</summary>
            <div className="mt-3">
              <EncryptionPassphraseForm token={token} showToast={showToast} />
            </div>
          </details>

          <details className="rounded-md border border-[var(--border-light)] p-3">
            <summary className="cursor-pointer text-sm font-medium">{t("encryptionRecoveryRegenCta")}</summary>
            <div className="mt-3">
              <EncryptionRecoveryRegenSection token={token} showToast={showToast} />
            </div>
          </details>

          <details className="rounded-md border border-[var(--border-light)] p-3">
            <summary className="cursor-pointer text-sm font-medium">{t("encryptionLockNowCta")}</summary>
            <div className="mt-3 space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t("encryptionLockNowExplain")}
              </p>
              <button
                type="button"
                onClick={lockNow}
                className="px-3 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
              >
                {t("encryptionLockNowCta")}
              </button>
            </div>
          </details>

          <details className="rounded-md border border-red-300 dark:border-red-800 p-3">
            <summary className="cursor-pointer text-sm font-medium text-red-700 dark:text-red-300">
              {t("encryptionDeactivateCta")}
            </summary>
            <div className="mt-3">
              <EncryptionDeactivationForm
                token={token}
                showToast={showToast}
                onDeactivated={refresh}
              />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
