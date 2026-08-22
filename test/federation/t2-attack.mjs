// Scénario 2 — F-02. Un tiers non authentifié attaque /api/federation/pair/invite.
// Avant correctif, tout doit réussir pour l'attaquant. Après, tout doit échouer.
// Le script ne juge pas: il rapporte l'état observé, et une variable d'attente
// dit ce qu'on considère comme normal.
import { A, B, login, setSelfName, invite, links, reset, sleep, waitFor, runner } from "./lib.mjs";

const FIXED = process.env.EXPECT === "fixed"; // attentes d'après correctif
const t = runner(`Scénario 2, attaque sur l'appairage (attente: ${FIXED ? "corrigé" : "vulnérable"})`);

const tA = await login(A), tB = await login(B);
await reset(tA, tB);
await setSelfName(A, tA, "Alpha");
await setSelfName(B, tB, "Beta");

// L'administrateur d'alpha lance un appairage légitime vers beta.
const legit = await invite(A, tA, B, A, "Beta");
const legitId = legit.json?.link?.id;
t.check("appairage légitime en cours", legit.ok && !!legitId, `id=${legitId?.slice(0, 8)}`);

// ── L'attaque ────────────────────────────────────────────────────────────
// Aucun jeton, aucune signature. Le seul prérequis est de connaître
// l'adresse publique de beta, avec qui alpha est en train de s'appairer.
// "!" (0x21) se classe avant tout UUID, ce qui force la branche d'annulation.
const attack = await fetch(A + "/api/federation/pair/invite", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    linkId: "!",
    nonce: "peu-importe",
    initiatorBaseUrl: B,          // on se fait passer pour beta
    initiatorLabel: "Beta",       // le nom que verra l'administrateur
    protocol: 1, protocolMin: 1,
  }),
});
const attackBody = await attack.json().catch(() => null);
t.check(FIXED ? "l'invitation forgée est refusée" : "l'invitation forgée est acceptée",
        FIXED ? !attack.ok : attack.ok,
        `http ${attack.status} ${JSON.stringify(attackBody)?.slice(0, 90)}`);

await sleep(500);
let aLinks = await links(A, tA);
const legitRow = aLinks.find((l) => l.id === legitId);
const forged = aLinks.find((l) => l.id === "!");

t.check(FIXED ? "l'appairage légitime survit" : "l'appairage légitime est annulé",
        FIXED ? legitRow?.status === "outgoing_pending" : legitRow?.status === "cancelled",
        `statut=${legitRow?.status}`);

t.check(FIXED ? "aucune fausse invitation n'est créée" : "une fausse invitation est créée",
        FIXED ? !forged : !!forged,
        forged ? `label affiché="${forged.peerLabel}" adresse=${forged.peerBaseUrl}` : "aucune");

// L'administrateur peut-il relancer l'appairage vers beta ?
const retry = await invite(A, tA, B, A, "Beta");
t.check(FIXED ? "relance impossible car l'original tient toujours" : "relance bloquée par le garde NON_TERMINAL",
        retry.status === 409,
        `http ${retry.status} ${retry.json?.error ?? ""}`);

// ── Identifiant contenant une barre oblique ──────────────────────────────
const slash = await fetch(A + "/api/federation/pair/invite", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ linkId: "spam/1", nonce: "x", initiatorBaseUrl: "https://spam.example", protocol: 1 }),
});
await sleep(300);
aLinks = await links(A, tA);
const slashRow = aLinks.find((l) => l.id === "spam/1");
t.check(FIXED ? "un identifiant avec barre oblique est refusé" : "un identifiant avec barre oblique est stocké",
        FIXED ? !slashRow : !!slashRow, `créé=${!!slashRow} (http ${slash.status})`);

if (slashRow) {
  // La route admin est /links/:id, et Express ne fait pas correspondre une
  // barre oblique dans un segment: la ligne devient irretirable par l'API.
  const del = await fetch(A + `/api/admin/federation/links/${slashRow.id}`, {
    method: "DELETE", headers: { authorization: "Bearer " + tA },
  });
  t.check("la ligne à barre oblique est irretirable par l'interface", del.status === 404,
          `http ${del.status}`);
}

// ── Types non textuels ───────────────────────────────────────────────────
const weird = await fetch(A + "/api/federation/pair/invite", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ linkId: { a: 1 }, nonce: "x", initiatorBaseUrl: "https://x.example", protocol: 1 }),
});
t.check(FIXED ? "un identifiant non textuel est refusé proprement" : "un identifiant non textuel provoque une erreur serveur",
        FIXED ? weird.status === 400 : weird.status >= 500, `http ${weird.status}`);

process.exit(t.summary() ? 0 : 1);
