// Scénario 10, F-06. La page de connexion ne freinait rien.
//
// Sans limiteur, la seule résistance est le coût du hachage: environ dix
// essais par seconde. Un dictionnaire de dix mille mots part en un quart
// d'heure. Et les deux messages de refus, « aucun compte » d'un côté,
// « mot de passe incorrect » de l'autre, disent lequel des deux est bon:
// on peut donc dresser la liste des comptes avant même de commencer.
//
// La contrainte du correctif est de ne pas punir la personne qui possède
// le compte. Elle a le droit d'essayer une dizaine de mots de passe sans
// que rien ne se passe. Le scénario vérifie les deux directions: la main
// lourde sur l'attaquant, la main légère sur l'utilisateur légitime.
//
// L'instance tourne derrière un intermédiaire de confiance, ce qui permet
// de choisir l'adresse d'appel requête par requête et donc de distinguer
// « une machine qui martèle » de « plusieurs personnes qui se trompent ».
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
const t = runner(`Scénario 10, freinage de la connexion (attente: ${FIXED ? "corrigé" : "vulnérable"})`);

const PORT = Number(process.env.FEDLAB_LOGIN_PORT || 9468);
const BASE = `http://127.0.0.1:${PORT}`;

const dir = mkdtempSync(path.join(tmpdir(), "gk-login-"));
const child = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
  env: {
    ...process.env,
    DB_FILE: path.join(dir, "data.sqlite"),
    JWT_SECRET: "0".repeat(64),
    API_PORT: String(PORT),
    NODE_ENV: "production",
    HTTPS_ENABLED: "false",
    // La boucle locale est un intermédiaire de confiance: l'en-tête
    // d'adresse est donc honoré, ce qui donne au scénario le droit de
    // se présenter sous l'adresse de son choix.
    TRUST_PROXY: "loopback",
    ALLOW_REGISTRATION: "true",
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

// `from` est l'adresse sous laquelle on se présente.
async function tryLogin(body, from) {
  const started = Date.now();
  const res = await fetch(BASE + "/api/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": from },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return {
    status: res.status,
    json,
    ms: Date.now() - started,
    retryAfter: res.headers.get("retry-after"),
    message: String(json?.error || ""),
  };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

try {
  if (!await up()) throw new Error("l'instance n'a pas démarré: " + log.slice(-400));

  const Database = require(path.join(ROOT, "node_modules", "better-sqlite3"));
  const bcrypt = require(path.join(ROOT, "node_modules", "bcryptjs"));
  const db = new Database(path.join(dir, "data.sqlite"));
  const add = (name, email, pw) =>
    db.prepare("INSERT INTO users (name,email,password_hash,created_at,is_admin) VALUES (?,?,?,?,0)")
      .run(name, email, bcrypt.hashSync(pw, 10), new Date().toISOString());
  add("Chrono", "chrono@login.test", "Passw0rd-chrono");
  add("Honnete", "honnete@login.test", "Passw0rd-honnete");
  add("Cible", "cible@login.test", "Passw0rd-cible");
  db.close();

  // ── A) Ce que le refus raconte ─────────────────────────────────────
  // Deux refus: un compte qui existe avec le mauvais mot de passe, un
  // compte qui n'existe pas. Ils doivent être indiscernables.
  const known = await tryLogin({ email: "chrono@login.test", password: "faux" }, "203.0.113.1");
  const unknown = await tryLogin({ email: "fantome@login.test", password: "faux" }, "203.0.113.2");
  t.check(FIXED ? "les deux refus emploient exactement la même phrase"
                : "les deux refus se distinguent par la phrase",
          FIXED ? known.message === unknown.message && known.message !== ""
                : known.message !== unknown.message,
          `« ${known.message} » / « ${unknown.message} »`);
  t.check("les deux refus emploient le même code HTTP",
          known.status === 401 && unknown.status === 401,
          `${known.status} / ${unknown.status}`);

  // ── B) Ce que le refus raconte sans le dire ────────────────────────
  // Même phrase des deux côtés ne suffit pas: si le compte inconnu
  // répond instantanément et le compte connu après un hachage, le temps
  // de réponse tient lieu d'aveu. Chaque essai part d'une adresse neuve
  // pour qu'aucune pénalité ne fausse la mesure.
  const knownMs = [];
  const unknownMs = [];
  for (let i = 0; i < 5; i++) {
    knownMs.push((await tryLogin({ email: "chrono@login.test", password: "faux" }, `198.51.100.${10 + i}`)).ms);
    unknownMs.push((await tryLogin({ email: `absent${i}@login.test`, password: "faux" }, `198.51.100.${50 + i}`)).ms);
  }
  const mk = median(knownMs);
  const mu = median(unknownMs);
  t.check(FIXED ? "le temps de réponse ne trahit pas l'existence du compte"
                : "le temps de réponse trahit l'existence du compte",
          FIXED ? mu >= mk * 0.5 : mu < mk * 0.5,
          `compte connu ${mk} ms, compte inconnu ${mu} ms`);

  // ── C) La main légère: dix erreurs de suite ne coûtent rien ────────
  const honest = "192.0.2.77";
  let honestBlocked = false;
  const honestStart = Date.now();
  for (let i = 0; i < 10; i++) {
    const r = await tryLogin({ email: "honnete@login.test", password: "essai-" + i }, honest);
    if (r.status !== 401) honestBlocked = true;
  }
  const honestMs = Date.now() - honestStart;
  t.check("dix mots de passe ratés d'affilée: aucun blocage", !honestBlocked);
  const recovered = await tryLogin({ email: "honnete@login.test", password: "Passw0rd-honnete" }, honest);
  t.check("le onzième essai, le bon, ouvre la session",
          recovered.status === 200 && !!recovered.json?.token,
          `http ${recovered.status}`);
  t.check("et ces onze essais ne prennent pas un temps absurde", honestMs < 20000,
          `${honestMs} ms pour dix essais ratés`);

  // Une fois connecté, le compteur repart de zéro: la personne a prouvé
  // qu'elle était chez elle.
  const afterSuccess = await tryLogin({ email: "honnete@login.test", password: "encore-faux" }, honest);
  t.check("après une connexion réussie, le compteur est remis à zéro",
          afterSuccess.status === 401, `http ${afterSuccess.status}`);

  // ── D) La main lourde: le dictionnaire ─────────────────────────────
  // Quarante essais lancés ensemble sur le même compte. Le correctif
  // doit finir par refuser de répondre, avec l'en-tête qui dit quand
  // revenir.
  const hammer = "198.18.0.9";
  const volley = await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      tryLogin({ email: "cible@login.test", password: "dico-" + i }, hammer)),
  );
  const refused = volley.filter((r) => r.status === 429);
  t.check(FIXED ? "un martèlement finit par se faire couper" : "un martèlement passe sans entrave",
          FIXED ? refused.length > 0 : refused.length === 0,
          `${refused.length} refus sur 40`);
  t.check(FIXED ? "le refus dit au bout de combien de temps revenir" : "aucun délai n'est annoncé",
          FIXED ? refused.every((r) => Number(r.retryAfter) > 0) : true,
          FIXED ? `Retry-After ${refused[0]?.retryAfter}` : "");

  // Le blocage doit tenir même face au bon mot de passe, sinon il ne
  // sert à rien: c'est précisément pour cela que la marge du début est
  // large.
  const blockedGood = await tryLogin({ email: "cible@login.test", password: "Passw0rd-cible" }, hammer);
  t.check(FIXED ? "pendant le blocage, même le bon mot de passe attend"
                : "le bon mot de passe passe quoi qu'il arrive",
          FIXED ? blockedGood.status === 429 : blockedGood.status === 200,
          `http ${blockedGood.status}`);

  // ── E) Le blocage ne doit pas déborder sur les autres ──────────────
  const bystander = await tryLogin({ email: "honnete@login.test", password: "Passw0rd-honnete" }, "192.0.2.200");
  t.check("un autre compte, depuis une autre adresse, se connecte normalement",
          bystander.status === 200 && !!bystander.json?.token,
          `http ${bystander.status}`);

  // Et surtout: le compte martelé ne doit pas devenir inaccessible à
  // celui qui le possède. Sinon il suffirait de connaître une adresse
  // e-mail pour mettre quelqu'un dehors de son propre serveur.
  const owner = await tryLogin({ email: "cible@login.test", password: "Passw0rd-cible" }, "192.0.2.201");
  t.check("le propriétaire du compte martelé rentre quand même chez lui",
          owner.status === 200 && !!owner.json?.token,
          `http ${owner.status}`);

  // ── F) Le mot de passe minimum à l'inscription ─────────────────────
  // L'écran d'inscription exigeait six caractères, le serveur zéro: il
  // suffisait de ne pas passer par l'écran.
  const short = await fetch(BASE + "/api/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Court", email: "court@login.test", password: "abc" }),
  });
  const shortJson = await short.json().catch(() => ({}));
  t.check(FIXED ? "un mot de passe de trois caractères est refusé à l'inscription"
                : "un mot de passe de trois caractères est accepté à l'inscription",
          FIXED ? short.status === 400 && /at least/i.test(String(shortJson?.error))
                : short.status === 202,
          `http ${short.status} ${JSON.stringify(shortJson).slice(0, 70)}`);

  const proper = await fetch(BASE + "/api/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Correct", email: "correct@login.test", password: "abcdef" }),
  });
  t.check("une inscription normale continue de passer", proper.status === 202,
          `http ${proper.status}`);
} finally {
  child.kill();
  await sleep(600);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* peu importe */ }
}

process.exit(t.summary() ? 0 : 1);
