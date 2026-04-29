// src/components/settings/PasskeySettingsSection.jsx
//
// "Passkeys" section embedded inside the user settings panel. Lists the
// caller's existing credentials, lets them add / rename / delete, and
// — for admins on a PRF-capable, currently-unlocked instance — toggle
// each credential's "can unlock instance" flag.
//
// The instance-unlock toggle goes through a fresh WebAuthn ceremony
// (the user has to verify with the authenticator one more time) so
// the server can capture the PRF output and wrap the live DEK. That's
// also why the toggle is gated on `isUnlocked` — without an in-RAM
// DEK we'd have nothing to wrap.

import React, { useEffect, useState, useCallback, useRef } from "react";
import { t } from "../../i18n";
import {
  isWebAuthnSupported,
  listPasskeys,
  registerPasskey,
  renamePasskey,
  deletePasskey,
  enableInstanceUnlock,
  disableInstanceUnlock,
} from "../../auth/passkeyClient.js";
import { localizeServerError } from "../../utils/serverErrors.js";

function formatDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function PasskeySettingsSection({
  token,
  isAdmin,
  encryptionEnabled,   // boolean — passed in from the parent settings panel
  instanceUnlocked,    // boolean — same
  showToast,
}) {
  const [supported, setSupported] = useState(false);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null); // credentialId currently mutating

  // Hold showToast in a ref so it doesn't appear in any callback's
  // dependency list. The parent App.jsx defines showToast as an inline
  // arrow on every render, so a naive [showToast] dep would invalidate
  // every callback on every render — a previous version of this file
  // did exactly that and the user-facing symptom was a tight render
  // loop where /api/passkeys was hammered after login. The ref keeps
  // the callbacks stable while still letting handlers reach the live
  // toast emitter.
  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);
  const toast = useCallback((msg, type) => {
    if (showToastRef.current) showToastRef.current(msg, type);
  }, []);

  // refresh's only real input is `token`. Background fetch failures
  // do NOT toast — the user is already looking at the panel, so an
  // empty/stale list speaks for itself, and a failing toast in a
  // dependency loop was the original culprit. User-driven actions
  // (add/rename/delete/toggle) still toast on failure since the user
  // expects feedback there.
  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const items = await listPasskeys(token);
      setList(items);
    } catch (e) {
      console.warn("[passkeys] list failed:", e?.message || e);
    }
  }, [token]);

  useEffect(() => {
    setSupported(isWebAuthnSupported());
    refresh();
  }, [refresh]);

  const handleAdd = async () => {
    setLoading(true);
    try {
      const label = window.prompt(t("passkeyNamePrompt"), "");
      // Cancel button → bail; empty string still goes through (server
      // strips and stores null).
      if (label === null) return;
      const r = await registerPasskey(token, label || null);
      toast(t("passkeyAddedSuccess"), "success");
      if (!r.prfSupported) {
        // Tell the user explicitly so they don't expect the
        // instance-unlock toggle to light up.
        toast(t("passkeyNoPrfNotice"), "info");
      }
      await refresh();
    } catch (e) {
      const msg = (e && e.message) || "";
      const cancelled = /NotAllowedError|cancelled|aborted/i.test(msg);
      if (!cancelled) {
        toast(localizeServerError(msg, "passkeyAddFailed"), "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRename = async (p) => {
    const next = window.prompt(t("passkeyRenamePrompt"), p.name || "");
    if (next === null) return;
    const trimmed = (next || "").trim().slice(0, 64);
    if (!trimmed) return;
    setBusyId(p.credentialId);
    try {
      await renamePasskey(token, p.credentialId, trimmed);
      await refresh();
    } catch (e) {
      toast(localizeServerError(e.message, "passkeyRenameFailed"), "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (p) => {
    if (!window.confirm(t("passkeyDeleteConfirm"))) return;
    setBusyId(p.credentialId);
    try {
      await deletePasskey(token, p.credentialId);
      await refresh();
      toast(t("passkeyDeleted"), "success");
    } catch (e) {
      toast(localizeServerError(e.message, "passkeyDeleteFailed"), "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleUnlock = async (p) => {
    setBusyId(p.credentialId);
    try {
      if (p.canUnlockInstance) {
        await disableInstanceUnlock(token, p.credentialId);
        toast(t("passkeyUnlockDisabled"), "success");
      } else {
        await enableInstanceUnlock(token, p.credentialId);
        toast(t("passkeyUnlockEnabled"), "success");
      }
      await refresh();
    } catch (e) {
      const msg = (e && e.message) || "";
      const cancelled = /NotAllowedError|cancelled|aborted/i.test(msg);
      if (!cancelled) {
        toast(localizeServerError(msg, "passkeyToggleFailed"), "error");
      }
    } finally {
      setBusyId(null);
    }
  };

  if (!supported) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {t("passkeyBrowserUnsupported")}
      </div>
    );
  }

  // Instance-unlock UI is only meaningful for admins, when encryption
  // is on AND currently unlocked (so the server has a live DEK to
  // wrap). When those preconditions don't hold we still render the
  // toggle but disabled, with an explanatory caption per row.
  const unlockToggleAllowed = !!(isAdmin && encryptionEnabled && instanceUnlocked);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug max-w-prose">
          {t("passkeySectionExplain")}
        </p>
        <button
          type="button"
          onClick={handleAdd}
          disabled={loading}
          className="ml-3 shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 disabled:opacity-50 btn-gradient"
        >
          {loading ? t("passkeyAddInProgress") : t("passkeyAddCta")}
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          {t("passkeyNoneYet")}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((p) => (
            <li
              key={p.credentialId}
              className="rounded-lg border border-[var(--border-light)] p-3 flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">
                    {p.name || t("passkeyUnnamed")}
                  </span>
                  <Badge color="indigo">{t("passkeyBadgeLogin")}</Badge>
                  {p.canUnlockInstance && (
                    <Badge color="amber">{t("passkeyBadgeUnlock")}</Badge>
                  )}
                  {p.backedUp && (
                    <Badge color="gray">{t("passkeyBadgeSynced")}</Badge>
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {p.lastUsedAt
                    ? t("passkeyLastUsed").replace("%s", formatDate(p.lastUsedAt))
                    : t("passkeyNeverUsed")}
                </div>
                {!p.prfSupported && isAdmin && encryptionEnabled && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 italic">
                    {t("passkeyNoPrfRow")}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Instance-unlock toggle (admins, PRF-capable, unlocked vault) */}
                {isAdmin && encryptionEnabled && p.prfSupported && (
                  <button
                    type="button"
                    onClick={() => handleToggleUnlock(p)}
                    disabled={busyId === p.credentialId || !unlockToggleAllowed}
                    title={!unlockToggleAllowed ? t("passkeyUnlockToggleDisabledHint") : undefined}
                    className={`px-2.5 py-1 rounded text-xs font-medium border ${
                      p.canUnlockInstance
                        ? "border-amber-500 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                        : "border-[var(--border-light)] text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
                    } disabled:opacity-50`}
                  >
                    {p.canUnlockInstance ? t("passkeyDisableUnlock") : t("passkeyEnableUnlock")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleRename(p)}
                  disabled={busyId === p.credentialId}
                  className="px-2.5 py-1 rounded text-xs border border-[var(--border-light)] text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
                >{t("rename")}</button>
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  disabled={busyId === p.credentialId}
                  className="px-2.5 py-1 rounded text-xs border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
                >{t("delete")}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Badge({ color, children }) {
  const klass = {
    indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
    amber:  "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    gray:   "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  }[color] || "bg-gray-100 text-gray-700";
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${klass}`}>
      {children}
    </span>
  );
}
