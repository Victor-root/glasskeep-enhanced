// Scénario 9 — F-05. Un compte ordinaire ne doit pas pouvoir faire sonder le
// réseau de l'opérateur par son propre serveur.
//
// La configuration IA laisse chaque utilisateur indiquer l'adresse de son
// fournisseur. Sans limite, n'importe quel compte peut faire connecter le
// serveur où il veut sur le réseau où il se trouve, et lit en retour ce qui a
// répondu: le gestionnaire de notes devient une sonde du réseau domestique.
//
// La difficulté du correctif n'est pas technique, elle est de périmètre: le
// README RECOMMANDE de pointer vers un modèle local (Ollama sur le LAN) pour
// garder ses notes chez soi. Interdire les adresses privées casserait donc le
// mode le plus respectueux de la vie privée. La ligne passe par QUI a saisi
// l'adresse, pas par laquelle: l'administrateur va où il veut, un utilisateur
// ordinaire ne va en privé que vers le fournisseur que l'administrateur a
// déjà configuré.
//
// Le scénario démarre sa propre instance et un faux service interne qui joue
// le rôle de « machine du réseau qu'on ne devrait pas pouvoir atteindre ».
import { spawn } from "node:child_process";
import { createServer } from "node:http";
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
const t = runner(`Scénario 9, sonde réseau via la configuration IA (attente: ${FIXED ? "corrigé" : "vulnérable"})`);

const PORT = Number(process.env.FEDLAB_AI_PORT || 9466);
const VICTIM_PORT = Number(process.env.FEDLAB_VICTIM_PORT || 9467);
const BASE = `http://127.0.0.1:${PORT}`;

// ── Le service interne qu'un utilisateur ne devrait pas pouvoir atteindre ──
let victimHits = 0;
const victim = createServer((req, res) => {
  victimHits++;
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({
    choices: [{ message: { content: "SECRET-INTERNE-42" } }],
  }));
});
await new Promise((r) => victim.listen(VICTIM_PORT, "127.0.0.1", r));

// ── L'instance GlassKeep ────────────────────────────────────────────────
const dir = mkdtempSync(path.join(tmpdir(), "gk-ai-"));
const child = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
  env: {
    ...process.env,
    DB_FILE: path.join(dir, "data.sqlite"),
    JWT_SECRET: "0".repeat(64),
    API_PORT: String(PORT),
    NODE_ENV: "production",
    HTTPS_ENABLED: "false",
    TRUST_PROXY: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (d) => { log += d; });
child.stderr.on("data", (d) => { log += d; });

async function up() {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(BASE + "/api/health")).ok) return true; } catch { /* pas prêt */ }
    await sleep(400);
  }
  return false;
}

const post = async (p, body, token) => {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  const r = await fetch(BASE + p, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const put = async (p, body, token) => {
  const r = await fetch(BASE + p, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

try {
  if (!await up()) throw new Error("l'instance n'a pas démarré: " + log.slice(-400));

  // Deux comptes: un administrateur, et un utilisateur ordinaire.
  const Database = require(path.join(ROOT, "node_modules", "better-sqlite3"));
  const bcrypt = require(path.join(ROOT, "node_modules", "bcryptjs"));
  const db = new Database(path.join(dir, "data.sqlite"));
  const add = (name, email, pw, admin) =>
    db.prepare("INSERT INTO users (name,email,password_hash,created_at,is_admin) VALUES (?,?,?,?,?)")
      .run(name, email, bcrypt.hashSync(pw, 10), new Date().toISOString(), admin);
  add("Admin", "admin@ai.test", "Passw0rd-admin", 1);
  add("Membre", "membre@ai.test", "Passw0rd-membre", 0);
  db.close();

  const adminTok = (await post("/api/login", { email: "admin@ai.test", password: "Passw0rd-admin" })).json.token;
  const userTok = (await post("/api/login", { email: "membre@ai.test", password: "Passw0rd-membre" })).json.token;
  t.check("les deux comptes se connectent", !!adminTok && !!userTok);

  // L'administrateur active l'IA sans pointer nulle part de particulier.
  await put("/api/admin/ai/settings", { enabled: true, baseUrl: "https://api.invalid.example/v1", model: "m" }, adminTok);

  // ── A) Un utilisateur ordinaire vise le service interne ────────────────
  victimHits = 0;
  const probe = await post("/api/user/ai/test", {
    mode: "custom", baseUrl: `http://127.0.0.1:${VICTIM_PORT}/v1`, model: "m", apiKey: "x",
  }, userTok);
  await sleep(300);
  t.check(FIXED ? "la sonde vers le service interne est refusée" : "la sonde vers le service interne aboutit",
          FIXED ? victimHits === 0 : victimHits > 0,
          `${victimHits} requête(s) reçue(s) par le service interne, http ${probe.status}`);
  t.check(FIXED ? "le contenu interne n'est pas renvoyé à l'utilisateur" : "le contenu interne est renvoyé",
          FIXED ? !JSON.stringify(probe.json).includes("SECRET-INTERNE-42")
                : JSON.stringify(probe.json).includes("SECRET-INTERNE-42"),
          JSON.stringify(probe.json).slice(0, 90));

  // ── B) Une adresse privée sur une autre plage, pour vérifier la couverture ─
  victimHits = 0;
  const lan = await post("/api/user/ai/test", {
    mode: "custom", baseUrl: "http://192.168.1.1/v1", model: "m", apiKey: "x",
  }, userTok);
  t.check(FIXED ? "une adresse de réseau local est refusée" : "une adresse de réseau local est tentée",
          FIXED ? /private/i.test(JSON.stringify(lan.json)) : true,
          `http ${lan.status} ${JSON.stringify(lan.json).slice(0, 70)}`);

  // ── C) Les schémas exotiques n'ont rien à faire là ─────────────────────
  const scheme = await post("/api/user/ai/test", {
    mode: "custom", baseUrl: "file:///etc/passwd", model: "m", apiKey: "x",
  }, userTok);
  t.check(FIXED ? "un schéma non HTTP est refusé" : "un schéma non HTTP est accepté tel quel",
          FIXED ? /scheme|malformed/i.test(JSON.stringify(scheme.json)) : true,
          `http ${scheme.status} ${JSON.stringify(scheme.json).slice(0, 70)}`);

  // ── D) Le cas légitime documenté doit continuer de marcher ─────────────
  // L'administrateur configure le modèle local; l'utilisateur pointe vers LE
  // MÊME. C'est le montage que le README recommande, il ne doit pas casser.
  await put("/api/admin/ai/settings",
            { enabled: true, baseUrl: `http://127.0.0.1:${VICTIM_PORT}/v1`, model: "m" }, adminTok);
  victimHits = 0;
  const same = await post("/api/user/ai/test", {
    mode: "custom", baseUrl: `http://127.0.0.1:${VICTIM_PORT}/v1`, model: "m", apiKey: "x",
  }, userTok);
  await sleep(300);
  t.check("pointer vers le fournisseur local de l'administrateur reste possible",
          victimHits > 0, `${victimHits} requête(s), http ${same.status}`);

  // ── E) Et l'administrateur, lui, va où il veut ─────────────────────────
  victimHits = 0;
  const adminProbe = await post("/api/admin/ai/test", {
    baseUrl: `http://127.0.0.1:${VICTIM_PORT}/v1`, model: "m", apiKey: "x",
  }, adminTok);
  await sleep(300);
  t.check("l'administrateur peut viser son modèle local", victimHits > 0,
          `${victimHits} requête(s), http ${adminProbe.status}`);
} finally {
  child.kill();
  victim.close();
  await sleep(600);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* peu importe */ }
}

process.exit(t.summary() ? 0 : 1);
