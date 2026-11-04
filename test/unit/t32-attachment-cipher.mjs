// Le chiffrement des pièces jointes: un fichier se relit à l'identique
// quelle que soit sa taille et son découpage, et toute altération du
// fichier sur le disque est refusée, y compris une coupure nette entre
// deux blocs, celle qu'un chiffrement bloc par bloc laisse passer si on
// n'y prend pas garde.
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { runner } from "../federation/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { createEncryptStream, createDecryptStream } =
  require(path.join(HERE, "..", "..", "server", "attachments", "fileCipher.js"));
const t = runner("Chiffrement des pièces jointes");

const KEY = crypto.randomBytes(32);
const FRAME = 1024 * 1024;

async function through(stream, chunks) {
  const out = [];
  await pipeline(Readable.from(chunks), stream, new Writable({
    write(c, _e, done) { out.push(c); done(); },
  }));
  return Buffer.concat(out);
}
const seal = (buf, id = "f1", cut = 65536) => {
  const chunks = [];
  for (let i = 0; i < buf.length; i += cut) chunks.push(buf.subarray(i, i + cut));
  return through(createEncryptStream(KEY, id), chunks.length ? chunks : [Buffer.alloc(0)]);
};
const open = (buf, id = "f1", key = KEY, cut = 70001) => {
  const chunks = [];
  for (let i = 0; i < buf.length; i += cut) chunks.push(buf.subarray(i, i + cut));
  return through(createDecryptStream(key, id), chunks);
};
const refuse = async (nom, fn) => {
  let refuse = false;
  try { await fn(); } catch { refuse = true; }
  t.check(nom, refuse);
};

for (const [nom, taille] of [["vide", 0], ["un octet", 1], ["un bloc pile", FRAME], ["un bloc plus un octet", FRAME + 1], ["deux blocs et demi", FRAME * 2.5]]) {
  const clair = crypto.randomBytes(taille);
  const scelle = await seal(clair);
  t.check(`un fichier ${nom} se relit à l'identique`, clair.equals(await open(scelle)));
  t.check(`un fichier ${nom} n'apparaît pas en clair`, taille < 32 || !scelle.includes(clair.subarray(0, 32)));
}

const clair = crypto.randomBytes(FRAME * 2 + 500);
const scelle = await seal(clair);
const altere = Buffer.from(scelle);
altere[altere.length - 3] ^= 1;
await refuse("un octet changé est refusé", () => open(altere));
await refuse("une autre clé est refusée", () => open(scelle, "f1", crypto.randomBytes(32)));
await refuse("un fichier présenté sous un autre identifiant est refusé", () => open(scelle, "f2"));
await refuse("un fichier en clair n'est pas pris pour un fichier chiffré", () => open(clair));

const tailleBloc = 1 + 4 + 12 + 16 + FRAME;
const enTete = 6;
await refuse("une coupure nette après un bloc est refusée", () => open(scelle.subarray(0, enTete + tailleBloc)));
await refuse("une coupure au milieu d'un bloc est refusée", () => open(scelle.subarray(0, scelle.length - 10)));
const echange = Buffer.concat([
  scelle.subarray(0, enTete),
  scelle.subarray(enTete + tailleBloc, enTete + tailleBloc * 2),
  scelle.subarray(enTete, enTete + tailleBloc),
  scelle.subarray(enTete + tailleBloc * 2),
]);
await refuse("deux blocs échangés sont refusés", () => open(echange));

process.exit(t.summary() ? 0 : 1);
