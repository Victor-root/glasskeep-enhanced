// src/components/auth/OidcLoginButton.jsx
//
// "Sign in with my provider" on the login screen. Each account declares
// its own provider, so the server needs to know whose it is first: from
// the profile picked on screen (`userId`), or from the email typed in the
// small field this button opens. Then it leaves for the provider. The
// error line belongs to LoginView, so a failure reported on the way back
// survives switching login modes.

import React, { useEffect, useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { oidcErrorMessage, startOidcSignIn } from "../../auth/oidcClient.js";

const BUTTON_CLASSES =
  "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-light)] text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-60";

export default function OidcLoginButton({ userId, defaultEmail = "", error, onError }) {
  const [asking, setAsking] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  // Coming back with the browser's Back button restores this page from
  // the back-forward cache, the button still disabled from the click.
  useEffect(() => {
    const onPageShow = (e) => { if (e.persisted) setBusy(false); };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const start = async (who) => {
    onError("");
    setBusy(true);
    try {
      await startOidcSignIn(who);
    } catch (e) {
      onError(oidcErrorMessage(e));
      setBusy(false);
    }
  };

  const onButton = () => {
    if (userId) return start({ userId });
    setEmail(defaultEmail);
    setAsking(true);
  };

  return (
    <div className="mt-3 space-y-2">
      {asking && !userId ? (
        <form
          onSubmit={(e) => { e.preventDefault(); if (email.trim()) start({ email: email.trim() }); }}
          className="flex gap-2"
        >
          <input
            type="text"
            autoFocus
            autoComplete="username"
            className="flex-1 min-w-0 bg-transparent border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            placeholder={t("oidcSignInEmailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="shrink-0 px-3 py-2 rounded-lg border border-[var(--border-light)] text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-60"
          >
            {busy ? t("oidcSignInProgress") : t("oidcSignInContinue")}
          </button>
        </form>
      ) : (
        <button type="button" onClick={onButton} disabled={busy} className={BUTTON_CLASSES}>
          <TI.UserCircle className="tabler-icon w-4 h-4" />
          {busy ? t("oidcSignInProgress") : t("oidcSignIn")}
        </button>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
