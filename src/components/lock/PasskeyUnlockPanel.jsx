// src/components/lock/PasskeyUnlockPanel.jsx
//
// Third unlock method on InstanceUnlockScreen. Drives the WebAuthn +
// PRF ceremony via passkeyClient.unlockInstanceWithPasskey() and, on
// success, hands the freshly-issued admin JWT + user record back to
// the parent so App.jsx can install the session in the same path
// password login uses.
//
// Why a separate component:
//  - keeps InstanceUnlockScreen.jsx free of WebAuthn imports so the
//    bundle still tree-shakes when the user picks a different tab
//  - parks the "PRF not available" copy in one place
//  - lets us iterate on the passkey UX without touching the existing
//    passphrase / recovery-key forms

import React, { useEffect, useState } from "react";
import { t } from "../../i18n";
import {
  isWebAuthnSupported,
  unlockInstanceWithPasskey,
} from "../../auth/passkeyClient.js";
import { localizeServerError } from "../../utils/serverErrors.js";

export default function PasskeyUnlockPanel({ onUnlocked }) {
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setSupported(isWebAuthnSupported());
  }, []);

  const handleClick = async () => {
    setErr("");
    setLoading(true);
    try {
      const session = await unlockInstanceWithPasskey();
      if (session?.alreadyUnlocked) {
        onUnlocked?.({ alreadyUnlocked: true });
        return;
      }
      if (session?.token && session?.user) {
        // Hand the admin session back. App.jsx installs the JWT,
        // marks the instance unlocked, and falls through to /notes
        // without the user ever typing a passphrase.
        onUnlocked?.(session);
      } else {
        setErr(localizeServerError("Verification failed", "unlockFailed"));
      }
    } catch (e) {
      const msg = (e && e.message) || "unlockFailed";
      const isCancelled = e?.name === "NotAllowedError" || /NotAllowedError|cancelled|aborted/i.test(msg);
      setErr(isCancelled ? t("passkeyUnlockCancelled") : localizeServerError(msg, "unlockFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (!supported) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t("passkeyUnlockBrowserUnsupported")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t("passkeyUnlockExplain")}
      </p>

      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="w-full px-4 py-3 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 btn-gradient"
      >
        {loading ? t("passkeyUnlockInProgress") : t("passkeyUnlockCta")}
      </button>

      {err && (
        <div className="text-sm text-red-600 dark:text-red-400" role="alert">{err}</div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        {t("passkeyUnlockFallbackHint")}
      </p>
    </div>
  );
}
