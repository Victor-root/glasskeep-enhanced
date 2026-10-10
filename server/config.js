// server/config.js
//
// What the server reads from its environment before anything else: the
// port, the run mode, the JWT secret and where the database lives. The
// JWT secret is checked fail-closed: the process exits rather than start
// with a missing or well-known value.

const path = require("path");

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

// The SQLite database file.
const dbFile =
  process.env.DB_FILE ||
  process.env.SQLITE_FILE ||
  path.join(__dirname, "data.sqlite");

module.exports = { PORT, NODE_ENV, JWT_SECRET, dbFile };
