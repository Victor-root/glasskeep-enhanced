// server/db/dbSafety.js
//
// Keeps the database safe across version changes, beta channel included.
//
// Format level. A release declares in package.json (glasskeep.dbCompat)
// the format level of what it writes. The level only goes up when a
// change makes the data unreadable for an older release (a format
// converted in place, data moved elsewhere); additions never raise it.
// The database records the highest level that ever opened it, in
// SQLite's PRAGMA user_version, and a release finding a level above its
// own refuses to start instead of misreading or damaging the data.
//
// Backups. Whenever a different build opens the database, a copy is
// taken first, before any migration: backups/auto-<date>-<build>.db,
// the last KEEP_AUTO_BACKUPS kept. Entering the beta channel also takes
// backups/before-beta.db, kept until the next entry. Leaving the beta
// for a stable release that cannot read the beta's data may restore it:
// the request is written beside the backups and carried out by that
// release on start, before it opens the database.
//
// Copies are made with VACUUM INTO: a consistent snapshot, WAL included,
// taken safely while the database is in use.

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const KEEP_AUTO_BACKUPS = 5;
const PRE_BETA_FILE = "before-beta.db";
const PRE_BETA_META = "before-beta.json";
const RESTORE_REQUEST = ".restore-request.json";
const AUTO_BACKUP_RE = /^auto-.+\.db$/;

class DatabaseTooNewError extends Error {
  constructor(level, supported, dir) {
    super(
      `This database was last opened by a newer GlassKeep (data format ${level}; ` +
      `this version reads up to ${supported}). Reinstall that newer version, or restore ` +
      `a backup from ${dir} (before-beta.db is the one taken when the beta was entered).`,
    );
    this.name = "DatabaseTooNewError";
  }
}

function backupsDir(dbFile) {
  return path.join(path.dirname(dbFile), "backups");
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function fileSafe(label) {
  return String(label || "unknown").replace(/[^0-9A-Za-z.+-]/g, "_");
}

// A consistent copy of the open database at `dest`, written aside and
// renamed into place so a half-written file never carries the real name.
function snapshot(db, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp`;
  fs.rmSync(tmp, { force: true });
  db.prepare("VACUUM INTO ?").run(tmp);
  fs.renameSync(tmp, dest);
}

function rotateAutoBackups(dir, keep = KEEP_AUTO_BACKUPS) {
  const names = fs.readdirSync(dir).filter((n) => AUTO_BACKUP_RE.test(n)).sort();
  for (const name of names.slice(0, Math.max(0, names.length - keep))) {
    fs.rmSync(path.join(dir, name), { force: true });
  }
}

function autoBackup(db, dbFile, reason, log) {
  const dir = backupsDir(dbFile);
  const dest = path.join(dir, `auto-${stamp()}-${fileSafe(reason)}.db`);
  snapshot(db, dest);
  rotateAutoBackups(dir);
  log.log?.(`[db] backup taken: ${dest}`);
  return dest;
}

function hasData(db) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
}

function readMeta(db, key) {
  return db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key)?.value ?? null;
}

function writeMeta(db, key, value) {
  db.prepare(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

// Before any migration: refuse a database written in a newer format, and
// back it up when a different build than last time is opening it.
function guardDatabase(db, dbFile, build, log = console) {
  const level = db.pragma("user_version", { simple: true });
  if (level > build.dbCompat) throw new DatabaseTooNewError(level, build.dbCompat, backupsDir(dbFile));
  db.exec("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)");
  const lastBuild = readMeta(db, "last_build");
  if (lastBuild === build.label || !hasData(db)) return;
  try {
    autoBackup(db, dbFile, `from-${lastBuild || "unknown"}`, log);
  } catch (e) {
    // A full disk must not keep the notes offline: carry on, loudly.
    log.error?.(`[db] backup before opening with ${build.label} failed: ${e.message}`);
  }
}

// After the migrations: what this build wrote, for the next start.
function markDatabase(db, build) {
  const level = db.pragma("user_version", { simple: true });
  if (level < build.dbCompat) db.pragma(`user_version = ${build.dbCompat}`);
  writeMeta(db, "last_build", build.label);
}

function dbLevel(db) {
  return db.pragma("user_version", { simple: true });
}

// ── Before the beta ─────────────────────────────────────────────────────────
function takePreBetaBackup(db, dbFile, build) {
  const dir = backupsDir(dbFile);
  snapshot(db, path.join(dir, PRE_BETA_FILE));
  const meta = { version: build.version, label: build.label, createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, PRE_BETA_META), JSON.stringify(meta));
  return meta;
}

function readPreBetaBackup(dbFile) {
  const dir = backupsDir(dbFile);
  if (!fs.existsSync(path.join(dir, PRE_BETA_FILE))) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, PRE_BETA_META), "utf8"));
  } catch {
    return null;
  }
}

// ── Restoring it ────────────────────────────────────────────────────────────
// Asks `forVersion`, once installed, to restore the pre-beta backup on start.
function requestRestore(dbFile, forVersion) {
  const request = { backup: PRE_BETA_FILE, forVersion, requestedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(backupsDir(dbFile), RESTORE_REQUEST), JSON.stringify(request));
}

function cancelRestore(dbFile) {
  fs.rmSync(path.join(backupsDir(dbFile), RESTORE_REQUEST), { force: true });
}

// On start, before the database is opened. A request meant for another
// version means the update that should have installed it did not land:
// it is dropped rather than carried out by the wrong release. The data
// being replaced is backed up first, so even this step loses nothing.
function applyPendingRestore(dbFile, build, log = console) {
  const dir = backupsDir(dbFile);
  const requestFile = path.join(dir, RESTORE_REQUEST);
  let request;
  try {
    request = JSON.parse(fs.readFileSync(requestFile, "utf8"));
  } catch {
    return false;
  }
  fs.rmSync(requestFile, { force: true });
  if (request?.forVersion !== build.version || request.backup !== PRE_BETA_FILE) {
    log.warn?.(`[db] restore request for ${request?.forVersion} dropped: ${build.version} is running`);
    return false;
  }
  const source = path.join(dir, PRE_BETA_FILE);
  if (!fs.existsSync(source)) {
    log.error?.(`[db] restore requested but ${source} is missing`);
    return false;
  }
  if (fs.existsSync(dbFile)) {
    const current = new Database(dbFile);
    try {
      autoBackup(current, dbFile, "before-restore", log);
    } catch (e) {
      log.error?.(`[db] restore cancelled, the current data could not be backed up first: ${e.message}`);
      return false;
    } finally {
      current.close();
    }
  }
  const tmp = `${dbFile}.restore-tmp`;
  fs.copyFileSync(source, tmp);
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(dbFile + suffix, { force: true });
  fs.renameSync(tmp, dbFile);
  fs.rmSync(source, { force: true });
  fs.rmSync(path.join(dir, PRE_BETA_META), { force: true });
  log.log?.(`[db] database restored from the backup taken before the beta`);
  return true;
}

module.exports = {
  KEEP_AUTO_BACKUPS,
  DatabaseTooNewError,
  backupsDir,
  guardDatabase,
  markDatabase,
  dbLevel,
  takePreBetaBackup,
  readPreBetaBackup,
  requestRestore,
  cancelRestore,
  applyPendingRestore,
};
