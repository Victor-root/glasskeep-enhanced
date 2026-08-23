// server/encryption/passkeyVault.js
//
// Storage + crypto for WebAuthn passkeys, including the (optional)
// PRF-based wrapping of the instance DEK for admin "unlock by passkey".
//
// Two responsibilities, deliberately kept in one module:
//
//   1. Plain WebAuthn credentials                (user_passkeys)
//        - public-key blob, signature counter, transports, label
//        - whether the authenticator advertised PRF support at
//          registration time (capability gate for promotion to
//          instance-unlock)
//        - whether this credential is currently authorised to
//          unlock the instance
//
//   2. Passkey-wrapped DEK copies                (instance_passkey_unlocks)
//        - one row per credential the admin promoted to "can unlock"
//        - wrapped_dek = AES-256-GCM(KEK, DEK), with KEK derived from
//          the credential's PRF output via HKDF-SHA256
//        - never stores the PRF output itself; only the wrap
//
// Crypto layout for instance-unlock wraps:
//
//   prf_output : 32 bytes from authenticator (NEVER persisted)
//   info       : "glasskeep|passkey-instance-unlock|v1|<credentialId>"
//   KEK        : HKDF-SHA256(ikm = prf_output, salt = passkey_prf_salt,
//                            info, length = 32)
//   wrap       : AES-256-GCM(KEK, randomIV).encrypt(DEK), 16-byte tag
//
// `passkey_prf_salt` lives on the singleton instance_encryption row so
// every credential on this instance derives a different KEK while
// staying stable across restarts.

const crypto = require("crypto");
const aead = require("./aeadGcm");

// ── Schema ────────────────────────────────────────────────────────────
function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_passkeys (
      credential_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      public_key BLOB NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      name TEXT,
      device_type TEXT,
      backed_up INTEGER NOT NULL DEFAULT 0,
      prf_supported INTEGER NOT NULL DEFAULT 0,
      can_unlock_instance INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id
      ON user_passkeys(user_id);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS instance_passkey_unlocks (
      credential_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      wrapped_dek BLOB NOT NULL,
      wrap_iv BLOB NOT NULL,
      wrap_tag BLOB NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      FOREIGN KEY (credential_id) REFERENCES user_passkeys(credential_id)
        ON DELETE CASCADE
    );
  `);

  // passkey_prf_salt: 32 random bytes added once, reused across all
  // passkey unlock wraps on this instance. Adding the column lazily
  // (rather than in instanceVault.ensureSchema) keeps the legacy
  // vault contract intact for installs that never touch passkeys.
  const cols = db.prepare(`PRAGMA table_info(instance_encryption)`).all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("passkey_prf_salt")) {
    db.exec(`ALTER TABLE instance_encryption ADD COLUMN passkey_prf_salt BLOB`);
  }
}

// ── PRF salt accessor ─────────────────────────────────────────────────
// Returns the per-instance salt, generating it on first call. Safe to
// invoke even when encryption is not yet activated — the row is created
// upfront with id=1 by instanceVault.initialize, but during the brief
// window before activation we tolerate row absence.
function ensurePrfSalt(db) {
  const row = db.prepare("SELECT passkey_prf_salt FROM instance_encryption WHERE id = 1").get();
  if (row && row.passkey_prf_salt && row.passkey_prf_salt.length === 32) {
    return row.passkey_prf_salt;
  }
  const salt = crypto.randomBytes(32);
  // Upsert: row exists (encryption activated) → set the column;
  // row doesn't exist yet → create a stub. The stub is harmless even
  // if the rest of the row stays empty since enabled=0.
  if (row) {
    db.prepare("UPDATE instance_encryption SET passkey_prf_salt = ? WHERE id = 1").run(salt);
  } else {
    db.prepare(
      "INSERT INTO instance_encryption (id, enabled, schema_version, kdf_algo, kdf_params, passkey_prf_salt) " +
      "VALUES (1, 0, 0, '', '{}', ?)"
    ).run(salt);
  }
  return salt;
}

// ── KEK derivation (PRF → HKDF) ───────────────────────────────────────
function deriveKekFromPrf(prfOutput, credentialId, instanceSalt) {
  if (!Buffer.isBuffer(prfOutput) || prfOutput.length < 32) {
    throw new Error("Invalid PRF output");
  }
  const info = Buffer.from(
    `glasskeep|passkey-instance-unlock|v1|${credentialId}`,
    "utf8",
  );
  // crypto.hkdfSync exists in Node ≥15; we ship for Node 20.
  const kek = crypto.hkdfSync("sha256", prfOutput, instanceSalt, info, 32);
  return Buffer.isBuffer(kek) ? kek : Buffer.from(kek);
}

// Same construction as the vault and the note cipher, set up once in
// aeadGcm.js so the tag length cannot drift between them.
const aesGcmEncrypt = (key, plaintext) => aead.encrypt(key, plaintext);
const aesGcmDecrypt = (key, iv, ct, tag) => aead.decrypt(key, iv, ct, tag);

// ── Wrap / unwrap DEK with a passkey's PRF output ─────────────────────
function wrapDekWithPrf(db, credentialId, prfOutput, dek) {
  const salt = ensurePrfSalt(db);
  const kek = deriveKekFromPrf(prfOutput, credentialId, salt);
  try {
    return aesGcmEncrypt(kek, dek);
  } finally {
    kek.fill(0);
  }
}

function unwrapDekWithPrf(db, credentialId, prfOutput, wrap) {
  const salt = ensurePrfSalt(db);
  const kek = deriveKekFromPrf(prfOutput, credentialId, salt);
  try {
    return aesGcmDecrypt(kek, wrap.iv, wrap.ct, wrap.tag);
  } finally {
    kek.fill(0);
  }
}

// ── Passkey CRUD ──────────────────────────────────────────────────────
function listPasskeysForUser(db, userId) {
  return db.prepare(`
    SELECT credential_id, name, transports, device_type,
           backed_up, prf_supported, can_unlock_instance,
           created_at, last_used_at
    FROM user_passkeys WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(userId);
}

function getPasskey(db, credentialId) {
  return db.prepare("SELECT * FROM user_passkeys WHERE credential_id = ?").get(credentialId);
}

function getPasskeyForUser(db, credentialId, userId) {
  return db.prepare(
    "SELECT * FROM user_passkeys WHERE credential_id = ? AND user_id = ?"
  ).get(credentialId, userId);
}

function insertPasskey(db, row) {
  db.prepare(`
    INSERT INTO user_passkeys (
      credential_id, user_id, public_key, counter, transports,
      name, device_type, backed_up, prf_supported,
      created_at, last_used_at
    ) VALUES (
      @credential_id, @user_id, @public_key, @counter, @transports,
      @name, @device_type, @backed_up, @prf_supported,
      @created_at, @last_used_at
    )
  `).run(row);
}

function updateCounter(db, credentialId, counter) {
  db.prepare(
    "UPDATE user_passkeys SET counter = ?, last_used_at = ? WHERE credential_id = ?"
  ).run(counter, new Date().toISOString(), credentialId);
}

function renamePasskey(db, credentialId, userId, name) {
  return db.prepare(
    "UPDATE user_passkeys SET name = ? WHERE credential_id = ? AND user_id = ?"
  ).run(name, credentialId, userId);
}

function deletePasskey(db, credentialId, userId) {
  // ON DELETE CASCADE on instance_passkey_unlocks.credential_id wipes
  // the wrap row in the same statement, so removing a passkey also
  // removes its instance-unlock authorisation.
  return db.prepare(
    "DELETE FROM user_passkeys WHERE credential_id = ? AND user_id = ?"
  ).run(credentialId, userId);
}

function setCanUnlockInstance(db, credentialId, userId, canUnlock) {
  db.prepare(
    "UPDATE user_passkeys SET can_unlock_instance = ? WHERE credential_id = ? AND user_id = ?"
  ).run(canUnlock ? 1 : 0, credentialId, userId);
}

// ── Instance-unlock wrap rows ─────────────────────────────────────────
function listInstanceUnlockCredentialIds(db) {
  return db.prepare(`
    SELECT u.credential_id, u.user_id, p.transports
    FROM instance_passkey_unlocks u
    JOIN user_passkeys p ON p.credential_id = u.credential_id
    WHERE p.can_unlock_instance = 1
  `).all();
}

function getInstanceUnlockWrap(db, credentialId) {
  return db.prepare(
    "SELECT * FROM instance_passkey_unlocks WHERE credential_id = ?"
  ).get(credentialId);
}

function upsertInstanceUnlockWrap(db, credentialId, userId, wrap) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO instance_passkey_unlocks (
      credential_id, user_id, wrapped_dek, wrap_iv, wrap_tag,
      created_at, last_used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(credential_id) DO UPDATE SET
      user_id = excluded.user_id,
      wrapped_dek = excluded.wrapped_dek,
      wrap_iv = excluded.wrap_iv,
      wrap_tag = excluded.wrap_tag,
      created_at = excluded.created_at,
      last_used_at = NULL
  `).run(credentialId, userId, wrap.ct, wrap.iv, wrap.tag, now, null);
}

function touchInstanceUnlockWrap(db, credentialId) {
  db.prepare(
    "UPDATE instance_passkey_unlocks SET last_used_at = ? WHERE credential_id = ?"
  ).run(new Date().toISOString(), credentialId);
}

function deleteInstanceUnlockWrap(db, credentialId) {
  db.prepare(
    "DELETE FROM instance_passkey_unlocks WHERE credential_id = ?"
  ).run(credentialId);
}

// Wipe every passkey-based unlock wrap and the PRF salt. Called when
// encryption is fully deactivated — the stored wraps reference a DEK
// that no longer exists, and any subsequent activation must derive a
// fresh salt + ask each admin to re-promote their passkeys.
function disableAllPasskeyUnlocks(db) {
  db.prepare("DELETE FROM instance_passkey_unlocks").run();
  db.prepare("UPDATE user_passkeys SET can_unlock_instance = 0").run();
  db.prepare("UPDATE instance_encryption SET passkey_prf_salt = NULL WHERE id = 1").run();
}

module.exports = {
  ensureSchema,
  ensurePrfSalt,
  // Crypto
  wrapDekWithPrf,
  unwrapDekWithPrf,
  // CRUD
  listPasskeysForUser,
  getPasskey,
  getPasskeyForUser,
  insertPasskey,
  updateCounter,
  renamePasskey,
  deletePasskey,
  setCanUnlockInstance,
  // Unlock wraps
  listInstanceUnlockCredentialIds,
  getInstanceUnlockWrap,
  upsertInstanceUnlockWrap,
  touchInstanceUnlockWrap,
  deleteInstanceUnlockWrap,
  disableAllPasskeyUnlocks,
};
