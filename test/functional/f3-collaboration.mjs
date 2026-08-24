// Scénario fonctionnel: partage d'une note entre deux comptes.
//
// Ce qui est vérifié ici n'est pas qu'une route répond, mais qu'un
// partage donne exactement les droits annoncés: le collaborateur voit
// le contenu réel, un lecteur seul n'écrit rien du tout, le
// propriétaire n'est jamais remplacé quand quelqu'un d'autre édite, le
// retrait coupe l'accès pour de bon, et un compte étranger ne voit
// rien nulle part.
//
// Trois comptes seulement pour tout le fichier: Alice possède, Bob
// collabore, Carl n'a rien à voir. L'annuaire renvoie la table des
// comptes en entier, donc en créer d'autres au fil des blocs rendrait
// le bloc «annuaire» dépendant de l'ordre d'exécution.
import { startInstance, createAndLogin, listenEvents, runner } from "./lab.mjs";

const PORT = 9513;
const t = runner("Partage d'une note entre deux comptes");

// Horloge monotone: les écritures de note passent par un contrôle
// «dernier écrivain gagne», chaque appel doit donc porter un horodatage
// strictement plus récent que le précédent. On démarre une heure en
// arrière pour ne jamais dépasser le présent (au-delà de 5 minutes
// d'avance le serveur refuse l'horodatage).
let clock = Date.now() - 3600 * 1000;
const nextIso = () => new Date((clock += 1000)).toISOString();

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const j = (v) => JSON.stringify(v);
const cut = (s, n = 180) => String(s ?? "").slice(0, n);

const inst = await startInstance({ port: PORT });
const flux = [];

// Une note créée par un compte. Le serveur accepte l'absence
// d'horodatage mais tous les blocs comparent des états successifs: on
// le fournit toujours pour rester sur l'horloge monotone.
async function creerNote(user, { id, title, content, tags, position }) {
  const ts = nextIso();
  const r = await inst.call("POST", "/api/notes", {
    token: user.token,
    body: { id, title, content, tags, position, timestamp: ts, client_updated_at: ts },
  });
  if (r.status !== 201) throw new Error(`création de ${id} refusée: ${r.status} ${cut(r.text)}`);
  return r.json;
}

const partager = (owner, noteId, username, access) =>
  inst.call("POST", `/api/notes/${noteId}/collaborate`, {
    token: owner.token,
    body: access === undefined ? { username } : { username, access },
  });

const collaborateurs = (user, noteId) =>
  inst.call("GET", `/api/notes/${noteId}/collaborators`, { token: user.token });

// Sonde en base: sert à prouver ce qui a réellement été écrit, jamais à
// contourner l'API.
function enBase(fn) {
  const base = inst.db(true);
  try { return fn(base); } finally { base.close(); }
}

async function ecouter(user) {
  const f = await listenEvents(inst, user.token);
  flux.push(f);
  return f;
}

const donnees = (f, type) => f.events.filter((e) => e.data?.type === type).map((e) => e.data);

try {
  const alice = await createAndLogin(inst, { name: "Alice", email: "alice@x.test", password: "Passw0rd-alice" });
  const bob = await createAndLogin(inst, { name: "Bob", email: "bob@x.test", password: "Passw0rd-bob" });
  const carl = await createAndLogin(inst, { name: "Carl", email: "carl@x.test", password: "Passw0rd-carl" });

  // ─────────────────────────────────────────────────────────────────
  // 1. L'annuaire qui alimente le partage.
  // ─────────────────────────────────────────────────────────────────
  const cherche = await inst.call("GET", "/api/users/search?q=ali", { token: bob.token });
  t.check(
    "chercher « ali » dans l'annuaire ne rend que le compte d'Alice",
    Array.isArray(cherche.json) && cherche.json.length === 1
      && cherche.json[0]?.id === alice.id && cherche.json[0]?.name === "Alice"
      && cherche.json[0]?.email === alice.email && cherche.json[0]?.avatar_url === null,
    `http ${cherche.status}, corps=${cut(cherche.text)}`,
  );

  const vide = await inst.call("GET", "/api/users/search?q=", { token: bob.token });
  t.check(
    "une recherche vide rend l'annuaire entier trié par nom, demandeur compris",
    Array.isArray(vide.json) && same(vide.json.map((u) => u.name), ["Alice", "Bob", "Carl"]),
    `http ${vide.status}, noms=${j((vide.json || []).map((u) => u.name))}`,
  );

  const sansQ = await inst.call("GET", "/api/users/search", { token: bob.token });
  t.check(
    "omettre le paramètre de recherche donne le même résultat qu'une recherche vide",
    same(sansQ.json, vide.json),
    `http ${sansQ.status}, corps=${cut(sansQ.text)}`,
  );

  const inconnu = await inst.call("GET", "/api/users/search?q=zzzzz", { token: bob.token });
  t.check(
    "une recherche sans résultat rend une liste vide et non une erreur",
    inconnu.status === 200 && same(inconnu.json, []),
    `http ${inconnu.status}, corps=${cut(inconnu.text)}`,
  );

  const sansJeton = await inst.call("GET", "/api/users/search?q=ali");
  t.check(
    "l'annuaire est fermé à qui n'est pas connecté",
    sansJeton.status === 401 && sansJeton.json?.error === "Missing token",
    `http ${sansJeton.status}, corps=${cut(sansJeton.text)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 2. Partage nominal: ce que le collaborateur voit, ce que le tiers
  //    ne voit pas. Le partage se fait avec l'email tel que l'annuaire
  //    le rend, c'est le trajet réel du client.
  // ─────────────────────────────────────────────────────────────────
  const annuaireBob = await inst.call("GET", "/api/users/search?q=bob", { token: alice.token });
  const emailAnnuaire = annuaireBob.json?.[0]?.email;

  // Bob possède déjà une note: sans elle, «la note partagée arrive en
  // tête» ne voudrait rien dire.
  await creerNote(bob, { id: "bob-perso", title: "Ma note à moi", content: "rien à voir", position: 1000 });

  const TITRE = "Réunion d'équipe";
  const CORPS = "Ordre du jour: café, budget, congés d'été";
  await creerNote(alice, { id: "n-partage", title: TITRE, content: CORPS, position: 10 });

  const ajout = await partager(alice, "n-partage", emailAnnuaire);
  t.check(
    "l'email rendu par l'annuaire est bien celui qu'accepte le partage",
    emailAnnuaire === bob.email && ajout.status === 200,
    `email annuaire=${j(emailAnnuaire)}, http partage ${ajout.status}`,
  );
  t.check(
    "partager annonce le collaborateur ajouté par son nom, son identifiant et son email",
    ajout.json?.ok === true
      && ajout.json?.message === "Added Bob as collaborator"
      && ajout.json?.collaborator?.id === bob.id
      && ajout.json?.collaborator?.name === "Bob"
      && ajout.json?.collaborator?.email === bob.email,
    `http ${ajout.status}, corps=${cut(ajout.text)}`,
  );

  {
    const lignes = enBase((b) => b
      .prepare("SELECT user_id, added_by, can_write FROM note_collaborators WHERE note_id = ?")
      .all("n-partage"));
    t.check(
      "un partage crée une seule ligne de collaboration, en écriture par défaut, signée du propriétaire",
      lignes.length === 1 && lignes[0].user_id === bob.id
        && lignes[0].added_by === alice.id && lignes[0].can_write === 1,
      `lignes=${j(lignes)}`,
    );
  }

  const vueBob = await inst.call("GET", "/api/notes/n-partage", { token: bob.token });
  t.check(
    "le collaborateur relit le titre et le contenu réels, accents compris",
    vueBob.status === 200 && vueBob.json?.title === TITRE && vueBob.json?.content === CORPS,
    `http ${vueBob.status}, titre=${j(vueBob.json?.title)}, contenu=${j(vueBob.json?.content)}`,
  );
  t.check(
    "le collaborateur voit qu'il est en écriture et que la note appartient à quelqu'un d'autre",
    vueBob.json?.access === "write" && vueBob.json?.user_id === alice.id,
    `access=${j(vueBob.json?.access)}, user_id=${j(vueBob.json?.user_id)} (Alice=${alice.id})`,
  );

  const listeBob = await inst.call("GET", "/api/notes", { token: bob.token });
  const idsBob = (listeBob.json || []).map((n) => n.id);
  t.check(
    "la note partagée arrive devant les notes que le collaborateur possédait déjà",
    idsBob.indexOf("n-partage") !== -1
      && idsBob.indexOf("n-partage") < idsBob.indexOf("bob-perso"),
    `http ${listeBob.status}, ordre=${j(idsBob)}`,
  );

  const collabBob = await inst.call("GET", "/api/notes/collaborated", { token: bob.token });
  const partageeBob = (collabBob.json || []).find((n) => n.id === "n-partage");
  t.check(
    "la note partagée figure dans la liste des notes collaborées du collaborateur",
    Array.isArray(collabBob.json) && !!partageeBob
      && partageeBob.title === TITRE && partageeBob.access === "write"
      && partageeBob.user_id === alice.id,
    `http ${collabBob.status}, trouvée=${j(partageeBob && { titre: partageeBob.title, access: partageeBob.access, user_id: partageeBob.user_id })}`,
  );

  const collabAlice = await inst.call("GET", "/api/notes/collaborated", { token: alice.token });
  t.check(
    "le propriétaire ne retrouve pas sa propre note dans ses notes collaborées",
    Array.isArray(collabAlice.json) && !collabAlice.json.some((n) => n.id === "n-partage"),
    `http ${collabAlice.status}, ids=${j((collabAlice.json || []).map((n) => n.id))}`,
  );

  const roster = await collaborateurs(bob, "n-partage");
  const [proprio, second] = roster.json || [];
  t.check(
    "la liste des participants compte le propriétaire ET le collaborateur, propriétaire en tête",
    Array.isArray(roster.json) && roster.json.length === 2
      && proprio?.id === alice.id && proprio?.isOwner === true && second?.id === bob.id,
    `http ${roster.status}, corps=${cut(roster.text)}`,
  );
  t.check(
    "le propriétaire est marqué comme tel et n'a pas de date d'ajout",
    proprio?.name === "Alice" && proprio?.email === alice.email
      && proprio?.canWrite === 1
      && !("added_at" in (proprio || {})) && !("added_by" in (proprio || {})),
    `propriétaire=${j(proprio)}`,
  );
  t.check(
    "le collaborateur porte son droit d'écriture, sa date d'ajout et qui l'a ajouté",
    second?.canWrite === 1 && typeof second?.added_at === "string"
      && second?.added_by === alice.id && second?.isOwner === undefined,
    `collaborateur=${j(second)}`,
  );

  const rosterAlice = await collaborateurs(alice, "n-partage");
  t.check(
    "propriétaire et collaborateur voient exactement la même liste de participants",
    same(rosterAlice.json, roster.json),
    `côté Alice=${cut(rosterAlice.text)}`,
  );

  // Le tiers: rien, nulle part.
  const listeCarl = await inst.call("GET", "/api/notes", { token: carl.token });
  t.check(
    "un compte étranger ne voit pas la note dans sa liste",
    Array.isArray(listeCarl.json) && !listeCarl.json.some((n) => n.id === "n-partage"),
    `http ${listeCarl.status}, ids=${j((listeCarl.json || []).map((n) => n.id))}`,
  );
  const collabCarl = await inst.call("GET", "/api/notes/collaborated", { token: carl.token });
  t.check(
    "un compte étranger n'a aucune note collaborée",
    Array.isArray(collabCarl.json) && collabCarl.json.length === 0,
    `http ${collabCarl.status}, corps=${cut(collabCarl.text)}`,
  );
  const noteCarl = await inst.call("GET", "/api/notes/n-partage", { token: carl.token });
  t.check(
    "un compte étranger qui devine l'identifiant de la note se voit répondre qu'elle n'existe pas",
    noteCarl.status === 404 && noteCarl.json?.error === "Note not found",
    `http ${noteCarl.status}, corps=${cut(noteCarl.text)}`,
  );
  const rosterCarl = await collaborateurs(carl, "n-partage");
  t.check(
    "un compte étranger ne peut pas non plus lire la liste des participants",
    rosterCarl.status === 404 && rosterCarl.json?.error === "Note not found",
    `http ${rosterCarl.status}, corps=${cut(rosterCarl.text)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 3. Lecture seule: le collaborateur lit tout et n'écrit rien.
  // ─────────────────────────────────────────────────────────────────
  const TITRE_L = "Budget 2026";
  const CORPS_L = "Chiffres confidentiels: 12 500 €";
  await creerNote(alice, { id: "n-lecture", title: TITRE_L, content: CORPS_L, position: 20 });
  const partageL = await partager(alice, "n-lecture", bob.email, "read");
  t.check(
    "un partage en lecture seule est accepté comme un autre",
    partageL.status === 200 && partageL.json?.ok === true,
    `http ${partageL.status}, corps=${cut(partageL.text)}`,
  );

  const lectureBob = await inst.call("GET", "/api/notes/n-lecture", { token: bob.token });
  t.check(
    "un lecteur seul voit le contenu entier de la note, pas une version tronquée",
    lectureBob.status === 200 && lectureBob.json?.title === TITRE_L
      && lectureBob.json?.content === CORPS_L && lectureBob.json?.access === "read",
    `http ${lectureBob.status}, titre=${j(lectureBob.json?.title)}, access=${j(lectureBob.json?.access)}`,
  );

  const rosterL = await collaborateurs(alice, "n-lecture");
  t.check(
    "la liste des participants affiche le lecteur seul comme privé d'écriture",
    (rosterL.json || []).find((c) => c.id === bob.id)?.canWrite === 0,
    `http ${rosterL.status}, corps=${cut(rosterL.text)}`,
  );

  const patchInterdit = await inst.call("PATCH", "/api/notes/n-lecture", {
    token: bob.token, body: { title: "pirate", client_updated_at: nextIso() },
  });
  t.check(
    "la retouche d'un lecteur seul est annoncée comme lecture seule au lieu d'être appliquée",
    patchInterdit.status === 200 && patchInterdit.json?.ok === true
      && patchInterdit.json?.readOnly === true,
    `http ${patchInterdit.status}, corps=${cut(patchInterdit.text)}`,
  );

  const putInterdit = await inst.call("PUT", "/api/notes/n-lecture", {
    token: bob.token, body: { title: "pirate2", content: "x", client_updated_at: nextIso() },
  });
  t.check(
    "le remplacement complet par un lecteur seul est refusé de la même façon",
    putInterdit.status === 200 && putInterdit.json?.readOnly === true,
    `http ${putInterdit.status}, corps=${cut(putInterdit.text)}`,
  );

  const relueAlice = await inst.call("GET", "/api/notes/n-lecture", { token: alice.token });
  t.check(
    "après les deux tentatives, la note du propriétaire est intacte et n'a pas changé de dernier éditeur",
    relueAlice.json?.title === TITRE_L && relueAlice.json?.content === CORPS_L
      && relueAlice.json?.lastEditedBy === "Alice",
    `titre=${j(relueAlice.json?.title)}, contenu=${j(relueAlice.json?.content)}, dernier éditeur=${j(relueAlice.json?.lastEditedBy)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 4. Le propriétaire n'est jamais remplacé quand un collaborateur
  //    modifie la note.
  // ─────────────────────────────────────────────────────────────────
  await creerNote(alice, { id: "n-proprio", title: "Liste de courses", content: "pain", position: 30 });
  await partager(alice, "n-proprio", bob.email, "write");

  const ecritBob = await inst.call("PUT", "/api/notes/n-proprio", {
    token: bob.token,
    body: { title: "Liste de courses (revue)", content: "pain, lait, œufs", client_updated_at: nextIso() },
  });
  t.check(
    "un collaborateur en écriture voit sa modification acceptée",
    ecritBob.status === 200 && ecritBob.json?.ok === true
      && !ecritBob.json?.readOnly && !ecritBob.json?.stale
      && ecritBob.json?.note?.title === "Liste de courses (revue)",
    `http ${ecritBob.status}, corps=${cut(ecritBob.text)}`,
  );
  t.check(
    "même en écrivant, le collaborateur reste un collaborateur et pas le propriétaire",
    ecritBob.json?.note?.user_id === alice.id && ecritBob.json?.note?.access === "write",
    `user_id=${j(ecritBob.json?.note?.user_id)} (Alice=${alice.id}), access=${j(ecritBob.json?.note?.access)}`,
  );

  const apresBob = await inst.call("GET", "/api/notes/n-proprio", { token: alice.token });
  t.check(
    "le propriétaire retrouve le texte écrit par le collaborateur",
    apresBob.json?.title === "Liste de courses (revue)"
      && apresBob.json?.content === "pain, lait, œufs",
    `titre=${j(apresBob.json?.title)}, contenu=${j(apresBob.json?.content)}`,
  );
  t.check(
    "la note reste celle du propriétaire, avec le collaborateur comme dernier éditeur",
    apresBob.json?.user_id === alice.id && apresBob.json?.access === "owner"
      && apresBob.json?.lastEditedBy === "Bob",
    `user_id=${j(apresBob.json?.user_id)}, access=${j(apresBob.json?.access)}, dernier éditeur=${j(apresBob.json?.lastEditedBy)}`,
  );

  {
    const ligne = enBase((b) => b
      .prepare("SELECT user_id, last_edited_by FROM notes WHERE id = ?")
      .get("n-proprio"));
    t.check(
      "en base aussi, la colonne propriétaire n'a pas bougé d'un pouce",
      ligne?.user_id === alice.id && ligne?.last_edited_by === "Bob",
      `ligne=${j(ligne)} (Alice=${alice.id})`,
    );
  }

  const rosterProprio = await collaborateurs(alice, "n-proprio");
  t.check(
    "l'écriture du collaborateur n'a pas réécrit la liste des participants",
    (rosterProprio.json || []).length === 2
      && rosterProprio.json[0]?.id === alice.id && rosterProprio.json[0]?.isOwner === true
      && rosterProprio.json[1]?.id === bob.id && rosterProprio.json[1]?.isOwner === undefined,
    `http ${rosterProprio.status}, corps=${cut(rosterProprio.text)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 5. Passage lecture seule vers écriture, puis retour.
  // ─────────────────────────────────────────────────────────────────
  await creerNote(alice, { id: "n-bascule", title: "Titre initial", content: "corps", position: 40 });
  await partager(alice, "n-bascule", bob.email, "read");
  const fluxBascule = await ecouter(bob);

  const versEcriture = await inst.call("PATCH", `/api/notes/n-bascule/collaborate/${bob.id}`, {
    token: alice.token, body: { access: "write" },
  });
  t.check(
    "ouvrir l'écriture à un collaborateur répond en confirmant le seul droit accordé",
    versEcriture.status === 200 && versEcriture.json?.ok === true
      && versEcriture.json?.access === "write"
      && !("note" in (versEcriture.json || {})) && !("collaborator" in (versEcriture.json || {})),
    `http ${versEcriture.status}, corps=${cut(versEcriture.text)}`,
  );

  const evtEcriture = await fluxBascule.waitFor(
    (e) => e.data?.type === "note_access_changed" && e.data?.noteId === "n-bascule" && e.data?.access === "write",
  );
  t.check(
    "le collaborateur est prévenu en direct que son droit passe à l'écriture",
    !!evtEcriture,
    `événements reçus=${j(fluxBascule.events.map((e) => e.type || e.data?.type))}`,
  );

  t.check(
    "la liste des participants reflète immédiatement le passage en écriture",
    ((await collaborateurs(alice, "n-bascule")).json || []).find((c) => c.id === bob.id)?.canWrite === 1,
    `corps=${cut((await collaborateurs(alice, "n-bascule")).text)}`,
  );

  const ecritApresOuverture = await inst.call("PATCH", "/api/notes/n-bascule", {
    token: bob.token, body: { title: "Titre par Bob", client_updated_at: nextIso() },
  });
  t.check(
    "le collaborateur écrit au coup d'après, sans nouveau partage",
    ecritApresOuverture.status === 200 && !ecritApresOuverture.json?.readOnly
      && ecritApresOuverture.json?.note?.title === "Titre par Bob",
    `http ${ecritApresOuverture.status}, corps=${cut(ecritApresOuverture.text)}`,
  );

  const versLecture = await inst.call("PATCH", `/api/notes/n-bascule/collaborate/${bob.id}`, {
    token: alice.token, body: { access: "read" },
  });
  t.check(
    "refermer le droit en lecture seule répond de la même façon",
    versLecture.status === 200 && versLecture.json?.access === "read",
    `http ${versLecture.status}, corps=${cut(versLecture.text)}`,
  );

  const evtLecture = await fluxBascule.waitFor(
    (e) => e.data?.type === "note_access_changed" && e.data?.noteId === "n-bascule" && e.data?.access === "read",
  );
  t.check(
    "le collaborateur est prévenu en direct que son droit retombe en lecture seule",
    !!evtLecture,
    `changements reçus=${j(donnees(fluxBascule, "note_access_changed").map((d) => d.access))}`,
  );

  const ecritApresFermeture = await inst.call("PATCH", "/api/notes/n-bascule", {
    token: bob.token, body: { title: "Encore Bob", client_updated_at: nextIso() },
  });
  const finBascule = await inst.call("GET", "/api/notes/n-bascule", { token: alice.token });
  t.check(
    "une fois le droit refermé, la modification suivante ne passe plus et le titre ne bouge pas",
    ecritApresFermeture.json?.readOnly === true && finBascule.json?.title === "Titre par Bob",
    `readOnly=${j(ecritApresFermeture.json?.readOnly)}, titre chez Alice=${j(finBascule.json?.title)}`,
  );
  t.check(
    "la liste des participants est retombée en lecture seule",
    ((await collaborateurs(alice, "n-bascule")).json || []).find((c) => c.id === bob.id)?.canWrite === 0,
    `corps=${cut((await collaborateurs(alice, "n-bascule")).text)}`,
  );
  fluxBascule.close();

  // ─────────────────────────────────────────────────────────────────
  // 6. Étiquettes, épingle: personnelles à chaque participant.
  // ─────────────────────────────────────────────────────────────────
  await creerNote(alice, {
    id: "n-perso", title: "Partagé", content: "corps commun", tags: ["alice"], position: 50,
  });
  await partager(alice, "n-perso", bob.email, "write");

  await inst.call("PATCH", "/api/notes/n-perso", {
    token: bob.token, body: { tags: ["bob"], client_updated_at: nextIso() },
  });
  const epingle = await inst.call("PATCH", "/api/notes/n-perso", {
    token: bob.token, body: { pinned: true },
  });
  t.check(
    "épingler une note partagée est un réglage personnel qui ne réclame pas d'horodatage",
    epingle.status === 200 && epingle.json?.ok === true
      && epingle.json?.note?.pinned === true && !("readOnly" in (epingle.json || {})),
    `http ${epingle.status}, corps=${cut(epingle.text)}`,
  );

  const persoAlice = await inst.call("GET", "/api/notes/n-perso", { token: alice.token });
  const persoBob = await inst.call("GET", "/api/notes/n-perso", { token: bob.token });
  t.check(
    "l'étiquette posée par le collaborateur ne remplace pas celle du propriétaire",
    same(persoAlice.json?.tags, ["alice"]) && same(persoBob.json?.tags, ["bob"]),
    `Alice=${j(persoAlice.json?.tags)}, Bob=${j(persoBob.json?.tags)}`,
  );
  t.check(
    "l'épingle de l'un ne se voit pas chez l'autre",
    persoBob.json?.pinned === true && persoAlice.json?.pinned === false,
    `épingle Bob=${j(persoBob.json?.pinned)}, épingle Alice=${j(persoAlice.json?.pinned)}`,
  );
  t.check(
    "le titre et le contenu, eux, sont bien les mêmes des deux côtés",
    persoAlice.json?.title === persoBob.json?.title
      && persoAlice.json?.content === persoBob.json?.content
      && persoBob.json?.title === "Partagé",
    `Alice=${j([persoAlice.json?.title, persoAlice.json?.content])}, Bob=${j([persoBob.json?.title, persoBob.json?.content])}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 7. Le retrait d'un collaborateur et la perte d'accès qui suit.
  // ─────────────────────────────────────────────────────────────────
  await creerNote(alice, { id: "n-retrait", title: "À retirer", content: "contenu", position: 60 });
  await partager(alice, "n-retrait", bob.email, "write");
  await inst.call("PATCH", "/api/notes/n-retrait", {
    token: bob.token, body: { tags: ["bob"], client_updated_at: nextIso() },
  });
  {
    const traces = enBase((b) => ({
      tags: b.prepare("SELECT COUNT(*) AS c FROM note_user_tags WHERE note_id = ? AND user_id = ?").get("n-retrait", bob.id).c,
      pos: b.prepare("SELECT COUNT(*) AS c FROM note_user_positions WHERE note_id = ? AND user_id = ?").get("n-retrait", bob.id).c,
    }));
    t.check(
      "avant le retrait, le collaborateur a bien des traces personnelles sur la note",
      traces.tags === 1 && traces.pos === 1,
      `traces=${j(traces)}`,
    );
  }

  const fluxRetrait = await ecouter(bob);
  const retrait = await inst.call("DELETE", `/api/notes/n-retrait/collaborate/${bob.id}`, {
    token: alice.token,
  });
  t.check(
    "retirer un collaborateur est confirmé, sans copie de consolation",
    retrait.status === 200 && retrait.json?.ok === true
      && retrait.json?.message === "Collaborator removed" && retrait.json?.copyNoteId === null,
    `http ${retrait.status}, corps=${cut(retrait.text)}`,
  );

  const evtRevoque = await fluxRetrait.waitFor(
    (e) => e.data?.type === "note_access_revoked" && e.data?.noteId === "n-retrait",
  );
  t.check(
    "le retiré apprend en direct qu'il a perdu l'accès, et qu'aucune copie ne l'attend",
    !!evtRevoque && evtRevoque.data?.copyNoteId === null,
    `événement=${j(evtRevoque?.data)}`,
  );
  const evtRevoqueNotif = await fluxRetrait.waitFor(
    (e) => e.data?.type === "note_access_revoked_notification"
      && e.data?.notificationType === "note_access_revoked" && e.data?.noteId === "n-retrait",
  );
  t.check(
    "le retiré reçoit aussi la notification durable du retrait",
    !!evtRevoqueNotif,
    `types reçus=${j(fluxRetrait.events.map((e) => e.type || e.data?.type))}`,
  );
  fluxRetrait.close();

  const apresRetraitNote = await inst.call("GET", "/api/notes/n-retrait", { token: bob.token });
  t.check(
    "après le retrait, la note n'existe plus pour l'ex-collaborateur",
    apresRetraitNote.status === 404 && apresRetraitNote.json?.error === "Note not found",
    `http ${apresRetraitNote.status}, corps=${cut(apresRetraitNote.text)}`,
  );
  const apresRetraitCollab = await inst.call("GET", "/api/notes/collaborated", { token: bob.token });
  t.check(
    "la note disparaît de ses notes collaborées",
    !(apresRetraitCollab.json || []).some((n) => n.id === "n-retrait"),
    `ids=${j((apresRetraitCollab.json || []).map((n) => n.id))}`,
  );
  const apresRetraitListe = await inst.call("GET", "/api/notes", { token: bob.token });
  t.check(
    "la note disparaît aussi de sa liste principale",
    !(apresRetraitListe.json || []).some((n) => n.id === "n-retrait"),
    `ids=${j((apresRetraitListe.json || []).map((n) => n.id))}`,
  );
  const ecritureApresRetrait = await inst.call("PATCH", "/api/notes/n-retrait", {
    token: bob.token, body: { title: "revenu par la fenêtre", client_updated_at: nextIso() },
  });
  t.check(
    "l'ex-collaborateur ne peut plus écrire dans la note qu'il vient de quitter",
    ecritureApresRetrait.status === 404 && ecritureApresRetrait.json?.error === "Note not found",
    `http ${ecritureApresRetrait.status}, corps=${cut(ecritureApresRetrait.text)}`,
  );
  const contenuIntact = await inst.call("GET", "/api/notes/n-retrait", { token: alice.token });
  t.check(
    "le propriétaire garde sa note et son contenu après le retrait",
    contenuIntact.status === 200 && contenuIntact.json?.title === "À retirer"
      && contenuIntact.json?.content === "contenu",
    `http ${contenuIntact.status}, titre=${j(contenuIntact.json?.title)}`,
  );
  const rosterRetrait = await collaborateurs(alice, "n-retrait");
  t.check(
    "la liste des participants se réduit au seul propriétaire",
    (rosterRetrait.json || []).length === 1 && rosterRetrait.json[0]?.id === alice.id
      && rosterRetrait.json[0]?.isOwner === true,
    `http ${rosterRetrait.status}, corps=${cut(rosterRetrait.text)}`,
  );

  {
    const traces = enBase((b) => ({
      tags: b.prepare("SELECT COUNT(*) AS c FROM note_user_tags WHERE note_id = ? AND user_id = ?").get("n-retrait", bob.id).c,
      pos: b.prepare("SELECT COUNT(*) AS c FROM note_user_positions WHERE note_id = ? AND user_id = ?").get("n-retrait", bob.id).c,
    }));
    t.check(
      "le retrait efface les étiquettes et le rangement personnels du retiré",
      traces.tags === 0 && traces.pos === 0,
      `traces restantes=${j(traces)}`,
    );
  }

  const retraitBis = await inst.call("DELETE", `/api/notes/n-retrait/collaborate/${bob.id}`, {
    token: alice.token,
  });
  t.check(
    "retirer deux fois la même personne dit clairement qu'il n'y a plus personne à retirer",
    retraitBis.status === 404 && retraitBis.json?.error === "Collaborator not found",
    `http ${retraitBis.status}, corps=${cut(retraitBis.text)}`,
  );

  {
    const notifsBob = await inst.call("GET", "/api/notifications/pending", { token: bob.token });
    const notifsAlice = await inst.call("GET", "/api/notifications/pending", { token: alice.token });
    const pourBob = (notifsBob.json?.notifications || []).filter((n) => n.note_id === "n-retrait");
    const pourAlice = (notifsAlice.json?.notifications || []).filter((n) => n.note_id === "n-retrait");
    const dun = (liste, type) => liste.filter((n) => n.type === type);
    t.check(
      "le retrait laisse une trace durable des deux côtés: perte d'accès chez le retiré, confirmation chez le propriétaire",
      dun(pourBob, "note_access_revoked").length === 1
        && dun(pourBob, "collaborator_removed").length === 0
        && dun(pourAlice, "collaborator_removed").length === 1
        && dun(pourAlice, "collaborator_removed")[0].sender_name === "Bob"
        && dun(pourAlice, "note_access_revoked").length === 0,
      `Bob=${j(pourBob.map((n) => n.type))}, Alice=${j(pourAlice.map((n) => [n.type, n.sender_name]))}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // 8. Retrait avec copie conservée.
  // ─────────────────────────────────────────────────────────────────
  await creerNote(alice, { id: "n-copie", title: "Recette", content: "farine, œufs", position: 70 });
  await partager(alice, "n-copie", bob.email, "write");
  await inst.call("PATCH", "/api/notes/n-copie", {
    token: bob.token, body: { tags: ["perso-bob"], client_updated_at: nextIso() },
  });

  const avecCopie = await inst.call("DELETE", `/api/notes/n-copie/collaborate/${bob.id}`, {
    token: alice.token, body: { mode: "keep_copy" },
  });
  const copieId = avecCopie.json?.copyNoteId;
  t.check(
    "retirer en laissant une copie annonce l'identifiant de la copie, différent de l'original",
    avecCopie.status === 200 && typeof copieId === "string" && copieId.length > 0
      && copieId !== "n-copie",
    `http ${avecCopie.status}, corps=${cut(avecCopie.text)}`,
  );

  const listeApresCopie = await inst.call("GET", "/api/notes", { token: bob.token });
  const copie = (listeApresCopie.json || []).find((n) => n.id === copieId);
  t.check(
    "le retiré retrouve dans ses notes une copie dont il est cette fois le propriétaire",
    !!copie && copie.user_id === bob.id && copie.access === "owner"
      && copie.title === "Recette" && copie.content === "farine, œufs",
    `copie=${j(copie && { id: copie.id, user_id: copie.user_id, access: copie.access, title: copie.title })}`,
  );
  // Les étiquettes personnelles du retiré partent avec sa copie: c'est
  // ce que le serveur annonce, et il faut qu'elles soient rangées là où
  // la lecture va les chercher, dans note_user_tags. Écrites dans la
  // colonne partagée, elles étaient bien recopiées mais plus jamais
  // lues, et Bob récupérait une note nue.
  {
    const lignesPerso = enBase((b) => b
      .prepare("SELECT COUNT(*) c FROM note_user_tags WHERE note_id = ? AND user_id = ?")
      .get(copieId, bob.id).c);
    const colonnePartagee = enBase((b) => b
      .prepare("SELECT tags_json FROM notes WHERE id = ?").get(copieId)?.tags_json);
    t.check(
      "le retiré retrouve ses étiquettes personnelles sur sa copie",
      same(copie?.tags, ["perso-bob"]) && lignesPerso === 1,
      `étiquettes lues=${j(copie?.tags)}, lignes personnelles=${lignesPerso}`,
    );
    t.check(
      "et elles sont rangées là où la lecture les cherche, pas dans la colonne partagée",
      colonnePartagee === "[]",
      `colonne partagée=${j(colonnePartagee)}`,
    );
  }

  const originalPerdu = await inst.call("GET", "/api/notes/n-copie", { token: bob.token });
  t.check(
    "la note d'origine reste inaccessible au retiré, malgré la copie",
    originalPerdu.status === 404,
    `http ${originalPerdu.status}, corps=${cut(originalPerdu.text)}`,
  );
  {
    const notifs = await inst.call("GET", "/api/notifications/pending", { token: bob.token });
    const avecCopieNotif = (notifs.json?.notifications || [])
      .filter((n) => n.type === "note_access_revoked_with_copy");
    t.check(
      "la notification du retiré pointe vers la copie qu'il conserve, pas vers la note perdue",
      avecCopieNotif.length === 1 && avecCopieNotif[0].note_id === copieId,
      `notifications=${j(avecCopieNotif.map((n) => [n.type, n.note_id]))}, copie=${j(copieId)}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // 9. Le collaborateur quitte la note de lui-même.
  // ─────────────────────────────────────────────────────────────────
  await creerNote(alice, { id: "n-depart", title: "Note quittée", content: "contenu", position: 80 });
  await partager(alice, "n-depart", bob.email, "write");

  const depart = await inst.call("DELETE", `/api/notes/n-depart/collaborate/${bob.id}`, {
    token: bob.token, body: { mode: "keep_copy" },
  });
  t.check(
    "un collaborateur peut quitter la note lui-même, et partir volontairement ne donne droit à aucune copie",
    depart.status === 200 && depart.json?.ok === true
      && depart.json?.message === "Collaborator removed" && depart.json?.copyNoteId === null,
    `http ${depart.status}, corps=${cut(depart.text)}`,
  );
  const apresDepart = await inst.call("GET", "/api/notes/n-depart", { token: bob.token });
  t.check(
    "celui qui est parti n'a plus accès à la note",
    apresDepart.status === 404,
    `http ${apresDepart.status}, corps=${cut(apresDepart.text)}`,
  );
  {
    const notifs = await inst.call("GET", "/api/notifications/pending", { token: alice.token });
    const pour = (notifs.json?.notifications || []).filter((n) => n.note_id === "n-depart");
    t.check(
      "le propriétaire est averti d'un départ volontaire, et non d'un retrait qu'il aurait décidé",
      pour.length === 1 && pour[0].type === "collaborator_left" && pour[0].sender_name === "Bob",
      `notifications=${j(pour.map((n) => [n.type, n.sender_name]))}`,
    );
  }

  // Deux collaborateurs sur la même note: aucun ne peut évincer l'autre.
  await creerNote(alice, { id: "n-duo", title: "À deux", content: "contenu", position: 90 });
  await partager(alice, "n-duo", bob.email, "write");
  await partager(alice, "n-duo", carl.email, "write");

  const evinceAutre = await inst.call("DELETE", `/api/notes/n-duo/collaborate/${carl.id}`, {
    token: bob.token,
  });
  t.check(
    "un collaborateur ne peut pas évincer un autre collaborateur",
    evinceAutre.status === 403
      && evinceAutre.json?.error === "Only note owner can remove other collaborators",
    `http ${evinceAutre.status}, corps=${cut(evinceAutre.text)}`,
  );
  const evinceProprio = await inst.call("DELETE", `/api/notes/n-duo/collaborate/${alice.id}`, {
    token: bob.token,
  });
  t.check(
    "un collaborateur ne peut pas non plus évincer le propriétaire",
    evinceProprio.status === 403
      && evinceProprio.json?.error === "Only note owner can remove other collaborators",
    `http ${evinceProprio.status}, corps=${cut(evinceProprio.text)}`,
  );
  const rosterDuo = await collaborateurs(alice, "n-duo");
  t.check(
    "après ces deux refus, les trois participants sont toujours là",
    (rosterDuo.json || []).length === 3,
    `http ${rosterDuo.status}, ids=${j((rosterDuo.json || []).map((c) => c.id))}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 10. Le collaborateur ne supprime pas pour tout le monde, le
  //     propriétaire si.
  // ─────────────────────────────────────────────────────────────────
  await creerNote(alice, { id: "n-suppr", title: "À supprimer", content: "contenu", position: 100 });
  await partager(alice, "n-suppr", bob.email, "write");
  const fluxSuppr = await ecouter(bob);

  const supprPourTous = await inst.call("POST", "/api/notes/n-suppr/trash", {
    token: bob.token, body: { mode: "delete_for_all", client_updated_at: nextIso() },
  });
  t.check(
    "un collaborateur ne peut pas supprimer la note pour tout le monde",
    supprPourTous.status === 403
      && supprPourTous.json?.error === "Only owner can delete for all collaborators",
    `http ${supprPourTous.status}, corps=${cut(supprPourTous.text)}`,
  );
  const supprAncienne = await inst.call("DELETE", "/api/notes/n-suppr", { token: bob.token });
  t.check(
    "l'ancienne route de suppression directe est fermée, pour le collaborateur comme pour les autres",
    supprAncienne.status === 410 && String(supprAncienne.json?.error || "").startsWith("Deprecated"),
    `http ${supprAncienne.status}, corps=${cut(supprAncienne.text)}`,
  );
  const toujoursLa = await inst.call("GET", "/api/notes/n-suppr", { token: bob.token });
  t.check(
    "après ces deux refus la note est toujours là pour le collaborateur",
    toujoursLa.status === 200 && toujoursLa.json?.title === "À supprimer",
    `http ${toujoursLa.status}, titre=${j(toujoursLa.json?.title)}`,
  );

  const supprProprio = await inst.call("POST", "/api/notes/n-suppr/trash", {
    token: alice.token, body: { mode: "delete_for_all", client_updated_at: nextIso() },
  });
  t.check(
    "le propriétaire, lui, supprime pour tout le monde et garde la note dans sa corbeille",
    supprProprio.status === 200 && supprProprio.json?.ok === true
      && supprProprio.json?.deletedForAll === true && supprProprio.json?.note?.trashed === true,
    `http ${supprProprio.status}, corps=${cut(supprProprio.text)}`,
  );

  const evtSuppr = await fluxSuppr.waitFor(
    (e) => e.data?.type === "note_deleted" && e.data?.noteId === "n-suppr",
  );
  t.check(
    "le collaborateur apprend en direct que la note partagée a été supprimée",
    !!evtSuppr,
    `types reçus=${j(fluxSuppr.events.map((e) => e.type || e.data?.type))}`,
  );
  const evtSupprNotif = await fluxSuppr.waitFor(
    (e) => e.data?.type === "note_access_revoked_notification"
      && e.data?.notificationType === "shared_note_deleted",
  );
  t.check(
    "il en garde une trace durable, pour la retrouver même s'il était déconnecté",
    !!evtSupprNotif && evtSupprNotif.data?.noteTitle === "À supprimer",
    `notification=${j(evtSupprNotif?.data)}`,
  );
  fluxSuppr.close();

  const supprListeBob = await inst.call("GET", "/api/notes", { token: bob.token });
  const supprCollabBob = await inst.call("GET", "/api/notes/collaborated", { token: bob.token });
  const supprCorbeilleBob = await inst.call("GET", "/api/notes/trashed", { token: bob.token });
  t.check(
    "la note quitte les deux listes du collaborateur sans atterrir dans sa corbeille",
    !(supprListeBob.json || []).some((n) => n.id === "n-suppr")
      && !(supprCollabBob.json || []).some((n) => n.id === "n-suppr")
      && !(supprCorbeilleBob.json || []).some((n) => n.id === "n-suppr"),
    `liste=${j((supprListeBob.json || []).map((n) => n.id))}, corbeille=${j((supprCorbeilleBob.json || []).map((n) => n.id))}`,
  );
  const corbeilleAlice = await inst.call("GET", "/api/notes/trashed", { token: alice.token });
  t.check(
    "chez le propriétaire, la note est bien dans la corbeille et donc récupérable",
    (corbeilleAlice.json || []).some((n) => n.id === "n-suppr"),
    `ids=${j((corbeilleAlice.json || []).map((n) => n.id))}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 11. Les refus attendus autour du partage.
  // ─────────────────────────────────────────────────────────────────
  await creerNote(alice, { id: "n-refus", title: "Refus", content: "contenu", position: 110 });

  const soiMeme = await partager(alice, "n-refus", alice.email);
  t.check(
    "on ne peut pas se partager une note à soi-même",
    soiMeme.status === 400 && soiMeme.json?.error === "Cannot collaborate with yourself",
    `http ${soiMeme.status}, corps=${cut(soiMeme.text)}`,
  );

  const parUnTiers = await partager(carl, "n-refus", bob.email);
  t.check(
    "un étranger ne peut pas partager la note de quelqu'un d'autre",
    parUnTiers.status === 404 && parUnTiers.json?.error === "Note not found",
    `http ${parUnTiers.status}, corps=${cut(parUnTiers.text)}`,
  );

  const sansCible = await inst.call("POST", "/api/notes/n-refus/collaborate", {
    token: alice.token, body: { access: "write" },
  });
  t.check(
    "partager sans dire à qui est refusé",
    sansCible.status === 400 && sansCible.json?.error === "Username is required",
    `http ${sansCible.status}, corps=${cut(sansCible.text)}`,
  );

  const cibleInconnue = await partager(alice, "n-refus", "personne@x.test");
  t.check(
    "partager avec un compte qui n'existe pas est refusé",
    cibleInconnue.status === 404 && cibleInconnue.json?.error === "User not found",
    `http ${cibleInconnue.status}, corps=${cut(cibleInconnue.text)}`,
  );

  const noteInconnue = await partager(alice, "n-existe-pas", bob.email);
  t.check(
    "partager une note qui n'existe pas est refusé",
    noteInconnue.status === 404 && noteInconnue.json?.error === "Note not found",
    `http ${noteInconnue.status}, corps=${cut(noteInconnue.text)}`,
  );

  const parNom = await partager(alice, "n-refus", "bob");
  t.check(
    "le partage accepte aussi le nom du compte, sans se soucier de la casse",
    parNom.status === 200 && parNom.json?.collaborator?.id === bob.id,
    `http ${parNom.status}, corps=${cut(parNom.text)}`,
  );

  const doublon = await partager(alice, "n-refus", bob.email);
  t.check(
    "repartager la même note à la même personne est refusé comme un doublon",
    doublon.status === 409 && doublon.json?.error === "User is already a collaborator",
    `http ${doublon.status}, corps=${cut(doublon.text)}`,
  );
  {
    const lignes = enBase((b) => b
      .prepare("SELECT COUNT(*) AS c FROM note_collaborators WHERE note_id = ? AND user_id = ?")
      .get("n-refus", bob.id).c);
    t.check(
      "le doublon refusé n'a pas créé de seconde ligne de collaboration",
      lignes === 1,
      `lignes=${lignes}`,
    );
  }

  const partageParCollab = await partager(bob, "n-refus", carl.email);
  t.check(
    "un collaborateur ne peut pas repartager la note à un troisième compte",
    partageParCollab.status === 404 && partageParCollab.json?.error === "Note not found",
    `http ${partageParCollab.status}, corps=${cut(partageParCollab.text)}`,
  );

  const droitParCollab = await inst.call("PATCH", `/api/notes/n-refus/collaborate/${bob.id}`, {
    token: bob.token, body: { access: "write" },
  });
  t.check(
    "un collaborateur ne peut pas s'attribuer lui-même un droit d'écriture",
    droitParCollab.status === 404 && droitParCollab.json?.error === "Note not found",
    `http ${droitParCollab.status}, corps=${cut(droitParCollab.text)}`,
  );

  const droitAbsurde = await inst.call("PATCH", `/api/notes/n-refus/collaborate/${bob.id}`, {
    token: alice.token, body: { access: "rw" },
  });
  t.check(
    "un droit qui n'existe pas est refusé au lieu d'être interprété",
    droitAbsurde.status === 400 && droitAbsurde.json?.error === "access must be 'read' or 'write'",
    `http ${droitAbsurde.status}, corps=${cut(droitAbsurde.text)}`,
  );

  // Le partage doit refuser un droit inconnu comme le fait le changement
  // de droit ci-dessus. Retomber sur l'écriture était un échec en mode
  // ouvert: qui écrivait « READ » croyait restreindre et donnait tout.
  await creerNote(alice, { id: "n-casse", title: "Casse", content: "c", position: 200 });
  const casses = [];
  for (const valeur of ["READ", "readonly", "read-only", "lecture", true, 0]) {
    const r = await partager(alice, "n-casse", carl.email, valeur);
    const lignes = enBase((b) => b
      .prepare("SELECT COUNT(*) c FROM note_collaborators WHERE note_id = ?").get("n-casse").c);
    casses.push({ valeur, status: r.status, lignes });
  }
  t.check(
    "un droit de partage écrit autrement que « read » ou « write » est refusé, pas deviné",
    casses.every((c) => c.status === 400 && c.lignes === 0),
    `essais=${j(casses)}`,
  );

  const lectureExacte = await partager(alice, "n-casse", carl.email, "read");
  const droitCarl = enBase((b) => b
    .prepare("SELECT can_write FROM note_collaborators WHERE note_id = ? AND user_id = ?")
    .get("n-casse", carl.id)?.can_write);
  t.check(
    "écrit exactement « read », le partage donne bien la lecture seule",
    lectureExacte.status === 200 && droitCarl === 0,
    `http ${lectureExacte.status}, can_write=${j(droitCarl)}`,
  );

  const droitNonCollab = await inst.call("PATCH", `/api/notes/n-refus/collaborate/${carl.id}`, {
    token: alice.token, body: { access: "write" },
  });
  t.check(
    "on ne peut pas changer le droit de quelqu'un qui ne collabore pas sur la note",
    droitNonCollab.status === 404 && droitNonCollab.json?.error === "Collaborator not found",
    `http ${droitNonCollab.status}, corps=${cut(droitNonCollab.text)}`,
  );

  const droitIdBidon = await inst.call("PATCH", "/api/notes/n-refus/collaborate/abc", {
    token: alice.token, body: { access: "write" },
  });
  const retraitIdBidon = await inst.call("DELETE", "/api/notes/n-refus/collaborate/abc", {
    token: alice.token,
  });
  t.check(
    "un identifiant de collaborateur qui n'est pas un nombre est rejeté sur les deux routes",
    droitIdBidon.status === 400 && droitIdBidon.json?.error === "Invalid user id"
      && retraitIdBidon.status === 400 && retraitIdBidon.json?.error === "Invalid user id",
    `droit http ${droitIdBidon.status} ${cut(droitIdBidon.text, 60)}, retrait http ${retraitIdBidon.status} ${cut(retraitIdBidon.text, 60)}`,
  );

  const retraitProprioParLuiMeme = await inst.call("DELETE", `/api/notes/n-refus/collaborate/${alice.id}`, {
    token: alice.token,
  });
  t.check(
    "le propriétaire ne peut pas se retirer de sa propre note par cette route: il n'y est pas collaborateur",
    retraitProprioParLuiMeme.status === 404
      && retraitProprioParLuiMeme.json?.error === "Collaborator not found",
    `http ${retraitProprioParLuiMeme.status}, corps=${cut(retraitProprioParLuiMeme.text)}`,
  );

  const partageSansJeton = await inst.call("POST", "/api/notes/n-refus/collaborate", {
    body: { username: bob.email },
  });
  t.check(
    "partager sans être connecté est refusé avant tout le reste",
    partageSansJeton.status === 401 && partageSansJeton.json?.error === "Missing token",
    `http ${partageSansJeton.status}, corps=${cut(partageSansJeton.text)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 12. Notifications et événements du partage. Les flux s'ouvrent
  //     avant le partage: l'événement part au moment du POST.
  // ─────────────────────────────────────────────────────────────────
  const fluxNotifBob = await ecouter(bob);
  const fluxNotifCarl = await ecouter(carl);

  const TITRE_N = "Note à partager";
  await creerNote(alice, { id: "n-notif", title: TITRE_N, content: "contenu", position: 120 });
  const partageNotif = await partager(alice, "n-notif", bob.email, "read");
  t.check(
    "le partage qui doit déclencher la notification est bien passé",
    partageNotif.status === 200,
    `http ${partageNotif.status}, corps=${cut(partageNotif.text)}`,
  );

  const evtPartage = await fluxNotifBob.waitFor((e) => e.data?.type === "note_shared" && e.data?.noteId === "n-notif");
  t.check(
    "le destinataire est prévenu en direct du partage, avec le nom de l'expéditeur, le titre et le droit accordé",
    !!evtPartage && evtPartage.data?.senderName === "Alice"
      && evtPartage.data?.noteTitle === TITRE_N && evtPartage.data?.readOnly === true
      && typeof evtPartage.data?.notificationId === "number",
    `événement=${j(evtPartage?.data)}`,
  );
  const evtMaj = await fluxNotifBob.waitFor((e) => e.data?.type === "note_updated" && e.data?.noteId === "n-notif");
  t.check(
    "il reçoit aussi l'invitation à rafraîchir la note qui vient d'entrer dans sa liste",
    !!evtMaj,
    `types reçus=${j(fluxNotifBob.events.map((e) => e.type || e.data?.type))}`,
  );

  const doublonNotif = await partager(alice, "n-notif", bob.email, "read");
  // Barrière non temporelle: un second partage, sur une AUTRE note,
  // dont l'arrivée prouve que tout ce qui précédait est déjà passé sur
  // le même flux.
  await creerNote(alice, { id: "n-barriere", title: "Barrière", content: "contenu", position: 130 });
  await partager(alice, "n-barriere", bob.email);
  const evtBarriere = await fluxNotifBob.waitFor(
    (e) => e.data?.type === "note_shared" && e.data?.noteId === "n-barriere",
  );
  t.check(
    "un partage sans droit précisé est annoncé comme un partage en écriture",
    !!evtBarriere && evtBarriere.data?.readOnly === false,
    `événement=${j(evtBarriere?.data)}`,
  );
  t.check(
    "le partage refusé en doublon n'annonce rien une seconde fois au destinataire",
    doublonNotif.status === 409
      && donnees(fluxNotifBob, "note_shared").filter((d) => d.noteId === "n-notif").length === 1,
    `http doublon ${doublonNotif.status}, annonces pour n-notif=${donnees(fluxNotifBob, "note_shared").filter((d) => d.noteId === "n-notif").length}`,
  );

  {
    const notifs = await inst.call("GET", "/api/notifications/pending", { token: bob.token });
    const pour = (notifs.json?.notifications || [])
      .filter((n) => n.note_id === "n-notif" && n.type === "note_shared");
    t.check(
      "une seule notification durable de partage est déposée, et elle dit que le partage est en lecture seule",
      pour.length === 1 && pour[0].sender_name === "Alice"
        && pour[0].note_title === TITRE_N && pour[0].variant === "read_only",
      `notifications=${j(pour)}`,
    );
  }

  t.check(
    "le compte étranger, lui, ne reçoit rien de tout cela sur son flux",
    donnees(fluxNotifCarl, "note_shared").length === 0
      && fluxNotifCarl.events.filter((e) => e.data?.noteId === "n-notif" || e.data?.noteId === "n-barriere").length === 0,
    `flux de Carl=${j(fluxNotifCarl.events.map((e) => e.type || e.data?.type))}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 13. Une commande de corbeille arrivée en retard ne s'applique pas,
  //     y compris sur une note partagée. C'est là que ça compte le plus:
  //     quitter une note et la retirer à tout le monde sont les deux
  //     gestes qu'un appareil resté hors ligne ne doit pas pouvoir
  //     rejouer une heure plus tard.
  // ─────────────────────────────────────────────────────────────────
  {
    const enRetard = new Date(Date.parse(nextIso()) - 3600 * 1000).toISOString();

    await creerNote(alice, { id: "n-retard-a", title: "Départ tardif", content: "c", position: 210 });
    await partager(alice, "n-retard-a", bob.email, "write");
    const bobPart = await inst.call("POST", "/api/notes/n-retard-a/trash", {
      token: bob.token, body: { client_updated_at: enRetard },
    });
    const bobVoitEncore = await inst.call("GET", "/api/notes/n-retard-a", { token: bob.token });
    const collabRestants = enBase((b) => b
      .prepare("SELECT COUNT(*) c FROM note_collaborators WHERE note_id = ?").get("n-retard-a").c);
    t.check(
      "un collaborateur ne peut pas quitter une note avec une commande périmée",
      bobPart.status === 200 && bobPart.json?.stale === true && !bobPart.json?.left
        && bobVoitEncore.status === 200 && collabRestants === 1,
      `http ${bobPart.status}, corps=${cut(bobPart.text, 90)}, lignes=${collabRestants}`,
    );

    await creerNote(alice, { id: "n-retard-b", title: "Retrait tardif", content: "c", position: 220 });
    await partager(alice, "n-retard-b", bob.email, "write");
    const pourTous = await inst.call("POST", "/api/notes/n-retard-b/trash", {
      token: alice.token, body: { mode: "delete_for_all", client_updated_at: enRetard },
    });
    const bobGarde = await inst.call("GET", "/api/notes/n-retard-b", { token: bob.token });
    t.check(
      "et le propriétaire ne peut pas retirer la note à tout le monde avec une commande périmée",
      pourTous.status === 200 && pourTous.json?.stale === true && !pourTous.json?.deletedForAll
        && bobGarde.status === 200,
      `http ${pourTous.status}, corps=${cut(pourTous.text, 90)}, Bob=${bobGarde.status}`,
    );

    const pourTousAJour = await inst.call("POST", "/api/notes/n-retard-b/trash", {
      token: alice.token, body: { mode: "delete_for_all", client_updated_at: nextIso() },
    });
    const bobPerd = await inst.call("GET", "/api/notes/n-retard-b", { token: bob.token });
    t.check(
      "la même commande, à l'heure, s'applique bel et bien",
      pourTousAJour.json?.deletedForAll === true && bobPerd.status === 404,
      `http ${pourTousAJour.status}, corps=${cut(pourTousAJour.text, 90)}, Bob=${bobPerd.status}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // 14. Les notes archivées restent visibles dans les notes
  //     collaborées, contrairement à la liste principale.
  // ─────────────────────────────────────────────────────────────────
  const archive = await inst.call("POST", "/api/notes/n-partage/archive", {
    token: alice.token, body: { archived: true, client_updated_at: nextIso() },
  });
  const listeArchive = await inst.call("GET", "/api/notes", { token: bob.token });
  const collabArchive = await inst.call("GET", "/api/notes/collaborated", { token: bob.token });
  t.check(
    "archiver une note partagée la retire de la liste principale du collaborateur mais la laisse dans ses notes collaborées",
    archive.status === 200
      && !(listeArchive.json || []).some((n) => n.id === "n-partage")
      && (collabArchive.json || []).some((n) => n.id === "n-partage"),
    `http archive ${archive.status}, liste=${j((listeArchive.json || []).map((n) => n.id))}, collaborées=${j((collabArchive.json || []).map((n) => n.id))}`,
  );
} finally {
  for (const f of flux) f.close();
  inst.stop();
}

process.exit(t.summary() ? 0 : 1);
