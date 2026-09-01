#!/usr/bin/env node
// scripts/unlock-instance.cjs
//
// CLI fallback for at-rest encryption unlock. Talks to the running
// glass-keep service rather than touching the database directly, so
// every state change goes through the same code paths as the web
// unlock screen.
//
// Usage:
//   sudo -u glass-keep node scripts/unlock-instance.js
//   node scripts/unlock-instance.js --recovery
//
// The script reads /opt/glass-keep/.env (or the file pointed at by
// GLASSKEEP_ENV) to discover the listening port and HTTPS settings.
//
// The target defaults to loopback but --host can send it anywhere, so
// the certificate is verified for every destination that is not the
// machine itself. See scripts/lib/secureRequest.cjs for the rule and
// for the --ca / --insecure escape hatches.

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const {
  parseTlsArgs,
  usesHttps,
  requestJson,
  TLS_USAGE,
} = require("./lib/secureRequest.cjs");

function parseArgs(argv) {
  const out = {
    recovery: false, lock: false, status: false, port: null, host: null,
    ...parseTlsArgs(argv.slice(2)),
  };
  for (const a of argv.slice(2)) {
    if (a === "--recovery" || a === "-r") out.recovery = true;
    else if (a === "--lock") out.lock = true;
    else if (a === "--status" || a === "-s") out.status = true;
    else if (a.startsWith("--port=")) out.port = Number(a.slice(7));
    else if (a.startsWith("--host=")) out.host = a.slice(7);
    else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    }
  }
  return out;
}

function printUsage() {
  process.stdout.write([
    "Glass Keep — instance unlock CLI",
    "",
    "  unlock-instance.js              Unlock with the instance passphrase",
    "  unlock-instance.js --recovery   Unlock with the recovery key",
    "  unlock-instance.js --lock       Re-lock a running instance (admin token required)",
    "  unlock-instance.js --status     Print enabled/locked status and exit",
    "",
    "Options:",
    "  --host=<h>         target host (default 127.0.0.1)",
    "  --port=<n>         override the discovered API port",
    TLS_USAGE,
    "",
    "Reads /opt/glass-keep/.env (or $GLASSKEEP_ENV) for the listening port",
    "and HTTPS settings. The request is sent to 127.0.0.1 by default; the",
    "certificate is only left unverified when the target is the loopback",
    "interface, since the passphrase never leaves the machine there.",
    "",
  ].join("\n"));
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

function loadConfig(args) {
  const envFile = process.env.GLASSKEEP_ENV || "/opt/glass-keep/.env";
  const env = parseEnvFile(envFile);
  const port = args.port
    || Number(env.API_PORT || env.PORT)
    || 8080;
  const host = args.host || "127.0.0.1";
  // Mirrors the server's own HTTPS check, and describes THIS machine
  // only: usesHttps decides what that is worth for the target actually
  // being addressed.
  const localHttpsEnabled = Boolean(
    env.HTTPS_ENABLED !== "false"
    && env.SSL_CERT && env.SSL_KEY
    && fs.existsSync(env.SSL_CERT) && fs.existsSync(env.SSL_KEY),
  );
  return { host, port, httpsEnabled: usesHttps({ host, localHttpsEnabled }), envFile };
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hidden) {
      // Silence echo by intercepting writes. Not bulletproof against
      // the terminal driver but good enough to keep the secret off the
      // visible scrollback.
      const stdout = process.stdout;
      const orig = stdout.write.bind(stdout);
      stdout.write = (chunk, encoding, cb) => {
        if (typeof chunk === "string" && chunk.length > 0) {
          orig("", encoding, cb);
        } else {
          orig(chunk, encoding, cb);
        }
        return true;
      };
      orig(question);
      rl.question("", (answer) => {
        stdout.write = orig;
        process.stdout.write("\n");
        rl.close();
        resolve(answer);
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = loadConfig(args);
  const tls = { insecure: args.insecure, caFile: args.caFile };
  const postJson = (opts) => requestJson({ ...cfg, tls, ...opts });
  const proto = cfg.httpsEnabled ? "https" : "http";
  const base = `${proto}://${cfg.host}:${cfg.port}`;

  // 1. Status check (always works, no secret needed).
  let status;
  try {
    const res = await postJson({ path: "/api/instance/status" });
    if (res.status !== 200) throw new Error(`status returned ${res.status}: ${res.raw}`);
    status = res.body;
  } catch (e) {
    console.error(`[error] cannot reach Glass Keep at ${base}: ${e.message}`);
    console.error(`[hint] is the service running? systemctl status glass-keep`);
    process.exit(1);
  }

  if (args.status) {
    console.log(JSON.stringify(status, null, 2));
    process.exit(0);
  }

  if (!status.enabled) {
    console.log("At-rest encryption is not enabled. Nothing to unlock.");
    process.exit(0);
  }

  if (args.lock) {
    console.error("[hint] --lock is admin-only and must be triggered from the web UI for now.");
    process.exit(2);
  }

  if (status.unlocked) {
    console.log("Instance is already unlocked.");
    process.exit(0);
  }

  // 2. Prompt and submit. Nothing to check first any more: usesHttps
  // has already settled the transport, and a passphrase cannot leave
  // this machine unencrypted whatever the local service is configured
  // with.

  let res;
  if (args.recovery) {
    const key = await ask("Recovery key (GKRV-...): ", { hidden: true });
    if (!key) { console.error("Empty input."); process.exit(1); }
    res = await postJson({ path: "/api/instance/unlock-recovery", body: { recoveryKey: key } });
  } else {
    const passphrase = await ask("Instance passphrase: ", { hidden: true });
    if (!passphrase) { console.error("Empty input."); process.exit(1); }
    res = await postJson({ path: "/api/instance/unlock", body: { passphrase } });
  }

  if (res.status === 200 && res.body && res.body.ok) {
    console.log("Instance unlocked.");
    process.exit(0);
  }

  const msg = (res.body && res.body.error) || res.raw || `HTTP ${res.status}`;
  console.error(`[failed] ${msg}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(`[error] ${e.message}`);
  process.exit(1);
});
