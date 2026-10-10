import React, { useEffect, useState } from "react";
import { Sun, Moon } from "../../icons/index.jsx";
import TI from "../../icons/editor/index.jsx";
import { t } from "../../i18n";
import { useBranding, DEFAULT_APP_NAME } from "../../branding/BrandingContext.jsx";
import { applyShellThemeClass, applyStoredShellTheme, DEFAULT_SHELL_THEME } from "../../theme/shellTheme.js";
import DecoCard from "../common/DecoCard.jsx";

// Decorative floating note cards behind the sign-in card.
const AUTH_CARDS = [
  { rot: "-12deg", dur: "7s", delay: "0s", pos: { top: "8%", left: "6%" }, color: "99,102,241", lines: ["90%", "75%", "60%"] },
  { rot: "5deg", dur: "9s", delay: "-2s", pos: { top: "42%", left: "3%" }, color: "168,85,247", lines: ["85%", "55%"] },
  { rot: "8deg", dur: "8s", delay: "-4s", pos: { bottom: "10%", left: "9%" }, color: "16,185,129", lines: ["80%", "65%", "45%"] },
  { rot: "6deg", dur: "10s", delay: "-1s", pos: { top: "6%", right: "7%" }, color: "245,158,11", lines: ["88%", "70%"] },
  { rot: "-8deg", dur: "7.5s", delay: "-3s", pos: { top: "38%", right: "4%" }, color: "236,72,153", lines: ["90%", "60%", "78%"] },
  { rot: "-15deg", dur: "11s", delay: "-5s", pos: { bottom: "8%", right: "8%" }, color: "20,184,166", lines: ["75%", "50%"] },
  // Extra cards, visible only on md+ screens to fill the gap
  { rot: "10deg", dur: "8.5s", delay: "-1.5s", pos: { top: "18%", left: "22%" }, color: "249,115,22", lines: ["82%", "64%", "50%"], wideOnly: true },
  { rot: "-6deg", dur: "9.5s", delay: "-6s", pos: { bottom: "20%", left: "20%" }, color: "14,165,233", lines: ["88%", "58%"], wideOnly: true },
  { rot: "-9deg", dur: "10.5s", delay: "-2.5s", pos: { top: "14%", right: "20%" }, color: "132,204,22", lines: ["76%", "92%", "55%"], wideOnly: true },
  { rot: "7deg", dur: "8s", delay: "-7s", pos: { bottom: "18%", right: "18%" }, color: "244,63,94", lines: ["80%", "62%"], wideOnly: true },
];

// Clear the boot-time placeholder (colour + BlurHash painted on the body
// background by the inline script in index.html) once React owns the
// backdrop. Restores the stylesheet's --gk-app-bg. Safe to call repeatedly /
// when nothing was painted.
function removeBootBgLayer() {
  if (typeof document === "undefined" || !document.body) return;
  const s = document.body.style;
  s.backgroundColor = "";
  s.backgroundImage = "";
  s.backgroundSize = "";
  s.backgroundPosition = "";
  s.backgroundRepeat = "";
  // Older boot script used an overlay element — remove it if present.
  const el = document.getElementById("gk-login-bg-boot");
  if (el) el.remove();
}

export default function AuthShell({ title, dark, onToggleDark, floatingCardsEnabled = true, loginSlogan, children, sidePanel }) {
  const { branding } = useBranding();
  const appName = branding.appName || DEFAULT_APP_NAME;

  // Apply the admin-configured login page theme while this shell is visible.
  // Restores the user's own saved theme on unmount (when they log in).
  const loginTheme = branding.loginTheme || DEFAULT_SHELL_THEME;
  useEffect(() => {
    applyShellThemeClass(loginTheme);
    return () => applyStoredShellTheme();
  }, [loginTheme]);
  const logoSrc = branding.logo || "/pwa-192.png";
  // A custom logo is shown raw (no rounded clip / shadow) so a
  // transparent PNG doesn't get an ugly box behind it; the bundled
  // default icon keeps its rounded-tile + shadow look.
  const isCustomLogo = !!branding.logo;
  // The login background's URL. Prefer the live branding value; before that
  // resolves, fall back to the boot global the server injected (cold load)
  // so we render the SAME versioned URL the boot script already preloaded —
  // no flash, no double fetch. `hasCustomBg` is then known on first paint,
  // so the decorative cards never appear when a background is configured.
  const bootBg = (typeof window !== "undefined" && window.__GK_LOGIN_BG__) || null;
  const bgUrl = branding.loginBackground || (bootBg && bootBg.url) || null;
  const hasCustomBg = !!bgUrl;
  // Only cross-fade when there's a placeholder to fade FROM (mean colour /
  // BlurHash). Backgrounds uploaded before placeholders existed have none,
  // so we show the image the moment it loads (the prior behaviour) rather
  // than fading in from a blank frame.
  const hasPlaceholder = !!(branding.loginBackgroundColor || (bootBg && bootBg.color));
  const blur = branding.loginBackgroundBlur || 0;
  // A custom background replaces the decorative floating cards — showing
  // both would clutter the backdrop and fight for attention.
  const showDecoCards = floatingCardsEnabled && !hasCustomBg;
  // While a custom login background is shown, flag <html> so light-mode
  // surfaces turn near-opaque (see .gk-custom-bg rules) and the form +
  // floating text stay legible over the photo.
  useEffect(() => {
    if (!hasCustomBg) return undefined;
    const el = document.documentElement;
    el.classList.add("gk-custom-bg");
    return () => el.classList.remove("gk-custom-bg");
  }, [hasCustomBg]);

  // Fade the real image in over the boot placeholder (colour → BlurHash →
  // sharp image), then drop the placeholder layer. We preload via an Image
  // so we know exactly when it's painted; the boot layer stays visible
  // underneath until the fade completes, so there's never a bare frame.
  const [bgReady, setBgReady] = useState(false);
  useEffect(() => {
    if (!bgUrl) { removeBootBgLayer(); return undefined; }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hide the background until the new image has loaded and faded in
    setBgReady(false);
    const img = new Image();
    let timer;
    img.onload = () => {
      setBgReady(true);
      timer = setTimeout(removeBootBgLayer, 450); // after the opacity fade
    };
    img.onerror = removeBootBgLayer;
    img.src = bgUrl;
    return () => { clearTimeout(timer); };
  }, [bgUrl]);
  // If this shell ever unmounts (e.g. login succeeds) before the fade, make
  // sure the placeholder doesn't linger behind the app.
  useEffect(() => removeBootBgLayer, []);

  return (
    // Rides up as one block when the soft keyboard would cover the field
    // being typed in (useKeyboardInset), like the note overlays do.
    <div
      className="min-h-screen flex flex-col px-4 relative overflow-hidden"
      style={{ top: "calc(-1 * var(--keyboard-pan, 0px))" }}
    >
      {/* Admin-configured login background. Fixed + behind everything
          (z-0). The image sits in an overscanned inner layer so the
          blur's faded edges fall outside the viewport, and a
          theme-aware scrim on top keeps the form + text legible over
          any image. Login-only: AuthShell is never used inside the app. */}
      {hasCustomBg && (
        <div
          aria-hidden="true"
          className="login-custom-bg"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            overflow: "hidden",
            // Fade in over the boot placeholder (colour + BlurHash, painted
            // behind at z-index -1) so the sharp image arrives as a soft
            // cross-fade rather than a pop. With no placeholder there's
            // nothing to fade from, so render at full opacity immediately.
            opacity: bgReady || !hasPlaceholder ? 1 : 0,
            transition: hasPlaceholder ? "opacity 0.4s ease" : "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: blur > 0 ? `-${blur * 2}px` : 0,
              backgroundImage: `url(${bgUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: blur > 0 ? `blur(${blur}px)` : "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              // Light mode shows the image raw (a white wash looked washed
              // out); dark mode keeps a veil so light text stays legible.
              background: dark ? "rgba(17,17,17,0.55)" : "transparent",
            }}
          />
        </div>
      )}
      {showDecoCards && <div aria-hidden="true">
        {AUTH_CARDS.map((card, i) => <DecoCard key={i} {...card} />)}
      </div>}
      {/* Centered card area, takes the remaining vertical space so the
          footer below stays in normal flow and never overlaps the card
          on small screens. When a `sidePanel` is provided (the QR
          login flow opens one), the inner wrapper widens to fit BOTH
          the auth card and the side panel side-by-side on lg+ screens
          (≥1024 px). On narrower viewports the side panel falls back
          to a stacked layout below the auth card so the user can
          still see it without horizontal scroll. */}
      <div className="flex-1 w-full flex items-center justify-center py-8">
        <div
          className={`relative z-10 w-full mx-auto ${
            sidePanel ? "lg:max-w-4xl" : "max-w-md"
          }`}
        >
          {/* Logo + title — sits above the form card. Centred in its
              max-w-md box on every viewport; on lg+ the box is
              left-aligned within the wider wrapper (lg:mx-0) so the
              logo lines up over the form card rather than drifting
              into the gap between the two cards. */}
          {/* Logo + title above the form card — only when there is NO
              custom background. With a custom photo this floats on the
              image (and a transparent logo can be unreadable), so it
              moves INTO the form card instead (see below). */}
          {!hasCustomBg && (
            <div className="text-center mb-6 w-full max-w-md mx-auto lg:mx-0">
              <img
                src={logoSrc}
                alt={appName}
                className={`h-16 w-16 mx-auto mb-4 select-none pointer-events-none object-contain${isCustomLogo ? "" : " rounded-2xl shadow-lg"}`}
                draggable="false"
              />
              <h1 className="text-3xl font-bold">{appName}</h1>
              <p className="text-gray-500 dark:text-gray-400">{title}</p>
            </div>
          )}

          {/* Cards row.
              On mobile: flex column with the form card, a decorative
              arrow-DOWN, and the QR card stacked one under the other.
              On lg+: a `relative w-fit` block where the form card is
              the only in-flow child; the right-pointing arrow and the
              QR card are positioned ABSOLUTELY relative to it.
              Why absolute on desktop:  with the QR card in flow, the
              cards row's height was `max(formCard, qrCard)` — i.e. it
              grew by ~190 px whenever the user popped the QR open,
              which then made the outer-flex `items-center` re-centre
              the whole page and shifted the logo+title visibly up.
              Pulling the QR (and the arrow) out of the flow keeps the
              row height pinned to the form card so the logo+title
              never moves between QR-closed and QR-open. */}
          <div
            className={`flex flex-col items-center gap-6 ${
              sidePanel ? "lg:block lg:relative lg:w-fit lg:items-stretch" : ""
            }`}
          >
            <div className="glass-card auth-card rounded-xl p-6 shadow-lg w-full max-w-md">
              {/* With a custom background the brand sits inside the card
                  (on its opaque surface) so a transparent logo + the
                  name stay legible over any photo. */}
              {hasCustomBg && (
                <div className="text-center mb-5">
                  <img
                    src={logoSrc}
                    alt={appName}
                    className={`h-14 w-14 mx-auto mb-3 select-none pointer-events-none object-contain${isCustomLogo ? "" : " rounded-2xl shadow-md"}`}
                    draggable="false"
                  />
                  <h1 className="text-2xl font-bold">{appName}</h1>
                  {title && <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{title}</p>}
                </div>
              )}
              {children}
            </div>
            {sidePanel && (
              <>
                {/* Mobile: arrow pointing DOWN, sits between the form
                    card and the QR card in flow. Hidden on lg+. */}
                <div
                  className="lg:hidden text-indigo-500 dark:text-indigo-400"
                  aria-hidden="true"
                >
                  <TI.ArrowBadgeDown className="tabler-icon w-12 h-12" />
                </div>
                {/* Desktop: arrow pointing RIGHT, absolutely positioned
                    just past the form card's right edge, vertically
                    centred on it. */}
                <div
                  className="hidden lg:flex lg:items-center lg:absolute lg:top-1/2 lg:-translate-y-1/2 lg:left-[calc(100%+0.5rem)] text-indigo-500 dark:text-indigo-400"
                  aria-hidden="true"
                >
                  <TI.ArrowBadgeRight className="tabler-icon w-12 h-12" />
                </div>
                {/* QR card: in flow on mobile (full width, max-w-md);
                    absolutely positioned on lg+ at form-right + arrow
                    + gaps, vertically centred via top:50% +
                    translate(-50%). */}
                <div className="w-full max-w-md lg:absolute lg:top-1/2 lg:-translate-y-1/2 lg:left-[calc(100%+4rem)] lg:w-72 lg:max-w-none">
                  {sidePanel}
                </div>
              </>
            )}
          </div>

          {/* Trailing rows — below the cards, aligned with the form
              card on lg+. mobile keeps the centred layout via
              mx-auto; on lg+ the rows snap to the left of the
              wider wrapper (lg:mx-0) so they sit directly under the
              form card instead of between the two cards. */}
          <div className="w-full max-w-md mx-auto lg:mx-0">
            <div className="mt-6 text-center">
              <button
                onClick={onToggleDark}
                className={`inline-flex items-center gap-2 text-sm ${dark ? "text-gray-300" : "text-gray-700"} hover:underline ${hasCustomBg ? "glass-card rounded-full px-4 py-1.5 shadow-sm" : ""}`}
                data-tooltip={t("toggleDarkMode")}
              >
                {dark ? <Moon /> : <Sun />} {t("toggleTheme")}
              </button>
            </div>
            {(loginSlogan || t("loginSlogan")) && (
              <div className="mt-4 text-center">
                <span className="glass-card inline-block rounded-full px-4 py-1.5 text-sm text-gray-600 dark:text-gray-300 shadow-sm">
                  {loginSlogan || t("loginSlogan")}
                </span>
              </div>
            )}
            {window.AndroidTheme && (
              <div className="mt-4 text-center">
                <button
                  className="text-xs text-indigo-600 hover:underline"
                  onClick={() => window.AndroidTheme.changeServer()}
                >{t("changeServer")}</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-gray-400 dark:text-gray-600 z-10 select-none pb-4 pt-2 relative">
        <span className={hasCustomBg ? "inline-block rounded-full px-3 py-1 bg-black/20 backdrop-blur-sm" : ""}>
          Open source project · Originally by{" "}
          <a href="https://github.com/nikunjsingh93" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 dark:hover:text-gray-400 transition-colors">nikunjsingh93</a>
          {" · "}maintained and expanded by{" "}
          <a href="https://github.com/Victor-root/glasskeep-enhanced" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 dark:hover:text-gray-400 transition-colors">Victor-root</a>
        </span>
      </p>
    </div>
  );
}
