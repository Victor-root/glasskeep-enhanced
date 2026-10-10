// server/middleware/securityHeaders.js
//
// The Content-Security-Policy and X-Frame-Options headers sent with
// every response.

// Two jobs in one header.
//
// FRAMING. Nothing in GlassKeep is ever meant to be embedded in another
// page. Without frame-ancestors a third-party site can load the
// interface in an invisible frame and steer a signed-in admin into
// clicking a one-shot action (accepting a federation pairing, say)
// without them seeing what they clicked. X-Frame-Options says the same
// thing for older browsers.
//
// WHERE SUB-RESOURCES MAY COME FROM. A note carries styling, and styling
// can fetch: `background-image: url(https://…)` in a shared note makes
// the reader's browser call the author's server, handing over their IP
// address and the moment they opened it. The sanitizer now refuses that
// declaration outright (see src/utils/safeStyle.js) and this is the
// second lock: even a declaration that slipped through has nowhere to
// point. Everything the app genuinely loads is either its own origin,
// or inline data the user themselves stored: avatars, images and audio
// live in the database as data: URLs, and some are handed to the page
// as blob: URLs.
//
// script-src keeps 'unsafe-inline' and it is worth being plain about
// why: index.html carries bootstrap scripts (dark mode before first
// paint, among others) and the server injects one more per request for
// the login background. Nonces would break the offline service-worker
// copy, whose cached HTML would carry a stale one. This costs little
// here, because a note can never contribute a script in the first
// place: the sanitizer allows no script tag and no event handler.
// jsDelivr is listed because the ZIP export loads JSZip from there on
// demand (see src/utils/helpers.js).
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function attachSecurityHeaders(app) {
  app.use((_req, res, next) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", CSP);
    next();
  });
}

module.exports = { attachSecurityHeaders };
