// La lecture d'une sauvegarde ZIP dans le navigateur: chaque fichier se
// relit à l'identique, qu'il soit stocké tel quel ou compressé, dans une
// archive classique ou au format ZIP64 des archives de plus de 4 Go, et
// ce qui n'est pas une archive est reconnu comme tel.
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { runner } from "../federation/lib.mjs";
import { isZip, readZipEntries, zipEntryBlob } from "../../src/utils/zipReader.js";

const require = createRequire(import.meta.url);
const yazl = require("yazl");
const t = runner("Lecture des sauvegardes ZIP");

function archive(build, endOptions = {}) {
  const zip = new yazl.ZipFile();
  build(zip);
  zip.end(endOptions);
  return new Promise((resolve, reject) => {
    const chunks = [];
    zip.outputStream.on("data", (c) => chunks.push(c));
    zip.outputStream.on("end", () => resolve(new Blob([Buffer.concat(chunks)])));
    zip.outputStream.on("error", reject);
  });
}

const relire = async (file, entry) => Buffer.from(await (await zipEntryBlob(file, entry)).arrayBuffer());

const notes = Buffer.from(JSON.stringify({ app: "glass-keep", notes: [{ id: "n1" }] }));
const binaire = crypto.randomBytes(300 * 1024);
const texte = Buffer.from("ligne répétée\n".repeat(5000));
const nomAccentue = "attachments/n1/a1/Compte rendu été.pdf";

for (const [titre, options, fin] of [
  ["classique", {}, {}],
  ["ZIP64", { forceZip64Format: true }, { forceZip64Format: true }],
  ["avec un commentaire", {}, { comment: "sauvegarde du jour" }],
]) {
  const file = await archive((zip) => {
    zip.addBuffer(notes, "notes.json", { compress: false, ...options });
    zip.addBuffer(binaire, nomAccentue, { compress: false, ...options });
    zip.addBuffer(texte, "attachments/n1/a2/notes.txt", { compress: true, ...options });
    zip.addEmptyDirectory("vide/");
  }, fin);
  const entrees = await readZipEntries(file);
  t.check(`${titre}: l'archive est reconnue`, await isZip(file));
  t.check(`${titre}: les fichiers sont tous listés, sans les dossiers`, entrees.size === 3, [...entrees.keys()].join(", "));
  t.check(`${titre}: un nom accentué se lit tel quel`, entrees.has(nomAccentue));
  t.check(`${titre}: un fichier stocké se relit à l'identique`, binaire.equals(await relire(file, entrees.get(nomAccentue))));
  t.check(`${titre}: un fichier compressé aussi`, texte.equals(await relire(file, entrees.get("attachments/n1/a2/notes.txt"))));
  t.check(`${titre}: la taille annoncée est la vraie`, entrees.get(nomAccentue).size === binaire.length);
  t.check(`${titre}: le fichier des notes se relit`, JSON.parse((await relire(file, entrees.get("notes.json"))).toString()).notes[0].id === "n1");
}

const json = new Blob([notes]);
t.check("un fichier JSON n'est pas pris pour une archive", !(await isZip(json)));
let refus = null;
try { await readZipEntries(json); } catch (e) { refus = e; }
t.check("et sa lecture comme archive est refusée", !!refus);
t.check("un fichier vide n'est pas une archive", !(await isZip(new Blob([]))));

process.exit(t.summary() ? 0 : 1);
