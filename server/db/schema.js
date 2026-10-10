// server/db/schema.js
//
// Opens the SQLite database, creates the tables a fresh install needs
// and runs the small migrations that bring an older database up to
// date. Every step is idempotent and runs on every boot, in this order.

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

function openDatabase(dbFile) {
  // Ensure the directory for the DB exists
  try {
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  } catch (e) {
    console.error("Failed to ensure DB directory:", e);
  }

  const db = new Database(dbFile);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  createTables(db);
  ensureColumns(db);
  ensureNoteColumns(db);
  ensureReminderIndex(db);
  ensurePushSubscriptionColumns(db);
  ensureCollaboratorColumns(db);
  ensureNotificationColumns(db);
  ensureAppSettingsColumns(db);
  migrateTagsToPerUser(db);
  return db;
}

// Fresh tables (safe if already exist)
function createTables(db) {
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
  can_write INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(added_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(note_id, user_id)
);

-- Persisted notifications for the recipient. Survives the user being
-- offline at the moment a notification is generated: the client
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

-- Per-user note icon (logo badge). The icon is PERSONAL to each user and
-- never synced to collaborators, so it lives here rather than in the shared
-- note's images_json. icon_json holds the JSON icon object ({id,src,name})
-- or '' for none; when at-rest encryption is active it is stored encrypted
-- (is_encrypted=1, enc_payload set, icon_json kept as '' as a placeholder),
-- exactly like note_user_tags.
CREATE TABLE IF NOT EXISTS note_user_icons (
  note_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  icon_json TEXT NOT NULL DEFAULT '',
  is_encrypted INTEGER NOT NULL DEFAULT 0,
  enc_payload TEXT,
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
}

// Tiny migrations (safe to run repeatedly)
function ensureColumns(db) {
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
      if (!names.has("token_version")) {
        // Bumped when the password changes, which is the moment every
        // other session has to stop. Tokens carry the value they were
        // minted with; a token holding an older one is refused. Starting
        // at 0 means tokens issued before this column existed, which
        // carry no version at all, keep working until the first password
        // change. Nobody is signed out by the upgrade itself.
        db.exec(`ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0`);
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
      // Master on/off for the custom app background: lets a user disable
      // it without losing the uploaded image(s). Defaults to 1 so existing
      // backgrounds keep showing after the migration.
      if (!names.has("app_bg_enabled")) {
        db.exec(`ALTER TABLE users ADD COLUMN app_bg_enabled INTEGER NOT NULL DEFAULT 1`);
      }
      if (!names.has("federated_origin")) {
        db.exec(`ALTER TABLE users ADD COLUMN federated_origin TEXT`);
      }
      // For federated shadow stand-ins that represent a participant on a
      // server THIS instance isn't directly linked to (e.g. a third server
      // in a multi-peer share), the home/authority server tells us the
      // friendly name of their origin server. We store it here so the badge
      // shows the right server instead of falling back to the hub's name.
      if (!names.has("federated_server_label")) {
        db.exec(`ALTER TABLE users ADD COLUMN federated_server_label TEXT`);
      }
    });
    tx();
  } catch {
    // ignore if ALTER not supported or already applied
  }
}

// Notes table migrations
function ensureNoteColumns(db) {
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
}

// Partial index so the reminder scheduler's "what's due now" sweep stays
// a cheap index scan even as the notes table grows: only rows that
// actually carry a pending reminder are indexed.
function ensureReminderIndex(db) {
  try {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_notes_pending_reminders
         ON notes(reminder_at)
         WHERE reminder_at IS NOT NULL AND reminder_fired_at IS NULL`,
    );
  } catch {
    // ignore if partial indexes unsupported (very old SQLite)
  }
}

// push_subscriptions migration: the `lang` column was added after the
// initial reminders release so the Web Push payload (title) can be
// localized per device: installs created before it need the ALTER.
function ensurePushSubscriptionColumns(db) {
  try {
    const cols = db.prepare(`PRAGMA table_info(push_subscriptions)`).all();
    if (!cols.some((c) => c.name === "lang")) {
      db.exec(`ALTER TABLE push_subscriptions ADD COLUMN lang TEXT`);
    }
  } catch {
    // table may not exist yet (fresh boot creates it with the column)
  }
}

// note_collaborators migration: the `can_write` column (1 = read-write,
// 0 = read-only) backs per-collaborator share permissions. Rows created
// before it default to 1 so every existing share keeps full write access.
function ensureCollaboratorColumns(db) {
  try {
    const cols = db.prepare(`PRAGMA table_info(note_collaborators)`).all();
    if (!cols.some((c) => c.name === "can_write")) {
      db.exec(`ALTER TABLE note_collaborators ADD COLUMN can_write INTEGER NOT NULL DEFAULT 1`);
    }
  } catch {
    // table may not exist yet (fresh boot creates it with the column)
  }
}

// Notifications-table migrations. The original schema only stored
// the bare share / revoke fields (sender_name, note_title) because
// the message text could be regenerated client-side from i18n. The
// new `variant`, `message` and `persistent` columns let arbitrary
// notification types (test-CLI dispatches, future generic events)
// survive a logout: the pending-fetch path replays them on next
// login with the original payload instead of dropping them.
function ensureNotificationColumns(db) {
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
    // ignore if the table doesn't exist yet (first boot: CREATE
    // TABLE above will produce the full schema) or ALTER unsupported.
  }
}

// app_settings-table migrations. The original schema only had
// allow_new_accounts + login_slogan; the custom-branding feature adds
// the optional login-page branding columns (custom app name, logo,
// background image, background blur). All default to empty/NULL so an
// instance that never configures branding behaves exactly as before.
function ensureAppSettingsColumns(db) {
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
      // The domain passkeys belong to, declared by an admin from the
      // panel so a reverse-proxied install does not need an env var.
      // Empty means "not declared"; see server/services/webauthnRp.js
      // for the order the server resolves it in.
      if (!names.has("webauthn_rp_id")) {
        db.exec(`ALTER TABLE app_settings ADD COLUMN webauthn_rp_id TEXT NOT NULL DEFAULT ''`);
      }
      // Whether users may sign in through an OpenID Connect provider.
      // Off until an admin allows it.
      if (!names.has("sso_allowed")) {
        db.exec(`ALTER TABLE app_settings ADD COLUMN sso_allowed INTEGER NOT NULL DEFAULT 0`);
      }
      // Which providers count: only the instance's ("admin"), or each
      // user's own as well ("personal"). An instance that already allowed
      // single sign-on did so with personal providers, and keeps them.
      if (!names.has("sso_policy")) {
        db.exec(`ALTER TABLE app_settings ADD COLUMN sso_policy TEXT NOT NULL DEFAULT 'admin'`);
        db.exec(`UPDATE app_settings SET sso_policy = 'personal' WHERE sso_allowed = 1`);
      }
      // Whether a user's own provider may sit on the local network.
      if (!names.has("sso_allow_private")) {
        db.exec(`ALTER TABLE app_settings ADD COLUMN sso_allow_private INTEGER NOT NULL DEFAULT 0`);
      }
    });
    tx();
  } catch {
    // ignore if the table doesn't exist yet (first boot: CREATE
    // TABLE above will produce the full schema) or ALTER unsupported.
  }
}

function migrateTagsToPerUser(db) {
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
}

module.exports = { openDatabase };
