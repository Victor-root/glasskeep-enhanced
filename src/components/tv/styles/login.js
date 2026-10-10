// TV mode: empty states, buttons and the login surface.
// Part of the TV stylesheet, assembled in order by ../tvStyles.js.

export const tvLoginCSS = `
/* Empty / login */
html[data-tv="1"] .tv-empty {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 50px;
  text-align: center;
  color: #cbd5e1;
}
html[data-tv="1"] .tv-empty__title {
  font-size: 22px;
  font-weight: 700;
  background: linear-gradient(90deg, #c4b5fd, #f9a8d4);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
html[data-tv="1"] .tv-empty__hint {
  font-size: 13px;
  opacity: 0.7;
  max-width: 520px;
}

/* Buttons */
html[data-tv="1"] .tv-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 9px 16px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #e5e7eb;
  font-size: 12px;
  font-weight: 600;
}
html[data-tv="1"] .tv-btn--primary {
  background: linear-gradient(90deg, #6366f1, #7c3aed);
  border-color: transparent;
  color: #ffffff;
}

/* Login surface */
html[data-tv="1"] .tv-login {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4vh 4vw;
  /* Removed the global gap — every element now uses tight explicit
     margins so "GlassKeep TV" sits flush under the logo instead of
     hovering 30-200px away. */
  gap: 0;
}
html[data-tv="1"] .tv-login__card {
  width: 100%;
  max-width: 520px;
  background: rgba(15, 17, 25, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  padding: 28px 30px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
html[data-tv="1"] .tv-login__title {
  font-size: 24px;
  font-weight: 800;
  background: linear-gradient(90deg, #c4b5fd, #f9a8d4);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
/* Big rounded logo above the login card, matching mobile AuthShell. */
html[data-tv="1"] .tv-login__logo {
  width: 84px;
  height: 84px;
  border-radius: 20px;
  box-shadow: 0 12px 28px -10px rgba(0, 0, 0, 0.55);
  /* No bottom margin — the brand title's own padding-top puts it
     flush under the logo. */
  margin: 0 auto;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}
/* Brand title shown OUTSIDE the card, right under the logo —
   "GlassKeep TV" in the indigo→pink gradient, like mobile AuthShell. */
html[data-tv="1"] .tv-login__brand {
  text-align: center;
  font-size: 26px;
  font-weight: 800;
  line-height: 1.1;
  padding-top: 10px;
  background: linear-gradient(90deg, #c4b5fd, #f9a8d4);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
html[data-tv="1"] .tv-login__subtitle {
  text-align: center;
  font-size: 13px;
  color: #9ca3af;
  margin: 6px 0 18px;
}
html[data-tv="1"][data-tv-theme="light"] .tv-login__subtitle { color: #6b7280; }
/* Glass pill that holds the server's loginSlogan (fetched live from
   /api/admin/login-slogan, falls back to t("loginSlogan")). Sits
   under the card. block + width:fit-content reliably centers itself
   inside the flex column even with auto margins disabled. */
html[data-tv="1"] .tv-login__slogan {
  display: block;
  width: fit-content;
  max-width: 90%;
  margin: 18px auto 0;
  padding: 8px 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #d1d5db;
  font-size: 13px;
  text-align: center;
}
html[data-tv="1"][data-tv-theme="light"] .tv-login__slogan {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
  color: #374151;
}
html[data-tv="1"] .tv-login__row { display: flex; flex-direction: column; gap: 4px; }
html[data-tv="1"] .tv-login__label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #a78bfa; }
html[data-tv="1"] .tv-login__input {
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9px;
  padding: 11px 14px;
  font-size: 15px;
  color: #f9fafb;
  outline: none;
}
html[data-tv="1"] .tv-login__input:focus { border-color: #a78bfa; box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.4); }
html[data-tv="1"] .tv-login__submit { padding: 12px; font-size: 14px; }
html[data-tv="1"] .tv-login__error {
  color: #fca5a5;
  background: rgba(220, 38, 38, 0.12);
  border: 1px solid rgba(220, 38, 38, 0.3);
  padding: 7px 11px;
  border-radius: 7px;
  font-size: 12px;
}
html[data-tv="1"] .tv-detail,
html[data-tv="1"] .tv-screen { max-width: 100vw; max-height: 100vh; }
`;
