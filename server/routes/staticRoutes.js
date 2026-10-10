// server/routes/staticRoutes.js
//
// Production only: the built front-end (dist/), with index.html rendered
// per request and the SPA fallback. Attached last.

const path = require("path");
const fs = require("fs");
const express = require("express");
const { loginBgUrl } = require("../services/appSettings");

function attachStaticRoutes(app, deps) {
  const { getBrandingImagesRow } = deps;

  const dist = path.join(__dirname, "..", "..", "dist");
  const INDEX_CACHE_CONTROL = "public, max-age=0, must-revalidate, stale-while-revalidate=86400, stale-if-error=604800";

  // The built index.html is read once and cached; per request we inject a
  // tiny global with the login background's placeholder (mean colour +
  // BlurHash + versioned image URL). This is what lets the login page paint
  // instantly on a cold/incognito load: no client cache or service worker
  // is involved, exactly like a server-rendered page. The payload is a few
  // bytes (NOT the multi-MB image), so it doesn't bloat the HTML or the PWA
  // precache. A service-worker-served (offline) index.html skips this and
  // falls back to the localStorage branding cache instead.
  let indexTemplate = null;
  function renderIndexHtml() {
    if (indexTemplate == null) {
      try { indexTemplate = fs.readFileSync(path.join(dist, "index.html"), "utf8"); }
      catch { indexTemplate = ""; }
    }
    const images = getBrandingImagesRow.get() || {};
    let inject = "";
    if (images.login_bg_image) {
      // base83 (hash) and hex (colour) can't contain "<" or "/", so the
      // JSON can't break out of the <script>: values are also validated
      // on write. The URL is a fixed path plus a base36 version token.
      const data = JSON.stringify({
        url: loginBgUrl(images),
        color: images.login_bg_color || null,
        hash: images.login_bg_hash || null,
      });
      inject = `<script>window.__GK_LOGIN_BG__=${data};</script>`;
    }
    return indexTemplate.replace("<head>", "<head>" + inject);
  }
  function sendIndex(res) {
    res.setHeader("Cache-Control", INDEX_CACHE_CONTROL);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderIndexHtml());
  }

  // index.html (root + explicit path) is always injected, never served raw.
  app.get(["/", "/index.html"], (_req, res) => sendIndex(res));

  // Hashed assets (JS/CSS bundles, images): content-addressed so they can
  // be cached for a very long time. `index: false` so this never serves the
  // un-injected index.html for "/"; that's handled above + the SPA fallback.
  app.use(express.static(dist, {
    index: false,
    setHeaders(res, filePath) {
      if (/\.[0-9a-f]{8,}\.(js|css|woff2?|png|svg|ico|webp)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", INDEX_CACHE_CONTROL);
      }
    },
  }));

  app.get("/{*path}", (_req, res) => sendIndex(res));
}

module.exports = { attachStaticRoutes };
