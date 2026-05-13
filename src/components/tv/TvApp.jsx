import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { api, getAuth, setAuth } from "../../utils/api.js";
import { TV_CSS, TV_STYLE_ID } from "./tvStyles.js";
import TvLogin from "./TvLogin.jsx";
import TvNotesViewer from "./TvNotesViewer.jsx";
import { setTvModeOverride } from "../../utils/tvMode.js";

// TV-mode entry point. Used in place of the phone/desktop tree whenever
// the app boots on Android TV (or with the ?tv=1 override). Owns its own
// minimal session + notes-loading state because the regular App.jsx
// graph is far too noisy for a 10-foot viewer (composer, drag, multi-
// select, sync queue UI, …) and we don't need any of it here.
//
// Sync engine, IndexedDB queue and SSE live in App.jsx — when the user
// flips out of TV mode they reconnect normally. The TV viewer is a
// strict consumer that re-fetches /api/notes on mount and on focus.

function applyTvAttrs(enable) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (enable) {
    html.setAttribute("data-tv", "1");
    html.style.colorScheme = "dark";
  } else {
    html.removeAttribute("data-tv");
    html.style.colorScheme = "";
  }
}

function injectTvStyles() {
  if (typeof document === "undefined") return () => {};
  if (document.getElementById(TV_STYLE_ID)) return () => {};
  const node = document.createElement("style");
  node.id = TV_STYLE_ID;
  node.textContent = TV_CSS;
  document.head.appendChild(node);
  return () => {
    if (node.parentNode) node.parentNode.removeChild(node);
  };
}

export default function TvApp() {
  const [session, setSession] = useState(() => getAuth());
  const token = session?.token;
  const currentUser = session?.user || null;

  const [notes, setNotes] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  // Public login profiles (Jellyfin-style avatar list). Lets users sign
  // in by picking their face + typing the password — no email required,
  // which matters because the original phone account may not have one.
  const [loginProfiles, setLoginProfiles] = useState([]);
  useEffect(() => {
    if (token) return; // already signed in, profiles list is irrelevant
    let cancelled = false;
    (async () => {
      try {
        const profiles = await api("/login/profiles");
        if (cancelled) return;
        setLoginProfiles(Array.isArray(profiles) ? profiles : []);
      } catch {
        if (!cancelled) setLoginProfiles([]);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Mark <html data-tv="1"> + inject the TV stylesheet before the first
  // paint. useLayoutEffect makes sure the regular phone UI never flashes
  // through if TvApp mounts under a non-TV route by accident.
  useLayoutEffect(() => {
    applyTvAttrs(true);
    const remove = injectTvStyles();
    return () => {
      applyTvAttrs(false);
      remove();
    };
  }, []);

  // Notes loader. Polls every 30s (very cheap on a LAN server) so the
  // viewer keeps up with edits made from the phone, even though we don't
  // attach an SSE listener in TV mode.
  const loadNotes = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api("/notes", { token });
      const list = Array.isArray(data?.notes) ? data.notes : Array.isArray(data) ? data : [];
      setNotes(list);
      setLoadError(null);
    } catch (err) {
      if (err?.isAuthError || err?.status === 401) {
        // Token expired — fall back to login.
        setSession(null);
        setAuth(null);
        return;
      }
      setLoadError(err?.message || "Failed to load notes");
    }
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    loadNotes();
    const id = setInterval(loadNotes, 30 * 1000);
    return () => clearInterval(id);
  }, [token, loadNotes]);

  // React to network changes — a TV on Wi-Fi is more likely to drop
  // off than a phone, and we want the status pill to reflect reality.
  useEffect(() => {
    const onOnline = () => { setIsOnline(true); loadNotes(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [loadNotes]);

  // Window-focus refresh — the user may have unlocked the TV after
  // hours of standby; pull the latest notes so they're current.
  useEffect(() => {
    const refresh = () => { if (token) loadNotes(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });
    return () => window.removeEventListener("focus", refresh);
  }, [token, loadNotes]);

  // Sync localStorage auth back into state if it changes from elsewhere
  // (e.g. WebView background tab logged out).
  useEffect(() => {
    const onAuthExpired = () => {
      setSession(null);
      setAuth(null);
    };
    window.addEventListener("auth-expired", onAuthExpired);
    return () => window.removeEventListener("auth-expired", onAuthExpired);
  }, []);

  const completeLogin = useCallback((res) => {
    if (!res?.token) throw new Error("No token returned");
    const sessionWithId = {
      ...res,
      sessionId: crypto.randomUUID?.() ||
        "tv-" + Math.random().toString(36).slice(2),
    };
    setSession(sessionWithId);
    setAuth(sessionWithId);
  }, []);

  // Manual login. Phone accounts may have only a username (no email),
  // so the TV viewer accepts either:
  //   - "foo@example.com"  → sent as { email }
  //   - "Victor"           → sent as { name } (server falls back to
  //                          getUserByName when no email/user_id given)
  // user_id is reserved for the numeric profile picker — never use it
  // for free-text input or the server returns "No account found".
  const signInManual = useCallback(async (identifier, password) => {
    const id = String(identifier || "").trim();
    if (!id) throw new Error("Identifier required");
    const body = id.includes("@")
      ? { email: id, password }
      : { name: id, password };
    const res = await api("/login", { method: "POST", body });
    completeLogin(res);
  }, [completeLogin]);

  // Profile-based login (matches the phone's Jellyfin-style avatar
  // picker). user_id is the public profile id returned by
  // /login/profiles, no email needed.
  const signInById = useCallback(async (userId, password) => {
    const res = await api("/login", {
      method: "POST",
      body: { user_id: userId, password },
    });
    completeLogin(res);
  }, [completeLogin]);

  const signOut = useCallback(() => {
    setSession(null);
    setAuth(null);
    setNotes([]);
  }, []);

  const exitTvMode = useCallback(() => {
    // Force the phone layout from this device. Persisted so the next
    // launch honours the choice. We trigger a hashchange so useTvMode's
    // listener re-evaluates without a hard reload (which would lose any
    // unsaved state in App.jsx if the user flips back).
    setTvModeOverride(false);
    window.location.hash = "";
    window.dispatchEvent(new Event("tv-mode-changed"));
  }, []);

  if (!currentUser) {
    return (
      <TvLogin
        profiles={loginProfiles}
        onLoginManual={signInManual}
        onLoginById={signInById}
        allowExit={!window.__isAndroidTV}
        onExitTvMode={exitTvMode}
      />
    );
  }

  return (
    <>
      <TvNotesViewer
        notes={notes}
        currentUser={currentUser}
        onSignOut={signOut}
        onExitTvMode={!window.__isAndroidTV ? exitTvMode : undefined}
        isOnline={isOnline}
        sseConnected={true}
        syncState={loadError ? "error" : "idle"}
      />
      {loadError && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(220,38,38,0.18)",
            color: "#fca5a5",
            border: "1px solid rgba(220,38,38,0.4)",
            borderRadius: 14,
            padding: "10px 22px",
            fontSize: 16,
            zIndex: 70,
            pointerEvents: "none",
          }}
        >
          {loadError}
        </div>
      )}
    </>
  );
}
