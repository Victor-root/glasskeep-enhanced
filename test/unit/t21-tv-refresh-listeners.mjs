// L'écran TV n'empile pas ses écouteurs de retour au premier plan.
//
// TROUVÉ PENDANT LE REFACTOR: l'écran TV recharge les notes quand
// l'application revient au premier plan. L'écouteur correspondant était
// ajouté à chaque connexion, déconnexion ou changement de session, et
// jamais retiré, même en quittant le mode TV. Ils s'empilaient: un seul
// retour au premier plan relançait autant de chargements qu'il y avait
// eu de sessions, certains avec un jeton périmé.
//
// La règle vérifiée ici: un seul écouteur actif tant que l'écran TV est
// affiché, aucun une fois qu'il est fermé.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire, register } from "node:module";
import { runner } from "../federation/lib.mjs";

register("./resolve-like-vite.mjs", import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const t = runner("L'écran TV n'empile pas ses écouteurs de retour au premier plan");

const { JSDOM } = require(path.join(ROOT, "node_modules", "jsdom", "lib", "api.js"));
const dom = new JSDOM("<div id=root></div>", { url: "https://glasskeep.test/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.navigator ??= dom.window.navigator;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.fetch = async () => new Response(JSON.stringify({ notes: [] }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

// Compte les écouteurs de retour au premier plan encore branchés.
const live = { focus: new Set(), visibilitychange: new Set() };
for (const [target, type] of [[window, "focus"], [document, "visibilitychange"]]) {
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  target.addEventListener = (ty, fn, opts) => { if (ty === type) live[type].add(fn); add(ty, fn, opts); };
  target.removeEventListener = (ty, fn, opts) => { if (ty === type) live[type].delete(fn); remove(ty, fn, opts); };
}

const React = require(path.join(ROOT, "node_modules", "react"));
const { createRoot } = require(path.join(ROOT, "node_modules", "react-dom", "client"));
const { default: useTvNotes } = await import("../../src/components/tv/useTvNotes.js");

function Probe({ token, clearSession }) {
  useTvNotes(token, clearSession);
  return null;
}

const root = createRoot(document.getElementById("root"));
const render = (token) => React.act(async () => {
  root.render(React.createElement(Probe, { token, clearSession: () => {} }));
});

await render(undefined);
await render("jeton-1");
await render(null);
await render("jeton-2");
t.check("après deux connexions, un seul écouteur de focus",
        live.focus.size === 1, `${live.focus.size} branché(s)`);
t.check("après deux connexions, un seul écouteur de visibilité",
        live.visibilitychange.size === 1, `${live.visibilitychange.size} branché(s)`);

await React.act(async () => root.unmount());
t.check("l'écran TV fermé, plus aucun écouteur de focus",
        live.focus.size === 0, `${live.focus.size} branché(s)`);
t.check("l'écran TV fermé, plus aucun écouteur de visibilité",
        live.visibilitychange.size === 0, `${live.visibilitychange.size} branché(s)`);

process.exit(t.summary() ? 0 : 1);
