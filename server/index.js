// server/index.js
// Express + SQLite (better-sqlite3) + JWT auth API for Glass Keep

const path = require("path");
const fs = require("fs");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const cors = require("cors");
const crypto = require("crypto");

// Transformers.js for server-side AI
let pipeline;
let env;
let aiGenerator = null;

async function initServerAI() {
  if (aiGenerator) return;
  try {
    // Dynamic import since transformers is ESM and this is CJS
    const transformers = await import('@huggingface/transformers');
    pipeline = transformers.pipeline;
    env = transformers.env;

    // Configure env for server
    env.allowLocalModels = false;
    // Cache directory for AI models
    env.cacheDir = path.join(__dirname, '..', 'data', 'ai-cache');

    console.log("Loading high-stability AI model (Llama-3.2-1B)...");
    // Llama-3.2-1B-Instruct-ONNX is highly compatible and excels at instruction following
    aiGenerator = await pipeline('text-generation', 'onnx-community/Llama-3.2-1B-Instruct-ONNX', {
      dtype: 'q4', // 4-bit quantization (~0.7GB RAM)
    });
    console.log("Llama AI model loaded on server.");
  } catch (err) {
    console.error("Failed to load AI on server:", err);
  }
}
// Start loading AI in background (disabled by default - will load on first use)
// initServerAI().catch(console.error);

const app = express();
const PORT = Number(process.env.API_PORT || process.env.PORT || 8080);
const NODE_ENV = process.env.NODE_ENV || "development";

// ---------- JWT_SECRET validation (fail-closed) ----------
const UNSAFE_SECRETS = new Set([
  "dev-secret-please-change",
  "dev-please-change",
  "change-me",
  "changeme",
  "secret",
  "password",
  "your-secret-here",
  "replace-me",
]);

const JWT_SECRET = (() => {
  const raw = process.env.JWT_SECRET;
  if (!raw || !raw.trim()) {
    console.error(
      "\n[FATAL] JWT_SECRET is not set or empty.\n" +
      "The server cannot start without a valid JWT secret.\n" +
      "Set JWT_SECRET in your environment or .env file.\n" +
      "Generate one with: openssl rand -hex 32\n"
    );
    process.exit(1);
  }
  const trimmed = raw.trim();
  if (UNSAFE_SECRETS.has(trimmed.toLowerCase())) {
    console.error(
      `\n[FATAL] JWT_SECRET is set to an unsafe placeholder value ("${trimmed}").\n` +
      "The server cannot start with a known weak secret.\n" +
      "Replace it with a strong, unique secret.\n" +
      "Generate one with: openssl rand -hex 32\n"
    );
    process.exit(1);
  }
  return trimmed;
})();

// ---------- Body parsing ----------
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Trust proxy headers (X-Forwarded-Proto / X-Forwarded-For) when:
//   - the operator explicitly set TRUST_PROXY=true, OR
//   - HTTPS is disabled at the Node level (HTTPS_ENABLED=false), which
//     means TLS is necessarily terminated at an upstream reverse proxy.
// Without this, req.secure stays false on a perfectly-fine HTTPS request
// forwarded by Nginx/Caddy/Traefik, and the at-rest unlock endpoint
// would refuse the request as "plaintext HTTP".
const TRUST_PROXY = process.env.TRUST_PROXY === "true"
  || process.env.HTTPS_ENABLED === "false";
if (TRUST_PROXY) app.set("trust proxy", true);

// ---------- CORS (dev only) ----------
if (NODE_ENV !== "production") {
  app.use(
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: false,
    })
  );
}

// ---------- SQLite ----------
const dbFile =
  process.env.DB_FILE ||
  process.env.SQLITE_FILE ||
  path.join(__dirname, "data.sqlite");

// Ensure the directory for the DB exists
try {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
} catch (e) {
  console.error("Failed to ensure DB directory:", e);
}

const db = new Database(dbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Fresh tables (safe if already exist)
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  secret_key_hash TEXT,
  secret_key_created_at TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,          -- "text" | "checklist"
  title TEXT NOT NULL,
  content TEXT NOT NULL,       -- for text notes
  items_json TEXT NOT NULL,    -- JSON array for checklist items
  tags_json TEXT NOT NULL,     -- JSON string array
  images_json TEXT NOT NULL,   -- JSON image objects {id,src,name}
  color TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0, -- for ordering (higher first)
  timestamp TEXT NOT NULL,
  updated_at TEXT,             -- for tracking last edit time
  last_edited_by TEXT,         -- email/name of last editor
  last_edited_at TEXT,         -- timestamp of last edit
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS note_collaborators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  added_by INTEGER NOT NULL,
  added_at TEXT NOT NULL,
  FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(added_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(note_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY,
  settings_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS note_user_tags (
  note_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (note_id, user_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_reorder_state (
  user_id INTEGER PRIMARY KEY,
  last_reorder_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS note_user_positions (
  note_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (note_id, user_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pending_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

// Tiny migrations (safe to run repeatedly)
(function ensureColumns() {
  try {
    const cols = db.prepare(`PRAGMA table_info(users)`).all();
    const names = new Set(cols.map((c) => c.name));
    const tx = db.transaction(() => {
      if (!names.has("is_admin")) {
        db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`);
      }
      if (!names.has("secret_key_hash")) {
        db.exec(`ALTER TABLE users ADD COLUMN secret_key_hash TEXT`);
      }
      if (!names.has("secret_key_created_at")) {
        db.exec(`ALTER TABLE users ADD COLUMN secret_key_created_at TEXT`);
      }
      if (!names.has("avatar_url")) {
        db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT`);
      }
      if (!names.has("show_on_login")) {
        db.exec(`ALTER TABLE users ADD COLUMN show_on_login INTEGER NOT NULL DEFAULT 0`);
      }
      if (!names.has("must_change_password")) {
        db.exec(`ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`);
      }
    });
    tx();
  } catch {
    // ignore if ALTER not supported or already applied
  }
})();

// Notes table migrations
(function ensureNoteColumns() {
  try {
    const cols = db.prepare(`PRAGMA table_info(notes)`).all();
    const names = new Set(cols.map((c) => c.name));
    const tx = db.transaction(() => {
      if (!names.has("updated_at")) {
        db.exec(`ALTER TABLE notes ADD COLUMN updated_at TEXT`);
      }
      if (!names.has("last_edited_by")) {
        db.exec(`ALTER TABLE notes ADD COLUMN last_edited_by TEXT`);
      }
      if (!names.has("last_edited_at")) {
        db.exec(`ALTER TABLE notes ADD COLUMN last_edited_at TEXT`);
      }
      if (!names.has("archived")) {
        db.exec(`ALTER TABLE notes ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`);
      }
      if (!names.has("trashed")) {
        db.exec(`ALTER TABLE notes ADD COLUMN trashed INTEGER NOT NULL DEFAULT 0`);
      }
      if (!names.has("client_updated_at")) {
        db.exec(`ALTER TABLE notes ADD COLUMN client_updated_at TEXT`);
        // Backfill: use updated_at → timestamp → now, so no NULL values break LWW comparison
        db.exec(`UPDATE notes SET client_updated_at = COALESCE(updated_at, timestamp, '${new Date().toISOString()}')`);
      }
      if (!names.has("position")) {
        db.exec(`ALTER TABLE notes ADD COLUMN position REAL NOT NULL DEFAULT 0`);
        // Backfill: set position = creation timestamp (ms) so notes sort by creation date
        db.exec(`UPDATE notes SET position = CAST(strftime('%s', COALESCE(timestamp, '1970-01-01')) AS REAL) * 1000`);
      }
    });
    tx();
  } catch {
    // ignore if ALTER not supported or already applied
  }
})();

// Migrate existing note tags into per-user table (one-time)
(function migrateTagsToPerUser() {
  try {
    const count = db.prepare("SELECT COUNT(*) as c FROM note_user_tags").get();
    if (count.c === 0) {
      const migrated = db.prepare(`
        INSERT OR IGNORE INTO note_user_tags (note_id, user_id, tags_json)
        SELECT id, user_id, tags_json FROM notes
        WHERE tags_json != '[]' AND tags_json IS NOT NULL AND tags_json != ''
      `).run();
      if (migrated.changes > 0) {
        console.log(`[Migration] Copied tags for ${migrated.changes} notes to per-user table`);
      }
    }
  } catch (e) {
    console.error("[Migration] Tag migration error:", e);
  }
})();

// ---------- At-rest encryption (server-side, app-level unlock) ----------
// Sensitive fields of every note can be stored encrypted on disk. The
// data-encryption key (DEK) lives only in RAM after an admin unlocks
// the instance. See server/encryption/* for the full design.
const instanceVault = require("./encryption/instanceVault");
const noteCipher = require("./encryption/noteCipher");
const runtimeUnlock = require("./encryption/runtimeUnlockState");
const { attachUnlockRoutes } = require("./routes/unlockRoutes");
const { requireUnlocked } = require("./routes/lockMiddleware");

instanceVault.ensureSchema(db);
{
  const row = instanceVault.getStatusRow(db);
  if (row && row.enabled) {
    runtimeUnlock.setEnabled(true);
    console.log("[encrypt] At-rest encryption is ENABLED. Instance starts LOCKED — admin must unlock.");
  } else {
    runtimeUnlock.setEnabled(false);
    console.log("[encrypt] At-rest encryption is disabled.");
  }
}

// Optionally promote admins from env (comma-separated)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Function to promote user to admin if they're in the admin list
function promoteToAdminIfNeeded(email) {
  if (ADMIN_EMAILS.length && ADMIN_EMAILS.includes(email.toLowerCase())) {
    const mkAdmin = db.prepare("UPDATE users SET is_admin=1 WHERE lower(email)=?");
    mkAdmin.run(email.toLowerCase());
    console.log(`Promoted user ${email} to admin`);
    return true;
  }
  return false;
}

// Promote existing users to admin on startup
if (ADMIN_EMAILS.length) {
  console.log(`Admin emails configured: ${ADMIN_EMAILS.join(', ')}`);
  const mkAdmin = db.prepare("UPDATE users SET is_admin=1 WHERE lower(email)=?");
  for (const e of ADMIN_EMAILS) {
    const result = mkAdmin.run(e);
    if (result.changes > 0) {
      console.log(`Promoted existing user ${e} to admin`);
    }
  }
}

// ---------- Helpers ----------
const nowISO = () => new Date().toISOString();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ── LWW timestamp validation & comparison ──
// All timestamps must be valid ISO 8601 UTC. We parse, validate, and normalize
// before storage so comparisons are always reliable (millisecond precision).
// Rejects: non-ISO strings, offsets other than Z (force canonical UTC),
// absurd future skew (>5 min ahead).
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Parse and validate an ISO timestamp string.
 * Returns { ms, iso } on success, null on failure.
 * Only accepts full ISO 8601 with Z suffix (canonical UTC).
 */
function parseIsoTimestamp(ts) {
  if (typeof ts !== "string" || !ts) return null;
  // Must be a valid ISO string ending in Z (UTC)
  // Accept: 2026-04-01T12:34:56.789Z or 2026-04-01T12:34:56Z
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(ts)) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  return { ms: d.getTime(), iso: d.toISOString() };
}

/**
 * Validate a client timestamp for LWW.
 * Returns { ms, iso } on success.
 * Returns { error: string } if invalid or too far in the future.
 */
function validateLwwTimestamp(ts) {
  const parsed = parseIsoTimestamp(ts);
  if (!parsed) return { error: `Invalid timestamp format (expected ISO 8601 UTC ending in Z): ${ts}` };
  if (parsed.ms > Date.now() + MAX_FUTURE_SKEW_MS) {
    return { error: `Timestamp too far in the future: ${ts}` };
  }
  return parsed;
}

/**
 * LWW comparison on milliseconds.
 * Returns true if incoming should win (newer or equal).
 */
function isNewerOrEqual(incomingMs, storedTs) {
  if (!storedTs) return true;       // no stored timestamp → first write wins
  if (!incomingMs) return false;    // no incoming → reject
  const storedParsed = parseIsoTimestamp(storedTs);
  if (!storedParsed) return true;   // stored is corrupt → accept to fix it
  return incomingMs >= storedParsed.ms;
}

// Serialize a DB row into the canonical JSON note object returned by all endpoints.
// When userId is provided, tags come from the per-user note_user_tags table and
// pinned/position come from note_user_positions (falling back to note defaults).
function serializeNote(r, userId) {
  const tagsJson = userId ? getUserTags(r.id, userId) : (r.tags_json || "[]");
  let pinned = !!r.pinned;
  let position = r.position;
  if (r && Object.prototype.hasOwnProperty.call(r, "eff_pinned")) {
    pinned = !!r.eff_pinned;
    position = r.eff_position;
  } else if (userId) {
    const ov = getUserPosition(r.id, userId);
    if (ov) {
      pinned = !!ov.pinned;
      position = ov.position;
    }
  }
  return {
    id: r.id,
    user_id: r.user_id,
    type: r.type,
    title: r.title,
    content: r.content,
    items: JSON.parse(r.items_json || "[]"),
    tags: JSON.parse(tagsJson),
    images: JSON.parse(r.images_json || "[]"),
    color: r.color,
    pinned,
    position,
    timestamp: r.timestamp,
    updated_at: r.updated_at,
    client_updated_at: r.client_updated_at,
    lastEditedBy: r.last_edited_by,
    lastEditedAt: r.last_edited_at,
    archived: !!r.archived,
    trashed: !!r.trashed,
  };
}

function signToken(user) {
  return jwt.sign(
    {
      uid: user.id,
      email: user.email,
      name: user.name,
      is_admin: !!user.is_admin,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.uid,
      email: payload.email,
      name: payload.name,
      is_admin: !!payload.is_admin,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Auth that also supports token in query string for EventSource
function authFromQueryOrHeader(req, res, next) {
  const h = req.headers.authorization || "";
  const headerToken = h.startsWith("Bearer ") ? h.slice(7) : null;
  const queryToken = req.query && typeof req.query.token === "string" ? req.query.token : null;
  const token = headerToken || queryToken;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.uid,
      email: payload.email,
      name: payload.name,
      is_admin: !!payload.is_admin,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

const insertUser = db.prepare(
  "INSERT INTO users (name,email,password_hash,created_at) VALUES (?,?,?,?)"
);

// No default admin account — admin must be created explicitly via install.sh
// If the database is empty and no admin exists, the server starts but
// login/register endpoints will be the only way to create users.
// The install.sh script handles initial admin creation at install time.
const getUserById = db.prepare("SELECT * FROM users WHERE id = ?");

// Defined here (instead of next to /api/admin routes) so the unlock
// routes registered before the bulk of the API can also rely on it.
function adminOnly(req, res, next) {
  const row = getUserById.get(req.user.id);
  if (!row || !row.is_admin) return res.status(403).json({ error: "Admin only" });
  next();
}

// getNoteById is wrapped further down once `noteCipher` and the read
// helper have been declared. This raw handle is only used for the
// initial migration check below; runtime code uses the wrapped version.
const getNoteByIdRaw = db.prepare("SELECT * FROM notes WHERE id = ?");
const getUserSettings = db.prepare("SELECT settings_json FROM user_settings WHERE user_id = ?");
const upsertUserSettings = db.prepare(
  `INSERT INTO user_settings (user_id, settings_json) VALUES (?, ?)
   ON CONFLICT(user_id) DO UPDATE SET settings_json = excluded.settings_json`
);

// Notes statements
// Reads are wrapped with `wrapNoteRead*` so encrypted rows come back as
// plaintext to the rest of the app. Writes go through `runInsertNote`
// and `runUpdateNoteFullCollab` / `runPatchNoteSensitiveCollab` so the
// sensitive columns are encrypted at rest when the instance is unlocked.
function wrapNoteReadStmt(stmt) {
  return {
    get: (...args) => noteCipher.decryptRowInPlace(stmt.get(...args)),
    all: (...args) => stmt.all(...args).map(noteCipher.decryptRowInPlace),
    raw: stmt,
  };
}
function decryptRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(noteCipher.decryptRowInPlace);
}

const listNotes = wrapNoteReadStmt(db.prepare(
  `SELECT * FROM notes WHERE user_id = ? AND archived = 0 AND trashed = 0 ORDER BY pinned DESC, position DESC, timestamp DESC`
));
const listArchivedNotes = wrapNoteReadStmt(db.prepare(
  `SELECT * FROM notes WHERE user_id = ? AND archived = 1 AND trashed = 0 ORDER BY timestamp DESC`
));
const listTrashedNotes = wrapNoteReadStmt(db.prepare(
  `SELECT * FROM notes WHERE user_id = ? AND trashed = 1 ORDER BY timestamp DESC`
));
const listNotesPage = wrapNoteReadStmt(db.prepare(
  `SELECT * FROM notes WHERE user_id = ? ORDER BY pinned DESC, position DESC, timestamp DESC LIMIT ? OFFSET ?`
));
const getNoteById = wrapNoteReadStmt(getNoteByIdRaw);
const getNote = wrapNoteReadStmt(db.prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?"));
const getNoteWithCollaboration = wrapNoteReadStmt(db.prepare(`
  SELECT n.* FROM notes n
  LEFT JOIN note_collaborators nc ON n.id = nc.note_id AND nc.user_id = ?
  WHERE n.id = ? AND (n.user_id = ? OR nc.user_id IS NOT NULL)
`));

const insertNoteStmt = db.prepare(`
  INSERT INTO notes (id,user_id,type,title,content,items_json,tags_json,images_json,color,pinned,position,timestamp,archived,trashed,client_updated_at,is_server_encrypted,enc_version,enc_payload)
  VALUES (@id,@user_id,@type,@title,@content,@items_json,@tags_json,@images_json,@color,@pinned,@position,@timestamp,0,0,@client_updated_at,@is_server_encrypted,@enc_version,@enc_payload)
`);
const updateNoteFullCollabStmt = db.prepare(`
  UPDATE notes SET
    type=@type, title=@title, content=@content, items_json=@items_json, tags_json=@tags_json,
    images_json=@images_json, color=@color, pinned=@pinned, position=@position, timestamp=@timestamp,
    client_updated_at=@client_updated_at,
    is_server_encrypted=@is_server_encrypted, enc_version=@enc_version, enc_payload=@enc_payload
  WHERE id=@id AND (user_id=@user_id OR EXISTS(
    SELECT 1 FROM note_collaborators nc
    WHERE nc.note_id=@id AND nc.user_id=@user_id
  ))
`);
const patchNoteSensitiveCollabStmt = db.prepare(`
  UPDATE notes SET
    title=@title, content=@content, items_json=@items_json, tags_json=@tags_json,
    images_json=@images_json, color=@color,
    pinned=COALESCE(@pinned,pinned),
    timestamp=COALESCE(@timestamp,timestamp),
    client_updated_at=COALESCE(@client_updated_at,client_updated_at),
    is_server_encrypted=@is_server_encrypted, enc_version=@enc_version, enc_payload=@enc_payload
  WHERE id=@id AND (user_id=@user_id OR EXISTS(
    SELECT 1 FROM note_collaborators nc
    WHERE nc.note_id=@id AND nc.user_id=@user_id
  ))
`);

// Build a row that's safe to feed to insertNoteStmt: encrypts the
// sensitive fields if the instance is unlocked, leaves them in the
// clear with is_server_encrypted=0 otherwise.
function buildWriteRow(fields) {
  return noteCipher.prepareRowForWrite({
    title: fields.title ?? "",
    content: fields.content ?? "",
    items_json: fields.items_json ?? "[]",
    tags_json: fields.tags_json ?? "[]",
    images_json: fields.images_json ?? "[]",
    color: fields.color ?? "default",
  });
}

function runInsertNote(n) {
  const w = buildWriteRow(n);
  return insertNoteStmt.run({
    id: n.id,
    user_id: n.user_id,
    type: n.type,
    title: w.title,
    content: w.content,
    items_json: w.items_json,
    tags_json: w.tags_json,
    images_json: w.images_json,
    color: w.color,
    pinned: n.pinned,
    position: n.position,
    timestamp: n.timestamp,
    client_updated_at: n.client_updated_at,
    is_server_encrypted: w.is_server_encrypted,
    enc_version: w.enc_version,
    enc_payload: w.enc_payload,
  });
}

function runUpdateNoteFullCollab(updated) {
  const w = buildWriteRow(updated);
  return updateNoteFullCollabStmt.run({
    id: updated.id,
    user_id: updated.user_id,
    type: updated.type,
    title: w.title,
    content: w.content,
    items_json: w.items_json,
    tags_json: w.tags_json,
    images_json: w.images_json,
    color: w.color,
    pinned: updated.pinned,
    position: updated.position,
    timestamp: updated.timestamp,
    client_updated_at: updated.client_updated_at,
    is_server_encrypted: w.is_server_encrypted,
    enc_version: w.enc_version,
    enc_payload: w.enc_payload,
  });
}

// Read-merge-write pattern: with encryption on, partial PATCH on a
// sensitive column is impossible at the SQL layer because the entire
// payload is encrypted as a single blob. We merge the partial fields
// with the (already-decrypted) existing row and rewrite the blob.
// With encryption off, we still go through the same merge so the
// behaviour is identical from the route's perspective.
function runPatchNoteSensitiveCollab(id, userId, partial) {
  const existing = getNoteWithCollaboration.get(userId, id, userId);
  if (!existing) return { changes: 0 };
  const merged = {
    title: partial.title != null ? partial.title : (existing.title ?? ""),
    content: partial.content != null ? partial.content : (existing.content ?? ""),
    items_json: partial.items_json != null ? partial.items_json : (existing.items_json ?? "[]"),
    tags_json: partial.tags_json != null ? partial.tags_json : (existing.tags_json ?? "[]"),
    images_json: partial.images_json != null ? partial.images_json : (existing.images_json ?? "[]"),
    color: partial.color != null ? partial.color : (existing.color ?? "default"),
  };
  const w = buildWriteRow(merged);
  return patchNoteSensitiveCollabStmt.run({
    id,
    user_id: userId,
    title: w.title,
    content: w.content,
    items_json: w.items_json,
    tags_json: w.tags_json,
    images_json: w.images_json,
    color: w.color,
    pinned: partial.pinned ?? null,
    timestamp: partial.timestamp ?? null,
    client_updated_at: partial.client_updated_at ?? null,
    is_server_encrypted: w.is_server_encrypted,
    enc_version: w.enc_version,
    enc_payload: w.enc_payload,
  });
}
const getLastReorderAt = db.prepare("SELECT last_reorder_at FROM user_reorder_state WHERE user_id = ?");
const upsertReorderAt = db.prepare(`
  INSERT INTO user_reorder_state (user_id, last_reorder_at) VALUES (?, ?)
  ON CONFLICT(user_id) DO UPDATE SET last_reorder_at = excluded.last_reorder_at
`);
const deleteNote = db.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?");

// Collaboration statements
const getUserByEmail = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?)");
const getUserByName = db.prepare("SELECT * FROM users WHERE lower(name)=lower(?)");
const addCollaborator = db.prepare(`
  INSERT INTO note_collaborators (note_id, user_id, added_by, added_at)
  VALUES (?, ?, ?, ?)
`);
const getNoteCollaborators = db.prepare(`
  SELECT u.id, u.name, u.email, u.avatar_url, nc.added_at, nc.added_by
  FROM note_collaborators nc
  JOIN users u ON nc.user_id = u.id
  WHERE nc.note_id = ?
`);
const updateNoteWithEditor = db.prepare(`
  UPDATE notes SET
    updated_at = ?,
    last_edited_by = ?,
    last_edited_at = ?
  WHERE id = ?
`);

// Per-user tags
const getUserTagsForNote = db.prepare(
  "SELECT tags_json FROM note_user_tags WHERE note_id = ? AND user_id = ?"
);
const upsertUserTags = db.prepare(
  `INSERT INTO note_user_tags (note_id, user_id, tags_json) VALUES (?, ?, ?)
   ON CONFLICT(note_id, user_id) DO UPDATE SET tags_json = excluded.tags_json`
);

function getUserTags(noteId, userId) {
  const row = getUserTagsForNote.get(noteId, userId);
  return row ? row.tags_json : "[]";
}

// Per-user position/pinned override for shared notes.
// Each participant (owner or collaborator) keeps their own ordering state here;
// the notes row only holds the initial default.
const getUserPositionForNote = db.prepare(
  "SELECT position, pinned FROM note_user_positions WHERE note_id = ? AND user_id = ?"
);
const upsertUserPosition = db.prepare(`
  INSERT INTO note_user_positions (note_id, user_id, position, pinned)
  VALUES (@note_id, @user_id, @position, @pinned)
  ON CONFLICT(note_id, user_id) DO UPDATE SET
    position = excluded.position,
    pinned = excluded.pinned
`);
const upsertUserPinned = db.prepare(`
  INSERT INTO note_user_positions (note_id, user_id, position, pinned)
  VALUES (@note_id, @user_id, @position, @pinned)
  ON CONFLICT(note_id, user_id) DO UPDATE SET pinned = excluded.pinned
`);

// Highest effective position across a user's visible (active) notes —
// owned or collaborated. Used to seed a freshly shared note at the top
// of the recipient's list so it doesn't bury under their existing notes.
const getMaxUserEffectivePosition = db.prepare(`
  SELECT COALESCE(MAX(COALESCE(nup.position, n.position)), 0) AS max_pos
  FROM notes n
  LEFT JOIN note_user_positions nup ON nup.note_id = n.id AND nup.user_id = ?
  LEFT JOIN note_collaborators nc ON n.id = nc.note_id AND nc.user_id = ?
  WHERE (n.user_id = ? OR nc.user_id = ?) AND n.trashed = 0 AND n.archived = 0
`);

function getUserPosition(noteId, userId) {
  return getUserPositionForNote.get(noteId, userId) || null;
}

// Write a partial per-user position/pinned update without losing the
// other field. Seeds a row from the note's defaults on first write so
// collaborators can pin or reorder before they've ever touched the note.
function setUserPinOrPosition(noteId, userId, { pinned, position }) {
  const note = getNoteById.get(noteId);
  if (!note) return;
  const existing = getUserPositionForNote.get(noteId, userId);
  const nextPinned =
    typeof pinned === "boolean"
      ? (pinned ? 1 : 0)
      : existing
        ? existing.pinned
        : note.pinned;
  const nextPosition =
    typeof position === "number"
      ? position
      : existing
        ? existing.position
        : note.position;
  upsertUserPosition.run({
    note_id: noteId,
    user_id: userId,
    position: nextPosition,
    pinned: nextPinned,
  });
}

// Build participant list for a note: shows the OTHER users, not the requesting user.
// For the owner: shows collaborators. For a collaborator: shows the owner + other collaborators.
function getNoteParticipants(noteId, noteOwnerId, requestingUserId) {
  const collabList = getNoteCollaborators.all(noteId);
  if (collabList.length === 0) return null;
  const others = collabList
    .filter(c => c.id !== requestingUserId)
    .map(c => ({ id: c.id, name: c.name, email: c.email, avatar_url: c.avatar_url || null }));
  if (noteOwnerId !== requestingUserId) {
    const owner = getUserById.get(noteOwnerId);
    if (owner) {
      others.unshift({ id: owner.id, name: owner.name, email: owner.email, avatar_url: owner.avatar_url || null });
    }
  }
  return others.length > 0 ? others : null;
}

// ---------- Realtime (SSE) ----------
// Map of userId (integer) -> Set of response streams.
// All access goes through parseSseKey() which rejects non-integer values,
// preventing NaN keys and string/number mismatch bugs.
const sseClients = new Map();

// Parse a userId to a valid integer key, or null if invalid.
// Prevents NaN from entering sseClients as a Map key.
function parseSseKey(id) {
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

function addSseClient(userId, res) {
  const key = parseSseKey(userId);
  if (key === null) { console.warn("[SSE] addSseClient: invalid userId", userId); return; }
  let set = sseClients.get(key);
  if (!set) {
    set = new Set();
    sseClients.set(key, set);
  }
  set.add(res);
}

function removeSseClient(userId, res) {
  const key = parseSseKey(userId);
  if (key === null) return;
  const set = sseClients.get(key);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) sseClients.delete(key);
}

function sendEventToUser(userId, event) {
  const key = parseSseKey(userId);
  if (key === null) { console.warn("[SSE] sendEventToUser: invalid userId", userId); return; }
  const set = sseClients.get(key);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  const toRemove = [];
  for (const res of set) {
    try {
      res.write(payload);
    } catch (error) {
      // Remove dead connections
      toRemove.push(res);
    }
  }
  // Clean up dead connections
  for (const res of toRemove) {
    removeSseClient(userId, res);
  }
}

function broadcastToAdmins(event) {
  try {
    const admins = db.prepare("SELECT id FROM users WHERE is_admin = 1").all();
    for (const a of admins) sendEventToUser(a.id, event);
  } catch (e) {
    console.warn("[SSE] broadcastToAdmins failed:", e?.message);
  }
}

function getCollaboratorUserIdsForNote(noteId) {
  try {
    const rows = getNoteCollaborators.all(noteId) || [];
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}

function broadcastNoteUpdated(noteId) {
  try {
    const note = getNoteById.get(noteId);
    if (!note) return;
    const recipientIds = new Set([note.user_id, ...getCollaboratorUserIdsForNote(noteId)]);
    const evt = { type: "note_updated", noteId };
    for (const uid of recipientIds) sendEventToUser(uid, evt);
  } catch { }
}

// ---------- At-rest encryption: unlock routes + lock gate ----------
// These have to be registered BEFORE the bulk of the API so the lock
// middleware can short-circuit everything else with HTTP 423 while
// still letting unlock attempts and the public lock-status endpoint
// through. See server/encryption/* and server/routes/unlockRoutes.js.
attachUnlockRoutes(app, { db, auth, adminOnly, log: console });

const LOCK_ALLOW_PATHS = [
  /^\/api\/instance(\/|$)/,
  /^\/api\/health(\/|$)/,
  /^\/api\/admin\/login-slogan(\/|$)/,
  /^\/api\/admin\/allow-registration(\/|$)/,
  /^\/api\/login\/profiles(\/|$)/,
];

app.use((req, res, next) => {
  if (!runtimeUnlock.isEnabled()) return next();
  if (runtimeUnlock.isUnlocked()) return next();
  if (!req.path.startsWith("/api/")) return next();
  for (const r of LOCK_ALLOW_PATHS) if (r.test(req.path)) return next();
  return res.status(423).json({
    error: "Instance is locked",
    locked: true,
    enabled: true,
  });
});

app.get("/api/events", authFromQueryOrHeader, (req, res) => {
  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Help Nginx/Proxies not to buffer SSE
  try { res.setHeader("X-Accel-Buffering", "no"); } catch { }
  // If served cross-origin (e.g. static site + separate API host), allow EventSource
  if (req.headers.origin) {
    try { res.setHeader("Access-Control-Allow-Origin", req.headers.origin); } catch { }
  }
  res.flushHeaders?.();

  // Initial hello
  res.write(`event: hello\n`);
  res.write(`data: {"ok":true}\n\n`);

  addSseClient(req.user.id, res);

  // Keepalive ping
  const ping = setInterval(() => {
    try {
      res.write("event: ping\ndata: {}\n\n");
    } catch (error) {
      clearInterval(ping);
      removeSseClient(req.user.id, res);
      try { res.end(); } catch { }
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(ping);
    removeSseClient(req.user.id, res);
    try { res.end(); } catch { }
  });
});

// ---------- Auth ----------
const getPendingByEmail = db.prepare("SELECT * FROM pending_users WHERE lower(email)=lower(?)");
const insertPendingUser = db.prepare(
  "INSERT INTO pending_users (name,email,password_hash,created_at) VALUES (?,?,?,?)"
);

app.post("/api/register", (req, res) => {
  // Check if new account creation is allowed
  if (!adminSettings.allowNewAccounts) {
    return res.status(403).json({ error: "New account creation is currently disabled." });
  }

  const { name, email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required." });
  if (getUserByEmail.get(email))
    return res.status(409).json({ error: "Email already registered." });
  if (getPendingByEmail.get(email))
    return res.status(409).json({ error: "A registration request for this email is already pending." });

  const hash = bcrypt.hashSync(password, 10);
  const info = insertPendingUser.run(name?.trim() || "User", email.trim(), hash, nowISO());

  // Notify all connected admins in real-time
  broadcastToAdmins({
    type: "pending_user_registered",
    pendingId: info.lastInsertRowid,
    name: name?.trim() || "User",
    email: email.trim(),
  });

  res.status(202).json({ pending: true });
});

app.post("/api/login", (req, res) => {
  const { email, password, user_id } = req.body || {};
  // Support login by user_id (profile selection) or by email (manual login)
  let user;
  if (user_id) {
    user = getUserById.get(user_id);
  } else {
    user = email ? getUserByEmail.get(email) : null;
  }
  if (!user) return res.status(401).json({ error: "No account found." });
  if (!bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(401).json({ error: "Incorrect password." });
  }
  const token = signToken(user);
  const response = {
    token,
    user: { id: user.id, name: user.name, email: user.email, is_admin: !!user.is_admin, avatar_url: user.avatar_url || null },
  };
  if (user.must_change_password) response.must_change_password = true;
  res.json(response);
});

// ---------- Secret Key (Recovery) ----------
function generateSecretKey(bytes = 32) {
  const buf = crypto.randomBytes(bytes);
  try {
    return buf.toString("base64url");
  } catch {
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
}

const updateSecretForUser = db.prepare(
  "UPDATE users SET secret_key_hash = ?, secret_key_created_at = ? WHERE id = ?"
);
const getUsersWithSecret = db.prepare(
  "SELECT id, name, email, is_admin, secret_key_hash FROM users WHERE secret_key_hash IS NOT NULL"
);

// Create/rotate a user's secret key
app.post("/api/secret-key", auth, (req, res) => {
  const key = generateSecretKey(32);
  const hash = bcrypt.hashSync(key, 10);
  updateSecretForUser.run(hash, nowISO(), req.user.id);
  res.json({ key });
});

// Login with secret key
app.post("/api/login/secret", (req, res) => {
  const { key } = req.body || {};
  if (!key || typeof key !== "string" || key.length < 16) {
    return res.status(400).json({ error: "Invalid key." });
  }
  const rows = getUsersWithSecret.all();
  for (const u of rows) {
    if (u.secret_key_hash && bcrypt.compareSync(key, u.secret_key_hash)) {
      const fullUser = getUserById.get(u.id);
      const token = signToken(u);
      const response = {
        token,
        user: { id: u.id, name: u.name, email: u.email, is_admin: !!u.is_admin, avatar_url: fullUser?.avatar_url || null },
      };
      if (fullUser?.must_change_password) response.must_change_password = true;
      return res.json(response);
    }
  }
  return res.status(401).json({ error: "Secret key not recognized." });
});

// ---------- Login Profiles (public) ----------
// Returns only visible profiles with minimal safe info for the login screen
app.get("/api/login/profiles", (_req, res) => {
  const rows = db.prepare(
    "SELECT id, name, avatar_url FROM users WHERE show_on_login = 1 ORDER BY name ASC"
  ).all();
  res.json(rows.map((r) => ({
    id: r.id,
    name: r.name,
    avatar_url: r.avatar_url || null,
  })));
});

// ---------- Profile Avatar & Visibility ----------
// Upload / replace avatar (authenticated)
app.put("/api/user/avatar", auth, (req, res) => {
  const { avatar_url } = req.body || {};
  if (!avatar_url || typeof avatar_url !== "string") {
    return res.status(400).json({ error: "avatar_url is required (data URL)." });
  }
  // Accept only image/png, image/jpeg, image/webp data URLs
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(avatar_url)) {
    return res.status(400).json({ error: "avatar_url must be a valid image data URL (png, jpeg or webp)." });
  }
  // Limit to ~1.5MB base64 data URL (~2MB decoded)
  if (avatar_url.length > 2 * 1024 * 1024) {
    return res.status(400).json({ error: "Avatar image too large (max ~1.5MB)." });
  }
  db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(avatar_url, req.user.id);
  res.json({ ok: true, avatar_url });
});

// Delete avatar (authenticated)
app.delete("/api/user/avatar", auth, (req, res) => {
  db.prepare("UPDATE users SET avatar_url = NULL WHERE id = ?").run(req.user.id);
  res.json({ ok: true });
});

// Get current user profile info (authenticated)
app.get("/api/user/profile", auth, (req, res) => {
  const user = getUserById.get(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    is_admin: !!user.is_admin,
    avatar_url: user.avatar_url || null,
    show_on_login: user.show_on_login !== 0,
  });
});

// Update show_on_login preference (authenticated)
app.patch("/api/user/profile", auth, (req, res) => {
  const { show_on_login } = req.body || {};
  if (typeof show_on_login !== "boolean") {
    return res.status(400).json({ error: "show_on_login must be a boolean." });
  }
  db.prepare("UPDATE users SET show_on_login = ? WHERE id = ?").run(show_on_login ? 1 : 0, req.user.id);
  res.json({ ok: true, show_on_login });
});

// ---------- Change Password (authenticated, any user) ----------
app.post("/api/user/change-password", auth, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }

  const user = getUserById.get(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });

  // If user must change password (first login with temp password), skip current password check
  if (!user.must_change_password) {
    if (!current_password || !bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(hash, user.id);

  // Return a fresh token so the session stays valid
  const updatedUser = getUserById.get(user.id);
  const token = signToken(updatedUser);
  res.json({
    ok: true,
    token,
    user: { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email, is_admin: !!updatedUser.is_admin, avatar_url: updatedUser.avatar_url || null },
  });
});

// ---------- Notes ----------
app.get("/api/notes", auth, (req, res) => {
  const off = Number(req.query.offset ?? 0);
  const lim = Number(req.query.limit ?? 0);
  const usePaging = Number.isFinite(lim) && lim > 0 && Number.isFinite(off) && off >= 0;

  // Get all notes (own + collaborated) in a single query to avoid duplicates.
  // Sort by each user's own pinned/position (note_user_positions) with the
  // note's stored column as the fallback default.
  const allNotesQuery = db.prepare(`
    SELECT DISTINCT n.*,
      COALESCE(nup.pinned, n.pinned) AS eff_pinned,
      COALESCE(nup.position, n.position) AS eff_position
    FROM notes n
    LEFT JOIN note_user_positions nup
      ON nup.note_id = n.id AND nup.user_id = ?
    WHERE (n.user_id = ? OR EXISTS(
      SELECT 1 FROM note_collaborators nc
      WHERE nc.note_id = n.id AND nc.user_id = ?
    )) AND n.archived = 0 AND n.trashed = 0
    ORDER BY eff_pinned DESC, eff_position DESC, n.timestamp DESC
  `);

  const allNotesWithPagingQuery = db.prepare(`
    SELECT DISTINCT n.*,
      COALESCE(nup.pinned, n.pinned) AS eff_pinned,
      COALESCE(nup.position, n.position) AS eff_position
    FROM notes n
    LEFT JOIN note_user_positions nup
      ON nup.note_id = n.id AND nup.user_id = ?
    WHERE (n.user_id = ? OR EXISTS(
      SELECT 1 FROM note_collaborators nc
      WHERE nc.note_id = n.id AND nc.user_id = ?
    )) AND n.archived = 0 AND n.trashed = 0
    ORDER BY eff_pinned DESC, eff_position DESC, n.timestamp DESC
    LIMIT ? OFFSET ?
  `);

  const rows = decryptRows(usePaging
    ? allNotesWithPagingQuery.all(req.user.id, req.user.id, req.user.id, lim, off)
    : allNotesQuery.all(req.user.id, req.user.id, req.user.id));

  res.json(
    rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      type: r.type,
      title: r.title,
      content: r.content,
      items: JSON.parse(r.items_json || "[]"),
      tags: JSON.parse(getUserTags(r.id, req.user.id)),
      images: JSON.parse(r.images_json || "[]"),
      color: r.color,
      pinned: !!r.eff_pinned,
      position: r.eff_position,
      timestamp: r.timestamp,
      updated_at: r.updated_at,
      client_updated_at: r.client_updated_at,
      lastEditedBy: r.last_edited_by,
      lastEditedAt: r.last_edited_at,
      archived: !!r.archived,
      collaborators: getNoteParticipants(r.id, r.user_id, req.user.id),
    }))
  );
});

app.post("/api/notes", auth, (req, res) => {
  const body = req.body || {};
  const noteId = body.id || uid();
  const rawClientTs = body.client_updated_at || body.timestamp || nowISO();
  const parsedClientTs = parseIsoTimestamp(rawClientTs);
  const clientTs = parsedClientTs ? parsedClientTs.iso : nowISO();
  const userTags = JSON.stringify(Array.isArray(body.tags) ? body.tags : []);
  const n = {
    id: noteId,
    user_id: req.user.id,
    type: body.type === "checklist" ? "checklist" : body.type === "draw" ? "draw" : "text",
    title: String(body.title || ""),
    content: body.type === "checklist" ? "" : String(body.content || ""),
    items_json: JSON.stringify(Array.isArray(body.items) ? body.items : []),
    tags_json: "[]",
    images_json: JSON.stringify(Array.isArray(body.images) ? body.images : []),
    color: body.color && typeof body.color === "string" ? body.color : "default",
    pinned: body.pinned ? 1 : 0,
    position: typeof body.position === "number" ? body.position : Date.now(),
    timestamp: body.timestamp || nowISO(),
    client_updated_at: clientTs,
  };

  // Idempotent creation: if client provides an ID that already exists,
  // return the existing note instead of failing with a UNIQUE constraint error.
  if (body.id) {
    const existing = getNoteById.get(body.id);
    if (existing && existing.user_id === req.user.id) {
      return res.status(200).json(serializeNote(existing, req.user.id));
    }
  }

  runInsertNote(n);
  if (userTags !== "[]") upsertUserTags.run(noteId, req.user.id, userTags);
  updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), n.id);
  broadcastNoteUpdated(n.id);
  // Re-read to get updated_at/last_edited_* set by updateNoteWithEditor
  const created = getNoteById.get(n.id);
  res.status(201).json(serializeNote(created || n, req.user.id));
});

app.put("/api/notes/:id", auth, (req, res) => {
  const id = req.params.id;
  const existing = getNoteWithCollaboration.get(req.user.id, id, req.user.id);
  if (!existing) return res.status(404).json({ error: "Note not found" });

  const b = req.body || {};
  if (!b.client_updated_at) {
    return res.status(400).json({ error: "client_updated_at is required" });
  }
  const tsResult = validateLwwTimestamp(b.client_updated_at);
  if (tsResult.error) {
    return res.status(400).json({ error: tsResult.error });
  }

  // LWW: reject stale writes (compare milliseconds)
  if (!isNewerOrEqual(tsResult.ms, existing.client_updated_at)) {
    return res.json({ ok: true, stale: true, note: serializeNote(existing, req.user.id) });
  }

  // Save tags to per-user table (not on the note itself)
  if (Array.isArray(b.tags)) {
    upsertUserTags.run(id, req.user.id, JSON.stringify(b.tags));
  }
  const updated = {
    id,
    user_id: req.user.id,
    type: b.type === "checklist" ? "checklist" : b.type === "draw" ? "draw" : "text",
    title: String(b.title || ""),
    content: b.type === "checklist" ? "" : String(b.content || ""),
    items_json: JSON.stringify(Array.isArray(b.items) ? b.items : []),
    tags_json: existing.tags_json,
    images_json: JSON.stringify(Array.isArray(b.images) ? b.images : []),
    color: b.color && typeof b.color === "string" ? b.color : "default",
    // Pinned/position are per-user: keep the shared columns untouched and
    // write the requester's state to note_user_positions below.
    pinned: existing.pinned,
    position: existing.position,
    timestamp: b.timestamp || existing.timestamp,
    client_updated_at: tsResult.iso,
  };
  const result = runUpdateNoteFullCollab(updated);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Note not found or access denied" });
  }

  if (typeof b.pinned === "boolean" || typeof b.position === "number") {
    setUserPinOrPosition(id, req.user.id, {
      pinned: typeof b.pinned === "boolean" ? b.pinned : undefined,
      position: typeof b.position === "number" ? b.position : undefined,
    });
  }

  updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
  broadcastNoteUpdated(id);
  const fresh = getNoteById.get(id);
  res.json({ ok: true, note: serializeNote(fresh || existing, req.user.id) });
});

app.patch("/api/notes/:id", auth, (req, res) => {
  const id = req.params.id;
  const existing = getNoteWithCollaboration.get(req.user.id, id, req.user.id);
  if (!existing) return res.status(404).json({ error: "Note not found" });

  // Pin-only toggle: purely per-user state. Skip LWW/timestamp bumps,
  // shared-column writes, and cross-user broadcasts so other participants
  // see nothing move when someone else pins/unpins their shared copy.
  const hasSharedChange = (
    typeof req.body.title === "string" ||
    typeof req.body.content === "string" ||
    Array.isArray(req.body.items) ||
    Array.isArray(req.body.images) ||
    Array.isArray(req.body.tags) ||
    typeof req.body.color === "string" ||
    typeof req.body.timestamp === "string"
  );
  if (!hasSharedChange && typeof req.body.pinned === "boolean") {
    setUserPinOrPosition(id, req.user.id, { pinned: req.body.pinned });
    // Notify only the requester's other sessions so multi-device stays in sync.
    sendEventToUser(req.user.id, { type: "notes_reordered", noteIds: [id] });
    return res.json({ ok: true, note: serializeNote(existing, req.user.id) });
  }

  if (!req.body.client_updated_at) {
    return res.status(400).json({ error: "client_updated_at is required" });
  }
  const tsResult = validateLwwTimestamp(req.body.client_updated_at);
  if (tsResult.error) {
    return res.status(400).json({ error: tsResult.error });
  }

  // LWW: reject stale writes (compare milliseconds)
  if (!isNewerOrEqual(tsResult.ms, existing.client_updated_at)) {
    return res.json({ ok: true, stale: true, note: serializeNote(existing, req.user.id) });
  }

  // Save tags to per-user table (not on the note itself)
  if (Array.isArray(req.body.tags)) {
    upsertUserTags.run(id, req.user.id, JSON.stringify(req.body.tags));
  }
  const p = {
    id,
    user_id: req.user.id,
    title: typeof req.body.title === "string" ? String(req.body.title) : null,
    content: typeof req.body.content === "string" ? String(req.body.content) : null,
    items_json: Array.isArray(req.body.items) ? JSON.stringify(req.body.items) : null,
    tags_json: null,
    images_json: Array.isArray(req.body.images) ? JSON.stringify(req.body.images) : null,
    color: typeof req.body.color === "string" ? req.body.color : null,
    // Pinned state is per-user; route it to note_user_positions below instead
    // of mutating the shared notes.pinned column.
    pinned: null,
    timestamp: req.body.timestamp || null,
    client_updated_at: tsResult.iso,
  };
  const result = runPatchNoteSensitiveCollab(id, req.user.id, p);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Note not found or access denied" });
  }

  if (typeof req.body.pinned === "boolean") {
    setUserPinOrPosition(id, req.user.id, { pinned: req.body.pinned });
  }

  updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
  broadcastNoteUpdated(id);
  const fresh = getNoteById.get(id);
  res.json({ ok: true, note: serializeNote(fresh || existing, req.user.id) });
});

// Legacy soft-delete route — disabled.
// Bypassed LWW (stamped nowISO() without client_updated_at check).
// Modern client uses POST /api/notes/:id/trash with LWW protection instead.
app.delete("/api/notes/:id", auth, (req, res) => {
  return res.status(410).json({ error: "Deprecated: use POST /api/notes/:id/trash with client_updated_at" });
});

// Reorder within sections (LWW-protected)
app.post("/api/notes/reorder", auth, (req, res) => {
  const { pinnedIds = [], otherIds = [], client_reordered_at } = req.body || {};

  if (!client_reordered_at) {
    return res.status(400).json({ error: "client_reordered_at is required" });
  }
  const reorderTsResult = validateLwwTimestamp(client_reordered_at);
  if (reorderTsResult.error) {
    return res.status(400).json({ error: reorderTsResult.error });
  }

  // Access check: every noteId must be visible to the requesting user
  // (either owned or shared). Rejecting the whole payload on a stray id
  // keeps the client and server state consistent.
  const reorderIds = [...pinnedIds, ...otherIds];
  for (const nid of reorderIds) {
    const visible = getNoteWithCollaboration.get(req.user.id, nid, req.user.id);
    if (!visible) {
      return res.status(403).json({ error: "Reorder payload contains notes you cannot access" });
    }
  }

  // LWW stale check: reject if a newer reorder already applied (compare milliseconds)
  const stored = getLastReorderAt.get(req.user.id);
  if (stored) {
    const storedReorder = parseIsoTimestamp(stored.last_reorder_at);
    if (storedReorder && reorderTsResult.ms < storedReorder.ms) {
      console.warn(`[LWW] Stale reorder from user ${req.user.id}: client=${client_reordered_at} < stored=${stored.last_reorder_at}`);
      return res.json({ ok: true, stale: true });
    }
  }

  // Per-user reorder: write to note_user_positions so each participant
  // (owner or collaborator) keeps an independent ordering/pin state.
  const base = Date.now();
  const step = 1;
  const reorder = db.transaction(() => {
    for (let i = 0; i < pinnedIds.length; i++) {
      upsertUserPosition.run({
        note_id: pinnedIds[i],
        user_id: req.user.id,
        position: base + step * (pinnedIds.length - i),
        pinned: 1,
      });
    }
    for (let i = 0; i < otherIds.length; i++) {
      upsertUserPosition.run({
        note_id: otherIds[i],
        user_id: req.user.id,
        position: base - step * (i + 1),
        pinned: 0,
      });
    }
    // Record normalized timestamp for future LWW checks
    upsertReorderAt.run(req.user.id, reorderTsResult.iso);
  });
  reorder();

  // Reorder is local to this user — only notify their own sessions so
  // other participants don't refetch unnecessarily.
  const allIds = [...pinnedIds, ...otherIds];
  const evt = { type: "notes_reordered", noteIds: allIds };
  sendEventToUser(req.user.id, evt);

  res.json({ ok: true });
});

// ---------- Collaboration ----------
app.post("/api/notes/:id/collaborate", auth, (req, res) => {
  const noteId = req.params.id;
  const { username } = req.body || {};

  if (!username || typeof username !== "string") {
    return res.status(400).json({ error: "Username is required" });
  }

  // Check if note exists and user owns it
  const note = getNote.get(noteId, req.user.id);
  if (!note) {
    return res.status(404).json({ error: "Note not found" });
  }

  // Find user to collaborate with (by email or name)
  const collaborator = getUserByEmail.get(username) || getUserByName.get(username);
  if (!collaborator) {
    return res.status(404).json({ error: "User not found" });
  }

  // Don't allow self-collaboration
  if (collaborator.id === req.user.id) {
    return res.status(400).json({ error: "Cannot collaborate with yourself" });
  }

  try {
    // Add collaborator
    addCollaborator.run(noteId, collaborator.id, req.user.id, nowISO());

    // Seed the collaborator's per-user position so the shared note lands
    // at the top of their list instead of inheriting the owner's (possibly
    // very old) position via COALESCE fallback.
    const { max_pos } = getMaxUserEffectivePosition.get(
      collaborator.id,
      collaborator.id,
      collaborator.id,
      collaborator.id,
    );
    upsertUserPosition.run({
      note_id: noteId,
      user_id: collaborator.id,
      position: (typeof max_pos === "number" ? max_pos : 0) + 1,
      pinned: 0,
    });

    // Update note with editor info
    updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), noteId);
    broadcastNoteUpdated(noteId);

    res.json({
      ok: true,
      message: `Added ${collaborator.name} as collaborator`,
      collaborator: {
        id: collaborator.id,
        name: collaborator.name,
        email: collaborator.email
      }
    });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: "User is already a collaborator" });
    }
    return res.status(500).json({ error: "Failed to add collaborator" });
  }
});

app.get("/api/notes/:id/collaborators", auth, (req, res) => {
  const noteId = req.params.id;

  // Check if note exists and user owns it or is a collaborator
  const note = getNoteWithCollaboration.get(req.user.id, noteId, req.user.id);
  if (!note) {
    return res.status(404).json({ error: "Note not found" });
  }

  const collaborators = getNoteCollaborators.all(noteId);
  const result = collaborators.map(c => ({
    id: c.id,
    name: c.name,
    email: c.email,
    avatar_url: c.avatar_url || null,
    added_at: c.added_at,
    added_by: c.added_by
  }));

  const owner = getUserById.get(note.user_id);
  if (owner) {
    result.unshift({
      id: owner.id,
      name: owner.name,
      email: owner.email,
      avatar_url: owner.avatar_url || null,
      isOwner: true
    });
  }

  res.json(result);
});

app.delete("/api/notes/:id/collaborate/:userId", auth, (req, res) => {
  const noteId = req.params.id;
  const userIdToRemove = Number(req.params.userId);

  if (!Number.isInteger(userIdToRemove)) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  // Check if note exists
  const note = getNoteWithCollaboration.get(req.user.id, noteId, req.user.id);
  if (!note) {
    return res.status(404).json({ error: "Note not found" });
  }

  // Check if user is the owner (can remove anyone) or is removing themselves
  const isOwner = note.user_id === req.user.id;
  const isRemovingSelf = userIdToRemove === req.user.id;

  if (!isOwner && !isRemovingSelf) {
    return res.status(403).json({ error: "Only note owner can remove other collaborators" });
  }

  // Optional mode: "keep_copy" — give the removed collaborator a standalone
  // (non-collab) copy of the note so they don't lose it entirely. Only the
  // owner may grant this; a collaborator leaving themselves keeps the current
  // behavior (clean exit, no copy).
  const mode = typeof req.body?.mode === "string" ? req.body.mode : null;
  const shouldGrantCopy = isOwner && !isRemovingSelf && mode === "keep_copy";
  let copyNoteId = null;

  if (shouldGrantCopy) {
    copyNoteId = uid();
    // Preserve the removed user's own per-user tags on the copy instead of
    // inheriting the shared default — those tags are personal to them.
    const userTagsJson = getUserTags(noteId, userIdToRemove);
    runInsertNote({
      id: copyNoteId,
      user_id: userIdToRemove,
      type: note.type,
      title: note.title,
      content: note.content,
      items_json: note.items_json,
      tags_json: userTagsJson,
      images_json: note.images_json,
      color: note.color,
      pinned: 0,
      position: note.position,
      timestamp: note.timestamp,
      client_updated_at: nowISO(),
    });
    // Seed the removed user's per-user position for the copy so it appears
    // at the top of their list, matching the share-to-collaborator UX.
    const { max_pos } = getMaxUserEffectivePosition.get(
      userIdToRemove,
      userIdToRemove,
      userIdToRemove,
      userIdToRemove,
    );
    upsertUserPosition.run({
      note_id: copyNoteId,
      user_id: userIdToRemove,
      position: (typeof max_pos === "number" ? max_pos : 0) + 1,
      pinned: 0,
    });
  }

  // Remove collaborator
  const removeCollaborator = db.prepare(`
    DELETE FROM note_collaborators
    WHERE note_id = ? AND user_id = ?
  `);

  const result = removeCollaborator.run(noteId, userIdToRemove);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Collaborator not found" });
  }

  // Clean up per-user tags and positions for the removed collaborator
  db.prepare("DELETE FROM note_user_tags WHERE note_id = ? AND user_id = ?").run(noteId, userIdToRemove);
  db.prepare("DELETE FROM note_user_positions WHERE note_id = ? AND user_id = ?").run(noteId, userIdToRemove);

  // Notify the removed user FIRST — they are no longer in the collaborator list
  // so broadcastNoteUpdated won't reach them. Send a dedicated event so their
  // client can remove the note immediately without a full reload. If a copy
  // was granted, the payload also carries its id so the client fetches it in.
  sendEventToUser(userIdToRemove, { type: "note_access_revoked", noteId, copyNoteId });

  // Update note with editor info and notify remaining participants
  updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), noteId);
  broadcastNoteUpdated(noteId);

  res.json({ ok: true, message: "Collaborator removed", copyNoteId });
});

app.get("/api/notes/collaborated", auth, (req, res) => {
  const rows = decryptRows(db.prepare(`
    SELECT n.*,
      COALESCE(nup.pinned, n.pinned) AS eff_pinned,
      COALESCE(nup.position, n.position) AS eff_position
    FROM notes n
    JOIN note_collaborators nc ON n.id = nc.note_id
    LEFT JOIN note_user_positions nup
      ON nup.note_id = n.id AND nup.user_id = ?
    WHERE nc.user_id = ? AND n.trashed = 0
    ORDER BY eff_pinned DESC, eff_position DESC, n.timestamp DESC
  `).all(req.user.id, req.user.id));
  res.json(rows.map((r) => serializeNote(r, req.user.id)));
});

// Archive/Unarchive notes
app.post("/api/notes/:id/archive", auth, (req, res) => {
  const id = req.params.id;
  const { archived } = req.body || {};
  if (!req.body?.client_updated_at) {
    return res.status(400).json({ error: "client_updated_at is required" });
  }
  const tsResult = validateLwwTimestamp(req.body.client_updated_at);
  if (tsResult.error) {
    return res.status(400).json({ error: tsResult.error });
  }

  const existing = getNote.get(id, req.user.id);
  if (!existing) {
    return res.status(404).json({ error: "Note not found" });
  }

  // LWW: reject stale writes (compare milliseconds)
  if (!isNewerOrEqual(tsResult.ms, existing.client_updated_at)) {
    return res.json({ ok: true, stale: true, note: serializeNote(existing, req.user.id) });
  }

  const updateArchived = db.prepare(`
    UPDATE notes SET archived = ?, client_updated_at = ? WHERE id = ? AND user_id = ?
  `);

  const result = updateArchived.run(archived ? 1 : 0, tsResult.iso, id, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Note not found or access denied" });
  }

  updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
  broadcastNoteUpdated(id);
  const fresh = getNoteById.get(id);
  res.json({ ok: true, note: serializeNote(fresh || existing, req.user.id) });
});

// Get archived notes
app.get("/api/notes/archived", auth, (req, res) => {
  const rows = listArchivedNotes.all(req.user.id);
  res.json(rows.map((r) => serializeNote(r, req.user.id)));
});

// Trash/Restore notes
app.post("/api/notes/:id/trash", auth, (req, res) => {
  const id = req.params.id;
  if (!req.body?.client_updated_at) {
    return res.status(400).json({ error: "client_updated_at is required" });
  }
  const tsResult = validateLwwTimestamp(req.body.client_updated_at);
  if (tsResult.error) {
    return res.status(400).json({ error: tsResult.error });
  }
  // Optional mode for collaborative notes:
  //   - "remove_self" (default): current behavior — owner leaves via ownership
  //     transfer, collaborator leaves the collaboration.
  //   - "delete_for_all": owner-only — hard-deletes the note for every
  //     participant (server broadcasts note_deleted).
  const mode = typeof req.body?.mode === "string" ? req.body.mode : null;

  const existing = getNote.get(id, req.user.id);
  if (!existing) {
    // Not the owner — check if user is a collaborator
    const collabNote = getNoteWithCollaboration.get(req.user.id, id, req.user.id);
    if (!collabNote) return res.status(404).json({ error: "Note not found" });
    // Only owners may request delete_for_all
    if (mode === "delete_for_all") {
      return res.status(403).json({ error: "Only owner can delete for all collaborators" });
    }
    // Collaborator "delete" = leave the collaboration
    db.prepare("DELETE FROM note_collaborators WHERE note_id = ? AND user_id = ?").run(id, req.user.id);
    db.prepare("DELETE FROM note_user_tags WHERE note_id = ? AND user_id = ?").run(id, req.user.id);
    db.prepare("DELETE FROM note_user_positions WHERE note_id = ? AND user_id = ?").run(id, req.user.id);
    broadcastNoteUpdated(id);
    return res.json({ ok: true, left: true });
  }

  // Owner: check if the note has collaborators
  const collaborators = getNoteCollaborators.all(id);
  if (collaborators.length > 0) {
    if (mode === "delete_for_all") {
      // Revoke access for every collaborator, but keep the note in the
      // owner's trash so they can still restore it if it was a mistake.
      const collabIds = collaborators.map((c) => c.id);
      for (const cid of collabIds) {
        db.prepare("DELETE FROM note_collaborators WHERE note_id = ? AND user_id = ?").run(id, cid);
        db.prepare("DELETE FROM note_user_tags WHERE note_id = ? AND user_id = ?").run(id, cid);
        db.prepare("DELETE FROM note_user_positions WHERE note_id = ? AND user_id = ?").run(id, cid);
      }
      db.prepare("UPDATE notes SET trashed = 1, client_updated_at = ? WHERE id = ?").run(tsResult.iso, id);
      updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
      // Collaborators lose access entirely — they must drop the note locally
      // without it landing in their trash view.
      const evt = { type: "note_deleted", noteId: id };
      for (const cid of collabIds) sendEventToUser(cid, evt);
      const fresh = getNoteById.get(id);
      return res.json({ ok: true, deletedForAll: true, note: serializeNote(fresh || existing, req.user.id) });
    }
    // Default: "remove_self" — owner leaves the collaboration but keeps a
    // trashed copy of the note so they can restore it later. The live note
    // is handed over to the first collaborator so it stays available for
    // remaining participants.
    const trashedCopyId = uid();
    runInsertNote({
      id: trashedCopyId,
      user_id: req.user.id,
      type: existing.type,
      title: existing.title,
      content: existing.content,
      items_json: existing.items_json,
      tags_json: existing.tags_json,
      images_json: existing.images_json,
      color: existing.color,
      pinned: 0,
      position: existing.position,
      timestamp: existing.timestamp,
      client_updated_at: tsResult.iso,
    });
    db.prepare("UPDATE notes SET trashed = 1 WHERE id = ?").run(trashedCopyId);
    const newOwner = collaborators[0];
    db.prepare("UPDATE notes SET user_id = ? WHERE id = ?").run(newOwner.id, id);
    db.prepare("DELETE FROM note_collaborators WHERE note_id = ? AND user_id = ?").run(id, newOwner.id);
    db.prepare("DELETE FROM note_user_tags WHERE note_id = ? AND user_id = ?").run(id, req.user.id);
    db.prepare("DELETE FROM note_user_positions WHERE note_id = ? AND user_id = ?").run(id, req.user.id);
    broadcastNoteUpdated(id);
    const trashedCopy = getNoteById.get(trashedCopyId);
    return res.json({ ok: true, left: true, trashedCopy: trashedCopy ? serializeNote(trashedCopy, req.user.id) : null });
  }

  // Non-collaborative note: normal trash
  // LWW: reject stale writes (compare milliseconds)
  if (!isNewerOrEqual(tsResult.ms, existing.client_updated_at)) {
    return res.json({ ok: true, stale: true, note: serializeNote(existing, req.user.id) });
  }

  const updateTrashed = db.prepare(`
    UPDATE notes SET trashed = 1, client_updated_at = ? WHERE id = ? AND user_id = ?
  `);

  const result = updateTrashed.run(tsResult.iso, id, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Note not found or access denied" });
  }

  updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
  broadcastNoteUpdated(id);
  const fresh = getNoteById.get(id);
  res.json({ ok: true, note: serializeNote(fresh || existing, req.user.id) });
});

app.post("/api/notes/:id/restore", auth, (req, res) => {
  const id = req.params.id;
  if (!req.body?.client_updated_at) {
    return res.status(400).json({ error: "client_updated_at is required" });
  }
  const tsResult = validateLwwTimestamp(req.body.client_updated_at);
  if (tsResult.error) {
    return res.status(400).json({ error: tsResult.error });
  }

  const existing = getNote.get(id, req.user.id);
  if (!existing) {
    return res.status(404).json({ error: "Note not found" });
  }

  // LWW: reject stale writes (compare milliseconds)
  if (!isNewerOrEqual(tsResult.ms, existing.client_updated_at)) {
    return res.json({ ok: true, stale: true, note: serializeNote(existing, req.user.id) });
  }

  // Calculate a position that places the restored note among active notes
  // at the chronologically correct spot (by creation timestamp).
  // Without this, notes restored after a reorder end up at the bottom because
  // all active notes received new (higher) positions during the reorder while
  // the trashed note kept its old (lower) position.
  const noteTs = new Date(existing.timestamp).getTime() || 0;
  const activeNotes = db.prepare(`
    SELECT position, timestamp FROM notes
    WHERE user_id = ? AND trashed = 0 AND archived = 0 AND id != ?
    ORDER BY position DESC
  `).all(req.user.id, id);

  let restoredPosition = existing.position;
  if (activeNotes.length > 0) {
    // Find insertion point: where does this note's creation time fit
    // among active notes sorted by position (highest first)?
    let insertIdx = activeNotes.length; // default: after all (bottom)
    for (let i = 0; i < activeNotes.length; i++) {
      const ts = new Date(activeNotes[i].timestamp).getTime() || 0;
      if (noteTs >= ts) {
        insertIdx = i;
        break;
      }
    }
    if (insertIdx === 0) {
      restoredPosition = activeNotes[0].position + 1;
    } else if (insertIdx >= activeNotes.length) {
      restoredPosition = activeNotes[activeNotes.length - 1].position - 1;
    } else {
      restoredPosition = (activeNotes[insertIdx - 1].position + activeNotes[insertIdx].position) / 2;
    }
  }

  const updateTrashed = db.prepare(`
    UPDATE notes SET trashed = 0, position = ?, client_updated_at = ? WHERE id = ? AND user_id = ?
  `);

  const result = updateTrashed.run(restoredPosition, tsResult.iso, id, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Note not found or access denied" });
  }

  updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
  broadcastNoteUpdated(id);
  const fresh = getNoteById.get(id);
  res.json({ ok: true, note: serializeNote(fresh || existing, req.user.id) });
});

// Get trashed notes
app.get("/api/notes/trashed", auth, (req, res) => {
  const rows = listTrashedNotes.all(req.user.id);
  res.json(rows.map((r) => serializeNote(r, req.user.id)));
});

// Permanently delete a note (only from trash, LWW-protected)
app.delete("/api/notes/:id/permanent", auth, (req, res) => {
  const id = req.params.id;

  if (!req.body?.client_updated_at) {
    return res.status(400).json({ error: "client_updated_at is required" });
  }
  const tsResult = validateLwwTimestamp(req.body.client_updated_at);
  if (tsResult.error) {
    return res.status(400).json({ error: tsResult.error });
  }

  const existing = getNote.get(id, req.user.id);
  if (!existing) {
    return res.status(404).json({ error: "Note not found" });
  }
  if (!existing.trashed) {
    return res.status(400).json({ error: "Note must be in trash to permanently delete" });
  }

  // LWW: reject if a newer restore/update already applied
  if (!isNewerOrEqual(tsResult.ms, existing.client_updated_at)) {
    return res.json({ ok: true, stale: true, note: serializeNote(existing, req.user.id) });
  }

  const recipientIds = new Set([existing.user_id, ...getCollaboratorUserIdsForNote(id)]);
  deleteNote.run(id, req.user.id);

  const evt = { type: "note_deleted", noteId: id };
  for (const uid of recipientIds) sendEventToUser(uid, evt);

  res.json({ ok: true });
});

// Export/Import
app.get("/api/notes/export", auth, (req, res) => {
  const rows = listNotes.all(req.user.id);
  res.json({
    app: "glass-keep",
    version: 1,
    user: req.user.email,
    exportedAt: nowISO(),
    notes: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      content: r.content,
      items: JSON.parse(r.items_json || "[]"),
      tags: JSON.parse(getUserTags(r.id, req.user.id)),
      images: JSON.parse(r.images_json || "[]"),
      color: r.color,
      pinned: !!r.pinned,
      position: r.position,
      timestamp: r.timestamp,
    })),
  });
});

// Get single note by ID (for targeted SSE patching)
// MUST be after all literal /api/notes/xxx GET routes to avoid shadowing
app.get("/api/notes/:id", auth, (req, res) => {
  const r = getNoteWithCollaboration.get(req.user.id, req.params.id, req.user.id);
  if (!r) return res.status(404).json({ error: "Note not found" });
  const ov = getUserPosition(r.id, req.user.id);
  res.json({
    id: r.id,
    user_id: r.user_id,
    type: r.type,
    title: r.title,
    content: r.content,
    items: JSON.parse(r.items_json || "[]"),
    tags: JSON.parse(getUserTags(r.id, req.user.id)),
    images: JSON.parse(r.images_json || "[]"),
    color: r.color,
    pinned: ov ? !!ov.pinned : !!r.pinned,
    position: ov ? ov.position : r.position,
    timestamp: r.timestamp,
    updated_at: r.updated_at,
    client_updated_at: r.client_updated_at,
    lastEditedBy: r.last_edited_by,
    lastEditedAt: r.last_edited_at,
    archived: !!r.archived,
    trashed: !!r.trashed,
    collaborators: getNoteParticipants(r.id, r.user_id, req.user.id),
  });
});

app.post("/api/notes/import", auth, (req, res) => {
  const payload = req.body || {};
  const src = Array.isArray(payload.notes)
    ? payload.notes
    : Array.isArray(payload)
      ? payload
      : [];
  if (!src.length) return res.status(400).json({ error: "No notes to import." });

  // Check EVERY note id in the database, not just the importing
  // user's. notes.id is the global PRIMARY KEY, so an id that's
  // already in use by ANOTHER user (typical case: same .json
  // exported from user A and re-imported into user B) would still
  // collide on insert. Query the whole id column once and let the
  // existing collision-rewrite logic below handle it transparently.
  const allRows = db.prepare("SELECT id FROM notes").all();
  const existing = new Set(allRows.map((r) => r.id));

  // Deduplication: re-importing the same .json (typical case: a user
  // re-imports their own GlassKeep export, or pulls Google Takeout
  // twice) used to multiply every note. Build a fingerprint of the
  // importing user's existing notes and skip any incoming note whose
  // fingerprint matches an existing one (or a sibling earlier in the
  // same batch).
  //
  // The fingerprint normalises two things that would otherwise look
  // different across re-imports of the same content:
  //
  //   - checklist items: each import allocates fresh per-item ids
  //     (uid()), so the raw items_json shifts every time. Strip ids
  //     and keep only { text, done } for the hash.
  //   - images: same story for image ids, but the src data-URLs are
  //     huge — running them through SHA-1 (crypto is already imported
  //     above) yields a short stable digest. Without this an
  //     image-only note (no title, no body) had an empty fingerprint
  //     `text||` and only the FIRST one survived — typical Google
  //     Keep import case.
  // Pull all columns so the decryptRows() helper can transparently
  // decrypt rows when at-rest encryption is unlocked.
  const userRows = decryptRows(
    db.prepare("SELECT * FROM notes WHERE user_id = ?").all(req.user.id),
  );
  const sha1Short = (s) =>
    crypto.createHash("sha1").update(s || "").digest("base64").slice(0, 22);
  const normItems = (jsonOrArr) => {
    let arr;
    if (typeof jsonOrArr === "string") {
      try { arr = JSON.parse(jsonOrArr); } catch { arr = []; }
    } else {
      arr = Array.isArray(jsonOrArr) ? jsonOrArr : [];
    }
    return JSON.stringify(
      arr.map((it) => ({ text: String(it?.text || ""), done: !!it?.done })),
    );
  };
  const normImagesHash = (jsonOrArr) => {
    let arr;
    if (typeof jsonOrArr === "string") {
      try { arr = JSON.parse(jsonOrArr); } catch { arr = []; }
    } else {
      arr = Array.isArray(jsonOrArr) ? jsonOrArr : [];
    }
    if (!arr.length) return "";
    // Hash the concatenation of (name, src) per image so two notes
    // with the same images get identical fingerprints regardless of
    // image-id ordering / per-import id reallocation.
    return sha1Short(
      arr
        .map((im) => `${String(im?.name || "")}${String(im?.src || "")}`)
        .join(""),
    );
  };
  const fingerprintFromRow = (r) => {
    const title = String(r.title || "").trim();
    const type = r.type === "checklist" ? "checklist"
              : r.type === "draw" ? "draw" : "text";
    const imgs = normImagesHash(r.images_json);
    if (type === "checklist") return `cl|${title}|${normItems(r.items_json)}|${imgs}`;
    return `${type}|${title}|${r.content || ""}|${imgs}`;
  };
  const fingerprintFromIncoming = (n) => {
    const title = String(n.title || "").trim();
    const type = n.type === "checklist" ? "checklist"
              : n.type === "draw" ? "draw" : "text";
    const imgs = normImagesHash(n.images);
    if (type === "checklist") return `cl|${title}|${normItems(n.items)}|${imgs}`;
    return `${type}|${title}|${String(n.content || "")}|${imgs}`;
  };
  const seenFingerprints = new Set(userRows.map(fingerprintFromRow));

  let imported = 0;
  let skipped = 0;
  try {
    const tx = db.transaction((arr) => {
      for (const n of arr) {
        const fp = fingerprintFromIncoming(n);
        if (seenFingerprints.has(fp)) {
          skipped++;
          continue;
        }
        seenFingerprints.add(fp);
        const id = existing.has(String(n.id)) ? uid() : String(n.id);
        existing.add(id);
        const importedTags = JSON.stringify(Array.isArray(n.tags) ? n.tags : []);
        runInsertNote({
          id,
          user_id: req.user.id,
          type: n.type === "checklist" ? "checklist" : n.type === "draw" ? "draw" : "text",
          title: String(n.title || ""),
          content: n.type === "checklist" ? "" : String(n.content || ""),
          items_json: JSON.stringify(Array.isArray(n.items) ? n.items : []),
          tags_json: "[]",
          images_json: JSON.stringify(Array.isArray(n.images) ? n.images : []),
          color: typeof n.color === "string" ? n.color : "default",
          pinned: n.pinned ? 1 : 0,
          position: typeof n.position === "number" ? n.position : Date.now(),
          timestamp: n.timestamp || nowISO(),
          client_updated_at: (parseIsoTimestamp(n.client_updated_at || n.timestamp) || {}).iso || nowISO(),
        });
        if (importedTags !== "[]") upsertUserTags.run(id, req.user.id, importedTags);
        imported++;
      }
    });
    tx(src);
    res.json({ ok: true, imported, skipped });
  } catch (err) {
    console.error("[Import] Failed:", err.message);
    res.status(500).json({ error: `Import failed: ${err.message}` });
  }
});

// ---------- User Settings ----------
app.get("/api/user/settings", auth, (req, res) => {
  const row = getUserSettings.get(req.user.id);
  res.json(row ? JSON.parse(row.settings_json) : {});
});

app.patch("/api/user/settings", auth, (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return res.status(400).json({ error: "Invalid settings object" });
  }
  // Merge with existing settings
  const row = getUserSettings.get(req.user.id);
  const current = row ? JSON.parse(row.settings_json) : {};
  const merged = { ...current, ...incoming };
  upsertUserSettings.run(req.user.id, JSON.stringify(merged));
  res.json(merged);
});

// ---------- Admin ----------
// adminOnly() lives near auth() (above) so unlock-routes can use it too.

// Admin settings storage (in-memory for now, could be moved to DB)
let adminSettings = {
  allowNewAccounts: process.env.ALLOW_REGISTRATION === "true" || false,
  loginSlogan: "",
};

// Get admin settings
app.get("/api/admin/settings", auth, adminOnly, (_req, res) => {
  res.json(adminSettings);
});

// Update admin settings
app.patch("/api/admin/settings", auth, adminOnly, (req, res) => {
  const { allowNewAccounts, loginSlogan } = req.body || {};

  if (typeof allowNewAccounts === 'boolean') {
    adminSettings.allowNewAccounts = allowNewAccounts;
  }
  if (typeof loginSlogan === 'string') {
    adminSettings.loginSlogan = loginSlogan.slice(0, 200);
  }

  res.json(adminSettings);
});

// Check if new account creation is allowed (public endpoint)
app.get("/api/admin/allow-registration", (_req, res) => {
  res.json({ allowNewAccounts: adminSettings.allowNewAccounts });
});

// Public endpoint for login slogan
app.get("/api/admin/login-slogan", (_req, res) => {
  res.json({ loginSlogan: adminSettings.loginSlogan });
});

// Include a rough storage usage estimate (bytes) for each user
// This sums the LENGTH() of relevant TEXT columns across a user's notes.
// It’s an approximation (UTF-8 chars ≈ bytes, and data-URL images are strings).
const listAllUsers = db.prepare(`
  SELECT
    u.id,
    u.name,
    u.email,
    u.created_at,
    u.is_admin,
    u.avatar_url,
    COUNT(n.id) AS notes,
    COALESCE(SUM(
      COALESCE(LENGTH(n.title),0) +
      COALESCE(LENGTH(n.content),0) +
      COALESCE(LENGTH(n.items_json),0) +
      COALESCE(LENGTH(n.tags_json),0) +
      COALESCE(LENGTH(n.images_json),0) +
      COALESCE(LENGTH(n.enc_payload),0)
    ), 0) AS storage_bytes
  FROM users u
  LEFT JOIN notes n ON n.user_id = u.id
  GROUP BY u.id
  ORDER BY u.created_at DESC
`);

app.get("/api/admin/users", auth, adminOnly, (_req, res) => {
  const rows = listAllUsers.all();
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      is_admin: !!r.is_admin,
      notes: Number(r.notes || 0),
      storage_bytes: Number(r.storage_bytes || 0),
      created_at: r.created_at,
      avatar_url: r.avatar_url || null,
    }))
  );
});

// ---------- Pending Registrations (admin) ----------
const listPendingUsers = db.prepare(
  "SELECT id, name, email, created_at FROM pending_users ORDER BY created_at ASC"
);
const getPendingById = db.prepare("SELECT * FROM pending_users WHERE id = ?");
const deletePendingById = db.prepare("DELETE FROM pending_users WHERE id = ?");

app.get("/api/admin/pending-users", auth, adminOnly, (_req, res) => {
  res.json(listPendingUsers.all());
});

app.post("/api/admin/pending-users/:id/approve", auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const pending = getPendingById.get(id);
  if (!pending) return res.status(404).json({ error: "Pending registration not found." });

  // Guard against collision with a concurrently-created user
  if (getUserByEmail.get(pending.email)) {
    deletePendingById.run(id);
    return res.status(409).json({ error: "A user with this email already exists." });
  }

  // Move to users table, preserving the user-chosen password_hash (no forced change)
  const info = insertUser.run(pending.name, pending.email, pending.password_hash, nowISO());
  deletePendingById.run(id);

  // Check if this user should be auto-promoted to admin via env var
  try { promoteToAdminIfNeeded(pending.email); } catch {}

  const user = getUserById.get(info.lastInsertRowid);
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    is_admin: !!user.is_admin,
    created_at: user.created_at,
  });
});

app.post("/api/admin/pending-users/:id/reject", auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const pending = getPendingById.get(id);
  if (!pending) return res.status(404).json({ error: "Pending registration not found." });
  deletePendingById.run(id);
  res.json({ ok: true });
});

// Search users endpoint for collaboration
const searchUsersStmt = db.prepare(`
  SELECT id, name, email, avatar_url
  FROM users 
  WHERE (name LIKE ? OR email LIKE ?)
  ORDER BY name ASC
  LIMIT 50
`);
app.get("/api/users/search", auth, (req, res) => {
  const query = req.query.q || "";
  const searchTerm = `%${query}%`;
  const rows = searchUsersStmt.all(searchTerm, searchTerm);
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      avatar_url: r.avatar_url || null,
    }))
  );
});

const deleteUserStmt = db.prepare("DELETE FROM users WHERE id = ?");
app.delete("/api/admin/users/:id", auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: "You cannot delete yourself." });
  }
  const target = getUserById.get(id);
  if (!target) return res.status(404).json({ error: "User not found" });

  const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE is_admin=1").get().c;
  if (target.is_admin && adminCount <= 1) {
    return res.status(400).json({ error: "Cannot delete the last admin." });
  }

  deleteUserStmt.run(id);
  res.json({ ok: true });
});

// Create user from admin panel
app.post("/api/admin/users", auth, adminOnly, (req, res) => {
  const { name, email, password, is_admin } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required." });
  }

  if (getUserByEmail.get(email)) {
    return res.status(409).json({ error: "Email already registered." });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = insertUser.run(name.trim(), email.trim(), hash, nowISO());

  // Set admin status if specified + always mark password as temporary
  const updateParts = ["must_change_password = 1"];
  if (is_admin) updateParts.push("is_admin = 1");
  db.prepare(`UPDATE users SET ${updateParts.join(", ")} WHERE id = ?`).run(info.lastInsertRowid);

  const user = getUserById.get(info.lastInsertRowid);
  res.status(201).json({
    id: user.id,
    name: user.name,
    email: user.email,
    is_admin: !!user.is_admin,
    created_at: user.created_at,
  });
});

// Update user from admin panel
app.patch("/api/admin/users/:id", auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const { name, email, password, is_admin } = req.body || {};

  // Cannot update yourself to non-admin if you're the only admin
  if (id === req.user.id && is_admin === false) {
    const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE is_admin=1").get().c;
    if (adminCount <= 1) {
      return res.status(400).json({ error: "Cannot remove admin status from the last admin." });
    }
  }

  // Check if user exists
  const existing = getUserById.get(id);
  if (!existing) {
    return res.status(404).json({ error: "User not found" });
  }

  // Check if email is already taken by another user
  if (email && email !== existing.email) {
    const emailCheck = getUserByEmail.get(email);
    if (emailCheck && emailCheck.id !== id) {
      return res.status(409).json({ error: "Email already in use by another user." });
    }
  }

  // Prepare update query
  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push("name = ?");
    params.push(name.trim());
  }

  if (email !== undefined) {
    updates.push("email = ?");
    params.push(email.trim());
  }

  if (password) {
    updates.push("password_hash = ?");
    params.push(bcrypt.hashSync(password, 10));
    // When admin resets a password, force the user to change it on next login
    updates.push("must_change_password = ?");
    params.push(1);
  }

  if (is_admin !== undefined) {
    updates.push("is_admin = ?");
    params.push(is_admin ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No valid fields to update." });
  }

  // Execute update
  const updateStmt = db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`);
  params.push(id);
  const result = updateStmt.run(...params);

  if (result.changes === 0) {
    return res.status(404).json({ error: "User not found" });
  }

  // Return updated user data
  const updatedUser = getUserById.get(id);
  res.json({
    id: updatedUser.id,
    name: updatedUser.name,
    email: updatedUser.email,
    is_admin: !!updatedUser.is_admin,
    created_at: updatedUser.created_at,
  });
});


// ---------- AI Assistant (Server side) ----------
// Check AI status
app.get("/api/ai/status", auth, (req, res) => {
  res.json({
    initialized: !!aiGenerator,
    modelSize: "~700MB",
    modelName: "Llama-3.2-1B-Instruct-ONNX"
  });
});

// Initialize AI (on-demand)
app.post("/api/ai/initialize", auth, async (req, res) => {
  try {
    if (aiGenerator) {
      return res.json({ ok: true, message: "AI already initialized" });
    }

    await initServerAI();

    if (!aiGenerator) {
      return res.status(500).json({ error: "Failed to initialize AI model" });
    }

    res.json({ ok: true, message: "AI initialized successfully" });
  } catch (err) {
    console.error("AI initialization error:", err);
    res.status(500).json({ error: "Failed to initialize AI model" });
  }
});

app.post("/api/ai/ask", auth, async (req, res) => {
  const { question, notes } = req.body || {};
  if (!question) return res.status(400).json({ error: "Missing question" });

  try {
    if (!aiGenerator) {
      // Try to init if not ready
      await initServerAI();
      if (!aiGenerator) {
        return res.status(503).json({ error: "AI Assistant is still initializing or failed to load." });
      }
    }

    // Limit context strictly - better search logic
    const relevantNotes = (notes || []).filter(n => {
      const q = question.toLowerCase().replace(/[^\w\s]/g, ' '); // Strip punctuation for searching
      const words = q.split(/\s+/).filter(w => w.length >= 2); // At least 2 chars
      const t = (n.title || "").toLowerCase();
      const c = (n.content || "").toLowerCase();

      return words.some(word => t.includes(word) || c.includes(word) || word.includes(t) && t.length > 2);
    }).slice(0, 5); // Take up to 5 relevant notes

    const notesToUse = relevantNotes.length > 0 ? relevantNotes : (notes || []).slice(0, 4);
    const context = notesToUse
      .map(n => `TITLE: ${n.title}\nCONTENT: ${n.content.substring(0, 1500)}`)
      .join('\n\n---\n\n');

    const prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
You are a private assistant for the Glass Keep notes app.
Use ONLY the provided Note Context to answer the user. 
If the answer is not in the notes, say "I couldn't find any information about that in your notes."
Be direct, helpful, and concise.

Note Context:
${context}<|eot_id|><|start_header_id|>user<|end_header_id|>
${question}<|eot_id|><|start_header_id|>assistant<|end_header_id|>
`;

    const output = await aiGenerator(prompt, {
      max_new_tokens: 300,
      temperature: 0.1,
      repetition_penalty: 1.1,
      do_sample: false,
      return_full_text: false,
    });

    res.json({ answer: output[0].generated_text.trim() });
  } catch (err) {
    console.error("Server AI Error:", err);
    res.status(500).json({ error: "AI processing failed on server." });
  }
});

// ---------- Health ----------
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "glasskeep", env: NODE_ENV }));

// ---------- Static (production) ----------
if (NODE_ENV === "production") {
  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

// ---------- Listen ----------
const SSL_CERT    = process.env.SSL_CERT;
const SSL_KEY     = process.env.SSL_KEY;
const HTTPS_ENABLED = process.env.HTTPS_ENABLED !== "false";

if (
  HTTPS_ENABLED &&
  SSL_CERT && SSL_KEY &&
  fs.existsSync(SSL_CERT) && fs.existsSync(SSL_KEY)
) {
  const https = require("https");
  const sslOptions = {
    cert: fs.readFileSync(SSL_CERT),
    key:  fs.readFileSync(SSL_KEY),
  };
  https.createServer(sslOptions, app).listen(PORT, "0.0.0.0", () => {
    console.log(`API listening on https://0.0.0.0:${PORT}  (env=${NODE_ENV})`);
  });
} else {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`API listening on http://0.0.0.0:${PORT}  (env=${NODE_ENV})`);
  });
}