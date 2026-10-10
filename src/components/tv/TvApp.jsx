import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { api, getAuth, setAuth } from "../../utils/api.js";
import { TV_CSS, TV_STYLE_ID } from "./tvStyles.js";
import TvLogin from "./TvLogin.jsx";
import TvNotesViewer from "./TvNotesViewer.jsx";
import useTvLoginScreenData from "./useTvLoginScreenData.js";
import useTvNotes from "./useTvNotes.js";
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

  const clearSession = useCallback(() => {
    setSession(null);
    setAuth(null);
  }, []);

  const { loginSlogan, loginProfiles } = useTvLoginScreenData(token);

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

  const { notes, setNotes, loadError } = useTvNotes(token, clearSession);

  // Sync localStorage auth back into state if it changes from elsewhere
  // (e.g. WebView background tab logged out).
  useEffect(() => {
    window.addEventListener("auth-expired", clearSession);
    return () => window.removeEventListener("auth-expired", clearSession);
  }, [clearSession]);

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

  // Manual login. The phone's LoginView ships its single text field as
  // `email` regardless of whether the user typed a real email or just
  // a username — the server's getUserByEmail does a lowercase match
  // against whatever is in the `email` column, so accounts whose
  // identifier is "Victor" (no '@') still match. We mirror that exact
  // behaviour so users who've signed in for months from the phone
  // don't need to relearn anything on TV.
  // user_id is reserved for the numeric profile picker.
  const signInManual = useCallback(async (identifier, password) => {
    const id = String(identifier || "").trim();
    if (!id) throw new Error("Identifier required");
    const res = await api("/login", {
      method: "POST",
      body: { email: id, password },
    });
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
    clearSession();
    setNotes([]);
  }, [clearSession, setNotes]);

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
        loginSlogan={loginSlogan}
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
