// Le test de retour en arrière, joué avant chaque publication d'une bêta
// (.github/workflows/beta.yml): une bêta remplit une base, la dernière
// version stable la rouvre, puis la bêta à nouveau.
//
// Usage: node test/rollback/rollback.mjs <dossier de la version stable>
// Le dossier est une copie de GlassKeep à la dernière version publiée,
// dépendances installées (npm ci). La bêta est la copie où vit ce fichier.
//
// Ce qui est vérifié, quand la bêta déclare le même niveau de format de
// base que la version stable (glasskeep.dbCompat dans package.json):
//   - la version stable démarre sur la base de la bêta et rend chaque
//     note telle que la bêta l'a enregistrée: texte riche, liste avec
//     sections, retraits et cases cochées, étiquettes, couleur,
//     épinglage, images, icône, archive, corbeille, rappel, partage,
//     réglages du compte;
//   - ce qu'elle y modifie et crée se retrouve ensuite dans la bêta;
//   - la base de la bêta garde toutes les tables et colonnes qu'une base
//     neuve de la version stable possède, avec le même type;
//   - le cache du navigateur garde un format que la version stable sait
//     ouvrir.
// Quand la bêta déclare un niveau supérieur, le retour en arrière est
// annoncé comme impossible: on vérifie seulement que la version stable
// refuse la base proprement au lieu de l'abîmer.
import path from "node:path";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { startInstance, createAndLogin, runner, ROOT } from "../functional/lab.mjs";

const require = createRequire(import.meta.url);
const Database = require(path.join(ROOT, "node_modules", "better-sqlite3"));
const { dbCompatOf } = require(path.join(ROOT, "server", "services", "buildInfo.js"));

const stableRoot = path.resolve(process.argv[2] || "");
if (!process.argv[2]) {
  console.error("usage: node test/rollback/rollback.mjs <dossier de la version stable>");
  process.exit(2);
}
const manifest = (root) => JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const beta = manifest(ROOT);
const stable = manifest(stableRoot);
const t = runner(`Retour en arrière de ${beta.version} vers ${stable.version}`);
const j = (v) => JSON.stringify(v);

// ── Le format déclaré ────────────────────────────────────────────────
const niveauBeta = dbCompatOf(beta);
const niveauStable = dbCompatOf(stable);
const dossier = mkdtempSync(path.join(tmpdir(), "gk-retour-"));
const dbFile = path.join(dossier, "notes.db");

if (niveauBeta > niveauStable) {
  console.log(`La bêta déclare le format ${niveauBeta}, la version stable lit jusqu'au ${niveauStable}:`);
  console.log("le retour en arrière passera par la sauvegarde d'avant la bêta.");
  let demarree = null;
  try {
    const b = await startInstance({ port: 9541, dbFile });
    b.stop();
    demarree = await startInstance({ port: 9542, dbFile, root: stableRoot });
  } catch (e) {
    t.check("la version stable refuse la base de la bêta au lieu de l'abîmer",
      /newer GlassKeep/.test(e.message), e.message.slice(-300));
  }
  if (demarree) {
    demarree.stop();
    // Une version publiée avant ce contrôle ne sait pas refuser: rien à
    // vérifier de plus, le panneau propose déjà la sauvegarde.
    console.log("(la version stable précède le contrôle du format et ne peut pas refuser)");
  }
  rmSync(dossier, { recursive: true, force: true });
  process.exit(t.summary() ? 0 : 1);
}

// ── Le cache du navigateur ───────────────────────────────────────────
const versionCache = (root) => Number(readFileSync(path.join(root, "src", "sync", "localDb.js"), "utf8")
  .match(/const DB_VERSION = (\d+)/)?.[1]);
t.check("le cache du navigateur garde un format que la version stable sait ouvrir",
  versionCache(ROOT) <= versionCache(stableRoot),
  `bêta ${versionCache(ROOT)}, stable ${versionCache(stableRoot)}: au-delà, l'application stable ne peut plus ouvrir le cache`);

// ── Ce que la bêta enregistre ────────────────────────────────────────
const iso = () => new Date().toISOString();
const IMAGE = { id: "img-1", src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==", name: "pixel.png" };
const ICONE = { id: "L1", src: "data:image/png;base64,AA", name: "logo.png" };
const RICHE = JSON.stringify({
  v: 1, format: "tiptap",
  doc: { type: "doc", content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Titre" }] },
    { type: "paragraph", content: [{ type: "text", text: "gras", marks: [{ type: "bold" }] }] },
  ] },
});
const LISTE = [
  { id: "i1", text: "Pain", done: false, indent: 0 },
  { id: "i2", text: "complet", done: true, indent: 1 },
  { id: "sec", kind: "section", title: "Frais", color: "green", collapsed: true },
  { id: "i3", text: "Lait", done: true, indent: 0 },
  { id: "i4", text: "Beurre", done: false, indent: 0 },
];
const DANS_UNE_SEMAINE = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
const COMPARES = ["type", "title", "content", "items", "images", "color", "pinned", "reminderAt"];

// Ce qu'un compte voit, par note et par endroit.
async function releve(inst, compte) {
  const vue = { notes: {}, ou: {} };
  for (const [ou, p] of [["actives", "/api/notes"], ["archivees", "/api/notes/archived"], ["corbeille", "/api/notes/trashed"]]) {
    const r = await inst.call("GET", p, { token: compte.token });
    for (const n of r.json || []) {
      vue.ou[n.id] = ou;
      vue.notes[n.id] = {
        ...Object.fromEntries(COMPARES.map((k) => [k, n[k] ?? null])),
        tags: [...(n.tags || [])].sort(),
        icon: n.icon ?? n.logo ?? null,
      };
    }
  }
  vue.reglages = (await inst.call("GET", "/api/user/settings", { token: compte.token })).json;
  return vue;
}

const connecter = async (inst, compte) => {
  const r = await inst.call("POST", "/api/login", { body: { email: compte.email, password: compte.password } });
  return { ...compte, token: r.json?.token };
};

// Ouverte en écriture: une base arrêtée net garde ses dernières écritures
// dans son journal, qu'une connexion en lecture seule ne sait pas relire.
function schema(fichier) {
  const db = new Database(fichier);
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
    return Object.fromEntries(tables.map(({ name }) => [name,
      Object.fromEntries(db.prepare(`PRAGMA table_info("${name}")`).all().map((c) => [c.name, `${c.type} ${c.notnull ? "NOT NULL" : ""}`.trim()]))]));
  } finally {
    db.close();
  }
}

try {
  // 1. La bêta remplit la base.
  const b1 = await startInstance({ port: 9541, dbFile });
  let alice = await createAndLogin(b1, { name: "Alice", email: "alice@retour.test", password: "Passw0rd-alice", isAdmin: true });
  let bob = await createAndLogin(b1, { name: "Bob", email: "bob@retour.test", password: "Passw0rd-bob" });
  const creer = (compte, body) => b1.call("POST", "/api/notes", { token: compte.token, body: { client_updated_at: iso(), ...body } });
  await creer(alice, { id: "riche", type: "text", title: "Texte riche", content: RICHE, color: "blue", tags: ["maison", "travail"], images: [IMAGE] });
  await b1.call("PATCH", "/api/notes/riche", { token: alice.token, body: { pinned: true, client_updated_at: iso() } });
  await creer(alice, { id: "liste", type: "checklist", title: "Courses", items: LISTE, color: "green" });
  await creer(alice, { id: "archivee", type: "text", title: "Archivée", content: "a" });
  await b1.call("POST", "/api/notes/archivee/archive", { token: alice.token, body: { archived: true, client_updated_at: iso() } });
  await creer(alice, { id: "jetee", type: "text", title: "À la corbeille", content: "c" });
  await b1.call("POST", "/api/notes/jetee/trash", { token: alice.token, body: { client_updated_at: iso() } });
  await creer(alice, { id: "rappel", type: "text", title: "Rappel", content: "r" });
  await b1.call("POST", "/api/notes/rappel/reminder", { token: alice.token, body: { reminderAt: DANS_UNE_SEMAINE, client_updated_at: iso() } });
  await creer(alice, { id: "icone", type: "text", title: "Avec icône", content: "i" });
  await b1.call("PUT", "/api/notes/icone/icon", { token: alice.token, body: { icon: ICONE } });
  await creer(alice, { id: "partagee", type: "text", title: "Partagée", content: "p" });
  await b1.call("POST", "/api/notes/partagee/collaborate", { token: alice.token, body: { username: bob.email, access: "write" } });
  await creer(bob, { id: "de-bob", type: "text", title: "Note de Bob", content: "b" });
  await b1.call("PATCH", "/api/user/settings", { token: alice.token, body: { theme: "sombre", retour: "test" } });
  const avant = { alice: await releve(b1, alice), bob: await releve(b1, bob) };
  b1.stop();
  // Relevée avant que la version stable n'ouvre la base: ses propres
  // migrations rajouteraient ce que la bêta aurait enlevé.
  const structureBeta = schema(dbFile);
  t.check("la bêta a bien tout enregistré",
    Object.keys(avant.alice.notes).length === 7 && avant.alice.ou.archivee === "archivees"
      && avant.alice.ou.jetee === "corbeille" && !!avant.bob.notes.partagee, j(avant.alice.ou));

  // 2. La version stable rouvre la même base.
  const s = await startInstance({ port: 9542, dbFile, root: stableRoot });
  alice = await connecter(s, alice);
  bob = await connecter(s, bob);
  const enStable = { alice: await releve(s, alice), bob: await releve(s, bob) };
  for (const [nom, vue] of Object.entries(avant)) {
    for (const [id, note] of Object.entries(vue.notes)) {
      t.check(`stable: la note « ${id} » de ${nom} est rendue telle que la bêta l'a enregistrée`,
        j(enStable[nom].notes[id]) === j(note) && enStable[nom].ou[id] === vue.ou[id],
        `bêta ${j(note)} / stable ${j(enStable[nom].notes[id])}`);
    }
  }
  t.check("stable: les réglages du compte sont les mêmes", j(enStable.alice.reglages) === j(avant.alice.reglages),
    `${j(avant.alice.reglages)} / ${j(enStable.alice.reglages)}`);

  // Ce que la version stable modifie et crée.
  const LISTE_STABLE = LISTE.map((it) => (it.id === "i4" ? { ...it, done: true } : it));
  await s.call("PATCH", "/api/notes/riche", { token: alice.token, body: { title: "Modifiée en stable", client_updated_at: iso() } });
  await s.call("PATCH", "/api/notes/liste", { token: alice.token, body: { items: LISTE_STABLE, client_updated_at: iso() } });
  await s.call("POST", "/api/notes", { token: alice.token, body: { id: "en-stable", type: "text", title: "Créée en stable", content: "s", client_updated_at: iso() } });
  await s.call("PATCH", "/api/notes/partagee", { token: bob.token, body: { content: "modifiée par Bob en stable", client_updated_at: iso() } });
  s.stop();

  // 3. La bêta rouvre la base.
  const b2 = await startInstance({ port: 9543, dbFile });
  alice = await connecter(b2, alice);
  bob = await connecter(b2, bob);
  const apres = { alice: await releve(b2, alice), bob: await releve(b2, bob) };
  b2.stop();
  t.check("bêta: ce que la version stable a modifié est là",
    apres.alice.notes.riche?.title === "Modifiée en stable" && j(apres.alice.notes.liste?.items) === j(LISTE_STABLE)
      && apres.alice.notes.partagee?.content === "modifiée par Bob en stable", j(apres.alice.notes.liste?.items));
  t.check("bêta: ce que la version stable a créé est là", apres.alice.notes["en-stable"]?.title === "Créée en stable");
  for (const id of ["archivee", "jetee", "rappel", "icone"]) {
    t.check(`bêta: la note « ${id} » n'a pas bougé`,
      j(apres.alice.notes[id]) === j(avant.alice.notes[id]) && apres.alice.ou[id] === avant.alice.ou[id]);
  }

  // 4. La structure: rien de ce qu'une base stable neuve possède ne manque.
  const neuveFile = path.join(dossier, "neuve-stable.db");
  (await startInstance({ port: 9544, dbFile: neuveFile, root: stableRoot })).stop();
  const attendu = schema(neuveFile);
  const obtenu = structureBeta;
  const manques = [];
  for (const [table, colonnes] of Object.entries(attendu)) {
    for (const [col, type] of Object.entries(colonnes)) {
      if (!obtenu[table]) manques.push(`table ${table}`);
      else if (obtenu[table][col] !== type) manques.push(`${table}.${col} (${type} attendu, ${obtenu[table][col] || "absent"})`);
    }
  }
  t.check("la base de la bêta garde toutes les tables et colonnes de la version stable, avec le même type",
    manques.length === 0, [...new Set(manques)].join(", "));
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

process.exit(t.summary() ? 0 : 1);
