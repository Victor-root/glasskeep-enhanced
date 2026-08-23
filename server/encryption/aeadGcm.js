// server/encryption/aeadGcm.js
//
// The one place AES-GCM is set up, for every use in the project: note
// bodies, per-user tags, the wrapped data key, the passkey wraps and the
// vault's self-check.
//
// WHY IT EXISTS. Each of those sites called crypto.createDecipheriv
// without saying how long the authentication tag is meant to be. That
// tag is what makes tampering detectable, and Node accepts anything from
// four bytes upward when nobody states a length. A four-byte tag is a
// one-in-four-billion guess instead of one in 2^128, which is the
// difference between "cannot be forged" and "can be forged by a patient
// script". The tag never arrives from the network here, only from the
// local database, so this was never exploitable; it was a guarantee the
// code believed it had and did not.
//
// Two other things are pinned while we are here. The initialisation
// vector has to be exactly twelve bytes: GCM accepts other lengths by
// hashing them down, which is a different construction from the one this
// data was written with. And the tag has to be exactly sixteen bytes on
// the way in, checked before the library sees it, so a truncated value
// is refused rather than interpreted.
//
// Three copies of these two functions existed, in instanceVault.js, in
// passkeyVault.js, and open-coded a third time inside passkeyRoutes.js
// under a comment saying it reused instanceVault's logic. Fixing a tag
// length in three places and a half is how one of them stays wrong.

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function assertLength(name, buf, expected) {
  if (!Buffer.isBuffer(buf) && !(buf instanceof Uint8Array)) {
    throw new Error(`${name} is missing`);
  }
  if (buf.length !== expected) {
    throw new Error(`${name} must be ${expected} bytes, got ${buf.length}`);
  }
}

/**
 * Encrypt with a fresh IV. Returns the three pieces the callers store
 * side by side in SQLite.
 * @param {Buffer} key 32 bytes
 * @param {Buffer|string} plaintext
 * @param {Buffer} [aad] additional data bound to the ciphertext
 */
function encrypt(key, plaintext, aad) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  if (aad) cipher.setAAD(aad);
  const ct = Buffer.concat([
    cipher.update(typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext),
    cipher.final(),
  ]);
  return { iv, ct, tag: cipher.getAuthTag() };
}

/**
 * Decrypt, refusing anything whose shape does not match what encrypt()
 * produces. Throws on a bad tag exactly as before.
 */
function decrypt(key, iv, ct, tag, aad) {
  assertLength("IV", iv, IV_LENGTH);
  assertLength("Auth tag", tag, TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

module.exports = { encrypt, decrypt, ALGORITHM, IV_LENGTH, TAG_LENGTH };
