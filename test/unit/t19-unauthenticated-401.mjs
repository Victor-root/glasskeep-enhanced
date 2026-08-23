// Un 401 sur une route sans jeton ne doit pas détruire la session.
//
// TROUVÉ EN CONDITIONS RÉELLES, pas par l'audit. En tapant une mauvaise
// phrase de passe sur l'écran de déverrouillage, le message rouge
// annonçait « Session expirée. Veuillez vous reconnecter. » Le message
// était faux, et il disait la vérité sur autre chose: le client venait
// bel et bien de détruire la session.
//
// La cause: le client traitait tout 401 comme « ton jeton n'est plus
// bon », effaçait les identifiants enregistrés et prévenait
// l'application. Or plusieurs routes répondent 401 pour dire tout autre
// chose, et elles sont toutes appelées SANS jeton: le déverrouillage
// (mauvaise phrase de passe), la clé de secours, la connexion (mauvais
// mot de passe). Se tromper de phrase de passe déconnectait donc d'une
// session parfaitement valide.
//
// La règle vérifiée ici: on ne démonte la session que si on avait
// présenté un jeton.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire, register } from "node:module";
import { runner } from "../federation/lib.mjs";

// Le code d'interface s'importe comme le bundler le résout, pas comme
// Node le ferait tout seul. Voir resolve-like-vite.mjs.
register("./resolve-like-vite.mjs", import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const t = runner("Un 401 sans jeton ne déconnecte pas");

// Un navigateur minimal: le module client a besoin de localStorage, de
// window et de fetch, rien de plus.
const { JSDOM } = require(path.join(ROOT, "node_modules", "jsdom", "lib", "api.js"));
const dom = new JSDOM("", { url: "https://glasskeep.test/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.CustomEvent = dom.window.CustomEvent;

let lastRequest = null;
function respondWith(status, body) {
  globalThis.fetch = async (url, options) => {
    lastRequest = { url, options };
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: new Map(),
      json: async () => body,
    };
  };
}

const { api, AUTH_KEY } = await import(path.join(ROOT, "src", "utils", "api.js"));

function freshSession() {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ token: "jeton-valide", user: { id: 1 } }));
}
function sessionStillThere() {
  return localStorage.getItem(AUTH_KEY) !== null;
}
function listenForExpiry() {
  const seen = { fired: false };
  window.addEventListener("auth-expired", () => { seen.fired = true; }, { once: true });
  return seen;
}
async function expectThrow(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}

// ── Le cas trouvé: mauvaise phrase de passe sur l'écran verrouillé ──
{
  freshSession();
  const expiry = listenForExpiry();
  respondWith(401, { error: "Invalid passphrase" });
  const err = await expectThrow(() =>
    api("/instance/unlock", { method: "POST", body: { passphrase: "mauvaise" } }));

  t.check("une mauvaise phrase de passe ne détruit pas la session", sessionStillThere());
  t.check("et ne déclenche pas la déconnexion générale", expiry.fired === false);
  t.check("et le message dit la vérité, pas « session expirée »",
          err?.message === "Invalid passphrase", err?.message);
}

// ── Même chose pour la clé de secours et pour la connexion ──────────
for (const [nom, chemin, message] of [
  ["clé de secours", "/instance/unlock-recovery", "Invalid recovery key"],
  ["connexion", "/login", "Invalid email or password."],
]) {
  freshSession();
  const expiry = listenForExpiry();
  respondWith(401, { error: message });
  const err = await expectThrow(() => api(chemin, { method: "POST", body: {} }));
  t.check(`${nom}: la session survit à un refus`, sessionStillThere() && !expiry.fired);
  t.check(`${nom}: le message est celui du serveur`, err?.message === message, err?.message);
}

// ── Ce qui doit continuer de déconnecter: un vrai jeton refusé ──────
{
  freshSession();
  const expiry = listenForExpiry();
  respondWith(401, { error: "Invalid token" });
  const err = await expectThrow(() => api("/notes", { token: "jeton-perime" }));

  t.check("un jeton refusé détruit bien la session", !sessionStillThere());
  t.check("et prévient l'application", expiry.fired === true);
  t.check("le message reste celui du serveur", err?.message === "Invalid token", err?.message);
  t.check("la requête portait bien le jeton",
          !!lastRequest?.options?.headers?.Authorization);
}

// ── Un 401 sans corps, avec jeton: le repli garde son sens ──────────
{
  freshSession();
  respondWith(401, null);
  const err = await expectThrow(() => api("/notes", { token: "jeton-perime" }));
  t.check("sans corps et avec jeton, on parle bien de session expirée",
          /expir/i.test(err?.message || ""), err?.message);
  t.check("et la session est démontée", !sessionStillThere());
}

// ── Un 401 sans corps, sans jeton: surtout pas « session expirée » ──
//
// Trouvé après coup, sur une instance réelle: la raison du serveur
// n'arrivait pas jusqu'au navigateur, et le client la remplaçait par
// « une erreur est survenue ». Une phrase générique n'est jamais la
// vérité sur un 401, et elle masquait le repli de l'écran appelant, qui
// sait, lui, ce qu'il vient d'envoyer. On n'invente donc plus rien.
{
  freshSession();
  respondWith(401, null);
  const err = await expectThrow(() => api("/instance/unlock", { method: "POST", body: {} }));
  t.check("sans corps et sans jeton, on ne parle pas de session expirée",
          !/expir/i.test(err?.message || ""), err?.message);
  t.check("et on n'invente aucune phrase générique", err?.message === "", err?.message);
  t.check("le code reste lisible par l'appelant", err?.status === 401);
  t.check("et la session survit", sessionStillThere());
}

// ── L'écran appelant sait dire la vraie raison sans le corps ────────
{
  const { localizeSecretRejection } = await import(
    path.join(ROOT, "src", "utils", "serverErrors.js"));
  const { t: tr } = await import(path.join(ROOT, "src", "i18n", "index.js"));
  const muet = { status: 401, message: "" };

  t.check("un 401 muet sur le déverrouillage parle de la phrase de passe",
          localizeSecretRejection(muet, "errInvalidPassphrase", "unlockFailed")
            === tr("errInvalidPassphrase"));
  t.check("le même 401 muet sur la clé de secours parle de la clé",
          localizeSecretRejection(muet, "errInvalidRecoveryKey", "unlockFailed")
            === tr("errInvalidRecoveryKey"));
  t.check("le même 401 muet sur la connexion parle des identifiants",
          localizeSecretRejection(muet, "errInvalidCredentials", "loginFailed")
            === tr("errInvalidCredentials"));
  t.check("quand le serveur dit sa raison, c'est elle qui l'emporte",
          localizeSecretRejection({ status: 401, message: "Too many unlock attempts. Try again later." },
                                  "errInvalidPassphrase", "unlockFailed")
            === tr("errTooManyUnlock"));
  t.check("une panne sans code 401 garde le repli de l'écran",
          localizeSecretRejection({ status: 0, message: "" }, "errInvalidPassphrase", "unlockFailed")
            === tr("unlockFailed"));
  t.check("et aucune de ces phrases n'est le message générique",
          tr("errInvalidPassphrase") !== tr("genericError"));
}

process.exit(t.summary() ? 0 : 1);
