import React, { useState } from "react";
import { api } from "../../utils/api.js";
import { t } from "../../i18n";
import { localizeServerError } from "../../utils/serverErrors.js";
import EncryptionRecoveryKeyBlock from "./EncryptionRecoveryKeyBlock.jsx";

// Turns encryption on: passphrase + confirmation, then the recovery key.
export default function EncryptionActivationForm({ onActivated, showToast }) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");

  if (recoveryKey) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-green-700 dark:text-green-300">
          {t("encryptionActivationDoneTitle")}
        </p>
        <EncryptionRecoveryKeyBlock
          value={recoveryKey}
          onAck={() => {
            setRecoveryKey("");
            onActivated && onActivated();
          }}
        />
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!passphrase || passphrase.length < 8) {
      setErr(t("encryptionPassphraseTooShort"));
      return;
    }
    if (passphrase !== confirm) {
      setErr(t("encryptionPassphraseMismatch"));
      return;
    }
    setBusy(true);
    try {
      const res = await api("/instance/activate", {
        method: "POST",
        body: { passphrase, confirmPassphrase: confirm },
        token: window.localStorage.getItem("glass-keep-auth")
          ? JSON.parse(window.localStorage.getItem("glass-keep-auth"))?.token
          : undefined,
      });
      if (res?.recoveryKey) setRecoveryKey(res.recoveryKey);
      setPassphrase("");
      setConfirm("");
    } catch (e) {
      const msg = localizeServerError(e?.message, "unlockErrorActivationFailed");
      setErr(msg);
      showToast && showToast(msg, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t("encryptionActivateExplain")}
      </p>
      <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-900 dark:text-amber-200">
        <p className="font-semibold mb-1">{t("encryptionScopeTitle")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("encryptionScopeProtects")}</li>
          <li>{t("encryptionScopeNotProtect")}</li>
          <li>{t("encryptionScopeWarn")}</li>
        </ul>
      </div>
      <input
        type="password"
        autoComplete="new-password"
        placeholder={t("encryptionPassphraseLabel")}
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        className="w-full px-3 py-2 rounded-md border border-[var(--border-light)] bg-white/70 dark:bg-gray-800/60"
        disabled={busy}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder={t("encryptionPassphraseConfirmLabel")}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="w-full px-3 py-2 rounded-md border border-[var(--border-light)] bg-white/70 dark:bg-gray-800/60"
        disabled={busy}
      />
      {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}
      <button
        type="submit"
        disabled={busy || !passphrase || !confirm}
        className="w-full px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none"
      >
        {busy ? t("encryptionActivating") : t("encryptionActivateCta")}
      </button>
    </form>
  );
}
