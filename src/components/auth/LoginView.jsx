import React, { useState, useEffect } from "react";
import { t } from "../../i18n";
import AuthShell from "./AuthShell.jsx";
import UserAvatar from "../common/UserAvatar.jsx";
import { localizeServerError, localizeSecretRejection } from "../../utils/serverErrors.js";
import PasskeyLoginButton from "./PasskeyLoginButton.jsx";
import QrLoginButton from "./QrLoginButton.jsx";
import QrLoginPanel from "./QrLoginPanel.jsx";
import OidcLoginButton from "./OidcLoginButton.jsx";
import { fetchOidcAvailable, oidcErrorMessage } from "../../auth/oidcClient.js";
import { AUTH_INPUT_CLASSES, WIDE_SUBMIT_CLASSES } from "../common/fieldClasses.js";

export default function LoginView({
  dark,
  onToggleDark,
  onLogin,
  onLoginById,
  goRegister,
  goSecret,
  allowRegistration,
  floatingCardsEnabled,
  loginSlogan,
  loginProfiles,
  onPasskeyLogin,
  oidcError,
}) {
  const [mode, setMode] = useState("profiles"); // "profiles" | "password" | "manual"
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  // QR sign-in open/closed state. Held at the LoginView level so the
  // matching panel can be rendered through AuthShell's `sidePanel`
  // prop (the QR card needs to slot next to the auth card, which is
  // a layout concern only AuthShell can answer). Survives mode
  // switches because the user can flip between profiles / manual
  // login without losing the QR they had open.
  const [qrOpen, setQrOpen] = useState(false);
  const qrSidePanel = qrOpen ? (
    <QrLoginPanel
      dark={dark}
      onLoggedIn={(session) => {
        setQrOpen(false);
        onPasskeyLogin?.(session);
      }}
      onCancel={() => setQrOpen(false)}
    />
  ) : null;

  // Single sign-on with the provider an account declared in its settings,
  // offered once the admin allows it and some account has linked one. A
  // failure reported by the provider's redirect arrives through
  // `oidcError`, possibly after this screen mounted.
  const [oidcAvailable, setOidcAvailable] = useState(false);
  const [oidcErr, setOidcErr] = useState("");
  useEffect(() => {
    fetchOidcAvailable().then(setOidcAvailable).catch(() => setOidcAvailable(false));
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show a provider error that arrives after mount; the user can clear it locally
    if (oidcError) setOidcErr(oidcErrorMessage(oidcError));
  }, [oidcError]);
  const oidcButton = (oidcAvailable || oidcErr) && (
    <OidcLoginButton
      userId={mode === "password" ? selectedProfile?.id : undefined}
      defaultEmail={email}
      error={oidcErr}
      onError={setOidcErr}
    />
  );

  // If no visible profiles, show manual login directly
  const hasProfiles = loginProfiles && loginProfiles.length > 0;

  const loginErrorMessage = (er) => {
    if (er?.status === 401) return localizeSecretRejection(er, "errInvalidCredentials", "loginFailed");
    if (er && (er.status || er.isNetworkError) && er.message) {
      return localizeServerError(er.message, "loginUnexpectedError");
    }
    return t("loginUnexpectedError");
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const res = await onLogin(email.trim(), pw);
      if (!res.ok) setErr(localizeServerError(res.error, "loginFailed"));
    } catch (er) {
      setErr(loginErrorMessage(er));
    }
  };

  const handleProfileLogin = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const res = await onLoginById(selectedProfile.id, pw);
      if (!res.ok) setErr(localizeServerError(res.error, "loginFailed"));
    } catch (er) {
      setErr(loginErrorMessage(er));
    }
  };

  // Profile selection screen (Jellyfin-style)
  if (hasProfiles && mode === "profiles") {
    return (
      <AuthShell
        title={t("selectProfile")}
        dark={dark}
        onToggleDark={onToggleDark}
        floatingCardsEnabled={floatingCardsEnabled}
        loginSlogan={loginSlogan}
        sidePanel={qrSidePanel}
      >
        <div className="flex flex-wrap justify-center gap-5 mb-4">
          {loginProfiles.map((profile) => (
            <button
              key={profile.id}
              onClick={() => {
                setSelectedProfile(profile);
                setPw("");
                setErr("");
                setMode("password");
              }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/10 hover:scale-105 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 min-w-[90px]"
            >
              <UserAvatar
                name={profile.name}
                avatarUrl={profile.avatar_url}
                size="w-16 h-16"
                textSize="text-2xl"
                dark={dark}
              />
              <span className={`text-sm font-medium truncate max-w-[100px] ${dark ? "text-gray-200" : "text-gray-700"}`}>
                {profile.name}
              </span>
            </button>
          ))}
        </div>
        {/* Passkey + QR shortcuts visible from the profile picker too —
            both flows are profile-agnostic (the passkey ceremony lets
            the OS pick which credential to use; the QR flow just opens
            a side panel) so hiding them behind "Manual login" was an
            unnecessary extra click. */}
        <PasskeyLoginButton onLoggedIn={onPasskeyLogin} />
        {oidcButton}
        <QrLoginButton open={qrOpen} onToggle={setQrOpen} />
        <div className="mt-4 text-center">
          <button
            className="text-sm text-indigo-600 hover:underline"
            onClick={() => { setMode("manual"); setErr(""); setPw(""); setEmail(""); }}
          >{t("manualLogin")}</button>
        </div>
      </AuthShell>
    );
  }

  // Password entry for selected profile
  if (mode === "password" && selectedProfile) {
    return (
      <AuthShell
        dark={dark}
        onToggleDark={onToggleDark}
        floatingCardsEnabled={floatingCardsEnabled}
        loginSlogan={loginSlogan}
        sidePanel={qrSidePanel}
      >
        <div className="flex flex-col items-center mb-4">
          <UserAvatar
            name={selectedProfile.name}
            avatarUrl={selectedProfile.avatar_url}
            size="w-20 h-20"
            textSize="text-3xl"
            dark={dark}
          />
          <h2 className={`mt-3 text-lg font-semibold ${dark ? "text-gray-100" : "text-gray-800"}`}>
            {selectedProfile.name}
          </h2>
        </div>
        <form onSubmit={handleProfileLogin} className="space-y-4">
          <input
            type="password"
            autoFocus
            className={AUTH_INPUT_CLASSES}
            placeholder={t("enterPassword")}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
          />
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button
            type="submit"
            className={WIDE_SUBMIT_CLASSES}
          >{t("signIn")}</button>
        </form>
        <PasskeyLoginButton onLoggedIn={onPasskeyLogin} />
        {oidcButton}
        <QrLoginButton open={qrOpen} onToggle={setQrOpen} />
        <div className="mt-4 text-sm text-center flex justify-center gap-4">
          {hasProfiles && (
            <button
              className="text-indigo-600 hover:underline"
              onClick={() => { setMode("profiles"); setErr(""); setPw(""); }}
            >{t("backToProfiles")}</button>
          )}
          <button
            className="text-indigo-600 hover:underline"
            onClick={() => { setMode("manual"); setErr(""); setPw(""); setEmail(""); }}
          >{t("otherAccount")}</button>
        </div>
      </AuthShell>
    );
  }

  // Manual login (classic form)
  return (
    <AuthShell
      data-tooltip={t("signInToYourAccount")}
      dark={dark}
      onToggleDark={onToggleDark}
      floatingCardsEnabled={floatingCardsEnabled}
      loginSlogan={loginSlogan}
      sidePanel={qrSidePanel}
    >
      <form onSubmit={handleManualSubmit} className="space-y-4">
        <input
          type="text"
          autoComplete="username"
          className={AUTH_INPUT_CLASSES}
          placeholder={t("username")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className={AUTH_INPUT_CLASSES}
          placeholder={t("password")}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
        />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button
          type="submit"
          className={WIDE_SUBMIT_CLASSES}
        >{t("signIn")}</button>
      </form>

      <PasskeyLoginButton onLoggedIn={onPasskeyLogin} />
      {oidcButton}
      <QrLoginButton open={qrOpen} onToggle={setQrOpen} />

      <div className="mt-4 text-sm flex justify-between items-center">
        {hasProfiles && (
          <button
            className="text-indigo-600 hover:underline"
            onClick={() => { setMode("profiles"); setErr(""); setPw(""); }}
          >{t("backToProfiles")}</button>
        )}
        {allowRegistration && (
          <button
            className="text-indigo-600 hover:underline"
            onClick={goRegister}
          >{t("createAccount")}</button>
        )}
        <button className="text-indigo-600 hover:underline" onClick={goSecret}>{t("forgotUsernamePassword")}</button>
      </div>
    </AuthShell>
  );
}
