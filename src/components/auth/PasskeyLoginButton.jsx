// src/components/auth/PasskeyLoginButton.jsx
//
// "Sign in with a passkey" button for the login screen. Wraps the
// passkey ceremony, surfaces errors the same way LoginView does, and
// reports the resulting { token, user } back to App.jsx so the
// session lands in the same store as a password login.
//
// Only renders when the browser supports WebAuthn — otherwise the
// button would dangle uselessly. We don't probe for any specific
// credential availability here (browsers will surface "no passkey
// available" themselves if there's nothing to use).

import React, { useEffect, useState } from "react";
import { t } from "../../i18n";
import { isWebAuthnSupported, loginWithPasskey } from "../../auth/passkeyClient.js";
import { localizeServerError } from "../../utils/serverErrors.js";

export default function PasskeyLoginButton({ onLoggedIn, dark }) {
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setSupported(isWebAuthnSupported());
  }, []);

  if (!supported) return null;

  const handleClick = async () => {
    setErr("");
    setLoading(true);
    try {
      const session = await loginWithPasskey();
      if (session && session.token && session.user) {
        onLoggedIn?.(session);
      } else {
        setErr(localizeServerError("Verification failed", "passkeyLoginFailed"));
      }
    } catch (e) {
      // User-cancelled / no credential → DOMException with name like
      // "NotAllowedError". We treat any error as a soft failure: the
      // button stays available so they can retry, and the password
      // form is right there.
      const msg = (e && e.message) || "passkeyLoginFailed";
      const isCancelled = e?.name === "NotAllowedError" || /NotAllowedError|cancelled|aborted/i.test(msg);
      setErr(isCancelled ? t("passkeyLoginCancelled") : localizeServerError(msg, "passkeyLoginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-light)] text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-60"
      >
        <KeyIcon />
        {loading ? t("passkeyLoginInProgress") : t("passkeySignIn")}
      </button>
      {err && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  );
}

function KeyIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="M21 7l-9.5 9.5" />
      <path d="M14 14l3 3" />
      <path d="M18 10l3 3" />
    </svg>
  );
}
