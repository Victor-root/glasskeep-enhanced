// Scénario 3 — la variante dure de F-02, et le cas légitime qu'elle met en jeu.
//
// Le contrôle de forme seul ne suffirait pas: rien n'empêche un attaquant de
// forger un UUID valide qui se classe avant le nôtre. Ce scénario vérifie que
// le désistement ne se déclenche plus sur une simple affirmation réseau, ET
// que les invitations réellement croisées se résolvent encore en un seul lien.
import { A, B, login, setSelfName, invite, accept, links, reset, sleep, waitFor, runner } from "./lib.mjs";

const FIXED = process.env.EXPECT === "fixed";
const t = runner(`Scénario 3, UUID forgé et invitations croisées (attente: ${FIXED ? "corrigé" : "vulnérable"})`);
const tA = await login(A), tB = await login(B);

// ── 3a. UUID valide se classant avant le nôtre ───────────────────────────
await reset(tA, tB);
await setSelfName(A, tA, "Alpha");
await setSelfName(B, tB, "Beta");

const legit = await invite(A, tA, B, A, "Beta");
const legitId = legit.json?.link?.id;
// Tout UUID commençant par des zéros se classe avant un identifiant aléatoire.
const lowUuid = "00000000-0000-4000-8000-000000000001";
t.check("l'identifiant forgé se classe bien avant le nôtre", lowUuid < legitId,
        `${lowUuid.slice(0, 8)} < ${legitId?.slice(0, 8)}`);

const r = await fetch(A + "/api/federation/pair/invite", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    linkId: lowUuid,
    nonce: "AAAAAAAAAAAAAAAAAAAAAA",
    initiatorBaseUrl: B,
    initiatorLabel: "Beta",
    protocol: 1, protocolMin: 1,
  }),
});
await sleep(500);
let aLinks = await links(A, tA);
const legitRow = aLinks.find((l) => l.id === legitId);

t.check("l'invitation au format valide est acceptée dans les deux cas", r.status === 200, `http ${r.status}`);
t.check(FIXED ? "notre appairage légitime survit" : "notre appairage légitime est annulé",
        FIXED ? legitRow?.status === "outgoing_pending" : legitRow?.status === "cancelled",
        `statut=${legitRow?.status}`);

// Le libellé fourni par l'appelant doit être borné.
const forged = aLinks.find((l) => l.id === lowUuid);
const longLabel = "X".repeat(200);
await fetch(A + "/api/federation/pair/invite", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({
    linkId: "00000000-0000-4000-8000-000000000002",
    nonce: "BBBBBBBBBBBBBBBBBBBBBB",
    initiatorBaseUrl: "https://autre.example", initiatorLabel: longLabel, protocol: 1,
  }),
});
await sleep(300);
const longRow = (await links(A, tA)).find((l) => l.id === "00000000-0000-4000-8000-000000000002");
t.check(FIXED ? "le libellé fourni par l'appelant est borné" : "le libellé fourni par l'appelant n'est pas borné",
        FIXED ? (longRow?.peerLabel?.length ?? 0) <= 24 : (longRow?.peerLabel?.length ?? 0) > 24,
        `longueur=${longRow?.peerLabel?.length}`);

// Plafond par origine: cinq invitations d'une même adresse, la sixième passe ?
let capped = false;
for (let i = 10; i < 20; i++) {
  const res = await fetch(A + "/api/federation/pair/invite", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      linkId: `00000000-0000-4000-8000-0000000000${i}`,
      nonce: "CCCCCCCCCCCCCCCCCCCCCC",
      initiatorBaseUrl: "https://flood.example", initiatorLabel: "flood", protocol: 1,
    }),
  });
  if (res.status === 429) { capped = true; break; }
}
t.check(FIXED ? "le flot depuis une même origine est plafonné" : "le flot depuis une même origine n'est pas plafonné",
        FIXED ? capped : !capped, `plafonné=${capped}`);

// Et une autre origine passe toujours, le plafond ne doit pas tout bloquer.
const other = await fetch(A + "/api/federation/pair/invite", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({
    linkId: "00000000-0000-4000-8000-0000000000ff",
    nonce: "DDDDDDDDDDDDDDDDDDDDDD",
    initiatorBaseUrl: "https://legitime.example", initiatorLabel: "legit", protocol: 1,
  }),
});
t.check("une autre origine reste acceptée malgré le flot", other.status === 200, `http ${other.status}`);

// ── 3b. Invitations réellement croisées ──────────────────────────────────
// Le cas que le départage existe pour éviter. Les deux administrateurs
// s'invitent avant que l'une des deux invitations n'arrive. Il doit rester
// exactement un lien actif, et aucun blocage.
await reset(tA, tB);
const ia = await invite(A, tA, B, A, "Beta");
const ib = await invite(B, tB, A, B, "Alpha");
t.check("les deux côtés ont créé leur invitation",
        ia.ok && ib.ok, `alpha=${ia.json?.link?.id?.slice(0, 8)} beta=${ib.json?.link?.id?.slice(0, 8)}`);

// Laisser les ticks livrer les deux invitations.
await sleep(8000);
const aAll = await links(A, tA);
const bAll = await links(B, tB);
const aIncoming = aAll.find((l) => l.status === "incoming_pending");
const bIncoming = bAll.find((l) => l.status === "incoming_pending");
t.check("au moins un côté voit une invitation entrante à traiter",
        !!aIncoming || !!bIncoming,
        `alpha=[${aAll.map((l) => l.status).join(",")}] beta=[${bAll.map((l) => l.status).join(",")}]`);

// Un administrateur tranche.
if (bIncoming) await accept(B, tB, bIncoming.id, B);
else if (aIncoming) await accept(A, tA, aIncoming.id, A);

const aEnd = await waitFor(A, tA, (l) => l.some((x) => x.state === "online"), { timeout: 40000 });
const bEnd = await waitFor(B, tB, (l) => l.some((x) => x.state === "online"), { timeout: 40000 });
const aActive = aEnd.filter((l) => l.status === "active");
const bActive = bEnd.filter((l) => l.status === "active");
t.check("exactement un lien actif côté alpha", aActive.length === 1,
        `${aActive.length} actif(s), tous=[${aEnd.map((l) => l.status).join(",")}]`);
t.check("exactement un lien actif côté beta", bActive.length === 1,
        `${bActive.length} actif(s), tous=[${bEnd.map((l) => l.status).join(",")}]`);
t.check("le lien croisé finit en ligne", aActive[0]?.state === "online" && bActive[0]?.state === "online",
        `alpha=${aActive[0]?.state} beta=${bActive[0]?.state}`);
t.check("l'invitation perdante est bien retirée",
        aEnd.filter((l) => l.status === "outgoing_pending").length === 0 &&
        bEnd.filter((l) => l.status === "outgoing_pending").length === 0,
        `alpha=[${aEnd.map((l) => l.status).join(",")}] beta=[${bEnd.map((l) => l.status).join(",")}]`);

process.exit(t.summary() ? 0 : 1);
