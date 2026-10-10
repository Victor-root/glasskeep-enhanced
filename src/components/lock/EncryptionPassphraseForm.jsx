import React, { useState } from "react";
import { api } from "../../utils/api.js";
import { t } from "../../i18n";
import { localizeServerError } from "../../utils/serverErrors.js";
import { PASSPHRASE_INPUT_CLASSES } from "../common/fieldClasses.js";

// Changes the encryption passphrase.
export default function EncryptionPassphraseForm({ token, showToast }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!next || next.length < 8) {
      setErr(t("encryptionPassphraseTooShort"));
      return;
    }
    if (next !== confirm) {
      setErr(t("encryptionPassphraseMismatch"));
      return;
    }
    setBusy(true);
    try {
      await api("/instance/passphrase", {
        method: "POST",
        body: { currentPassphrase: current, newPassphrase: next, confirmPassphrase: confirm },
        token,
      });
      setCurrent(""); setNext(""); setConfirm("");
      setDone(true);
      showToast && showToast(t("saved"), "success", undefined, "save");
      setTimeout(() => setDone(false), 2500);
    } catch (e) {
      setErr(localizeServerError(e?.message, "unlockFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        type="password"
        autoComplete="current-password"
        placeholder={t("encryptionCurrentPassphraseLabel")}
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        className={PASSPHRASE_INPUT_CLASSES}
        disabled={busy}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder={t("encryptionNewPassphraseLabel")}
        value={next}
        onChange={(e) => setNext(e.target.value)}
        className={PASSPHRASE_INPUT_CLASSES}
        disabled={busy}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder={t("encryptionPassphraseConfirmLabel")}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className={PASSPHRASE_INPUT_CLASSES}
        disabled={busy}
      />
      {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}
      {done && <div className="text-sm text-green-600 dark:text-green-400">{t("saved")}</div>}
      <button
        type="submit"
        disabled={busy || !current || !next}
        className="px-3 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {t("encryptionRotatePassphraseCta")}
      </button>
    </form>
  );
}
