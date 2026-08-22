// Scénario 1 — l'appairage nominal fonctionne, de bout en bout.
// Sert de garde-fou: si ce scénario casse après un correctif, le correctif
// a cassé la fonctionnalité.
import { A, B, login, setSelfName, invite, accept, links, reset, waitFor, runner } from "./lib.mjs";

const t = runner("Scénario 1, appairage nominal");
const tA = await login(A), tB = await login(B);
await reset(tA, tB);
await setSelfName(A, tA, "Alpha");
await setSelfName(B, tB, "Beta");

const inv = await invite(A, tA, B, A, "Beta");
t.check("alpha crée l'invitation", inv.ok && inv.json?.link?.status === "outgoing_pending",
        `statut=${inv.json?.link?.status}`);

// Le tick d'alpha livre l'invitation à beta.
const bLinks = await waitFor(B, tB, (l) => l.some((x) => x.status === "incoming_pending"));
const incoming = bLinks.find((x) => x.status === "incoming_pending");
t.check("beta reçoit l'invitation", !!incoming, incoming ? `id=${incoming.id.slice(0, 8)}` : "aucune");
t.check("beta voit la bonne adresse d'origine", incoming?.peerBaseUrl === A, `vu=${incoming?.peerBaseUrl}`);

if (incoming) {
  const acc = await accept(B, tB, incoming.id, B);
  t.check("beta accepte", acc.ok, `statut=${acc.json?.link?.status}`);
}

// Les deux côtés doivent finir actifs et en ligne.
const aFinal = await waitFor(A, tA, (l) => l.some((x) => x.state === "online"));
const bFinal = await waitFor(B, tB, (l) => l.some((x) => x.state === "online"));
t.check("alpha voit le lien en ligne", aFinal.some((x) => x.state === "online"),
        `états=${aFinal.map((x) => x.state).join(",")}`);
t.check("beta voit le lien en ligne", bFinal.some((x) => x.state === "online"),
        `états=${bFinal.map((x) => x.state).join(",")}`);
t.check("les deux côtés partagent le même identifiant de lien",
        aFinal[0]?.id === bFinal[0]?.id, `${aFinal[0]?.id?.slice(0, 8)} / ${bFinal[0]?.id?.slice(0, 8)}`);
t.check("protocole négocié compatible", aFinal[0]?.protocolCompatible === 1 && aFinal[0]?.agreedProtocol === 1,
        `compatible=${aFinal[0]?.protocolCompatible} version=${aFinal[0]?.agreedProtocol}`);

process.exit(t.summary() ? 0 : 1);
