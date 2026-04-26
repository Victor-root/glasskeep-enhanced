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

const vault = require("../encryption/instanceVault");
const runtime = require("../encryption/runtimeUnlockState");
const noteCipher = require("../encryption/noteCipher");
const recoveryKey = require("../encryption/recoveryKey");

function getClientIp(req) {
  // Express's req.ip is good enough; keep a fallback so we never crash
  // the rate limiter when behind an unusual proxy setup.
  return req.ip || req.connection?.remoteAddress || "0.0.0.0";
}

function isLocalhost(req) {
  const ip = getClientIp(req);
  if (!ip) return false;
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

// Refuse unlock attempts that would send the secret over plain HTTP, so
// nobody accidentally types their passphrase across the network without
// transport encryption. Localhost is exempt because the CLI script and
// reverse-proxy back-ends all sit on it.
//
// req.secure is enough on its own once Express is configured with
// `trust proxy` (see server/index.js: that's auto-on when TRUST_PROXY
// is set or when HTTPS_ENABLED=false signals an upstream TLS
// terminator). We keep an explicit X-Forwarded-Proto fallback for the
// rare deploy where someone forgot to flip the env var so the unlock
// flow still works without a head-scratch.
function isSecureRequest(req) {
  if (req.secure) return true;
  const xfp = (req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  if (xfp === "https" && (
    process.env.TRUST_PROXY === "true" || process.env.HTTPS_ENABLED === "false"
  )) {
    return true;
  }
  return false;
}

function transportOk(req) {
  return isSecureRequest(req) || isLocalhost(req);
}

function setRetryAfter(res, ms) {
  if (ms > 0) res.setHeader("Retry-After", String(Math.ceil(ms / 1000)));
}

function clientIdentifier(req) {
  // Localhost requests share the same /loopback bucket on purpose: we
  // don't want an admin running the CLI to accidentally lock themselves
  // out from a separate web tab on the same host.
  return isLocalhost(req) ? "localhost" : getClientIp(req);
}

// Small wait so we don't leak timing info on bad guesses. Combined with
// the per-IP rate limiter below, this is enough friction for our
// threat model.
async function paceFailure(ms) {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

function attachUnlockRoutes(app, deps) {
  const { db, auth, adminOnly, log = console } = deps;

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
      return res.status(400).json({
        error: "Refusing to accept unlock secret over plaintext HTTP. Use HTTPS or run from localhost.",
      });
    }
    const id = clientIdentifier(req);
    if (runtime.attemptOverLimit(id)) {
      setRetryAfter(res, 5 * 60 * 1000);
      return res.status(429).json({ error: "Too many unlock attempts. Try again later." });
    }
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
    } catch (e) {
      runtime.recordAttempt(id, false);
      log.warn?.(`[unlock] passphrase rejected from ${id}`);
      return res.status(401).json({ error: "Invalid passphrase" });
    }
    try {
      runtime.unlockWithDek(dek);
      vault.markUnlockedNow(db);
      runtime.recordAttempt(id, true);
      log.info?.(`[unlock] success via passphrase from ${id}`);
      return res.json({ ok: true });
    } finally {
      // The runtime made its own copy — zero ours.
      try { dek.fill(0); } catch {}
    }
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
    if (runtime.attemptOverLimit(id)) {
      setRetryAfter(res, 5 * 60 * 1000);
      return res.status(429).json({ error: "Too many unlock attempts. Try again later." });
    }
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
    } catch (e) {
      runtime.recordAttempt(id, false);
      log.warn?.(`[unlock] recovery key rejected from ${id}`);
      return res.status(401).json({ error: "Invalid recovery key" });
    }
    try {
      runtime.unlockWithDek(dek);
      vault.markUnlockedNow(db);
      runtime.recordAttempt(id, true);
      log.info?.(`[unlock] success via recovery key from ${id}`);
      return res.json({ ok: true });
    } finally {
      try { dek.fill(0); } catch {}
    }
  });

  // ---- Lock (admin) ------------------------------------------------------
  app.post("/api/instance/lock", auth, adminOnly, (_req, res) => {
    if (!runtime.isEnabled()) {
      return res.status(409).json({ error: "Encryption is not enabled" });
    }
    runtime.lock();
    log.info?.("[unlock] instance manually re-locked");
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
      const migrate = db.transaction(() => {
        const rows = db.prepare("SELECT * FROM notes").all();
        const upd = db.prepare(`
          UPDATE notes SET
            title = @title, content = @content,
            items_json = @items_json, tags_json = @tags_json,
            images_json = @images_json, color = @color,
            is_server_encrypted = @is_server_encrypted,
            enc_version = @enc_version,
            enc_payload = @enc_payload
          WHERE id = @id
        `);
        for (const row of rows) {
          if (row.is_server_encrypted) continue; // already encrypted
          const prepared = noteCipher.prepareRowForWrite({
            title: row.title,
            content: row.content,
            items_json: row.items_json,
            tags_json: row.tags_json,
            images_json: row.images_json,
            color: row.color,
          });
          upd.run({
            id: row.id,
            title: prepared.title,
            content: prepared.content,
            items_json: prepared.items_json,
            tags_json: prepared.tags_json,
            images_json: prepared.images_json,
            color: prepared.color,
            is_server_encrypted: prepared.is_server_encrypted,
            enc_version: prepared.enc_version,
            enc_payload: prepared.enc_payload,
          });
        }
        vault.markMigrated(db);
      });
      migrate();
    } catch (e) {
      // Roll the runtime + vault flags back so the admin sees a real
      // error rather than a half-encrypted database.
      try {
        db.prepare("UPDATE instance_encryption SET enabled = 0 WHERE id = 1").run();
      } catch {}
      runtime.lock();
      runtime.setEnabled(false);
      // Wipe our copy of the DEK before bailing.
      try { init.dek.fill(0); } catch {}
      log.error?.(`[encrypt] activation failed: ${e.message}`);
      return res.status(500).json({ error: "Activation failed: " + e.message });
    }

    // Hand the recovery key to the caller exactly once. After this
    // response it is unrecoverable from the database.
    const recovery = init.recoveryKey;
    try { init.dek.fill(0); } catch {}
    log.info?.("[encrypt] instance activated and notes encrypted");
    res.json({
      ok: true,
      recoveryKey: recovery,
      enabled: true,
      locked: false,
    });
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
      return res.status(401).json({ error: "Current passphrase is incorrect" });
    }
    try {
      vault.rewrapWithNewPassphrase(db, dek, newPassphrase);
    } finally {
      try { dek.fill(0); } catch {}
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
