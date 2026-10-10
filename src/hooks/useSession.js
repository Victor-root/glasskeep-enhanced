import { useCallback, useEffect, useRef, useState } from "react";
import { api, getAuth, setAuth } from "../utils/api.js";

const newSessionId = () =>
  crypto.randomUUID?.() ??
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });

/**
 * The signed-in session { token, user, sessionId }, mirrored in the
 * localStorage auth cache. `sessionId` scopes the local notes cache and
 * the sync queue to this sign-in.
 */
export default function useSession({ navigate }) {
  const [session, setSession] = useState(getAuth());
  const token = session?.token;
  const currentUser = session?.user || null;
  const sessionId = session?.sessionId || null;

  // Latest values, read by callbacks that outlive the render that made them.
  const currentUserIdRef = useRef(currentUser?.id);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref read by async callbacks, outside render
  currentUserIdRef.current = currentUser?.id;
  const currentUserRef = useRef(currentUser);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref read by async callbacks, outside render
  currentUserRef.current = currentUser;
  const sessionIdRef = useRef(sessionId);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref read by async callbacks, outside render
  sessionIdRef.current = sessionId;

  // Forced password change (first login with a temporary password).
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Mirrors a profile field (avatar, name...) into the live session and
  // the localStorage auth cache, from either this tab's own write or a
  // user_profile_updated event relayed from another tab/device.
  const applyProfileUpdate = useCallback((updates) => {
    setSession((prev) => (prev ? { ...prev, user: { ...prev.user, ...updates } } : prev));
    setAuth({ ...getAuth(), user: { ...getAuth()?.user, ...updates } });
  }, []);

  // Refresh the cached profile (avatar / name / language) from the server
  // on boot and whenever the tab regains focus. The user object is
  // otherwise only set at login and cached in localStorage, so a profile
  // change made on ANOTHER device (e.g. a new avatar) never showed up here
  // — not even after Ctrl+F5, which doesn't clear localStorage. Best
  // effort: a failure (locked instance, offline) just keeps the cache.
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    const refreshProfile = async () => {
      try {
        const me = await api("/user/me", { token });
        if (cancelled || !me || !me.id) return;
        setSession((prev) =>
          prev ? { ...prev, user: { ...prev.user, ...me } } : prev,
        );
        try {
          const cur = getAuth();
          if (cur) setAuth({ ...cur, user: { ...cur.user, ...me } });
        } catch { /* localStorage unavailable */ }
      } catch { /* offline / locked — keep the cached profile */ }

      // Proactively renew the JWT while it's still valid but aging, so an
      // actively-used session never hits the expiry cliff. We decode the
      // payload ONLY to skip the call when the token is still fresh (<24 h);
      // if we can't read the age we renew anyway (fail-open).
      //
      // NB: JWT payloads are base64URL. A plain atob() throws on '-'/'_'
      // (present in ~all tokens), which previously threw here and silently
      // disabled renewal entirely — so tokens still died at their max age.
      try {
        let shouldRenew = true;
        try {
          const payloadB64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
          const claims = JSON.parse(atob(payloadB64));
          if (claims?.iat && Date.now() - claims.iat * 1000 < 24 * 3600 * 1000) {
            shouldRenew = false; // still fresh — nothing to do yet
          }
        } catch { /* couldn't read the age → renew anyway */ }
        if (shouldRenew) {
          const renewed = await api("/auth/renew", { token });
          if (!cancelled && renewed?.token) {
            setSession((prev) => (prev ? { ...prev, token: renewed.token } : prev));
            try {
              const cur = getAuth();
              if (cur) setAuth({ ...cur, token: renewed.token });
            } catch { /* localStorage unavailable */ }
          }
        }
      } catch { /* renewal best-effort — existing token still valid */ }
    };
    refreshProfile();
    window.addEventListener("focus", refreshProfile);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshProfile);
    };
  }, [token]);

  const completeLogin = (res) => {
    const sessionWithId = { ...res, sessionId: newSessionId() };
    setSession(sessionWithId);
    setAuth(sessionWithId);
    if (res.must_change_password) {
      setMustChangePassword(true);
    }
    navigate("#/notes");
    return { ok: true };
  };

  // A password change answers with a fresh token for the same session.
  const applyPasswordChange = (res) => {
    if (res.token && res.user) {
      setSession((prev) => ({ ...prev, token: res.token, user: res.user }));
      setAuth({ ...getAuth(), token: res.token, user: res.user });
    }
  };

  const clearSession = () => {
    setAuth(null);
    setSession(null);
  };

  return {
    token,
    currentUser,
    sessionId,
    currentUserIdRef,
    currentUserRef,
    sessionIdRef,
    mustChangePassword,
    setMustChangePassword,
    applyProfileUpdate,
    completeLogin,
    applyPasswordChange,
    clearSession,
  };
}
