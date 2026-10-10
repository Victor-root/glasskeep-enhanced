import { useEffect, useState } from "react";
import { t } from "../i18n";
import { api } from "../utils/api.js";
import {
  clearQueueForUser as idbClearQueueForUser,
  clearNotesForSession as idbClearNotesForSession,
} from "../sync/localDb.js";
import { exchangeOidcTicket, oidcErrorMessage, takeOidcRedirectResult } from "../auth/oidcClient.js";

/**
 * Sign-in, registration and sign-out, plus the two ways a session ends
 * without the user asking: an expired token (`auth-expired` event) and
 * the single sign-on redirect coming back with an error.
 */
export default function useAuthActions({
  token,
  session,
  navigate,
  showToast,
  resetSync,
  setNotes,
}) {
  const { currentUserIdRef, sessionIdRef, completeLogin, clearSession } = session;

  // Shared teardown of sign-out and expired session. Reads refs, so it is
  // safe from a stale closure (the auth-expired listener). The sync queue
  // is only purged on an explicit sign-out: after an expiry the pending
  // offline changes are replayed once the user signs in again.
  const cleanupClientSession = (purgeQueue = false) => {
    const userId = currentUserIdRef.current;
    const sid = sessionIdRef.current;
    // The notes cache is session-scoped and disposable.
    if (userId && sid) {
      idbClearNotesForSession(userId, sid).catch(() => {});
    }
    if (purgeQueue && userId) {
      idbClearQueueForUser(userId).catch(() => {});
    }
    // Leases, tombstones, reorder holds and the engine: nothing survives
    // into the next session.
    resetSync();
    clearSession();
    setNotes([]);
    // The notifications are deliberately kept: their provider lives above
    // the app, the dismissed history is already acked server-side (so it
    // would be lost for good), and the active ones are deduplicated on
    // reconnect.
    // Session-scoped localStorage caches only (UI prefs stay).
    const uid = userId || "anonymous";
    const s = sid || "no-session";
    try {
      localStorage.removeItem(`glass-keep-notes-${uid}-${s}`);
      localStorage.removeItem(`glass-keep-archived-${uid}-${s}`);
      localStorage.removeItem(`glass-keep-trashed-${uid}-${s}`);
      localStorage.removeItem(`glass-keep-cache-timestamp-${uid}-${s}`);
      // Legacy user-scoped keys (before the session scope).
      localStorage.removeItem(`glass-keep-notes-${uid}`);
      localStorage.removeItem(`glass-keep-archived-${uid}`);
      localStorage.removeItem(`glass-keep-trashed-${uid}`);
      localStorage.removeItem(`glass-keep-cache-timestamp-${uid}`);
    } catch { /* storage unavailable: nothing to clear */ }
    navigate("#/login");
  };

  const signOut = () => {
    cleanupClientSession(true);
  };

  // Back from the single sign-on provider: a one-time ticket to trade for
  // a session, the outcome of linking an identity from the settings, or
  // the reason it failed. Read once, at boot.
  const [oidcLoginError, setOidcLoginError] = useState(null);
  useEffect(() => {
    const { ticket, error, linked } = takeOidcRedirectResult();
    if (ticket) {
      exchangeOidcTicket(ticket)
        .then(completeLogin)
        .catch((e) => setOidcLoginError(e || "oidc_failed"));
    } else if (error && !token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of the sign-in redirect result at boot
      setOidcLoginError(error);
    } else if (error) {
      showToast(oidcErrorMessage(error), "error");
    } else if (linked) {
      showToast(t("oidcLinkedToast"), "success");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email, password) => {
    const res = await api("/login", {
      method: "POST",
      body: { email, password },
    });
    return completeLogin(res);
  };
  const signInById = async (userId, password) => {
    const res = await api("/login", {
      method: "POST",
      body: { user_id: userId, password },
    });
    return completeLogin(res);
  };
  const signInWithSecret = async (key) => {
    const res = await api("/login/secret", { method: "POST", body: { key } });
    return completeLogin(res);
  };
  const register = async (name, email, password) => {
    const res = await api("/register", {
      method: "POST",
      body: { name, email, password },
    });
    // Registrations wait for an admin's approval.
    if (res?.pending) {
      return { ok: true, pending: true };
    }
    // Legacy flows that still answer with a token directly.
    if (res?.token) {
      return completeLogin(res);
    }
    return { ok: true, pending: true };
  };

  // Expired token: same cleanup as a sign-out, queue kept.
  useEffect(() => {
    const handleAuthExpired = () => {
      console.warn("[Auth] Token expired, cleaning up session...");
      cleanupClientSession();
    };
    window.addEventListener("auth-expired", handleAuthExpired);
    return () => window.removeEventListener("auth-expired", handleAuthExpired);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- listener registered once; the first render's cleanup reads the session through refs
  }, []);

  return { signOut, signIn, signInById, signInWithSecret, register, oidcLoginError };
}
