// server/routes/unlockRoutes.js
// HTTP surface for the at-rest encryption feature.
//
// Public (no JWT, but rate-limited and HTTPS-only outside localhost):
//   GET  /api/instance/status      — lock/enabled state, no secrets
//   POST /api/instance/unlock      — unlock with passphrase
//   POST /api/instance/unlock-recovery — unlock with recovery key
//
// Admin (JWT + is_admin), only when the instance is unlocked:
//   POST /api/instance/lock                — drop the DEK from RAM
//   POST /api/instance/activate            — first-time activation +
//                                            re-encrypt every note in a
//                                            single transaction
//   POST /api/instance/passphrase          — rotate passphrase
//   POST /api/instance/recovery/regenerate — issue a new recovery key
//
// The bulk rewrites live in encryption/atRestMigrations.js, the transport
// and attempt-limit checks in services/unlockGuard.js.

const vault = require("../encryption/instanceVault");
const runtime = require("../encryption/runtimeUnlockState");
const recoveryKey = require("../encryption/recoveryKey");
const passkeyVault = require("../encryption/passkeyVault");
const {
  purgeFreedPages,
  runUpgradeMigrations,
  encryptAllRows,
  decryptAllRows,
} = require("../encryption/atRestMigrations");
const {
  getClientIp,
  transportOk,
  clientIdentifier,
  refuseOverLimit,
  paceFailure,
} = require("../services/unlockGuard");

function attachUnlockRoutes(app, deps) {
  const { db, auth, adminOnly, log = console, broadcastToAll, onLockStateChanged } = deps;

  // A secret was accepted: bring the DEK up, upgrade what an older
  // version left behind, and tell the clients and the federation peers.
  // `via` names the secret in the log.
  function completeUnlock(res, dek, id, via) {
    try {
      runtime.unlockWithDek(dek);
      vault.markUnlockedNow(db);
      runtime.recordAttempt(id, true);
      log.info?.(`[unlock] success via ${via} from ${id}`);
      runUpgradeMigrations(db, log);
      // Symmetric with the lock route: tell every connected client the
      // instance is back so other sessions leave the unlock screen without
      // waiting for the next status poll.
      if (typeof broadcastToAll === "function") {
        try { broadcastToAll({ type: "instance_unlocked" }); } catch { /* best-effort notice */ }
      }
      // Nudge federation so peers re-probe us promptly (our /health now
      // reports unlocked) and our paused note-sync resumes.
      if (typeof onLockStateChanged === "function") {
        try { onLockStateChanged(); } catch { /* best-effort peer ping */ }
      }
      return res.json({ ok: true });
    } finally {
      // The runtime made its own copy: zero ours.
      try { dek.fill(0); } catch { /* best-effort wipe */ }
    }
  }

  app.get("/api/instance/status", (_req, res) => {
    res.json({
      enabled: runtime.isEnabled(),
      locked: runtime.isLocked(),
      unlocked: runtime.isUnlocked(),
      schemaVersion: vault.SCHEMA_VERSION,
    });
  });

  // ---- Unlock: passphrase ------------------------------------------------
  app.post("/api/instance/unlock", async (req, res) => {
    if (!runtime.isEnabled()) {
      return res.status(409).json({ error: "Encryption is not enabled" });
    }
    if (runtime.isUnlocked()) return res.json({ ok: true, alreadyUnlocked: true });
    if (!transportOk(req)) {
      // One-line diagnostic so the operator can see exactly which
      // signals were missing. To accept unlock from a non-loopback
      // client we need ANY of:
      //   - req.secure === true  (Node sees HTTPS, possibly via XFP+
      //     trust proxy)
      //   - TRUST_PROXY=true     (explicit operator assertion)
      //   - HTTPS_ENABLED=false  (install.sh's "reverse proxy" mode)
      // If none of those are present, the request is plain HTTP from a
      // remote IP and we must refuse. Fix path: add TRUST_PROXY=true
      // to the env file the systemd unit reads (typically
      // /etc/glass-keep.env or /opt/glass-keep/.env) and restart.
      log.warn?.(
        `[unlock] insecure transport refused: ip=${getClientIp(req)} secure=${!!req.secure} `
        + `proto=${req.protocol} trust_proxy_env=${process.env.TRUST_PROXY || "(unset)"} `
        + `https_enabled_env=${process.env.HTTPS_ENABLED || "(unset)"} `
        + `xfp=${req.headers["x-forwarded-proto"] || "(none)"}`,
      );
      return res.status(400).json({
        error: "Refusing to accept unlock secret over plaintext HTTP. Use HTTPS, set TRUST_PROXY=true if you have a reverse proxy in front, or run from localhost.",
      });
    }
    const id = clientIdentifier(req);
    if (refuseOverLimit(res, id)) return;
    const delay = runtime.attemptDelayMs(id);
    if (delay) await paceFailure(delay);

    const { passphrase } = req.body || {};
    if (!passphrase || typeof passphrase !== "string") {
      runtime.recordAttempt(id, false);
      return res.status(400).json({ error: "Passphrase is required" });
    }

    let dek;
    try {
      dek = vault.unlockWithPassphrase(db, passphrase);
    } catch {
      runtime.recordAttempt(id, false);
      log.warn?.(`[unlock] passphrase rejected from ${id}`);
      return res.status(401).json({ error: "Invalid passphrase" });
    }
    return completeUnlock(res, dek, id, "passphrase");
  });

  // ---- Unlock: recovery key ----------------------------------------------
  app.post("/api/instance/unlock-recovery", async (req, res) => {
    if (!runtime.isEnabled()) {
      return res.status(409).json({ error: "Encryption is not enabled" });
    }
    if (runtime.isUnlocked()) return res.json({ ok: true, alreadyUnlocked: true });
    if (!transportOk(req)) {
      return res.status(400).json({
        error: "Refusing to accept recovery key over plaintext HTTP. Use HTTPS or run from localhost.",
      });
    }
    const id = clientIdentifier(req);
    if (refuseOverLimit(res, id)) return;
    const delay = runtime.attemptDelayMs(id);
    if (delay) await paceFailure(delay);

    const { recoveryKey: raw } = req.body || {};
    if (!raw || typeof raw !== "string") {
      runtime.recordAttempt(id, false);
      return res.status(400).json({ error: "Recovery key is required" });
    }
    if (!recoveryKey.normalizeRecoveryKey(raw)) {
      runtime.recordAttempt(id, false);
      return res.status(400).json({ error: "Invalid recovery key format" });
    }

    let dek;
    try {
      dek = vault.unlockWithRecoveryKey(db, raw);
    } catch {
      runtime.recordAttempt(id, false);
      log.warn?.(`[unlock] recovery key rejected from ${id}`);
      return res.status(401).json({ error: "Invalid recovery key" });
    }
    return completeUnlock(res, dek, id, "recovery key");
  });

  // ---- Lock (admin) ------------------------------------------------------
  app.post("/api/instance/lock", auth, adminOnly, (_req, res) => {
    if (!runtime.isEnabled()) {
      return res.status(409).json({ error: "Encryption is not enabled" });
    }
    // Push the event BEFORE actually locking. Once we lock, the SSE
    // streams' next write would fail (the connections themselves stay
    // open but downstream listeners might already 423-out on side
    // effects). Sending first guarantees every still-connected client
    // receives the heads-up and can redirect to the unlock screen
    // without waiting for the 30-second status poll.
    if (typeof broadcastToAll === "function") {
      try { broadcastToAll({ type: "instance_locked" }); } catch { /* best-effort notice */ }
    }
    runtime.lock();
    log.info?.("[unlock] instance manually re-locked");
    // Ping federation peers so they re-probe us promptly and learn we're
    // locked now — symmetric with unlock (otherwise they'd only notice on
    // their next periodic health poll).
    if (typeof onLockStateChanged === "function") {
      try { onLockStateChanged(); } catch { /* best-effort peer ping */ }
    }
    res.json({ ok: true });
  });

  // ---- Activate encryption (admin, while unlocked-OR-disabled) ----------
  // Single-transaction migration: every existing note is read, encrypted,
  // and rewritten in one go. If anything fails the transaction rolls back
  // and the instance stays in its previous state (plaintext).
  app.post("/api/instance/activate", auth, adminOnly, (req, res) => {
    if (runtime.isEnabled()) {
      return res.status(409).json({ error: "Encryption is already enabled" });
    }
    const { passphrase, confirmPassphrase } = req.body || {};
    if (typeof passphrase !== "string" || passphrase.length < 8) {
      return res.status(400).json({ error: "Passphrase must be at least 8 characters" });
    }
    if (passphrase !== confirmPassphrase) {
      return res.status(400).json({ error: "Passphrase confirmation does not match" });
    }

    let init;
    try {
      init = vault.initialize(db, passphrase);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    // Bring runtime up so the encrypt helper has access to the DEK.
    runtime.setEnabled(true);
    runtime.unlockWithDek(init.dek);

    try {
      encryptAllRows(db);

      // Critical: when notes already existed, the migration above only
      // UPDATE-d the rows, and the old (plaintext) pages are still in the
      // file until purged (see purgeFreedPages). Failure to clean up is
      // logged but doesn't fail the activation: better the operator know
      // via journalctl than surface a partial-success error to the UI.
      try {
        purgeFreedPages(db);
        log.info?.("[encrypt] post-activation VACUUM complete (plaintext residue purged)");
      } catch (e) {
        log.warn?.(`[encrypt] post-activation cleanup failed: ${e.message}. Run manually after stopping the service: sqlite3 <db> "PRAGMA wal_checkpoint(TRUNCATE); VACUUM;"`);
      }
    } catch (e) {
      // Roll the runtime + vault flags back so the admin sees a real
      // error rather than a half-encrypted database.
      try {
        db.prepare("UPDATE instance_encryption SET enabled = 0 WHERE id = 1").run();
      } catch { /* best-effort rollback, the runtime is reset below */ }
      runtime.lock();
      runtime.setEnabled(false);
      // Wipe our copy of the DEK before bailing.
      try { init.dek.fill(0); } catch { /* best-effort wipe */ }
      log.error?.(`[encrypt] activation failed: ${e.message}`);
      return res.status(500).json({ error: "Activation failed: " + e.message });
    }

    // Hand the recovery key to the caller exactly once. After this
    // response it is unrecoverable from the database.
    const recovery = init.recoveryKey;
    try { init.dek.fill(0); } catch { /* best-effort wipe */ }
    log.info?.("[encrypt] instance activated and notes encrypted");
    res.json({
      ok: true,
      recoveryKey: recovery,
      enabled: true,
      locked: false,
    });
  });

  // ---- Deactivate encryption (admin, unlocked) -------------------------
  // The reverse of /activate: every encrypted note is decrypted back to
  // plaintext columns, the wrapped DEKs are wiped from the vault, the
  // file is VACUUMed to physically purge the encrypted residue, and the
  // runtime drops the DEK from RAM. Requires re-typing the current
  // passphrase as a "yes I'm sure" gate (the admin already has read
  // access at this point, so the passphrase isn't a privilege boundary,
  // but it forces the operator to acknowledge the destructive nature
  // of the action).
  app.post("/api/instance/deactivate", auth, adminOnly, (req, res) => {
    if (!runtime.isEnabled()) {
      return res.status(409).json({ error: "Encryption is not enabled" });
    }
    if (!runtime.isUnlocked()) {
      return res.status(423).json({ error: "Unlock the instance first" });
    }
    const { passphrase } = req.body || {};
    if (typeof passphrase !== "string" || !passphrase) {
      return res.status(400).json({ error: "Current passphrase is required" });
    }
    // Verify the passphrase against the vault — using the live DEK
    // alone wouldn't enforce that the operator actually knows the
    // secret (the admin session could outlive a lock+unlock cycle).
    let probeDek;
    try {
      probeDek = vault.unlockWithPassphrase(db, passphrase);
    } catch {
      // 403, not 401: the session is valid, and clients end it on a 401.
      return res.status(403).json({ error: "Current passphrase is incorrect" });
    } finally {
      // We don't need a second DEK in memory.
      try { probeDek && probeDek.fill(0); } catch { /* best-effort wipe */ }
    }

    try {
      decryptAllRows(db, log);
    } catch (e) {
      log.error?.(`[encrypt] deactivation failed mid-transaction: ${e.message}`);
      return res.status(500).json({ error: "Deactivation failed: " + e.message });
    }

    // Drop the DEK from RAM and flip the runtime flag. Must come AFTER
    // the transaction succeeds — losing the DEK before all notes are
    // decrypted would leave the database half-encrypted with no way
    // back in.
    runtime.lock();
    runtime.setEnabled(false);

    // Wipe every passkey-based unlock wrap and the PRF salt. The
    // wraps reference a DEK that's just been retired; if the admin
    // re-activates encryption later, a fresh salt forces them to
    // re-promote each passkey rather than silently re-using stale
    // wraps that can't be unwrapped against the new DEK anyway.
    try {
      passkeyVault.disableAllPasskeyUnlocks(db);
    } catch (e) {
      log.warn?.(`[encrypt] could not wipe passkey unlock wraps: ${e.message}`);
    }

    // Same triple-pass as activation: physically rewrite the file so
    // the encrypted ciphertext pages don't linger as freed-but-readable
    // bytes. Symmetric with the activation purge — at-rest contents
    // before-and-after are both clean.
    try {
      purgeFreedPages(db);
      log.info?.("[encrypt] deactivation complete, ciphertext residue purged");
    } catch (e) {
      log.warn?.(`[encrypt] post-deactivation cleanup failed: ${e.message}`);
    }

    res.json({ ok: true, enabled: false, locked: false });
  });

  // ---- Rotate passphrase (admin, unlocked) ------------------------------
  app.post("/api/instance/passphrase", auth, adminOnly, (req, res) => {
    if (!runtime.isUnlocked()) {
      return res.status(423).json({ error: "Unlock the instance first" });
    }
    const { currentPassphrase, newPassphrase, confirmPassphrase } = req.body || {};
    if (typeof currentPassphrase !== "string") {
      return res.status(400).json({ error: "Current passphrase is required" });
    }
    if (typeof newPassphrase !== "string" || newPassphrase.length < 8) {
      return res.status(400).json({ error: "New passphrase must be at least 8 characters" });
    }
    if (newPassphrase !== confirmPassphrase) {
      return res.status(400).json({ error: "Passphrase confirmation does not match" });
    }
    let dek;
    try {
      dek = vault.unlockWithPassphrase(db, currentPassphrase);
    } catch {
      // 403, not 401: the session is valid, and clients end it on a 401.
      return res.status(403).json({ error: "Current passphrase is incorrect" });
    }
    try {
      vault.rewrapWithNewPassphrase(db, dek, newPassphrase);
    } finally {
      try { dek.fill(0); } catch { /* best-effort wipe */ }
    }
    res.json({ ok: true });
  });

  // ---- Regenerate recovery key (admin, unlocked) ------------------------
  app.post("/api/instance/recovery/regenerate", auth, adminOnly, (_req, res) => {
    if (!runtime.isUnlocked()) {
      return res.status(423).json({ error: "Unlock the instance first" });
    }
    const dek = runtime.getDek();
    if (!dek) return res.status(423).json({ error: "Unlock the instance first" });
    const recovery = vault.regenerateRecoveryKey(db, dek);
    res.json({ ok: true, recoveryKey: recovery });
  });
}

module.exports = { attachUnlockRoutes };
