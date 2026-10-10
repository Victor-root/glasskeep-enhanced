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
  isPasskeyCancellation,
} from "../../auth/passkeyClient.js";
import { localizeServerError } from "../../utils/serverErrors.js";
import TI from "../../icons/editor/index.jsx";
import PasskeyListItem from "./PasskeyListItem.jsx";
import { PasskeyTextDialog, PasskeyConfirmDialog } from "./PasskeyDialogs.jsx";

export default function PasskeySettingsSection({
  token,
  isAdmin,
  encryptionEnabled,   // boolean — passed in from the parent settings panel
  instanceUnlocked,    // boolean — same
  showToast,
  isWebView,
  onOpenPasskeyDomainSetting,
  // Whether the settings panel is on screen. It is never unmounted, only
  // slid out of view, so without this the section would keep whatever it
  // read the first time: an admin who steps out to confirm the domain
  // and comes straight back would still be told to go and confirm it.
  visible = true,
}) {
  const [supported, setSupported] = useState(false);
  // Whether this instance can create a passkey at all: false while the
  // administrator has not declared the domain they belong to. Optimistic
  // until the list answers, so the button is never blocked on a slow or
  // failed fetch.
  const [domainReady, setDomainReady] = useState(true);
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
      const { passkeys, available } = await listPasskeys(token);
      setList(passkeys);
      setDomainReady(available);
    } catch (e) {
      console.warn("[passkeys] list failed:", e?.message || e);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- probe WebAuthn support once after mount
    setSupported(isWebAuthnSupported());
  }, []);

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh() fetches the list and sets state only after the request resolves
    refresh();
  }, [refresh, visible]);

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
          if (!isPasskeyCancellation(e)) {
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
      if (!isPasskeyCancellation(e)) {
        toast(localizeServerError(msg, "passkeyTestFailed"), "error");
      }
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleUnlock = async (p) => {
    // Disabling just drops the wrapped DEK — no passkey ceremony needed.
    if (p.canUnlockInstance) {
      setBusyId(p.credentialId);
      try {
        await disableInstanceUnlock(token, p.credentialId);
        toast(t("passkeyUnlockDisabled"), "success");
        await refresh();
      } catch (e) {
        toast(localizeServerError(e?.message || "", "passkeyToggleFailed"), "error");
      } finally {
        setBusyId(null);
      }
      return;
    }
    // Enabling REQUIRES authenticating with the passkey (PRF) so the DEK can
    // be wrapped under it — explain that up front so the WebAuthn prompt
    // that follows isn't a surprise.
    setConfirmPrompt({
      title: t("passkeyEnableUnlock"),
      message: t("passkeyEnableUnlockExplain"),
      confirmText: t("passkeyEnableUnlock"),
      onConfirm: async () => {
        setBusyId(p.credentialId);
        try {
          await enableInstanceUnlock(token, p.credentialId);
          toast(t("passkeyUnlockEnabled"), "success");
          await refresh();
        } catch (e) {
          const msg = (e && e.message) || "";
          if (!isPasskeyCancellation(e)) {
            toast(localizeServerError(msg, "passkeyToggleFailed"), "error");
          }
        } finally {
          setBusyId(null);
        }
      },
    });
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
        {/* Said before the button rather than after a failure: on this
            instance nobody can create a passkey until an administrator
            declares the domain, and that is not something a plain user
            can act on. Admins get the same notice pointing at the field
            they own. */}
        {!domainReady && (
          <div className="text-sm rounded-lg px-3 py-2 mb-3 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-300">
            <p>{isAdmin ? t("passkeyDomainNotSetAdmin") : t("passkeyDomainNotSetUser")}</p>
            {/* Only an admin has somewhere to be sent, and only when the
                parent wired the shortcut. */}
            {isAdmin && onOpenPasskeyDomainSetting && (
              <button
                type="button"
                onClick={onOpenPasskeyDomainSetting}
                className="mt-1 font-semibold underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-current rounded"
              >
                {t("passkeyDomainGoToSetting")}
              </button>
            )}
          </div>
        )}
        {/* Split-button: one visual surface, two independent click zones.
            The wide left zone runs the WebAuthn registration flow; the
            chevron zone on the right toggles the saved-keys list. A thin
            translucent divider keeps the visual unity. */}
        <div
          className={`inline-flex w-full sm:w-auto rounded-lg overflow-hidden text-white bg-gradient-to-r from-indigo-500 to-violet-600 shadow-md shadow-indigo-300/40 dark:shadow-none btn-gradient ${loading || !domainReady ? "opacity-50" : ""}`}
        >
          <button
            type="button"
            onClick={handleAdd}
            disabled={loading || !domainReady}
            className="flex-1 sm:flex-none min-w-0 px-4 py-2 text-sm font-semibold text-center hover:bg-white/10 active:bg-white/20 focus:outline-none focus-visible:bg-white/15 disabled:cursor-not-allowed transition-colors"
          >
            <span className="truncate">
              {loading ? t("passkeyAddInProgress") : t("passkeyAddCta")}
              {list.length > 0 && !loading ? ` (${list.length})` : ""}
            </span>
          </button>
          {list.length > 0 && (
            <>
              <div className="w-px bg-white/30 self-stretch" aria-hidden="true" />
              <button
                type="button"
                onClick={() => setListOpen((v) => !v)}
                aria-expanded={listOpen}
                aria-label={listOpen ? t("close") : t("show")}
                className="shrink-0 inline-flex items-center justify-center px-3 hover:bg-white/10 active:bg-white/20 focus:outline-none focus-visible:bg-white/15 transition-colors"
              >
                <TI.ChevronDown
                  className={`tabler-icon w-4 h-4 transition-transform duration-200 ${
                    listOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          {t("passkeyNoneYet")}
        </p>
      ) : (
        // Render the list only when expanded. We deliberately DON'T use the
        // grid-rows-[0fr/1fr] expand trick here: this section already sits
        // inside SettingsAccordion's own grid-rows-[1fr] animation, and two
        // nested `grid-template-rows: 1fr` containers can't both resolve to
        // content height — the inner one collapses and its rows paint on top
        // of each other (the overlap bug). A plain conditional render is
        // immune to that.
        <div hidden={!listOpen} aria-hidden={!listOpen} inert={!listOpen}>
        <ul className="space-y-2 pt-1">
          {list.map((p) => (
            <PasskeyListItem
              key={p.credentialId}
              p={p}
              isAdmin={isAdmin}
              encryptionEnabled={encryptionEnabled}
              unlockToggleAllowed={unlockToggleAllowed}
              busyId={busyId}
              testingId={testingId}
              onTest={handleTest}
              onRename={handleRename}
              onDelete={handleDelete}
              onToggleUnlock={handleToggleUnlock}
            />
          ))}
        </ul>
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
