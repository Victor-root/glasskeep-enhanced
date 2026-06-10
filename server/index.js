// server/index.js
// Express + SQLite (better-sqlite3) + JWT auth API for Glass Keep

const path = require("path");
const fs = require("fs");
const { restartSelf, shutdownSelf } = require("./services/updateOrchestrator");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const cors = require("cors");
const crypto = require("crypto");

// AI provider — OpenAI-compatible HTTP layer (Ollama, Open WebUI,
// LiteLLM, OpenAI, OpenRouter, …). The server itself no longer ships
// an embedded model.
const { attachAiRoutes } = require("./ai/aiRoutes");

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
// `verify` stashes the raw request body, but ONLY for the
// server-to-server federation endpoints, which HMAC-sign the exact
// bytes they sent. Capturing it everywhere would needlessly hold a copy
// of every (up to 160 MB) upload; federation payloads are tiny.
app.use(
  express.json({
    limit: "160mb",
    verify: (req, _res, buf) => {
      if (req.url && req.url.startsWith("/api/federation/")) {
        req.rawBody = buf.toString("utf8");
      }
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "160mb" }));

// Trust proxy headers (X-Forwarded-Proto / X-Forwarded-For) when:
//   - the operator explicitly set TRUST_PROXY=true, OR
//   - HTTPS is disabled at the Node level (HTTPS_ENABLED=false), which
//     means TLS is necessarily terminated at an upstream reverse proxy.
// Without this, req.secure stays false on a perfectly-fine HTTPS request
// forwarded by Nginx/Caddy/Traefik, and the at-rest unlock endpoint
// would refuse the request as "plaintext HTTP".
const TRUST_PROXY = process.env.TRUST_PROXY === "true"
  || process.env.HTTPS_ENABLED === "false";
if (TRUST_PROXY) {
  app.set("trust proxy", true);
  console.log(
    "[boot] trust proxy enabled (TRUST_PROXY=" + (process.env.TRUST_PROXY || "(unset)")
    + ", HTTPS_ENABLED=" + (process.env.HTTPS_ENABLED || "(unset)")
    + "); TLS termination is the operator's responsibility upstream of Node.",
  );
}

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
  type TEXT NOT NULL,          -- "text" | "checklist" | "draw" | "audio"
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

-- Persisted notifications for the recipient. Survives the user being
-- offline at the moment a notification is generated — the client
-- fetches everything still undelivered on next login and marks them
-- delivered after displaying the toast. note_title / sender_name are
-- captured at create time so the row still renders correctly even if
-- the source note is later deleted or the sender renames themselves.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_user_id INTEGER NOT NULL,
  sender_user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  note_id TEXT,
  note_title TEXT,
  sender_name TEXT NOT NULL,
  variant TEXT,
  message TEXT,
  persistent INTEGER NOT NULL DEFAULT 0,
  icon TEXT,
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  FOREIGN KEY(recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_pending
  ON notifications(recipient_user_id, delivered_at);

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

CREATE TABLE IF NOT EXISTS logos (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  src TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_logos_user ON logos(user_id);

-- App-wide admin settings (allow_new_accounts, login_slogan, etc.).
-- Singleton row by design: CHECK (id = 1) ensures we never accidentally
-- end up with multiple rows competing for "the truth". Without this
-- table the settings only lived in process memory and reset to
-- env-var defaults on every server restart, silently wiping any
-- value the admin had configured through the panel.
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  allow_new_accounts INTEGER NOT NULL DEFAULT 0,
  login_slogan TEXT NOT NULL DEFAULT '',
  custom_app_name TEXT NOT NULL DEFAULT '',
  custom_logo TEXT,
  login_bg_image TEXT,
  login_bg_blur INTEGER NOT NULL DEFAULT 0,
  custom_logo_pwa TEXT,
  -- Tiny placeholders derived from the login background at upload time so
  -- the login page can paint instantly (no flash of the default backdrop)
  -- while the full image downloads: a mean colour (#rrggbb) and a BlurHash
  -- string (~30 chars). login_bg_version is a cache-buster bumped on every
  -- background change so the (otherwise constant) image URL is re-fetched.
  login_bg_color TEXT,
  login_bg_hash TEXT,
  login_bg_version TEXT
);

-- Web Push subscriptions (PWA push notifications for reminders). One row
-- per browser/device endpoint. The endpoint is unique so re-subscribing
-- the same device upserts instead of duplicating. p256dh / auth are the
-- subscription's encryption keys (base64url). Rows are pruned when the
-- push service reports the endpoint as gone (HTTP 404/410).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  lang TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);
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
      if (!names.has("language")) {
        // NULL = automatic (detect from browser). Otherwise an explicit
        // tag like "fr" or "en". Stored as TEXT to remain forward-compatible.
        db.exec(`ALTER TABLE users ADD COLUMN language TEXT`);
      }
      if (!names.has("app_bg_image")) {
        // Per-user app background image (data URL). NULL = use the default
        // (floating cards). Stored in its own column so the large data URL
        // stays out of the synced user_settings blob.
        db.exec(`ALTER TABLE users ADD COLUMN app_bg_image TEXT`);
      }
      if (!names.has("app_bg_blur")) {
        db.exec(`ALTER TABLE users ADD COLUMN app_bg_blur INTEGER NOT NULL DEFAULT 0`);
      }
      // Optional separate dark-mode background. When app_bg_separate is 0
      // the (light) app_bg_image is shared by both themes; when 1, the
      // dark columns are used in dark mode.
      if (!names.has("app_bg_image_dark")) {
        db.exec(`ALTER TABLE users ADD COLUMN app_bg_image_dark TEXT`);
      }
      if (!names.has("app_bg_blur_dark")) {
        db.exec(`ALTER TABLE users ADD COLUMN app_bg_blur_dark INTEGER NOT NULL DEFAULT 0`);
      }
      if (!names.has("app_bg_separate")) {
        db.exec(`ALTER TABLE users ADD COLUMN app_bg_separate INTEGER NOT NULL DEFAULT 0`);
      }
      // Master on/off for the custom app background — lets a user disable
      // it without losing the uploaded image(s). Defaults to 1 so existing
      // backgrounds keep showing after the migration.
      if (!names.has("app_bg_enabled")) {
        db.exec(`ALTER TABLE users ADD COLUMN app_bg_enabled INTEGER NOT NULL DEFAULT 1`);
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
      // Reminders (note-reminders feature). `reminder_at` is the due
      // instant as an ISO-8601 UTC string (NULL = no reminder).
      // `reminder_fired_at` records when the scheduler dispatched the
      // notification (NULL = still pending) so a due reminder fires
      // exactly once and survives a server restart. Both are kept in
      // the clear (NOT inside enc_payload): they carry no note content,
      // and the scheduler must be able to query them with plain SQL
      // regardless of the at-rest encryption unlock state.
      if (!names.has("reminder_at")) {
        db.exec(`ALTER TABLE notes ADD COLUMN reminder_at TEXT`);
      }
      if (!names.has("reminder_fired_at")) {
        db.exec(`ALTER TABLE notes ADD COLUMN reminder_fired_at TEXT`);
      }
    });
    tx();
  } catch {
    // ignore if ALTER not supported or already applied
  }
})();

// Partial index so the reminder scheduler's "what's due now" sweep stays
// a cheap index scan even as the notes table grows: only rows that
// actually carry a pending reminder are indexed.
(function ensureReminderIndex() {
  try {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_notes_pending_reminders
         ON notes(reminder_at)
         WHERE reminder_at IS NOT NULL AND reminder_fired_at IS NULL`,
    );
  } catch {
    // ignore if partial indexes unsupported (very old SQLite)
  }
})();

// push_subscriptions migration: the `lang` column was added after the
// initial reminders release so the Web Push payload (title) can be
// localized per device — installs created before it need the ALTER.
(function ensurePushSubscriptionColumns() {
  try {
    const cols = db.prepare(`PRAGMA table_info(push_subscriptions)`).all();
    if (!cols.some((c) => c.name === "lang")) {
      db.exec(`ALTER TABLE push_subscriptions ADD COLUMN lang TEXT`);
    }
  } catch {
    // table may not exist yet (fresh boot creates it with the column)
  }
})();

// Notifications-table migrations. The original schema only stored
// the bare share / revoke fields (sender_name, note_title) because
// the message text could be regenerated client-side from i18n. The
// new `variant`, `message` and `persistent` columns let arbitrary
// notification types (test-CLI dispatches, future generic events)
// survive a logout — the pending-fetch path replays them on next
// login with the original payload instead of dropping them.
(function ensureNotificationColumns() {
  try {
    const cols = db.prepare(`PRAGMA table_info(notifications)`).all();
    const names = new Set(cols.map((c) => c.name));
    const tx = db.transaction(() => {
      if (!names.has("variant")) {
        db.exec(`ALTER TABLE notifications ADD COLUMN variant TEXT`);
      }
      if (!names.has("message")) {
        db.exec(`ALTER TABLE notifications ADD COLUMN message TEXT`);
      }
      if (!names.has("persistent")) {
        db.exec(
          `ALTER TABLE notifications ADD COLUMN persistent INTEGER NOT NULL DEFAULT 0`,
        );
      }
      if (!names.has("icon")) {
        db.exec(`ALTER TABLE notifications ADD COLUMN icon TEXT`);
      }
    });
    tx();
  } catch {
    // ignore if the table doesn't exist yet (first boot — CREATE
    // TABLE above will produce the full schema) or ALTER unsupported.
  }
})();
// app_settings-table migrations. The original schema only had
// allow_new_accounts + login_slogan; the custom-branding feature adds
// the optional login-page branding columns (custom app name, logo,
// background image, background blur). All default to empty/NULL so an
// instance that never configures branding behaves exactly as before.
(function ensureAppSettingsColumns() {
  try {
    const cols = db.prepare(`PRAGMA table_info(app_settings)`).all();
    const names = new Set(cols.map((c) => c.name));
    const tx = db.transaction(() => {
      if (!names.has("custom_app_name")) {
        db.exec(`ALTER TABLE app_settings ADD COLUMN custom_app_name TEXT NOT NULL DEFAULT ''`);
      }
      if (!names.has("custom_logo")) {
        db.exec(`ALTER TABLE app_settings ADD COLUMN custom_logo TEXT`);
      }
      if (!names.has("login_bg_image")) {
        db.exec(`ALTER TABLE app_settings ADD COLUMN login_bg_image TEXT`);
      }
      if (!names.has("login_bg_blur")) {
        db.exec(`ALTER TABLE app_settings ADD COLUMN login_bg_blur INTEGER NOT NULL DEFAULT 0`);
      }
      // Square PNG icon derived from the custom logo, used for the PWA
      // manifest (home-screen icon). Generated client-side on upload.
      if (!names.has("custom_logo_pwa")) {
        db.exec(`ALTER TABLE app_settings ADD COLUMN custom_logo_pwa TEXT`);
      }
      // Login-background placeholders (mean colour + BlurHash) and a
      // cache-buster version. Added after the initial branding release.
      if (!names.has("login_bg_color")) {
        db.exec(`ALTER TABLE app_settings ADD COLUMN login_bg_color TEXT`);
      }
      if (!names.has("login_bg_hash")) {
        db.exec(`ALTER TABLE app_settings ADD COLUMN login_bg_hash TEXT`);
      }
      if (!names.has("login_bg_version")) {
        db.exec(`ALTER TABLE app_settings ADD COLUMN login_bg_version TEXT`);
      }
      if (!names.has("login_theme")) {
        db.exec(`ALTER TABLE app_settings ADD COLUMN login_theme TEXT NOT NULL DEFAULT 'glasskeep'`);
      }
      // The name THIS server advertises to federation peers (shown in the
      // cross-server collaborator badge). Empty until the admin sets it.
      if (!names.has("federation_self_name")) {
        db.exec(`ALTER TABLE app_settings ADD COLUMN federation_self_name TEXT NOT NULL DEFAULT ''`);
      }
    });
    tx();
  } catch {
    // ignore if the table doesn't exist yet (first boot — CREATE
    // TABLE above will produce the full schema) or ALTER unsupported.
  }
})();
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
const { attachPasskeyRoutes } = require("./routes/passkeyRoutes");
const { attachUpdateRoutes } = require("./routes/updateRoutes");
const { attachSelfUpdateRoutes } = require("./routes/selfUpdateRoutes");
const { attachAssetLinksRoutes } = require("./routes/assetLinksRoutes");
const { attachDeviceLinkRoutes } = require("./routes/deviceLinkRoutes");
const { attachFederationRoutes } = require("./routes/federationRoutes");
const { requireUnlocked } = require("./routes/lockMiddleware");
const { t: serverT } = require("./i18n");
const pushService = require("./services/pushNotifications");
const { startReminderScheduler } = require("./services/reminderScheduler");

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

// Audio note validation. The audio payload is stored as JSON inside `content`.
// Two on-disk shapes are accepted:
//   v2 (current): { version: 2, clips: [{ audioDataUrl, mimeType, … }, …], text }
//   v1 (legacy):  { audioDataUrl, mimeType, duration, size, … }
//
// Cap the whole serialised content at 150 MB. This must comfortably exceed
// the client's AUDIO_MAX_TOTAL_BYTES (100 MB of *raw* audio) once base64
// inflation (~33%) and JSON wrapping are applied — 100 MB raw becomes
// ~134 MB on the wire. Each clip's data URL must use an allowed audio MIME.
// An empty clips array is accepted — a freshly-created draft can have a
// title but no recordings yet (the user will record into it).
const AUDIO_MAX_DATAURL_BYTES = 150 * 1024 * 1024;
const ALLOWED_AUDIO_MIME_PREFIXES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
];
function isAllowedAudioDataUrl(url) {
  if (typeof url !== "string" || !url.startsWith("data:")) return false;
  const mimeMatch = url.match(/^data:([^;,]+)[;,]/);
  const mime = (mimeMatch ? mimeMatch[1] : "").toLowerCase();
  return ALLOWED_AUDIO_MIME_PREFIXES.some((p) => mime.startsWith(p));
}
function validateAudioContent(raw) {
  if (typeof raw !== "string" || !raw) return "Audio note has no content";
  if (raw.length > AUDIO_MAX_DATAURL_BYTES) return "Audio recording is too large";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "Audio note content is not valid JSON";
  }
  if (!parsed || typeof parsed !== "object") {
    return "Audio note content is not an object";
  }
  // v2: clips array. Empty is valid (title-only draft).
  if (Array.isArray(parsed.clips)) {
    for (const c of parsed.clips) {
      if (!c || typeof c !== "object") return "Audio clip is not an object";
      if (!isAllowedAudioDataUrl(c.audioDataUrl)) return "Unsupported audio MIME type";
    }
    return null;
  }
  // v1: single audioDataUrl
  if ("audioDataUrl" in parsed) {
    if (!isAllowedAudioDataUrl(parsed.audioDataUrl)) return "Unsupported audio MIME type";
    return null;
  }
  return "Audio note is missing recordings";
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
    // Reminders: ISO-8601 UTC due instant (null = none) and the moment
    // the scheduler dispatched it (null = still pending). Plain columns,
    // never encrypted — see the ensureNoteColumns migration.
    reminderAt: r.reminder_at || null,
    reminderFiredAt: r.reminder_fired_at || null,
    // Cross-server status (null for ordinary notes): role + live link
    // state + whether this copy is currently read-only because its
    // authority peer is unreachable / locked / out of date.
    federation: noteFederationRef?.noteFederationInfo(r.id) || null,
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
//
// The AAD context (noteId, ownerUserId) is what binds a v2 ciphertext
// to its row; without it a thief could swap one note's enc_payload
// onto another row and the swap would be undetectable. The owner's
// user_id, NOT the requester's, is used so a collaborator's edit
// produces a payload that the owner can still read.
function buildWriteRow(fields, ctx) {
  return noteCipher.prepareRowForWrite({
    title: fields.title ?? "",
    content: fields.content ?? "",
    items_json: fields.items_json ?? "[]",
    tags_json: fields.tags_json ?? "[]",
    images_json: fields.images_json ?? "[]",
    color: fields.color ?? "default",
  }, ctx);
}

function runInsertNote(n) {
  const w = buildWriteRow(n, { noteId: n.id, userId: n.user_id });
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

// `ownerUserId` is the user_id of the row that gets updated, taken
// from the existing row (NOT from the requester) so a collaborator
// edit re-encrypts under the owner's AAD and the owner can still
// read the result.
function runUpdateNoteFullCollab(updated, ownerUserId) {
  const w = buildWriteRow(updated, { noteId: updated.id, userId: ownerUserId });
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
  // existing.user_id is the OWNER (not the requesting userId, which
  // can be a collaborator). The AAD must be tied to the owner so the
  // re-encrypted blob still verifies for the owner on read.
  const w = buildWriteRow(merged, { noteId: id, userId: existing.user_id });
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
  SELECT u.id, u.name, u.email, u.avatar_url, u.federated_origin, nc.added_at, nc.added_by
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

// Notification statements
const insertNotification = db.prepare(`
  INSERT INTO notifications
    (recipient_user_id, sender_user_id, type, note_id, note_title, sender_name,
     variant, message, persistent, icon, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const getPendingNotificationsForUser = db.prepare(`
  SELECT id, sender_user_id, type, note_id, note_title, sender_name,
         variant, message, persistent, icon, created_at
  FROM notifications
  WHERE recipient_user_id = ? AND delivered_at IS NULL
  ORDER BY created_at ASC
`);
const getHistoryNotificationsForUser = db.prepare(`
  SELECT id, sender_user_id, type, note_id, note_title, sender_name,
         variant, message, persistent, icon, created_at, delivered_at
  FROM notifications
  WHERE recipient_user_id = ? AND delivered_at IS NOT NULL
  ORDER BY delivered_at DESC
  LIMIT 100
`);
const markNotificationDelivered = db.prepare(`
  UPDATE notifications
  SET delivered_at = ?
  WHERE id = ? AND recipient_user_id = ? AND delivered_at IS NULL
`);

// Per-user tags
// Schema also carries (is_encrypted, enc_payload) so the rows can be
// stored encrypted at rest. The plaintext tags_json column is kept as
// a placeholder ("[]") on encrypted rows to satisfy the NOT NULL
// default and to keep any reader outside these helpers from seeing
// real tag names.
const getUserTagsRowStmt = db.prepare(
  "SELECT tags_json, is_encrypted, enc_payload FROM note_user_tags WHERE note_id = ? AND user_id = ?"
);
const upsertUserTagsPlainStmt = db.prepare(
  `INSERT INTO note_user_tags (note_id, user_id, tags_json, is_encrypted, enc_payload)
   VALUES (?, ?, ?, 0, NULL)
   ON CONFLICT(note_id, user_id) DO UPDATE SET
     tags_json = excluded.tags_json,
     is_encrypted = 0,
     enc_payload = NULL`
);
const upsertUserTagsEncStmt = db.prepare(
  `INSERT INTO note_user_tags (note_id, user_id, tags_json, is_encrypted, enc_payload)
   VALUES (?, ?, '[]', 1, ?)
   ON CONFLICT(note_id, user_id) DO UPDATE SET
     tags_json = '[]',
     is_encrypted = 1,
     enc_payload = excluded.enc_payload`
);

// Read the per-user tag list for (noteId, userId) — transparently
// decrypts when the row is stored encrypted. Returns '[]' when no row
// exists or when decryption fails (the latter is logged so a corrupted
// AAD is investigable instead of silently swallowed).
function getUserTags(noteId, userId) {
  const row = getUserTagsRowStmt.get(noteId, userId);
  if (!row) return "[]";
  if (!row.is_encrypted) return row.tags_json || "[]";
  if (!row.enc_payload) return "[]";
  try {
    return noteCipher.decryptTagsPayload(row.enc_payload, { noteId, userId });
  } catch (e) {
    console.warn(`[encrypt] failed to decrypt tags for note=${noteId} user=${userId}: ${e.message}`);
    return "[]";
  }
}

// Persist the per-user tag list for (noteId, userId). Uses the
// encrypted statement when the instance is unlocked and encryption is
// active; falls back to the plaintext statement otherwise.
function runUpsertUserTags(noteId, userId, tagsJson) {
  if (noteCipher.isActive()) {
    const enc = noteCipher.encryptTagsJson(tagsJson, { noteId, userId });
    upsertUserTagsEncStmt.run(noteId, userId, enc);
  } else {
    upsertUserTagsPlainStmt.run(noteId, userId, tagsJson);
  }
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
// Federation badge info for a participant: whether they're a stand-in
// for a remote-server user and, if so, that server's friendly name.
function participantFedInfo(u) {
  const federatedOrigin = u && u.federated_origin;
  if (!federatedOrigin) return { federated: false, serverLabel: null, remoteRef: null };
  // federated_origin is "<linkId>|<remoteRef>"; the remoteRef is the
  // participant's own identity on the peer (clean — no server URL).
  const idx = String(federatedOrigin).indexOf("|");
  const remoteRef = idx >= 0 ? String(federatedOrigin).slice(idx + 1) : null;
  // The shadow's synthetic email ends in the peer host — a robust hint
  // for resolving the server name even if the link id changed.
  const hostHint = u.email ? String(u.email).split("@").pop() : null;
  return {
    federated: true,
    serverLabel: noteFederationRef?.serverLabelForOrigin(federatedOrigin, hostHint) || null,
    remoteRef,
  };
}

// Build a participant object for collaborator lists. For a remote
// stand-in, the secondary line shows their clean identity on the peer
// (remoteRef), NOT the synthetic local email that embeds the server URL.
function participantObj(u, extra = {}) {
  const fed = participantFedInfo(u);
  return {
    id: u.id,
    name: u.name,
    email: fed.federated ? fed.remoteRef || u.email : u.email,
    avatar_url: u.avatar_url || null,
    federated: fed.federated,
    serverLabel: fed.serverLabel,
    ...extra,
  };
}

function getNoteParticipants(noteId, noteOwnerId, requestingUserId) {
  const collabList = getNoteCollaborators.all(noteId);
  if (collabList.length === 0) return null;
  const others = collabList
    .filter((c) => c.id !== requestingUserId)
    .map((c) => participantObj(c));
  if (noteOwnerId !== requestingUserId) {
    const owner = getUserById.get(noteOwnerId);
    if (owner) others.unshift(participantObj(owner));
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

// Push an event to every connected SSE client, regardless of user.
// Used by the lock route so other admins/users who are currently
// online drop straight to the unlock screen instead of finding out at
// the next request or the next 30-second status poll.
function broadcastToAll(event) {
  for (const userId of sseClients.keys()) {
    sendEventToUser(userId, event);
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

// Set once the federation engine is attached (below). Lets
// broadcastNoteUpdated push an edit to the peer the instant it lands,
// without a forward reference to `federation`.
let noteFederationRef = null;

function broadcastNoteUpdated(noteId) {
  try {
    const note = getNoteById.get(noteId);
    if (!note) return;
    const recipientIds = new Set([note.user_id, ...getCollaboratorUserIdsForNote(noteId)]);
    const evt = { type: "note_updated", noteId };
    for (const uid of recipientIds) sendEventToUser(uid, evt);
  } catch { }
  // If this note is shared across a federation link, push the change to
  // the peer immediately (the periodic tick remains the retry/safety
  // net). Guarded + fire-and-forget so it can never disturb the local
  // note operation that triggered this broadcast.
  try { noteFederationRef?.onNoteChangedLocally(noteId); } catch { }
}

// Persist a "note_shared" notification and push it over SSE if the
// recipient is currently connected. The frontend marks pending rows
// delivered after showing the toast, so a row only fires once across
// reloads even though it lives in the DB until then.
function createShareNotification({ recipientId, senderId, senderName, noteId, noteTitle }) {
  try {
    const createdAt = nowISO();
    // Share notifications regenerate their text client-side from
    // sender_name + note_title via i18n, so variant/message stay
    // null. is_persistent=0 because the client (showShareToast)
    // defers duration to the user's notification-duration pref —
    // storing 1 here would be misleading if a future replay path
    // ever started honouring n.persistent for share/revoke rows.
    const result = insertNotification.run(
      recipientId,
      senderId,
      "note_shared",
      noteId,
      noteTitle || "",
      senderName || "",
      null,
      null,
      0,
      null,
      createdAt,
    );
    sendEventToUser(recipientId, {
      type: "note_shared",
      notificationId: result.lastInsertRowid,
      senderName: senderName || "",
      noteId,
      noteTitle: noteTitle || "",
      createdAt,
    });
  } catch (e) {
    console.warn("[notifications] createShareNotification failed:", e?.message);
  }
}

// Persist + push a "shared_note_deleted" notification: the owner deleted a
// note that was shared with this collaborator. The transient note_deleted
// SSE event only removes the note from a CONNECTED client's view and leaves
// no trace — so an offline collaborator never learns the shared note is
// gone. This persisted row fixes that: it replays on reconnect and lands in
// the notification history. By default note_id is null (no note to open after
// a full delete, and it keeps the FK happy when the row outlives a permanent
// delete); the owner-left-with-copy case passes noteId so the recipient can
// open the note they kept. It rides the same envelope as revoke notices so the
// client routes it via showRevokeToast.
function createSharedNoteDeletedNotification({
  recipientId,
  senderId,
  senderName,
  noteTitle,
  noteId = null,
  notificationType = "shared_note_deleted",
}) {
  try {
    const createdAt = nowISO();
    const row = insertNotification.run(
      recipientId,
      senderId,
      notificationType,
      noteId,
      noteTitle || "",
      senderName || "",
      null,
      null,
      0,
      null,
      createdAt,
    );
    sendEventToUser(recipientId, {
      type: "note_access_revoked_notification",
      notificationType,
      notificationId: row.lastInsertRowid,
      senderName: senderName || "",
      noteTitle: noteTitle || "",
      noteId: noteId ?? undefined,
      createdAt,
    });
  } catch (e) {
    console.warn("[notifications] createSharedNoteDeletedNotification failed:", e?.message);
  }
}

// ---------- At-rest encryption: unlock routes + lock gate ----------
// These have to be registered BEFORE the bulk of the API so the lock
// middleware can short-circuit everything else with HTTP 423 while
// still letting unlock attempts and the public lock-status endpoint
// through. See server/encryption/* and server/routes/unlockRoutes.js.
attachUnlockRoutes(app, { db, auth, adminOnly, log: console, broadcastToAll });

// Passkey schema is created up-front (idempotent) so registration + login
// work even before encryption is activated. Routes attach next to the
// unlock routes so /api/passkeys/login/* and /api/instance/unlock-passkey/*
// can run while the lock gate is active (their paths are allow-listed
// below alongside /api/instance/*).
const passkeyVaultModule = require("./encryption/passkeyVault");
passkeyVaultModule.ensureSchema(db);
attachPasskeyRoutes(app, { db, auth, adminOnly, signToken, getUserById, log: console });
attachUpdateRoutes(app, { db, auth, adminOnly, log: console });
attachSelfUpdateRoutes(app, { auth, adminOnly, log: console });

// Digital Asset Links — must answer at /.well-known/assetlinks.json
// before the production catch-all sends every unknown path to
// index.html. Stays public (no auth, no lock gate) because Android's
// verifier hits the URL unauthenticated and from outside any session.
attachAssetLinksRoutes(app, { log: console });

// Cross-device QR-code sign-in (the foreign PC shows a QR, the
// phone scans + approves, the PC trades the token for a JWT on its
// next poll). Schema is created lazily inside the route module.
attachDeviceLinkRoutes(app, { db, auth, signToken, getUserById, log: console });

// Cross-server collaboration ("federation"). Pairs two GlassKeep
// servers so their users can share notes across instances. The returned
// `tick` drives the pairing handshake retries and the per-link health
// probes; we run it on an interval (unref'd so it never keeps the
// process alive on its own) and the routes also kick it on demand.
const federation = attachFederationRoutes(app, {
  db,
  auth,
  adminOnly,
  log: console,
  broadcastToAdmins,
  // Note helpers the note-federation engine reuses, so mirrored notes go
  // through the SAME encryption-aware write path as local notes.
  noteDeps: {
    nowISO,
    isLocked: () => runtimeUnlock.isEnabled() && !runtimeUnlock.isUnlocked(),
    sendEventToUser,
    getUserById,
    getUserByEmail,
    getUserByName,
    getNoteById,
    runInsertNote,
    runUpdateNoteFullCollab,
    addCollaborator,
    getMaxUserEffectivePosition,
    upsertUserPosition,
    updateNoteWithEditor,
    createShareNotification,
    createSharedNoteDeletedNotification,
    broadcastNoteUpdated,
    isNewerOrEqual,
    parseIsoTimestamp,
  },
});
// Wire the instant-push hook used by broadcastNoteUpdated (declared above).
noteFederationRef = federation.noteFederation;
const FEDERATION_TICK_MS = (() => {
  const raw = parseInt(process.env.FEDERATION_TICK_MS, 10);
  return Number.isFinite(raw) && raw >= 5000 ? raw : 10000;
})();
setInterval(() => {
  federation.tick().catch((e) => console.warn("[federation] tick error:", e?.message));
}, FEDERATION_TICK_MS).unref();

const LOCK_ALLOW_PATHS = [
  /^\/api\/instance(\/|$)/,
  /^\/api\/passkeys\/login(\/|$)/,
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

  // Persist a notification row per admin AND deliver the live SSE event
  // each with its own row id, so the recipient's client can ack /
  // remove the right row when the admin acts. Stored values:
  //   - sender_user_id = recipient's own id (the row has no human
  //     sender — the schema requires sender_user_id NOT NULL so we
  //     self-reference; the client reads sender_name, not the FK).
  //   - note_id        = NULL (note_id has a FK to notes(id) so we
  //     can't reuse it for a pending_users id; the pendingId lives
  //     in `message` instead, which is free for this type since the
  //     body is rendered client-side from sender_name + note_title).
  //   - note_title     = registrant email (rendered in the message)
  //   - sender_name    = registrant name (rendered in the message)
  //   - message        = String(pending_users.id) — target of the
  //                      approve / reject actions.
  try {
    const admins = db.prepare("SELECT id FROM users WHERE is_admin = 1").all();
    const createdAt = nowISO();
    for (const a of admins) {
      const row = insertNotification.run(
        a.id,
        a.id,
        "pending_user_registered",
        null,
        email.trim(),
        name?.trim() || "User",
        "info",
        String(info.lastInsertRowid),
        0,
        "user-clock",
        createdAt,
      );
      sendEventToUser(a.id, {
        type: "pending_user_registered",
        pendingId: info.lastInsertRowid,
        name: name?.trim() || "User",
        email: email.trim(),
        notificationId: row.lastInsertRowid,
        createdAt,
      });
    }
  } catch (e) {
    console.warn("[notifications] pending_user_registered persist failed:", e?.message);
  }

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
  // Federation stand-in accounts (local mirrors of a remote server's
  // users) must never authenticate — they exist only to own/participate
  // in mirrored notes. Same generic message so they're indistinguishable
  // from a missing account.
  if (user.federated_origin) return res.status(401).json({ error: "No account found." });
  if (!bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(401).json({ error: "Incorrect password." });
  }
  const token = signToken(user);
  // Always include must_change_password as a boolean for parity with
  // the passkey + QR sign-in responses. Field-presence parity matters
  // because the client stores the response straight into auth state.
  const response = {
    token,
    user: { id: user.id, name: user.name, email: user.email, is_admin: !!user.is_admin, avatar_url: user.avatar_url || null, language: user.language || null },
    must_change_password: !!user.must_change_password,
  };
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
        user: { id: u.id, name: u.name, email: u.email, is_admin: !!u.is_admin, avatar_url: fullUser?.avatar_url || null, language: fullUser?.language || null },
        must_change_password: !!fullUser?.must_change_password,
      };
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

// Current user's profile, fresh from the DB. The client caches the user
// object from login in localStorage and otherwise never re-reads it, so a
// profile change made on ANOTHER device (e.g. a new avatar) never showed
// up here. The client calls this on boot/focus to refresh its cache.
app.get("/api/user/me", auth, (req, res) => {
  const u = getUserById.get(req.user.id);
  if (!u) return res.status(404).json({ error: "User not found" });
  res.json({
    id: u.id,
    name: u.name,
    email: u.email,
    is_admin: !!u.is_admin,
    avatar_url: u.avatar_url || null,
    language: u.language || null,
  });
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
    language: user.language || null,
  });
});

// Update profile preferences (authenticated). Currently accepts
// show_on_login and language; both are optional so the client can patch
// one at a time.
app.patch("/api/user/profile", auth, (req, res) => {
  const body = req.body || {};
  const updates = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(body, "show_on_login")) {
    if (typeof body.show_on_login !== "boolean") {
      return res.status(400).json({ error: "show_on_login must be a boolean." });
    }
    updates.push("show_on_login = ?");
    params.push(body.show_on_login ? 1 : 0);
  }

  if (Object.prototype.hasOwnProperty.call(body, "language")) {
    const lang = body.language;
    if (lang !== null && lang !== "" && lang !== "fr" && lang !== "en") {
      return res.status(400).json({ error: "language must be null, \"fr\" or \"en\"." });
    }
    updates.push("language = ?");
    params.push(lang ? lang : null);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No supported field provided." });
  }
  params.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...params);

  const user = getUserById.get(req.user.id);
  res.json({
    ok: true,
    show_on_login: user.show_on_login !== 0,
    language: user.language || null,
  });
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

  // Return a fresh token + full user object. The client REPLACES its
  // entire user state with whatever this returns (not a merge), so
  // omitting language would wipe the user's language preference from
  // session state on every password change.
  const updatedUser = getUserById.get(user.id);
  const token = signToken(updatedUser);
  res.json({
    ok: true,
    token,
    user: { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email, is_admin: !!updatedUser.is_admin, avatar_url: updatedUser.avatar_url || null, language: updatedUser.language || null },
    must_change_password: !!updatedUser.must_change_password,
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
      reminderAt: r.reminder_at || null,
      reminderFiredAt: r.reminder_fired_at || null,
      collaborators: getNoteParticipants(r.id, r.user_id, req.user.id),
      federation: noteFederationRef?.noteFederationInfo(r.id) || null,
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
  const normalizedType =
    body.type === "checklist" ? "checklist"
      : body.type === "draw" ? "draw"
        : body.type === "audio" ? "audio"
          : "text";
  if (normalizedType === "audio") {
    const err = validateAudioContent(String(body.content || ""));
    if (err) return res.status(400).json({ error: err });
  }
  const n = {
    id: noteId,
    user_id: req.user.id,
    type: normalizedType,
    title: String(body.title || ""),
    content: normalizedType === "checklist" ? "" : String(body.content || ""),
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
  if (userTags !== "[]") runUpsertUserTags(noteId, req.user.id, userTags);
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

  // Cross-server safety: a mirror note is read-only while its authority
  // peer can't be reached, so an edit made there can't diverge. Mirror
  // the LWW "stale" shape so the client just reconciles to the server's
  // copy (it already shows the read-only banner). Avoid 423 — that
  // triggers the global instance-locked flow.
  if (noteFederationRef?.isReadOnly(id)) {
    return res.json({ ok: true, readOnly: true, note: serializeNote(existing, req.user.id) });
  }

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
    runUpsertUserTags(id, req.user.id, JSON.stringify(b.tags));
  }
  const updatedType =
    b.type === "checklist" ? "checklist"
      : b.type === "draw" ? "draw"
        : b.type === "audio" ? "audio"
          : "text";
  if (updatedType === "audio") {
    const err = validateAudioContent(String(b.content || ""));
    if (err) return res.status(400).json({ error: err });
  }
  const updated = {
    id,
    user_id: req.user.id,
    type: updatedType,
    title: String(b.title || ""),
    content: updatedType === "checklist" ? "" : String(b.content || ""),
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
  // existing.user_id is the note's owner — it doesn't change on edit,
  // even when the editor is a collaborator. AAD binds to the owner.
  const result = runUpdateNoteFullCollab(updated, existing.user_id);

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

  // Cross-server safety: block edits to the SHARED CONTENT of a mirror
  // note while its authority peer is unreachable (per-user tags / pin
  // stay editable). The client already shows the read-only banner.
  const hasContentChange = (
    typeof req.body.title === "string" ||
    typeof req.body.content === "string" ||
    Array.isArray(req.body.items) ||
    Array.isArray(req.body.images) ||
    typeof req.body.color === "string" ||
    typeof req.body.timestamp === "string"
  );
  if (hasContentChange && noteFederationRef?.isReadOnly(id)) {
    return res.json({ ok: true, readOnly: true, note: serializeNote(existing, req.user.id) });
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
    runUpsertUserTags(id, req.user.id, JSON.stringify(req.body.tags));
  }
  // Audio content patches must still pass the same shape/size guards as
  // creates and full updates — otherwise a malicious client could rewrite
  // the audio_data of an existing audio note with anything.
  if (
    typeof req.body.content === "string" &&
    existing.type === "audio"
  ) {
    const err = validateAudioContent(String(req.body.content));
    if (err) return res.status(400).json({ error: err });
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
app.post("/api/notes/:id/collaborate", auth, async (req, res) => {
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

  // Cross-server share: "user@peer-host" where peer-host (incl. :port if
  // non-standard) is a currently-paired server. Route to the federation
  // engine, which mirrors the note onto the peer and adds a stand-in
  // collaborator here. Anything else falls through to the local lookup.
  const atIdx = username.lastIndexOf("@");
  if (atIdx > 0 && federation?.noteFederation) {
    const peerHost = username.slice(atIdx + 1).trim().toLowerCase();
    if (federation.noteFederation.isPeerHost(peerHost)) {
      const targetRef = username.slice(0, atIdx).trim();
      try {
        const owner = getUserById.get(req.user.id);
        const result = await federation.noteFederation.shareWithRemote({
          note, owner, targetRef, peerHost,
        });
        if (!result.ok) {
          const codeMap = { peer_not_paired: 400, user_not_found: 404 };
          return res
            .status(codeMap[result.error] || 502)
            .json({ error: result.error || "federation_failed" });
        }
        // Same post-share housekeeping as the local path, so the owner's
        // open card/list refresh over SSE and pick up the new (avatar-
        // bearing) collaborator without a manual reload.
        updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), noteId);
        broadcastNoteUpdated(noteId);
        return res.json({
          ok: true,
          message: `Shared with ${result.collaborator?.name || targetRef}`,
          collaborator: result.collaborator,
        });
      } catch (e) {
        console.warn("[federation/notes] shareWithRemote failed:", e?.message);
        return res.status(500).json({ error: "federation_failed" });
      }
    }
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

    // Persist + push a "note_shared" notification for the new
    // collaborator. Only runs on a fresh insert above — the 409
    // duplicate path below skips it, so re-sharing an already-shared
    // note never produces a duplicate toast.
    createShareNotification({
      recipientId: collaborator.id,
      senderId: req.user.id,
      senderName: req.user.name || req.user.email || "",
      noteId,
      noteTitle: note.title || "",
    });

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
  const result = collaborators.map((c) =>
    participantObj(c, { added_at: c.added_at, added_by: c.added_by }),
  );

  const owner = getUserById.get(note.user_id);
  if (owner) {
    result.unshift(participantObj(owner, { isOwner: true }));
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

  // Persist + push a notification on BOTH sides — the ex-collaborator
  // gets a "your access was removed" toast, the owner gets a "you
  // removed X" confirmation toast. Variant suffix tells the client
  // whether a copy was kept so the i18n message picks the right
  // phrasing. Skipped when the user removed themselves — they
  // already know, and notifying the owner about their own action
  // would be circular.
  if (!isRemovingSelf) {
    try {
      const revokeCreatedAt = nowISO();
      // -- Ex-collaborator notification --
      // When a copy was granted, persist the COPY's id in note_id so
      // the recipient's "Ouvrir" action targets the note they actually
      // still have access to. Plain revoke (no copy) keeps the
      // original id for historical context — the action falls back to
      // null on the client side.
      const recipientType = shouldGrantCopy
        ? "note_access_revoked_with_copy"
        : "note_access_revoked";
      const recipientNoteId = shouldGrantCopy ? copyNoteId : noteId;
      const revokeRow = insertNotification.run(
        userIdToRemove,
        req.user.id,
        recipientType,
        recipientNoteId,
        note.title || "",
        req.user.name || req.user.email || "",
        null,
        null,
        0,
        null,
        revokeCreatedAt,
      );
      sendEventToUser(userIdToRemove, {
        type: "note_access_revoked_notification",
        notificationType: recipientType,
        notificationId: revokeRow.lastInsertRowid,
        senderName: req.user.name || req.user.email || "",
        noteId: recipientNoteId,
        noteTitle: note.title || "",
        withCopy: shouldGrantCopy,
        createdAt: revokeCreatedAt,
      });

      // -- Owner confirmation notification --
      // The owner is the one driving the removal, so the sender of
      // the row is the removed user (for the i18n {sender} slot to
      // resolve to their name).
      const removedUser = getUserById.get(userIdToRemove);
      const removedName =
        (removedUser && (removedUser.name || removedUser.email)) || "";
      const ownerType = shouldGrantCopy
        ? "collaborator_removed_with_copy"
        : "collaborator_removed";
      const ownerRow = insertNotification.run(
        req.user.id,
        userIdToRemove,
        ownerType,
        noteId,
        note.title || "",
        removedName,
        null,
        null,
        0,
        null,
        revokeCreatedAt,
      );
      sendEventToUser(req.user.id, {
        type: "note_access_revoked_notification",
        notificationType: ownerType,
        notificationId: ownerRow.lastInsertRowid,
        senderName: removedName,
        noteId,
        noteTitle: note.title || "",
        withCopy: shouldGrantCopy,
        createdAt: revokeCreatedAt,
      });
    } catch (e) {
      console.warn("[notifications] revoke notification failed:", e?.message);
    }
  } else if (!isOwner) {
    // Collaborator left the note voluntarily — notify the owner so
    // they know who walked away. Owner-self-removal is a no-op
    // notification-wise (would be circular).
    try {
      const leftCreatedAt = nowISO();
      const owner = getUserById.get(note.user_id);
      if (owner) {
        const leftRow = insertNotification.run(
          owner.id,
          req.user.id,
          "collaborator_left",
          noteId,
          note.title || "",
          req.user.name || req.user.email || "",
          null,
          null,
          0,
          null,
          leftCreatedAt,
        );
        sendEventToUser(owner.id, {
          type: "note_access_revoked_notification",
          notificationType: "collaborator_left",
          notificationId: leftRow.lastInsertRowid,
          senderName: req.user.name || req.user.email || "",
          noteId,
          noteTitle: note.title || "",
          createdAt: leftCreatedAt,
        });
      }
    } catch (e) {
      console.warn("[notifications] collaborator_left notification failed:", e?.message);
    }
  }

  // Update note with editor info and notify remaining participants
  updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), noteId);
  broadcastNoteUpdated(noteId);

  res.json({ ok: true, message: "Collaborator removed", copyNoteId });
});

// ---------- Notifications ----------
// Pending = not yet shown to the user on any device. The client fetches
// these right after auth and shows a toast for each, then marks them
// delivered. Live notifications also flow over SSE; the client marks
// those delivered immediately so a quick reload doesn't replay them.
app.get("/api/notifications/pending", auth, (req, res) => {
  const rows = getPendingNotificationsForUser.all(req.user.id) || [];
  res.json({ notifications: rows });
});

// Delivered notifications — used to populate the history panel on any
// device at login time so every session sees the same notification
// history regardless of which device originally received each item.
// Returns the 100 most-recently-delivered rows (newest-first).
app.get("/api/notifications/history", auth, (req, res) => {
  const rows = getHistoryNotificationsForUser.all(req.user.id) || [];
  res.json({ notifications: rows });
});

app.post("/api/notifications/mark-delivered", auth, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids required" });
  }
  const now = nowISO();
  const actuallyMarked = [];
  const tx = db.transaction((rawIds) => {
    for (const raw of rawIds) {
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      const result = markNotificationDelivered.run(now, n, req.user.id);
      // Only broadcast ids the UPDATE actually changed (the row was
      // still pending). Re-acking an already-delivered row is a no-op
      // and shouldn't pollute the SSE channel.
      if (result.changes > 0) actuallyMarked.push(n);
    }
  });
  tx(ids);
  // Cross-device sync — tell every other tab / device this user
  // has open that these rows are no longer pending, so any active
  // card displaying them gets dismissed locally without waiting for
  // a manual reload. The originating client also receives it but
  // dismissing an already-dismissed notification is idempotent.
  if (actuallyMarked.length > 0) {
    sendEventToUser(req.user.id, {
      type: "notification_delivered",
      ids: actuallyMarked,
    });
  }
  res.json({ ok: true });
});

// Cross-device "Clear all" — when the user wipes the notification
// centre on one device, every other tab / device for the same user
// should reflect that wipe without waiting for a refresh. We DELETE
// the rows outright (both pending and already-delivered) so the
// /history endpoint doesn't bring them back at the next reload.
app.post("/api/notifications/clear", auth, (req, res) => {
  try {
    db.prepare(
      "DELETE FROM notifications WHERE recipient_user_id = ?",
    ).run(req.user.id);
  } catch (e) {
    console.warn("[notifications] clear DELETE failed:", e?.message);
  }
  sendEventToUser(req.user.id, { type: "notifications_cleared" });
  res.json({ ok: true });
});

// Per-item remove — DELETE one or more notifications from this user's
// row in a single call. Broadcasts `notification_removed { ids }` so
// every other connected tab / device drops the matching cards from
// its in-memory state too. Used when the user clicks the X on a
// single history entry in the notification centre panel.
app.post("/api/notifications/remove", auth, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids required" });
  }
  const removed = [];
  const stmt = db.prepare(
    "DELETE FROM notifications WHERE id = ? AND recipient_user_id = ?",
  );
  const tx = db.transaction((rawIds) => {
    for (const raw of rawIds) {
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      const info = stmt.run(n, req.user.id);
      if (info.changes > 0) removed.push(n);
    }
  });
  try {
    tx(ids);
  } catch (e) {
    console.warn("[notifications] remove failed:", e?.message);
    return res.status(500).json({ error: "remove failed" });
  }
  if (removed.length > 0) {
    sendEventToUser(req.user.id, {
      type: "notification_removed",
      ids: removed,
    });
  }
  res.json({ ok: true, ids: removed });
});

// Dev/test endpoint: synthesise a notification and push it via SSE
// the same way a real event would arrive. Admin-only because there's
// no reason a regular user should be able to make arbitrary toasts
// appear on their own session, and the script that drives this lives
// outside the app (scripts/test-notification.cjs). Accepts an
// optional `recipientEmail` so the admin can target other users.
app.post("/api/notifications/test", auth, adminOnly, (req, res) => {
  const {
    variant = "info",
    title = null,
    message = "",
    persistent = false,
    icon = null,
    recipientEmail = null,
  } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message required" });
  }
  if (!["info", "success", "warning", "error"].includes(variant)) {
    return res.status(400).json({ error: "invalid variant" });
  }

  let recipient = req.user;
  if (recipientEmail && typeof recipientEmail === "string") {
    const found = getUserByEmail.get(recipientEmail);
    if (!found) return res.status(404).json({ error: "recipient not found" });
    recipient = found;
  }

  const createdAt = nowISO();
  // Test notifications fully serialise variant/message/persistent/icon
  // so an offline recipient sees the exact same payload on next
  // login that they would have seen live over SSE.
  const result = insertNotification.run(
    recipient.id,
    req.user.id,
    "test",
    null,
    title || "",
    req.user.name || req.user.email || "test",
    variant,
    message,
    persistent ? 1 : 0,
    icon || null,
    createdAt,
  );

  // Mirror the SSE shape the live `note_shared` path uses so the
  // client renders this with the same code, with a distinct `type`
  // so the App-level handler routes it through a generic toast
  // instead of the share-specific deduper.
  sendEventToUser(recipient.id, {
    type: "test_notification",
    notificationId: result.lastInsertRowid,
    variant,
    title: title || null,
    message,
    persistent: !!persistent,
    icon: icon || null,
    createdAt,
  });

  res.json({
    ok: true,
    notificationId: result.lastInsertRowid,
    recipient: { id: recipient.id, email: recipient.email },
  });
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

// ---------- Reminders ----------
// Set, update, or clear a note's reminder. Body:
//   { reminderAt: ISO-8601 string | null, client_updated_at: ISO }
// Passing a date sets/updates the reminder and re-arms it (clears
// reminder_fired_at) so a previously-fired reminder moved to a future
// time fires again. Passing null clears the reminder entirely.
//
// Reminder columns are plain (never encrypted), so this dedicated route
// stays out of the sensitive-field write path (buildWriteRow / cipher).
// Owner OR collaborator may set it — a reminder is a property of the
// shared note, and when it fires every participant is notified.
const updateReminderStmt = db.prepare(`
  UPDATE notes SET
    reminder_at = @reminder_at,
    reminder_fired_at = NULL,
    client_updated_at = @client_updated_at
  WHERE id = @id AND (user_id = @user_id OR EXISTS(
    SELECT 1 FROM note_collaborators nc
    WHERE nc.note_id = @id AND nc.user_id = @user_id
  ))
`);
app.post("/api/notes/:id/reminder", auth, (req, res) => {
  const id = req.params.id;
  const { reminderAt } = req.body || {};
  if (!req.body?.client_updated_at) {
    return res.status(400).json({ error: "client_updated_at is required" });
  }
  const tsResult = validateLwwTimestamp(req.body.client_updated_at);
  if (tsResult.error) {
    return res.status(400).json({ error: tsResult.error });
  }

  // Normalise the reminder instant to ISO-8601 UTC. null/"" clears it.
  let reminderIso = null;
  if (reminderAt != null && reminderAt !== "") {
    const d = new Date(reminderAt);
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ error: "Invalid reminderAt" });
    }
    reminderIso = d.toISOString();
  }

  const existing = getNoteWithCollaboration.get(req.user.id, id, req.user.id);
  if (!existing) {
    return res.status(404).json({ error: "Note not found" });
  }

  // LWW: reject stale writes (compare milliseconds)
  if (!isNewerOrEqual(tsResult.ms, existing.client_updated_at)) {
    return res.json({ ok: true, stale: true, note: serializeNote(existing, req.user.id) });
  }

  const result = updateReminderStmt.run({
    reminder_at: reminderIso,
    client_updated_at: tsResult.iso,
    id,
    user_id: req.user.id,
  });
  if (result.changes === 0) {
    return res.status(404).json({ error: "Note not found or access denied" });
  }

  updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
  broadcastNoteUpdated(id);
  const fresh = getNoteById.get(id);
  res.json({ ok: true, note: serializeNote(fresh || existing, req.user.id) });
});

// Dev/test: SET a note's reminder programmatically — exactly what the UI
// "set reminder" action does (writes reminder_at, clears reminder_fired_at,
// bumps client_updated_at and broadcasts the note update so every device —
// including the Android app, which then re-arms its local alarm — picks it
// up). It's "as if you'd set it by hand", minus the typing and the wait.
//
//   - inSeconds <= 0 (default): the reminder is due NOW, and we run the real
//     scheduler sweep immediately so it fires through the normal pipeline in
//     ~1s instead of waiting up to REMINDER_SWEEP_MS. The atomic claim means
//     the next scheduled sweep won't double-fire it.
//   - inSeconds > 0: scheduled that far out and left to fire naturally on the
//     next sweep — handy for "set it, background the app, get the native
//     notification" tests.
//
// Admin-only, like /notifications/test; driven by scripts/test-reminder.cjs.
let reminderScheduler = null; // handle from startReminderScheduler (assigned below)
const setReminderForTest = db.prepare(
  `UPDATE notes SET reminder_at = @at, reminder_fired_at = NULL,
     client_updated_at = @cua WHERE id = @id`,
);
app.post("/api/notes/:id/test-reminder", auth, adminOnly, async (req, res) => {
  const id = String(req.params.id);
  const note = getNoteById.get(id);
  if (!note) return res.status(404).json({ error: "Note not found" });

  const inSeconds = Number(req.body?.inSeconds) || 0;
  const when = new Date(Date.now() + inSeconds * 1000);
  try {
    setReminderForTest.run({ at: when.toISOString(), cua: nowISO(), id });
    // Mirror the real reminder route: stamp the editor + fan out the note
    // update so open sessions (and the APK's alarm scheduler) re-sync.
    updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
    broadcastNoteUpdated(id);
    if (inSeconds <= 0 && reminderScheduler?.sweepNow) {
      await reminderScheduler.sweepNow();
    }
  } catch (e) {
    console.warn("[reminders] test set/fire failed:", e?.message);
    return res.status(500).json({ error: "test reminder failed" });
  }
  res.json({ ok: true, noteId: id, reminderAt: when.toISOString(), inSeconds, fired: inSeconds <= 0 });
});

// Upcoming (future, not-yet-fired) reminders for the signed-in user — owned
// or collaborated. The Android app's background sync (WorkManager) polls this
// while the app is closed to (re)arm its on-device local alarms, so a reminder
// created on another device still fires on the phone with the app shut — and
// without any push service (no Google/FCM dependency). Returns exactly the
// shape the native ReminderScheduler wants: { noteId, t (epoch ms), title, body }.
const selectUpcomingReminders = db.prepare(`
  SELECT id, reminder_at FROM notes
   WHERE reminder_at IS NOT NULL
     AND reminder_fired_at IS NULL
     AND reminder_at > @now
     AND (user_id = @uid OR EXISTS(
       SELECT 1 FROM note_collaborators nc
        WHERE nc.note_id = notes.id AND nc.user_id = @uid))
   ORDER BY reminder_at ASC
   LIMIT 200
`);
app.get("/api/reminders/upcoming", auth, (req, res) => {
  const now = new Date().toISOString();
  const lang = getUserLanguage(req.user.id);
  const title = serverT(lang, "reminderNotificationTitle");
  let rows;
  try {
    rows = selectUpcomingReminders.all({ now, uid: req.user.id });
  } catch (e) {
    console.warn("[reminders] upcoming query failed:", e?.message);
    return res.status(500).json({ error: "query failed" });
  }
  const reminders = [];
  for (const r of rows) {
    const ts = Date.parse(r.reminder_at);
    if (Number.isNaN(ts)) continue;
    const note = getNoteById.get(r.id);
    const body = (note && notePreviewText(note)) || serverT(lang, "reminderNotificationUntitled");
    reminders.push({ noteId: String(r.id), t: ts, title, body });
  }
  res.json({ reminders });
});

// ---------- Web Push subscriptions (PWA push notifications) ----------
// The public VAPID key is needed by the browser to subscribe. It is NOT
// a secret (it's the applicationServerKey). Returns { key: null } when
// push isn't configured so the client can hide the toggle gracefully.
app.get("/api/push/vapid-public-key", auth, (req, res) => {
  res.json({ key: pushService.getPublicKey() });
});

// Register (or refresh) this device's push subscription.
app.post("/api/push/subscribe", auth, (req, res) => {
  if (!pushService.isConfigured()) {
    return res.status(503).json({ error: "Push notifications are not configured on this server" });
  }
  const { subscription, lang } = req.body || {};
  try {
    pushService.saveSubscription(db, req.user.id, subscription, req.headers["user-agent"], lang);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e?.message || "Invalid subscription" });
  }
});

// Drop this device's push subscription (toggle off / sign-out).
app.post("/api/push/unsubscribe", auth, (req, res) => {
  const { endpoint } = req.body || {};
  pushService.removeSubscription(db, endpoint);
  res.json({ ok: true });
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
    // Collaborator "delete" — mirror the owner branch below: the user
    // gets a personal, trashed copy of the note in their own corbeille,
    // and the collaboration row is dropped so the live shared note is
    // no longer in their active view. Without the personal copy, the
    // note would just vanish without any restore path — which is what
    // the user reported as "supprimée définitivement" instead of
    // "envoyée à la corbeille".
    const userTagsJson = getUserTags(id, req.user.id);
    const trashedCopyId = uid();
    runInsertNote({
      id: trashedCopyId,
      user_id: req.user.id,
      type: collabNote.type,
      title: collabNote.title,
      content: collabNote.content,
      items_json: collabNote.items_json,
      tags_json: userTagsJson,
      images_json: collabNote.images_json,
      color: collabNote.color,
      pinned: 0,
      position: collabNote.position,
      timestamp: collabNote.timestamp,
      client_updated_at: tsResult.iso,
    });
    db.prepare("UPDATE notes SET trashed = 1 WHERE id = ?").run(trashedCopyId);
    db.prepare("DELETE FROM note_collaborators WHERE note_id = ? AND user_id = ?").run(id, req.user.id);
    db.prepare("DELETE FROM note_user_tags WHERE note_id = ? AND user_id = ?").run(id, req.user.id);
    db.prepare("DELETE FROM note_user_positions WHERE note_id = ? AND user_id = ?").run(id, req.user.id);
    broadcastNoteUpdated(id);
    // Notify the note owner that this collaborator walked away on
    // their own. Symmetric with the owner-removes-collaborator path
    // in DELETE /:id/collaborate/:userId — there the owner gets a
    // "you removed X" toast; here the owner gets a "X left" toast.
    try {
      const leftCreatedAt = nowISO();
      const ownerId = collabNote.user_id;
      if (ownerId && ownerId !== req.user.id) {
        const leftRow = insertNotification.run(
          ownerId,
          req.user.id,
          "collaborator_left",
          id,
          collabNote.title || "",
          req.user.name || req.user.email || "",
          null,
          null,
          0,
          null,
          leftCreatedAt,
        );
        sendEventToUser(ownerId, {
          type: "note_access_revoked_notification",
          notificationType: "collaborator_left",
          notificationId: leftRow.lastInsertRowid,
          senderName: req.user.name || req.user.email || "",
          noteId: id,
          noteTitle: collabNote.title || "",
          createdAt: leftCreatedAt,
        });
      }
    } catch (e) {
      console.warn("[notifications] collaborator_left notification failed:", e?.message);
    }
    const trashedCopy = getNoteById.get(trashedCopyId);
    return res.json({
      ok: true,
      left: true,
      trashedCopy: trashedCopy ? serializeNote(trashedCopy, req.user.id) : null,
    });
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
      // Push the revocation to a federation peer right away: the note is now
      // trashed, so its mirror must go. Every other deletion path calls this;
      // without it "delete for all" only reached the peer on the next sync
      // tick (~10s), lagging visibly behind "remove collaborator".
      broadcastNoteUpdated(id);
      // Collaborators lose access entirely — they must drop the note locally
      // without it landing in their trash view.
      const evt = { type: "note_deleted", noteId: id };
      for (const cid of collabIds) sendEventToUser(cid, evt);
      // ...and a persisted notice so each collaborator actually learns the
      // shared note was removed (the note_deleted event above is transient —
      // an offline collaborator would otherwise never find out).
      const ownerName = req.user.name || req.user.email || "";
      for (const cid of collabIds) {
        createSharedNoteDeletedNotification({
          recipientId: cid,
          senderId: req.user.id,
          senderName: ownerName,
          noteTitle: existing.title || "",
        });
      }
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
    // The note was handed over to this collaborator (they keep it / become its
    // owner). Persist a notice so they actually learn the owner deleted the
    // shared note and left them a copy — broadcastNoteUpdated above is
    // transient (an offline collaborator would otherwise never find out).
    createSharedNoteDeletedNotification({
      recipientId: newOwner.id,
      senderId: req.user.id,
      senderName: req.user.name || req.user.email || "",
      noteTitle: existing.title || "",
      noteId: id,
      notificationType: "shared_note_deleted_with_copy",
    });
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

  // Any collaborator still attached at permanent-delete time (rare — a
  // delete-for-all usually detaches them first) gets a persisted notice so
  // the removal survives offline rather than vanishing with a transient sync
  // event. Self-deletion of one's own (non-shared) note notifies nobody.
  const ownerName = req.user.name || req.user.email || "";
  for (const uid of recipientIds) {
    if (uid !== existing.user_id) {
      createSharedNoteDeletedNotification({
        recipientId: uid,
        senderId: req.user.id,
        senderName: ownerName,
        noteTitle: existing.title || "",
      });
    }
  }

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
    reminderAt: r.reminder_at || null,
    reminderFiredAt: r.reminder_fired_at || null,
    collaborators: getNoteParticipants(r.id, r.user_id, req.user.id),
    federation: noteFederationRef?.noteFederationInfo(r.id) || null,
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
        const importedType =
          n.type === "checklist" ? "checklist"
            : n.type === "draw" ? "draw"
              : n.type === "audio" ? "audio"
                : "text";
        if (importedType === "audio") {
          const audioErr = validateAudioContent(String(n.content || ""));
          if (audioErr) { skipped++; continue; }
        }
        runInsertNote({
          id,
          user_id: req.user.id,
          type: importedType,
          title: String(n.title || ""),
          content: importedType === "checklist" ? "" : String(n.content || ""),
          items_json: JSON.stringify(Array.isArray(n.items) ? n.items : []),
          tags_json: "[]",
          images_json: JSON.stringify(Array.isArray(n.images) ? n.images : []),
          color: typeof n.color === "string" ? n.color : "default",
          pinned: n.pinned ? 1 : 0,
          position: typeof n.position === "number" ? n.position : Date.now(),
          timestamp: n.timestamp || nowISO(),
          client_updated_at: (parseIsoTimestamp(n.client_updated_at || n.timestamp) || {}).iso || nowISO(),
        });
        if (importedTags !== "[]") runUpsertUserTags(id, req.user.id, importedTags);
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
  const settings = row ? JSON.parse(row.settings_json) : {};
  // Include language from the users table so the client can apply it at
  // boot without a separate profile fetch (cross-device language sync).
  const user = getUserById.get(req.user.id);
  if (user?.language) settings.language = user.language;
  res.json(settings);
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

  // Live-sync the change to every connected session of this user.
  // originClientId lets the originating tab/device ignore its own
  // echo so the apply-on-receive doesn't trigger another PATCH back.
  const originClientId =
    req.headers["x-client-id"] || req.headers["X-Client-Id"] || null;
  sendEventToUser(req.user.id, {
    type: "user_settings_updated",
    settings: incoming,
    originClientId,
  });

  res.json(merged);
});

// ---------- Logo Library (per-user, persistent) ----------
// Logos live independently from notes: a user can collect logos that
// don't appear on any note, and removing a logo from the library does
// NOT touch notes that already use it (those keep their own copy of
// the icon embedded in their images_json).
const listLogosStmt = db.prepare(
  `SELECT id, name, src, created_at FROM logos WHERE user_id = ? ORDER BY created_at ASC`
);
const insertLogoStmt = db.prepare(
  `INSERT INTO logos (id, user_id, name, src, created_at) VALUES (?, ?, ?, ?, ?)`
);
const deleteLogoStmt = db.prepare(
  `DELETE FROM logos WHERE id = ? AND user_id = ?`
);
const findLogoBySrcStmt = db.prepare(
  `SELECT id, name, src, created_at FROM logos WHERE user_id = ? AND src = ? LIMIT 1`
);

app.get("/api/logos", auth, (req, res) => {
  try {
    const rows = listLogosStmt.all(req.user.id);
    res.json(rows);
  } catch (e) {
    console.error("[logos] list failed", e);
    res.status(500).json({ error: "Failed to list logos" });
  }
});

app.post("/api/logos", auth, (req, res) => {
  const { id, name, src } = req.body || {};
  if (typeof src !== "string" || !src.startsWith("data:")) {
    return res.status(400).json({ error: "src must be a data URL" });
  }
  // Dedup by src — same image uploaded twice returns the existing entry.
  const existing = findLogoBySrcStmt.get(req.user.id, src);
  if (existing) return res.json(existing);
  const newId = (typeof id === "string" && id) || crypto.randomUUID();
  const createdAt = new Date().toISOString();
  try {
    insertLogoStmt.run(newId, req.user.id, String(name || "").slice(0, 200), src, createdAt);
    const logo = { id: newId, name: name || "", src, created_at: createdAt };
    sendEventToUser(req.user.id, { type: "logo_added", logo });
    res.json(logo);
  } catch (e) {
    console.error("[logos] insert failed", e);
    res.status(500).json({ error: "Failed to save logo" });
  }
});

app.delete("/api/logos/:id", auth, (req, res) => {
  try {
    const result = deleteLogoStmt.run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: "Logo not found" });
    sendEventToUser(req.user.id, { type: "logo_deleted", id: req.params.id });
    res.status(204).end();
  } catch (e) {
    console.error("[logos] delete failed", e);
    res.status(500).json({ error: "Failed to delete logo" });
  }
});

// ---------- Admin ----------
// adminOnly() lives near auth() (above) so unlock-routes can use it too.

// Admin settings — persisted in the `app_settings` singleton row. Kept
// mirrored in this in-memory object so the hot read paths (login slogan
// on every login page hit, allowNewAccounts on every signup attempt)
// don't hit SQLite repeatedly. The mirror is updated on every PATCH so
// it stays in sync.
const getAppSettingsRow = db.prepare(`SELECT allow_new_accounts, login_slogan, custom_app_name, login_bg_blur, login_theme FROM app_settings WHERE id = 1`);
const upsertAppSettings = db.prepare(
  `INSERT INTO app_settings (id, allow_new_accounts, login_slogan, custom_app_name, login_bg_blur, login_theme) VALUES (1, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET allow_new_accounts=excluded.allow_new_accounts, login_slogan=excluded.login_slogan, custom_app_name=excluded.custom_app_name, login_bg_blur=excluded.login_bg_blur, login_theme=excluded.login_theme`,
);
// Branding images live in their own read/write statements so the
// (potentially multi-MB) data URLs never get held in the in-memory
// mirror — which is broadcast to admins on every settings change.
const getBrandingImagesRow = db.prepare(`SELECT custom_logo, login_bg_image, login_bg_color, login_bg_hash, login_bg_version FROM app_settings WHERE id = 1`);
const setCustomLogoStmt = db.prepare(`UPDATE app_settings SET custom_logo = ? WHERE id = 1`);
const setLoginBgStmt = db.prepare(`UPDATE app_settings SET login_bg_image = ? WHERE id = 1`);
// The login-background placeholders (mean colour + BlurHash) and the
// cache-buster version are written together with the image: an explicit
// background change always refreshes all three (or clears them on remove).
const setLoginBgMetaStmt = db.prepare(`UPDATE app_settings SET login_bg_color = ?, login_bg_hash = ?, login_bg_version = ? WHERE id = 1`);
// Raw login-background bytes for GET /api/branding/login-bg.
const getLoginBgRow = db.prepare(`SELECT login_bg_image FROM app_settings WHERE id = 1`);
// Square PWA icon (PNG data URL) derived from the custom logo.
const getPwaIconRow = db.prepare(`SELECT custom_logo_pwa FROM app_settings WHERE id = 1`);
const setPwaIconStmt = db.prepare(`UPDATE app_settings SET custom_logo_pwa = ? WHERE id = 1`);

// Branding upload guards. Images are accepted as base64 data URLs (the
// same convention as user avatars) — the client rasterises + compresses
// before upload, so these caps are a server-side safety net rather than
// the primary limit. Only raster formats are allowed; SVG is rejected to
// avoid the script-injection surface that inline SVG carries.
const BRANDING_IMAGE_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+=*$/;
// Placeholder formats: a 6-digit hex colour and a BlurHash (base83, capped
// well above any 9×9-component hash). Both are tiny and client-supplied, so
// they're validated before storage and simply dropped if malformed.
const BRANDING_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const BRANDING_HASH_RE = /^[0-9A-Za-z#$%*+,\-.:;=?@[\]^_{|}~]{6,200}$/;
const VALID_LOGIN_THEMES = new Set(["glasskeep", "emerald", "amber", "rosewood", "graphite", "blush"]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // ~2 MB data URL (≈1.5 MB decoded)
const MAX_LOGIN_BG_BYTES = 4 * 1024 * 1024; // ~4 MB data URL (≈3 MB decoded)
const MAX_APP_NAME_LEN = 10;
const MAX_LOGIN_BLUR = 20; // px

let adminSettings = (function loadAdminSettings() {
  const row = getAppSettingsRow.get();
  if (row) {
    return {
      allowNewAccounts: !!row.allow_new_accounts,
      loginSlogan: row.login_slogan || "",
      appName: row.custom_app_name || "",
      loginBackgroundBlur: row.login_bg_blur || 0,
      loginTheme: VALID_LOGIN_THEMES.has(row.login_theme) ? row.login_theme : "glasskeep",
    };
  }
  // Fresh install — seed the row from the env var default so subsequent
  // boots read the same value the admin sees in the panel.
  const seed = {
    allowNewAccounts: process.env.ALLOW_REGISTRATION === "true",
    loginSlogan: "",
    appName: "",
    loginBackgroundBlur: 0,
    loginTheme: "glasskeep",
  };
  upsertAppSettings.run(seed.allowNewAccounts ? 1 : 0, seed.loginSlogan, seed.appName, seed.loginBackgroundBlur, seed.loginTheme);
  return seed;
})();

// Merge the scalar mirror with the on-disk image columns into the full
// settings shape returned to admins / the public branding endpoint.
function brandingSettingsPayload() {
  const images = getBrandingImagesRow.get() || {};
  return {
    ...adminSettings,
    logo: images.custom_logo || null,
    loginBackground: images.login_bg_image || null,
    loginBackgroundColor: images.login_bg_color || null,
    loginBackgroundHash: images.login_bg_hash || null,
  };
}

// Public, cacheable URL for the login background, or null when none is set.
// Versioned (?v=) so changing the background busts the browser HTTP cache
// even though the path is constant. `row` is a getBrandingImagesRow result.
function loginBgUrl(row) {
  if (!row || !row.login_bg_image) return null;
  const v = row.login_bg_version || "1";
  return `/api/branding/login-bg?v=${encodeURIComponent(v)}`;
}

// Get admin settings
app.get("/api/admin/settings", auth, adminOnly, (_req, res) => {
  res.json(brandingSettingsPayload());
});

// Update admin settings
app.patch("/api/admin/settings", auth, adminOnly, (req, res) => {
  const { allowNewAccounts, loginSlogan, appName, loginBackgroundBlur, loginTheme, logo, logoPwa, loginBackground, loginBackgroundColor, loginBackgroundHash } = req.body || {};

  if (typeof allowNewAccounts === 'boolean') {
    adminSettings.allowNewAccounts = allowNewAccounts;
  }
  if (typeof loginSlogan === 'string') {
    adminSettings.loginSlogan = loginSlogan.slice(0, 200);
  }
  if (typeof appName === 'string') {
    adminSettings.appName = appName.trim().slice(0, MAX_APP_NAME_LEN);
  }
  if (typeof loginBackgroundBlur === 'number' && Number.isFinite(loginBackgroundBlur)) {
    adminSettings.loginBackgroundBlur = Math.max(0, Math.min(MAX_LOGIN_BLUR, Math.round(loginBackgroundBlur)));
  }
  if (typeof loginTheme === 'string' && VALID_LOGIN_THEMES.has(loginTheme)) {
    adminSettings.loginTheme = loginTheme;
  }

  // Image fields use a tri-state contract: an explicit `null` clears the
  // stored image, a valid data URL replaces it, and `undefined` (the key
  // omitted) leaves the existing value untouched.
  if (logo === null) {
    setCustomLogoStmt.run(null);
    // Clearing the logo clears its derived PWA icon too.
    setPwaIconStmt.run(null);
  } else if (typeof logo === 'string' && logo) {
    if (!BRANDING_IMAGE_RE.test(logo)) {
      return res.status(400).json({ error: "Logo must be a PNG, JPEG or WebP image data URL." });
    }
    if (logo.length > MAX_LOGO_BYTES) {
      return res.status(413).json({ error: "Logo image is too large." });
    }
    setCustomLogoStmt.run(logo);
  }

  // Square PWA icon derived from the logo (client-generated PNG). Tied to
  // the logo: sent alongside it, cleared with it (handled above).
  if (typeof logoPwa === 'string' && logoPwa) {
    if (!BRANDING_IMAGE_RE.test(logoPwa)) {
      return res.status(400).json({ error: "PWA icon must be a PNG, JPEG or WebP image data URL." });
    }
    if (logoPwa.length > MAX_LOGO_BYTES) {
      return res.status(413).json({ error: "PWA icon image is too large." });
    }
    setPwaIconStmt.run(logoPwa);
  }

  if (loginBackground === null) {
    setLoginBgStmt.run(null);
    // Clearing the image clears its derived placeholders + version too.
    setLoginBgMetaStmt.run(null, null, null);
  } else if (typeof loginBackground === 'string' && loginBackground) {
    if (!BRANDING_IMAGE_RE.test(loginBackground)) {
      return res.status(400).json({ error: "Background must be a PNG, JPEG or WebP image data URL." });
    }
    if (loginBackground.length > MAX_LOGIN_BG_BYTES) {
      return res.status(413).json({ error: "Background image is too large." });
    }
    setLoginBgStmt.run(loginBackground);
    // Store the client-derived placeholders (best-effort: drop them if
    // malformed rather than failing the whole upload) and bump the
    // cache-buster so clients re-fetch the new image at /login-bg.
    const color = BRANDING_COLOR_RE.test(loginBackgroundColor || "") ? loginBackgroundColor : null;
    const hash = BRANDING_HASH_RE.test(loginBackgroundHash || "") ? loginBackgroundHash : null;
    setLoginBgMetaStmt.run(color, hash, Date.now().toString(36));
  }

  upsertAppSettings.run(
    adminSettings.allowNewAccounts ? 1 : 0,
    adminSettings.loginSlogan,
    adminSettings.appName,
    adminSettings.loginBackgroundBlur,
    adminSettings.loginTheme,
  );
  // Live-sync the scalar settings to every other admin so their
  // AdminPanel toggles / slogan / app name / blur reflect the change
  // without a reload. The image data URLs are deliberately NOT broadcast
  // (they can be megabytes) — admins re-pull them via GET /admin/settings
  // and the live app reads them from GET /api/branding.
  broadcastToAdmins({
    type: "admin_settings_updated",
    settings: { ...adminSettings },
  });
  res.json(brandingSettingsPayload());
});

// Public branding for the login page + app shell. Unauthenticated on
// purpose: the login screen needs it before any token exists. Returns
// empty/null when nothing is configured so the client falls back to the
// bundled defaults. Express adds a content-based ETag automatically, so
// repeat loads get a cheap 304 while the (possibly large) background
// data URL is unchanged.
app.get("/api/branding", (_req, res) => {
  const images = getBrandingImagesRow.get() || {};
  res.json({
    appName: adminSettings.appName || "",
    logo: images.custom_logo || null,
    // The (multi-MB) background is NOT inlined here anymore: clients load
    // it from the cacheable /login-bg endpoint instead, so this payload
    // stays small and the browser HTTP-caches the image across reloads.
    // The URL is versioned so a background change busts that cache. The
    // mean colour + BlurHash let the login page paint instantly.
    loginBackground: loginBgUrl(images),
    loginBackgroundColor: images.login_bg_color || null,
    loginBackgroundHash: images.login_bg_hash || null,
    loginBackgroundBlur: adminSettings.loginBackgroundBlur || 0,
    loginTheme: adminSettings.loginTheme || "glasskeep",
  });
});

// Custom PWA icon (square PNG) for the manifest. 404 when none is set so
// the manifest falls back to the bundled icons. Public — the OS fetches
// it when installing the PWA.
app.get("/api/branding/pwa-icon", (_req, res) => {
  const dataUrl = getPwaIconRow.get()?.custom_logo_pwa;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl || "");
  if (!m) return res.status(404).end();
  const buf = Buffer.from(m[1], "base64");
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-cache");
  res.end(buf);
});

// Login background as a real (cacheable) image, decoded from the stored
// data URL. 404 when none is set. Public — the login page fetches it before
// any token exists. The URL is versioned (?v=) by the caller, so a long
// immutable cache is safe: a new background gets a new URL.
app.get("/api/branding/login-bg", (req, res) => {
  const dataUrl = getLoginBgRow.get()?.login_bg_image;
  const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl || "");
  if (!m) return res.status(404).end();
  const buf = Buffer.from(m[2], "base64");
  res.setHeader("Content-Type", `image/${m[1] === "jpg" ? "jpeg" : m[1]}`);
  // Immutable only when a version was supplied (cache-bustable); otherwise
  // revalidate so an unversioned hit can't pin a stale image forever.
  res.setHeader("Cache-Control", req.query.v ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate");
  res.end(buf);
});

// Dynamic web-app manifest so an installed PWA picks up the instance's
// custom app name + logo. Registered before the static dist middleware so
// it shadows the build-time manifest.webmanifest. Note: a PWA already
// installed on a device won't refresh its name/icon until it's
// reinstalled — this affects new installs.
app.get("/manifest.webmanifest", (_req, res) => {
  const name = adminSettings.appName || "Glass Keep";
  const hasIcon = !!getPwaIconRow.get()?.custom_logo_pwa;
  const icons = hasIcon
    ? [
        { src: "/api/branding/pwa-icon", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/api/branding/pwa-icon", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/api/branding/pwa-icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]
    : [
        { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
        { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
        { src: "/pwa-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ];
  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "no-cache");
  res.json({
    name,
    short_name: name,
    description: "A lightweight notes app with Markdown, images, and offline support.",
    theme_color: "#f0e8ff",
    background_color: "#f0e8ff",
    display: "standalone",
    display_override: ["standalone"],
    scope: "/",
    start_url: "/",
    orientation: "portrait-primary",
    icons,
  });
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

// Wipe the pending_user_registered notification rows attached to this
// pending id and tell every recipient admin (live SSE) so their
// history panel drops the entry. Run on both approve AND reject so
// whichever admin acts first clears the action surfaces everywhere.
function cleanupPendingUserNotifications(pendingId) {
  try {
    // pendingId is stored in the `message` column (note_id is NULL
    // because of the FK to notes); stringify so the BLOB-affinity
    // match works the same way both at insert and at query.
    const key = String(pendingId);
    const rows = db.prepare(`
      SELECT id, recipient_user_id FROM notifications
      WHERE type = 'pending_user_registered' AND message = ?
    `).all(key);
    if (rows.length === 0) return;
    db.prepare(`
      DELETE FROM notifications
      WHERE type = 'pending_user_registered' AND message = ?
    `).run(key);
    const byRecipient = new Map();
    for (const r of rows) {
      if (!byRecipient.has(r.recipient_user_id))
        byRecipient.set(r.recipient_user_id, []);
      byRecipient.get(r.recipient_user_id).push(r.id);
    }
    for (const [uid, ids] of byRecipient) {
      sendEventToUser(uid, { type: "notification_removed", ids });
    }
  } catch (e) {
    console.warn("[notifications] pending_user cleanup failed:", e?.message);
  }
}

app.post("/api/admin/pending-users/:id/approve", auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const pending = getPendingById.get(id);
  if (!pending) return res.status(404).json({ error: "Pending registration not found." });

  // Guard against collision with a concurrently-created user
  if (getUserByEmail.get(pending.email)) {
    deletePendingById.run(id);
    cleanupPendingUserNotifications(id);
    return res.status(409).json({ error: "A user with this email already exists." });
  }

  // Move to users table, preserving the user-chosen password_hash (no forced change)
  const info = insertUser.run(pending.name, pending.email, pending.password_hash, nowISO());
  deletePendingById.run(id);
  cleanupPendingUserNotifications(id);

  // Check if this user should be auto-promoted to admin via env var
  try { promoteToAdminIfNeeded(pending.email); } catch {}

  const user = getUserById.get(info.lastInsertRowid);
  // Live-sync to every other admin session so their AdminPanel
  // pending / users lists refresh without waiting for a manual
  // reload. The acting admin's tab gets it too — its useEffect
  // dedup keeps it cheap, and there's no source-tab skip logic
  // needed because reload is idempotent.
  broadcastToAdmins({
    type: "pending_user_resolved",
    action: "approved",
    pendingId: id,
    newUserId: user.id,
  });
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
  cleanupPendingUserNotifications(id);
  broadcastToAdmins({
    type: "pending_user_resolved",
    action: "rejected",
    pendingId: id,
  });
  res.json({ ok: true });
});

// Search users endpoint for collaboration
const searchUsersStmt = db.prepare(`
  SELECT id, name, email, avatar_url
  FROM users
  WHERE (name LIKE ? OR email LIKE ?)
    AND federated_origin IS NULL
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

  // Notify every OTHER admin. The acting admin already sees the
  // operation succeed locally, so they get a plain success toast in
  // the panel instead — sending them the row too would feel like
  // self-reflection. Persisted + SSE'd so offline admins also see it
  // when they next reconnect.
  try {
    const otherAdmins = db
      .prepare("SELECT id FROM users WHERE is_admin = 1 AND id != ?")
      .all(req.user.id);
    if (otherAdmins.length > 0) {
      const createdAt = nowISO();
      const targetName = target.name || target.email || "";
      const adminName = req.user.name || req.user.email || "";
      for (const a of otherAdmins) {
        const row = insertNotification.run(
          a.id,
          req.user.id,
          "user_deleted",
          null,
          targetName,
          adminName,
          "warning",
          null,
          0,
          "user-x",
          createdAt,
        );
        sendEventToUser(a.id, {
          type: "user_deleted_notification",
          notificationId: row.lastInsertRowid,
          deletedName: targetName,
          adminName,
          createdAt,
        });
      }
    }
  } catch (e) {
    console.warn("[notifications] user_deleted notification failed:", e?.message);
  }

  res.json({
    ok: true,
    deletedUser: { id: target.id, name: target.name, email: target.email },
  });
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
  // Live-sync to every other admin so their users list shows the
  // new row without a manual reload.
  broadcastToAdmins({
    type: "user_list_changed",
    reason: "created",
    userId: user.id,
  });
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
  // Live-sync to every other admin so name / email / role / temp-
  // password-flag changes show up without a manual reload.
  broadcastToAdmins({
    type: "user_list_changed",
    reason: "updated",
    userId: updatedUser.id,
  });
  res.json({
    id: updatedUser.id,
    name: updatedUser.name,
    email: updatedUser.email,
    is_admin: !!updatedUser.is_admin,
    created_at: updatedUser.created_at,
  });
});


// Restart the running GlassKeep instance.
// - Native (systemd): `systemctl restart glass-keep`
// - Docker: POST /containers/<self>/restart on the mounted socket
// Responds immediately so the client receives the 200 before the process dies.
app.post("/api/admin/restart", auth, adminOnly, (_req, res) => {
  res.json({ ok: true });
  setTimeout(() => {
    restartSelf().catch((err) => console.error("restartSelf failed:", err?.message || err));
  }, 300);
});

// Shutdown the running GlassKeep instance.
// - Native (systemd): `systemctl stop glass-keep`
// - Docker: POST /containers/<self>/stop on the mounted socket. The
//   restart policy (`unless-stopped` in the documented compose) honours
//   the manual stop, so the container stays down.
// Responds immediately so the client receives the 200 before the process dies.
app.post("/api/admin/shutdown", auth, adminOnly, (_req, res) => {
  res.json({ ok: true });
  setTimeout(() => {
    shutdownSelf().catch((err) => console.error("shutdownSelf failed:", err?.message || err));
  }, 300);
});

// ---------- AI Assistant (OpenAI-compatible provider) ----------
// All AI endpoints (admin settings + user chat) live in server/ai/.
attachAiRoutes(app, { db, auth, adminOnly });

// ---------- Health ----------
app.get("/api/health", (_req, res) => res.json({
  ok: true,
  service: "glasskeep",
  env: NODE_ENV,
  startedAt: Math.round(Date.now() - process.uptime() * 1000),
}));

// ---------- Static (production) ----------
if (NODE_ENV === "production") {
  const dist = path.join(__dirname, "..", "dist");
  const INDEX_CACHE_CONTROL = "public, max-age=0, must-revalidate, stale-while-revalidate=86400, stale-if-error=604800";

  // The built index.html is read once and cached; per request we inject a
  // tiny global with the login background's placeholder (mean colour +
  // BlurHash + versioned image URL). This is what lets the login page paint
  // instantly on a cold/incognito load — no client cache or service worker
  // is involved, exactly like a server-rendered page. The payload is a few
  // bytes (NOT the multi-MB image), so it doesn't bloat the HTML or the PWA
  // precache. A service-worker-served (offline) index.html skips this and
  // falls back to the localStorage branding cache instead.
  let indexTemplate = null;
  function renderIndexHtml() {
    if (indexTemplate == null) {
      try { indexTemplate = fs.readFileSync(path.join(dist, "index.html"), "utf8"); }
      catch { indexTemplate = ""; }
    }
    const images = getBrandingImagesRow.get() || {};
    let inject = "";
    if (images.login_bg_image) {
      // base83 (hash) and hex (colour) can't contain "<" or "/", so the
      // JSON can't break out of the <script> — values are also validated
      // on write. The URL is a fixed path plus a base36 version token.
      const data = JSON.stringify({
        url: loginBgUrl(images),
        color: images.login_bg_color || null,
        hash: images.login_bg_hash || null,
      });
      inject = `<script>window.__GK_LOGIN_BG__=${data};</script>`;
    }
    return indexTemplate.replace("<head>", "<head>" + inject);
  }
  function sendIndex(res) {
    res.setHeader("Cache-Control", INDEX_CACHE_CONTROL);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderIndexHtml());
  }

  // index.html (root + explicit path) is always injected, never served raw.
  app.get(["/", "/index.html"], (_req, res) => sendIndex(res));

  // Hashed assets (JS/CSS bundles, images) — content-addressed so they can
  // be cached for a very long time. `index: false` so this never serves the
  // un-injected index.html for "/"; that's handled above + the SPA fallback.
  app.use(express.static(dist, {
    index: false,
    setHeaders(res, filePath) {
      if (/\.[0-9a-f]{8,}\.(js|css|woff2?|png|svg|ico|webp)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", INDEX_CACHE_CONTROL);
      }
    },
  }));

  app.get("*", (_req, res) => sendIndex(res));
}

// ---------- Reminders: scheduler + delivery ----------
// Per-recipient language for the localized reminder text. NULL ("auto")
// has no server-visible browser hint, so we fall back to English (the
// app's canonical fallback). Users who set their language explicitly in
// Settings get their reminder text in that language.
const getUserLanguageStmt = db.prepare("SELECT language FROM users WHERE id = ?");
const getLatestPushLangStmt = db.prepare(
  "SELECT lang FROM push_subscriptions WHERE user_id = ? AND lang IS NOT NULL ORDER BY id DESC LIMIT 1",
);
function getUserLanguage(userId) {
  try {
    // 1. Explicit profile language wins.
    const profileLang = getUserLanguageStmt.get(userId)?.language;
    if (profileLang === "fr" || profileLang === "en") return profileLang;
    // 2. "auto"-language users have no server-visible browser hint, so
    //    fall back to the locale reported by their most recent push
    //    subscription (the device's UI language).
    const subLang = getLatestPushLangStmt.get(userId)?.lang;
    if (subLang === "fr" || subLang === "en") return subLang;
  } catch {
    /* fall through to default */
  }
  return "en";
}

// Build a short, plain-text preview for a note that has no title, used as
// the reminder notification body. Defensive throughout: rich-text JSON,
// checklist items, draw-note text and legacy markdown are all reduced to
// a trimmed one-liner; anything unparseable just yields "".
function notePreviewText(note) {
  const title = (note.title || "").trim();
  if (title) return title.slice(0, 120);
  try {
    if (note.type === "checklist") {
      const items = JSON.parse(note.items_json || "[]");
      const texts = (Array.isArray(items) ? items : [])
        .map((i) => (i && typeof i.text === "string" ? i.text.trim() : ""))
        .filter(Boolean);
      if (texts.length) return texts.slice(0, 4).join(", ").slice(0, 120);
    }
  } catch {
    /* fall through */
  }
  let raw = note.content || "";
  if (note.type === "draw") {
    try {
      const p = typeof raw === "string" ? JSON.parse(raw) : raw;
      raw = (p && p.text) || "";
    } catch {
      raw = "";
    }
  }
  raw = String(raw);
  if (raw.trim().startsWith("{")) {
    // Rich-text (TipTap) JSON — walk the tree collecting text nodes.
    try {
      const json = JSON.parse(raw);
      const parts = [];
      const walk = (node) => {
        if (!node || typeof node !== "object") return;
        if (typeof node.text === "string") parts.push(node.text);
        if (Array.isArray(node.content)) node.content.forEach(walk);
      };
      walk(json);
      raw = parts.join(" ");
    } catch {
      /* leave raw as-is */
    }
  }
  // Strip light markdown punctuation and collapse whitespace.
  raw = raw.replace(/[#*_>`~]/g, " ").replace(/\s+/g, " ").trim();
  return raw.slice(0, 120);
}

// Deliver a due reminder: one in-app notification (persisted + live SSE)
// and one Web Push per recipient (owner + collaborators). Reuses the
// existing notification pipeline so the card, history and unread badge
// all work unchanged. Called by the scheduler once per reminder.
async function dispatchReminder(noteId) {
  const note = getNoteById.get(noteId);
  if (!note) {
    console.log(`[reminders] dispatch skipped — note ${noteId} not found (deleted?)`);
    return;
  }
  const recipientIds = new Set([
    note.user_id,
    ...getCollaboratorUserIdsForNote(noteId),
  ]);
  const createdAt = nowISO();
  const preview = notePreviewText(note);
  console.log(
    `[reminders] dispatching note ${noteId} to ${recipientIds.size} recipient(s); push=${pushService.isConfigured() ? "on" : "off"}`,
  );

  for (const uid of recipientIds) {
    const lang = getUserLanguage(uid);
    const title = serverT(lang, "reminderNotificationTitle");
    const message = preview || serverT(lang, "reminderNotificationUntitled");

    // Persist so the reminder survives the recipient being offline: the
    // /notifications/pending replay (generic branch) renders it from
    // note_title (→ card title) + message + variant + icon. persistent=1
    // so it stays until the user closes it (a reminder shouldn't auto-
    // dismiss the way a transient "saved" toast does).
    let notificationId = null;
    try {
      const r = insertNotification.run(
        uid,
        note.user_id,
        "reminder",
        noteId,
        title,
        "",
        "info",
        message,
        1,
        "reminder",
        createdAt,
      );
      notificationId = r.lastInsertRowid;
    } catch (e) {
      console.warn("[reminders] persist failed:", e?.message);
    }

    // Live in-app card for any currently-connected session. persistent so
    // it stays on screen (no timer bar) until manually dismissed.
    sendEventToUser(uid, {
      type: "reminder_due",
      notificationId,
      variant: "info",
      persistent: true,
      title,
      message,
      noteId,
      icon: "reminder",
      createdAt,
    });

    // System push for installed PWAs (fires even when the app is closed).
    // Best-effort: a push failure must never break the in-app reminder.
    pushService
      .sendToUser(
        db,
        uid,
        { title, body: message, noteId: String(noteId), tag: `reminder-${noteId}` },
        console,
      )
      .then((n) => {
        if (n > 0) console.log(`[reminders] push sent to user ${uid} (${n} device(s))`);
      })
      .catch((e) => console.warn("[reminders] push failed:", e?.message));
  }
}

// Resolve VAPID keys with auto-generation: env -> persisted file (next to
// the DB) -> freshly generated + persisted. Push thus works with no manual
// setup on a fresh install or after an upgrade; an explicit env pair wins.
pushService.init(console, { persistFile: path.join(path.dirname(dbFile), ".vapid.json") });
reminderScheduler = startReminderScheduler({
  db,
  dispatch: dispatchReminder,
  log: console,
  // Sweep cadence (ms). Default 30s; override with REMINDER_SWEEP_MS.
  intervalMs: Number(process.env.REMINDER_SWEEP_MS) || undefined,
});

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