// src/components/lock/InstanceUnlockScreen.jsx
// Full-screen unlock UI shown whenever the server reports
// { enabled: true, locked: true }. Reuses the AuthShell so the layout
// matches the login screen the rest of the app already ships.
//
// Honest scope, repeated in the UI: this screen protects DATA AT REST.
// It does not protect against a malicious admin or a server that is
// already unlocked and compromised.

import React, { useState } from "react";
import AuthShell from "../auth/AuthShell.jsx";
import { api } from "../../utils/api.js";
import { t } from "../../i18n";

export default function InstanceUnlockScreen({ dark, onToggleDark, onUnlocked }) {
  const [mode, setMode] = useState("passphrase"); // "passphrase" | "recovery"
  const [passphrase, setPassphrase] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      if (mode === "passphrase") {
        await api("/instance/unlock", { method: "POST", body: { passphrase } });
      } else {
        await api("/instance/unlock-recovery", { method: "POST", body: { recoveryKey } });
      }
      setPassphrase("");
      setRecoveryKey("");
      onUnlocked && onUnlocked();
    } catch (e) {
      setErr(e?.message || t("unlockFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t("instanceLockedTitle")}
      dark={dark}
      onToggleDark={onToggleDark}
      floatingCardsEnabled={true}
    >
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
        {t("instanceLockedExplain")}
      </p>

      <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-900 dark:text-amber-200 mb-4">
        <p className="font-semibold mb-1">{t("instanceLockedScopeTitle")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("instanceLockedScopeProtects")}</li>
          <li>{t("instanceLockedScopeNotProtect")}</li>
        </ul>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => { setMode("passphrase"); setErr(""); }}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "passphrase"
              ? "bg-indigo-500 text-white"
              : "bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-200 hover:bg-black/10 dark:hover:bg-white/15"
          }`}
        >{t("instanceLockedTabPassphrase")}</button>
        <button
          type="button"
          onClick={() => { setMode("recovery"); setErr(""); }}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "recovery"
              ? "bg-indigo-500 text-white"
              : "bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-200 hover:bg-black/10 dark:hover:bg-white/15"
          }`}
        >{t("instanceLockedTabRecovery")}</button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "passphrase" ? (
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder={t("instanceLockedPassphrasePlaceholder")}
            className="w-full px-4 py-3 rounded-lg border border-[var(--border-light)] bg-white/70 dark:bg-gray-800/60 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={loading}
          />
        ) : (
          <input
            type="text"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={recoveryKey}
            onChange={(e) => setRecoveryKey(e.target.value)}
            placeholder="GKRV-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            className="w-full px-4 py-3 rounded-lg border border-[var(--border-light)] bg-white/70 dark:bg-gray-800/60 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono tracking-wider"
            disabled={loading}
          />
        )}

        {err && (
          <div className="text-sm text-red-600 dark:text-red-400" role="alert">{err}</div>
        )}

        <button
          type="submit"
          disabled={loading || (mode === "passphrase" ? !passphrase : !recoveryKey)}
          className="w-full px-4 py-3 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 btn-gradient"
        >
          {loading ? t("instanceLockedUnlocking") : t("instanceLockedUnlockCta")}
        </button>
      </form>

      <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
        {t("instanceLockedCliHint")}
      </p>
    </AuthShell>
  );
}
