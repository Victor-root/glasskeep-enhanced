// server/routes/adminSettingsRoutes.js
//
// The admin panel's instance settings: registration, single sign-on,
// login page text and branding, passkey domain.

const webauthnRp = require("../services/webauthnRp");
const { SSO_POLICIES } = require("./oidcRoutes");
const { VALID_LOGIN_THEMES } = require("../services/appSettings");

// Branding upload guards. Images are accepted as base64 data URLs (the
// same convention as user avatars): the client rasterises + compresses
// before upload, so these caps are a server-side safety net rather than
// the primary limit. Only raster formats are allowed; SVG is rejected to
// avoid the script-injection surface that inline SVG carries.
const BRANDING_IMAGE_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+=*$/;
// Placeholder formats: a 6-digit hex colour and a BlurHash (base83, capped
// well above any 9×9-component hash). Both are tiny and client-supplied, so
// they're validated before storage and simply dropped if malformed.
const BRANDING_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const BRANDING_HASH_RE = /^[0-9A-Za-z#$%*+,\-.:;=?@[\]^_{|}~]{6,200}$/;
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // ~2 MB data URL (≈1.5 MB decoded)
const MAX_LOGIN_BG_BYTES = 4 * 1024 * 1024; // ~4 MB data URL (≈3 MB decoded)
const MAX_APP_NAME_LEN = 10;
const MAX_LOGIN_BLUR = 20; // px

function attachAdminSettingsRoutes(app, deps) {
  const {
    auth,
    adminOnly,
    broadcastToAdmins,
    adminSettings,
    upsertAppSettings,
    setCustomLogoStmt,
    setLoginBgStmt,
    setLoginBgMetaStmt,
    setPwaIconStmt,
    brandingSettingsPayload,
    passkeyDomainState,
  } = deps;

  // Get admin settings
  app.get("/api/admin/settings", auth, adminOnly, (req, res) => {
    res.json({ ...brandingSettingsPayload(), passkeyDomainState: passkeyDomainState(req) });
  });

  // Update admin settings
  app.patch("/api/admin/settings", auth, adminOnly, (req, res) => {
    const { allowNewAccounts, ssoAllowed, ssoPolicy, ssoAllowPrivateNetwork, loginSlogan, appName, loginBackgroundBlur, loginTheme, passkeyDomain, logo, logoPwa, loginBackground, loginBackgroundColor, loginBackgroundHash } = req.body || {};

    if (typeof allowNewAccounts === 'boolean') {
      adminSettings.allowNewAccounts = allowNewAccounts;
    }
    if (typeof ssoAllowed === 'boolean') {
      adminSettings.ssoAllowed = ssoAllowed;
    }
    if (SSO_POLICIES.has(ssoPolicy)) {
      adminSettings.ssoPolicy = ssoPolicy;
    }
    if (typeof ssoAllowPrivateNetwork === 'boolean') {
      adminSettings.ssoAllowPrivateNetwork = ssoAllowPrivateNetwork;
    }
    if (typeof loginSlogan === 'string') {
      adminSettings.loginSlogan = loginSlogan.slice(0, 200);
    }
    if (typeof appName === 'string') {
      adminSettings.appName = appName.trim().slice(0, MAX_APP_NAME_LEN);
    }
    if (typeof loginBackgroundBlur === 'number' && Number.isFinite(loginBackgroundBlur)) {
      adminSettings.loginBackgroundBlur = Math.max(0, Math.min(MAX_LOGIN_BLUR, Math.round(loginBackgroundBlur)));
    }
    if (typeof loginTheme === 'string' && VALID_LOGIN_THEMES.has(loginTheme)) {
      adminSettings.loginTheme = loginTheme;
    }

    // The passkey domain. An empty string clears it and falls back to the
    // rest of the resolution order; anything else has to be a bare host
    // name, refused rather than trimmed into shape so the admin sees what
    // they actually stored. An env var wins over this value, so setting it
    // from the panel while one is present would be a silent no-op: say so
    // instead.
    if (typeof passkeyDomain === 'string') {
      const wanted = passkeyDomain.trim().toLowerCase();
      if (wanted && !webauthnRp.isValidRpId(wanted)) {
        return res.status(400).json({ error: "Passkey domain must be a bare host name, like notes.example.com: no https://, no port, no path." });
      }
      if (wanted !== adminSettings.passkeyDomain
          && (process.env.WEBAUTHN_RP_ID || process.env.WEBAUTHN_ORIGIN)) {
        return res.status(409).json({ error: "The passkey domain is pinned by WEBAUTHN_RP_ID on this server and cannot be changed here." });
      }
      adminSettings.passkeyDomain = wanted;
      webauthnRp.setDeclaredRpId(wanted);
    }

    // Image fields use a tri-state contract: an explicit `null` clears the
    // stored image, a valid data URL replaces it, and `undefined` (the key
    // omitted) leaves the existing value untouched.
    if (logo === null) {
      setCustomLogoStmt.run(null);
      // Clearing the logo clears its derived PWA icon too.
      setPwaIconStmt.run(null);
    } else if (typeof logo === 'string' && logo) {
      if (!BRANDING_IMAGE_RE.test(logo)) {
        return res.status(400).json({ error: "Logo must be a PNG, JPEG or WebP image data URL." });
      }
      if (logo.length > MAX_LOGO_BYTES) {
        return res.status(413).json({ error: "Logo image is too large." });
      }
      setCustomLogoStmt.run(logo);
    }

    // Square PWA icon derived from the logo (client-generated PNG). Tied to
    // the logo: sent alongside it, cleared with it (handled above).
    if (typeof logoPwa === 'string' && logoPwa) {
      if (!BRANDING_IMAGE_RE.test(logoPwa)) {
        return res.status(400).json({ error: "PWA icon must be a PNG, JPEG or WebP image data URL." });
      }
      if (logoPwa.length > MAX_LOGO_BYTES) {
        return res.status(413).json({ error: "PWA icon image is too large." });
      }
      setPwaIconStmt.run(logoPwa);
    }

    if (loginBackground === null) {
      setLoginBgStmt.run(null);
      // Clearing the image clears its derived placeholders + version too.
      setLoginBgMetaStmt.run(null, null, null);
    } else if (typeof loginBackground === 'string' && loginBackground) {
      if (!BRANDING_IMAGE_RE.test(loginBackground)) {
        return res.status(400).json({ error: "Background must be a PNG, JPEG or WebP image data URL." });
      }
      if (loginBackground.length > MAX_LOGIN_BG_BYTES) {
        return res.status(413).json({ error: "Background image is too large." });
      }
      setLoginBgStmt.run(loginBackground);
      // Store the client-derived placeholders (best-effort: drop them if
      // malformed rather than failing the whole upload) and bump the
      // cache-buster so clients re-fetch the new image at /login-bg.
      const color = BRANDING_COLOR_RE.test(loginBackgroundColor || "") ? loginBackgroundColor : null;
      const hash = BRANDING_HASH_RE.test(loginBackgroundHash || "") ? loginBackgroundHash : null;
      setLoginBgMetaStmt.run(color, hash, Date.now().toString(36));
    }

    upsertAppSettings.run(
      adminSettings.allowNewAccounts ? 1 : 0,
      adminSettings.loginSlogan,
      adminSettings.appName,
      adminSettings.loginBackgroundBlur,
      adminSettings.loginTheme,
      adminSettings.passkeyDomain,
      adminSettings.ssoAllowed ? 1 : 0,
      adminSettings.ssoPolicy,
      adminSettings.ssoAllowPrivateNetwork ? 1 : 0,
    );
    // Live-sync the scalar settings to every other admin so their
    // AdminPanel toggles / slogan / app name / blur reflect the change
    // without a reload. The image data URLs are deliberately NOT broadcast
    // (they can be megabytes): admins re-pull them via GET /admin/settings
    // and the live app reads them from GET /api/branding.
    broadcastToAdmins({
      type: "admin_settings_updated",
      settings: { ...adminSettings },
    });
    res.json({ ...brandingSettingsPayload(), passkeyDomainState: passkeyDomainState(req) });
  });
}

module.exports = { attachAdminSettingsRoutes };
