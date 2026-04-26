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

function RecoveryKeyBlock({ value, onAck }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard API (rare): fall back to a manual select. The
      // value is also visible on screen so the user can copy by hand.
    }
  };

  return (
    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 p-4 space-y-3">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
        {t("encryptionRecoveryKeyLabel")}
      </p>
      <div className="font-mono text-base tracking-wider bg-white dark:bg-gray-900 px-3 py-2 rounded border border-amber-300 dark:border-amber-700 select-all break-all">
        {value}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="px-3 py-1.5 text-xs rounded-md bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 hover:bg-amber-300 dark:hover:bg-amber-700"
        >
          {copied ? t("encryptionRecoveryKeyCopied") : t("encryptionRecoveryKeyCopy")}
        </button>
        {onAck && (
          <button
            type="button"
            onClick={onAck}
            className="px-3 py-1.5 text-xs rounded-md bg-amber-600 text-white hover:bg-amber-700"
          >
            {t("encryptionRecoveryKeyAck")}
          </button>
        )}
      </div>
    </div>
  );
}

function ActivationForm({ onActivated, showToast }) {
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
        <RecoveryKeyBlock
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
      setErr(e?.message || "Activation failed");
      showToast && showToast(e?.message || "Activation failed", "error");
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
        className="w-full px-3 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? t("encryptionActivating") : t("encryptionActivateCta")}
      </button>
    </form>
  );
}

function RotatePassphraseForm({ token, showToast }) {
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
      showToast && showToast(t("saved"), "success");
      setTimeout(() => setDone(false), 2500);
    } catch (e) {
      setErr(e?.message || "Failed");
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
        className="w-full px-3 py-2 rounded-md border border-[var(--border-light)] bg-white/70 dark:bg-gray-800/60"
        disabled={busy}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder={t("encryptionNewPassphraseLabel")}
        value={next}
        onChange={(e) => setNext(e.target.value)}
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

function RegenerateRecoverySection({ token, showToast }) {
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState("");

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api("/instance/recovery/regenerate", { method: "POST", token });
      if (res?.recoveryKey) setNewKey(res.recoveryKey);
    } catch (e) {
      showToast && showToast(e?.message || "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  if (newKey) {
    return (
      <div className="space-y-2">
        <RecoveryKeyBlock value={newKey} onAck={() => setNewKey("")} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t("encryptionRecoveryRegenExplain")}
      </p>
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="px-3 py-2 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {t("encryptionRecoveryRegenCta")}
      </button>
    </div>
  );
}

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
    refresh();
    const id = setInterval(refresh, 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const lockNow = async () => {
    try {
      await api("/instance/lock", { method: "POST", token });
      // The very next request to a non-allowlisted endpoint will return
      // 423 and our api wrapper will fire `instance-locked`, which the
      // useInstanceLockStatus hook in App.jsx listens to. The user
      // immediately drops to the unlock screen.
      window.dispatchEvent(new CustomEvent("instance-locked"));
    } catch (e) {
      showToast && showToast(e?.message || "Failed to lock", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-base font-semibold mb-1">{t("encryptionSectionTitle")}</h4>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t("encryptionSectionDescription")}
        </p>
      </div>

      <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-900 dark:text-amber-200">
        <p className="font-semibold mb-1">{t("encryptionScopeTitle")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("encryptionScopeProtects")}</li>
          <li>{t("encryptionScopeNotProtect")}</li>
          <li>{t("encryptionScopeWarn")}</li>
        </ul>
      </div>

      <div className="text-sm">
        <span className={status?.enabled
          ? "text-green-700 dark:text-green-300 font-medium"
          : "text-gray-600 dark:text-gray-300"}
        >
          {status?.enabled ? t("encryptionStatusEnabled") : t("encryptionStatusDisabled")}
        </span>
      </div>

      {!status?.enabled && (
        <div className="space-y-2">
          {!activateOpen ? (
            <button
              type="button"
              onClick={() => setActivateOpen(true)}
              className="px-3 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {t("encryptionActivateCta")}
            </button>
          ) : (
            <ActivationForm
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
              <RotatePassphraseForm token={token} showToast={showToast} />
            </div>
          </details>

          <details className="rounded-md border border-[var(--border-light)] p-3">
            <summary className="cursor-pointer text-sm font-medium">{t("encryptionRecoveryRegenCta")}</summary>
            <div className="mt-3">
              <RegenerateRecoverySection token={token} showToast={showToast} />
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

          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
            {t("encryptionDisableNotSupportedV1")}
          </p>
        </div>
      )}
    </div>
  );
}
