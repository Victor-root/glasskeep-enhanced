// La base remise en état quand une mise à jour Docker échoue.
//
// La nouvelle version copie la base avant de la migrer. Si la mise à jour
// échoue ensuite, l'assistant Docker remet cette copie en place avant de
// relancer l'ancien conteneur, qui pourrait sinon refuser une base que la
// nouvelle version a convertie (self-update.sh fait de même en natif).
//
// Les règles vérifiées ici: seule la copie prise pendant cette mise à jour
// et nommée d'après la version remplacée est utilisée; sans elle, la base
// n'est pas touchée.
import path from "node:path";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runner } from "../federation/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const { restoreUpdateDatabase } = require(path.join(ROOT, "scripts", "lib", "updateDatabaseRestore.cjs"));
const t = runner("La base remise en état quand une mise à jour Docker échoue");

const dossier = mkdtempSync(path.join(tmpdir(), "gk-retour-docker-"));
const dbFile = path.join(dossier, "notes.db");
const backups = path.join(dossier, "backups");
const lire = (f) => readFileSync(f, "utf8");

try {
  mkdirSync(backups);
  // La mise à jour a commencé quelques secondes avant que la nouvelle
  // version ne copie la base.
  const debut = Date.now() - 5000;
  const ancienne = path.join(backups, "auto-2026-01-01-from-2.7.0.db");
  writeFileSync(ancienne, "copie d'une mise à jour précédente");
  const passe = new Date(debut - 3600 * 1000);
  utimesSync(ancienne, passe, passe);
  writeFileSync(path.join(backups, "auto-2026-10-22-from-2.6.0.db"), "copie d'une autre version");
  writeFileSync(path.join(backups, "auto-2026-10-22T10-00-00-from-2.7.0.db"), "base d'avant la mise à jour");
  writeFileSync(dbFile, "base convertie par la nouvelle version");
  writeFileSync(`${dbFile}-wal`, "journal");
  writeFileSync(`${dbFile}-shm`, "index du journal");

  let r = restoreUpdateDatabase({ dbFile, fromLabel: "2.7.0", since: debut });
  t.check("la copie prise pendant cette mise à jour, nommée d'après la version remplacée, est remise en place",
    r === "auto-2026-10-22T10-00-00-from-2.7.0.db" && lire(dbFile) === "base d'avant la mise à jour", String(r));
  t.check("le journal de la base convertie disparaît avec elle",
    !existsSync(`${dbFile}-wal`) && !existsSync(`${dbFile}-shm`) && !existsSync(`${dbFile}.rollback-tmp`));

  writeFileSync(dbFile, "base actuelle");
  r = restoreUpdateDatabase({ dbFile, fromLabel: "2.5.0", since: debut });
  t.check("sans copie au nom de la version remplacée, la base n'est pas touchée", r === null && lire(dbFile) === "base actuelle");
  r = restoreUpdateDatabase({ dbFile, fromLabel: "2.7.0", since: Date.now() + 60000 });
  t.check("une copie antérieure à la mise à jour n'est pas utilisée", r === null && lire(dbFile) === "base actuelle");
  r = restoreUpdateDatabase({ dbFile, fromLabel: "", since: debut });
  t.check("sans version remplacée connue, rien n'est touché", r === null && lire(dbFile) === "base actuelle");

  writeFileSync(path.join(backups, "auto-2026-10-22T12-00-00-from-2.8.0-beta+abc1234.db"), "avant la bêta suivante");
  r = restoreUpdateDatabase({ dbFile, fromLabel: "2.8.0-beta+abc1234", since: debut });
  t.check("une bêta remplacée est retrouvée par son étiquette, commit compris", r?.endsWith("-from-2.8.0-beta+abc1234.db")
    && lire(dbFile) === "avant la bêta suivante", String(r));
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

process.exit(t.summary() ? 0 : 1);
