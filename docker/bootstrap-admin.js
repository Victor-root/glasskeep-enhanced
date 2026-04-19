// =============================================================================
//  GlassKeep — first-run admin bootstrap (Docker)
//  Creates the initial admin user from ADMIN_EMAIL + ADMIN_PASSWORD the very
//  first time the container starts against an empty database. No-op otherwise.
// =============================================================================
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const dbFile = process.env.DB_FILE;
const email = (process.env.ADMIN_EMAIL || "").trim();
const password = process.env.ADMIN_PASSWORD || "";
const name = (process.env.ADMIN_NAME || "Admin").trim();

if (!dbFile || !email || !password) process.exit(0);

fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const db = new Database(dbFile);

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
  )
`);

const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
if (userCount > 0) {
  console.log("[bootstrap] Users already present — skipping admin creation.");
  db.close();
  process.exit(0);
}

const hash = bcrypt.hashSync(password, 10);
const now = new Date().toISOString();
const info = db
  .prepare(
    "INSERT INTO users (name, email, password_hash, created_at, is_admin) VALUES (?, ?, ?, ?, 1)"
  )
  .run(name, email, hash, now);

console.log(`[bootstrap] Admin user created: ${email} (id=${info.lastInsertRowid})`);
db.close();
