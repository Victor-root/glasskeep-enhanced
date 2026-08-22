// Scénario 5 — non-régression de la fonctionnalité elle-même.
// Le correctif touche la poignée de main d'appairage; si le partage de notes
// entre serveurs casse, c'est ici qu'on le voit.
import { A, B, api, login, setSelfName, invite, accept, links, reset, sleep, waitFor, runner } from "./lib.mjs";

const t = runner("Scénario 5, partage de notes entre serveurs");
const tA = await login(A), tB = await login(B);

async function loginAs(base, email, password) {
  const r = await api(base, "/api/login", { method: "POST", body: { email, password } });
  return r.json?.token;
}
const alice = await loginAs(A, "alice@alpha.test", "Passw0rd-alice");
const bob = await loginAs(B, "bob@beta.test", "Passw0rd-bob");
t.check("les deux utilisateurs ordinaires se connectent", !!alice && !!bob);

// ── Appairage propre ─────────────────────────────────────────────────────
await reset(tA, tB);
await setSelfName(A, tA, "Alpha");
await setSelfName(B, tB, "Beta");
await invite(A, tA, B, A, "Beta");
const bCard = (await waitFor(B, tB, (l) => l.some((x) => x.status === "incoming_pending")))
  .find((l) => l.status === "incoming_pending");
await accept(B, tB, bCard.id, B);
await waitFor(A, tA, (l) => l.some((x) => x.state === "online"), { timeout: 40000 });
await waitFor(B, tB, (l) => l.some((x) => x.state === "online"), { timeout: 40000 });
t.check("le lien est en ligne avant de partager", true);

// Le sélecteur de partage doit voir le pair.
const peers = await api(A, "/api/federation/peers", { token: alice });
t.check("alice voit le serveur pair dans la liste", (peers.json?.peers ?? []).length === 1,
        JSON.stringify(peers.json?.peers));

// La recherche d'utilisateurs distants doit remonter Bob.
const search = await api(A, "/api/federation/users/search?q=bob", { token: alice });
const foundBob = (search.json?.users ?? []).find((u) => u.ref === "bob@beta.test");
t.check("alice trouve Bob sur le serveur distant", !!foundBob,
        JSON.stringify(search.json?.users)?.slice(0, 120));

// ── Partage ──────────────────────────────────────────────────────────────
const created = await api(A, "/api/notes", {
  method: "POST", token: alice,
  body: { title: "Courses", content: "pain, beurre", client_updated_at: new Date().toISOString() },
});
const noteId = created.json?.id;
t.check("alice crée une note", !!noteId, `id=${noteId}`);

const share = await api(A, `/api/notes/${noteId}/collaborate`, {
  method: "POST", token: alice,
  body: { username: `bob@beta.test@${new URL(B).host}`, access: "write" },
});
t.check("le partage entre serveurs est accepté", share.ok,
        `http ${share.status} ${JSON.stringify(share.json)?.slice(0, 110)}`);

// Bob doit voir le miroir.
let bobNotes = [];
for (let i = 0; i < 20 && !bobNotes.some((n) => n.id === noteId); i++) {
  await sleep(700);
  bobNotes = (await api(B, "/api/notes", { token: bob })).json ?? [];
}
const mirror = bobNotes.find((n) => n.id === noteId);
t.check("bob voit la note partagée", !!mirror, `titre=${mirror?.title}`);
t.check("le contenu est bien arrivé", mirror?.content === "pain, beurre", `contenu=${mirror?.content}`);

// ── Édition dans les deux sens ───────────────────────────────────────────
await api(A, `/api/notes/${noteId}`, {
  method: "PUT", token: alice,
  body: { title: "Courses", content: "pain, beurre, oeufs", client_updated_at: new Date().toISOString() },
});
let seen = null;
for (let i = 0; i < 20; i++) {
  await sleep(700);
  seen = ((await api(B, "/api/notes", { token: bob })).json ?? []).find((n) => n.id === noteId);
  if (seen?.content === "pain, beurre, oeufs") break;
}
t.check("l'édition d'alice arrive chez bob", seen?.content === "pain, beurre, oeufs", `vu=${seen?.content}`);

await api(B, `/api/notes/${noteId}`, {
  method: "PUT", token: bob,
  body: { title: "Courses", content: "pain, beurre, oeufs, lait", client_updated_at: new Date().toISOString() },
});
let back = null;
for (let i = 0; i < 20; i++) {
  await sleep(700);
  back = ((await api(A, "/api/notes", { token: alice })).json ?? []).find((n) => n.id === noteId);
  if (back?.content === "pain, beurre, oeufs, lait") break;
}
t.check("l'édition de bob revient chez alice", back?.content === "pain, beurre, oeufs, lait", `vu=${back?.content}`);

// ── Passage en lecture seule ─────────────────────────────────────────────
const collabs = await api(A, `/api/notes/${noteId}/collaborators`, { token: alice });
const shadow = (collabs.json?.collaborators ?? collabs.json ?? []).find?.((c) => /bob/i.test(c.name || c.email || ""));
t.check("alice voit bob comme collaborateur", !!shadow, JSON.stringify(collabs.json)?.slice(0, 140));

if (shadow) {
  const perm = await api(A, `/api/notes/${noteId}/collaborate/${shadow.id}`, {
    method: "PATCH", token: alice, body: { access: "read" },
  });
  t.check("alice passe bob en lecture seule", perm.ok, `http ${perm.status}`);
  await sleep(3000);
  const write = await api(B, `/api/notes/${noteId}`, {
    method: "PUT", token: bob,
    body: { title: "Courses", content: "tentative interdite", client_updated_at: new Date().toISOString() },
  });
  t.check("l'écriture de bob est refusée", write.json?.readOnly === true || write.status === 403,
          `http ${write.status} readOnly=${write.json?.readOnly}`);
}

// ── Dépairage ────────────────────────────────────────────────────────────
const aLink = (await links(A, tA)).find((l) => l.status === "active");
await api(A, `/api/admin/federation/links/${aLink.id}`, { method: "DELETE", token: tA });
await sleep(4000);
t.check("le lien disparaît côté alpha", (await links(A, tA)).length === 0);
const bAfter = await waitFor(B, tB, (l) => l.length === 0, { timeout: 30000 });
t.check("le lien disparaît aussi côté beta", bAfter.length === 0,
        `restants=${bAfter.map((l) => l.status).join(",")}`);
const bobAfter = ((await api(B, "/api/notes", { token: bob })).json ?? []).find((n) => n.id === noteId);
t.check("bob garde une copie autonome après le dépairage",
        ((await api(B, "/api/notes", { token: bob })).json ?? []).length >= 1,
        `note d'origine encore là=${!!bobAfter}`);

process.exit(t.summary() ? 0 : 1);
