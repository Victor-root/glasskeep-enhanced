import React from "react";
import { Sun, Moon } from "../../icons/index.jsx";
import TI from "../../icons/editor/index.jsx";
import { t } from "../../i18n";

export default function AuthShell({ title, dark, onToggleDark, floatingCardsEnabled = true, loginSlogan, children, sidePanel }) {
  return (
    <div className="min-h-screen flex flex-col px-4 relative overflow-hidden">
      {/* Decorative floating note cards */}
      {floatingCardsEnabled && <div aria-hidden="true">
        <div className="login-deco-card" style={{"--rot":"-12deg","--dur":"7s","--delay":"0s",top:"8%",left:"6%",borderTop:"3px solid rgba(99,102,241,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(99,102,241,0.5)"}}/>
          <div className="deco-line" style={{width:"90%"}}/>
          <div className="deco-line" style={{width:"75%"}}/>
          <div className="deco-line" style={{width:"60%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"5deg","--dur":"9s","--delay":"-2s",top:"42%",left:"3%",borderTop:"3px solid rgba(168,85,247,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(168,85,247,0.5)"}}/>
          <div className="deco-line" style={{width:"85%"}}/>
          <div className="deco-line" style={{width:"55%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"8deg","--dur":"8s","--delay":"-4s",bottom:"10%",left:"9%",borderTop:"3px solid rgba(16,185,129,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(16,185,129,0.5)"}}/>
          <div className="deco-line" style={{width:"80%"}}/>
          <div className="deco-line" style={{width:"65%"}}/>
          <div className="deco-line" style={{width:"45%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"6deg","--dur":"10s","--delay":"-1s",top:"6%",right:"7%",borderTop:"3px solid rgba(245,158,11,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(245,158,11,0.5)"}}/>
          <div className="deco-line" style={{width:"88%"}}/>
          <div className="deco-line" style={{width:"70%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"-8deg","--dur":"7.5s","--delay":"-3s",top:"38%",right:"4%",borderTop:"3px solid rgba(236,72,153,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(236,72,153,0.5)"}}/>
          <div className="deco-line" style={{width:"90%"}}/>
          <div className="deco-line" style={{width:"60%"}}/>
          <div className="deco-line" style={{width:"78%"}}/>
        </div>
        <div className="login-deco-card" style={{"--rot":"-15deg","--dur":"11s","--delay":"-5s",bottom:"8%",right:"8%",borderTop:"3px solid rgba(20,184,166,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(20,184,166,0.5)"}}/>
          <div className="deco-line" style={{width:"75%"}}/>
          <div className="deco-line" style={{width:"50%"}}/>
        </div>
        {/* Extra cards — visible only on md+ screens to fill the gap */}
        <div className="login-deco-card hidden md:block" style={{"--rot":"10deg","--dur":"8.5s","--delay":"-1.5s",top:"18%",left:"22%",borderTop:"3px solid rgba(249,115,22,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(249,115,22,0.5)"}}/>
          <div className="deco-line" style={{width:"82%"}}/>
          <div className="deco-line" style={{width:"64%"}}/>
          <div className="deco-line" style={{width:"50%"}}/>
        </div>
        <div className="login-deco-card hidden md:block" style={{"--rot":"-6deg","--dur":"9.5s","--delay":"-6s",bottom:"20%",left:"20%",borderTop:"3px solid rgba(14,165,233,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(14,165,233,0.5)"}}/>
          <div className="deco-line" style={{width:"88%"}}/>
          <div className="deco-line" style={{width:"58%"}}/>
        </div>
        <div className="login-deco-card hidden md:block" style={{"--rot":"-9deg","--dur":"10.5s","--delay":"-2.5s",top:"14%",right:"20%",borderTop:"3px solid rgba(132,204,22,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(132,204,22,0.5)"}}/>
          <div className="deco-line" style={{width:"76%"}}/>
          <div className="deco-line" style={{width:"92%"}}/>
          <div className="deco-line" style={{width:"55%"}}/>
        </div>
        <div className="login-deco-card hidden md:block" style={{"--rot":"7deg","--dur":"8s","--delay":"-7s",bottom:"18%",right:"18%",borderTop:"3px solid rgba(244,63,94,0.7)"}}>
          <div className="deco-title" style={{background:"rgba(244,63,94,0.5)"}}/>
          <div className="deco-line" style={{width:"80%"}}/>
          <div className="deco-line" style={{width:"62%"}}/>
        </div>
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
          <div className="text-center mb-6 w-full max-w-md mx-auto lg:mx-0">
            <img
              src="/pwa-192.png"
              alt="Glass Keep"
              className="h-16 w-16 rounded-2xl shadow-lg mx-auto mb-4 select-none pointer-events-none"
              draggable="false"
            />
            <h1 className="text-3xl font-bold">Glass Keep</h1>
            <p className="text-gray-500 dark:text-gray-400">{title}</p>
          </div>

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
            <div className="glass-card rounded-xl p-6 shadow-lg w-full max-w-md">
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
                className={`inline-flex items-center gap-2 text-sm ${dark ? "text-gray-300" : "text-gray-700"} hover:underline`}
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
        Open source project &mdash; Originally based on Glass Keep by{" "}
        <a href="https://github.com/nikunjsingh93" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 dark:hover:text-gray-400 transition-colors">nikunjsingh93</a>
        {" · "}maintained and expanded by{" "}
        <a href="https://github.com/Victor-root/glasskeep-enhanced" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 dark:hover:text-gray-400 transition-colors">Victor-root</a>
      </p>
    </div>
  );
}
