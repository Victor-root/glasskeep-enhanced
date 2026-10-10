// src/components/admin/SiteSettingsSection.jsx
//
// The "Site settings" block of the admin panel: account creation and
// single sign-on switches, the login slogan, the passkey domain and the
// login page branding.

import React, { useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import OidcAdminSection from "./OidcAdminSection.jsx";
import LoginBrandingSection from "../panels/LoginBrandingSection.jsx";
import { localizeServerError } from "../../utils/serverErrors.js";
import { RowIcon, SettingsSection } from "../common/SettingsAccordion.jsx";

// Inline editor for the public login slogan. Keeps a draft state local
// to the input so we can show an explicit Save button (instead of the
// silent on-blur save the previous version had: users couldn't tell
// whether their change had been persisted).
function LoginSloganRow({ value, onSave, showToast }) {
  const [draft, setDraft] = useState(value || "");
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Sync the draft when the persisted value changes (e.g. another tab
  // saved a different slogan). We only overwrite the draft if the user
  // has no pending change to avoid clobbering their typing.
  React.useEffect(() => {
    // Keep the draft in sync when the panel re-opens with fresh data,
    // but don't clobber typing in progress.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resync the editable draft with the persisted value
    setDraft((prev) => (prev === (value || "") ? prev : (value || "")));
  }, [value]);

  const dirty = (draft || "") !== (value || "");

  const save = async () => {
    if (!dirty) return;
    setBusy(true);
    try {
      await onSave(draft || "");
      setSavedFlash(true);
      showToast?.(t("saved"), "success");
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      showToast?.(localizeServerError(e?.message, "saveFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 px-3">
      <div className="flex items-center gap-3 min-w-0">
        <RowIcon icon={TI.Quote} />
        <div className="min-w-0">
          <div className="font-medium">{t("loginSloganLabel")}</div>
          <div className="text-sm text-gray-500">{t("loginSlogan")}</div>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          maxLength={200}
          className="flex-1 px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--gk-chrome-accent)] placeholder-gray-500 dark:placeholder-gray-400 text-sm"
          placeholder={t("loginSloganPlaceholder")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          disabled={busy}
        />
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className="shrink-0 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none disabled:hover:scale-100"
        >
          {busy ? t("saving") : savedFlash ? t("saved") : t("save")}
        </button>
      </div>
    </div>
  );
}

// The domain passkeys belong to. Behind a reverse proxy the server has
// no honest way to learn it: the only place it appears is a header the
// caller wrote, so an admin states it once here. Every other case
// (local network, a certificate, an env var) resolves on its own and
// this row just says so instead of asking for anything.
function PasskeyDomainRow({ state, onSave, showToast, highlight, onHighlightDone }) {
  const declared = state?.declared || "";
  const suggested = state?.suggested || "";
  const source = state?.source || "none";
  const undecided = source === "none";
  const readOnly = state?.lockedByEnv || source === "certificate";

  const [draft, setDraft] = useState(declared || (undecided ? suggested : ""));
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  React.useEffect(() => {
    const wanted = declared || (undecided ? suggested : "");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resync the editable draft with the server state
    setDraft((prev) => (prev === wanted ? prev : wanted));
  }, [declared, suggested, undecided]);

  // Arriving here from the passkey notice in the user settings: the
  // section it lives in is long, so bring the row into view and let it
  // pulse. The flag is cleared once, so re-opening the panel by hand
  // afterwards does not replay it.
  const ligne = React.useRef(null);
  // The parent passes a fresh arrow on every render, so it is held in a
  // ref rather than depended on: as a dependency it would restart the
  // timer on each render and the flag would never clear.
  const finRef = React.useRef(onHighlightDone);
  React.useEffect(() => { finRef.current = onHighlightDone; }, [onHighlightDone]);
  React.useEffect(() => {
    if (!highlight) return;
    ligne.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const fin = setTimeout(() => finRef.current?.(), 3600);
    return () => clearTimeout(fin);
  }, [highlight]);

  const dirty = draft.trim().toLowerCase() !== declared;

  const save = async () => {
    if (!dirty) return;
    setBusy(true);
    try {
      // updateAdminSettings reports its own failures and resolves with
      // nothing, so a refused domain must not flash "saved".
      const stored = await onSave(draft.trim().toLowerCase());
      if (!stored) return;
      setSavedFlash(true);
      showToast?.(t("saved"), "success");
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      showToast?.(localizeServerError(e?.message, "saveFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  // Where the domain in force comes from. Nothing to say while none is
  // settled: the description already asks for the confirmation, and a
  // second block saying the same thing was just noise.
  const etat = {
    configured: t("passkeyDomainFromEnv"),
    admin: t("passkeyDomainFromPanel"),
    certificate: t("passkeyDomainFromCertificate"),
    "local-request": t("passkeyDomainFromLocal"),
  }[source];

  return (
    <div
      ref={ligne}
      className={`flex flex-col gap-2 px-3 py-2 ${highlight ? "gk-attention" : ""}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <RowIcon icon={TI.Key} />
        <div className="min-w-0">
          <div className="font-medium">{t("passkeyDomainLabel")}</div>
          <div className="text-sm text-gray-500">{t("passkeyDomainDesc")}</div>
        </div>
      </div>

      <div className="text-sm rounded-lg px-3 py-2 text-gray-500" hidden={!etat}>
        {etat}
        {state?.effective ? <> <code className="font-mono">{state.effective}</code></> : null}
      </div>

      {!readOnly && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            maxLength={253}
            className="flex-1 px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--gk-chrome-accent)] placeholder-gray-500 dark:placeholder-gray-400 text-sm font-mono"
            placeholder={suggested || t("passkeyDomainPlaceholder")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
            disabled={busy}
          />
          <button
            type="button"
            onClick={save}
            disabled={!dirty || busy}
            className="shrink-0 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:pointer-events-none disabled:hover:scale-100"
          >
            {/* Nothing declared yet means the field is showing a
                suggestion, not a stored value: the admin is confirming
                what is already in front of them, not saving an edit. */}
            {busy ? t("saving") : savedFlash ? t("saved")
              : undecided ? t("passkeyDomainConfirmCta") : t("save")}
          </button>
        </div>
      )}

      {!readOnly && declared && (
        <div className="text-xs text-gray-500">{t("passkeyDomainChangeWarning")}</div>
      )}
    </div>
  );
}

export default function SiteSettingsSection({
  open,
  onToggle,
  dark,
  adminSettings,
  updateAdminSettings,
  authToken,
  showToast,
  showGenericConfirm,
  highlightPasskeyDomain,
  onPasskeyDomainHighlighted,
}) {
  return (
    <div className="mb-2">
      <SettingsSection
        icon={TI.HomeLock}
        title={t("siteSettings")}
        open={open}
        onToggle={onToggle}
      >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 px-3">
          <div className="flex items-center gap-3 min-w-0">
            <RowIcon icon={TI.UserPlus} />
            <div className="min-w-0">
              <div className="font-medium">{t("allowNewAccountCreation")}</div>
              <div className="text-sm text-gray-500">{t("allowNewAccountCreationDesc")}</div>
            </div>
          </div>
          <button
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              adminSettings.allowNewAccounts
                ? "bg-[var(--gk-switch-on)]"
                : "bg-gray-300 dark:bg-gray-600"
            }`}
            onClick={() =>
              updateAdminSettings({
                allowNewAccounts: !adminSettings.allowNewAccounts,
              })
            }
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                adminSettings.allowNewAccounts ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Single sign-on: once allowed, the policy, the local
            network option and the instance's provider. */}
        <div className="flex items-center justify-between gap-3 px-3">
          <div className="flex items-center gap-3 min-w-0">
            <RowIcon icon={TI.UserCircle} />
            <div className="min-w-0">
              <div className="font-medium">{t("allowSso")}</div>
              <div className="text-sm text-gray-500">{t("allowSsoDesc")}</div>
            </div>
          </div>
          <button
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              adminSettings.ssoAllowed
                ? "bg-[var(--gk-switch-on)]"
                : "bg-gray-300 dark:bg-gray-600"
            }`}
            onClick={() =>
              updateAdminSettings({
                ssoAllowed: !adminSettings.ssoAllowed,
              })
            }
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                adminSettings.ssoAllowed ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        {adminSettings.ssoAllowed && (
          <OidcAdminSection
            token={authToken}
            adminSettings={adminSettings}
            updateAdminSettings={updateAdminSettings}
            showToast={showToast}
            showGenericConfirm={showGenericConfirm}
          />
        )}

        <LoginSloganRow
          value={adminSettings.loginSlogan}
          onSave={(slogan) => updateAdminSettings({ loginSlogan: slogan })}
          showToast={showToast}
        />

        <PasskeyDomainRow
          state={adminSettings.passkeyDomainState}
          onSave={(domain) => updateAdminSettings({ passkeyDomain: domain })}
          showToast={showToast}
          highlight={highlightPasskeyDomain}
          onHighlightDone={onPasskeyDomainHighlighted}
        />

        {/* Branding (custom app name, logo, login background +
            blur), separated from the toggle/slogan rows by a
            hairline so the section reads as two logical groups. */}
        <div className="pt-2 border-t border-[var(--border-light)]">
          <LoginBrandingSection
            dark={dark}
            adminSettings={adminSettings}
            updateAdminSettings={updateAdminSettings}
            showToast={showToast}
          />
        </div>
      </div>
      </SettingsSection>
    </div>
  );
}
