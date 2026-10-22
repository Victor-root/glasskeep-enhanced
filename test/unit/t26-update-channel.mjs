// Le canal de mise à jour: stable ou bêta, choisi depuis le panneau.
//
// Un faux GitHub répond à la place du vrai (dernière version publiée,
// branche beta-validated, package.json de chaque version), et la mise à
// jour en un clic est remplacée par un enregistreur: on vérifie ce qui
// serait installé, pas l'installation elle-même (voir self-update.sh).
//
// Les règles vérifiées ici:
//   - ce que propose chaque canal, une bêta du même numéro comprise;
//   - le serveur n'installe que ce qu'il propose, pas ce que dit le
//     navigateur;
//   - entrer en bêta sauvegarde la base et installe la bêta;
//   - quitter une bêta: tout de suite seulement si la version stable lit
//     ses données, avec restauration de la sauvegarde, ou en attendant;
//     un échec au lancement laisse tout comme avant.
import http from "node:http";
import path from "node:path";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runner } from "../federation/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const express = require(path.join(ROOT, "node_modules", "express"));
const t = runner("Le canal de mise à jour");

// ── Le faux GitHub ───────────────────────────────────────────────────
const REPO = "test/glasskeep";
const gh = { release: "2.7.0", releaseCompat: 1, beta: null }; // beta: { sha, version, dbCompat }
const github = http.createServer((req, res) => {
  const json = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  const url = new URL(req.url, "http://x");
  if (url.pathname === `/repos/${REPO}/releases/latest`) {
    return json(200, { tag_name: `v${gh.release}`, html_url: `https://example.test/v${gh.release}` });
  }
  if (url.pathname === `/repos/${REPO}/commits/beta-validated`) {
    return gh.beta ? json(200, { sha: gh.beta.sha, commit: { committer: { date: "2026-10-22T10:00:00Z" } } }) : json(404, {});
  }
  const raw = url.pathname.match(new RegExp(`^/raw/${REPO}/([^/]+)/package\\.json$`));
  if (raw) {
    const ref = decodeURIComponent(raw[1]);
    if (ref === `v${gh.release}`) return json(200, { version: gh.release, glasskeep: { dbCompat: gh.releaseCompat } });
    if (gh.beta && ref === gh.beta.sha) return json(200, { version: gh.beta.version, glasskeep: { dbCompat: gh.beta.dbCompat } });
  }
  json(404, {});
});
await new Promise((r) => github.listen(0, "127.0.0.1", r));
const ghBase = `http://127.0.0.1:${github.address().port}`;
process.env.UPDATE_GITHUB_REPO = REPO;
process.env.UPDATE_GITHUB_API = ghBase;
process.env.UPDATE_GITHUB_RAW = `${ghBase}/raw`;
process.env.UPDATE_CHECK_TTL_MS = "1";

// ── La mise à jour en un clic, remplacée par un enregistreur ─────────
const orchestrator = require(path.join(ROOT, "server", "services", "updateOrchestrator.js"));
const installs = [];
let clicDisponible = true;
let echecAuLancement = false;
orchestrator.getMode = async () => (clicDisponible
  ? { mode: "native", oneClickAvailable: true, reason: null }
  : { mode: "docker", oneClickAvailable: false, reason: "docker-socket-missing" });
orchestrator.isUpdateInProgress = () => false;
orchestrator.startUpdate = async (args) => {
  if (echecAuLancement) throw new Error("systemctl start exited with code 1");
  installs.push(args);
  return { mode: "native" };
};

const { openDatabase } = require(path.join(ROOT, "server", "db", "schema.js"));
const safety = require(path.join(ROOT, "server", "db", "dbSafety.js"));
const { createUpdateChannel } = require(path.join(ROOT, "server", "services", "updateChannel.js"));
const { attachUpdateRoutes } = require(path.join(ROOT, "server", "routes", "updateRoutes.js"));
const { attachSelfUpdateRoutes } = require(path.join(ROOT, "server", "routes", "selfUpdateRoutes.js"));
const { attachUpdateChannelRoutes } = require(path.join(ROOT, "server", "routes", "updateChannelRoutes.js"));

const silence = { log() {}, warn() {}, error() {} };
const dossier = mkdtempSync(path.join(tmpdir(), "gk-canal-"));

// Une instance de test avec la version donnée.
async function instance(build, nom) {
  const dbFile = path.join(dossier, nom, "notes.db");
  const origLog = console.log;
  console.log = () => {};
  const db = openDatabase(dbFile, build);
  console.log = origLog;
  db.prepare("INSERT INTO users (name, email, password_hash, created_at, is_admin) VALUES ('A', 'a@test', 'x', ?, 1)")
    .run(new Date().toISOString());
  const app = express();
  app.use(express.json());
  const auth = (req, _res, next) => { req.user = { id: 1, is_admin: 1 }; next(); };
  const adminOnly = (_req, _res, next) => next();
  const updateChannel = createUpdateChannel({ db, build, log: silence });
  attachUpdateRoutes(app, { db, auth, adminOnly, updateChannel, build, log: silence });
  attachSelfUpdateRoutes(app, { auth, adminOnly, updateChannel, build, log: silence });
  attachUpdateChannelRoutes(app, { db, dbFile, auth, adminOnly, updateChannel, build, log: silence });
  const server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, p, body) => {
    const res = await fetch(base + p, {
      method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  return { db, dbFile, call, close: () => { server.close(); db.close(); } };
}

const SHA1 = "1111111111111111111111111111111111111111";
const SHA2 = "2222222222222222222222222222222222222222";
const stable = { version: "2.7.0", label: "2.7.0", commit: SHA1, beta: false, dbCompat: 1 };
const beta = { version: "2.8.0-beta", label: "2.8.0-beta+1111111", commit: SHA1, beta: true, dbCompat: 2 };

try {
  // ── Sur une version stable ──────────────────────────────────────────
  const s = await instance(stable, "stable");
  gh.release = "2.7.0";
  gh.beta = { sha: SHA2, version: "2.8.0-beta", dbCompat: 1 };
  let check = await s.call("GET", "/update-check");
  t.check("par défaut, le canal est stable et une bêta publiée n'est pas proposée",
    check.json.channel === "stable" && !check.json.updateAvailable && check.json.currentVersion === "2.7.0",
    JSON.stringify(check.json));

  gh.release = "2.7.1";
  check = await s.call("GET", "/update-check");
  t.check("une version stable plus récente est proposée comme avant",
    check.json.updateAvailable && check.json.latestVersion === "2.7.1" && check.json.targetKind === "release");

  let refus = await s.call("POST", "/admin/self-update/start", { latestVersion: "2.8.0" });
  t.check("le serveur refuse d'installer une autre version que celle qu'il propose",
    refus.status === 400 && refus.json.offered === "2.7.1" && installs.length === 0, JSON.stringify(refus.json));
  const lance = await s.call("POST", "/admin/self-update/start", { latestVersion: "v2.7.1" });
  t.check("il installe celle qu'il propose",
    lance.status === 200 && installs.at(-1)?.target?.version === "2.7.1" && installs.at(-1).target.commit === null,
    JSON.stringify(installs.at(-1)));

  gh.release = "2.7.0";
  let info = await s.call("GET", "/admin/update-channel");
  t.check("le panneau voit le canal, la version installée et le niveau de format de la base",
    info.json.channel === "stable" && info.json.build.label === "2.7.0" && !info.json.build.beta
      && info.json.dbLevel === 1 && info.json.preBetaBackup === null && info.json.oneClick.available,
    JSON.stringify(info.json));

  installs.length = 0;
  let entree = await s.call("POST", "/admin/update-channel", { channel: "beta" });
  const sauvegarde = safety.readPreBetaBackup(s.dbFile);
  t.check("entrer en bêta sauvegarde d'abord la base",
    !!sauvegarde && sauvegarde.version === "2.7.0" && existsSync(path.join(safety.backupsDir(s.dbFile), "before-beta.db")),
    JSON.stringify(sauvegarde));
  t.check("puis installe la bêta validée, désignée par son commit",
    entree.json.started && installs.at(-1)?.target?.kind === "beta" && installs.at(-1).target.commit === SHA2
      && installs.at(-1).target.label === "2.8.0-beta+2222222", JSON.stringify(entree.json));

  check = await s.call("GET", "/update-check");
  t.check("en bêta, la mise à jour proposée est la bêta, étiquetée avec son commit",
    check.json.channel === "beta" && check.json.latestVersion === "2.8.0-beta+2222222" && check.json.targetKind === "beta");

  gh.release = "2.8.0";
  check = await s.call("GET", "/update-check");
  t.check("une version stable plus récente que la bêta passe devant elle",
    check.json.latestVersion === "2.8.0" && check.json.targetKind === "release", check.json.latestVersion);
  gh.release = "2.7.0";
  gh.beta = null;
  check = await s.call("GET", "/update-check");
  t.check("sans bêta validée, seule une version stable peut être proposée", !check.json.updateAvailable);

  const quitter = await s.call("POST", "/admin/update-channel", { channel: "stable" });
  t.check("depuis une version stable, revenir au canal stable ne fait que changer le réglage",
    quitter.json.channel === "stable" && !quitter.json.started
      && (await s.call("GET", "/update-check")).json.channel === "stable");

  clicDisponible = false;
  gh.beta = { sha: SHA2, version: "2.8.0-beta", dbCompat: 1 };
  installs.length = 0;
  entree = await s.call("POST", "/admin/update-channel", { channel: "beta" });
  t.check("sans mise à jour en un clic, le canal change mais rien n'est installé, et le panneau sait pourquoi",
    entree.json.channel === "beta" && !entree.json.started && entree.json.reason === "docker-socket-missing"
      && installs.length === 0, JSON.stringify(entree.json));
  clicDisponible = true;
  s.close();

  // ── Sur une bêta ───────────────────────────────────────────────────
  const b = await instance(beta, "beta");
  gh.release = "2.7.0";
  gh.releaseCompat = 1;
  gh.beta = { sha: SHA1, version: "2.8.0-beta", dbCompat: 2 };
  await b.call("POST", "/admin/update-channel", { channel: "beta" });
  check = await b.call("GET", "/update-check");
  t.check("la bêta installée n'est pas reproposée", !check.json.updateAvailable, JSON.stringify(check.json));
  gh.beta = { sha: SHA2, version: "2.8.0-beta", dbCompat: 2 };
  check = await b.call("GET", "/update-check");
  t.check("un nouvel envoi de la même bêta est proposé", check.json.latestVersion === "2.8.0-beta+2222222");

  info = await b.call("GET", "/admin/update-channel");
  t.check("le panneau sait que la version stable ne lit pas les données de cette bêta",
    info.json.build.beta && info.json.dbLevel === 2 && info.json.stable.version === "2.7.0"
      && info.json.stable.readsThisDatabase === false, JSON.stringify(info.json));

  installs.length = 0;
  let r = await b.call("POST", "/admin/update-channel", { channel: "stable", action: "now" });
  t.check("revenir tout de suite est refusé quand la version stable ne lit pas ces données",
    r.status === 409 && r.json.error === "incompatible" && installs.length === 0
      && (await b.call("GET", "/admin/update-channel")).json.channel === "beta", JSON.stringify(r.json));

  r = await b.call("POST", "/admin/update-channel", { channel: "stable", action: "restore" });
  t.check("restaurer est refusé sans sauvegarde d'avant la bêta",
    r.status === 409 && r.json.error === "no_backup" && installs.length === 0);

  r = await b.call("POST", "/admin/update-channel", { channel: "stable" });
  t.check("quitter une bêta demande comment", r.status === 400);

  safety.takePreBetaBackup(b.db, b.dbFile, stable);
  echecAuLancement = true;
  r = await b.call("POST", "/admin/update-channel", { channel: "stable", action: "restore" });
  echecAuLancement = false;
  t.check("si l'installation ne démarre pas, rien ne change: ni canal, ni demande de restauration",
    r.status === 500 && (await b.call("GET", "/admin/update-channel")).json.channel === "beta"
      && !existsSync(path.join(safety.backupsDir(b.dbFile), ".restore-request.json")), JSON.stringify(r.json));

  r = await b.call("POST", "/admin/update-channel", { channel: "stable", action: "restore" });
  t.check("restaurer installe la version stable et demande la restauration à cette version-là",
    r.json.started && installs.at(-1)?.target?.version === "2.7.0" && installs.at(-1).target.kind === "release"
      && existsSync(path.join(safety.backupsDir(b.dbFile), ".restore-request.json"))
      && (await b.call("GET", "/admin/update-channel")).json.channel === "stable", JSON.stringify(r.json));
  safety.cancelRestore(b.dbFile);

  await b.call("POST", "/admin/update-channel", { channel: "beta" });
  t.check("revenir en bêta depuis une bêta garde la sauvegarde d'avant la bêta",
    safety.readPreBetaBackup(b.dbFile)?.version === "2.7.0");
  r = await b.call("POST", "/admin/update-channel", { channel: "stable", action: "wait" });
  check = await b.call("GET", "/update-check");
  t.check("attendre passe au canal stable sans rien installer, et rien n'est proposé avant une stable plus récente",
    r.json.channel === "stable" && !r.json.started && !check.json.updateAvailable, JSON.stringify(check.json));
  gh.release = "2.8.0";
  gh.releaseCompat = 2;
  check = await b.call("GET", "/update-check");
  t.check("la stable qui suit la bêta est ensuite proposée comme une mise à jour ordinaire",
    check.json.updateAvailable && check.json.latestVersion === "2.8.0");
  b.db.pragma("user_version = 2");
  await b.call("POST", "/admin/update-channel", { channel: "beta" });
  installs.length = 0;
  r = await b.call("POST", "/admin/update-channel", { channel: "stable", action: "now" });
  t.check("revenir tout de suite installe la version stable quand elle lit ces données",
    r.json.started && installs.at(-1)?.target?.version === "2.8.0", JSON.stringify(r.json));
  b.close();
} finally {
  github.close();
  rmSync(dossier, { recursive: true, force: true });
}

process.exit(t.summary() ? 0 : 1);
