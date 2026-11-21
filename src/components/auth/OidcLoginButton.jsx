// src/components/auth/OidcLoginButton.jsx
//
// "Sign in with my provider" on the login screen. Each account declares
// its own provider, so the server needs to know whose it is first: from
// the profile picked on screen (`userId`), or from the username or email
// typed in the small field this button opens, the same identifier the
// password form takes. When the instance's provider is the only one
// (`direct`), there is nothing to ask: the provider says whose account it
// is. Then it leaves for the provider. The
// error line belongs to LoginView, so a failure reported on the way back
// survives switching login modes.

import React, { useEffect, useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { oidcErrorMessage, startOidcSignIn } from "../../auth/oidcClient.js";

const BUTTON_CLASSES =
  "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-light)] text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors aria-busy:pointer-events-none";

// The longest the button stays busy while the provider is open over the
// page (in the Android app): the answer, or coming back without one,
// usually ends it first.
const BUSY_MAX_MS = 4000;

// The icon, giving way to a spinner while busy: the label does not change,
// so the button no longer flickers between two texts on a tap.
function BusyIcon({ busy, children }) {
  return (
    <span className="oidc-busy-icon" data-busy={busy ? "true" : "false"} aria-hidden="true">
      <span className="oidc-busy-icon__idle">{children}</span>
      <span className="oidc-busy-icon__spinner" />
    </span>
  );
}

export default function OidcLoginButton({ userId, direct, defaultEmail = "", error, onError }) {
  const [asking, setAsking] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  // An error brought back from the provider ends the attempt.
  const [seenError, setSeenError] = useState(error);
  if (error !== seenError) {
    setSeenError(error);
    if (error) setBusy(false);
  }

  // Coming back with the browser's Back button restores this page from
  // the back-forward cache, the button still busy from the click. In the
  // Android app the provider opens over the page: coming back to it
  // without an answer, or a few seconds, end the busy state.
  useEffect(() => {
    if (!busy) return undefined;
    let back;
    const onPageShow = (e) => { if (e.persisted) setBusy(false); };
    const onVisible = () => {
      if (document.visibilityState === "visible") back = setTimeout(() => setBusy(false), 700);
    };
    const limit = setTimeout(() => setBusy(false), BUSY_MAX_MS);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(back);
      clearTimeout(limit);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [busy]);

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
    if (direct) return start({});
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
            placeholder={t("oidcSignInIdentifierPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
          <button
            type="submit"
            disabled={!email.trim()}
            aria-busy={busy || undefined}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-light)] text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-60 aria-busy:pointer-events-none"
          >
            {busy && <BusyIcon busy />}
            {t("oidcSignInContinue")}
          </button>
        </form>
      ) : (
        <button type="button" onClick={onButton} aria-busy={busy || undefined} className={BUTTON_CLASSES}>
          <BusyIcon busy={busy}>
            <TI.UserCircle className="tabler-icon w-4 h-4" />
          </BusyIcon>
          {t("oidcSignIn")}
        </button>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
