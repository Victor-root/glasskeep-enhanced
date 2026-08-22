// Scénario 4 — le risque que mon correctif pourrait avoir introduit.
//
// Avant, le départage au moment de l'invitation faisait qu'un seul des deux
// côtés gardait une carte à accepter. Maintenant que les deux lignes
// coexistent, les deux administrateurs peuvent accepter chacun la leur.
// Ce test vérifie qu'on n'aboutit ni à deux liens actifs, ni à deux liens
// bloqués en "accepting" qui se renvoient la balle indéfiniment.
import { A, B, login, setSelfName, invite, accept, links, reset, sleep, waitFor, runner } from "./lib.mjs";

const t = runner("Scénario 4, les deux administrateurs acceptent");
const tA = await login(A), tB = await login(B);
await reset(tA, tB);
await setSelfName(A, tA, "Alpha");
await setSelfName(B, tB, "Beta");

// Les deux s'invitent, et on laisse les deux invitations arriver.
await invite(A, tA, B, A, "Beta");
await invite(B, tB, A, B, "Alpha");
await sleep(9000);

const aCard = (await links(A, tA)).find((l) => l.status === "incoming_pending");
const bCard = (await links(B, tB)).find((l) => l.status === "incoming_pending");
// Le départage au moment de l'invitation refuse toujours (409) l'invitation
// entrante quand notre propre identifiant se classe avant: une seule carte
// existe donc, et le double clic ne peut pas se produire. Ce qui a été retiré,
// c'est uniquement la moitié destructrice, l'annulation de notre lien.
t.check("exactement un côté reçoit une carte à traiter", !!aCard !== !!bCard,
        `alpha=${!!aCard} beta=${!!bCard}`);

// Les deux administrateurs cliquent, quasiment en même temps.
const [ra, rb] = await Promise.all([
  aCard ? accept(A, tA, aCard.id, A) : Promise.resolve({ status: 0 }),
  bCard ? accept(B, tB, bCard.id, B) : Promise.resolve({ status: 0 }),
]);
t.check("au moins une acceptation est retenue", ra.ok || rb.ok,
        `alpha http ${ra.status} (${ra.json?.error ?? "ok"}), beta http ${rb.status} (${rb.json?.error ?? "ok"})`);
t.check("les deux acceptations ne sont pas retenues en même temps", !(ra.ok && rb.ok),
        `alpha=${ra.ok} beta=${rb.ok}`);

// On laisse les ticks converger.
const aEnd = await waitFor(A, tA, (l) => l.some((x) => x.state === "online"), { timeout: 45000 });
const bEnd = await waitFor(B, tB, (l) => l.some((x) => x.state === "online"), { timeout: 45000 });
const aActive = aEnd.filter((l) => l.status === "active");
const bActive = bEnd.filter((l) => l.status === "active");
const aStuck = aEnd.filter((l) => l.status === "accepting");
const bStuck = bEnd.filter((l) => l.status === "accepting");

t.check("un seul lien actif côté alpha", aActive.length === 1,
        `${aActive.length} actif(s) sur [${aEnd.map((l) => l.status).join(",")}]`);
t.check("un seul lien actif côté beta", bActive.length === 1,
        `${bActive.length} actif(s) sur [${bEnd.map((l) => l.status).join(",")}]`);
t.check("aucun lien bloqué en acceptation côté alpha", aStuck.length === 0, `${aStuck.length}`);
t.check("aucun lien bloqué en acceptation côté beta", bStuck.length === 0, `${bStuck.length}`);
t.check("les deux côtés parlent bien du même lien", aActive[0]?.id === bActive[0]?.id,
        `${aActive[0]?.id?.slice(0, 8)} / ${bActive[0]?.id?.slice(0, 8)}`);
t.check("le lien est en ligne des deux côtés",
        aActive[0]?.state === "online" && bActive[0]?.state === "online",
        `alpha=${aActive[0]?.state} beta=${bActive[0]?.state}`);
t.check("aucune carte fantôme ne traîne",
        aEnd.filter((l) => l.status === "incoming_pending" || l.status === "outgoing_pending").length === 0 &&
        bEnd.filter((l) => l.status === "incoming_pending" || l.status === "outgoing_pending").length === 0,
        `alpha=[${aEnd.map((l) => l.status).join(",")}] beta=[${bEnd.map((l) => l.status).join(",")}]`);

process.exit(t.summary() ? 0 : 1);
