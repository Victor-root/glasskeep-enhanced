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
const {
  parseTlsArgs,
  requestJson,
  TLS_USAGE,
} = require("./lib/secureRequest.cjs");
const {
  loadTestScriptConfig,
  requireNativeDeps,
  findAdmin,
  signAdminToken,
} = require("./lib/instanceEnv.cjs");

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

  const cfg = loadTestScriptConfig(args);

  const { Database, jwt } = requireNativeDeps();

  if (!fs.existsSync(cfg.dbFile)) {
    console.error(`[error] database not found at ${cfg.dbFile}`);
    console.error("        Set DB_FILE in the .env file.");
    process.exit(1);
  }

  const db = new Database(cfg.dbFile, { readonly: true });
  const admin = findAdmin(db, args.as);
  const note = db
    .prepare("SELECT id, user_id FROM notes WHERE id = ?")
    .get(String(args.note));
  db.close();
  if (!note) {
    console.error(`[error] note ${args.note} not found in ${cfg.dbFile}`);
    process.exit(1);
  }

  const token = signAdminToken(jwt, admin, cfg.jwtSecret);

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
