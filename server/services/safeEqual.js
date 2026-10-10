// server/services/safeEqual.js
//
// Constant-time comparison of two secrets held as strings (a pairing
// nonce, a request signature, a digest). Anything that is not a string,
// or differs in length, is simply unequal.

const crypto = require("crypto");

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = { safeEqual };
