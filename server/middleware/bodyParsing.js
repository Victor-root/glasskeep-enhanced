// server/middleware/bodyParsing.js
//
// JSON and form body parsing for the whole API, and the JSON answer
// given when a request body cannot be read.

const express = require("express");

function attachBodyParsing(app) {
  // `verify` stashes the raw request body, but ONLY for the
  // server-to-server federation endpoints, which HMAC-sign the exact
  // bytes they sent. Capturing it everywhere would needlessly hold a copy
  // of every (up to 160 MB) upload; federation payloads are tiny.
  app.use(
    express.json({
      limit: "160mb",
      verify: (req, _res, buf) => {
        if (req.url && req.url.startsWith("/api/federation/")) {
          req.rawBody = buf.toString("utf8");
        }
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: "160mb" }));
  // Express 5 leaves req.body undefined on a request without a body; the
  // handlers read it as an object, as Express 4 guaranteed.
  app.use((req, _res, next) => {
    if (req.body === undefined) req.body = {};
    next();
  });

  // Un corps illisible doit répondre comme le reste de l'API, en JSON.
  // Sans ce garde-fou, Express renvoie sa propre page HTML: un fichier de
  // sauvegarde tronqué donnait à l'utilisateur un message inexploitable,
  // et le client, qui ne sait lire que du JSON, n'avait plus rien à
  // afficher que « une erreur est survenue ».
  app.use((err, req, res, next) => {
    if (!err) return next();
    if (err.type === "entity.too.large") {
      return res.status(413).json({ error: "Request body is too large." });
    }
    if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
      return res.status(400).json({ error: "Request body is not valid JSON." });
    }
    return next(err);
  });
}

module.exports = { attachBodyParsing };
