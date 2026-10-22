// La base de données face aux changements de version, canal bêta compris.
//
// Les règles vérifiées ici, sur de vraies bases SQLite:
//   - une copie est prise avant toute migration dès qu'une autre version
//     ouvre la base, les cinq dernières gardées, rien pour une base vide;
//   - une version refuse une base écrite dans un format plus récent que le
//     sien, sans y toucher;
//   - la sauvegarde d'avant la bêta n'est restaurée que par la version à
//     qui la demande s'adresse, et ce qu'elle remplace est copié d'abord.
import path from "node:path";
import { mkdtempSync, rmSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runner } from "../federation/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const Database = require(path.join(ROOT, "node_modules", "better-sqlite3"));
const { openDatabase } = require(path.join(ROOT, "server", "db", "schema.js"));
const safety = require(path.join(ROOT, "server", "db", "dbSafety.js"));
const t = runner("La base de données face aux changements de version");

const silence = { log() {}, warn() {}, error() {} };
const build = (version, dbCompat = 1, commit = "") => ({
  version, dbCompat, label: commit ? `${version}+${commit}` : version,
});
const dossier = mkdtempSync(path.join(tmpdir(), "gk-dbsafety-"));
const dbFile = path.join(dossier, "notes.db");
const backups = () => (existsSync(safety.backupsDir(dbFile)) ? readdirSync(safety.backupsDir(dbFile)) : []);
const autos = () => backups().filter((n) => n.startsWith("auto-")).sort();
const ouvrir = (b) => openDatabase(dbFile, b);
const ajouterUtilisateur = (db, email) => db.prepare(
  "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, 'x', ?)",
).run(email, email, new Date().toISOString());
const emails = (fichier) => {
  const db = new Database(fichier, { readonly: true });
  try { return db.prepare("SELECT email FROM users ORDER BY id").all().map((r) => r.email).join(","); } finally { db.close(); }
};

try {
  let db = ouvrir(build("2.7.0"));
  const neuf = autos().length;
  ajouterUtilisateur(db, "a@test");
  const niveau = db.pragma("user_version", { simple: true });
  db.close();
  t.check("une base neuve n'est pas sauvegardée et reçoit le niveau de format de la version",
    neuf === 0 && niveau === 1, `${neuf} ${niveau}`);

  db = ouvrir(build("2.7.0"));
  db.close();
  t.check("la même version qui rouvre la base ne refait pas de copie", autos().length === 0, autos().join());

  db = ouvrir(build("2.8.0-beta", 1, "abc1234"));
  ajouterUtilisateur(db, "b@test");
  db.close();
  const premiere = autos();
  t.check("une autre version qui ouvre la base en prend d'abord une copie, nommée d'après la précédente",
    premiere.length === 1 && premiere[0].endsWith("-from-2.7.0.db")
      && emails(path.join(safety.backupsDir(dbFile), premiere[0])) === "a@test", premiere.join());

  // Écritures encore dans le journal WAL au moment de la copie.
  db = new Database(dbFile);
  db.pragma("journal_mode = WAL");
  ajouterUtilisateur(db, "wal@test");
  const copie = path.join(dossier, "copie.db");
  db.prepare("VACUUM INTO ?").run(copie);
  db.close();
  t.check("la copie contient aussi ce qui n'est encore que dans le journal", emails(copie).includes("wal@test"));

  for (let i = 1; i <= 7; i++) ouvrir(build(`2.8.${i}`)).close();
  t.check("seules les cinq dernières copies automatiques sont gardées",
    autos().length === safety.KEEP_AUTO_BACKUPS && autos().at(-1).endsWith("-from-2.8.6.db"), autos().join("\n"));

  db = new Database(dbFile);
  db.pragma("user_version = 2");
  db.close();
  let refus = null;
  try { ouvrir(build("2.8.7", 1)); } catch (e) { refus = e; }
  const apres = new Database(dbFile, { readonly: true });
  const intacte = apres.pragma("user_version", { simple: true }) === 2
    && apres.prepare("SELECT value FROM app_meta WHERE key = 'last_build'").get().value === "2.8.7";
  apres.close();
  t.check("une version refuse une base d'un format plus récent que le sien, sans y toucher",
    refus instanceof safety.DatabaseTooNewError && intacte && /before-beta\.db/.test(refus.message), refus?.message);
  db = ouvrir(build("2.9.0-beta", 2, "def5678"));
  db.close();
  t.check("une version qui connaît ce format l'ouvre normalement", true);

  // Retour au stable en restaurant la sauvegarde d'avant la bêta.
  db = new Database(dbFile);
  db.prepare("DELETE FROM users").run();
  ajouterUtilisateur(db, "avant-beta@test");
  db.pragma("user_version = 1");
  safety.takePreBetaBackup(db, dbFile, build("2.8.7"));
  ajouterUtilisateur(db, "pendant-beta@test");
  db.pragma("user_version = 2");
  db.close();
  const meta = safety.readPreBetaBackup(dbFile);
  t.check("la sauvegarde d'avant la bêta est prise et décrite", meta?.version === "2.8.7" && !!meta.createdAt, JSON.stringify(meta));

  safety.requestRestore(dbFile, "2.8.7");
  const ignoree = safety.applyPendingRestore(dbFile, build("2.9.0-beta", 2, "def5678"), silence);
  t.check("une demande adressée à une autre version est abandonnée sans rien restaurer",
    !ignoree && emails(dbFile).includes("pendant-beta@test")
      && !backups().includes(".restore-request.json") && !!safety.readPreBetaBackup(dbFile));

  safety.requestRestore(dbFile, "2.8.7");
  writeFileSync(`${dbFile}-wal`, "journal périmé");
  const avantRestauration = autos().length;
  const faite = safety.applyPendingRestore(dbFile, build("2.8.7"), silence);
  const copieDeSecurite = autos().find((n) => n.endsWith("-before-restore.db"));
  t.check("la version visée restaure la sauvegarde d'avant la bêta",
    faite && emails(dbFile) === "avant-beta@test" && !existsSync(`${dbFile}-wal`), emails(dbFile));
  t.check("ce qui a été fait pendant la bêta est copié avant d'être remplacé",
    !!copieDeSecurite && emails(path.join(safety.backupsDir(dbFile), copieDeSecurite)).includes("pendant-beta@test")
      && autos().length <= Math.max(avantRestauration, safety.KEEP_AUTO_BACKUPS), copieDeSecurite);
  t.check("la sauvegarde utilisée et la demande disparaissent ensuite",
    !safety.readPreBetaBackup(dbFile) && !backups().includes(".restore-request.json"), backups().join());
  db = ouvrir(build("2.8.7"));
  const niveauRestaure = db.pragma("user_version", { simple: true });
  db.close();
  t.check("la base restaurée s'ouvre dans la version stable", niveauRestaure === 1, String(niveauRestaure));
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

process.exit(t.summary() ? 0 : 1);
