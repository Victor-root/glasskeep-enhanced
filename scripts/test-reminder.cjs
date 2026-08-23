#!/usr/bin/env node
// scripts/test-reminder.cjs
//
// Set a note's reminder FOR YOU, exactly as if you'd set it by hand in the
// UI — no typing, no waiting. By default it sets the reminder to *now*, so
// the real pipeline fires it within ~1s:
//   - the in-app reminder card over SSE (any logged-in session, incl. the
//     Android app while it's OPEN), with the "Open" action;
//   - a persisted notification (history / unread badge);
//   - a Web Push for installed PWAs (if VAPID keys are configured);
//   - on the Android app, the note update also re-arms the on-device local
//     alarm (so --in <sec> + backgrounding the app reproduces the native
//     "app closed" notification without the manual setup).
//
// It writes reminder_at / clears reminder_fired_at / bumps client_updated_at
// and broadcasts the note update — the exact same state change the UI makes.
//
// Sibling of scripts/test-notification.cjs; works the same way:
//   1. Reads /opt/glass-keep/.env (or $GLASSKEEP_ENV) for JWT_SECRET,
//      DB_FILE and the API port.
//   2. Opens the SQLite DB read-only to pick an admin to authenticate as
//      (the endpoint is admin-only). --as <email> overrides.
//   3. Signs a short-lived JWT and POSTs to
//      /api/notes/<noteId>/test-reminder.
//
// Usage:
//   node scripts/test-reminder.cjs <noteId>            # due now, fires now
//   node scripts/test-reminder.cjs <noteId> --in 20    # due in 20s
//   GLASSKEEP_TEST_NOTE_ID=<id> node scripts/test-reminder.cjs
//
// Flags:
//   --in <seconds>  schedule the reminder this many seconds out (default 0 =
//                   now, fired immediately). Use e.g. --in 20 then background
//                   the Android app to test the native "app closed" notif.
//   --note <id>     note id (else first positional, else $GLASSKEEP_TEST_NOTE_ID)
//   --as <email>    authenticate as this admin (default: first admin in DB)
//   --port <n>      override discovered API port
//   --host <h>      override host (default 127.0.0.1)
//
// Run as a user that can read the .env file (usually root or the
// glass-keep service user).

const fs = require("fs");
const path = require("path");
const {
  parseTlsArgs,
  requestJson,
  TLS_USAGE,
} = require("./lib/secureRequest.cjs");

function parseArgs(argv) {
  const out = {
    note: null, in: 0, as: null, port: null, host: null, help: false, positional: [],
    ...parseTlsArgs(argv.slice(2)),
  };
  const av = argv.slice(2);
  for (let i = 0; i < av.length; i++) {
    const a = av[i];
    const next = () => av[++i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--in" || a === "--in-seconds") out.in = Number(next()) || 0;
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
      "Glass Keep — set a note reminder on demand (as if done by hand)",
      "",
      "  test-reminder.cjs <noteId>            due now, fires within ~1s",
      "  test-reminder.cjs <noteId> --in 20    due in 20 seconds",
      "  GLASSKEEP_TEST_NOTE_ID=<id> test-reminder.cjs",
      "",
      "Flags: --in <seconds> --note --as --port --host",
      TLS_USAGE,
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
    path: `/api/notes/${encodeURIComponent(String(args.note))}/test-reminder`,
    body: { inSeconds: args.in },
    token,
    tls: { insecure: args.insecure, caFile: args.caFile },
  });

  if (res.status !== 200) {
    console.error(`[error] ${res.status} ${res.body?.error || res.raw || "unknown"}`);
    process.exit(1);
  }

  if (args.in > 0) {
    console.log(`[ok] reminder set on note ${args.note} for +${args.in}s (${res.body?.reminderAt}).`);
    console.log(`     It'll fire on the next sweep. For the NATIVE app-closed notif:`);
    console.log(`     keep the app open now, then press home before it's due.`);
  } else {
    console.log(`[ok] reminder set on note ${args.note} for NOW and fired through the real pipeline.`);
    console.log(`     Have the app open to see the card; tap "Open" to jump to the note.`);
  }
}

main().catch((e) => {
  console.error("[fatal]", e?.stack || e);
  process.exit(1);
});
