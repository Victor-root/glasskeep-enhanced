import React, { useState, useEffect } from "react";
import { t } from "../../i18n";
import AuthShell from "./AuthShell.jsx";
import UserAvatar from "../common/UserAvatar.jsx";

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
}) {
  const [mode, setMode] = useState("profiles"); // "profiles" | "password" | "manual"
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  // If no visible profiles, show manual login directly
  const hasProfiles = loginProfiles && loginProfiles.length > 0;

  const loginErrorMessage = (er) =>
    er && (er.status || er.isNetworkError) && er.message
      ? er.message
      : t("loginUnexpectedError");

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const res = await onLogin(email.trim(), pw);
      if (!res.ok) setErr(res.error || t("loginFailed"));
    } catch (er) {
      setErr(loginErrorMessage(er));
    }
  };

  const handleProfileLogin = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const res = await onLoginById(selectedProfile.id, pw);
      if (!res.ok) setErr(res.error || t("loginFailed"));
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
        <div className="text-center">
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
            className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            placeholder={t("enterPassword")}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
          />
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button
            type="submit"
            className="w-full px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
          >{t("signIn")}</button>
        </form>
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
    >
      <form onSubmit={handleManualSubmit} className="space-y-4">
        <input
          type="text"
          autoComplete="username"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder={t("username")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder={t("password")}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
        />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button
          type="submit"
          className="w-full px-4 py-2 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
        >{t("signIn")}</button>
      </form>

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
