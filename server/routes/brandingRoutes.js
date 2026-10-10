// server/routes/brandingRoutes.js
//
// Public branding: the login page's name, logo and background, the PWA
// icon and manifest, and the two public admin settings the login screen
// reads (registration open, slogan).

const { loginBgUrl } = require("../services/appSettings");

function attachBrandingRoutes(app, deps) {
  const {
    adminSettings,
    getBrandingImagesRow,
    getLoginBgRow,
    getPwaIconRow,
  } = deps;

  // Public branding for the login page + app shell. Unauthenticated on
  // purpose: the login screen needs it before any token exists. Returns
  // empty/null when nothing is configured so the client falls back to the
  // bundled defaults. Express adds a content-based ETag automatically, so
  // repeat loads get a cheap 304 while the (possibly large) background
  // data URL is unchanged.
  app.get("/api/branding", (_req, res) => {
    const images = getBrandingImagesRow.get() || {};
    res.json({
      appName: adminSettings.appName || "",
      logo: images.custom_logo || null,
      // The (multi-MB) background is NOT inlined here anymore: clients load
      // it from the cacheable /login-bg endpoint instead, so this payload
      // stays small and the browser HTTP-caches the image across reloads.
      // The URL is versioned so a background change busts that cache. The
      // mean colour + BlurHash let the login page paint instantly.
      loginBackground: loginBgUrl(images),
      loginBackgroundColor: images.login_bg_color || null,
      loginBackgroundHash: images.login_bg_hash || null,
      loginBackgroundBlur: adminSettings.loginBackgroundBlur || 0,
      loginTheme: adminSettings.loginTheme || "glasskeep",
    });
  });

  // Custom PWA icon (square PNG) for the manifest. 404 when none is set so
  // the manifest falls back to the bundled icons. Public: the OS fetches
  // it when installing the PWA.
  app.get("/api/branding/pwa-icon", (_req, res) => {
    const dataUrl = getPwaIconRow.get()?.custom_logo_pwa;
    const m = /^data:image\/png;base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl || "");
    if (!m) return res.status(404).end();
    const buf = Buffer.from(m[1], "base64");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-cache");
    res.end(buf);
  });

  // Login background as a real (cacheable) image, decoded from the stored
  // data URL. 404 when none is set. Public: the login page fetches it before
  // any token exists. The URL is versioned (?v=) by the caller, so a long
  // immutable cache is safe: a new background gets a new URL.
  app.get("/api/branding/login-bg", (req, res) => {
    const dataUrl = getLoginBgRow.get()?.login_bg_image;
    const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl || "");
    if (!m) return res.status(404).end();
    const buf = Buffer.from(m[2], "base64");
    res.setHeader("Content-Type", `image/${m[1] === "jpg" ? "jpeg" : m[1]}`);
    // Immutable only when a version was supplied (cache-bustable); otherwise
    // revalidate so an unversioned hit can't pin a stale image forever.
    res.setHeader("Cache-Control", req.query.v ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate");
    res.end(buf);
  });

  // Dynamic web-app manifest so an installed PWA picks up the instance's
  // custom app name + logo. Registered before the static dist middleware so
  // it shadows the build-time manifest.webmanifest. Note: a PWA already
  // installed on a device won't refresh its name/icon until it's
  // reinstalled: this affects new installs.
  app.get("/manifest.webmanifest", (_req, res) => {
    const name = adminSettings.appName || "Glass Keep";
    const hasIcon = !!getPwaIconRow.get()?.custom_logo_pwa;
    const icons = hasIcon
      ? [
          { src: "/api/branding/pwa-icon", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/api/branding/pwa-icon", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/api/branding/pwa-icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ]
      : [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ];
    res.setHeader("Content-Type", "application/manifest+json");
    res.setHeader("Cache-Control", "no-cache");
    res.json({
      name,
      short_name: name,
      description: "A lightweight notes app with Markdown, images, and offline support.",
      theme_color: "#f0e8ff",
      background_color: "#f0e8ff",
      display: "standalone",
      display_override: ["standalone"],
      scope: "/",
      start_url: "/",
      orientation: "portrait-primary",
      icons,
    });
  });

  // Check if new account creation is allowed (public endpoint)
  app.get("/api/admin/allow-registration", (_req, res) => {
    res.json({ allowNewAccounts: adminSettings.allowNewAccounts });
  });

  // Public endpoint for login slogan
  app.get("/api/admin/login-slogan", (_req, res) => {
    res.json({ loginSlogan: adminSettings.loginSlogan });
  });
}

module.exports = { attachBrandingRoutes };
