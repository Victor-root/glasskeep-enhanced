// Crochet de résolution de modules, pour les tests qui importent du code
// d'interface tel quel.
//
// Vite résout `../i18n` en `../i18n/index.js` et `./Foo` en `./Foo.jsx`.
// Node, lui, exige le chemin complet. Sans ce crochet, importer un
// module de `src/` dans un test échoue sur la première importation de ce
// genre, et il faudrait recopier le code testé, ce qui ne testerait
// plus rien.
//
// Le crochet ne fait que ça: quand Node ne trouve pas, il essaie les
// mêmes extensions et le même `index` que le bundler. Il ne réécrit
// aucun chemin qui se résout déjà.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CANDIDATE_SUFFIXES = ["", ".js", ".jsx", ".mjs", "/index.js", "/index.jsx"];

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    const recoverable = error?.code === "ERR_UNSUPPORTED_DIR_IMPORT"
      || error?.code === "ERR_MODULE_NOT_FOUND";
    if (!recoverable || !specifier.startsWith(".")) throw error;

    const from = context.parentURL
      ? path.dirname(fileURLToPath(context.parentURL))
      : process.cwd();
    for (const suffix of CANDIDATE_SUFFIXES) {
      const full = path.resolve(from, specifier + suffix);
      if (existsSync(full) && statSync(full).isFile()) {
        return { url: pathToFileURL(full).href, shortCircuit: true };
      }
    }
    throw error;
  }
}
