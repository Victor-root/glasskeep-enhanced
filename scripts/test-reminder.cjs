#!/usr/bin/env node
// scripts/test-reminder.cjs
//
// Fire a note's reminder ON DEMAND — the instant-test counterpart to
// "set a reminder and wait for it". Runs the real dispatchReminder()
// pipeline on the server, so the recipient gets exactly what a genuine
// due reminder produces:
//   - the in-app reminder card over SSE (any logged-in session, incl.
//     the Android WebView app while it's open), with the "Open" action;
//   - a persisted notification (shows in history / unread badge);
//   - a Web Push for installed PWAs (if VAPID keys are configured).
//
// Sibling of scripts/test-notification.cjs and works the same way:
//   1. Reads /opt/glass-keep/.env (or $GLASSKEEP_ENV) for JWT_SECRET,
//      DB_FILE and the API port.
//   2. Opens the SQLite DB read-only to pick an admin to authenticate as
//      (the endpoint is admin-only). --as <email> overrides.
//   3. Signs a short-lived JWT with the server's secret.
//   4. POSTs to /api/notes/<noteId>/fire-reminder on the running service.
//
// NOTE: the reminder is delivered to the NOTE's recipients (its owner +
// any collaborators), not necessarily the admin you authenticate as.
//
// What it does NOT do: trigger the Android APK's *local* alarm. That
// notification is scheduled on the device by AlarmManager and only the
// device can raise it when the app is closed — there's no channel from
// the server to a closed WebView app. To test that native notification
// (and its tap-to-open) instantly, use scripts/test-reminder-native.sh
// (adb). This script covers the in-app + Web Push paths.
//
// Usage:
//   node scripts/test-reminder.cjs <noteId>
//   node scripts/test-reminder.cjs --note 1777374322541-t1vpuv
//   GLASSKEEP_TEST_NOTE_ID=1777374322541-t1vpuv node scripts/test-reminder.cjs
//   node scripts/test-reminder.cjs --as admin@example.com <noteId>
//
// Flags:
//   --note <id>   note id to fire (else first positional, else
//                 $GLASSKEEP_TEST_NOTE_ID)
//   --as <email>  authenticate as this admin (default: first admin in DB)
//   --port <n>    override discovered API port
//   --host <h>    override host (default 127.0.0.1)
//
// Run as a user that can read the .env file (usually root or the
// glass-keep service user).

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

function parseArgs(argv) {
  const out = { note: null, as: null, port: null, host: null, help: false, positional: [] };
  const av = argv.slice(2);
  for (let i = 0; i < av.length; i++) {
    const a = av[i];
    const next = () => av[++i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--note" || a === "--noteId") out.note = next();
    else if (a === "--as") out.as = next();
    else if (a === "--port") out.port = Number(next());
    else if (a === "--host") out.host = next();
    else if (!a.startsWith("--")) out.positional.push(a);
  }
  if (!out.note && out.positional[0]) out.note = out.positional[0];
  if (!out.note && process.env.GLASSKEEP_TEST_NOTE_ID) out.note = process.env.GLASSKEEP_TEST_NOTE_ID;
  return out;
}

function usage() {
  console.log(
    [
      "Glass Keep — fire a note reminder on demand",
      "",
      "  test-reminder.cjs <noteId>",
      "  test-reminder.cjs --note 1777374322541-t1vpuv",
      "  GLASSKEEP_TEST_NOTE_ID=<id> test-reminder.cjs",
      "  test-reminder.cjs --as admin@example.com <noteId>",
      "",
      "Flags: --note --as --port --host",
      "",
    ].join("\n"),
  );
}

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

function loadConfig(args) {
  const envFile = process.env.GLASSKEEP_ENV || "/opt/glass-keep/.env";
  const env = parseEnvFile(envFile);
  const merged = { ...env, ...process.env };
  const port = args.port || Number(merged.API_PORT || merged.PORT) || 8080;
  const host = args.host || "127.0.0.1";
  const httpsEnabled =
    merged.HTTPS_ENABLED !== "false" &&
    merged.SSL_CERT &&
    merged.SSL_KEY &&
    fs.existsSync(merged.SSL_CERT) &&
    fs.existsSync(merged.SSL_KEY);
  const jwtSecret = merged.JWT_SECRET;
  if (!jwtSecret) {
    console.error("[error] JWT_SECRET is not set (env or " + envFile + ").");
    process.exit(1);
  }
  const serverDir = path.resolve(__dirname, "..", "server");
  const dbFile =
    merged.DB_FILE || merged.SQLITE_FILE || path.join(serverDir, "data.sqlite");
  return { host, port, httpsEnabled, jwtSecret, dbFile, envFile };
}

function requestJson({ host, port, httpsEnabled, method, path: p, body, token }) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const lib = httpsEnabled ? https : http;
    const req = lib.request(
      {
        host,
        port,
        method,
        path: p,
        headers: {
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": data.length } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        rejectUnauthorized: false,
      },
      (res) => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { buf += c; });
        res.on("end", () => {
          let json = null;
          try { json = buf ? JSON.parse(buf) : null; } catch { /* not json */ }
          resolve({ status: res.statusCode, body: json, raw: buf });
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function pickAdmin(db, args) {
  if (args.as) {
    const row = db
      .prepare("SELECT id, email, name, is_admin FROM users WHERE lower(email) = lower(?)")
      .get(args.as);
    if (!row) {
      console.error(`[error] no user found with email ${args.as}`);
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

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    process.exit(0);
  }
  if (!args.note) {
    console.error("[error] note id required. Pass it as an argument, --note <id>, or $GLASSKEEP_TEST_NOTE_ID.\n");
    usage();
    process.exit(1);
  }

  const cfg = loadConfig(args);

  let Database;
  let jwt;
  try {
    Database = require("better-sqlite3");
    jwt = require("jsonwebtoken");
  } catch (e) {
    console.error("[error] missing native deps. Run from the project root:");
    console.error("        cd " + path.resolve(__dirname, "..") + " && npm install");
    process.exit(1);
  }

  if (!fs.existsSync(cfg.dbFile)) {
    console.error(`[error] database not found at ${cfg.dbFile}`);
    console.error("        Set DB_FILE in the .env file.");
    process.exit(1);
  }

  const db = new Database(cfg.dbFile, { readonly: true });
  const admin = pickAdmin(db, args);
  // Sanity-check the note exists and surface its owner so the operator
  // knows who will actually receive the card.
  const note = db
    .prepare("SELECT id, user_id FROM notes WHERE id = ?")
    .get(String(args.note));
  db.close();
  if (!note) {
    console.error(`[error] note ${args.note} not found in ${cfg.dbFile}`);
    process.exit(1);
  }

  const token = jwt.sign(
    { uid: admin.id, email: admin.email, name: admin.name, is_admin: !!admin.is_admin },
    cfg.jwtSecret,
    { expiresIn: "5m" },
  );

  const res = await requestJson({
    host: cfg.host,
    port: cfg.port,
    httpsEnabled: cfg.httpsEnabled,
    method: "POST",
    path: `/api/notes/${encodeURIComponent(String(args.note))}/fire-reminder`,
    body: {},
    token,
  });

  if (res.status !== 200) {
    console.error(`[error] ${res.status} ${res.body?.error || res.raw || "unknown"}`);
    process.exit(1);
  }
  console.log(`[ok] reminder fired for note ${args.note} → owner user #${note.user_id} (+ collaborators)`);
  console.log("     Open the app (or have it open) to see the card; tap \"Open\" to jump to the note.");
}

main().catch((e) => {
  console.error("[fatal]", e?.stack || e);
  process.exit(1);
});
