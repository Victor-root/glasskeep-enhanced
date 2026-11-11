// server/attachments/downloadLink.js
//
// Short-lived signed links to one download: an attachment, or the backup
// archive of a user's notes. A file is opened by the browser, or fetched by
// Android's DownloadManager, none of which can send the session's Bearer
// token, so the link carries its own proof. It only ever opens the subject
// it names, for that one user, for a few minutes, and its key is derived
// apart so it can never pass for a session token.

const crypto = require("crypto");
const { safeEqual } = require("../services/safeEqual");

const LINK_TTL_MS = 5 * 60 * 1000;

function createDownloadLinks(secret) {
  const key = crypto.createHash("sha256").update(`glasskeep|attachment-link|v1|${secret}`).digest();
  const sign = (body) => crypto.createHmac("sha256", key).update(body).digest("base64url");

  function issue({ subject, userId, tokenVersion, inline }) {
    const body = Buffer.from(JSON.stringify({
      a: subject,
      u: userId,
      v: tokenVersion ?? 0,
      i: inline ? 1 : 0,
      e: Date.now() + LINK_TTL_MS,
    })).toString("base64url");
    return `${body}.${sign(body)}`;
  }

  // The link's contents, or null when forged or expired.
  function verify(token, subject) {
    const [body, signature] = String(token || "").split(".");
    if (!body || !signature || !safeEqual(signature, sign(body))) return null;
    let claims;
    try {
      claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    if (claims.a !== subject || !(claims.e > Date.now())) return null;
    return { userId: claims.u, tokenVersion: claims.v, inline: claims.i === 1 };
  }

  return { issue, verify };
}

module.exports = { createDownloadLinks, LINK_TTL_MS };
