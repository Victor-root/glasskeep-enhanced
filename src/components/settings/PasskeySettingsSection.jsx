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
  hasAndroidPasskeyBridge,
  listPasskeys,
  registerPasskey,
  renamePasskey,
  deletePasskey,
  enableInstanceUnlock,
  disableInstanceUnlock,
  testPasskey,
} from "../../auth/passkeyClient.js";
import { localizeServerError } from "../../utils/serverErrors.js";
import TI from "../../icons/editor/index.jsx";

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
  isWebView,
}) {
  const [supported, setSupported] = useState(false);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);    // credentialId currently mutating (rename/delete/toggle)
  const [testingId, setTestingId] = useState(null); // credentialId currently being tested
  // Saved-keys list collapses behind a chevron next to the "Add" button so
  // the section stays compact when the user just wants to register a new
  // credential. Auto-expands after a successful add so the new entry is
  // visible without an extra click.
  const [listOpen, setListOpen] = useState(false);

  // Styled prompt + confirm dialogs (replacing window.prompt / .confirm).
  // Native browser dialogs render as the OS chrome inside the Android
  // WebView — "La page indique :" with no theming — which both looks
  // out of place and leaks the fact that the app is a webview. Local
  // state-driven dialogs keep the UI consistent with the rest of the
  // settings panel.
  //
  // Shape: null when closed, otherwise an options object whose `onSubmit`
  // / `onConfirm` callback receives the user's input. Single-source-of-
  // truth state — opening a new dialog while another is showing simply
  // replaces it (we never need overlapping prompts on this screen).
  const [textPrompt, setTextPrompt] = useState(null);
  const [confirmPrompt, setConfirmPrompt] = useState(null);

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
  const toast = useCallback((msg, type, duration) => {
    if (showToastRef.current) showToastRef.current(msg, type, duration);
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

  const handleAdd = () => {
    setTextPrompt({
      title: t("passkeyAddCta"),
      message: t("passkeyNamePrompt"),
      placeholder: t("passkeyNamePlaceholder"),
      defaultValue: "",
      confirmText: t("passkeyAddCta"),
      onSubmit: async (label) => {
        setLoading(true);
        try {
          // Empty string still goes through (server strips and stores
          // null). Trim the user's input to avoid surprise whitespace
          // labels.
          const cleaned = (label || "").trim();
          const r = await registerPasskey(token, cleaned || null);
          toast(t("passkeyAddedSuccess"), "success");
          if (!r.prfSupported) {
            // Tell the user explicitly so they don't expect the
            // instance-unlock toggle to light up. Long-form notice → 10s
            // so it can actually be read.
            toast(t("passkeyNoPrfNotice"), "info", 10000);
          }
          await refresh();
          setListOpen(true);
        } catch (e) {
          const msg = (e && e.message) || "";
          const cancelled = e?.name === "NotAllowedError" || /not[\s_-]*allowed|cancel|abort|interrupt|annul/i.test(msg);
          if (!cancelled) {
            toast(localizeServerError(msg, "passkeyAddFailed"), "error");
          }
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleRename = (p) => {
    setTextPrompt({
      title: t("rename"),
      message: t("passkeyRenamePrompt"),
      placeholder: t("passkeyNamePlaceholder"),
      defaultValue: p.name || "",
      confirmText: t("rename"),
      onSubmit: async (next) => {
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
      },
    });
  };

  const handleDelete = (p) => {
    setConfirmPrompt({
      title: t("passkeyDeleteTitle"),
      message: t("passkeyDeleteConfirm"),
      confirmText: t("delete"),
      danger: true,
      onConfirm: async () => {
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
      },
    });
  };

  const handleTest = async (p) => {
    setTestingId(p.credentialId);
    try {
      await testPasskey(token, p.credentialId);
      toast(t("passkeyTestOk"), "success");
    } catch (e) {
      const msg = (e && e.message) || "";
      const cancelled = e?.name === "NotAllowedError" || /not[\s_-]*allowed|cancel|abort|interrupt|annul/i.test(msg);
      if (!cancelled) {
        toast(localizeServerError(msg, "passkeyTestFailed"), "error");
      }
    } finally {
      setTestingId(null);
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
      const cancelled = e?.name === "NotAllowedError" || /not[\s_-]*allowed|cancel|abort|interrupt|annul/i.test(msg);
      if (!cancelled) {
        toast(localizeServerError(msg, "passkeyToggleFailed"), "error");
      }
    } finally {
      setBusyId(null);
    }
  };

  // Inside the Android app we route passkeys through Credential Manager
  // via the WebAuthnBridge polyfill. Older APKs (≤ 1.2.0) ship without
  // the bridge — surface a clear "update the app" notice instead of
  // letting the user run a ceremony the WebView would silently fail.
  if (isWebView && !hasAndroidPasskeyBridge()) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {t("passkeyWebViewUpdateApp")}
      </div>
    );
  }

  // Browsers (and the in-bridge WebView) still need a secure origin —
  // Credential Manager itself enforces this server-side via the Digital
  // Asset Links check, but a clearer message up front saves a confusing
  // round trip through the OS picker.
  if (!isWebView && !window.isSecureContext) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {t("passkeyHttpsRequired")}
      </div>
    );
  }

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
      {/* Description + Add CTA — stacked rather than side-by-side. On
          mobile the previous row layout (text on the left, button on
          the right with shrink-0) squeezed the description into a
          column maybe 18ch wide, which makes the section feel much
          smaller than its neighbours. Stacking gives the description
          the full container width and lets the button stretch across
          the row on phones (clear tap target), while desktops keep an
          inline-sized button. */}
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-snug mb-3">
          {t("passkeySectionExplain")}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleAdd}
            disabled={loading}
            className="flex-1 sm:flex-none min-w-0 sm:w-auto px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 disabled:opacity-50 btn-gradient"
          >
            <span className="truncate">
              {loading ? t("passkeyAddInProgress") : t("passkeyAddCta")}
              {list.length > 0 && !loading ? ` (${list.length})` : ""}
            </span>
          </button>
          {list.length > 0 && (
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              aria-expanded={listOpen}
              aria-label={listOpen ? t("close") : t("show")}
              className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[var(--border-light)] hover:bg-[#c1cfff66] dark:hover:bg-indigo-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 transition-colors"
            >
              <TI.ChevronDown
                className={`tabler-icon w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
                  listOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          {t("passkeyNoneYet")}
        </p>
      ) : (
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
            listOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
          aria-hidden={!listOpen}
          inert={!listOpen}
        >
        <div className="overflow-hidden">
        <ul className="space-y-2 pt-1">
          {list.map((p) => (
            <li
              key={p.credentialId}
              // md:+ flips to a row so the action buttons fill the
              // empty band on the right; mobile stays stacked because
              // the action row otherwise wraps awkwardly.
              className="rounded-lg border border-[var(--border-light)] p-3 flex flex-col gap-3 md:flex-row md:items-center md:gap-4"
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

              <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:shrink-0 md:justify-end">
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
                  onClick={() => handleTest(p)}
                  disabled={busyId === p.credentialId || testingId === p.credentialId}
                  className="px-2.5 py-1 rounded text-xs border border-[var(--border-light)] text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
                >
                  {testingId === p.credentialId ? t("passkeyTestInProgress") : t("passkeyTestCta")}
                </button>
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
        </div>
        </div>
      )}

      <PasskeyTextDialog
        prompt={textPrompt}
        onClose={() => setTextPrompt(null)}
      />
      <PasskeyConfirmDialog
        prompt={confirmPrompt}
        onClose={() => setConfirmPrompt(null)}
      />
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

// Styled in-app text prompt. Replaces `window.prompt(...)` for passkey
// naming so the WebView doesn't render the bare "La page <url> indique:"
// system dialog. Keeps focus on the input, submits on Enter, cancels on
// Escape — matches the editor / settings dialogs people already know.
function PasskeyTextDialog({ prompt, onClose }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  // Re-seed the field every time a fresh prompt opens. We keep the
  // input controlled (rather than reading from a ref on submit) so the
  // confirm button can be disabled while empty without a re-render
  // dance.
  useEffect(() => {
    if (prompt) {
      setValue(prompt.defaultValue || "");
      // The focus has to happen *after* the input mounts. A microtask
      // tick is enough — requestAnimationFrame would also work but
      // delays focus by a paint cycle on slow devices.
      queueMicrotask(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          el.select();
        }
      });
    }
  }, [prompt]);

  if (!prompt) return null;

  const submit = () => {
    onClose();
    if (prompt.onSubmit) prompt.onSubmit(value);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="rounded-xl shadow-2xl w-[90%] max-w-sm p-6 relative bg-white dark:bg-[#282828] border border-[var(--border-light)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-2">{prompt.title}</h3>
        {prompt.message && (
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            {prompt.message}
          </p>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={64}
          placeholder={prompt.placeholder || ""}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submit(); }
            else if (e.key === "Escape") { e.preventDefault(); onClose(); }
          }}
          className="w-full px-3 py-2 rounded-lg border border-[var(--border-light)] bg-white dark:bg-[#1f1f1f] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg font-semibold transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] btn-gradient bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none"
            onClick={submit}
          >
            {prompt.confirmText || t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Styled in-app confirmation dialog. Used for "delete this passkey?"
// in place of `window.confirm()` — same reasons as PasskeyTextDialog:
// the system dialog leaks the WebView URL and ignores the app theme.
function PasskeyConfirmDialog({ prompt, onClose }) {
  if (!prompt) return null;

  const confirmClass = prompt.danger
    ? "bg-red-600 text-white hover:bg-red-700 shadow-md shadow-red-300/40 dark:shadow-none"
    : "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="rounded-xl shadow-2xl w-[90%] max-w-sm p-6 relative bg-white dark:bg-[#282828] border border-[var(--border-light)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-2">{prompt.title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">{prompt.message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] btn-gradient ${confirmClass}`}
            onClick={() => {
              onClose();
              if (prompt.onConfirm) prompt.onConfirm();
            }}
          >
            {prompt.confirmText || t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
