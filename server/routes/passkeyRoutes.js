// server/routes/passkeyRoutes.js
//
// HTTP surface for WebAuthn passkeys. Two distinct flavours:
//
//   1. Passkey LOGIN  — any user, replaces password for a session.
//      No PRF needed; the passkey just authenticates the user and
//      we issue the same JWT signToken() emits for password login.
//
//   2. Passkey instance-UNLOCK — admin-only, requires a PRF-capable
//      authenticator. The PRF output (32 bytes from the credential)
//      is sent over HTTPS to the server, used as IKM for HKDF, then
//      immediately zeroed. The derived KEK wraps/unwraps the same
//      DEK the passphrase + recovery-key flows produce.
//
// The two flavours share the user_passkeys table: a credential
// registered for login can later be promoted to "can unlock" if the
// authenticator advertised PRF support during its registration
// ceremony.

const crypto = require("crypto");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

const passkeyVault = require("../encryption/passkeyVault");
const challengeStore = require("../encryption/challengeStore");
const vault = require("../encryption/instanceVault");
const runtime = require("../encryption/runtimeUnlockState");

// ── RP config resolution ──────────────────────────────────────────────
//
// WebAuthn ties every credential to a "Relying Party ID" — typically
// the bare hostname, e.g. "glasskeep.example.com". We resolve it in
// this order:
//
//   1. WEBAUTHN_RP_ID env var (operator override; required when the
//      app sits behind a domain that differs from the Node Host header
//      e.g. mixed Tailscale + public DNS setups).
//   2. The request's Host header (or X-Forwarded-Host when trust proxy
//      is enabled), with port stripped.
//   3. "localhost" as a last resort so dev still works.
//
// Origin follows the same logic but keeps the protocol + port. Modern
// browsers reject any registration whose origin doesn't match what
// the credential was created on — we MUST send the exact same string
// the browser sees, which is why we pull it from the request rather
// than hard-coding.
function operatorTrustsProxy() {
  return process.env.TRUST_PROXY === "true"
    || process.env.HTTPS_ENABLED === "false";
}

function resolveHost(req) {
  if (operatorTrustsProxy()) {
    const xfh = req.headers["x-forwarded-host"];
    if (xfh) return String(xfh).split(",")[0].trim();
  }
  return req.headers.host || "localhost";
}

function resolveProto(req) {
  if (req.secure) return "https";
  if (operatorTrustsProxy()) {
    const xfp = req.headers["x-forwarded-proto"];
    if (xfp) return String(xfp).split(",")[0].trim();
    // When the operator declared a proxy, default to https for origin
    // construction — public passkey deployments are virtually always
    // behind TLS.
    return "https";
  }
  return req.protocol || "http";
}

function rpId(req) {
  if (process.env.WEBAUTHN_RP_ID) return process.env.WEBAUTHN_RP_ID;
  const host = resolveHost(req);
  // Strip port from "host:8080" → "host"; an IPv6 literal "[::1]:80" →
  // "[::1]" is left as-is (valid RP ID for IP-only setups).
  return host.replace(/:\d+$/, "");
}

function expectedOrigin(req) {
  if (process.env.WEBAUTHN_ORIGIN) return process.env.WEBAUTHN_ORIGIN;
  return `${resolveProto(req)}://${resolveHost(req)}`;
}

// ── Helpers ───────────────────────────────────────────────────────────
function userIdToBuf(id) {
  // SimpleWebAuthn requires the user handle as a Uint8Array. We use
  // the integer user_id as the canonical identifier, encoded big-
  // endian on 8 bytes — stable, unique, and indistinguishable from
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

// Localhost test for the unlock-by-passkey routes (which run with no
// JWT and thus need a transport-security gate analogous to the
// passphrase route's).
function getClientIp(req) {
  return req.ip || req.connection?.remoteAddress || "0.0.0.0";
}
function isLocalhost(req) {
  const ip = getClientIp(req);
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}
function isSecureRequest(req) {
  if (req.secure === true) return true;
  if (operatorTrustsProxy()) return true;
  return false;
}
function transportOk(req) {
  return isSecureRequest(req) || isLocalhost(req);
}

// Rate-limiting helpers for the unauthenticated unlock routes (mirrors
// the pattern used in unlockRoutes.js).
function clientIdentifier(req) {
  return isLocalhost(req) ? "localhost" : getClientIp(req);
}

function setRetryAfter(res, ms) {
  if (ms > 0) res.setHeader("Retry-After", String(Math.ceil(ms / 1000)));
}

async function paceFailure(ms) {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

// ── Route attachment ──────────────────────────────────────────────────
function attachPasskeyRoutes(app, deps) {
  const { db, auth, adminOnly, signToken, getUserById, log = console } = deps;

  // ====================================================================
  //   USER PASSKEY MANAGEMENT
  // ====================================================================

  // List the caller's own passkeys.
  app.get("/api/passkeys", auth, (req, res) => {
    const list = passkeyVault.listPasskeysForUser(db, req.user.id);
    res.json({
      passkeys: list.map((p) => ({
        credentialId: p.credential_id,
        name: p.name || null,
        deviceType: p.device_type || null,
        backedUp: !!p.backed_up,
        prfSupported: !!p.prf_supported,
        canUnlockInstance: !!p.can_unlock_instance,
        createdAt: p.created_at,
        lastUsedAt: p.last_used_at,
      })),
    });
  });

  // Begin registration: returns SimpleWebAuthn options + a challenge id
  // that the verify route consumes. The challenge itself sits in the
  // server-side challengeStore; we ship its id (not the value) to the
  // client so a forged response can't reuse a stolen challenge from a
  // different ceremony.
  app.post("/api/passkeys/register/options", auth, async (req, res) => {
    try {
      const userRow = getUserById.get(req.user.id);
      if (!userRow) return res.status(404).json({ error: "User not found" });

      const existing = passkeyVault.listPasskeysForUser(db, req.user.id);

      const options = await generateRegistrationOptions({
        rpName: "GlassKeep",
        rpID: rpId(req),
        userID: userIdToBuf(req.user.id),
        userName: userRow.email,
        userDisplayName: userRow.name || userRow.email,
        attestationType: "none",
        excludeCredentials: existing.map((p) => ({
          id: p.credential_id,
          transports: p.transports ? JSON.parse(p.transports) : undefined,
        })),
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
        // PRF: probe support during registration. The authenticator
        // sets clientExtensionResults.prf.enabled = true if it can
        // service PRF; that's the gate for promoting this credential
        // to instance-unlock later.
        extensions: { prf: {} },
      });

      const challengeId = challengeStore.issue({
        challenge: options.challenge,
        kind: "register",
        userId: req.user.id,
      });

      res.json({ options, challengeId });
    } catch (e) {
      log.error?.(`[passkey] register/options failed: ${e.message}`);
      res.status(500).json({ error: "Failed to start passkey registration" });
    }
  });

  // Verify the attestation response. Stores the credential and reports
  // back whether PRF was advertised so the UI can decide whether to
  // expose the "use as instance unlock" toggle.
  app.post("/api/passkeys/register/verify", auth, async (req, res) => {
    const { response, challengeId, name } = req.body || {};
    if (!response || !challengeId) {
      return res.status(400).json({ error: "Missing fields" });
    }
    const entry = challengeStore.consume(challengeId);
    if (!entry || entry.kind !== "register" || entry.userId !== req.user.id) {
      return res.status(400).json({ error: "Challenge expired or invalid" });
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: entry.challenge,
        expectedOrigin: expectedOrigin(req),
        expectedRPID: rpId(req),
        requireUserVerification: true,
      });
    } catch (e) {
      log.warn?.(`[passkey] register verify failed: ${e.message}`);
      return res.status(400).json({ error: "Verification failed" });
    }
    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: "Verification failed" });
    }

    const info = verification.registrationInfo;
    // SimpleWebAuthn v13 nests the credential under .credential and
    // returns id (base64url string), publicKey (Uint8Array), counter.
    const cred = info.credential;
    const credentialId = cred.id;
    const publicKey = Buffer.from(cred.publicKey);

    // PRF capability: the extension result lives on the response
    // wrapper SimpleWebAuthn passes through.
    const ext = response.clientExtensionResults || {};
    const prfSupported = !!(ext.prf && ext.prf.enabled);

    try {
      passkeyVault.insertPasskey(db, {
        credential_id: credentialId,
        user_id: req.user.id,
        public_key: publicKey,
        counter: cred.counter || 0,
        transports: response.response?.transports
          ? JSON.stringify(response.response.transports)
          : null,
        name: typeof name === "string" && name.trim() ? name.trim().slice(0, 64) : null,
        device_type: info.credentialDeviceType || null,
        backed_up: info.credentialBackedUp ? 1 : 0,
        prf_supported: prfSupported ? 1 : 0,
        created_at: new Date().toISOString(),
        last_used_at: null,
      });
    } catch (e) {
      log.error?.(`[passkey] insert failed: ${e.message}`);
      return res.status(500).json({ error: "Could not save passkey" });
    }

    log.info?.(`[passkey] registered for user=${req.user.id} prf=${prfSupported}`);
    res.json({
      ok: true,
      credentialId,
      prfSupported,
      backedUp: !!info.credentialBackedUp,
    });
  });

  // Rename / delete are pedestrian. Both scope by user_id so even an
  // attacker who guesses a credential_id can't touch someone else's.
  app.patch("/api/passkeys/:id", auth, (req, res) => {
    const name = String(req.body?.name || "").trim().slice(0, 64);
    if (!name) return res.status(400).json({ error: "Name required" });
    const r = passkeyVault.renamePasskey(db, req.params.id, req.user.id, name);
    if (r.changes === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });

  app.delete("/api/passkeys/:id", auth, (req, res) => {
    const r = passkeyVault.deletePasskey(db, req.params.id, req.user.id);
    if (r.changes === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });

  // ====================================================================
  //   PASSKEY LOGIN (no auth)
  // ====================================================================
  //
  // Usernameless flow: we issue an authentication challenge with NO
  // allowCredentials list, and the authenticator picks which discoverable
  // credential to use. The verify endpoint then looks up the credential
  // by the id the response carries and resolves the user from there.

  app.post("/api/passkeys/login/options", async (req, res) => {
    try {
      const options = await generateAuthenticationOptions({
        rpID: rpId(req),
        userVerification: "required",
        allowCredentials: [],
      });
      const challengeId = challengeStore.issue({
        challenge: options.challenge,
        kind: "login",
      });
      res.json({ options, challengeId });
    } catch (e) {
      log.error?.(`[passkey] login/options failed: ${e.message}`);
      res.status(500).json({ error: "Failed to start passkey login" });
    }
  });

  app.post("/api/passkeys/login/verify", async (req, res) => {
    const { response, challengeId } = req.body || {};
    if (!response || !challengeId) return res.status(400).json({ error: "Missing fields" });
    const entry = challengeStore.consume(challengeId);
    if (!entry || entry.kind !== "login") {
      return res.status(400).json({ error: "Challenge expired or invalid" });
    }

    const credentialId = response.id;
    const stored = passkeyVault.getPasskey(db, credentialId);
    if (!stored) return res.status(401).json({ error: "Unknown credential" });
    const user = getUserById.get(stored.user_id);
    if (!user) return res.status(401).json({ error: "User no longer exists" });

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: entry.challenge,
        expectedOrigin: expectedOrigin(req),
        expectedRPID: rpId(req),
        credential: {
          id: stored.credential_id,
          publicKey: new Uint8Array(stored.public_key),
          counter: stored.counter,
          transports: stored.transports ? JSON.parse(stored.transports) : undefined,
        },
        requireUserVerification: true,
      });
    } catch (e) {
      log.warn?.(`[passkey] login verify failed: ${e.message}`);
      return res.status(401).json({ error: "Verification failed" });
    }
    if (!verification.verified) return res.status(401).json({ error: "Verification failed" });

    passkeyVault.updateCounter(db, credentialId, verification.authenticationInfo.newCounter);

    const token = signToken(user);
    log.info?.(`[passkey] login OK user=${user.id}`);
    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_admin: !!user.is_admin,
        avatar_url: user.avatar_url || null,
      },
      must_change_password: !!user.must_change_password,
    });
  });

  // ====================================================================
  //   PROMOTE PASSKEY TO INSTANCE UNLOCK (admin, instance unlocked)
  // ====================================================================

  // Step 1: server emits an authentication ceremony with a PRF eval
  // request. The browser will return the PRF output alongside the
  // assertion; we use that PRF output to build the wrap.
  app.post("/api/passkeys/:id/instance-unlock/options", auth, adminOnly, async (req, res) => {
    if (!runtime.isEnabled()) {
      return res.status(409).json({ error: "Encryption is not enabled" });
    }
    if (!runtime.isUnlocked()) {
      return res.status(423).json({ error: "Unlock the instance first" });
    }
    const passkey = passkeyVault.getPasskeyForUser(db, req.params.id, req.user.id);
    if (!passkey) return res.status(404).json({ error: "Passkey not found" });
    if (!passkey.prf_supported) {
      return res.status(400).json({ error: "Passkey does not support PRF" });
    }

    try {
      const salt = passkeyVault.ensurePrfSalt(db);
      const options = await generateAuthenticationOptions({
        rpID: rpId(req),
        userVerification: "required",
        allowCredentials: [{
          id: passkey.credential_id,
          transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
        }],
        extensions: {
          // @simplewebauthn/server passes extensions through as-is into
          // the JSON options object. Uint8Array serialises as {"0":…}
          // which @simplewebauthn/browser cannot decode to an ArrayBuffer.
          // Passing a base64url string is what the library expects; the
          // browser SDK converts it back to Uint8Array before calling
          // navigator.credentials.get().
          prf: { eval: { first: bufToBase64Url(salt) } },
        },
      });
      const challengeId = challengeStore.issue({
        challenge: options.challenge,
        kind: "promote-unlock",
        userId: req.user.id,
        meta: { credentialId: passkey.credential_id },
      });
      res.json({ options, challengeId });
    } catch (e) {
      log.error?.(`[passkey] promote/options failed: ${e.message}`);
      res.status(500).json({ error: "Failed to start promotion ceremony" });
    }
  });

  // Step 2: the browser came back with both the assertion AND the PRF
  // output. Verify the assertion, derive the KEK, wrap the live DEK,
  // store the wrap. The PRF output is zeroed before returning.
  app.post("/api/passkeys/:id/instance-unlock/verify", auth, adminOnly, async (req, res) => {
    if (!runtime.isUnlocked()) {
      return res.status(423).json({ error: "Unlock the instance first" });
    }
    const { response, challengeId, prfOutput } = req.body || {};
    if (!response || !challengeId || !prfOutput) {
      return res.status(400).json({ error: "Missing fields (PRF output required)" });
    }
    const entry = challengeStore.consume(challengeId);
    if (!entry
        || entry.kind !== "promote-unlock"
        || entry.userId !== req.user.id
        || entry.meta?.credentialId !== req.params.id) {
      return res.status(400).json({ error: "Challenge expired or invalid" });
    }

    const passkey = passkeyVault.getPasskeyForUser(db, req.params.id, req.user.id);
    if (!passkey) return res.status(404).json({ error: "Passkey not found" });

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: entry.challenge,
        expectedOrigin: expectedOrigin(req),
        expectedRPID: rpId(req),
        credential: {
          id: passkey.credential_id,
          publicKey: new Uint8Array(passkey.public_key),
          counter: passkey.counter,
          transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
        },
        requireUserVerification: true,
      });
    } catch (e) {
      log.warn?.(`[passkey] promote verify failed: ${e.message}`);
      return res.status(400).json({ error: "Verification failed" });
    }
    if (!verification.verified) return res.status(400).json({ error: "Verification failed" });

    const dek = runtime.getDek();
    if (!dek) return res.status(423).json({ error: "Instance no longer unlocked" });

    const prfBuf = base64UrlToBuf(prfOutput);
    if (prfBuf.length < 32) {
      return res.status(400).json({ error: "PRF output too short" });
    }

    try {
      const wrap = passkeyVault.wrapDekWithPrf(db, passkey.credential_id, prfBuf, dek);
      passkeyVault.upsertInstanceUnlockWrap(db, passkey.credential_id, req.user.id, wrap);
      passkeyVault.setCanUnlockInstance(db, passkey.credential_id, req.user.id, true);
      passkeyVault.updateCounter(db, passkey.credential_id, verification.authenticationInfo.newCounter);
      log.info?.(`[passkey] instance-unlock enabled credential=${passkey.credential_id} user=${req.user.id}`);
    } catch (e) {
      log.error?.(`[passkey] wrap failed: ${e.message}`);
      return res.status(500).json({ error: "Could not save unlock wrap" });
    } finally {
      try { prfBuf.fill(0); } catch {}
    }

    res.json({ ok: true });
  });

  // Drop the wrap row + clear the can_unlock flag without deleting the
  // login credential. Useful for revoking a single device while keeping
  // it as a login factor.
  app.post("/api/passkeys/:id/instance-unlock/disable", auth, adminOnly, (req, res) => {
    const passkey = passkeyVault.getPasskeyForUser(db, req.params.id, req.user.id);
    if (!passkey) return res.status(404).json({ error: "Passkey not found" });
    passkeyVault.setCanUnlockInstance(db, passkey.credential_id, req.user.id, false);
    passkeyVault.deleteInstanceUnlockWrap(db, passkey.credential_id);
    log.info?.(`[passkey] instance-unlock disabled credential=${passkey.credential_id}`);
    res.json({ ok: true });
  });

  // ====================================================================
  //   UNLOCK INSTANCE BY PASSKEY (no auth, locked → unlocked + JWT)
  // ====================================================================

  app.post("/api/instance/unlock-passkey/options", async (req, res) => {
    if (!runtime.isEnabled()) {
      return res.status(409).json({ error: "Encryption is not enabled" });
    }
    if (runtime.isUnlocked()) {
      return res.json({ alreadyUnlocked: true });
    }
    if (!transportOk(req)) {
      return res.status(400).json({
        error: "Refusing to accept passkey unlock over plaintext HTTP. Use HTTPS, set TRUST_PROXY=true if you have a reverse proxy, or run from localhost.",
      });
    }

    // Gate challenge issuance on the same per-IP limit the verify route
    // maintains so an attacker can't farm fresh challenges indefinitely
    // while locked out.
    const id = clientIdentifier(req);
    if (runtime.attemptOverLimit(id)) {
      setRetryAfter(res, 5 * 60 * 1000);
      return res.status(429).json({ error: "Too many unlock attempts. Try again later." });
    }

    try {
      const allowed = passkeyVault.listInstanceUnlockCredentialIds(db);
      if (allowed.length === 0) {
        return res.status(404).json({ error: "No passkey is authorised to unlock this instance" });
      }
      const salt = passkeyVault.ensurePrfSalt(db);
      const options = await generateAuthenticationOptions({
        rpID: rpId(req),
        userVerification: "required",
        allowCredentials: allowed.map((p) => ({
          id: p.credential_id,
          transports: p.transports ? JSON.parse(p.transports) : undefined,
        })),
        extensions: {
          prf: { eval: { first: bufToBase64Url(salt) } },
        },
      });
      const challengeId = challengeStore.issue({
        challenge: options.challenge,
        kind: "unlock",
      });
      res.json({ options, challengeId });
    } catch (e) {
      log.error?.(`[passkey] unlock/options failed: ${e.message}`);
      res.status(500).json({ error: "Failed to start unlock ceremony" });
    }
  });

  app.post("/api/instance/unlock-passkey/verify", async (req, res) => {
    if (!runtime.isEnabled()) {
      return res.status(409).json({ error: "Encryption is not enabled" });
    }
    if (runtime.isUnlocked()) {
      return res.json({ ok: true, alreadyUnlocked: true });
    }
    if (!transportOk(req)) {
      return res.status(400).json({ error: "Refusing to accept passkey unlock over plaintext HTTP." });
    }

    const id = clientIdentifier(req);
    if (runtime.attemptOverLimit(id)) {
      setRetryAfter(res, 5 * 60 * 1000);
      return res.status(429).json({ error: "Too many unlock attempts. Try again later." });
    }
    const delay = runtime.attemptDelayMs(id);
    if (delay) await paceFailure(delay);

    const { response, challengeId, prfOutput } = req.body || {};
    if (!response || !challengeId || !prfOutput) {
      runtime.recordAttempt(id, false);
      return res.status(400).json({ error: "Missing fields (PRF output required)" });
    }
    const entry = challengeStore.consume(challengeId);
    if (!entry || entry.kind !== "unlock") {
      runtime.recordAttempt(id, false);
      return res.status(400).json({ error: "Challenge expired or invalid" });
    }

    const credentialId = response.id;
    const passkey = passkeyVault.getPasskey(db, credentialId);
    if (!passkey || !passkey.can_unlock_instance) {
      // Either the credential is unknown, or it's a login-only one
      // that the admin never promoted to instance-unlock. Both cases
      // surface as the same generic error so an attacker can't probe
      // which credentials exist.
      runtime.recordAttempt(id, false);
      return res.status(401).json({ error: "This passkey is not authorised to unlock the instance" });
    }
    const user = getUserById.get(passkey.user_id);
    if (!user || !user.is_admin) {
      runtime.recordAttempt(id, false);
      return res.status(403).json({ error: "Only admin passkeys can unlock the instance" });
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: entry.challenge,
        expectedOrigin: expectedOrigin(req),
        expectedRPID: rpId(req),
        credential: {
          id: passkey.credential_id,
          publicKey: new Uint8Array(passkey.public_key),
          counter: passkey.counter,
          transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
        },
        requireUserVerification: true,
      });
    } catch (e) {
      runtime.recordAttempt(id, false);
      log.warn?.(`[passkey] unlock verify failed: ${e.message}`);
      return res.status(401).json({ error: "Verification failed" });
    }
    if (!verification.verified) {
      runtime.recordAttempt(id, false);
      return res.status(401).json({ error: "Verification failed" });
    }

    const wrap = passkeyVault.getInstanceUnlockWrap(db, credentialId);
    if (!wrap) {
      runtime.recordAttempt(id, false);
      return res.status(401).json({ error: "Unlock wrap missing for this passkey" });
    }

    const prfBuf = base64UrlToBuf(prfOutput);
    if (prfBuf.length < 32) {
      runtime.recordAttempt(id, false);
      return res.status(400).json({ error: "PRF output too short" });
    }

    let dek;
    try {
      dek = passkeyVault.unwrapDekWithPrf(
        db,
        credentialId,
        prfBuf,
        { iv: wrap.wrap_iv, ct: wrap.wrapped_dek, tag: wrap.wrap_tag },
      );
    } catch (e) {
      runtime.recordAttempt(id, false);
      log.warn?.(`[passkey] unwrap failed credential=${credentialId}: ${e.message}`);
      return res.status(401).json({ error: "Could not unwrap DEK with this passkey" });
    } finally {
      try { prfBuf.fill(0); } catch {}
    }

    // Verify against the sentinel before promoting to runtime so a
    // wrap created against an old DEK (post-deactivation/re-activation)
    // can't unlock with a stale credential.
    try {
      const row = vault.getStatusRow(db);
      if (row) {
        // verifyDek throws on mismatch; reuse instanceVault's logic.
        const decipher = crypto.createDecipheriv("aes-256-gcm", dek, row.dek_check_iv);
        decipher.setAuthTag(row.dek_check_tag);
        const plain = Buffer.concat([decipher.update(row.dek_check), decipher.final()]).toString("utf8");
        if (plain !== "GKVAULT-OK-v1") {
          throw new Error("DEK self-check failed");
        }
      }
    } catch (e) {
      runtime.recordAttempt(id, false);
      try { dek.fill(0); } catch {}
      log.warn?.(`[passkey] DEK self-check failed credential=${credentialId}: ${e.message}`);
      return res.status(401).json({ error: "DEK self-check failed" });
    }

    runtime.unlockWithDek(dek);
    vault.markUnlockedNow(db);
    passkeyVault.touchInstanceUnlockWrap(db, credentialId);
    passkeyVault.updateCounter(db, credentialId, verification.authenticationInfo.newCounter);
    runtime.recordAttempt(id, true);
    try { dek.fill(0); } catch {}

    const token = signToken(user);
    log.info?.(`[passkey] instance unlocked + admin signed in user=${user.id}`);
    res.json({
      ok: true,
      unlocked: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_admin: !!user.is_admin,
        avatar_url: user.avatar_url || null,
      },
      must_change_password: !!user.must_change_password,
    });
  });
}

module.exports = { attachPasskeyRoutes };
