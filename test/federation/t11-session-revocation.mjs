// Scénario 11, F-08. Changer son mot de passe ne coupait pas les
// sessions déjà ouvertes.
//
// Le jeton de session vaut trente jours et le serveur ne tenait aucune
// liste de révocation. Quelqu'un qui change son mot de passe parce qu'il
// le croit compromis ne coupait donc rien du tout: le jeton déjà entre
// les mains d'un tiers continuait de marcher jusqu'à son expiration
// naturelle. Le seul geste censé refermer la porte la laissait ouverte.
//
// Le correctif tient dans un compteur porté par le compte et recopié
// dans chaque jeton. Le scénario vérifie qu'il coupe bien ce qu'il doit
// couper, et surtout qu'il ne coupe rien d'autre: pas les autres
// comptes, pas l'appareil qui vient de changer le mot de passe, pas les
// jetons émis avant que le mécanisme existe.
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
const t = runner(`Scénario 11, révocation des sessions (attente: ${FIXED ? "corrigé" : "vulnérable"})`);

const PORT = Number(process.env.FEDLAB_SESSION_PORT || 9469);
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = "0".repeat(64);

const dir = mkdtempSync(path.join(tmpdir(), "gk-session-"));
const child = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
  env: {
    ...process.env,
    DB_FILE: path.join(dir, "data.sqlite"),
    JWT_SECRET: SECRET,
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

const call = async (method, p, { body, token } = {}) => {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  const r = await fetch(BASE + p, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

// « Cette session marche-t-elle encore ? », posé sur une route qui exige
// simplement d'être authentifié.
const alive = async (token) => (await call("GET", "/api/user/profile", { token })).status === 200;

const login = async (email, password) =>
  (await call("POST", "/api/login", { body: { email, password } })).json.token;

try {
  if (!await up()) throw new Error("l'instance n'a pas démarré: " + log.slice(-400));

  const Database = require(path.join(ROOT, "node_modules", "better-sqlite3"));
  const bcrypt = require(path.join(ROOT, "node_modules", "bcryptjs"));
  const jwt = require(path.join(ROOT, "node_modules", "jsonwebtoken"));
  const db = new Database(path.join(dir, "data.sqlite"));
  const add = (name, email, pw, admin) =>
    db.prepare("INSERT INTO users (name,email,password_hash,created_at,is_admin) VALUES (?,?,?,?,?)")
      .run(name, email, bcrypt.hashSync(pw, 10), new Date().toISOString(), admin);
  add("Admin", "admin@sess.test", "Passw0rd-admin", 1);
  add("Victime", "victime@sess.test", "Passw0rd-victime", 0);
  add("Temoin", "temoin@sess.test", "Passw0rd-temoin", 0);
  add("Reset", "reset@sess.test", "Passw0rd-reset", 0);
  add("Ancien", "ancien@sess.test", "Passw0rd-ancien", 0);
  const ancienId = db.prepare("SELECT id FROM users WHERE email='ancien@sess.test'").get().id;
  const victimId = db.prepare("SELECT id FROM users WHERE email='victime@sess.test'").get().id;
  const resetId = db.prepare("SELECT id FROM users WHERE email='reset@sess.test'").get().id;
  db.close();

  // ── A) Deux appareils, un seul compte ──────────────────────────────
  const phone = await login("victime@sess.test", "Passw0rd-victime");
  const stolen = await login("victime@sess.test", "Passw0rd-victime");
  const witness = await login("temoin@sess.test", "Passw0rd-temoin");
  t.check("les deux sessions du compte sont ouvertes", await alive(phone) && await alive(stolen));

  // ── B) Un flux d'événements ouvert sur la session à révoquer ───────
  // C'est le canal qui pousse les notes en temps réel. Le refermer fait
  // partie de la révocation: sinon les mises à jour continuent d'arriver
  // à une session censée être coupée.
  const streamCtl = new AbortController();
  let streamClosed = false;
  const stream = fetch(`${BASE}/api/events?token=${encodeURIComponent(stolen)}`, { signal: streamCtl.signal })
    .then(async (r) => {
      const reader = r.body.getReader();
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
      streamClosed = true;
    })
    .catch(() => { streamClosed = true; });
  await sleep(500);

  // ── C) Le changement de mot de passe ───────────────────────────────
  const changed = await call("POST", "/api/user/change-password", {
    token: phone,
    body: { current_password: "Passw0rd-victime", new_password: "Passw0rd-nouveau" },
  });
  t.check("le changement de mot de passe aboutit", changed.status === 200 && !!changed.json?.token,
          `http ${changed.status}`);

  const phoneRenewed = changed.json?.token;
  t.check("l'appareil qui a changé le mot de passe reste connecté",
          await alive(phoneRenewed), "nouveau jeton");

  t.check(FIXED ? "l'autre session est coupée" : "l'autre session continue de fonctionner",
          FIXED ? !(await alive(stolen)) : await alive(stolen));

  t.check(FIXED ? "l'ancien jeton de l'appareil lui-même est coupé" : "l'ancien jeton reste valable",
          FIXED ? !(await alive(phone)) : await alive(phone));

  t.check("un autre compte n'est pas touché", await alive(witness));

  await sleep(500);
  t.check(FIXED ? "le flux d'événements de la session coupée est refermé" : "le flux d'événements reste ouvert",
          FIXED ? streamClosed : !streamClosed, `fermé=${streamClosed}`);
  streamCtl.abort();
  await stream.catch(() => {});

  // ── D) Le nouveau mot de passe, et la reconduction du jeton ────────
  const afterChange = await login("victime@sess.test", "Passw0rd-nouveau");
  t.check("on se reconnecte avec le nouveau mot de passe", !!afterChange && await alive(afterChange));
  const renewed = await call("GET", "/api/auth/renew", { token: afterChange });
  t.check("la reconduction du jeton rend un jeton utilisable",
          renewed.status === 200 && await alive(renewed.json?.token),
          `http ${renewed.status}`);

  // ── E) Un échec ne doit rien révoquer ──────────────────────────────
  const wrong = await call("POST", "/api/user/change-password", {
    token: afterChange,
    body: { current_password: "pas-le-bon", new_password: "Passw0rd-encore" },
  });
  t.check("un mauvais mot de passe actuel est refusé", wrong.status === 401, `http ${wrong.status}`);
  t.check("et ne coupe aucune session", await alive(afterChange));

  // ── F) Les jetons émis avant le mécanisme ──────────────────────────
  // Un jeton frappé par une version antérieure ne porte pas de compteur.
  // Personne ne doit être déconnecté par la seule mise à jour, donc le
  // compte utilisé ici est un compte dont le mot de passe n'a jamais
  // bougé: un compte dont il a bougé DOIT au contraire voir ce jeton
  // refusé, c'est tout l'objet du correctif.
  const legacy = jwt.sign(
    { uid: ancienId, email: "ancien@sess.test", name: "Ancien", is_admin: false },
    SECRET,
    { expiresIn: "30d" },
  );
  t.check("un jeton d'avant le correctif continue de marcher", await alive(legacy));

  const staleLegacy = jwt.sign(
    { uid: victimId, email: "victime@sess.test", name: "Victime", is_admin: false },
    SECRET,
    { expiresIn: "30d" },
  );
  t.check(FIXED ? "mais pas sur un compte dont le mot de passe a changé depuis"
                : "y compris sur un compte dont le mot de passe a changé depuis",
          FIXED ? !(await alive(staleLegacy)) : await alive(staleLegacy));

  // ── G) La réinitialisation par l'administration ────────────────────
  // Même événement: le mot de passe change, donc les sessions ouvertes
  // avec l'ancien s'arrêtent.
  const adminTok = await login("admin@sess.test", "Passw0rd-admin");
  const resetTok = await login("reset@sess.test", "Passw0rd-reset");
  t.check("la session du compte à réinitialiser est ouverte", await alive(resetTok));
  const reset = await call("PATCH", `/api/admin/users/${resetId}`, {
    token: adminTok,
    body: { password: "Passw0rd-impose" },
  });
  t.check("l'administration réinitialise le mot de passe", reset.status === 200, `http ${reset.status}`);
  t.check(FIXED ? "la session de ce compte est coupée" : "la session de ce compte survit",
          FIXED ? !(await alive(resetTok)) : await alive(resetTok));
  t.check("la session de l'administrateur n'est pas touchée", await alive(adminTok));

  // ── H) Un compte supprimé ──────────────────────────────────────────
  const doomedTok = await login("temoin@sess.test", "Passw0rd-temoin");
  const temoinId = (await call("GET", "/api/user/profile", { token: doomedTok })).json.id;
  await call("DELETE", `/api/admin/users/${temoinId}`, { token: adminTok });
  t.check("le jeton d'un compte supprimé ne passe plus", !(await alive(doomedTok)));
} finally {
  child.kill();
  await sleep(600);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* peu importe */ }
}

process.exit(t.summary() ? 0 : 1);
