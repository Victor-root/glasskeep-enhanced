// Les numéros de version du canal bêta.
//
// Une bêta porte une pré-version (2.8.0-beta) et plusieurs envois sur la
// branche bêta gardent le même numéro: seul le commit les distingue. Les
// règles vérifiées ici: l'ordre des versions (2.8.0-beta < 2.8.0-beta.2 <
// 2.8.0), et l'étiquette qui ajoute le commit à une bêta seulement.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runner } from "../federation/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const { compareVersions, isStrictlyNewer, isPrerelease } = require(path.join(ROOT, "server", "services", "semver.js"));
const { buildLabel, dbCompatOf } = require(path.join(ROOT, "server", "services", "buildInfo.js"));
const t = runner("Les numéros de version du canal bêta");

const ordre = ["2.7.0", "2.8.0-alpha", "2.8.0-beta", "2.8.0-beta.2", "2.8.0-beta.10", "2.8.0-rc.1", "2.8.0", "2.8.1", "10.0.0"];
const trie = [...ordre].reverse().sort((a, b) => compareVersions(a, b));
t.check("les versions se rangent comme le veut semver, pré-versions comprises",
  trie.join(" ") === ordre.join(" "), trie.join(" "));
t.check("une version stable passe devant la bêta du même numéro",
  isStrictlyNewer("2.8.0", "2.8.0-beta") && !isStrictlyNewer("2.8.0-beta", "2.8.0"));
t.check("une bêta d'une version suivante passe devant la stable actuelle",
  isStrictlyNewer("2.8.0-beta", "2.7.0"));
t.check("le v devant et les métadonnées de build ne comptent pas",
  compareVersions("v2.8.0-beta+abc1234", "2.8.0-beta") === 0 && !isStrictlyNewer("2.7.0", "v2.7.0"));
t.check("ce qui n'est pas une version n'est jamais plus récent",
  compareVersions("main", "2.7.0") === null && !isStrictlyNewer("3.0", "2.7.0") && !isStrictlyNewer("", "2.7.0"));
t.check("une pré-version est reconnue comme telle",
  isPrerelease("2.8.0-beta") && isPrerelease("v2.8.0-beta.3") && !isPrerelease("2.8.0") && !isPrerelease("x"));

const commit = "0123456789abcdef0123456789abcdef01234567";
t.check("une bêta est étiquetée avec son commit, une stable non",
  buildLabel("2.8.0-beta", commit) === "2.8.0-beta+0123456" && buildLabel("2.8.0", commit) === "2.8.0"
    && buildLabel("2.8.0-beta", null) === "2.8.0-beta");
t.check("le niveau de format de la base vaut 1 pour une version qui ne le déclare pas",
  dbCompatOf({}) === 1 && dbCompatOf({ glasskeep: { dbCompat: 3 } }) === 3 && dbCompatOf({ glasskeep: { dbCompat: "x" } }) === 1);

process.exit(t.summary() ? 0 : 1);
