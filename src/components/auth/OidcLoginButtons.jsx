// src/components/auth/OidcLoginButtons.jsx
//
// "Sign in with <provider>" buttons for the login screen, one per
// provider the admin enabled. A click asks the server for the provider
// URL and leaves the page. The error line belongs to LoginView, so a
// failure reported on the way back survives switching login modes.

import React, { useEffect, useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { isOnProviderOrigin, oidcErrorMessage, startOidcSignIn } from "../../auth/oidcClient.js";

export default function OidcLoginButtons({ providers, error, onError }) {
  const [busyId, setBusyId] = useState(null);

  // Coming back with the browser's Back button restores this page from
  // the back-forward cache, buttons still disabled from the click.
  useEffect(() => {
    const onPageShow = (e) => { if (e.persisted) setBusyId(null); };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  if (!providers?.length) return null;

  const handleClick = async (provider) => {
    onError("");
    if (!isOnProviderOrigin(provider)) {
      onError(t("oidcWrongOrigin", { origin: provider.origin }));
      return;
    }
    setBusyId(provider.id);
    try {
      await startOidcSignIn(provider.id);
    } catch (e) {
      onError(oidcErrorMessage(e));
      setBusyId(null);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {providers.map((provider) => (
        <button
          key={provider.id}
          type="button"
          onClick={() => handleClick(provider)}
          disabled={!!busyId}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-light)] text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-60"
        >
          <TI.UserCircle className="tabler-icon w-4 h-4" />
          {busyId === provider.id ? t("oidcSignInProgress") : t("oidcSignIn", { provider: provider.name })}
        </button>
      ))}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
