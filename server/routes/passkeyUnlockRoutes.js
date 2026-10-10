// server/routes/passkeyUnlockRoutes.js
//
// The instance-UNLOCK flavour of passkeys (see passkeyRoutes.js, which
// attaches these): an admin promotes a PRF-capable passkey so it wraps
// the instance DEK, and that passkey can later unlock a locked instance
// and sign its admin in. Two groups, attached separately so they keep
// their place among the other passkey routes.

const { generateAuthenticationOptions } = require("@simplewebauthn/server");

const passkeyVault = require("../encryption/passkeyVault");
const challengeStore = require("../encryption/challengeStore");
const vault = require("../encryption/instanceVault");
const runtime = require("../encryption/runtimeUnlockState");
const {
  rpId,
  bufToBase64Url,
  base64UrlToBuf,
  transportsOf,
  verifyAssertion,
  verifyOwnPasskeyAssertion,
  sessionUser,
} = require("../services/passkeyCeremony");
const {
  transportOk,
  clientIdentifier,
  refuseOverLimit,
  paceFailure,
} = require("../services/unlockGuard");

function attachPasskeyPromoteRoutes(app, { db, auth, adminOnly, startFailed, log = console }) {
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
          transports: transportsOf(passkey),
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
      startFailed(res, log, e, "promote/options", "Failed to start promotion ceremony");
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
    const verified = await verifyOwnPasskeyAssertion(req, res, {
      db, response, challengeId, kind: "promote-unlock", label: "promote", log,
    });
    if (!verified) return;
    const { passkey, verification } = verified;

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
      try { prfBuf.fill(0); } catch { /* best-effort wipe */ }
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
}

function attachPasskeyUnlockRoutes(app, { db, getUserById, signToken, startFailed, log = console }) {
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
    if (refuseOverLimit(res, id)) return;

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
          transports: transportsOf(p),
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
      startFailed(res, log, e, "unlock/options", "Failed to start unlock ceremony");
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
    if (refuseOverLimit(res, id)) return;
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
      verification = await verifyAssertion(req, response, entry.challenge, passkey);
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
      try { prfBuf.fill(0); } catch { /* best-effort wipe */ }
    }

    // Verify against the sentinel before promoting to runtime so a
    // wrap created against an old DEK (post-deactivation/re-activation)
    // can't unlock with a stale credential.
    try {
      const row = vault.getStatusRow(db);
      // Actually reuse instanceVault's check rather than copy it: the
      // sentinel value and the AES-GCM parameters then have one owner.
      if (row) vault.verifyDek(row, dek);
    } catch (e) {
      runtime.recordAttempt(id, false);
      try { dek.fill(0); } catch { /* best-effort wipe */ }
      log.warn?.(`[passkey] DEK self-check failed credential=${credentialId}: ${e.message}`);
      return res.status(401).json({ error: "DEK self-check failed" });
    }

    runtime.unlockWithDek(dek);
    vault.markUnlockedNow(db);
    passkeyVault.touchInstanceUnlockWrap(db, credentialId);
    passkeyVault.updateCounter(db, credentialId, verification.authenticationInfo.newCounter);
    runtime.recordAttempt(id, true);
    try { dek.fill(0); } catch { /* best-effort wipe */ }

    const token = signToken(user);
    log.info?.(`[passkey] instance unlocked + admin signed in user=${user.id}`);
    res.json({
      ok: true,
      unlocked: true,
      token,
      user: sessionUser(user),
      must_change_password: !!user.must_change_password,
    });
  });
}

module.exports = { attachPasskeyPromoteRoutes, attachPasskeyUnlockRoutes };
