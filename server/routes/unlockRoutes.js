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

// Run after every successful unlock. Two upgrade paths:
//   - notes encrypted in the v1 format (no AAD) get re-encrypted as
//     v2 (AAD bound to noteId+ownerUserId) so a stolen ciphertext
//     can no longer be moved between rows undetected.
//   - per-user tag rows that pre-date the tag-encryption hardening
//     get encrypted in place.
// Both run in a single transaction; failure logs and falls through —
// the user is still unlocked, the migration will simply retry on the
// next unlock. After both passes finish we VACUUM (with the same
// triple-pass as activation) so freed pages don't leak the previous
// formats.
function runUpgradeMigrations(db, log) {
  let touchedNotes = 0;
  let touchedTags = 0;

  try {
    const v1Notes = db.prepare(
      "SELECT id, user_id, enc_payload FROM notes WHERE is_server_encrypted = 1 AND (enc_version IS NULL OR enc_version < ?)"
    ).all(noteCipher.NOTE_VERSION_LATEST);
    const updNote = db.prepare(
      "UPDATE notes SET enc_version = ?, enc_payload = ? WHERE id = ?"
    );
    const noteTx = db.transaction(() => {
      for (const r of v1Notes) {
        const fields = noteCipher.decryptPayload(r.enc_payload, {
          noteId: r.id,
          userId: r.user_id,
        });
        const payload = noteCipher.encryptFields(fields, {
          noteId: r.id,
          userId: r.user_id,
        });
        updNote.run(noteCipher.NOTE_VERSION_LATEST, payload, r.id);
        touchedNotes++;
      }
    });
    noteTx();
  } catch (e) {
    log.warn?.(`[encrypt] note v1->v2 migration aborted: ${e.message}`);
  }

  try {
    const plainTags = db.prepare(
      "SELECT note_id, user_id, tags_json FROM note_user_tags WHERE is_encrypted = 0 AND tags_json IS NOT NULL AND tags_json != '[]' AND tags_json != ''"
    ).all();
    const updTag = db.prepare(
      "UPDATE note_user_tags SET tags_json = '[]', is_encrypted = 1, enc_payload = ? WHERE note_id = ? AND user_id = ?"
    );
    const tagTx = db.transaction(() => {
      for (const r of plainTags) {
        const enc = noteCipher.encryptTagsJson(r.tags_json, {
          noteId: r.note_id,
          userId: r.user_id,
        });
        updTag.run(enc, r.note_id, r.user_id);
        touchedTags++;
      }
    });
    tagTx();
  } catch (e) {
    log.warn?.(`[encrypt] tag encryption migration aborted: ${e.message}`);
  }

  if (touchedNotes > 0 || touchedTags > 0) {
    log.info?.(`[encrypt] upgrade migration: notes=${touchedNotes} tags=${touchedTags}`);
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      db.exec("VACUUM");
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch (e) {
      log.warn?.(`[encrypt] post-migration VACUUM failed: ${e.message}`);
    }
  }
}

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

// Refuse unlock attempts that would send the secret over plain HTTP,
// so nobody accidentally types their passphrase across the network
// without transport encryption.
//
// Three trust paths, in order:
//   1. Localhost: the CLI script (scripts/unlock-instance.cjs) and any
//      reverse-proxy back-end on the same box come in via 127.0.0.1.
//      Loopback is always exempt.
//   2. req.secure === true: Express's view of the connection. True
//      when Node terminates TLS itself (HTTPS_ENABLED=true with a
//      cert), OR when `app.set('trust proxy', ...)` is set AND the
//      reverse proxy forwarded `X-Forwarded-Proto: https`. This is
//      the cleanest signal — when nginx is configured to send XFP, we
//      can verify the upstream scheme without taking the operator's
//      word for it.
//   3. Operator-declared proxy mode: TRUST_PROXY=true (or HTTPS_ENABLED
//      =false, which install.sh writes when the operator picks
//      "reverse proxy" SSL mode). This is an explicit assertion from
//      the operator that TLS is terminated upstream of Node. We trust
//      it even if the proxy is misconfigured to omit X-Forwarded-Proto
//      (a very common nginx oversight). The security boundary that
//      matters is browser ↔ proxy, which the operator owns and has
//      asserted to be HTTPS — the proxy ↔ Node hop is loopback or a
//      private LAN where the unencrypted body is no worse than what
//      already crosses it for every other API call.
//
// What we deliberately do NOT do: inspect raw X-Forwarded-Proto /
// X-Forwarded-Ssl / Front-End-Https headers without `trust proxy`
// being configured. Without trust proxy, any client can send those
// headers and bypass the check. Express's req.secure is the only
// trustworthy view of "did this come over HTTPS upstream".
function operatorDeclaredProxy() {
  return process.env.TRUST_PROXY === "true"
    || process.env.HTTPS_ENABLED === "false";
}

function isSecureRequest(req) {
  if (req.secure === true) return true;
  if (operatorDeclaredProxy()) return true;
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
      runUpgradeMigrations(db, log);
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
      runUpgradeMigrations(db, log);
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
          }, { noteId: row.id, userId: row.user_id });
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
        // Encrypt the per-user tag rows in the same transaction so a
        // partial activation can't leave readable tags on disk.
        const tagRows = db.prepare(
          "SELECT note_id, user_id, tags_json FROM note_user_tags WHERE is_encrypted = 0"
        ).all();
        const updTag = db.prepare(
          "UPDATE note_user_tags SET tags_json = '[]', is_encrypted = 1, enc_payload = ? WHERE note_id = ? AND user_id = ?"
        );
        for (const r of tagRows) {
          if (!r.tags_json || r.tags_json === "[]") continue;
          const enc = noteCipher.encryptTagsJson(r.tags_json, {
            noteId: r.note_id,
            userId: r.user_id,
          });
          updTag.run(enc, r.note_id, r.user_id);
        }
        vault.markMigrated(db);
      });
      migrate();

      // Critical: when notes already existed, the migration above only
      // UPDATE-d the rows. SQLite marks the old (plaintext) pages as
      // free but does NOT zero them, so a thief reading the raw .db
      // file could still grep the old contents. WAL mode keeps an
      // even longer trail.
      //
      // Three steps to physically purge:
      //   1. checkpoint(TRUNCATE) — flush WAL into the main file and
      //      drop the WAL.
      //   2. VACUUM — copy live pages to a fresh file, freed pages
      //      (still containing plaintext) are dropped on the floor.
      //   3. checkpoint(TRUNCATE) again — VACUUM itself ran through
      //      the WAL on a still-open connection, so we drain it once
      //      more. Without this final pass the freshly-purged file
      //      coexists with a WAL that holds the very pages we just
      //      tried to discard.
      // VACUUM cannot run inside a transaction, hence the separate
      // calls. Failure to clean up is logged but doesn't fail the
      // activation — better the operator know via journalctl than
      // surface a partial-success error to the UI.
      try {
        db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        db.exec("VACUUM");
        db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        log.info?.("[encrypt] post-activation VACUUM complete (plaintext residue purged)");
      } catch (e) {
        log.warn?.(`[encrypt] post-activation cleanup failed: ${e.message}. Run manually after stopping the service: sqlite3 <db> "PRAGMA wal_checkpoint(TRUNCATE); VACUUM;"`);
      }
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
      return res.status(401).json({ error: "Current passphrase is incorrect" });
    } finally {
      // We don't need a second DEK in memory.
      try { probeDek && probeDek.fill(0); } catch {}
    }

    try {
      const migrate = db.transaction(() => {
        const rows = db.prepare("SELECT * FROM notes WHERE is_server_encrypted = 1").all();
        const upd = db.prepare(`
          UPDATE notes SET
            title = @title, content = @content,
            items_json = @items_json, tags_json = @tags_json,
            images_json = @images_json, color = @color,
            is_server_encrypted = 0,
            enc_version = NULL,
            enc_payload = NULL
          WHERE id = @id
        `);
        for (const row of rows) {
          // decryptRowInPlace mutates row.title / row.content / etc.
          // back to their plaintext form; we then write them straight
          // into the canonical columns.
          noteCipher.decryptRowInPlace(row);
          upd.run({
            id: row.id,
            title: row.title ?? "",
            content: row.content ?? "",
            items_json: row.items_json ?? "[]",
            tags_json: row.tags_json ?? "[]",
            images_json: row.images_json ?? "[]",
            color: row.color ?? "default",
          });
        }
        // Tag rows symmetrically: decrypt back into tags_json. We do
        // it in the same transaction as the note decryption so a half-
        // disabled state is impossible (either everything is plaintext
        // again or nothing is, and the vault row stays "enabled").
        const encTagRows = db.prepare(
          "SELECT note_id, user_id, enc_payload FROM note_user_tags WHERE is_encrypted = 1"
        ).all();
        const updTag = db.prepare(
          "UPDATE note_user_tags SET tags_json = ?, is_encrypted = 0, enc_payload = NULL WHERE note_id = ? AND user_id = ?"
        );
        for (const r of encTagRows) {
          let plain = "[]";
          if (r.enc_payload) {
            try {
              plain = noteCipher.decryptTagsPayload(r.enc_payload, {
                noteId: r.note_id,
                userId: r.user_id,
              });
            } catch (err) {
              log.warn?.(`[encrypt] could not decrypt tags during deactivation note=${r.note_id} user=${r.user_id}: ${err.message}`);
            }
          }
          updTag.run(plain, r.note_id, r.user_id);
        }
        vault.disable(db);
      });
      migrate();
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

    // Same triple-pass as activation: physically rewrite the file so
    // the encrypted ciphertext pages don't linger as freed-but-readable
    // bytes. Symmetric with the activation purge — at-rest contents
    // before-and-after are both clean.
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      db.exec("VACUUM");
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
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
