import React, { useState } from "react";
import { t } from "../../i18n";
import AuthShell from "./AuthShell.jsx";
import { localizeServerError } from "../../utils/serverErrors.js";
import { WIDE_SUBMIT_CLASSES } from "../common/fieldClasses.js";

export default function SecretLoginView({ dark, onToggleDark, onLoginWithKey, goLogin, floatingCardsEnabled, loginSlogan }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await onLoginWithKey(key.trim());
      if (!res.ok) setErr(localizeServerError(res.error, "loginFailed"));
    } catch (er) {
      setErr(localizeServerError(er.message, "loginFailed"));
    }
  };

  return (
    <AuthShell
      dark={dark}
      onToggleDark={onToggleDark}
      floatingCardsEnabled={floatingCardsEnabled}
      loginSlogan={loginSlogan}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px] text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder={t("pasteSecretKeyHere")}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          required
        />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button
          type="submit"
          className={WIDE_SUBMIT_CLASSES}
        >{t("signInWithSecretKey")}</button>
      </form>
      <div className="mt-4 text-sm text-center">
        {t("rememberCredentials")}{" "}
        <button className="text-indigo-600 hover:underline" onClick={goLogin}>{t("signInWithEmailPassword")}</button>
      </div>
    </AuthShell>
  );
}
