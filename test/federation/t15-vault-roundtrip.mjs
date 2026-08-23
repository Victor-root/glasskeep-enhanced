// Scénario 15, F-18. Le sceau d'authenticité du chiffrement au repos
// n'avait de longueur imposée nulle part.
//
// Chaque donnée chiffrée est accompagnée d'un sceau qui permet de
// détecter toute altération. Faute de préciser sa longueur, la
// bibliothèque acceptait des sceaux tronqués, jusqu'à quatre octets: une
// chance sur quatre milliards de tomber juste au lieu d'une sur 2^128.
// Ce n'était pas exploitable, le sceau ne venant jamais du réseau mais
// de la base locale, et il faut déjà savoir écrire dans ce fichier.
// C'était une garantie que le code croyait avoir sans l'avoir.
//
// Ce scénario a deux moitiés, et la première compte autant que la
// seconde: toucher aux paramètres de chiffrement d'un coffre existant,
// c'est risquer de rendre les notes illisibles. On vérifie donc d'abord
// que tout le cycle de vie du coffre fonctionne toujours de bout en
// bout, ensuite seulement que le sceau tronqué est refusé.
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
const t = runner(`Scénario 15, coffre au repos et sceau d'authenticité (attente: ${FIXED ? "corrigé" : "vulnérable"})`);

const PORT = Number(process.env.FEDLAB_VAULT_PORT || 9475);
const BASE = `http://127.0.0.1:${PORT}`;
const PASS = "phrase-de-passe-initiale";
const PASS2 = "phrase-de-passe-changee";
const dir = mkdtempSync(path.join(tmpdir(), "gk-vault-"));

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

const call = async (method, p, { body, token } = {}) => {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  const r = await fetch(BASE + p, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

try {
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    try { ready = (await fetch(BASE + "/api/health")).ok; } catch { /* pas prêt */ }
    if (!ready) await sleep(400);
  }
  if (!ready) throw new Error("l'instance n'a pas démarré: " + log.slice(-400));

  const Database = require(path.join(ROOT, "node_modules", "better-sqlite3"));
  const bcrypt = require(path.join(ROOT, "node_modules", "bcryptjs"));
  {
    const db = new Database(path.join(dir, "data.sqlite"));
    db.prepare("INSERT INTO users (name,email,password_hash,created_at,is_admin) VALUES (?,?,?,?,1)")
      .run("Admin", "admin@vault.test", bcrypt.hashSync("Passw0rd-admin", 10), new Date().toISOString());
    db.close();
  }
  const token = (await call("POST", "/api/login",
    { body: { email: "admin@vault.test", password: "Passw0rd-admin" } })).json.token;

  // ── A) Le cycle de vie complet du coffre ───────────────────────────
  const SECRET_TITLE = "Titre secret " + "é€ü";
  const SECRET_BODY = "Corps confidentiel avec accents: àéîôù";

  const created = await call("POST", "/api/notes", {
    token,
    body: { type: "text", title: SECRET_TITLE, content: SECRET_BODY, tags: ["confidentiel", "à-lire"] },
  });
  t.check("une note est créée avant l'activation", created.status === 200 || created.status === 201,
          `http ${created.status}`);
  const noteId = created.json?.id ?? created.json?.note?.id;

  const activated = await call("POST", "/api/instance/activate", {
    token, body: { passphrase: PASS, confirmPassphrase: PASS },
  });
  t.check("le chiffrement au repos s'active", activated.status === 200, `http ${activated.status}`);
  const recoveryKey = activated.json?.recoveryKey || activated.json?.key;
  t.check("une clé de secours est remise", typeof recoveryKey === "string" && recoveryKey.length > 10,
          String(recoveryKey).slice(0, 12) + "...");

  // Ce que voit quelqu'un qui ouvre le fichier de base: rien.
  {
    const db = new Database(path.join(dir, "data.sqlite"), { readonly: true });
    const row = db.prepare("SELECT title, content, enc_payload FROM notes WHERE id = ?").get(noteId);
    db.close();
    t.check("le titre en clair a disparu de la base", !String(row?.title || "").includes("Titre secret"),
            JSON.stringify(row?.title));
    t.check("le corps en clair aussi", !String(row?.content || "").includes("confidentiel"),
            JSON.stringify(row?.content).slice(0, 40));
    t.check("un chiffré a bien pris leur place", !!row?.enc_payload,
            String(row?.enc_payload || "").slice(0, 40));
  }

  const readBack = await call("GET", `/api/notes/${noteId}`, { token });
  t.check("la note se relit intacte, coffre ouvert",
          readBack.json?.title === SECRET_TITLE && readBack.json?.content === SECRET_BODY,
          `${JSON.stringify(readBack.json?.title)} / http ${readBack.status}`);
  t.check("ses étiquettes aussi",
          JSON.stringify(readBack.json?.tags || []).includes("confidentiel"),
          JSON.stringify(readBack.json?.tags));

  // Verrouiller, relire par la phrase de passe.
  t.check("le coffre se verrouille",
          (await call("POST", "/api/instance/lock", { token })).status === 200);
  const wrongPass = await call("POST", "/api/instance/unlock", { body: { passphrase: "pas la bonne" } });
  t.check("une mauvaise phrase de passe est refusée", wrongPass.status === 401, `http ${wrongPass.status}`);
  const unlocked = await call("POST", "/api/instance/unlock", { body: { passphrase: PASS } });
  t.check("la bonne phrase de passe ouvre le coffre", unlocked.status === 200, `http ${unlocked.status}`);
  t.check("et la note est de nouveau lisible",
          (await call("GET", `/api/notes/${noteId}`, { token })).json?.content === SECRET_BODY);

  // Verrouiller, relire par la clé de secours.
  await call("POST", "/api/instance/lock", { token });
  const byRecovery = await call("POST", "/api/instance/unlock-recovery", { body: { recoveryKey } });
  t.check("la clé de secours ouvre aussi le coffre", byRecovery.status === 200,
          `http ${byRecovery.status} ${JSON.stringify(byRecovery.json).slice(0, 80)}`);
  t.check("et la note est toujours lisible",
          (await call("GET", `/api/notes/${noteId}`, { token })).json?.content === SECRET_BODY);

  // Changer la phrase de passe: c'est un réemballage de la clé.
  const changed = await call("POST", "/api/instance/passphrase", {
    token, body: { currentPassphrase: PASS, newPassphrase: PASS2, confirmPassphrase: PASS2 },
  });
  t.check("la phrase de passe se change", changed.status === 200, `http ${changed.status}`);
  await call("POST", "/api/instance/lock", { token });
  t.check("l'ancienne phrase de passe ne marche plus",
          (await call("POST", "/api/instance/unlock", { body: { passphrase: PASS } })).status === 401);
  t.check("la nouvelle ouvre le coffre",
          (await call("POST", "/api/instance/unlock", { body: { passphrase: PASS2 } })).status === 200);

  // Écrire une note APRÈS activation, puis la relire après un cycle.
  const after = await call("POST", "/api/notes", {
    token, body: { type: "text", title: "Après", content: "écrit coffre ouvert" },
  });
  const afterId = after.json?.id ?? after.json?.note?.id;
  await call("POST", "/api/instance/lock", { token });
  await call("POST", "/api/instance/unlock", { body: { passphrase: PASS2 } });
  t.check("une note écrite après activation se relit après un cycle complet",
          (await call("GET", `/api/notes/${afterId}`, { token })).json?.content === "écrit coffre ouvert");

  // ── B) Le sceau tronqué ────────────────────────────────────────────
  // Directement sur la primitive, parce que c'est là qu'est la règle et
  // que le chemin réseau n'y mène pas.
  const aead = (() => {
    try { return require(path.join(ROOT, "server", "encryption", "aeadGcm.js")); }
    catch { return null; }
  })();
  t.check(FIXED ? "la construction AES-GCM est centralisée" : "chaque site règle AES-GCM pour lui-même",
          FIXED ? !!aead : !aead);

  const crypto = require("node:crypto");
  const key = crypto.randomBytes(32);
  const clear = "message a proteger";

  if (aead) {
    const sealed = aead.encrypt(key, clear);
    t.check("le sceau produit fait bien seize octets", sealed.tag.length === 16,
            `${sealed.tag.length} octets`);
    t.check("un aller-retour normal fonctionne",
            aead.decrypt(key, sealed.iv, sealed.ct, sealed.tag).toString("utf8") === clear);
    t.check("un sceau tronqué à quatre octets est refusé", (() => {
      try { aead.decrypt(key, sealed.iv, sealed.ct, sealed.tag.subarray(0, 4)); return false; }
      catch { return true; }
    })());
    t.check("un vecteur d'initialisation de mauvaise taille est refusé", (() => {
      try { aead.decrypt(key, Buffer.concat([sealed.iv, Buffer.alloc(4)]), sealed.ct, sealed.tag); return false; }
      catch { return true; }
    })());
    t.check("un chiffré modifié est refusé", (() => {
      const bad = Buffer.from(sealed.ct);
      bad[0] ^= 0xff;
      try { aead.decrypt(key, sealed.iv, bad, sealed.tag); return false; }
      catch { return true; }
    })());
    t.check("les données associées font partie du sceau", (() => {
      const withAad = aead.encrypt(key, clear, Buffer.from("contexte-a"));
      try {
        aead.decrypt(key, withAad.iv, withAad.ct, withAad.tag, Buffer.from("contexte-b"));
        return false;
      } catch { return true; }
    })());
  }

  // La bibliothèque, sans longueur imposée, accepte le sceau court: le
  // point de départ du constat. Vrai dans les deux cas, c'est une
  // propriété de Node, pas du projet.
  t.check("sans longueur imposée, la bibliothèque accepte bien un sceau de quatre octets", (() => {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([c.update(clear, "utf8"), c.final()]);
    const short = c.getAuthTag().subarray(0, 4);
    try {
      const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
      d.setAuthTag(short);
      return true; // setAuthTag n'a pas protesté
    } catch { return false; }
  })());
} finally {
  child.kill();
  await sleep(600);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* peu importe */ }
}

process.exit(t.summary() ? 0 : 1);
