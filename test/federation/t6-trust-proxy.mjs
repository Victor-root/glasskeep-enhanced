// Scénario 6 — F-03. L'adresse retenue pour compter les essais de
// déverrouillage ne doit pas être choisie par le demandeur.
//
// Le limiteur du coffre compte les essais par adresse IP. Si le serveur fait
// confiance à tous les intermédiaires, cette adresse vient d'un en-tête que
// l'appelant écrit lui-même, et il suffit de la faire varier pour repartir de
// zéro à chaque tentative. Ce scénario active le chiffrement au repos,
// verrouille l'instance, puis martèle la page de déverrouillage en changeant
// l'en-tête à chaque coup.
//
// À LANCER avec une instance dont l'appelant n'est PAS un intermédiaire de
// confiance:
//
//   FEDLAB_TRUST_PROXY=10.9.9.9 test/federation/setup.sh
//   EXPECT=fixed node test/federation/t6-trust-proxy.mjs
//
// Le bac à sable tourne sur la boucle locale, qui appartient à l'ensemble de
// confiance par défaut, donc son X-Forwarded-For y est légitimement honoré.
// En désignant un intermédiaire qui n'est pas nous, on se place dans la
// situation réelle: un appelant venu d'Internet, dont l'en-tête doit être
// ignoré. Le scénario 7 vérifie la politique elle-même, adresse par adresse.
//
// EXPECT=fixed  attend un serveur où l'en-tête est ignoré (le limiteur mord).
// sans variable, attend un serveur qui croit l'en-tête (le limiteur ne mord jamais).
import { A, api, login, sleep, runner } from "./lib.mjs";

const FIXED = process.env.EXPECT === "fixed";
const t = runner(`Scénario 6, contournement du limiteur de déverrouillage (attente: ${FIXED ? "corrigé" : "vulnérable"})`);
const tA = await login(A);

const PASSPHRASE = "phrase-de-passe-de-test-longue";

// ── Activer le chiffrement au repos, puis verrouiller ────────────────────
const act = await api(A, "/api/instance/activate", {
  method: "POST", token: tA,
  body: { passphrase: PASSPHRASE, confirmPassphrase: PASSPHRASE },
});
t.check("le chiffrement au repos s'active", act.ok || act.json?.error === "Encryption is already enabled",
        `http ${act.status} ${act.json?.error ?? ""}`);

const lock = await api(A, "/api/instance/lock", { method: "POST", token: tA });
t.check("l'instance se verrouille", lock.ok, `http ${lock.status}`);

const status = await api(A, "/api/instance/status");
t.check("l'instance se déclare verrouillée", status.json?.locked === true,
        JSON.stringify(status.json));

// ── Le déverrouillage légitime marche, avant de tout saturer ────────────
const first = await api(A, "/api/instance/unlock", { method: "POST", body: { passphrase: PASSPHRASE } });
t.check("la bonne phrase de passe déverrouille", first.ok, `http ${first.status} ${first.json?.error ?? ""}`);
await api(A, "/api/instance/lock", { method: "POST", token: tA });

// ── Marteler en changeant l'adresse annoncée à chaque essai ──────────────
// 20 essais par fenêtre et par adresse. Si l'en-tête est cru, chaque essai
// ouvre un compteur neuf et on ne voit jamais de refus. S'il est ignoré, tout
// retombe sur la vraie adresse et le limiteur mord au bout de 20.
async function attempt(forwardedFor) {
  const headers = { "content-type": "application/json" };
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  const res = await fetch(A + "/api/instance/unlock", {
    method: "POST", headers, body: JSON.stringify({ passphrase: "mauvaise" }),
  });
  return res.status;
}

let throttled = 0, accepted = 0;
for (let i = 0; i < 45; i++) {
  const code = await attempt(`203.0.113.${i % 254}`);
  if (code === 429) throttled++;
  else accepted++;
}
t.check(FIXED ? "le limiteur mord malgré l'en-tête" : "le limiteur ne mord jamais",
        FIXED ? throttled > 0 : throttled === 0,
        `${accepted} essais traités, ${throttled} refusés en 429`);

// L'en-tête ne doit pas non plus permettre de réclamer le régime de bouclage.
const asLocal = await attempt("127.0.0.1");
t.check(FIXED ? "annoncer l'adresse de bouclage ne donne pas un régime à part" : "annoncer l'adresse de bouclage donne un régime à part",
        FIXED ? asLocal === 429 : asLocal !== 429, `http ${asLocal}`);

// ── Nettoyage: rendre l'instance au reste de la suite ────────────────────
// Le compteur est en mémoire et par adresse; on redémarre donc l'instance
// plutôt que d'attendre quinze minutes.
t.check("l'instance reste verrouillée après le martèlement",
        (await api(A, "/api/instance/status")).json?.locked === true,
        "le chiffrement doit être désactivé à la main: test/federation/setup.sh");

process.exit(t.summary() ? 0 : 1);
