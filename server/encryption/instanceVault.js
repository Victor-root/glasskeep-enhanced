// server/encryption/instanceVault.js
// Persistence layer for at-rest encryption metadata.
//
// Crypto choices:
//   - KDF:  scrypt (Node native, no extra deps), N=2^15 r=8 p=1 → 32-byte KEK
//   - Wrap: AES-256-GCM(KEK, randomIV) on the 32-byte DEK, with a tag
//   - DEK:  32 random bytes, AES-256-GCM key for note payloads
//
// The vault stores TWO independently-wrapped copies of the same DEK:
//   - one wrapped under the passphrase (normal admin flow)
//   - one wrapped under the recovery key (paper-backup flow)
// Either copy can unlock the instance; rotating the passphrase only
// rewraps the passphrase copy and leaves the recovery copy untouched.

const crypto = require("crypto");
const recoveryKey = require("./recoveryKey");

const SCHEMA_VERSION = 1;
const KDF_ALGO = "scrypt";
const KDF_PARAMS = { N: 1 << 15, r: 8, p: 1, len: 32 };
const WRAP_ALGO = "aes-256-gcm";
const SALT_LEN = 16;
const IV_LEN = 12;

// Sentinel encrypted with the DEK so we can verify after unwrap that we
// got the right key (rather than waiting for the first note decrypt to
// fail). Stored once at vault-creation time, re-checked on each unlock.
const DEK_CHECK_PLAINTEXT = "GKVAULT-OK-v1";

// ── Schema ────────────────────────────────────────────────────────────
function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS instance_encryption (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      schema_version INTEGER NOT NULL,
      kdf_algo TEXT NOT NULL,
      kdf_params TEXT NOT NULL,
      passphrase_salt BLOB,
      recovery_salt BLOB,
      wrapped_dek_pass BLOB,
      wrapped_dek_pass_iv BLOB,
      wrapped_dek_pass_tag BLOB,
      wrapped_dek_recv BLOB,
      wrapped_dek_recv_iv BLOB,
      wrapped_dek_recv_tag BLOB,
      dek_check BLOB,
      dek_check_iv BLOB,
      dek_check_tag BLOB,
      initialized_at TEXT,
      migrated_at TEXT,
      last_unlocked_at TEXT
    );
  `);
  // Notes table: extra columns to carry the encrypted payload.
  const cols = db.prepare(`PRAGMA table_info(notes)`).all();
  const names = new Set(cols.map((c) => c.name));
  const tx = db.transaction(() => {
    if (!names.has("is_server_encrypted")) {
      db.exec(`ALTER TABLE notes ADD COLUMN is_server_encrypted INTEGER NOT NULL DEFAULT 0`);
    }
    if (!names.has("enc_version")) {
      db.exec(`ALTER TABLE notes ADD COLUMN enc_version INTEGER`);
    }
    if (!names.has("enc_payload")) {
      db.exec(`ALTER TABLE notes ADD COLUMN enc_payload TEXT`);
    }
  });
  tx();
}

function loadRow(db) {
  return db.prepare("SELECT * FROM instance_encryption WHERE id = 1").get() || null;
}

// ── Crypto primitives ─────────────────────────────────────────────────
function deriveKek(secret, salt) {
  return crypto.scryptSync(
    Buffer.from(secret, "utf8"),
    salt,
    KDF_PARAMS.len,
    { N: KDF_PARAMS.N, r: KDF_PARAMS.r, p: KDF_PARAMS.p, maxmem: 256 * 1024 * 1024 },
  );
}

function aesGcmEncrypt(key, plaintext) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(WRAP_ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, ct, tag };
}

function aesGcmDecrypt(key, iv, ct, tag) {
  const decipher = crypto.createDecipheriv(WRAP_ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

function wrapDek(secret, salt, dek) {
  const kek = deriveKek(secret, salt);
  try {
    return aesGcmEncrypt(kek, dek);
  } finally {
    kek.fill(0);
  }
}

function unwrapDek(secret, salt, wrap) {
  const kek = deriveKek(secret, salt);
  try {
    return aesGcmDecrypt(kek, wrap.iv, wrap.ct, wrap.tag);
  } finally {
    kek.fill(0);
  }
}

// ── Public API ────────────────────────────────────────────────────────

function isInitialized(db) {
  const row = loadRow(db);
  return !!(row && row.enabled);
}

function getStatusRow(db) { return loadRow(db); }

// First-time setup: generate a DEK, wrap it under (passphrase, recovery
// key), persist everything, and return both the DEK and the freshly-
// generated recovery key. The recovery key is shown to the admin once
// and never re-fetchable from the database.
function initialize(db, passphrase) {
  if (typeof passphrase !== "string" || passphrase.length < 8) {
    throw new Error("Passphrase must be at least 8 characters.");
  }
  ensureSchema(db);
  const existing = loadRow(db);
  if (existing && existing.enabled) {
    throw new Error("Encryption is already initialized.");
  }

  const dek = crypto.randomBytes(32);
  const recovery = recoveryKey.generateRecoveryKey();
  const recoveryNorm = recoveryKey.normalizeRecoveryKey(recovery);
  if (!recoveryNorm) throw new Error("Failed to generate a normalised recovery key");
  const passSalt = crypto.randomBytes(SALT_LEN);
  const recvSalt = crypto.randomBytes(SALT_LEN);

  const passWrap = wrapDek(passphrase, passSalt, dek);
  // KDF input is the normalised (24-char, no prefix, no dashes) form so
  // user-typed variants like "gkrv xxxx-xxxx ..." derive the same KEK.
  const recvWrap = wrapDek(recoveryNorm, recvSalt, dek);
  const dekCheck = aesGcmEncrypt(dek, Buffer.from(DEK_CHECK_PLAINTEXT, "utf8"));

  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO instance_encryption (
      id, enabled, schema_version, kdf_algo, kdf_params,
      passphrase_salt, recovery_salt,
      wrapped_dek_pass, wrapped_dek_pass_iv, wrapped_dek_pass_tag,
      wrapped_dek_recv, wrapped_dek_recv_iv, wrapped_dek_recv_tag,
      dek_check, dek_check_iv, dek_check_tag,
      initialized_at, migrated_at, last_unlocked_at
    ) VALUES (
      1, 1, @schema_version, @kdf_algo, @kdf_params,
      @passphrase_salt, @recovery_salt,
      @wrapped_dek_pass, @wrapped_dek_pass_iv, @wrapped_dek_pass_tag,
      @wrapped_dek_recv, @wrapped_dek_recv_iv, @wrapped_dek_recv_tag,
      @dek_check, @dek_check_iv, @dek_check_tag,
      @initialized_at, @migrated_at, @last_unlocked_at
    )
    ON CONFLICT(id) DO UPDATE SET
      enabled = 1,
      schema_version = excluded.schema_version,
      kdf_algo = excluded.kdf_algo,
      kdf_params = excluded.kdf_params,
      passphrase_salt = excluded.passphrase_salt,
      recovery_salt = excluded.recovery_salt,
      wrapped_dek_pass = excluded.wrapped_dek_pass,
      wrapped_dek_pass_iv = excluded.wrapped_dek_pass_iv,
      wrapped_dek_pass_tag = excluded.wrapped_dek_pass_tag,
      wrapped_dek_recv = excluded.wrapped_dek_recv,
      wrapped_dek_recv_iv = excluded.wrapped_dek_recv_iv,
      wrapped_dek_recv_tag = excluded.wrapped_dek_recv_tag,
      dek_check = excluded.dek_check,
      dek_check_iv = excluded.dek_check_iv,
      dek_check_tag = excluded.dek_check_tag,
      initialized_at = excluded.initialized_at,
      migrated_at = excluded.migrated_at,
      last_unlocked_at = excluded.last_unlocked_at
  `);
  upsert.run({
    schema_version: SCHEMA_VERSION,
    kdf_algo: KDF_ALGO,
    kdf_params: JSON.stringify(KDF_PARAMS),
    passphrase_salt: passSalt,
    recovery_salt: recvSalt,
    wrapped_dek_pass: passWrap.ct,
    wrapped_dek_pass_iv: passWrap.iv,
    wrapped_dek_pass_tag: passWrap.tag,
    wrapped_dek_recv: recvWrap.ct,
    wrapped_dek_recv_iv: recvWrap.iv,
    wrapped_dek_recv_tag: recvWrap.tag,
    dek_check: dekCheck.ct,
    dek_check_iv: dekCheck.iv,
    dek_check_tag: dekCheck.tag,
    initialized_at: now,
    migrated_at: null,
    last_unlocked_at: now,
  });

  return { dek, recoveryKey: recovery };
}

// Verify a freshly-unwrapped DEK against the persisted sentinel.
// Throws if the bytes don't decrypt the sentinel (= wrong key).
function verifyDek(row, dek) {
  const plain = aesGcmDecrypt(
    dek,
    row.dek_check_iv,
    row.dek_check,
    row.dek_check_tag,
  ).toString("utf8");
  if (plain !== DEK_CHECK_PLAINTEXT) {
    throw new Error("DEK self-check failed");
  }
}

function unlockWithPassphrase(db, passphrase) {
  const row = loadRow(db);
  if (!row || !row.enabled) throw new Error("Encryption not enabled");
  const dek = unwrapDek(passphrase, row.passphrase_salt, {
    iv: row.wrapped_dek_pass_iv,
    ct: row.wrapped_dek_pass,
    tag: row.wrapped_dek_pass_tag,
  });
  verifyDek(row, dek);
  return dek;
}

function unlockWithRecoveryKey(db, rawKey) {
  const norm = recoveryKey.normalizeRecoveryKey(rawKey);
  if (!norm) throw new Error("Invalid recovery key format");
  const row = loadRow(db);
  if (!row || !row.enabled) throw new Error("Encryption not enabled");
  const dek = unwrapDek(norm, row.recovery_salt, {
    iv: row.wrapped_dek_recv_iv,
    ct: row.wrapped_dek_recv,
    tag: row.wrapped_dek_recv_tag,
  });
  verifyDek(row, dek);
  return dek;
}

// Replace the passphrase-wrapped copy of the DEK. The caller must
// already hold the live DEK in memory (i.e. the instance is unlocked).
function rewrapWithNewPassphrase(db, dek, newPassphrase) {
  if (typeof newPassphrase !== "string" || newPassphrase.length < 8) {
    throw new Error("Passphrase must be at least 8 characters.");
  }
  const passSalt = crypto.randomBytes(SALT_LEN);
  const wrap = wrapDek(newPassphrase, passSalt, dek);
  db.prepare(`
    UPDATE instance_encryption SET
      passphrase_salt = ?,
      wrapped_dek_pass = ?,
      wrapped_dek_pass_iv = ?,
      wrapped_dek_pass_tag = ?
    WHERE id = 1
  `).run(passSalt, wrap.ct, wrap.iv, wrap.tag);
}

// Generate a new recovery key (text), wrap the live DEK under it, and
// persist. The old recovery key stops working immediately.
function regenerateRecoveryKey(db, dek) {
  const recovery = recoveryKey.generateRecoveryKey();
  const recoveryNorm = recoveryKey.normalizeRecoveryKey(recovery);
  const recvSalt = crypto.randomBytes(SALT_LEN);
  const wrap = wrapDek(recoveryNorm, recvSalt, dek);
  db.prepare(`
    UPDATE instance_encryption SET
      recovery_salt = ?,
      wrapped_dek_recv = ?,
      wrapped_dek_recv_iv = ?,
      wrapped_dek_recv_tag = ?
    WHERE id = 1
  `).run(recvSalt, wrap.ct, wrap.iv, wrap.tag);
  return recovery;
}

function markMigrated(db) {
  db.prepare("UPDATE instance_encryption SET migrated_at = ? WHERE id = 1")
    .run(new Date().toISOString());
}

function markUnlockedNow(db) {
  db.prepare("UPDATE instance_encryption SET last_unlocked_at = ? WHERE id = 1")
    .run(new Date().toISOString());
}

module.exports = {
  ensureSchema,
  isInitialized,
  getStatusRow,
  initialize,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
  rewrapWithNewPassphrase,
  regenerateRecoveryKey,
  markMigrated,
  markUnlockedNow,
  SCHEMA_VERSION,
};
