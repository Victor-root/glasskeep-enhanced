// server/services/appSettings.js
//
// The instance-wide admin settings: the app_settings singleton row, its
// in-memory mirror, and the branding images stored next to it.

const webauthnRp = require("./webauthnRp");
const { SSO_POLICIES } = require("../routes/oidcRoutes");

const VALID_LOGIN_THEMES = new Set(["glasskeep", "emerald", "amber", "rosewood", "graphite", "blush"]);

// Public, cacheable URL for the login background, or null when none is set.
// Versioned (?v=) so changing the background busts the browser HTTP cache
// even though the path is constant. `row` is a getBrandingImagesRow result.
function loginBgUrl(row) {
  if (!row || !row.login_bg_image) return null;
  const v = row.login_bg_version || "1";
  return `/api/branding/login-bg?v=${encodeURIComponent(v)}`;
}

function createAppSettings({ db }) {
  // Admin settings: persisted in the `app_settings` singleton row. Kept
  // mirrored in this in-memory object so the hot read paths (login slogan
  // on every login page hit, allowNewAccounts on every signup attempt)
  // don't hit SQLite repeatedly. The mirror is updated on every PATCH so
  // it stays in sync.
  const getAppSettingsRow = db.prepare(`SELECT allow_new_accounts, login_slogan, custom_app_name, login_bg_blur, login_theme, webauthn_rp_id, sso_allowed, sso_policy, sso_allow_private FROM app_settings WHERE id = 1`);
  const upsertAppSettings = db.prepare(
    `INSERT INTO app_settings (id, allow_new_accounts, login_slogan, custom_app_name, login_bg_blur, login_theme, webauthn_rp_id, sso_allowed, sso_policy, sso_allow_private) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET allow_new_accounts=excluded.allow_new_accounts, login_slogan=excluded.login_slogan, custom_app_name=excluded.custom_app_name, login_bg_blur=excluded.login_bg_blur, login_theme=excluded.login_theme, webauthn_rp_id=excluded.webauthn_rp_id, sso_allowed=excluded.sso_allowed, sso_policy=excluded.sso_policy, sso_allow_private=excluded.sso_allow_private`,
  );
  // Branding images live in their own read/write statements so the
  // (potentially multi-MB) data URLs never get held in the in-memory
  // mirror, which is broadcast to admins on every settings change.
  const getBrandingImagesRow = db.prepare(`SELECT custom_logo, login_bg_image, login_bg_color, login_bg_hash, login_bg_version FROM app_settings WHERE id = 1`);
  const setCustomLogoStmt = db.prepare(`UPDATE app_settings SET custom_logo = ? WHERE id = 1`);
  const setLoginBgStmt = db.prepare(`UPDATE app_settings SET login_bg_image = ? WHERE id = 1`);
  // The login-background placeholders (mean colour + BlurHash) and the
  // cache-buster version are written together with the image: an explicit
  // background change always refreshes all three (or clears them on remove).
  const setLoginBgMetaStmt = db.prepare(`UPDATE app_settings SET login_bg_color = ?, login_bg_hash = ?, login_bg_version = ? WHERE id = 1`);
  // Raw login-background bytes for GET /api/branding/login-bg.
  const getLoginBgRow = db.prepare(`SELECT login_bg_image FROM app_settings WHERE id = 1`);
  // Square PWA icon (PNG data URL) derived from the custom logo.
  const getPwaIconRow = db.prepare(`SELECT custom_logo_pwa FROM app_settings WHERE id = 1`);
  const setPwaIconStmt = db.prepare(`UPDATE app_settings SET custom_logo_pwa = ? WHERE id = 1`);

  const adminSettings = (function loadAdminSettings() {
    const row = getAppSettingsRow.get();
    if (row) {
      return {
        allowNewAccounts: !!row.allow_new_accounts,
        loginSlogan: row.login_slogan || "",
        appName: row.custom_app_name || "",
        loginBackgroundBlur: row.login_bg_blur || 0,
        loginTheme: VALID_LOGIN_THEMES.has(row.login_theme) ? row.login_theme : "glasskeep",
        passkeyDomain: row.webauthn_rp_id || "",
        ssoAllowed: !!row.sso_allowed,
        ssoPolicy: SSO_POLICIES.has(row.sso_policy) ? row.sso_policy : "admin",
        ssoAllowPrivateNetwork: !!row.sso_allow_private,
      };
    }
    // Fresh install: seed the row from the env var default so subsequent
    // boots read the same value the admin sees in the panel.
    const seed = {
      allowNewAccounts: process.env.ALLOW_REGISTRATION === "true",
      loginSlogan: "",
      appName: "",
      loginBackgroundBlur: 0,
      loginTheme: "glasskeep",
      passkeyDomain: "",
      ssoAllowed: false,
      ssoPolicy: "admin",
      ssoAllowPrivateNetwork: false,
    };
    upsertAppSettings.run(seed.allowNewAccounts ? 1 : 0, seed.loginSlogan, seed.appName, seed.loginBackgroundBlur, seed.loginTheme, seed.passkeyDomain, 0, seed.ssoPolicy, 0);
    return seed;
  })();

  // Hand the stored domain to the resolver, which holds it for every
  // passkey ceremony. Re-pushed on every settings change by
  // adminSettingsRoutes.js. Said once
  // here rather than discovered when a passkey fails: the operator learns
  // which source their domain comes from, and what to do if none applies.
  webauthnRp.setDeclaredRpId(adminSettings.passkeyDomain);
  console.log(webauthnRp.describeConfig());

  // Merge the scalar mirror with the on-disk image columns into the full
  // settings shape returned to admins / the public branding endpoint.
  function brandingSettingsPayload() {
    const images = getBrandingImagesRow.get() || {};
    return {
      ...adminSettings,
      logo: images.custom_logo || null,
      loginBackground: images.login_bg_image || null,
      loginBackgroundColor: images.login_bg_color || null,
      loginBackgroundHash: images.login_bg_hash || null,
    };
  }

  // Where the passkey domain actually comes from for THIS request, so the
  // panel can say "nothing to do" instead of showing an empty field an
  // admin would fill in for no reason. `source` mirrors resolveRp: an env
  // var and a certificate are decided outside the panel, so the field is
  // read-only then; "local" means the address is on the local network and
  // needs no domain; "none" is the case that has to be fixed.
  function passkeyDomainState(req) {
    const verdict = webauthnRp.resolveRp(req);
    const lockedByEnv = !!(process.env.WEBAUTHN_RP_ID || process.env.WEBAUTHN_ORIGIN);
    return {
      declared: adminSettings.passkeyDomain,
      effective: verdict.ok ? verdict.rpId : "",
      source: verdict.ok ? verdict.source : "none",
      lockedByEnv,
      // What the admin's own browser reached us on. Offered as the value
      // to fill the field with: the admin is looking at the real domain in
      // their address bar, and confirming it is a decision only an admin
      // can make. It is a suggestion, never a source.
      suggested: webauthnRp.isValidRpId(req.hostname) ? String(req.hostname).toLowerCase() : "",
    };
  }

  return {
    adminSettings,
    upsertAppSettings,
    getBrandingImagesRow,
    setCustomLogoStmt,
    setLoginBgStmt,
    setLoginBgMetaStmt,
    getLoginBgRow,
    getPwaIconRow,
    setPwaIconStmt,
    brandingSettingsPayload,
    passkeyDomainState,
  };
}

module.exports = { createAppSettings, loginBgUrl, VALID_LOGIN_THEMES };
