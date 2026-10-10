import React, { useState } from "react";
import { api } from "../../utils/api.js";
import { t } from "../../i18n";
import { localizeServerError } from "../../utils/serverErrors.js";

// Turns encryption off, after the passphrase and an explicit acknowledgement.
export default function EncryptionDeactivationForm({ token, showToast, onDeactivated }) {
  const [passphrase, setPassphrase] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!ack) {
      setErr(t("encryptionDeactivateAckRequired"));
      return;
    }
    setBusy(true);
    try {
      await api("/instance/deactivate", {
        method: "POST",
        body: { passphrase },
        token,
      });
      setPassphrase("");
      setAck(false);
      showToast && showToast(t("encryptionDeactivateDone"), "success", undefined, "shield");
      onDeactivated && onDeactivated();
    } catch (e) {
      setErr(localizeServerError(e?.message, "unlockFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 text-xs text-red-900 dark:text-red-200">
        <p className="font-semibold mb-1">{t("encryptionDeactivateWarnTitle")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("encryptionDeactivateWarn1")}</li>
          <li>{t("encryptionDeactivateWarn2")}</li>
          <li>{t("encryptionDeactivateWarn3")}</li>
        </ul>
      </div>
      <input
        type="password"
        autoComplete="current-password"
        placeholder={t("encryptionCurrentPassphraseLabel")}
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        className="w-full px-3 py-2 rounded-md border border-[var(--border-light)] bg-white/70 dark:bg-gray-800/60"
        disabled={busy}
      />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
          disabled={busy}
          className="mt-1"
        />
        <span>{t("encryptionDeactivateAckLabel")}</span>
      </label>
      {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}
      <button
        type="submit"
        disabled={busy || !passphrase || !ack}
        className="px-3 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
      >
        {busy ? t("encryptionDeactivating") : t("encryptionDeactivateCta")}
      </button>
    </form>
  );
}
