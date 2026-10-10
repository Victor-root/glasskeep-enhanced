// scripts/lib/instanceEnv.cjs
//
// What the maintenance scripts read from the Glass Keep install they
// run next to: its .env file, whether the service on this machine
// speaks HTTPS, and the admin account the test scripts act as.

const fs = require("fs");
const path = require("path");

// The .env written by install.sh, or the one $GLASSKEEP_ENV points at.
function envFilePath() {
  return process.env.GLASSKEEP_ENV || "/opt/glass-keep/.env";
}

// Minimal .env parser: KEY=VALUE per line, no quoting tricks. Good
// enough for a Glass Keep install where install.sh emits the file.
function parseEnvFile(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  const txt = fs.readFileSync(p, "utf8");
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

// Mirrors the server's own HTTPS check, and describes THIS machine
// only: usesHttps (secureRequest.cjs) decides what that is worth for
// the target actually being addressed.
function isLocalHttpsEnabled(env) {
  return Boolean(
    env.HTTPS_ENABLED !== "false" &&
    env.SSL_CERT &&
    env.SSL_KEY &&
    fs.existsSync(env.SSL_CERT) &&
    fs.existsSync(env.SSL_KEY),
  );
}

// The native modules the test scripts need, or an exit telling the
// operator how to get them.
function requireNativeDeps() {
  try {
    return { Database: require("better-sqlite3"), jwt: require("jsonwebtoken") };
  } catch {
    console.error("[error] missing native deps. Run from the project root:");
    console.error("        cd " + path.resolve(__dirname, "..", "..") + " && npm install");
    process.exit(1);
  }
}

// The admin the test scripts authenticate as: the one --as names, or
// the first admin in the database. The endpoints they call are
// admin-only.
function findAdmin(db, email) {
  if (email) {
    const row = db
      .prepare("SELECT id, email, name, is_admin FROM users WHERE lower(email) = lower(?)")
      .get(email);
    if (!row) {
      console.error(`[error] no user found with email ${email}`);
      process.exit(1);
    }
    if (!row.is_admin) {
      console.error(`[error] user ${row.email} is not admin (endpoint requires admin)`);
      process.exit(1);
    }
    return row;
  }
  const admin = db
    .prepare("SELECT id, email, name, is_admin FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1")
    .get();
  if (!admin) {
    console.error("[error] no admin user found in the database");
    console.error("        Create an admin first or pass --as <admin-email>");
    process.exit(1);
  }
  return admin;
}

// A short-lived token for that admin, signed with the server's secret.
function signAdminToken(jwt, user, secret) {
  return jwt.sign(
    { uid: user.id, email: user.email, name: user.name, is_admin: !!user.is_admin },
    secret,
    { expiresIn: "5m" },
  );
}

module.exports = {
  envFilePath,
  parseEnvFile,
  isLocalHttpsEnabled,
  requireNativeDeps,
  findAdmin,
  signAdminToken,
};
