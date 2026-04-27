// server/encryption/noteCipher.js
// Encrypts/decrypts the sensitive parts of a note row + the per-user
// tag rows tied to it.
//
// What is encrypted: the user-visible content of the note — title,
// body, checklist items, the note's own tags_json default, the
// embedded images, the colour swatch — AND the per-user tags stored
// in note_user_tags. Everything else (id, owner, type, timestamps,
// archived/trashed flags, position, etc.) stays in the clear so the
// rest of the app keeps working without a decrypt round trip on every
// query.
//
// On-disk format of `notes.enc_payload` (TEXT column):
//   { v: <1|2>, iv: <b64>, c: <b64>, t: <b64> }
// where (iv, c, t) is an AES-256-GCM ciphertext of the JSON-serialised
// plaintext object below:
//   { v: 1, title, content, items_json, tags_json, images_json, color }
//
// Format versions:
//   - v1: no AAD. Original format. Readable but writable as v2 only.
//   - v2: AAD = "glasskeep|note|v1|<ownerUserId>|<noteId>". Detects
//         any ciphertext swap between rows.
// The reader handles both; the writer always emits v2.
//
// On-disk format of `note_user_tags.enc_payload` (TEXT column):
//   { v: 1, iv, c, t }
// AAD = "glasskeep|tags|v1|<userId>|<noteId>". Tag rows have no v1 era
// (the column was added in this hardening pass), so reads always
// expect v1 = AAD-bound.

const crypto = require("crypto");
const runtime = require("./runtimeUnlockState");

const ALG = "aes-256-gcm";
const IV_LEN = 12;
const NOTE_VERSION_LATEST = 2;
const NOTE_AAD_PREFIX = "glasskeep|note|v1";
const TAG_VERSION_LATEST = 1;
const TAG_AAD_PREFIX = "glasskeep|tags|v1";

// Placeholder values that take the spot of the encrypted columns in
// SQLite when a row is at-rest encrypted. They satisfy the existing
// NOT NULL constraints without leaking anything about the real
// content, and they are deliberately constant so the placeholders
// themselves don't even reveal whether a note has tags / images / etc.
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

function noteAad(ctx) {
  if (!ctx || ctx.noteId == null || ctx.userId == null) {
    throw new Error("Missing AAD context (noteId/userId)");
  }
  return Buffer.from(`${NOTE_AAD_PREFIX}|${ctx.userId}|${ctx.noteId}`, "utf8");
}

function tagAad(ctx) {
  if (!ctx || ctx.noteId == null || ctx.userId == null) {
    throw new Error("Missing AAD context (noteId/userId)");
  }
  return Buffer.from(`${TAG_AAD_PREFIX}|${ctx.userId}|${ctx.noteId}`, "utf8");
}

// ── Note payload ──────────────────────────────────────────────────────
function encryptFields(fields, ctx) {
  const dek = runtime.getDek();
  if (!dek) throw new Error("Instance is locked");
  const payload = JSON.stringify({
    v: 1,
    title: fields.title ?? "",
    content: fields.content ?? "",
    items_json: fields.items_json ?? "[]",
    tags_json: fields.tags_json ?? "[]",
    images_json: fields.images_json ?? "[]",
    color: fields.color ?? "default",
  });
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, dek, iv);
  cipher.setAAD(noteAad(ctx));
  const ct = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: NOTE_VERSION_LATEST,
    iv: iv.toString("base64"),
    c: ct.toString("base64"),
    t: tag.toString("base64"),
  });
}

function decryptPayload(encPayload, ctx) {
  const dek = runtime.getDek();
  if (!dek) throw new Error("Instance is locked");
  const obj = JSON.parse(encPayload);
  if (!obj || (obj.v !== 1 && obj.v !== 2)) {
    throw new Error("Unsupported enc payload version");
  }
  const iv = Buffer.from(obj.iv, "base64");
  const ct = Buffer.from(obj.c, "base64");
  const tag = Buffer.from(obj.t, "base64");
  const decipher = crypto.createDecipheriv(ALG, dek, iv);
  // v1 was the original format with no AAD. v2 binds the ciphertext to
  // (ownerUserId, noteId) so a thief cannot move a payload from one
  // row to another without breaking the auth tag. Reader supports
  // both; writer always emits v2 (the upgrade is performed in-place
  // by /api/instance/unlock when v1 rows are detected).
  if (obj.v === 2) {
    decipher.setAAD(noteAad(ctx));
  }
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  const fields = JSON.parse(plain);
  if (!fields || fields.v !== 1) {
    throw new Error("Unsupported note payload version");
  }
  return fields;
}

// Mutates the row in place so downstream code (serializeNote, JSON
// responses, etc.) sees the plaintext columns. No-op for plaintext rows.
// The row carries its own (id, user_id) so the caller doesn't have to
// thread the AAD context through.
function decryptRowInPlace(row) {
  if (!row) return row;
  if (!row.is_server_encrypted) return row;
  if (!row.enc_payload) return row;
  const fields = decryptPayload(row.enc_payload, {
    noteId: row.id,
    userId: row.user_id,
  });
  row.title = fields.title ?? "";
  row.content = fields.content ?? "";
  row.items_json = fields.items_json ?? "[]";
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
function prepareRowForWrite(row, ctx) {
  if (!isActive()) {
    return {
      ...row,
      is_server_encrypted: 0,
      enc_version: null,
      enc_payload: null,
    };
  }
  const enc_payload = encryptFields(row, ctx);
  return {
    ...row,
    title: PLACEHOLDERS.title,
    content: PLACEHOLDERS.content,
    items_json: PLACEHOLDERS.items_json,
    tags_json: PLACEHOLDERS.tags_json,
    images_json: PLACEHOLDERS.images_json,
    color: PLACEHOLDERS.color,
    is_server_encrypted: 1,
    enc_version: NOTE_VERSION_LATEST,
    enc_payload,
  };
}

// ── Per-user tags (note_user_tags) ────────────────────────────────────
// The encrypted column carries an AES-256-GCM ciphertext of the JSON
// tag list, bound by AAD to (noteId, userId). Without this, anyone
// able to read the SQLite file could see the tag names of every
// protected note in the clear, even though the note bodies are
// encrypted. The schema keeps a placeholder ('[]') in the original
// tags_json column so downstream code that reads the row outside the
// helper still sees a syntactically valid empty list.
function encryptTagsJson(tagsJson, ctx) {
  const dek = runtime.getDek();
  if (!dek) throw new Error("Instance is locked");
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, dek, iv);
  cipher.setAAD(tagAad(ctx));
  const ct = Buffer.concat([cipher.update(tagsJson || "[]", "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: TAG_VERSION_LATEST,
    iv: iv.toString("base64"),
    c: ct.toString("base64"),
    t: tag.toString("base64"),
  });
}

function decryptTagsPayload(encPayload, ctx) {
  const dek = runtime.getDek();
  if (!dek) throw new Error("Instance is locked");
  const obj = JSON.parse(encPayload);
  if (!obj || obj.v !== TAG_VERSION_LATEST) {
    throw new Error("Unsupported tags payload version");
  }
  const iv = Buffer.from(obj.iv, "base64");
  const ct = Buffer.from(obj.c, "base64");
  const tag = Buffer.from(obj.t, "base64");
  const decipher = crypto.createDecipheriv(ALG, dek, iv);
  decipher.setAAD(tagAad(ctx));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

module.exports = {
  isActive,
  encryptFields,
  decryptPayload,
  decryptRowInPlace,
  prepareRowForWrite,
  encryptTagsJson,
  decryptTagsPayload,
  PLACEHOLDERS,
  NOTE_VERSION_LATEST,
  TAG_VERSION_LATEST,
};
