// server/services/passkeyCeremony.js
//
// What every WebAuthn ceremony of the passkey routes (passkeyRoutes.js,
// passkeyUnlockRoutes.js) needs: the relying party and the origins a
// response may come from, the encodings @simplewebauthn/server expects,
// and the verification of an assertion against a stored credential.

const { verifyAuthenticationResponse } = require("@simplewebauthn/server");
const webauthnRp = require("./webauthnRp");
const passkeyVault = require("../encryption/passkeyVault");
const challengeStore = require("../encryption/challengeStore");
const assetLinks = require("../routes/assetLinksRoutes")._internals;

// ── RP config resolution ──────────────────────────────────────────────
//
// WebAuthn ties every credential to a "Relying Party ID", typically the
// bare hostname, e.g. "glasskeep.example.com". Deciding which one applies
// to a request is the whole of server/services/webauthnRp.js: read the
// reasoning there, it is the answer to F-11. In short, the domain never
// comes from a header the caller wrote.
//
// Origin follows the same source and keeps the protocol and port. A
// browser rejects any ceremony whose origin does not match the one the
// credential was created on, so the list has to contain the exact string
// the browser saw.

// Thrown when no trustworthy domain can be established. Every route
// turns it into a 500 pointing at where an admin fixes it.
class RpUnresolved extends Error {
  constructor(reason) {
    super("Passkeys are not configured for this domain. An administrator can "
      + "set the passkey domain in the admin panel.");
    this.name = "RpUnresolved";
    this.reason = reason;
  }
}

function resolveRpOrThrow(req) {
  const verdict = webauthnRp.resolveRp(req);
  if (!verdict.ok) throw new RpUnresolved(verdict.reason);
  return verdict;
}

function rpId(req) {
  return resolveRpOrThrow(req).rpId;
}

function expectedOrigin(req) {
  // Passkeys created via the Android Credential Manager (i.e. from
  // inside the native app) carry an origin of the form
  // `android:apk-key-hash:<URL-safe-base64(SHA-256(signing cert))>`
  // rather than the web URL, even when the WebView itself was loaded
  // from https://<domain>. @simplewebauthn/server accepts an array of
  // acceptable origins, so we hand it both the regular web origins AND
  // every Android origin derived from the same fingerprint list the
  // /.well-known/assetlinks.json route already publishes (official
  // APK + F-Droid + ANDROID_EXTRA_FINGERPRINTS).
  //
  // The fingerprint list is intentionally cached per request rather
  // than at module load: env vars can be changed (and the process
  // reloaded by systemd) between cold-starts, and we want the next
  // request to pick the new value up without an extra restart.
  return [...resolveRpOrThrow(req).origins, ...androidApkOrigins()];
}

/** Build all currently-authorised "android:apk-key-hash:..." origins
 *  from the fingerprints listed in /.well-known/assetlinks.json. The
 *  hash is exactly the SHA-256 of the DER-encoded signing certificate,
 *  re-encoded as URL-safe base64 without padding, the same Android
 *  uses when filling in clientDataJSON.origin from a native app. */
function androidApkOrigins() {
  return assetLinks.authorisedFingerprints().map((fp) =>
    `android:apk-key-hash:${Buffer.from(fp.replace(/:/g, ""), "hex").toString("base64url")}`);
}

// ── Encodings ─────────────────────────────────────────────────────────
function userIdToBuf(id) {
  // SimpleWebAuthn requires the user handle as a Uint8Array. We use
  // the integer user_id as the canonical identifier, encoded big-
  // endian on 8 bytes: stable, unique, and indistinguishable from
  // the user's email which we'd rather not put inside the credential.
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(id));
  return new Uint8Array(buf);
}

function bufToBase64Url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function base64UrlToBuf(s) {
  return Buffer.from(s, "base64url");
}

// The transports a stored credential was registered with, as the
// library takes them.
function transportsOf(passkey) {
  return passkey.transports ? JSON.parse(passkey.transports) : undefined;
}

// Verify an authentication response for one stored credential, always
// with user verification. Throws when the response cannot be checked;
// resolves with the library's verdict otherwise.
function verifyAssertion(req, response, challenge, passkey) {
  return verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: expectedOrigin(req),
    expectedRPID: rpId(req),
    credential: {
      id: passkey.credential_id,
      publicKey: new Uint8Array(passkey.public_key),
      counter: passkey.counter,
      transports: transportsOf(passkey),
    },
    requireUserVerification: true,
  });
}

// The second step of a ceremony run on one of the signed-in user's own
// passkeys (req.params.id): the challenge must be the one issued for
// `kind`, this user and this credential, and the assertion must verify.
// Answers the request (400 / 404) and resolves with null when it does
// not; resolves with { passkey, verification } otherwise. `label` names
// the ceremony in the log.
async function verifyOwnPasskeyAssertion(req, res, { db, response, challengeId, kind, label, log }) {
  const entry = challengeStore.consume(challengeId);
  if (!entry
      || entry.kind !== kind
      || entry.userId !== req.user.id
      || entry.meta?.credentialId !== req.params.id) {
    res.status(400).json({ error: "Challenge expired or invalid" });
    return null;
  }

  const passkey = passkeyVault.getPasskeyForUser(db, req.params.id, req.user.id);
  if (!passkey) {
    res.status(404).json({ error: "Passkey not found" });
    return null;
  }

  let verification;
  try {
    verification = await verifyAssertion(req, response, entry.challenge, passkey);
  } catch (e) {
    log.warn?.(`[passkey] ${label} verify failed: ${e.message}`);
    res.status(400).json({ error: "Verification failed" });
    return null;
  }
  if (!verification.verified) {
    res.status(400).json({ error: "Verification failed" });
    return null;
  }
  return { passkey, verification };
}

// The signed-in session handed back by a passkey sign-in, in lockstep
// with /api/login and the QR device-link poll. Any field that one flow
// returns and another omits ends up wiped from auth state when that flow
// is used (this is exactly how the missing avatar_url / language bugs
// surfaced via QR sign-in).
function sessionUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    is_admin: !!user.is_admin,
    avatar_url: user.avatar_url || null,
    language: user.language || null,
  };
}

module.exports = {
  RpUnresolved,
  rpId,
  expectedOrigin,
  userIdToBuf,
  bufToBase64Url,
  base64UrlToBuf,
  transportsOf,
  verifyAssertion,
  verifyOwnPasskeyAssertion,
  sessionUser,
};
