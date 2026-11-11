// Scénario fonctionnel: les fichiers joints à une note.
//
// Ce qui est vérifié: un fichier se relit à l'identique, seuls ceux qui
// partagent la note y accèdent, un collaborateur en lecture seule lit sans
// rien changer, un fichier piégé ne s'exécute jamais sur l'origine de
// l'application, le disque ne garde rien d'un fichier retiré, et avec le
// chiffrement au repos ni le contenu ni le nom ne sont lisibles sur le
// disque.
import path from "node:path";
import crypto from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { startInstance, createAndLogin, listenEvents, runner, sleep } from "./lab.mjs";

const PORT = 9522;
const t = runner("Pièces jointes");
const inst = await startInstance({ port: PORT });
const dossier = path.join(path.dirname(inst.dbFile), "note-files");

let horloge = Date.now() - 3600 * 1000;
const iso = () => new Date((horloge += 1000)).toISOString();

function fichiersSurDisque() {
  const trouves = [];
  for (const sous of readdirSync(dossier)) {
    if (sous === "tmp") continue;
    for (const f of readdirSync(path.join(dossier, sous))) trouves.push(path.join(dossier, sous, f));
  }
  return trouves;
}
const creerNote = (user, id, extra = {}) => {
  const ts = iso();
  return inst.call("POST", "/api/notes", {
    token: user.token, body: { id, type: "text", title: id, content: "corps", timestamp: ts, client_updated_at: ts, ...extra },
  });
};
async function joindre(user, noteId, contenu, { id = crypto.randomUUID(), name = "rapport.pdf", type = "application/pdf", morceau } = {}) {
  const h = { authorization: "Bearer " + user.token };
  const debut = await fetch(`${inst.base}/api/notes/${noteId}/attachments`, {
    method: "POST", headers: { ...h, "content-type": "application/json" },
    body: JSON.stringify({ id, name, type, size: contenu.length }),
  });
  let json = null;
  try { json = await debut.json(); } catch { /* corps vide */ }
  if (!debut.ok || json?.attachment) return { status: debut.status, json };
  const taille = morceau || json.pieceSize;
  const nb = Math.max(1, Math.ceil(contenu.length / taille));
  let res = null;
  for (let i = 0; i < nb; i++) {
    res = await fetch(`${inst.base}/api/attachment-uploads/${json.uploadId}/${i}`, {
      method: "PUT",
      headers: { ...h, "content-type": "application/octet-stream", ...(i === nb - 1 ? { "x-last": "1" } : {}) },
      body: contenu.subarray(i * taille, (i + 1) * taille),
    });
    if (!res.ok) break;
  }
  let fin = null;
  try { fin = await res.json(); } catch { /* corps vide */ }
  return { status: res.status, json: fin, uploadId: json.uploadId };
}
const lien = (user, noteId, id, inline = false) =>
  inst.call("POST", `/api/notes/${noteId}/attachments/${id}/link`, { token: user.token, body: { inline } });
const telecharger = async (url) => {
  const res = await fetch(inst.base + url);
  return { res, corps: Buffer.from(await res.arrayBuffer()) };
};
const lireNote = async (user, id) => {
  const r = await inst.call("GET", "/api/notes", { token: user.token });
  return (r.json || []).find((n) => n.id === id);
};

let flux = null;
try {
  const alice = await createAndLogin(inst, { name: "Alice", email: "alice@x.test", password: "Passw0rd-alice", isAdmin: true });
  const bob = await createAndLogin(inst, { name: "Bob", email: "bob@x.test", password: "Passw0rd-bob" });
  const carl = await createAndLogin(inst, { name: "Carl", email: "carl@x.test", password: "Passw0rd-carl" });

  // ── 1. Le cycle normal ──────────────────────────────────────────────
  await creerNote(alice, "n1");
  const contenu = crypto.randomBytes(3 * 1024 * 1024 + 17);
  flux = await listenEvents(inst, alice.token);
  const id1 = crypto.randomUUID();
  const envoi = await joindre(alice, "n1", contenu, { id: id1, name: "rapport annuel é😀.pdf" });
  t.check("un fichier s'ajoute à une note", envoi.status === 201 && envoi.json?.attachment?.id === id1, JSON.stringify(envoi.json));
  t.check("il garde son nom, son type et sa taille",
    envoi.json?.attachment?.name === "rapport annuel é😀.pdf" && envoi.json?.attachment?.mime === "application/pdf"
      && envoi.json?.attachment?.size === contenu.length);
  const relue = await lireNote(alice, "n1");
  t.check("la note le porte à la relecture", relue?.attachments?.length === 1 && relue.attachments[0].id === id1);
  const avertie = await flux.waitFor((e) => e.data?.type === "note_attachments" && e.data?.noteId === "n1");
  t.check("les appareils connectés sont prévenus avec la liste à jour", avertie?.data?.attachments?.[0]?.id === id1);
  const encore = await joindre(alice, "n1", contenu, { id: id1 });
  t.check("renvoyer le même identifiant n'ajoute rien (reprise après une réponse perdue)",
    encore.status === 200 && (await lireNote(alice, "n1"))?.attachments?.length === 1, String(encore.status));

  const l = await lien(alice, "n1", id1);
  const dl = await telecharger(l.json.url);
  t.check("le fichier se relit à l'identique", dl.res.ok && contenu.equals(dl.corps));
  t.check("il arrive comme un téléchargement, avec son vrai nom",
    /^attachment;/.test(dl.res.headers.get("content-disposition") || "")
      && (dl.res.headers.get("content-disposition") || "").includes("filename*=UTF-8''rapport%20annuel"));
  // ── Envoi par morceaux: un proxy ne voit jamais de requête plus grosse
  // qu'un morceau, et une coupure reprend où elle s'était arrêtée.
  const depart = await inst.call("POST", "/api/notes/n1/attachments", { token: alice.token, body: { id: crypto.randomUUID(), name: "repris.bin", type: "application/octet-stream", size: contenu.length } });
  t.check("un envoi annonce la taille de ses morceaux, sous la limite de nginx", depart.status === 201 && depart.json.pieceSize < 1024 * 1024, JSON.stringify(depart.json));
  const morceau = (i, extra = {}) => fetch(`${inst.base}/api/attachment-uploads/${depart.json.uploadId}/${i}`, {
    method: "PUT", headers: { authorization: "Bearer " + alice.token, "content-type": "application/octet-stream", ...extra },
    body: contenu.subarray(i * depart.json.pieceSize, (i + 1) * depart.json.pieceSize),
  });
  await morceau(0);
  await morceau(1);
  t.check("un morceau en avance est refusé avec la position attendue", (await (await morceau(5)).json()).next === 2);
  t.check("un morceau déjà reçu est simplement acquitté", (await (await morceau(1)).json()).next === 2);
  const intrus = await fetch(`${inst.base}/api/attachment-uploads/${depart.json.uploadId}`, { headers: { authorization: "Bearer " + bob.token } });
  t.check("l'envoi d'un autre est invisible", intrus.status === 404);
  const reprise = await inst.call("GET", `/api/attachment-uploads/${depart.json.uploadId}`, { token: alice.token });
  t.check("on retrouve où l'envoi s'était arrêté", reprise.json?.next === 2);
  const nbMorceaux = Math.ceil(contenu.length / depart.json.pieceSize);
  let fin = null;
  for (let i = 2; i < nbMorceaux; i++) fin = await morceau(i, i === nbMorceaux - 1 ? { "x-last": "1" } : {});
  const repris = (await fin.json()).attachment;
  t.check("et il se termine", fin.status === 201 && repris?.size === contenu.length);
  t.check("le fichier repris se relit à l'identique", contenu.equals((await telecharger((await lien(alice, "n1", repris.id)).json.url)).corps));
  await inst.call("DELETE", `/api/notes/n1/attachments/${repris.id}`, { token: alice.token });

  t.check("le navigateur n'a pas à deviner le type", dl.res.headers.get("x-content-type-options") === "nosniff");

  const ts = iso();
  await inst.call("PUT", "/api/notes/n1", { token: alice.token, body: { title: "Titre changé", content: "x", client_updated_at: ts, timestamp: ts } });
  t.check("enregistrer le texte de la note ne touche pas à ses fichiers", (await lireNote(alice, "n1"))?.attachments?.length === 1);

  // ── 2. Les droits ───────────────────────────────────────────────────
  const refuseSansJeton = await fetch(`${inst.base}/api/notes/n1/attachments`, { method: "POST", body: "x" });
  t.check("sans session, on n'envoie rien", refuseSansJeton.status === 401, String(refuseSansJeton.status));
  t.check("un inconnu n'obtient pas de lien", (await lien(bob, "n1", id1)).status === 404);
  t.check("un inconnu n'ajoute rien", (await joindre(bob, "n1", Buffer.from("x"))).status === 404);
  const falsifie = await fetch(`${inst.base}/api/attachments/${id1}/file?t=${l.json.url.split("t=")[1]}x`);
  t.check("un lien retouché est refusé", falsifie.status === 403, String(falsifie.status));
  const autreFichier = await fetch(`${inst.base}/api/attachments/autre/file?t=${l.json.url.split("t=")[1]}`);
  t.check("un lien n'ouvre que son propre fichier", autreFichier.status === 403, String(autreFichier.status));
  const commeSession = await inst.call("GET", "/api/notes", { token: l.json.url.split("t=")[1] });
  t.check("un lien de téléchargement ne vaut pas une session", commeSession.status === 401, String(commeSession.status));

  await inst.call("POST", "/api/notes/n1/collaborate", { token: alice.token, body: { username: "bob@x.test" } });
  await inst.call("POST", "/api/notes/n1/collaborate", { token: alice.token, body: { username: "carl@x.test" } });
  const carlRow = inst.db(true); const carlId = carlRow.prepare("SELECT id FROM users WHERE email='carl@x.test'").get().id; carlRow.close();
  await inst.call("PATCH", `/api/notes/n1/collaborate/${carlId}`, { token: alice.token, body: { access: "read" } });
  const idBob = crypto.randomUUID();
  t.check("un collaborateur ajoute un fichier", (await joindre(bob, "n1", Buffer.from("de bob"), { id: idBob, name: "bob.txt", type: "text/plain" })).status === 201);
  const lienBob = await lien(bob, "n1", id1);
  t.check("et lit ceux des autres", (await telecharger(lienBob.json.url)).res.ok);
  const refusCarl = await joindre(carl, "n1", Buffer.from("x"));
  t.check("un collaborateur en lecture seule n'ajoute rien", refusCarl.status === 403, String(refusCarl.status));
  t.check("ne retire rien", (await inst.call("DELETE", `/api/notes/n1/attachments/${id1}`, { token: carl.token })).status === 403);
  const lienCarl = await lien(carl, "n1", id1);
  t.check("mais lit", (await telecharger(lienCarl.json.url)).res.ok);

  const lienAvant = await lien(bob, "n1", id1);
  await inst.call("DELETE", `/api/notes/n1/collaborate/${inst.db(true).prepare("SELECT id FROM users WHERE email='bob@x.test'").get().id}`, { token: alice.token });
  t.check("retiré de la note, un lien déjà donné ne marche plus", (await telecharger(lienAvant.json.url)).res.status === 403);
  const lienAlice = await lien(alice, "n1", id1);
  await inst.call("POST", "/api/user/change-password", { token: alice.token, body: { currentPassword: "Passw0rd-alice", newPassword: "Passw0rd-alice2" } });

  // ── 3. Les fichiers piégés et les limites ───────────────────────────
  const a2 = (await inst.call("POST", "/api/login", { body: { email: "alice@x.test", password: "Passw0rd-alice2" } })).json?.token || alice.token;
  const moi = { token: a2 };
  if (a2 !== alice.token) t.check("changer son mot de passe ferme les liens déjà donnés", (await telecharger(lienAlice.json.url)).res.status === 403);
  await creerNote(moi, "n2");
  for (const [nom, type, corps] of [
    ["page.html", "text/html", "<script>alert(1)</script>"],
    ["image.svg", "image/svg+xml", "<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>"],
    ["faux.png", "image/png; charset=x", "<script>alert(1)</script>"],
  ]) {
    const id = crypto.randomUUID();
    await joindre(moi, "n2", Buffer.from(corps), { id, name: nom, type });
    const { json } = await lien(moi, "n2", id, true);
    const { res } = await telecharger(json.url);
    const typeServi = res.headers.get("content-type") || "";
    const csp = res.headers.get("content-security-policy") || "";
    if (type === "image/png; charset=x") {
      t.check(`${nom}: servi avec nosniff et sous bac à sable`, res.headers.get("x-content-type-options") === "nosniff" && /sandbox/.test(csp), csp);
    } else {
      t.check(`${nom}: jamais affiché par le navigateur, même demandé en ligne`,
        /^attachment/.test(res.headers.get("content-disposition") || "") && typeServi === "application/octet-stream" && /sandbox/.test(csp),
        `${typeServi} ${res.headers.get("content-disposition")}`);
    }
  }
  const idPdf = crypto.randomUUID();
  await joindre(moi, "n2", Buffer.from("%PDF-1.4"), { id: idPdf, name: "ok.pdf" });
  const pdf = await telecharger((await lien(moi, "n2", idPdf, true)).json.url);
  t.check("un PDF demandé en ligne s'affiche", /^inline/.test(pdf.res.headers.get("content-disposition") || "") && pdf.res.headers.get("content-type") === "application/pdf");
  const idMalin = crypto.randomUUID();
  await joindre(moi, "n2", Buffer.from("x"), { id: idMalin, name: '../../etc/pa"ss\r\nX-Injected: 1' });
  const malin = await telecharger((await lien(moi, "n2", idMalin)).json.url);
  t.check("un nom piégé n'injecte rien dans les en-têtes", malin.res.ok && !malin.res.headers.get("x-injected") && !/\.\.\//.test((await lireNote(moi, "n2")).attachments.find((a) => a.id === idMalin).name));

  await inst.call("PATCH", "/api/admin/settings", { token: a2, body: { attachmentMaxMb: 1 } });
  t.check("la taille maximale de l'administrateur est annoncée", (await inst.call("GET", "/api/attachments/config", { token: a2 })).json?.maxBytes === 1024 * 1024);
  const trop = await joindre(moi, "n2", crypto.randomBytes(1024 * 1024 + 1));
  t.check("un fichier trop gros est refusé dès l'annonce", trop.status === 413 && trop.json?.maxBytes === 1024 * 1024, String(trop.status));
  const menteur = await inst.call("POST", "/api/notes/n2/attachments", { token: a2, body: { id: crypto.randomUUID(), name: "x", type: "x/y", size: 10 } });
  const gros = await fetch(`${inst.base}/api/attachment-uploads/${menteur.json.uploadId}/0`, { method: "PUT", headers: { authorization: "Bearer " + a2, "content-type": "application/octet-stream", "x-last": "1" }, body: Buffer.alloc(20) });
  t.check("un envoi qui dépasse la taille annoncée est refusé", gros.status === 400, String(gros.status));
  const court = await inst.call("POST", "/api/notes/n2/attachments", { token: a2, body: { id: crypto.randomUUID(), name: "x", type: "x/y", size: 10 } });
  const finCourte = await fetch(`${inst.base}/api/attachment-uploads/${court.json.uploadId}/0`, { method: "PUT", headers: { authorization: "Bearer " + a2, "content-type": "application/octet-stream", "x-last": "1" }, body: Buffer.alloc(5) });
  t.check("un envoi qui finit avant sa taille annoncée est refusé", finCourte.status === 400, String(finCourte.status));
  const enorme = await inst.call("POST", "/api/notes/n2/attachments", { token: a2, body: { id: crypto.randomUUID(), name: "x", type: "x/y", size: 900 * 1024 } });
  const tropGrosMorceau = await fetch(`${inst.base}/api/attachment-uploads/${enorme.json.uploadId}/0`, { method: "PUT", headers: { authorization: "Bearer " + a2, "content-type": "application/octet-stream" }, body: Buffer.alloc(enorme.json.pieceSize + 1) });
  t.check("un morceau plus gros que prévu est refusé", tropGrosMorceau.status === 413, String(tropGrosMorceau.status));
  t.check("et il ne reste rien du refus", readdirSync(path.join(dossier, "tmp")).length === 0, readdirSync(path.join(dossier, "tmp")).join());
  await inst.call("PATCH", "/api/admin/settings", { token: a2, body: { attachmentMaxMb: 0 } });
  t.check("à 0, les pièces jointes sont coupées", (await joindre(moi, "n2", Buffer.from("x"))).status === 403);
  await inst.call("PATCH", "/api/admin/settings", { token: a2, body: { attachmentMaxMb: 100 } });
  t.check("un identifiant invalide est refusé", (await joindre(moi, "n2", Buffer.from("x"), { id: "../pas bien" })).status === 400);
  t.check("un fichier vide passe", (await joindre(moi, "n2", Buffer.alloc(0), { name: "vide.bin" })).status === 201);
  t.check("une vignette qui n'en est pas une est refusée",
    (await inst.call("PATCH", `/api/notes/n2/attachments/${idPdf}`, { token: a2, body: { thumb: "javascript:alert(1)" } })).status === 400);
  const vignette = "data:image/jpeg;base64,/9j/4AAQ";
  await inst.call("PATCH", `/api/notes/n2/attachments/${idPdf}`, { token: a2, body: { thumb: vignette } });
  t.check("une vraie vignette est gardée", (await lireNote(moi, "n2")).attachments.find((a) => a.id === idPdf)?.thumb === vignette);

  // ── 4. La corbeille et le ménage ────────────────────────────────────
  await creerNote(moi, "n3");
  const id3 = crypto.randomUUID();
  await joindre(moi, "n3", Buffer.from("à jeter un jour"), { id: id3, name: "jeter.bin" });
  await sleep(5600); // le ménage des retraits précédents
  const avantRetrait = fichiersSurDisque().length;
  const tsT = iso();
  await inst.call("POST", "/api/notes/n3/trash", { token: a2, body: { client_updated_at: tsT } });
  const tsR = iso();
  t.check("dans la corbeille, on n'ajoute rien", (await joindre(moi, "n3", Buffer.from("x"))).status === 409);
  await inst.call("POST", "/api/notes/n3/restore", { token: a2, body: { client_updated_at: tsR } });
  t.check("une note restaurée retrouve ses fichiers", (await lireNote(moi, "n3"))?.attachments?.length === 1);
  await inst.call("DELETE", `/api/notes/n3/attachments/${id3}`, { token: a2 });
  t.check("retirer un fichier le retire de la note", (await lireNote(moi, "n3"))?.attachments?.length === 0);
  await sleep(5600);
  t.check("et du disque", fichiersSurDisque().length === avantRetrait - 1, `${avantRetrait} -> ${fichiersSurDisque().length}`);

  await creerNote(moi, "n4");
  const contenu4 = Buffer.from("MARQUEUR-EN-CLAIR-" + "z".repeat(5000));
  await joindre(moi, "n4", contenu4, { name: "secret-du-nom.txt", type: "text/plain" });
  const avantPurge = fichiersSurDisque().length;
  await inst.call("POST", "/api/notes/n4/trash", { token: a2, body: { client_updated_at: iso() } });
  const purgeAlt = await inst.call("DELETE", "/api/notes/n4/permanent", { token: a2, body: { client_updated_at: iso() } });
  await sleep(5600);
  t.check("supprimer une note pour de bon efface ses fichiers", fichiersSurDisque().length === avantPurge - 1, `${purgeAlt.status} ${avantPurge} -> ${fichiersSurDisque().length}`);

  // ── 5. Le chiffrement au repos ──────────────────────────────────────
  await creerNote(moi, "n5");
  const clair = Buffer.from("TEXTE-LISIBLE-DU-FICHIER-" + "y".repeat(3000));
  const id5 = crypto.randomUUID();
  await joindre(moi, "n5", clair, { id: id5, name: "nom-confidentiel.txt", type: "text/plain" });
  const lisible = (m) => fichiersSurDisque().some((f) => readFileSync(f).includes(m));
  t.check("sans chiffrement, le fichier est sur le disque tel quel", lisible("TEXTE-LISIBLE-DU-FICHIER"));
  const PASS = "phrase-de-passe-solide";
  const active = await inst.call("POST", "/api/instance/activate", { token: a2, body: { passphrase: PASS, confirmPassphrase: PASS } });
  t.check("le chiffrement s'active", active.ok, active.text.slice(0, 120));
  await sleep(800);
  t.check("les fichiers existants sont chiffrés", !lisible("TEXTE-LISIBLE-DU-FICHIER"));
  const baseBrute = readFileSync(inst.dbFile);
  t.check("leur nom n'est plus dans la base", !baseBrute.includes("nom-confidentiel"));
  const dl5 = await telecharger((await lien(moi, "n5", id5)).json.url);
  t.check("ils se relisent à l'identique", clair.equals(dl5.corps));
  const id6 = crypto.randomUUID();
  await joindre(moi, "n5", Buffer.from("NOUVEAU-EN-CLAIR-" + "w".repeat(2000)), { id: id6, name: "nouveau-nom.txt", type: "text/plain" });
  t.check("un nouveau fichier arrive chiffré", !lisible("NOUVEAU-EN-CLAIR"));
  t.check("et se relit", (await telecharger((await lien(moi, "n5", id6)).json.url)).corps.toString().startsWith("NOUVEAU-EN-CLAIR"));
  const lienAvantVerrou = await lien(moi, "n5", id5);
  await inst.call("POST", "/api/instance/lock", { token: a2 });
  t.check("instance verrouillée, aucun fichier ne sort", (await telecharger(lienAvantVerrou.json.url)).res.status === 423);
  await inst.call("POST", "/api/instance/unlock", { body: { passphrase: PASS } });
  t.check("déverrouillée, le lien remarche", clair.equals((await telecharger(lienAvantVerrou.json.url)).corps));
  const desactive = await inst.call("POST", "/api/instance/deactivate", { token: a2, body: { passphrase: PASS, currentPassphrase: PASS } });
  t.check("le chiffrement se désactive", desactive.ok, desactive.text.slice(0, 120));
  t.check("les fichiers reviennent en clair", lisible("TEXTE-LISIBLE-DU-FICHIER") && lisible("NOUVEAU-EN-CLAIR"));
  t.check("leur nom revient", (await lireNote(moi, "n5"))?.attachments?.some((a) => a.name === "nouveau-nom.txt"));
  t.check("et ils se relisent", clair.equals((await telecharger((await lien(moi, "n5", id5)).json.url)).corps));
} catch (e) {
  t.check("le scénario va au bout", false, e.stack);
} finally {
  flux?.close();
  inst.stop();
}
process.exit(t.summary() ? 0 : 1);
