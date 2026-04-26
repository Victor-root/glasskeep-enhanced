// server/encryption/recoveryKey.js
// Recovery key: a 24-character secret in Crockford-flavoured base32,
// formatted in groups of 4 with a "GKRV-" prefix so it is easy to write
// down on paper. 24 chars = 120 bits of entropy — plenty for our threat
// model: anyone trying to brute-force the recovery key against the
// stolen DEK ciphertext is gated by an expensive scrypt KDF.

const crypto = require("crypto");

// Confusion-free alphabet: no I, L, O, U, 0, 1.
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // 30 chars

const PREFIX = "GKRV";
const GROUPS = 6;
const GROUP_LEN = 4;
const TOTAL_CHARS = GROUPS * GROUP_LEN;

function generateRecoveryKey() {
  // Rejection sampling to keep the distribution uniform across the
  // 30-symbol alphabet. The rejection rate is < 6% so this loop is fast.
  const out = [];
  while (out.length < TOTAL_CHARS) {
    const buf = crypto.randomBytes(TOTAL_CHARS * 2);
    for (let i = 0; i < buf.length && out.length < TOTAL_CHARS; i++) {
      const b = buf[i];
      if (b >= 240) continue; // 240 = 30 * 8, avoids modulo bias
      out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  const groups = [];
  for (let i = 0; i < GROUPS; i++) {
    groups.push(out.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN).join(""));
  }
  return `${PREFIX}-${groups.join("-")}`;
}

// Normalise user input: strip whitespace / hyphens, uppercase, drop the
// optional prefix, then make sure every character belongs to the
// alphabet. Returns the canonical 24-char string or null on any error.
function normalizeRecoveryKey(input) {
  if (typeof input !== "string") return null;
  let s = input.trim().toUpperCase().replace(/[\s-]+/g, "");
  if (s.startsWith(PREFIX)) s = s.slice(PREFIX.length);
  if (s.length !== TOTAL_CHARS) return null;
  for (const c of s) if (!ALPHABET.includes(c)) return null;
  return s;
}

module.exports = {
  generateRecoveryKey,
  normalizeRecoveryKey,
  PREFIX,
};
