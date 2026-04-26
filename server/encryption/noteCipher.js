// server/encryption/noteCipher.js
// Encrypts/decrypts the sensitive fields of a note row.
//
// What is encrypted: the user-visible content of the note — title,
// body, checklist items, the note's own tags_json default, the embedded
// images, and the colour swatch. Everything else (id, owner, type,
// timestamps, archived/trashed flags, position, etc.) stays in the
// clear so the rest of the app keeps working without a decrypt round
// trip on every query.
//
// Format of enc_payload (string column in `notes`):
//   { v: 1, iv: <b64>, c: <b64>, t: <b64> }
// where (iv, c, t) is an AES-256-GCM ciphertext of the JSON-serialised
// plaintext object below:
//   { v: 1, title, content, items_json, tags_json, images_json, color }

const crypto = require("crypto");
const runtime = require("./runtimeUnlockState");

const ALG = "aes-256-gcm";
const IV_LEN = 12;
const VERSION = 1;

// Placeholder values that take the spot of the encrypted columns in
// SQLite when a row is at-rest encrypted. They satisfy the existing
// NOT NULL constraints without leaking anything about the real content.
const PLACEHOLDERS = Object.freeze({
  title: "",
  content: "",
  items_json: "[]",
  tags_json: "[]",
  images_json: "[]",
  color: "default",
});

function isActive() {
  return runtime.isUnlocked();
}

function encryptFields(fields) {
  const dek = runtime.getDek();
  if (!dek) throw new Error("Instance is locked");
  const payload = JSON.stringify({
    v: VERSION,
    title: fields.title ?? "",
    content: fields.content ?? "",
    items_json: fields.items_json ?? "[]",
    tags_json: fields.tags_json ?? "[]",
    images_json: fields.images_json ?? "[]",
    color: fields.color ?? "default",
  });
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, dek, iv);
  const ct = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: VERSION,
    iv: iv.toString("base64"),
    c: ct.toString("base64"),
    t: tag.toString("base64"),
  });
}

function decryptPayload(encPayload) {
  const dek = runtime.getDek();
  if (!dek) throw new Error("Instance is locked");
  const obj = JSON.parse(encPayload);
  if (!obj || obj.v !== VERSION) {
    throw new Error("Unsupported enc payload version");
  }
  const iv = Buffer.from(obj.iv, "base64");
  const ct = Buffer.from(obj.c, "base64");
  const tag = Buffer.from(obj.t, "base64");
  const decipher = crypto.createDecipheriv(ALG, dek, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  const fields = JSON.parse(plain);
  if (!fields || fields.v !== VERSION) {
    throw new Error("Unsupported note payload version");
  }
  return fields;
}

// Mutates the row in place so downstream code (serializeNote, JSON
// responses, etc.) sees the plaintext columns. No-op for plaintext rows.
function decryptRowInPlace(row) {
  if (!row) return row;
  if (!row.is_server_encrypted) return row;
  if (!row.enc_payload) return row;
  const fields = decryptPayload(row.enc_payload);
  row.title = fields.title ?? "";
  row.content = fields.content ?? "";
  row.items_json = fields.items_json ?? "[]";
  // Note: the per-user note_user_tags table is the source of truth for
  // tags shown to a user. We still decrypt the original tags_json in
  // case a future reader needs it (e.g. for export of an owner's view),
  // but normal API paths read user tags from the per-user table.
  row.tags_json = fields.tags_json ?? "[]";
  row.images_json = fields.images_json ?? "[]";
  row.color = fields.color ?? "default";
  return row;
}

// Build the values that should hit SQLite for an INSERT or full-row
// UPDATE. When encryption is active, the sensitive columns are replaced
// with safe placeholders and the encrypted blob lands in enc_payload.
// When encryption is not active, the row is returned unchanged with the
// is_server_encrypted=0 flag.
function prepareRowForWrite(row) {
  if (!isActive()) {
    return {
      ...row,
      is_server_encrypted: 0,
      enc_version: null,
      enc_payload: null,
    };
  }
  const enc_payload = encryptFields(row);
  return {
    ...row,
    title: PLACEHOLDERS.title,
    content: PLACEHOLDERS.content,
    items_json: PLACEHOLDERS.items_json,
    // We deliberately keep `tags_json` as the placeholder too — the
    // shared default is captured inside the encrypted payload.
    tags_json: PLACEHOLDERS.tags_json,
    images_json: PLACEHOLDERS.images_json,
    color: PLACEHOLDERS.color,
    is_server_encrypted: 1,
    enc_version: VERSION,
    enc_payload,
  };
}

module.exports = {
  isActive,
  encryptFields,
  decryptPayload,
  decryptRowInPlace,
  prepareRowForWrite,
  PLACEHOLDERS,
  VERSION,
};
