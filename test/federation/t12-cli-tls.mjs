// Scénario 12, F-10. Le script de déverrouillage envoyait la phrase de
// passe sans vérifier le certificat.
//
// Le commentaire justifiait le choix par « l'outil tourne sur la même
// machine que le service ». C'est vrai du défaut et faux du reste:
// l'hôte est un paramètre, donc la même commande peut viser une machine
// à l'autre bout du monde, et la phrase de passe part alors sur une
// liaison chiffrée dont personne n'a vérifié qui se trouve en face.
// Chiffré pour personne en particulier.
//
// Le scénario ne se contente pas de lire la règle: il monte une vraie
// instance GlassKeep en TLS avec un certificat auto-signé, la joint
// d'abord par la boucle locale puis par une adresse d'interface qui
// n'est PAS la boucle locale, et lance le vrai script à chaque fois.
// C'est la seule façon de distinguer « la règle est écrite » de « la
// règle s'applique ».
import { spawn, execFileSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { runner, sleep } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT = path.join(HERE, "..", "..");
const FIXED = process.env.EXPECT === "fixed";
const t = runner(`Scénario 12, certificat vérifié par les scripts (attente: ${FIXED ? "corrigé" : "vulnérable"})`);

const PORT = Number(process.env.FEDLAB_CLI_PORT || 9470);

// Une adresse locale qui n'est pas la boucle locale. Sans elle on ne
// peut pas jouer le cas « machine distante », qui est tout le sujet.
function nonLoopbackAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return null;
}

const REMOTE = nonLoopbackAddress();
const dir = mkdtempSync(path.join(tmpdir(), "gk-cli-"));

// ── Un certificat auto-signé, valable pour les deux adresses ────────
const keyFile = path.join(dir, "server.key");
const certFile = path.join(dir, "server.crt");
const altNames = ["DNS:localhost", "IP:127.0.0.1", REMOTE ? `IP:${REMOTE}` : null]
  .filter(Boolean).join(",");
execFileSync("openssl", [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes",
  "-keyout", keyFile, "-out", certFile, "-days", "2",
  "-subj", "/CN=glasskeep-test",
  "-addext", `subjectAltName=${altNames}`,
], { stdio: "ignore" });

// Le fichier .env que les scripts lisent pour découvrir le port et TLS.
const envFile = path.join(dir, "glasskeep.env");
writeFileSync(envFile, [
  `API_PORT=${PORT}`,
  `SSL_CERT=${certFile}`,
  `SSL_KEY=${keyFile}`,
  "HTTPS_ENABLED=true",
].join("\n") + "\n");

const child = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
  env: {
    ...process.env,
    DB_FILE: path.join(dir, "data.sqlite"),
    JWT_SECRET: "0".repeat(64),
    API_PORT: String(PORT),
    NODE_ENV: "production",
    HTTPS_ENABLED: "true",
    SSL_CERT: certFile,
    SSL_KEY: keyFile,
    TRUST_PROXY: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (d) => { log += d; });
child.stderr.on("data", (d) => { log += d; });

async function up() {
  const https = await import("node:https");
  const ping = () => new Promise((resolve) => {
    const req = https.request(
      { host: "127.0.0.1", port: PORT, path: "/api/health", rejectUnauthorized: false },
      (res) => { res.resume(); resolve(res.statusCode === 200); },
    );
    req.on("error", () => resolve(false));
    req.end();
  });
  for (let i = 0; i < 40; i++) {
    if (await ping()) return true;
    await sleep(400);
  }
  return false;
}

// Lance le vrai script et rend ce qu'il a dit.
function runCli(args) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(ROOT, "scripts", "unlock-instance.cjs"), ...args], {
      env: { ...process.env, GLASSKEEP_ENV: envFile, NODE_EXTRA_CA_CERTS: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { out += d; });
    p.on("close", (code) => resolve({ code, out }));
  });
}

try {
  // ── A) La règle elle-même, adresse par adresse ─────────────────────
  // Le module qui porte la règle EST le correctif: sur le code
  // antérieur il n'existe pas, et c'est une observation en soi. La
  // partie B ci-dessous, elle, se joue dans les deux cas et c'est elle
  // qui départage.
  let rule = null;
  try {
    rule = require(path.join(ROOT, "scripts", "lib", "secureRequest.cjs"));
  } catch { /* pas encore là */ }
  t.check(FIXED ? "la règle de vérification du certificat existe"
                : "aucune règle de vérification n'existe, chaque script décide seul",
          FIXED ? !!rule : !rule);

  if (rule) {
  const { isLoopbackHost, tlsOptionsFor, assertSafeForSecrets } = rule;

  const loopback = ["127.0.0.1", "127.0.0.53", "localhost", "LOCALHOST", "::1", "[::1]"];
  const elsewhere = ["192.168.1.10", "10.0.0.1", "example.com", "0.0.0.0", "128.0.0.1", "", "1.2.3.4"];
  t.check("la boucle locale est reconnue sous toutes ses écritures",
          loopback.every(isLoopbackHost), loopback.join(" "));
  t.check("et rien d'autre ne passe pour elle",
          elsewhere.every((h) => !isLoopbackHost(h)), elsewhere.join(" "));

  t.check("en TLS vers la boucle locale, le certificat n'est pas exigé",
          tlsOptionsFor({ host: "127.0.0.1", httpsEnabled: true }).rejectUnauthorized === false);
  t.check("en TLS vers ailleurs, il l'est",
          tlsOptionsFor({ host: "notes.example.com", httpsEnabled: true }).rejectUnauthorized === true);
  t.check("--ca fournit une autorité sans désactiver la vérification", (() => {
    const o = tlsOptionsFor({ host: "notes.example.com", httpsEnabled: true, caFile: certFile });
    return o.rejectUnauthorized === true && !!o.ca;
  })());
  t.check("--ca sur un fichier absent échoue franchement", (() => {
    try {
      tlsOptionsFor({ host: "notes.example.com", httpsEnabled: true, caFile: "/inexistant.pem" });
      return false;
    } catch { return true; }
  })());

  t.check("un secret en clair vers la boucle locale reste permis", (() => {
    try { assertSafeForSecrets({ host: "127.0.0.1", httpsEnabled: false }); return true; }
    catch { return false; }
  })());
  t.check("un secret en clair vers ailleurs est refusé", (() => {
    try { assertSafeForSecrets({ host: "notes.example.com", httpsEnabled: false }); return false; }
    catch { return true; }
  })());
  }

  // ── B) Le script, en vrai, contre une instance en TLS auto-signé ───
  if (!await up()) throw new Error("l'instance n'a pas démarré: " + log.slice(-500));

  const local = await runCli(["--status", "--host=127.0.0.1"]);
  t.check("par la boucle locale, le script joint l'instance",
          local.code === 0 && /"enabled"/.test(local.out),
          `code ${local.code} ${local.out.trim().slice(0, 80)}`);

  if (!REMOTE) {
    t.check("une adresse non locale est disponible pour le test distant", false,
            "aucune interface non locale, cas distant non joué");
  } else {
    const remote = await runCli(["--status", `--host=${REMOTE}`]);
    t.check(FIXED ? "par une adresse distante, le certificat auto-signé est refusé"
                  : "par une adresse distante, le certificat auto-signé passe quand même",
            FIXED ? remote.code !== 0 && /certificate|certificat/i.test(remote.out)
                  : remote.code === 0 && /"enabled"/.test(remote.out),
            `code ${remote.code} ${remote.out.trim().slice(0, 120)}`);

    t.check(FIXED ? "et le refus explique quoi faire" : "aucune explication n'est donnée",
            FIXED ? /--ca=/.test(remote.out) : true,
            remote.out.trim().slice(0, 100));

    const withCa = await runCli(["--status", `--host=${REMOTE}`, `--ca=${certFile}`]);
    t.check("avec --ca, la même adresse distante fonctionne",
            withCa.code === 0 && /"enabled"/.test(withCa.out),
            `code ${withCa.code} ${withCa.out.trim().slice(0, 80)}`);

    const insecure = await runCli(["--status", `--host=${REMOTE}`, "--insecure"]);
    t.check("avec --insecure, elle fonctionne aussi",
            insecure.code === 0 && /"enabled"/.test(insecure.out),
            `code ${insecure.code}`);
    t.check(FIXED ? "mais --insecure le dit sur la sortie d'erreur" : "rien n'est signalé",
            FIXED ? /warning/i.test(insecure.out) : true,
            insecure.out.trim().slice(0, 100));
  }
} finally {
  child.kill();
  await sleep(600);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* peu importe */ }
}

process.exit(t.summary() ? 0 : 1);
