#!/usr/bin/env node
// scripts/test-notification.cjs
//
// CLI helper for triggering an in-app notification on a running
// Glass Keep instance, end-to-end through the real SSE pipeline. Used
// to test the notification UI (variants, position, persistence,
// long-message wrapping, …) without needing to share a real note
// or trigger any other side effect.
//
// What it does:
//   1. Reads /opt/glass-keep/.env (or $GLASSKEEP_ENV) for JWT_SECRET,
//      DB_FILE and the API port.
//   2. Opens the SQLite DB directly to find an admin user to
//      authenticate as. Picks the first admin unless --as <email> is
//      provided.
//   3. Signs a short-lived JWT with the server's secret.
//   4. POSTs to /api/notifications/test on the running service.
//   5. The server persists the row and fans it out over SSE — any
//      browser currently logged in as the recipient sees the card.
//
// Usage:
//   node scripts/test-notification.cjs                       # interactive prompt
//   node scripts/test-notification.cjs --all                 # one of each variant
//   node scripts/test-notification.cjs info "hello world"
//   node scripts/test-notification.cjs error "boom" --persistent
//   node scripts/test-notification.cjs --variant warning --title "Heads up" --message "..."
//   node scripts/test-notification.cjs --to other@example.com info "for someone else"
//
// Flags:
//   --variant <v>      info | success | warning | error  (default: info)
//   --title <s>        optional title row
//   --message <s>      body text (required unless interactive)
//   --persistent       no auto-dismiss (stays until user closes)
//   --as <email>       authenticate as this admin (default: first admin in DB)
//   --to <email>       deliver to this user (default: the auth user)
//   --all              fire one notification per variant and exit
//   --port <n>         override discovered API port
//   --host <h>         override host (default 127.0.0.1)
//
// Notes:
//   The endpoint is admin-only — non-admin auth users are rejected.
//   Run as the user that can read the .env file (usually root or the
//   glass-keep service user, depending on your install).

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const readline = require("readline");

function parseArgs(argv) {
  const out = {
    variant: null,
    title: null,
    message: null,
    persistent: false,
    as: null,
    to: null,
    all: false,
    port: null,
    host: null,
    positional: [],
    help: false,
  };
  const av = argv.slice(2);
  for (let i = 0; i < av.length; i++) {
    const a = av[i];
    const next = () => av[++i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--variant") out.variant = next();
    else if (a === "--title") out.title = next();
    else if (a === "--message") out.message = next();
    else if (a === "--persistent") out.persistent = true;
    else if (a === "--as") out.as = next();
    else if (a === "--to") out.to = next();
    else if (a === "--all") out.all = true;
    else if (a === "--port") out.port = Number(next());
    else if (a === "--host") out.host = next();
    else if (!a.startsWith("--")) out.positional.push(a);
  }
  // Positional shorthand: `test-notification.cjs <variant> <message>`
  if (!out.variant && out.positional[0]) out.variant = out.positional[0];
  if (!out.message && out.positional[1]) out.message = out.positional[1];
  return out;
}

function usage() {
  console.log(
    [
      "Glass Keep — notification test CLI",
      "",
      "  test-notification.cjs                       Interactive prompt",
      "  test-notification.cjs --all                 One of each variant",
      "  test-notification.cjs info \"hello\"",
      "  test-notification.cjs error \"boom\" --persistent",
      "  test-notification.cjs --variant warning --title \"Heads up\" --message \"...\"",
      "  test-notification.cjs --to user@example.com info \"hi\"",
      "",
      "Flags: --variant --title --message --persistent --as --to --all --port --host",
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
    console.error("        Set it in the .env file or export it before running.");
    process.exit(1);
  }
  // DB discovery mirrors server/index.js: DB_FILE, then SQLITE_FILE,
  // then the default next to the server source.
  const serverDir = path.resolve(__dirname, "..", "server");
  const dbFile =
    merged.DB_FILE ||
    merged.SQLITE_FILE ||
    path.join(serverDir, "data.sqlite");
  return { host, port, httpsEnabled, jwtSecret, dbFile, envFile };
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
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

function pickAuthUser(db, args) {
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

async function sendOne(cfg, jwt, args, override) {
  const payload = {
    variant: override.variant || args.variant || "info",
    title: override.title ?? args.title,
    message: override.message || args.message,
    persistent: override.persistent ?? args.persistent ?? false,
  };
  if (args.to) payload.recipientEmail = args.to;
  const res = await requestJson({
    host: cfg.host,
    port: cfg.port,
    httpsEnabled: cfg.httpsEnabled,
    method: "POST",
    path: "/api/notifications/test",
    body: payload,
    token: jwt,
  });
  if (res.status !== 200) {
    console.error(
      `[error] ${res.status} ${res.body?.error || res.raw || "unknown"}`,
    );
    return false;
  }
  const where = res.body?.recipient?.email || "self";
  const persistFlag = payload.persistent ? " (persistent)" : "";
  console.log(
    `[ok] ${payload.variant.padEnd(8)} → ${where}${persistFlag}: ${payload.message}`,
  );
  return true;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    process.exit(0);
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
    console.error("        Set DB_FILE in the .env file or pass --as.");
    process.exit(1);
  }

  const db = new Database(cfg.dbFile, { readonly: true });
  const user = pickAuthUser(db, args);
  db.close();

  const token = jwt.sign(
    {
      uid: user.id,
      email: user.email,
      name: user.name,
      is_admin: !!user.is_admin,
    },
    cfg.jwtSecret,
    { expiresIn: "5m" },
  );

  // --all: fire a sample of each variant, mixing persistent and
  // auto-dismiss so the user can sanity-check all visual states in
  // one shot.
  if (args.all) {
    const samples = [
      { variant: "info", message: "Info — auto-dismiss in 10s" },
      { variant: "success", message: "Success — auto-dismiss in 5s" },
      { variant: "warning", message: "Warning — auto-dismiss in 5s" },
      { variant: "error", message: "Error — auto-dismiss in 5s" },
      {
        variant: "info",
        title: "Persistent info",
        message: "Stays until you click the X",
        persistent: true,
      },
    ];
    for (const s of samples) {
      await sendOne(cfg, token, args, s);
    }
    return;
  }

  // Interactive mode when no positional or --message was given.
  if (!args.message) {
    const v =
      args.variant ||
      (await ask("Variant (info/success/warning/error) [info]: ")) ||
      "info";
    args.variant = v.trim() || "info";
    args.title =
      args.title || (await ask("Title (empty for none): ")).trim() || null;
    args.message = (await ask("Message: ")).trim();
    if (!args.message) {
      console.error("[error] message is required");
      process.exit(1);
    }
    const p = (await ask("Persistent? [y/N]: ")).trim().toLowerCase();
    args.persistent = p === "y" || p === "yes";
  }

  await sendOne(cfg, token, args, {});
}

main().catch((e) => {
  console.error("[fatal]", e?.stack || e);
  process.exit(1);
});
