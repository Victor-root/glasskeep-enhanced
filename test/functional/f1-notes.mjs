// Scénario fonctionnel: le cycle de vie d'une note.
//
// Ce qui est vérifié ici n'est pas qu'une route répond, mais qu'une note
// écrite se relit à l'identique: son texte, ses éléments cochés, ses
// images, sa couleur, son icône. Puis qu'elle traverse la corbeille et
// les archives sans rien perdre, que l'écriture en retard ne l'écrase
// pas, et qu'un inconnu ne la voit pas.
//
// Chaque bloc travaille sur son propre compte: les listes (/api/notes,
// /archived, /trashed) rendent tout ce que possède l'utilisateur, donc
// mêler deux blocs sur un même compte fausserait les comptages.
import { startInstance, createAndLogin, listenEvents, runner } from "./lab.mjs";

const PORT = 9511;
const t = runner("Cycle de vie d'une note");

// Horloge monotone: le serveur arbitre les écritures concurrentes sur
// client_updated_at, chaque appel doit donc porter un horodatage plus
// récent que le précédent. On démarre une heure en arrière pour avoir
// de la marge sans jamais dépasser le présent (au-delà de 5 minutes
// d'avance, le serveur refuse).
let horloge = Date.now() - 3600 * 1000;
const iso = () => new Date((horloge += 1000)).toISOString();
// Une heure de retard sur l'horloge du scénario: de quoi jouer une
// écriture qui arrive trop tard, quelle que soit l'étape en cours.
const retard = () => new Date(horloge - 3600 * 1000).toISOString();

const memeJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const vue = (v) => JSON.stringify(v);
const bout = (s, n = 150) => String(s ?? "").slice(0, n);
const titres = (liste) => (Array.isArray(liste) ? liste.map((n) => n.title) : liste);

const IMAGE = {
  id: "img-1",
  src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
  name: "façade.png",
};
const ICONE = { id: "L1", src: "data:image/png;base64,AA", name: "logo.png" };

// Contenu audio accepté par validateAudioContent: du JSON, un type MIME
// audio autorisé.
const AUDIO_OK = JSON.stringify({
  version: 2,
  clips: [{ audioDataUrl: "data:audio/webm;base64,AAAA", mimeType: "audio/webm", duration: 2 }],
});

const inst = await startInstance({ port: PORT });
const compte = (nom) => createAndLogin(inst, {
  name: nom, email: `${nom}@glasskeep.test`, password: `Passw0rd-${nom}`,
});

try {
  // ─────────────────────────────────────────────────────────────────
  // 1. Le cycle complet d'une note texte: créer, relire, modifier,
  //    jeter, restaurer, supprimer pour de bon.
  // ─────────────────────────────────────────────────────────────────
  const cyc = await compte("cycle");
  const tsCreation = iso();
  const cree = await inst.call("POST", "/api/notes", {
    token: cyc.token,
    body: {
      id: "cyc-1", type: "text", title: "Courses de Noël",
      content: "pain, café", color: "blue", tags: ["maison"],
      images: [IMAGE], timestamp: tsCreation, client_updated_at: tsCreation,
    },
  });
  t.check(
    "créer une note rend la note elle-même, avec exactement ce qui a été envoyé",
    cree.status === 201 && cree.json?.id === "cyc-1"
      && cree.json?.title === "Courses de Noël" && cree.json?.content === "pain, café"
      && cree.json?.color === "blue" && cree.json?.type === "text"
      && memeJson(cree.json?.tags, ["maison"]) && memeJson(cree.json?.images, [IMAGE]),
    `http ${cree.status}, corps=${bout(cree.text)}`,
  );
  t.check(
    "une note neuve n'est ni archivée ni à la corbeille, et appartient à son auteur",
    cree.json?.archived === false && cree.json?.trashed === false
      && cree.json?.access === "owner" && cree.json?.user_id === cyc.id,
    `archived=${vue(cree.json?.archived)}, trashed=${vue(cree.json?.trashed)}, access=${vue(cree.json?.access)}, user_id=${vue(cree.json?.user_id)}`,
  );
  t.check(
    "la création retient déjà qui a écrit en dernier, sous son nom d'utilisateur",
    cree.json?.lastEditedBy === "cycle" && typeof cree.json?.lastEditedAt === "string"
      && typeof cree.json?.updated_at === "string",
    `lastEditedBy=${vue(cree.json?.lastEditedBy)}, lastEditedAt=${vue(cree.json?.lastEditedAt)}, updated_at=${vue(cree.json?.updated_at)}`,
  );

  const relu = await inst.call("GET", "/api/notes/cyc-1", { token: cyc.token });
  t.check(
    "relire la note rend le même contenu, accents compris",
    relu.status === 200 && relu.json?.title === "Courses de Noël"
      && relu.json?.content === "pain, café" && relu.json?.color === "blue"
      && relu.json?.type === "text" && memeJson(relu.json?.tags, ["maison"])
      && memeJson(relu.json?.images, [IMAGE]),
    `http ${relu.status}, titre=${vue(relu.json?.title)}, contenu=${vue(relu.json?.content)}`,
  );

  const modifie = await inst.call("PATCH", "/api/notes/cyc-1", {
    token: cyc.token, body: { content: "pain, café et lait", client_updated_at: iso() },
  });
  t.check(
    "modifier le seul contenu laisse le titre, la couleur et les images en place",
    modifie.status === 200 && modifie.json?.ok === true && !modifie.json?.stale
      && modifie.json?.note?.content === "pain, café et lait"
      && modifie.json?.note?.title === "Courses de Noël"
      && modifie.json?.note?.color === "blue"
      && memeJson(modifie.json?.note?.images, [IMAGE]),
    `http ${modifie.status}, stale=${vue(modifie.json?.stale)}, note=${bout(vue(modifie.json?.note))}`,
  );

  // L'icône et l'épinglage vivent dans des tables annexes: on les pose
  // ici pour vérifier plus bas qu'ils partent bien avec la note.
  await inst.call("PUT", "/api/notes/cyc-1/icon", { token: cyc.token, body: { icon: ICONE } });
  await inst.call("PATCH", "/api/notes/cyc-1", { token: cyc.token, body: { pinned: true } });

  const active = await inst.call("GET", "/api/notes", { token: cyc.token });
  t.check(
    "la note modifiée figure dans la liste des notes actives, avec le nouveau contenu",
    active.status === 200 && Array.isArray(active.json) && active.json.length === 1
      && active.json[0].id === "cyc-1" && active.json[0].content === "pain, café et lait",
    `http ${active.status}, liste=${bout(vue(active.json))}`,
  );

  const jetee = await inst.call("POST", "/api/notes/cyc-1/trash", {
    token: cyc.token, body: { client_updated_at: iso() },
  });
  t.check(
    "jeter une note la marque comme étant à la corbeille",
    jetee.status === 200 && jetee.json?.ok === true && !jetee.json?.stale
      && jetee.json?.note?.trashed === true,
    `http ${jetee.status}, note=${bout(vue(jetee.json?.note))}`,
  );

  const apresJet = await inst.call("GET", "/api/notes", { token: cyc.token });
  const corbeille = await inst.call("GET", "/api/notes/trashed", { token: cyc.token });
  const luDansCorbeille = await inst.call("GET", "/api/notes/cyc-1", { token: cyc.token });
  t.check(
    "une note à la corbeille reste consultable par son identifiant, marquée comme telle",
    luDansCorbeille.status === 200 && luDansCorbeille.json?.trashed === true
      && luDansCorbeille.json?.content === "pain, café et lait",
    `http ${luDansCorbeille.status}, trashed=${vue(luDansCorbeille.json?.trashed)}, contenu=${vue(luDansCorbeille.json?.content)}`,
  );
  t.check(
    "une note jetée quitte la liste active et se retrouve dans la corbeille, intacte",
    Array.isArray(apresJet.json) && apresJet.json.length === 0
      && Array.isArray(corbeille.json) && corbeille.json.length === 1
      && corbeille.json[0].id === "cyc-1"
      && corbeille.json[0].content === "pain, café et lait"
      && corbeille.json[0].title === "Courses de Noël"
      && memeJson(corbeille.json[0].tags, ["maison"])
      && memeJson(corbeille.json[0].images, [IMAGE])
      && memeJson(corbeille.json[0].icon, ICONE),
    `active=${vue(titres(apresJet.json))}, corbeille=${bout(vue(corbeille.json))}`,
  );

  const restaure = await inst.call("POST", "/api/notes/cyc-1/restore", {
    token: cyc.token, body: { client_updated_at: iso() },
  });
  const apresRestore = await inst.call("GET", "/api/notes", { token: cyc.token });
  const corbeilleVide = await inst.call("GET", "/api/notes/trashed", { token: cyc.token });
  t.check(
    "restaurer une note la sort de la corbeille et la remet dans la liste active",
    restaure.status === 200 && restaure.json?.note?.trashed === false
      && Array.isArray(apresRestore.json) && apresRestore.json.length === 1
      && apresRestore.json[0].id === "cyc-1"
      && Array.isArray(corbeilleVide.json) && corbeilleVide.json.length === 0,
    `http ${restaure.status}, trashed=${vue(restaure.json?.note?.trashed)}, active=${vue(titres(apresRestore.json))}, corbeille=${vue(titres(corbeilleVide.json))}`,
  );
  t.check(
    "un aller-retour par la corbeille ne perd ni le contenu, ni les étiquettes, ni l'icône",
    apresRestore.json?.[0]?.content === "pain, café et lait"
      && apresRestore.json?.[0]?.title === "Courses de Noël"
      && memeJson(apresRestore.json?.[0]?.tags, ["maison"])
      && memeJson(apresRestore.json?.[0]?.images, [IMAGE])
      && memeJson(apresRestore.json?.[0]?.icon, ICONE),
    `note=${bout(vue(apresRestore.json?.[0]))}`,
  );

  const trotVite = await inst.call("DELETE", "/api/notes/cyc-1/permanent", {
    token: cyc.token, body: { client_updated_at: iso() },
  });
  t.check(
    "on ne peut pas supprimer définitivement une note qui n'est pas à la corbeille",
    trotVite.status === 400 && trotVite.json?.error === "Note must be in trash to permanently delete",
    `http ${trotVite.status}, corps=${bout(trotVite.text)}`,
  );

  await inst.call("POST", "/api/notes/cyc-1/trash", { token: cyc.token, body: { client_updated_at: iso() } });

  // Une suppression définitive est irréversible: elle ne doit partir
  // que sur une demande complète et à jour.
  const supprSansHorodatage = await inst.call("DELETE", "/api/notes/cyc-1/permanent", { token: cyc.token });
  const supprEnRetard = await inst.call("DELETE", "/api/notes/cyc-1/permanent", {
    token: cyc.token, body: { client_updated_at: retard() },
  });
  const rescapee = await inst.call("GET", "/api/notes/cyc-1", { token: cyc.token });
  t.check(
    "une suppression définitive sans horodatage, ou arrivée en retard, n'efface pas la note",
    supprSansHorodatage.status === 400
      && supprSansHorodatage.json?.error === "client_updated_at is required"
      && supprEnRetard.json?.stale === true
      && rescapee.status === 200 && rescapee.json?.title === "Courses de Noël",
    `sans horodatage=${supprSansHorodatage.status}/${vue(supprSansHorodatage.json?.error)}, en retard=${supprEnRetard.status}/stale=${vue(supprEnRetard.json?.stale)}, note=${vue(rescapee.json?.title)}`,
  );

  const definitif = await inst.call("DELETE", "/api/notes/cyc-1/permanent", {
    token: cyc.token, body: { client_updated_at: iso() },
  });
  t.check(
    "la suppression définitive se contente de confirmer, elle ne rend aucune note",
    definitif.status === 200 && memeJson(Object.keys(definitif.json || {}), ["ok"])
      && definitif.json?.ok === true,
    `http ${definitif.status}, corps=${bout(definitif.text)}`,
  );

  const disparue = await inst.call("GET", "/api/notes/cyc-1", { token: cyc.token });
  const corbeilleApres = await inst.call("GET", "/api/notes/trashed", { token: cyc.token });
  t.check(
    "une note supprimée définitivement n'est plus lisible nulle part",
    disparue.status === 404 && disparue.json?.error === "Note not found"
      && Array.isArray(corbeilleApres.json) && corbeilleApres.json.length === 0,
    `http ${disparue.status}, corps=${bout(disparue.text)}, corbeille=${vue(titres(corbeilleApres.json))}`,
  );

  {
    // Sonde en base: la suppression définitive doit emporter les tables
    // annexes, sinon les étiquettes et icônes s'accumulent en fantômes.
    const base = inst.db(true);
    const restes = {
      notes: base.prepare("SELECT COUNT(*) AS c FROM notes WHERE id = ?").get("cyc-1").c,
      etiquettes: base.prepare("SELECT COUNT(*) AS c FROM note_user_tags WHERE note_id = ?").get("cyc-1").c,
      icones: base.prepare("SELECT COUNT(*) AS c FROM note_user_icons WHERE note_id = ?").get("cyc-1").c,
      positions: base.prepare("SELECT COUNT(*) AS c FROM note_user_positions WHERE note_id = ?").get("cyc-1").c,
    };
    base.close();
    t.check(
      "supprimer définitivement emporte aussi les étiquettes, l'icône et la position de la note",
      restes.notes === 0 && restes.etiquettes === 0 && restes.icones === 0 && restes.positions === 0,
      `restes=${vue(restes)}`,
    );
  }

  // Une note a une seule forme, quelle que soit la route qui la rend.
  // La liste la construisait à la main et en sortait une variante à qui
  // il manquait le drapeau de corbeille: le client ne pouvait pas traiter
  // une note de la même façon selon d'où elle venait.
  {
    const frm = await compte("forme");
    const cree = await inst.call("POST", "/api/notes", {
      token: frm.token, body: { id: "frm-1", title: "Forme", content: "c", client_updated_at: iso() },
    });
    const liste = await inst.call("GET", "/api/notes", { token: frm.token });
    const seule = await inst.call("GET", "/api/notes/frm-1", { token: frm.token });
    const patchee = await inst.call("PATCH", "/api/notes/frm-1", {
      token: frm.token, body: { title: "Forme bis", client_updated_at: iso() },
    });

    const clesListe = Object.keys(liste.json?.[0] || {}).sort();
    const clesSeule = Object.keys(seule.json || {}).sort();
    const clesEcriture = Object.keys(patchee.json?.note || {}).sort();
    t.check(
      "la liste et la lecture d'une note seule rendent exactement les mêmes champs",
      memeJson(clesListe, clesSeule) && clesListe.length > 0,
      `liste=${vue(clesListe)}, seule=${vue(clesSeule)}`,
    );
    t.check(
      "toutes deux disent si la note est à la corbeille, ce qui manquait à la liste",
      liste.json?.[0]?.trashed === false && seule.json?.trashed === false,
      `liste=${vue(liste.json?.[0]?.trashed)}, seule=${vue(seule.json?.trashed)}`,
    );
    t.check(
      "une écriture rend la même note, au trombinoscope près qui n'appartient qu'à la lecture",
      memeJson(clesEcriture, clesListe.filter((k) => k !== "collaborators")),
      `écriture=${vue(clesEcriture)}`,
    );
    t.check("la note support de ce bloc a bien été créée", cree.status === 201, `http ${cree.status}`);

    // Un identifiant déjà pris par quelqu'un d'AUTRE faisait tomber le
    // serveur en page d'erreur HTML, illisible pour la file de
    // synchronisation. La note visée n'est ni écrasée ni divulguée.
    const frmBis = await compte("formebis");
    const conflit = await inst.call("POST", "/api/notes", {
      token: frmBis.token, body: { id: "frm-1", title: "Vol d'identifiant", client_updated_at: iso() },
    });
    const chezLautre = await inst.call("GET", "/api/notes/frm-1", { token: frm.token });
    t.check(
      "créer une note avec l'identifiant de quelqu'un d'autre est refusé en JSON, pas en page d'erreur",
      conflit.status === 409 && typeof conflit.json?.error === "string"
        && chezLautre.json?.title === "Forme bis",
      `http ${conflit.status}, corps=${bout(conflit.text, 90)}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // 2. Les types de note réellement gérés par le serveur.
  // ─────────────────────────────────────────────────────────────────
  const typ = await compte("types");
  const parDefaut = await inst.call("POST", "/api/notes", { token: typ.token, body: {} });
  t.check(
    "une note créée sans rien préciser est une note texte vide, et elle est acceptée",
    parDefaut.status === 201 && parDefaut.json?.type === "text"
      && parDefaut.json?.title === "" && parDefaut.json?.content === ""
      && memeJson(parDefaut.json?.items, []) && memeJson(parDefaut.json?.images, [])
      && parDefaut.json?.color === "default" && typeof parDefaut.json?.id === "string",
    `http ${parDefaut.status}, note=${bout(vue(parDefaut.json))}`,
  );

  const dessin = await inst.call("POST", "/api/notes", {
    token: typ.token, body: { id: "typ-draw", type: "draw", content: "{\"traits\":[]}", client_updated_at: iso() },
  });
  const inconnu = await inst.call("POST", "/api/notes", {
    token: typ.token, body: { id: "typ-x", type: "recette", title: "type inventé", client_updated_at: iso() },
  });
  t.check(
    "le type dessin est conservé, un type inventé retombe silencieusement sur le texte",
    dessin.json?.type === "draw" && inconnu.status === 201 && inconnu.json?.type === "text",
    `draw=${vue(dessin.json?.type)}, inventé=${vue(inconnu.json?.type)} (http ${inconnu.status})`,
  );

  const listeCourses = await inst.call("POST", "/api/notes", {
    token: typ.token,
    body: {
      id: "typ-check", type: "checklist", title: "Liste",
      content: "ce texte n'a rien à faire là", client_updated_at: iso(),
    },
  });
  t.check(
    "une liste de courses ne garde pas de contenu libre: le texte envoyé est effacé",
    listeCourses.status === 201 && listeCourses.json?.type === "checklist"
      && listeCourses.json?.content === "",
    `type=${vue(listeCourses.json?.type)}, contenu=${vue(listeCourses.json?.content)}`,
  );

  const couleurVide = await inst.call("POST", "/api/notes", {
    token: typ.token, body: { id: "typ-couleur", color: "", client_updated_at: iso() },
  });
  t.check(
    "une couleur vide retombe sur la couleur par défaut",
    couleurVide.json?.color === "default",
    `couleur=${vue(couleurVide.json?.color)}`,
  );

  const audioVide = await inst.call("POST", "/api/notes", {
    token: typ.token, body: { type: "audio" },
  });
  const audioTexte = await inst.call("POST", "/api/notes", {
    token: typ.token, body: { type: "audio", content: "bonjour" },
  });
  const audioSansClip = await inst.call("POST", "/api/notes", {
    token: typ.token, body: { type: "audio", content: JSON.stringify({ version: 2 }) },
  });
  const audioMauvaisMime = await inst.call("POST", "/api/notes", {
    token: typ.token,
    body: { type: "audio", content: JSON.stringify({ version: 2, clips: [{ audioDataUrl: "data:image/png;base64,AA" }] }) },
  });
  t.check(
    "une note vocale sans enregistrement valable est refusée, en disant pourquoi",
    audioVide.status === 400 && audioVide.json?.error === "Audio note has no content"
      && audioTexte.status === 400 && audioTexte.json?.error === "Audio note content is not valid JSON"
      && audioSansClip.status === 400 && audioSansClip.json?.error === "Audio note is missing recordings"
      && audioMauvaisMime.status === 400 && audioMauvaisMime.json?.error === "Unsupported audio MIME type",
    `vide=${audioVide.status}/${vue(audioVide.json?.error)}, texte=${audioTexte.status}/${vue(audioTexte.json?.error)}, sansClip=${audioSansClip.status}/${vue(audioSansClip.json?.error)}, mime=${audioMauvaisMime.status}/${vue(audioMauvaisMime.json?.error)}`,
  );

  const audioBon = await inst.call("POST", "/api/notes", {
    token: typ.token,
    body: { id: "typ-audio", type: "audio", title: "Mémo", content: AUDIO_OK, client_updated_at: iso() },
  });
  const audioRelu = await inst.call("GET", "/api/notes/typ-audio", { token: typ.token });
  t.check(
    "une note vocale valable est acceptée et son enregistrement se relit à l'identique",
    audioBon.status === 201 && audioBon.json?.type === "audio"
      && audioRelu.json?.content === AUDIO_OK,
    `http ${audioBon.status}, contenu relu identique=${audioRelu.json?.content === AUDIO_OK}`,
  );

  const audioAbime = await inst.call("PATCH", "/api/notes/typ-audio", {
    token: typ.token, body: { content: "plus du tout de l'audio", client_updated_at: iso() },
  });
  const audioIntact = await inst.call("GET", "/api/notes/typ-audio", { token: typ.token });
  t.check(
    "on ne peut pas remplacer l'enregistrement d'une note vocale par du texte quelconque",
    audioAbime.status === 400 && audioAbime.json?.error === "Audio note content is not valid JSON"
      && audioIntact.json?.content === AUDIO_OK,
    `http ${audioAbime.status}, erreur=${vue(audioAbime.json?.error)}, contenu préservé=${audioIntact.json?.content === AUDIO_OK}`,
  );

  const typeParPatch = await inst.call("PATCH", "/api/notes/typ-x", {
    token: typ.token, body: { type: "checklist", items: [{ id: "a", text: "un", done: false }], client_updated_at: iso() },
  });
  t.check(
    "une modification partielle transforme bien une note texte en liste à cocher",
    typeParPatch.status === 200 && typeParPatch.json?.note?.type === "checklist"
      && memeJson(typeParPatch.json?.note?.items, [{ id: "a", text: "un", done: false }]),
    `type=${vue(typeParPatch.json?.note?.type)}, items=${bout(vue(typeParPatch.json?.note?.items))}`,
  );

  t.check(
    "devenue liste, la note ne garde pas son ancien paragraphe de texte",
    typeParPatch.json?.note?.content === "",
    `contenu=${vue(typeParPatch.json?.note?.content)}`,
  );

  const typeInvente = await inst.call("PATCH", "/api/notes/typ-x", {
    token: typ.token, body: { type: "recette", client_updated_at: iso() },
  });
  const typeApresInvente = await inst.call("GET", "/api/notes/typ-x", { token: typ.token });
  t.check(
    "un type qui n'existe pas est refusé au lieu de ramener la note au texte",
    typeInvente.status === 400 && typeApresInvente.json?.type === "checklist",
    `http ${typeInvente.status}, ${vue(typeInvente.json?.error)}, type=${vue(typeApresInvente.json?.type)}`,
  );

  const typeParPut = await inst.call("PUT", "/api/notes/typ-x", {
    token: typ.token,
    body: { type: "text", title: "revenue au texte", content: "du texte", client_updated_at: iso() },
  });
  t.check(
    "le remplacement complet convertit lui aussi, dans l'autre sens",
    typeParPut.status === 200 && typeParPut.json?.note?.type === "text"
      && typeParPut.json?.note?.content === "du texte",
    `type=${vue(typeParPut.json?.note?.type)}, contenu=${vue(typeParPut.json?.note?.content)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 3. La règle du dernier écrivain: une écriture en retard n'écrase
  //    pas une note plus récente.
  // ─────────────────────────────────────────────────────────────────
  const lww = await compte("horloge");
  const tRecent = iso();
  await inst.call("POST", "/api/notes", {
    token: lww.token, body: { id: "lww-1", title: "départ", client_updated_at: tRecent },
  });
  const versionRecente = await inst.call("PATCH", "/api/notes/lww-1", {
    token: lww.token, body: { title: "version récente", client_updated_at: tRecent },
  });
  const enRetard = retard();
  const versionRetard = await inst.call("PATCH", "/api/notes/lww-1", {
    token: lww.token, body: { title: "version en retard", client_updated_at: enRetard },
  });
  const apresRetard = await inst.call("GET", "/api/notes/lww-1", { token: lww.token });
  t.check(
    "une modification arrivée en retard est écartée et rend l'état conservé par le serveur",
    versionRecente.json?.note?.title === "version récente"
      && versionRetard.status === 200 && versionRetard.json?.stale === true
      && versionRetard.json?.note?.title === "version récente"
      && apresRetard.json?.title === "version récente",
    `retard: http ${versionRetard.status}, stale=${vue(versionRetard.json?.stale)}, titre rendu=${vue(versionRetard.json?.note?.title)}, titre relu=${vue(apresRetard.json?.title)}`,
  );

  const memeInstant = await inst.call("PATCH", "/api/notes/lww-1", {
    token: lww.token, body: { title: "même instant", client_updated_at: tRecent },
  });
  t.check(
    "une modification portant exactement le même instant que la précédente est acceptée",
    memeInstant.status === 200 && !memeInstant.json?.stale
      && memeInstant.json?.note?.title === "même instant",
    `http ${memeInstant.status}, stale=${vue(memeInstant.json?.stale)}, titre=${vue(memeInstant.json?.note?.title)}`,
  );

  const sansZ = await inst.call("PATCH", "/api/notes/lww-1", {
    token: lww.token, body: { title: "x", client_updated_at: "2026-01-01 10:00:00" },
  });
  const decale = await inst.call("PATCH", "/api/notes/lww-1", {
    token: lww.token, body: { title: "x", client_updated_at: "2026-01-01T10:00:00+02:00" },
  });
  const futur = await inst.call("PATCH", "/api/notes/lww-1", {
    token: lww.token, body: { title: "x", client_updated_at: new Date(Date.now() + 3600 * 1000).toISOString() },
  });
  const sansHorodatage = await inst.call("PATCH", "/api/notes/lww-1", {
    token: lww.token, body: { title: "x" },
  });
  t.check(
    "un horodatage mal formé, décalé ou dans le futur est refusé, et l'absence aussi",
    sansZ.status === 400 && String(sansZ.json?.error).startsWith("Invalid timestamp format")
      && decale.status === 400 && String(decale.json?.error).startsWith("Invalid timestamp format")
      && futur.status === 400 && String(futur.json?.error).startsWith("Timestamp too far in the future")
      && sansHorodatage.status === 400 && sansHorodatage.json?.error === "client_updated_at is required",
    `sansZ=${sansZ.status}/${vue(sansZ.json?.error)}, décalé=${decale.status}, futur=${futur.status}/${vue(futur.json?.error)}, absent=${sansHorodatage.status}/${vue(sansHorodatage.json?.error)}`,
  );

  const titreSurvivant = await inst.call("GET", "/api/notes/lww-1", { token: lww.token });
  t.check(
    "aucune des quatre tentatives refusées n'a touché à la note",
    titreSurvivant.json?.title === "même instant",
    `titre=${vue(titreSurvivant.json?.title)}`,
  );

  const enRetardComplet = await inst.call("PUT", "/api/notes/lww-1", {
    token: lww.token, body: { title: "remplacement en retard", client_updated_at: enRetard },
  });
  const archiveEnRetard = await inst.call("POST", "/api/notes/lww-1/archive", {
    token: lww.token, body: { archived: true, client_updated_at: enRetard },
  });
  const jetEnRetard = await inst.call("POST", "/api/notes/lww-1/trash", {
    token: lww.token, body: { client_updated_at: enRetard },
  });
  const toujoursLa = await inst.call("GET", "/api/notes/lww-1", { token: lww.token });
  t.check(
    "le remplacement complet, l'archivage et la mise à la corbeille écartent eux aussi une demande en retard",
    enRetardComplet.json?.stale === true && archiveEnRetard.json?.stale === true
      && jetEnRetard.json?.stale === true
      && toujoursLa.json?.title === "même instant"
      && toujoursLa.json?.archived === false && toujoursLa.json?.trashed === false,
    `put=${vue(enRetardComplet.json?.stale)}, archive=${vue(archiveEnRetard.json?.stale)}, trash=${vue(jetEnRetard.json?.stale)}, note=${bout(vue(toujoursLa.json))}`,
  );

  const inconnue404 = await inst.call("PATCH", "/api/notes/lww-jamais-vue", {
    token: lww.token, body: { title: "x" },
  });
  const inconnue400 = await inst.call("POST", "/api/notes/lww-jamais-vue/archive", {
    token: lww.token, body: { archived: true },
  });
  t.check(
    "sur une note inexistante, la modification répond introuvable et l'archivage réclame d'abord l'horodatage",
    inconnue404.status === 404 && inconnue404.json?.error === "Note not found"
      && inconnue400.status === 400 && inconnue400.json?.error === "client_updated_at is required",
    `patch=${inconnue404.status}/${vue(inconnue404.json?.error)}, archive=${inconnue400.status}/${vue(inconnue400.json?.error)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 4. Une liste de courses et l'état coché de ses éléments.
  // ─────────────────────────────────────────────────────────────────
  const lst = await compte("liste");
  const ITEMS = [
    { id: "s1", kind: "section", title: "Épicerie" },
    { id: "i1", text: "pain", done: false, indent: 0 },
    { id: "i2", text: "lait", done: true, indent: 0 },
  ];
  const creeListe = await inst.call("POST", "/api/notes", {
    token: lst.token,
    body: { id: "lst-1", type: "checklist", title: "Courses", items: ITEMS, client_updated_at: iso() },
  });
  const listeRelue = await inst.call("GET", "/api/notes/lst-1", { token: lst.token });
  t.check(
    "les éléments d'une liste se relisent tels quels, séparateurs de section et cases cochées compris",
    creeListe.status === 201 && memeJson(creeListe.json?.items, ITEMS)
      && memeJson(listeRelue.json?.items, ITEMS),
    `créé=${bout(vue(creeListe.json?.items))}, relu=${bout(vue(listeRelue.json?.items))}`,
  );

  const COCHES = [
    { id: "s1", kind: "section", title: "Épicerie" },
    { id: "i1", text: "pain", done: true, indent: 0 },
    { id: "i2", text: "lait", done: true, indent: 0 },
  ];
  const coche = await inst.call("PATCH", "/api/notes/lst-1", {
    token: lst.token, body: { items: COCHES, client_updated_at: iso() },
  });
  const listeCochee = await inst.call("GET", "/api/notes/lst-1", { token: lst.token });
  t.check(
    "cocher un élément est bien enregistré et ne change pas la nature de la note",
    coche.status === 200 && !coche.json?.stale && memeJson(coche.json?.note?.items, COCHES)
      && memeJson(listeCochee.json?.items, COCHES) && listeCochee.json?.type === "checklist",
    `items=${bout(vue(listeCochee.json?.items))}, type=${vue(listeCochee.json?.type)}`,
  );

  const RESTANT = [{ id: "i1", text: "pain", done: true, indent: 0 }];
  const remplace = await inst.call("PUT", "/api/notes/lst-1", {
    token: lst.token,
    body: { type: "checklist", title: "Courses", content: "encore du texte", items: RESTANT, client_updated_at: iso() },
  });
  t.check(
    "un remplacement complet remplace toute la liste au lieu de la compléter",
    remplace.status === 200 && memeJson(remplace.json?.note?.items, RESTANT)
      && remplace.json?.note?.type === "checklist" && remplace.json?.note?.content === "",
    `items=${bout(vue(remplace.json?.note?.items))}, contenu=${vue(remplace.json?.note?.content)}`,
  );

  const videListe = await inst.call("PATCH", "/api/notes/lst-1", {
    token: lst.token, body: { items: [], client_updated_at: iso() },
  });
  t.check(
    "vider une liste de tous ses éléments est possible",
    videListe.status === 200 && memeJson(videListe.json?.note?.items, []),
    `items=${vue(videListe.json?.note?.items)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 5. Le remplacement complet efface ce qu'on ne lui redonne pas.
  // ─────────────────────────────────────────────────────────────────
  const rmp = await compte("remplacement");
  await inst.call("POST", "/api/notes", {
    token: rmp.token,
    body: {
      id: "rmp-1", type: "checklist", title: "Tout plein", items: [{ id: "i1", text: "a", done: false }],
      images: [IMAGE], color: "red", tags: ["projet"], pinned: true, position: 4242,
      client_updated_at: iso(),
    },
  });
  const remplacementNu = await inst.call("PUT", "/api/notes/rmp-1", {
    token: rmp.token, body: { client_updated_at: iso() },
  });
  const apresNu = await inst.call("GET", "/api/notes/rmp-1", { token: rmp.token });
  t.check(
    "un remplacement qui ne redonne rien vide le titre, le contenu, les éléments, les images et la couleur",
    remplacementNu.status === 200 && apresNu.json?.title === "" && apresNu.json?.content === ""
      && memeJson(apresNu.json?.items, []) && memeJson(apresNu.json?.images, [])
      && apresNu.json?.color === "default" && apresNu.json?.type === "text",
    `note=${bout(vue(apresNu.json))}`,
  );
  t.check(
    "ce remplacement à blanc laisse en revanche les étiquettes, l'épinglage et la position",
    memeJson(apresNu.json?.tags, ["projet"]) && apresNu.json?.pinned === true
      && apresNu.json?.position === 4242,
    `tags=${vue(apresNu.json?.tags)}, pinned=${vue(apresNu.json?.pinned)}, position=${vue(apresNu.json?.position)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 6. Archiver, lister les archives, désarchiver.
  // ─────────────────────────────────────────────────────────────────
  const arc = await compte("archives");
  const tsVieux = new Date(horloge - 60000).toISOString();
  const tsRecent = new Date(horloge - 30000).toISOString();
  await inst.call("POST", "/api/notes", {
    token: arc.token,
    body: { id: "arc-A", title: "A ancienne", timestamp: tsVieux, position: 999, pinned: true, client_updated_at: iso() },
  });
  await inst.call("POST", "/api/notes", {
    token: arc.token,
    body: { id: "arc-B", title: "B récente", timestamp: tsRecent, position: 1, client_updated_at: iso() },
  });
  await inst.call("POST", "/api/notes", {
    token: arc.token, body: { id: "arc-C", title: "C reste active", client_updated_at: iso() },
  });

  const archiveA = await inst.call("POST", "/api/notes/arc-A/archive", {
    token: arc.token, body: { archived: true, client_updated_at: iso() },
  });
  const archiveB = await inst.call("POST", "/api/notes/arc-B/archive", {
    token: arc.token, body: { archived: true, client_updated_at: iso() },
  });
  const actives = await inst.call("GET", "/api/notes", { token: arc.token });
  const archivees = await inst.call("GET", "/api/notes/archived", { token: arc.token });
  t.check(
    "archiver une note la retire de la liste active et la range dans les archives",
    archiveA.status === 200 && archiveA.json?.note?.archived === true
      && archiveB.json?.note?.archived === true
      && memeJson(titres(actives.json), ["C reste active"])
      && Array.isArray(archivees.json) && archivees.json.length === 2,
    `actives=${vue(titres(actives.json))}, archives=${vue(titres(archivees.json))}`,
  );
  t.check(
    "les archives sont classées de la plus récente à la plus ancienne, sans tenir compte de l'épinglage",
    memeJson(titres(archivees.json), ["B récente", "A ancienne"]),
    `ordre=${vue(titres(archivees.json))}, A épinglée=${vue(archivees.json?.find((n) => n.id === "arc-A")?.pinned)}`,
  );
  t.check(
    "une note archivée n'est pas à la corbeille pour autant",
    archivees.json?.every((n) => n.trashed === false),
    `trashed=${vue(archivees.json?.map((n) => n.trashed))}`,
  );

  const desarchive = await inst.call("POST", "/api/notes/arc-A/archive", {
    token: arc.token, body: { archived: false, client_updated_at: iso() },
  });
  const activesApres = await inst.call("GET", "/api/notes", { token: arc.token });
  t.check(
    "désarchiver une note la ramène dans la liste active",
    desarchive.status === 200 && desarchive.json?.note?.archived === false
      && (titres(activesApres.json) || []).includes("A ancienne"),
    `archived=${vue(desarchive.json?.note?.archived)}, actives=${vue(titres(activesApres.json))}`,
  );

  const sansChamp = await inst.call("POST", "/api/notes/arc-B/archive", {
    token: arc.token, body: { client_updated_at: iso() },
  });
  const arcBApres = await inst.call("GET", "/api/notes/arc-B", { token: arc.token });
  t.check(
    "une demande d'archivage tronquée est refusée au lieu de faire l'inverse",
    sansChamp.status === 400 && arcBApres.json?.archived === true,
    `http ${sansChamp.status}, ${vue(sansChamp.json?.error)}, archived=${vue(arcBApres.json?.archived)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 7. Archivée et à la corbeille sont deux états indépendants.
  // ─────────────────────────────────────────────────────────────────
  const drp = await compte("drapeaux");
  await inst.call("POST", "/api/notes", {
    token: drp.token, body: { id: "drp-1", title: "Rangée puis jetée", client_updated_at: iso() },
  });
  await inst.call("POST", "/api/notes/drp-1/archive", {
    token: drp.token, body: { archived: true, client_updated_at: iso() },
  });
  const jetArchivee = await inst.call("POST", "/api/notes/drp-1/trash", {
    token: drp.token, body: { client_updated_at: iso() },
  });
  const arch1 = await inst.call("GET", "/api/notes/archived", { token: drp.token });
  const corb1 = await inst.call("GET", "/api/notes/trashed", { token: drp.token });
  t.check(
    "jeter une note archivée la sort des archives sans lui retirer son étiquette d'archive",
    jetArchivee.json?.note?.trashed === true && jetArchivee.json?.note?.archived === true
      && Array.isArray(arch1.json) && arch1.json.length === 0
      && memeJson(titres(corb1.json), ["Rangée puis jetée"]),
    `archived=${vue(jetArchivee.json?.note?.archived)}, trashed=${vue(jetArchivee.json?.note?.trashed)}, archives=${vue(titres(arch1.json))}, corbeille=${vue(titres(corb1.json))}`,
  );

  const restaureArchivee = await inst.call("POST", "/api/notes/drp-1/restore", {
    token: drp.token, body: { client_updated_at: iso() },
  });
  const actives2 = await inst.call("GET", "/api/notes", { token: drp.token });
  const arch2 = await inst.call("GET", "/api/notes/archived", { token: drp.token });
  const corb2 = await inst.call("GET", "/api/notes/trashed", { token: drp.token });
  t.check(
    "restaurer une note archivée puis jetée la ramène là où l'utilisateur la cherche: la liste active",
    restaureArchivee.json?.note?.trashed === false && restaureArchivee.json?.note?.archived === false
      && memeJson(titres(actives2.json), ["Rangée puis jetée"])
      && memeJson(titres(arch2.json), [])
      && memeJson(titres(corb2.json), []),
    `actives=${vue(titres(actives2.json))}, archives=${vue(titres(arch2.json))}, corbeille=${vue(titres(corb2.json))}`,
  );

  // Rejouer une restauration déjà appliquée ne doit rien faire du tout.
  // Le recalcul de position s'exécutait sans vérifier que la note était
  // bien à la corbeille: un simple rattrapage de la file de
  // synchronisation faisait alors remonter la note en tête de liste.
  {
    const rej = await compte("rejeu");
    await inst.call("POST", "/api/notes", {
      token: rej.token, body: { id: "rej-vieille", title: "vieille", position: 5000, client_updated_at: iso() },
    });
    await inst.call("POST", "/api/notes", {
      token: rej.token, body: { id: "rej-recente", title: "récente", position: 9000, client_updated_at: iso() },
    });
    const avant = await inst.call("GET", "/api/notes", { token: rej.token });
    const rejeu = await inst.call("POST", "/api/notes/rej-vieille/restore", {
      token: rej.token, body: { client_updated_at: iso() },
    });
    const apres = await inst.call("GET", "/api/notes", { token: rej.token });
    t.check(
      "restaurer une note qui n'est pas à la corbeille ne la fait pas remonter en tête de liste",
      rejeu.status === 200 && memeJson(titres(apres.json), titres(avant.json))
        && apres.json?.find((n) => n.id === "rej-vieille")?.position === 5000,
      `avant=${vue(titres(avant.json))}, après=${vue(titres(apres.json))}, position=${vue(apres.json?.find((n) => n.id === "rej-vieille")?.position)}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // 8. L'ordre d'affichage et le réordonnancement, qui est personnel.
  // ─────────────────────────────────────────────────────────────────
  const ord = await compte("ordre");
  await inst.call("POST", "/api/notes", {
    token: ord.token, body: { id: "ord-1", title: "n1", position: 100, client_updated_at: iso() },
  });
  await inst.call("POST", "/api/notes", {
    token: ord.token, body: { id: "ord-2", title: "n2", position: 300, client_updated_at: iso() },
  });
  await inst.call("POST", "/api/notes", {
    token: ord.token, body: { id: "ord-3", title: "n3", position: 200, pinned: true, client_updated_at: iso() },
  });
  const ordreInitial = await inst.call("GET", "/api/notes", { token: ord.token });
  t.check(
    "la liste affiche les notes épinglées d'abord, puis par position décroissante",
    memeJson(titres(ordreInitial.json), ["n3", "n2", "n1"]),
    `ordre=${vue(titres(ordreInitial.json))}`,
  );

  const page = await inst.call("GET", "/api/notes?limit=1&offset=1", { token: ord.token });
  t.check(
    "demander une page d'une seule note rend bien la deuxième de cet ordre",
    page.status === 200 && memeJson(titres(page.json), ["n2"]),
    `page=${vue(titres(page.json))}`,
  );

  const tReorder = iso();
  const reordonne = await inst.call("POST", "/api/notes/reorder", {
    token: ord.token, body: { pinnedIds: ["ord-1"], otherIds: ["ord-3", "ord-2"], client_reordered_at: tReorder },
  });
  const nouvelOrdre = await inst.call("GET", "/api/notes", { token: ord.token });
  t.check(
    "réordonner ne rend aucune note, juste une confirmation",
    reordonne.status === 200 && memeJson(Object.keys(reordonne.json || {}), ["ok"]),
    `http ${reordonne.status}, corps=${bout(reordonne.text)}`,
  );
  t.check(
    "l'ordre demandé est celui qu'on relit, et la note nouvellement épinglée passe en tête",
    memeJson(titres(nouvelOrdre.json), ["n1", "n3", "n2"])
      && nouvelOrdre.json?.[0]?.pinned === true
      && nouvelOrdre.json?.find((n) => n.id === "ord-3")?.pinned === false,
    `ordre=${vue(titres(nouvelOrdre.json))}, épinglages=${vue(nouvelOrdre.json?.map((n) => n.pinned))}`,
  );

  {
    // Sonde en base: l'épinglage réordonné est personnel, la colonne
    // partagée de la note ne doit pas avoir bougé.
    const base = inst.db(true);
    const partagee = base.prepare("SELECT id, pinned FROM notes WHERE id IN ('ord-1','ord-3') ORDER BY id").all();
    const perso = base
      .prepare("SELECT note_id, pinned FROM note_user_positions WHERE user_id = ? ORDER BY note_id")
      .all(ord.id);
    base.close();
    t.check(
      "le réordonnancement n'écrit que l'ordre personnel de celui qui l'a demandé",
      memeJson(partagee, [{ id: "ord-1", pinned: 0 }, { id: "ord-3", pinned: 1 }])
        && memeJson(perso, [
          { note_id: "ord-1", pinned: 1 },
          { note_id: "ord-2", pinned: 0 },
          { note_id: "ord-3", pinned: 0 },
        ]),
      `colonnes partagées=${vue(partagee)}, ordre personnel=${vue(perso)}`,
    );
  }

  const rejeu = await inst.call("POST", "/api/notes/reorder", {
    token: ord.token, body: { pinnedIds: ["ord-1"], otherIds: ["ord-3", "ord-2"], client_reordered_at: tReorder },
  });
  const reorderVieux = await inst.call("POST", "/api/notes/reorder", {
    token: ord.token,
    body: { pinnedIds: ["ord-2"], otherIds: ["ord-1", "ord-3"], client_reordered_at: retard() },
  });
  const ordreApresVieux = await inst.call("GET", "/api/notes", { token: ord.token });
  t.check(
    "rejouer le même réordonnancement passe, mais un réordonnancement plus ancien est écarté sans rien changer",
    rejeu.status === 200 && !rejeu.json?.stale
      && reorderVieux.status === 200 && reorderVieux.json?.stale === true
      && reorderVieux.json?.note === undefined
      && memeJson(titres(ordreApresVieux.json), ["n1", "n3", "n2"]),
    `rejeu stale=${vue(rejeu.json?.stale)}, ancien stale=${vue(reorderVieux.json?.stale)}, ordre=${vue(titres(ordreApresVieux.json))}`,
  );

  const reorderIntrus = await inst.call("POST", "/api/notes/reorder", {
    token: ord.token, body: { pinnedIds: [], otherIds: ["ord-2", "note-qui-n-existe-pas"], client_reordered_at: iso() },
  });
  const ordreApresIntrus = await inst.call("GET", "/api/notes", { token: ord.token });
  t.check(
    "un réordonnancement contenant une note inconnue est refusé en entier, sans rien déplacer",
    reorderIntrus.status === 403
      && reorderIntrus.json?.error === "Reorder payload contains notes you cannot access"
      && memeJson(titres(ordreApresIntrus.json), ["n1", "n3", "n2"]),
    `http ${reorderIntrus.status}, erreur=${vue(reorderIntrus.json?.error)}, ordre=${vue(titres(ordreApresIntrus.json))}`,
  );

  const reorderVide = await inst.call("POST", "/api/notes/reorder", {
    token: ord.token, body: { client_reordered_at: iso() },
  });
  const reorderMauvaisChamp = await inst.call("POST", "/api/notes/reorder", {
    token: ord.token, body: { otherIds: ["ord-1"], client_updated_at: iso() },
  });
  t.check(
    "un réordonnancement vide est accepté, mais il faut lui donner son propre horodatage",
    reorderVide.status === 200 && reorderVide.json?.ok === true
      && reorderMauvaisChamp.status === 400
      && reorderMauvaisChamp.json?.error === "client_reordered_at is required",
    `vide=${reorderVide.status}, mauvais champ=${reorderMauvaisChamp.status}/${vue(reorderMauvaisChamp.json?.error)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 9. Épingler une note est un geste personnel et sans conséquence
  //    sur le contenu.
  // ─────────────────────────────────────────────────────────────────
  const epi = await compte("epingle");
  await inst.call("POST", "/api/notes", {
    token: epi.token, body: { id: "epi-1", title: "À épingler", client_updated_at: iso() },
  });
  const avantEpingle = await inst.call("GET", "/api/notes/epi-1", { token: epi.token });
  const epingle = await inst.call("PATCH", "/api/notes/epi-1", {
    token: epi.token, body: { pinned: true },
  });
  const apresEpingle = await inst.call("GET", "/api/notes/epi-1", { token: epi.token });
  t.check(
    "épingler une note ne réclame pas d'horodatage et se relit tout de suite",
    epingle.status === 200 && epingle.json?.ok === true && epingle.json?.note?.pinned === true
      && apresEpingle.json?.pinned === true,
    `http ${epingle.status}, pinned rendu=${vue(epingle.json?.note?.pinned)}, pinned relu=${vue(apresEpingle.json?.pinned)}`,
  );
  t.check(
    "épingler ne compte pas comme une modification de la note: sa date de dernière écriture ne bouge pas",
    apresEpingle.json?.client_updated_at === avantEpingle.json?.client_updated_at
      && apresEpingle.json?.updated_at === avantEpingle.json?.updated_at,
    `avant=${vue(avantEpingle.json?.client_updated_at)}/${vue(avantEpingle.json?.updated_at)}, après=${vue(apresEpingle.json?.client_updated_at)}/${vue(apresEpingle.json?.updated_at)}`,
  );

  const epingleEtTitre = await inst.call("PATCH", "/api/notes/epi-1", {
    token: epi.token, body: { pinned: false, title: "Épinglée et renommée" },
  });
  t.check(
    "dès qu'on touche au contenu en même temps, l'horodatage redevient obligatoire",
    epingleEtTitre.status === 400 && epingleEtTitre.json?.error === "client_updated_at is required",
    `http ${epingleEtTitre.status}, erreur=${vue(epingleEtTitre.json?.error)}`,
  );

  const desepingle = await inst.call("PATCH", "/api/notes/epi-1", {
    token: epi.token, body: { pinned: false },
  });
  t.check(
    "on peut désépingler ce qu'on a épinglé",
    desepingle.status === 200 && desepingle.json?.note?.pinned === false,
    `pinned=${vue(desepingle.json?.note?.pinned)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 10. L'icône: personnelle, hors du corps de la note, et résistante.
  // ─────────────────────────────────────────────────────────────────
  const ico = await compte("icone");
  await inst.call("POST", "/api/notes", {
    token: ico.token,
    body: { id: "ico-1", title: "Avec logo", content: "avant", images: [IMAGE], client_updated_at: iso() },
  });
  const poseIcone = await inst.call("PUT", "/api/notes/ico-1/icon", {
    token: ico.token, body: { icon: ICONE },
  });
  const avecIcone = await inst.call("GET", "/api/notes/ico-1", { token: ico.token });
  t.check(
    "poser une icône ne demande aucun horodatage et la rend telle qu'envoyée",
    poseIcone.status === 200 && poseIcone.json?.ok === true && memeJson(poseIcone.json?.icon, ICONE),
    `http ${poseIcone.status}, icône=${bout(vue(poseIcone.json?.icon))}`,
  );
  t.check(
    "l'icône se lit dans son propre champ et ne vient jamais polluer les images de la note",
    memeJson(avecIcone.json?.icon, ICONE) && memeJson(avecIcone.json?.images, [IMAGE]),
    `icône=${bout(vue(avecIcone.json?.icon))}, images=${bout(vue(avecIcone.json?.images))}`,
  );

  await inst.call("PUT", "/api/notes/ico-1", {
    token: ico.token, body: { title: "après", content: "après", client_updated_at: iso() },
  });
  const apresPut = await inst.call("GET", "/api/notes/ico-1", { token: ico.token });
  await inst.call("POST", "/api/notes/ico-1/trash", { token: ico.token, body: { client_updated_at: iso() } });
  await inst.call("POST", "/api/notes/ico-1/restore", { token: ico.token, body: { client_updated_at: iso() } });
  const apresCorbeille = await inst.call("GET", "/api/notes/ico-1", { token: ico.token });
  t.check(
    "l'icône survit à une réécriture complète de la note et à un passage par la corbeille",
    memeJson(apresPut.json?.icon, ICONE) && memeJson(apresCorbeille.json?.icon, ICONE),
    `après remplacement=${bout(vue(apresPut.json?.icon))}, après corbeille=${bout(vue(apresCorbeille.json?.icon))}`,
  );

  const iconeSansSource = await inst.call("PUT", "/api/notes/ico-1/icon", {
    token: ico.token, body: { icon: { name: "sans source" } },
  });
  const iconeTexte = await inst.call("PUT", "/api/notes/ico-1/icon", {
    token: ico.token, body: { icon: "juste du texte" },
  });
  const iconeIntacte = await inst.call("GET", "/api/notes/ico-1", { token: ico.token });
  t.check(
    "une icône sans image est refusée, et la précédente reste en place",
    iconeSansSource.status === 400 && iconeSansSource.json?.error === "Invalid icon"
      && iconeTexte.status === 400 && iconeTexte.json?.error === "Invalid icon"
      && memeJson(iconeIntacte.json?.icon, ICONE),
    `sans src=${iconeSansSource.status}/${vue(iconeSansSource.json?.error)}, texte=${iconeTexte.status}, icône=${bout(vue(iconeIntacte.json?.icon))}`,
  );

  const effaceParNull = await inst.call("PUT", "/api/notes/ico-1/icon", {
    token: ico.token, body: { icon: null },
  });
  t.check(
    "envoyer une icône vide efface celle qui était posée",
    effaceParNull.status === 200 && effaceParNull.json?.icon === null,
    `http ${effaceParNull.status}, icône=${vue(effaceParNull.json?.icon)}`,
  );

  await inst.call("PUT", "/api/notes/ico-1/icon", { token: ico.token, body: { icon: ICONE } });
  const supprIcone = await inst.call("DELETE", "/api/notes/ico-1/icon", { token: ico.token });
  const sansIcone = await inst.call("GET", "/api/notes/ico-1", { token: ico.token });
  const supprDeuxFois = await inst.call("DELETE", "/api/notes/ico-1/icon", { token: ico.token });
  t.check(
    "supprimer l'icône la retire vraiment, et recommencer ne provoque pas d'erreur",
    supprIcone.status === 200 && memeJson(Object.keys(supprIcone.json || {}), ["ok"])
      && sansIcone.json?.icon === null && supprDeuxFois.status === 200,
    `suppression=${supprIcone.status}/${bout(supprIcone.text)}, icône relue=${vue(sansIcone.json?.icon)}, seconde suppression=${supprDeuxFois.status}`,
  );

  const iconeFantome = await inst.call("PUT", "/api/notes/ico-jamais-vue/icon", {
    token: ico.token, body: { icon: ICONE },
  });
  t.check(
    "on ne peut pas poser d'icône sur une note qui n'existe pas",
    iconeFantome.status === 404 && iconeFantome.json?.error === "Note not found",
    `http ${iconeFantome.status}, corps=${bout(iconeFantome.text)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 11. La note d'autrui est invisible, et l'ancienne suppression est
  //     condamnée.
  // ─────────────────────────────────────────────────────────────────
  const alice = await compte("alice");
  const bob = await compte("bob");
  await inst.call("POST", "/api/notes", {
    token: alice.token, body: { id: "alice-1", title: "Privée", content: "secret", client_updated_at: iso() },
  });

  const tentatives = {
    lecture: await inst.call("GET", "/api/notes/alice-1", { token: bob.token }),
    remplacement: await inst.call("PUT", "/api/notes/alice-1", { token: bob.token, body: { title: "volée", client_updated_at: iso() } }),
    modification: await inst.call("PATCH", "/api/notes/alice-1", { token: bob.token, body: { title: "volée", client_updated_at: iso() } }),
    corbeille: await inst.call("POST", "/api/notes/alice-1/trash", { token: bob.token, body: { client_updated_at: iso() } }),
    archive: await inst.call("POST", "/api/notes/alice-1/archive", { token: bob.token, body: { archived: true, client_updated_at: iso() } }),
    restauration: await inst.call("POST", "/api/notes/alice-1/restore", { token: bob.token, body: { client_updated_at: iso() } }),
    suppression: await inst.call("DELETE", "/api/notes/alice-1/permanent", { token: bob.token, body: { client_updated_at: iso() } }),
    icone: await inst.call("PUT", "/api/notes/alice-1/icon", { token: bob.token, body: { icon: ICONE } }),
  };
  const toutes404 = Object.values(tentatives)
    .every((r) => r.status === 404 && r.json?.error === "Note not found");
  t.check(
    "la note d'un autre est introuvable pour tout le monde: lecture, modification, corbeille, archive, suppression",
    toutes404,
    Object.entries(tentatives).map(([k, r]) => `${k}=${r.status}/${vue(r.json?.error)}`).join(", "),
  );

  const listeBob = await inst.call("GET", "/api/notes", { token: bob.token });
  t.check(
    "la note d'alice n'apparaît pas non plus dans la liste de bob",
    Array.isArray(listeBob.json) && listeBob.json.length === 0,
    `liste=${vue(titres(listeBob.json))}`,
  );

  const volParId = await inst.call("POST", "/api/notes", {
    token: bob.token, body: { id: "alice-1", title: "écrasement", content: "par bob" },
  });
  const aliceIntacte = await inst.call("GET", "/api/notes/alice-1", { token: alice.token });
  t.check(
    "réutiliser l'identifiant de la note d'un autre ne l'écrase pas et ne la donne pas",
    volParId.status >= 400 && aliceIntacte.json?.title === "Privée"
      && aliceIntacte.json?.content === "secret" && aliceIntacte.json?.user_id === alice.id,
    `tentative http ${volParId.status}, note d'alice=${bout(vue(aliceIntacte.json))}`,
  );

  const ancienneSuppression = await inst.call("DELETE", "/api/notes/alice-1", { token: alice.token });
  const survivante = await inst.call("GET", "/api/notes/alice-1", { token: alice.token });
  t.check(
    "l'ancienne route de suppression est condamnée et renvoie vers la corbeille, même pour la propriétaire",
    ancienneSuppression.status === 410
      && ancienneSuppression.json?.error === "Deprecated: use POST /api/notes/:id/trash with client_updated_at"
      && survivante.status === 200,
    `http ${ancienneSuppression.status}, corps=${bout(ancienneSuppression.text)}, note toujours là=${survivante.status === 200}`,
  );

  const sansJeton = await inst.call("POST", "/api/notes", { body: { title: "anonyme" } });
  const jetonBidon = await inst.call("GET", "/api/notes", { token: "pas-un-jeton" });
  t.check(
    "sans connexion valable, on ne crée ni ne lit aucune note",
    sansJeton.status === 401 && sansJeton.json?.error === "Missing token"
      && jetonBidon.status === 401 && jetonBidon.json?.error === "Invalid token",
    `sans jeton=${sansJeton.status}/${vue(sansJeton.json?.error)}, jeton invalide=${jetonBidon.status}/${vue(jetonBidon.json?.error)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 12. La création est rejouable: la file de synchronisation peut
  //     renvoyer deux fois la même note sans en fabriquer deux.
  // ─────────────────────────────────────────────────────────────────
  const idm = await compte("idempotence");
  const premier = await inst.call("POST", "/api/notes", {
    token: idm.token, body: { id: "idm-1", title: "premier", content: "a", client_updated_at: iso() },
  });
  const second = await inst.call("POST", "/api/notes", {
    token: idm.token, body: { id: "idm-1", title: "deuxième", content: "b", client_updated_at: iso() },
  });
  const luApres = await inst.call("GET", "/api/notes/idm-1", { token: idm.token });
  const combien = await inst.call("GET", "/api/notes", { token: idm.token });
  t.check(
    "renvoyer deux fois la même création ne crée qu'une note et garde la première version",
    premier.status === 201 && second.status === 200
      && second.json?.title === "premier" && luApres.json?.content === "a"
      && Array.isArray(combien.json) && combien.json.length === 1,
    `premier=${premier.status}, second=${second.status}/${vue(second.json?.title)}, relu=${vue(luApres.json?.content)}, nombre=${combien.json?.length}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 13. Les événements temps réel accompagnent le cycle de vie.
  // ─────────────────────────────────────────────────────────────────
  const flx = await compte("flux");
  const flux = await listenEvents(inst, flx.token);
  try {
    const bonjour = await flux.waitFor((e) => e.type === "hello");
    t.check(
      "le flux temps réel s'ouvre en saluant",
      !!bonjour,
      `événements reçus=${vue(flux.events.map((e) => e.type || e.data?.type))}`,
    );

    await inst.call("POST", "/api/notes", {
      token: flx.token, body: { id: "flx-1", title: "Suivie en direct", client_updated_at: iso() },
    });
    const creation = await flux.waitFor((e) => e.data?.type === "note_updated");
    t.check(
      "créer une note prévient les autres appareils, sans leur envoyer la note",
      !!creation && creation.data?.noteId === "flx-1"
        && memeJson(Object.keys(creation.data || {}).sort(), ["noteId", "type"]),
      `événement=${vue(creation?.data)}`,
    );

    await inst.call("PATCH", "/api/notes/flx-1", { token: flx.token, body: { pinned: true } });
    const reordonnement = await flux.waitFor((e) => e.data?.type === "notes_reordered");
    t.check(
      "épingler prévient sous la forme d'un changement d'ordre, pas d'une modification de la note",
      !!reordonnement && memeJson(reordonnement.data?.noteIds, ["flx-1"]),
      `événement=${vue(reordonnement?.data)}`,
    );

    await inst.call("POST", "/api/notes/flx-1/trash", { token: flx.token, body: { client_updated_at: iso() } });
    const misACorbeille = await flux.waitFor(
      (e) => e.data?.type === "note_updated" && e !== creation,
    );
    t.check(
      "mettre à la corbeille prévient comme une modification de la note",
      !!misACorbeille,
      `événements=${vue(flux.events.map((e) => e.type || e.data?.type))}`,
    );

    await inst.call("DELETE", "/api/notes/flx-1/permanent", {
      token: flx.token, body: { client_updated_at: iso() },
    });
    const supprimee = await flux.waitFor((e) => e.data?.type === "note_deleted");
    t.check(
      "la suppression définitive prévient avec son propre message, portant l'identifiant disparu",
      !!supprimee && supprimee.data?.noteId === "flx-1",
      `événement=${vue(supprimee?.data)}`,
    );

    const suite = flux.events
      .map((e) => e.type || e.data?.type)
      .filter((nom) => nom !== "ping");
    t.check(
      "la suite des messages reçus raconte exactement le cycle de vie de la note",
      memeJson(suite, ["hello", "note_updated", "notes_reordered", "note_updated", "note_deleted"]),
      `suite=${vue(suite)}`,
    );
  } finally {
    flux.close();
  }

  // ─────────────────────────────────────────────────────────────────
  // 14. Une note partagée: qui peut faire quoi, et ce que devient la
  //     note quand un participant la jette.
  // ─────────────────────────────────────────────────────────────────
  const anne = await compte("anne");
  const bruno = await compte("bruno");
  const partager = async (id, titre) => {
    await inst.call("POST", "/api/notes", {
      token: anne.token, body: { id, title: titre, content: "à deux", client_updated_at: iso() },
    });
    return inst.call("POST", `/api/notes/${id}/collaborate`, {
      token: anne.token, body: { username: bruno.email },
    });
  };

  const partage = await partager("prt-1", "Partagée");
  t.check(
    "anne peut ouvrir sa note à bruno",
    partage.status === 200 && partage.json?.ok === true,
    `http ${partage.status}, corps=${bout(partage.text)}`,
  );

  const vueBruno = await inst.call("GET", "/api/notes/prt-1", { token: bruno.token });
  const ecritBruno = await inst.call("PATCH", "/api/notes/prt-1", {
    token: bruno.token, body: { content: "corrigé par bruno", client_updated_at: iso() },
  });
  const vueAnne = await inst.call("GET", "/api/notes/prt-1", { token: anne.token });
  t.check(
    "bruno lit la note partagée en tant que rédacteur et ce qu'il écrit arrive chez anne",
    vueBruno.status === 200 && vueBruno.json?.access === "write"
      && ecritBruno.status === 200 && !ecritBruno.json?.stale
      && vueAnne.json?.content === "corrigé par bruno"
      && vueAnne.json?.lastEditedBy === "bruno",
    `accès=${vue(vueBruno.json?.access)}, contenu chez anne=${vue(vueAnne.json?.content)}, dernier auteur=${vue(vueAnne.json?.lastEditedBy)}`,
  );

  const ICONE_BRUNO = { id: "L2", src: "data:image/png;base64,BB", name: "bruno.png" };
  await inst.call("PUT", "/api/notes/prt-1/icon", { token: anne.token, body: { icon: ICONE } });
  await inst.call("PUT", "/api/notes/prt-1/icon", { token: bruno.token, body: { icon: ICONE_BRUNO } });
  const iconeAnne = await inst.call("GET", "/api/notes/prt-1", { token: anne.token });
  const iconeBruno = await inst.call("GET", "/api/notes/prt-1", { token: bruno.token });
  t.check(
    "sur une note partagée, chacun garde sa propre icône",
    memeJson(iconeAnne.json?.icon, ICONE) && memeJson(iconeBruno.json?.icon, ICONE_BRUNO),
    `anne=${bout(vue(iconeAnne.json?.icon))}, bruno=${bout(vue(iconeBruno.json?.icon))}`,
  );

  const archiveBruno = await inst.call("POST", "/api/notes/prt-1/archive", {
    token: bruno.token, body: { archived: true, client_updated_at: iso() },
  });
  const restaureBruno = await inst.call("POST", "/api/notes/prt-1/restore", {
    token: bruno.token, body: { client_updated_at: iso() },
  });
  const supprimeBruno = await inst.call("DELETE", "/api/notes/prt-1/permanent", {
    token: bruno.token, body: { client_updated_at: iso() },
  });
  t.check(
    "un invité ne peut ni archiver, ni restaurer, ni supprimer définitivement la note de quelqu'un d'autre",
    archiveBruno.status === 404 && restaureBruno.status === 404 && supprimeBruno.status === 404,
    `archive=${archiveBruno.status}/${vue(archiveBruno.json?.error)}, restauration=${restaureBruno.status}, suppression=${supprimeBruno.status}`,
  );

  const brunoSeRetire = await inst.call("POST", "/api/notes/prt-1/trash", {
    token: bruno.token, body: { client_updated_at: iso() },
  });
  t.check(
    "quand un invité jette une note partagée, il reçoit une copie personnelle sous un autre identifiant",
    brunoSeRetire.status === 200 && brunoSeRetire.json?.left === true
      && brunoSeRetire.json?.note === undefined
      && typeof brunoSeRetire.json?.trashedCopy?.id === "string"
      && brunoSeRetire.json?.trashedCopy?.id !== "prt-1"
      && brunoSeRetire.json?.trashedCopy?.content === "corrigé par bruno",
    `http ${brunoSeRetire.status}, left=${vue(brunoSeRetire.json?.left)}, copie=${bout(vue(brunoSeRetire.json?.trashedCopy))}`,
  );

  const corbeilleBruno = await inst.call("GET", "/api/notes/trashed", { token: bruno.token });
  const listeBruno = await inst.call("GET", "/api/notes", { token: bruno.token });
  const chezAnne = await inst.call("GET", "/api/notes/prt-1", { token: anne.token });
  t.check(
    "l'invité retrouve sa copie dans sa corbeille, la note partagée disparaît de sa liste et reste vivante chez anne",
    memeJson(titres(corbeilleBruno.json), ["Partagée"])
      && corbeilleBruno.json?.[0]?.id !== "prt-1"
      && !(titres(listeBruno.json) || []).includes("Partagée")
      && chezAnne.status === 200 && chezAnne.json?.trashed === false
      && chezAnne.json?.user_id === anne.id,
    `corbeille bruno=${vue(titres(corbeilleBruno.json))}, liste bruno=${vue(titres(listeBruno.json))}, note chez anne=${chezAnne.status}/trashed=${vue(chezAnne.json?.trashed)}`,
  );

  await partager("prt-2", "Reprise");
  const anneSeRetire = await inst.call("POST", "/api/notes/prt-2/trash", {
    token: anne.token, body: { client_updated_at: iso() },
  });
  const reprisePourBruno = await inst.call("GET", "/api/notes/prt-2", { token: bruno.token });
  t.check(
    "quand la propriétaire quitte une note partagée, elle en garde une copie et l'original passe à l'invité",
    anneSeRetire.status === 200 && anneSeRetire.json?.left === true
      && anneSeRetire.json?.trashedCopy?.id !== "prt-2"
      && reprisePourBruno.status === 200 && reprisePourBruno.json?.user_id === bruno.id
      && reprisePourBruno.json?.access === "owner"
      && reprisePourBruno.json?.trashed === false,
    `retrait=${anneSeRetire.status}/left=${vue(anneSeRetire.json?.left)}, nouvelle propriété=${vue(reprisePourBruno.json?.user_id)} (bruno=${bruno.id}), accès=${vue(reprisePourBruno.json?.access)}`,
  );

  await inst.call("POST", "/api/notes", {
    token: anne.token, body: { id: "prt-4", title: "Consultation", content: "à lire", client_updated_at: iso() },
  });
  await inst.call("POST", "/api/notes/prt-4/collaborate", {
    token: anne.token, body: { username: bruno.email, access: "read" },
  });
  const lectureSeule = await inst.call("PATCH", "/api/notes/prt-4", {
    token: bruno.token, body: { content: "modifié quand même", client_updated_at: iso() },
  });
  const inchangee = await inst.call("GET", "/api/notes/prt-4", { token: anne.token });
  const epingleLecteur = await inst.call("PATCH", "/api/notes/prt-4", {
    token: bruno.token, body: { pinned: true },
  });
  t.check(
    "un invité en lecture seule ne change pas le contenu, mais garde le droit d'épingler la note chez lui",
    lectureSeule.status === 200 && lectureSeule.json?.readOnly === true
      && inchangee.json?.content === "à lire"
      && lectureSeule.json?.note?.access === "read"
      && epingleLecteur.status === 200 && epingleLecteur.json?.note?.pinned === true,
    `écriture=${lectureSeule.status}/readOnly=${vue(lectureSeule.json?.readOnly)}, contenu chez anne=${vue(inchangee.json?.content)}, accès=${vue(lectureSeule.json?.note?.access)}, épinglage=${epingleLecteur.status}/${vue(epingleLecteur.json?.note?.pinned)}`,
  );

  await partager("prt-3", "À détruire");
  const detruireParInvite = await inst.call("POST", "/api/notes/prt-3/trash", {
    token: bruno.token, body: { client_updated_at: iso(), mode: "delete_for_all" },
  });
  t.check(
    "un invité ne peut pas supprimer une note partagée pour tout le monde",
    detruireParInvite.status === 403
      && detruireParInvite.json?.error === "Only owner can delete for all collaborators",
    `http ${detruireParInvite.status}, erreur=${vue(detruireParInvite.json?.error)}`,
  );

  const detruirePourTous = await inst.call("POST", "/api/notes/prt-3/trash", {
    token: anne.token, body: { client_updated_at: iso(), mode: "delete_for_all" },
  });
  const plusRienPourBruno = await inst.call("GET", "/api/notes/prt-3", { token: bruno.token });
  const corbeilleAnne = await inst.call("GET", "/api/notes/trashed", { token: anne.token });
  t.check(
    "la propriétaire peut retirer la note à tout le monde, en la gardant dans sa propre corbeille",
    detruirePourTous.status === 200 && detruirePourTous.json?.deletedForAll === true
      && detruirePourTous.json?.note?.trashed === true
      && plusRienPourBruno.status === 404
      && (titres(corbeilleAnne.json) || []).includes("À détruire"),
    `http ${detruirePourTous.status}, deletedForAll=${vue(detruirePourTous.json?.deletedForAll)}, bruno=${plusRienPourBruno.status}, corbeille anne=${vue(titres(corbeilleAnne.json))}`,
  );
} finally {
  inst.stop();
}

process.exit(t.summary() ? 0 : 1);
