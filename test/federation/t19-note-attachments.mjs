// Scénario 19, les fichiers joints d'une note partagée entre serveurs.
// La liste suit partout, et le fichier traverse le lien la première fois
// qu'on l'ouvre de l'autre côté, identique à l'octet près, dans les deux
// sens.
import crypto from "node:crypto";
import { A, B, api, login, setSelfName, invite, accept, reset, sleep, waitFor, runner } from "./lib.mjs";

const t = runner("Scénario 19, fichiers joints entre serveurs");
const tA = await login(A), tB = await login(B);
const loginAs = async (base, email, password) =>
  (await api(base, "/api/login", { method: "POST", body: { email, password } })).json?.token;
const alice = await loginAs(A, "alice@alpha.test", "Passw0rd-alice");
const bob = await loginAs(B, "bob@beta.test", "Passw0rd-bob");

await reset(tA, tB);
await setSelfName(A, tA, "Alpha");
await setSelfName(B, tB, "Beta");
await invite(A, tA, B, A, "Beta");
const carte = (await waitFor(B, tB, (l) => l.some((x) => x.status === "incoming_pending"))).find((l) => l.status === "incoming_pending");
await accept(B, tB, carte.id, B);
await waitFor(A, tA, (l) => l.some((x) => x.state === "online"), { timeout: 40000 });
await waitFor(B, tB, (l) => l.some((x) => x.state === "online"), { timeout: 40000 });

async function joindre(base, token, noteId, corps, name) {
  const id = crypto.randomUUID();
  const h = { authorization: "Bearer " + token };
  const debut = await (await fetch(`${base}/api/notes/${noteId}/attachments`, {
    method: "POST", headers: { ...h, "content-type": "application/json" },
    body: JSON.stringify({ id, name, type: "application/pdf", size: corps.length }),
  })).json();
  const nb = Math.max(1, Math.ceil(corps.length / debut.pieceSize));
  let res;
  for (let i = 0; i < nb; i++) {
    res = await fetch(`${base}/api/attachment-uploads/${debut.uploadId}/${i}`, {
      method: "PUT",
      headers: { ...h, "content-type": "application/octet-stream", ...(i === nb - 1 ? { "x-last": "1" } : {}) },
      body: corps.subarray(i * debut.pieceSize, (i + 1) * debut.pieceSize),
    });
  }
  return { id, status: res.status };
}
const lire = async (base, token, noteId) => ((await api(base, "/api/notes", { token })).json ?? []).find((n) => n.id === noteId);
async function attendreListe(base, token, noteId, predicat, timeout = 20000) {
  const fin = Date.now() + timeout;
  while (Date.now() < fin) {
    const n = await lire(base, token, noteId);
    if (n && predicat(n.attachments ?? [])) return n.attachments;
    await sleep(500);
  }
  return null;
}
async function telecharger(base, token, noteId, id) {
  const l = await api(base, `/api/notes/${noteId}/attachments/${id}/link`, { method: "POST", token, body: {} });
  const res = await fetch(base + l.json.url);
  return { status: res.status, corps: Buffer.from(await res.arrayBuffer()) };
}

const created = await api(A, "/api/notes", { method: "POST", token: alice, body: { title: "Dossier", content: "x", client_updated_at: new Date().toISOString() } });
const noteId = created.json?.id;
const fichierAvant = crypto.randomBytes(2 * 1024 * 1024 + 3);
const avant = await joindre(A, alice, noteId, fichierAvant, "joint avant le partage.pdf");
t.check("alice joint un fichier avant de partager", avant.status === 201, String(avant.status));
const partage = await api(A, `/api/notes/${noteId}/collaborate`, { method: "POST", token: alice, body: { username: `bob@beta.test@${new URL(B).host}`, access: "write" } });
t.check("la note est partagée", partage.ok, String(partage.status));

const vueBob = await attendreListe(B, bob, noteId, (l) => l.some((a) => a.id === avant.id), 40000);
t.check("bob voit le fichier joint avant le partage", !!vueBob, JSON.stringify(vueBob)?.slice(0, 120));
t.check("avec son nom et sa taille", vueBob?.[0]?.name === "joint avant le partage.pdf" && vueBob?.[0]?.size === fichierAvant.length);
const recu = await telecharger(B, bob, noteId, avant.id);
t.check("il le télécharge à l'identique depuis son serveur", recu.status === 200 && fichierAvant.equals(recu.corps), String(recu.status));
const encore = await telecharger(B, bob, noteId, avant.id);
t.check("et une seconde fois", fichierAvant.equals(encore.corps));

const fichierBob = crypto.randomBytes(1500);
const deBob = await joindre(B, bob, noteId, fichierBob, "de bob.pdf");
t.check("bob joint un fichier depuis son serveur", deBob.status === 201, String(deBob.status));
const vueAlice = await attendreListe(A, alice, noteId, (l) => l.some((a) => a.id === deBob.id));
t.check("alice le voit", !!vueAlice);
t.check("et le télécharge à l'identique", fichierBob.equals((await telecharger(A, alice, noteId, deBob.id)).corps));
t.check("bob voit toujours les deux fichiers", !!(await attendreListe(B, bob, noteId, (l) => l.length === 2)));

const retrait = await api(B, `/api/notes/${noteId}/attachments/${avant.id}`, { method: "DELETE", token: bob });
t.check("bob retire un fichier", retrait.ok, String(retrait.status));
t.check("il disparaît chez alice", !!(await attendreListe(A, alice, noteId, (l) => l.length === 1 && l[0].id === deBob.id)));
t.check("et reste retiré chez bob", !!(await attendreListe(B, bob, noteId, (l) => l.length === 1)));

await api(A, `/api/notes/${noteId}/attachments/${deBob.id}`, { method: "DELETE", token: alice });
t.check("alice retire le dernier, bob le voit partir", !!(await attendreListe(B, bob, noteId, (l) => l.length === 0)));

await reset(tA, tB);
process.exit(t.summary() ? 0 : 1);
