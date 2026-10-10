import React from "react";
import { t } from "../../i18n";
import { api } from "../../utils/api.js";
import { localizeServerError } from "../../utils/serverErrors.js";
import TI from "../../icons/editor/index.jsx";
import { RowIcon } from "../common/SettingsAccordion.jsx";
import PasskeySettingsSection from "./PasskeySettingsSection.jsx";
import OidcSettingsSection from "./OidcSettingsSection.jsx";

// Security section of the Settings panel: login visibility, password
// change, cross-device QR sign-in, passkeys and single sign-on.
// profileShowOnLogin is owned by SettingsPanel, which loads it with the
// rest of the profile when the panel opens.
export default function SecuritySettingsSection({
  dark,
  token,
  currentUser,
  encryptionEnabled,
  instanceUnlocked,
  showToast,
  showGenericConfirm,
  isWebView,
  visible,
  onClose,
  onChangePassword,
  onOpenPasskeyDomainSetting,
  openQrScanner,
  qrQuickEnabled,
  setQrQuickEnabled,
  profileShowOnLogin,
  setProfileShowOnLogin,
}) {
  const handleShowOnLoginToggle = async () => {
    const newVal = !profileShowOnLogin;
    setProfileShowOnLogin(newVal);
    try {
      await api("/user/profile", { method: "PATCH", body: { show_on_login: newVal }, token });
    } catch (err) {
      setProfileShowOnLogin(!newVal); // revert
      showToast(localizeServerError(err.message, "updateFailed"), "error");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-3">
        <div className="flex items-center gap-3 min-w-0">
          <RowIcon icon={TI.Eye} />
          <div className="min-w-0">
            <div className="font-medium">{t("showOnLogin")}</div>
          </div>
        </div>
        <button
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full self-end sm:self-auto transition-colors ${
            profileShowOnLogin ? "bg-[var(--gk-switch-on)]" : "bg-gray-300 dark:bg-gray-600"
          }`}
          onClick={handleShowOnLoginToggle}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              profileShowOnLogin ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      <button
        className={`mt-3 flex items-center gap-3 w-full text-left px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
        onClick={() => {
          onClose();
          onChangePassword?.();
        }}
      >
        <RowIcon icon={TI.Key} />
        <div className="min-w-0">
          <div className="font-medium">{t("changePassword")}</div>
          <div className="text-sm text-gray-500">{t("changePasswordDesc")}</div>
        </div>
      </button>

      {/* Cross-device QR sign-in. Whole card is the primary
          action (tap → opens the scanner). The Show/Hide
          segmented control sits INSIDE the same clickable
          surface (HTML disallows nested <button>s, so the
          outer container is a div with role=button and the
          inner buttons stopPropagation on their clicks); the
          user wanted both options to feel like one tightly-
          related feature, not two separate settings stacked. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => openQrScanner?.()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openQrScanner?.();
          }
        }}
        className={`mt-5 cursor-pointer w-full flex items-start gap-3 px-3 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--gk-chrome-accent)]`}
      >
        <RowIcon icon={TI.Qrcode} />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{t("qrSignInRowTitle")}</div>
          <div className="text-sm text-gray-500">{t("qrSignInRowSubtitle")}</div>
          <div
            className="mt-3 flex items-center justify-between flex-wrap gap-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {t("qrSignInQuickToggleLabel")}
            </div>
            <div className="inline-flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
              <button
                type="button"
                onClick={() => setQrQuickEnabled?.(true)}
                className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
                  qrQuickEnabled
                    ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                    : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                {t("qrSignInQuickShow")}
              </button>
              <button
                type="button"
                onClick={() => setQrQuickEnabled?.(false)}
                className={`px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
                  !qrQuickEnabled
                    ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                    : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                {t("qrSignInQuickHide")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Passkeys / WebAuthn: register, rename, delete, and (for
          admins on a PRF-capable, unlocked instance) promote a
          credential to "can unlock the instance". The section
          handles its own list-fetching + ceremonies; we just
          hand it the token and the encryption status. */}
      <div className="mt-3 px-3 py-3 border border-[var(--border-light)] rounded-lg">
        <div className="flex items-center gap-3 mb-3">
          <RowIcon icon={TI.Key} />
          <div className="min-w-0">
            <div className="font-medium">{t("passkeysSectionTitle")}</div>
            <div className="text-sm text-gray-500">{t("passkeysSectionSubtitle")}</div>
          </div>
        </div>
        <PasskeySettingsSection
          token={token}
          isAdmin={!!currentUser?.is_admin}
          encryptionEnabled={!!encryptionEnabled}
          instanceUnlocked={!!instanceUnlocked}
          showToast={showToast}
          isWebView={!!isWebView}
          onOpenPasskeyDomainSetting={onOpenPasskeyDomainSetting}
          visible={visible}
        />
      </div>

      {/* Single sign-on: the instance's OpenID Connect provider or
          the user's own. Hidden while the admin has not allowed it. */}
      <OidcSettingsSection
        token={token}
        showToast={showToast}
        showGenericConfirm={showGenericConfirm}
        visible={visible}
      />
    </div>
  );
}
