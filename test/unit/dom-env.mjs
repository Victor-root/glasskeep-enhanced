// Un navigateur jsdom pour les tests qui font tourner l'éditeur de texte.
//
// Les extensions de l'éditeur, le rendu en mode lecture et le vrai
// éditeur Tiptap s'attendent à un navigateur. À importer avant eux, avec
// `await import(...)` pour ces derniers, puisque les importations
// statiques passent avant le code du test.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire, register } from "node:module";

register("./resolve-like-vite.mjs", import.meta.url);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { JSDOM } = require(path.join(ROOT, "node_modules", "jsdom", "lib", "api.js"));
const dom = new JSDOM("<div></div>", { url: "https://glasskeep.test/", pretendToBeVisual: true });

for (const name of [
  "window", "document", "localStorage", "navigator", "Node", "Element", "HTMLElement",
  "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "MutationObserver",
  "DOMParser", "ClipboardEvent", "KeyboardEvent",
]) {
  globalThis[name] ??= name === "window" ? dom.window : dom.window[name];
}
