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
// ceremony. The second flavour's routes live in passkeyUnlockRoutes.js,
// attached from here so the routes keep their order; what every
// ceremony shares is in services/passkeyCeremony.js.

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
} = require("@simplewebauthn/server");

const passkeyVault = require("../encryption/passkeyVault");
const challengeStore = require("../encryption/challengeStore");
const webauthnRp = require("../services/webauthnRp");
const {
  RpUnresolved,
  rpId,
  expectedOrigin,
  userIdToBuf,
  transportsOf,
  verifyAssertion,
  sessionUser,
} = require("../services/passkeyCeremony");
const {
  attachPasskeyPromoteRoutes,
  attachPasskeyUnlockRoutes,
} = require("./passkeyUnlockRoutes");

// The one ceremony failure a user can act on is "this instance has not
// declared its domain": it is the administrator's to fix, and a generic
// "could not start" sends the user looking in the wrong place. Every
// entry point reports that reason verbatim and keeps its own message
// for everything else.
function startFailed(res, log, e, what, fallback) {
  log.error?.(`[passkey] ${what} failed: ${e.message}`);
  const message = e instanceof RpUnresolved ? e.message : fallback;
  return res.status(500).json({ error: message });
}

// ── Route attachment ──────────────────────────────────────────────────
function attachPasskeyRoutes(app, deps) {
  const { db, auth, getUserById, signToken, log = console } = deps;

  // ====================================================================
  //   USER PASSKEY MANAGEMENT
  // ====================================================================

  // List the caller's own passkeys, and say whether a new one can be
  // created at all. Without `available`, a user on an instance whose
  // domain is still undeclared only finds out by pressing the button and
  // reading a failure: the settings screen can now say up front that
  // this is the administrator's to fix, not theirs.
  app.get("/api/passkeys", auth, (req, res) => {
    const list = passkeyVault.listPasskeysForUser(db, req.user.id);
    res.json({
      available: webauthnRp.resolveRp(req).ok,
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
          transports: transportsOf(p),
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
      startFailed(res, log, e, "register/options", "Failed to start passkey registration");
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
    // SimpleWebAuthn (since v13) nests the credential under .credential and
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
      startFailed(res, log, e, "login/options", "Failed to start passkey login");
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
      verification = await verifyAssertion(req, response, entry.challenge, stored);
    } catch (e) {
      log.warn?.(`[passkey] login verify failed: ${e.message}`);
      return res.status(401).json({ error: "Verification failed" });
    }
    if (!verification.verified) return res.status(401).json({ error: "Verification failed" });

    passkeyVault.updateCounter(db, credentialId, verification.authenticationInfo.newCounter);

    const token = signToken(user);
    log.info?.(`[passkey] login OK user=${user.id}`);
    // Keep the response shape in lockstep with /api/login and the QR
    // device-link poll (see sessionUser).
    res.json({
      ok: true,
      token,
      user: sessionUser(user),
      must_change_password: !!user.must_change_password,
    });
  });

  // Promoting a passkey to instance unlock (passkeyUnlockRoutes.js).
  attachPasskeyPromoteRoutes(app, { ...deps, startFailed });

  // ====================================================================
  //   TEST A SPECIFIC PASSKEY (authenticated user, no side-effects)
  // ====================================================================
  //
  // Lets a logged-in user verify that a credential still works without
  // having to log out and back in. Runs a full authentication ceremony
  // targeting the single credential, verifies the response, updates the
  // counter, and returns {ok: true}. No token is issued.

  app.post("/api/passkeys/:id/test/options", auth, async (req, res) => {
    const passkey = passkeyVault.getPasskeyForUser(db, req.params.id, req.user.id);
    if (!passkey) return res.status(404).json({ error: "Passkey not found" });
    try {
      const options = await generateAuthenticationOptions({
        rpID: rpId(req),
        userVerification: "required",
        allowCredentials: [{
          id: passkey.credential_id,
          transports: transportsOf(passkey),
        }],
      });
      const challengeId = challengeStore.issue({
        challenge: options.challenge,
        kind: "test",
        userId: req.user.id,
        meta: { credentialId: passkey.credential_id },
      });
      res.json({ options, challengeId });
    } catch (e) {
      startFailed(res, log, e, "test/options", "Failed to start passkey test");
    }
  });

  app.post("/api/passkeys/:id/test/verify", auth, async (req, res) => {
    const { response, challengeId } = req.body || {};
    if (!response || !challengeId) return res.status(400).json({ error: "Missing fields" });

    const entry = challengeStore.consume(challengeId);
    if (!entry
        || entry.kind !== "test"
        || entry.userId !== req.user.id
        || entry.meta?.credentialId !== req.params.id) {
      return res.status(400).json({ error: "Challenge expired or invalid" });
    }

    const passkey = passkeyVault.getPasskeyForUser(db, req.params.id, req.user.id);
    if (!passkey) return res.status(404).json({ error: "Passkey not found" });

    let verification;
    try {
      verification = await verifyAssertion(req, response, entry.challenge, passkey);
    } catch (e) {
      log.warn?.(`[passkey] test verify failed: ${e.message}`);
      return res.status(400).json({ error: "Verification failed" });
    }
    if (!verification.verified) return res.status(400).json({ error: "Verification failed" });

    passkeyVault.updateCounter(db, passkey.credential_id, verification.authenticationInfo.newCounter);
    log.info?.(`[passkey] test OK credential=${passkey.credential_id} user=${req.user.id}`);
    res.json({ ok: true });
  });

  // Unlocking the instance by passkey (passkeyUnlockRoutes.js).
  attachPasskeyUnlockRoutes(app, { ...deps, startFailed });
}

module.exports = { attachPasskeyRoutes };
