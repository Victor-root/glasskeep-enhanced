import React, { useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import useSpatialFocus from "./useSpatialFocus.js";
import UserAvatar from "../common/UserAvatar.jsx";

// Couch-friendly login. Mirrors the phone's three-step flow but keeps
// it focused on what works with a remote:
//   1. "profiles" — Jellyfin-style avatar grid (no email needed). This
//      is the default whenever /login/profiles returned something.
//   2. "password" — once a profile is picked, prompt only for the
//      password and submit via onLoginById(profile.id, password).
//   3. "manual"   — fallback for accounts that don't appear in the
//      public profile list. Single identifier field (auto-detects
//      email vs username by '@') + password, submits via onLoginManual.

export default function TvLogin({
  profiles,
  onLoginManual,
  onLoginById,
  loginSlogan,
  allowExit,
  onExitTvMode,
}) {
  const hasProfiles = Array.isArray(profiles) && profiles.length > 0;
  const [mode, setMode] = useState(hasProfiles ? "profiles" : "manual");
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef(null);
  const firstProfileRef = useRef(null);
  const identifierRef = useRef(null);

  // Update default mode when profiles arrive after first render.
  useEffect(() => {
    if (hasProfiles && mode === "manual" && !identifier && !password) {
      setMode("profiles");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProfiles]);

  useSpatialFocus({
    enabled: true,
    onBack: () => {
      if (mode === "password") {
        setMode("profiles");
        setPassword("");
        setError(null);
        return;
      }
      if (mode === "manual" && hasProfiles) {
        setMode("profiles");
        setError(null);
        return;
      }
      if (allowExit && typeof onExitTvMode === "function") onExitTvMode();
    },
  });

  // Park initial focus on a sensible element for each mode.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      let target = null;
      if (mode === "profiles") target = firstProfileRef.current;
      else if (mode === "password") target = passwordRef.current;
      else if (mode === "manual") target = identifierRef.current;
      if (target instanceof HTMLElement) {
        window.dispatchEvent(new CustomEvent("tv-focus", { detail: { target } }));
      }
    });
    return () => cancelAnimationFrame(id);
  }, [mode, selectedProfile]);

  const submitProfile = async (e) => {
    e?.preventDefault?.();
    if (busy || !selectedProfile) return;
    setError(null);
    setBusy(true);
    try {
      await onLoginById(selectedProfile.id, password);
    } catch (err) {
      setError(err?.message || t("signInError") || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const submitManual = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await onLoginManual(identifier, password);
    } catch (err) {
      setError(err?.message || t("signInError") || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  // Shared frame: app logo + "GlassKeep TV" brand + optional subtitle
  // ABOVE the mode-specific card; the dynamic loginSlogan pill (with
  // i18n fallback so there's always one) BELOW it.
  const renderShell = (cardEl, { subtitle } = {}) => (
    <div className="tv-screen">
      <div className="tv-login">
        <img
          src="/pwa-192.png"
          srcSet="/pwa-512.png 2x"
          alt=""
          aria-hidden="true"
          className="tv-login__logo"
        />
        <div className="tv-login__brand">GlassKeep TV</div>
        {subtitle && <div className="tv-login__subtitle">{subtitle}</div>}
        {cardEl}
        <div className="tv-login__slogan">{loginSlogan || t("loginSlogan")}</div>
      </div>
    </div>
  );

  if (mode === "profiles") {
    return renderShell(
      <div className="tv-login__card" style={{ maxWidth: 920 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 18,
            marginTop: 10,
          }}
        >
          {profiles.map((profile, idx) => (
            <button
              key={profile.id}
              ref={idx === 0 ? firstProfileRef : null}
              type="button"
              className="tv-focusable"
              onClick={() => {
                setSelectedProfile(profile);
                setPassword("");
                setError(null);
                setMode("password");
              }}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 18,
                padding: "22px 14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                color: "#e5e7eb",
              }}
            >
              <UserAvatar
                name={profile.name}
                avatarUrl={profile.avatar_url}
                size="w-20 h-20"
                textSize="text-3xl"
                dark
              />
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {profile.name || profile.email || profile.id}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="tv-btn tv-focusable tv-focusable--flat"
          onClick={() => {
            setMode("manual");
            setError(null);
          }}
          style={{ alignSelf: "center", marginTop: 8 }}
        >
          {t("tvManualLogin") || "Sign in with another account"}
        </button>

        {allowExit && (
          <button
            type="button"
            className="tv-btn tv-focusable tv-focusable--flat"
            onClick={onExitTvMode}
            style={{ alignSelf: "center" }}
          >
            {t("tvExitButton") || "Use phone layout"}
          </button>
        )}
      </div>,
      { subtitle: t("selectProfile") || "Pick your profile" }
    );
  }

  if (mode === "password") {
    return renderShell(
      <form className="tv-login__card" onSubmit={submitProfile}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <UserAvatar
            name={selectedProfile?.name}
            avatarUrl={selectedProfile?.avatar_url}
            size="w-20 h-20"
            textSize="text-3xl"
            dark
          />
          <div>
            <div className="tv-login__title" style={{ fontSize: 30 }}>
              {selectedProfile?.name || selectedProfile?.id}
            </div>
            <div style={{ color: "#9ca3af", fontSize: 16 }}>
              {t("password") || "Password"}
            </div>
          </div>
        </div>

        <div className="tv-login__row">
          <label htmlFor="tv-password" className="tv-login__label">
            {t("password") || "Password"}
          </label>
          <input
            id="tv-password"
            ref={passwordRef}
            type="password"
            autoComplete="current-password"
            className="tv-login__input tv-focusable tv-focusable--flat"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </div>

        {error && <div className="tv-login__error">{error}</div>}

        <button
          type="submit"
          className="tv-btn tv-btn--primary tv-login__submit tv-focusable tv-focusable--flat"
          disabled={busy}
        >
          {busy ? (t("signingIn") || "Signing in…") : (t("signIn") || "Sign in")}
        </button>

        <button
          type="button"
          className="tv-btn tv-focusable tv-focusable--flat"
          onClick={() => {
            setMode("profiles");
            setPassword("");
            setError(null);
          }}
          style={{ alignSelf: "center" }}
        >
          ← {t("selectProfile") || "Pick another profile"}
        </button>
      </form>
    );
  }

  // Manual mode (email OR username).
  return renderShell(
    <form className="tv-login__card" onSubmit={submitManual}>
      <div className="tv-login__row">
        <label htmlFor="tv-identifier" className="tv-login__label">
          {t("tvIdentifier") || "Email or username"}
        </label>
        <input
          id="tv-identifier"
          ref={identifierRef}
          type="text"
          autoComplete="username"
          spellCheck="false"
          autoCapitalize="off"
          className="tv-login__input tv-focusable tv-focusable--flat"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
      </div>

      <div className="tv-login__row">
        <label htmlFor="tv-password" className="tv-login__label">
          {t("password") || "Password"}
        </label>
        <input
          id="tv-password"
          type="password"
          autoComplete="current-password"
          className="tv-login__input tv-focusable tv-focusable--flat"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {error && <div className="tv-login__error">{error}</div>}

      <button
        type="submit"
        className="tv-btn tv-btn--primary tv-login__submit tv-focusable tv-focusable--flat"
        disabled={busy}
      >
        {busy ? (t("signingIn") || "Signing in…") : (t("signIn") || "Sign in")}
      </button>

      {hasProfiles && (
        <button
          type="button"
          className="tv-btn tv-focusable tv-focusable--flat"
          onClick={() => {
            setMode("profiles");
            setError(null);
          }}
          style={{ alignSelf: "center" }}
        >
          ← {t("selectProfile") || "Pick a profile"}
        </button>
      )}

      {allowExit && (
        <button
          type="button"
          className="tv-btn tv-focusable tv-focusable--flat"
          onClick={onExitTvMode}
          style={{ alignSelf: "center" }}
        >
          {t("tvExitButton") || "Use phone layout"}
        </button>
      )}
    </form>,
    { subtitle: t("tvLoginHint") || "Sign in once on your TV — your notes will appear, ready to read." }
  );
}
