// Scénario 8 — F-04. Le refus d'accepter la phrase de passe en clair doit
// réellement s'appliquer.
//
// Le serveur refuse, à raison, de recevoir la phrase de déchiffrement sur une
// liaison non chiffrée. Ce refus se désactivait dès que HTTPS_ENABLED valait
// "false", ce que l'image Docker pose d'elle-même: un opérateur qui publiait
// simplement le port, sans rien devant, avait le garde-fou éteint sans
// l'avoir demandé.
//
// Ce scénario démarre sa PROPRE instance, en clair et dans plusieurs
// configurations, parce que le bac à sable commun tourne en TLS et ne peut
// donc pas exercer le refus.
//
// La boucle locale reste exemptée par conception (l'outil en ligne de commande
// passe par là), donc les appels de test annoncent une autre adresse via un
// en-tête, avec un TRUST_PROXY qui rend cet en-tête crédible. C'est la seule
// façon, sur une seule machine, de se présenter comme un client distant.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { runner, sleep } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT = path.join(HERE, "..", "..");
const FIXED = process.env.EXPECT === "fixed";
const t = runner(`Scénario 8, refus du HTTP en clair (attente: ${FIXED ? "corrigé" : "vulnérable"})`);

const PORT = Number(process.env.FEDLAB_PLAIN_PORT || 9455);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSPHRASE = "phrase-de-passe-de-test-longue";

function boot(env) {
  const dir = mkdtempSync(path.join(tmpdir(), "gk-plain-"));
  const child = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
    env: {
      ...process.env,
      DB_FILE: path.join(dir, "data.sqlite"),
      JWT_SECRET: "0".repeat(64),
      API_PORT: String(PORT),
      NODE_ENV: "production",
      HTTPS_ENABLED: "false",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => { log += d; });
  child.stderr.on("data", (d) => { log += d; });
  return { child, dir, log: () => log };
}

async function waitUp() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(BASE + "/api/health");
      if (r.ok) return true;
    } catch { /* pas encore prêt */ }
    await sleep(400);
  }
  return false;
}

// Le contrôle de transport n'est évalué qu'une fois le chiffrement au repos
// activé: la route répond 409 « pas activé » avant d'y arriver. Il faut donc
// un administrateur, une activation, puis un verrouillage.
async function armVault(dir) {
  const Database = require(path.join(ROOT, "node_modules", "better-sqlite3"));
  const bcrypt = require(path.join(ROOT, "node_modules", "bcryptjs"));
  const db = new Database(path.join(dir, "data.sqlite"));
  db.prepare("INSERT INTO users (name,email,password_hash,created_at,is_admin) VALUES (?,?,?,?,1)")
    .run("Admin", "admin@plain.test", bcrypt.hashSync("Passw0rd-plain", 10), new Date().toISOString());
  db.close();
  const post = async (p, body, token) => {
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = "Bearer " + token;
    const r = await fetch(BASE + p, { method: "POST", headers, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
  const login = await post("/api/login", { email: "admin@plain.test", password: "Passw0rd-plain" });
  const token = login.json?.token;
  if (!token) return false;
  const act = await post("/api/instance/activate", { passphrase: PASSPHRASE, confirmPassphrase: PASSPHRASE }, token);
  if (!act.status || act.status >= 400) return false;
  const lock = await post("/api/instance/lock", {}, token);
  return lock.status === 200;
}

// Se présente comme un client distant: TRUST_PROXY désigne la boucle locale
// comme intermédiaire, donc l'en-tête est honoré et l'appel n'est plus vu
// comme local. Sans cela, l'exemption de bouclage masquerait le comportement.
async function unlockAsRemote() {
  const res = await fetch(BASE + "/api/instance/unlock", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify({ passphrase: PASSPHRASE }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function scenario(label, env, expectRefusal) {
  const inst = boot({ TRUST_PROXY: "loopback", ...env });
  try {
    if (!await waitUp()) { t.check(`${label}: l'instance démarre`, false, inst.log().slice(-300)); return null; }
    if (!await armVault(inst.dir)) { t.check(`${label}: le coffre s'arme`, false, inst.log().slice(-300)); return null; }
    const r = await unlockAsRemote();
    const refused = r.status === 400 && /plaintext/i.test(r.body?.error || "");
    t.check(`${label}: ${expectRefusal ? "refusé" : "laissé passer"}`,
            refused === expectRefusal,
            `http ${r.status} ${(r.body?.error || "").slice(0, 60)}`);
    return inst;
  } finally {
    inst.child.kill();
    await sleep(600);
    try { rmSync(inst.dir, { recursive: true, force: true }); } catch { /* peu importe */ }
  }
}

// A) Docker par défaut: HTTPS_ENABLED=false, TRUST_PROXY absent, aucun proxy.
//    C'est le cas de F-04. Le refus doit s'appliquer une fois corrigé.
await scenario("défaut Docker sans proxy", { TRUST_PROXY: "" }, FIXED);

// B) L'opérateur a explicitement déclaré un proxy. Son assertion est honorée
//    dans les deux versions: on ne casse pas les installations existantes.
await scenario("TRUST_PROXY déclaré explicitement", { TRUST_PROXY: "true" }, false);

// C) Un proxy qui transmet correctement X-Forwarded-Proto. Doit passer, sans
//    dépendre de la moindre assertion: c'est la voie propre.
{
  const inst = boot({ TRUST_PROXY: "loopback" });
  try {
    if (await waitUp() && await armVault(inst.dir)) {
      const res = await fetch(BASE + "/api/instance/unlock", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.9",
          "x-forwarded-proto": "https",
        },
        body: JSON.stringify({ passphrase: PASSPHRASE }),
      });
      const body = await res.json().catch(() => ({}));
      const refused = res.status === 400 && /plaintext/i.test(body?.error || "");
      t.check("proxy transmettant X-Forwarded-Proto: laissé passer", !refused,
              `http ${res.status} ${(body?.error || "").slice(0, 60)}`);
    } else {
      t.check("proxy transmettant X-Forwarded-Proto: l'instance démarre", false);
    }
  } finally {
    inst.child.kill();
    await sleep(600);
    try { rmSync(inst.dir, { recursive: true, force: true }); } catch { /* peu importe */ }
  }
}

// D) L'avertissement au démarrage doit dire à l'opérateur Docker où il en est.
{
  const inst = boot({ TRUST_PROXY: "" });
  await waitUp();
  const warned = /TRUST_PROXY is unset/.test(inst.log());
  t.check(FIXED ? "le démarrage avertit quand rien n'est déclaré" : "le démarrage n'avertit pas",
          FIXED ? warned : true, warned ? "avertissement présent" : "aucun avertissement");
  inst.child.kill();
  await sleep(600);
  try { rmSync(inst.dir, { recursive: true, force: true }); } catch { /* peu importe */ }
}

process.exit(t.summary() ? 0 : 1);
