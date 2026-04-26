#!/usr/bin/env node
// scripts/unlock-instance.cjs
//
// CLI fallback for at-rest encryption unlock. Talks to the running
// glass-keep service over loopback so it never touches the database
// directly — all state changes go through the same code paths as the
// web unlock screen.
//
// Usage:
//   sudo -u glass-keep node scripts/unlock-instance.js
//   node scripts/unlock-instance.js --recovery
//
// The script reads /opt/glass-keep/.env (or the file pointed at by
// GLASSKEEP_ENV) to discover the listening port and HTTPS settings.

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const http = require("http");
const https = require("https");

function parseArgs(argv) {
  const out = { recovery: false, lock: false, status: false, port: null, host: null };
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
    "Reads /opt/glass-keep/.env (or $GLASSKEEP_ENV) for the listening port",
    "and HTTPS settings. The request is sent to 127.0.0.1 by default.",
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
  // Mirror the server's HTTPS check from server/index.js so the CLI
  // talks to the same protocol the service is listening on.
  const httpsEnabled =
    env.HTTPS_ENABLED !== "false"
    && env.SSL_CERT && env.SSL_KEY
    && fs.existsSync(env.SSL_CERT) && fs.existsSync(env.SSL_KEY);
  return { host, port, httpsEnabled, envFile };
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

function postJson({ host, port, httpsEnabled, path, body, token }) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const lib = httpsEnabled ? https : http;
    const req = lib.request({
      host,
      port,
      method: body ? "POST" : "GET",
      path,
      headers: {
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": data.length } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      // Self-signed certificates are common on self-hosted boxes; the
      // CLI runs on the same machine as the service so trusting any
      // cert here is no worse than trusting the loopback interface.
      rejectUnauthorized: false,
    }, (res) => {
      let buf = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { buf += c; });
      res.on("end", () => {
        let json = null;
        try { json = buf ? JSON.parse(buf) : null; } catch { /* not json */ }
        resolve({ status: res.statusCode, body: json, raw: buf });
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = loadConfig(args);
  const proto = cfg.httpsEnabled ? "https" : "http";
  const base = `${proto}://${cfg.host}:${cfg.port}`;

  // 1. Status check (always works, no secret needed).
  let status;
  try {
    const res = await postJson({ ...cfg, path: "/api/instance/status" });
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

  // 2. Prompt and submit.
  let res;
  if (args.recovery) {
    const key = await ask("Recovery key (GKRV-...): ", { hidden: true });
    if (!key) { console.error("Empty input."); process.exit(1); }
    res = await postJson({ ...cfg, path: "/api/instance/unlock-recovery", body: { recoveryKey: key } });
  } else {
    const passphrase = await ask("Instance passphrase: ", { hidden: true });
    if (!passphrase) { console.error("Empty input."); process.exit(1); }
    res = await postJson({ ...cfg, path: "/api/instance/unlock", body: { passphrase } });
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
