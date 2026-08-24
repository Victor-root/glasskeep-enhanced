// Scénario fonctionnel: étiquettes, export et import des notes.
//
// Ce qui est vérifié ici n'est pas qu'une route répond, mais qu'une
// étiquette écrite se relit à l'identique, qu'un export se réimporte
// sans rien perdre ni rien écraser, et qu'un import bancal est refusé
// pour la bonne raison. Chaque bloc travaille avec ses propres comptes:
// le dédoublonnage de l'import est calculé par utilisateur, donc mêler
// les blocs sur un même compte fausserait les comptages.
import { startInstance, createAndLogin, listenEvents, runner } from "./lab.mjs";

const PORT = 9512;
const t = runner("Étiquettes, export et import des notes");

// Horloge monotone: les écritures passent par un contrôle "dernier
// écrivain gagne", chaque appel doit donc porter un horodatage plus
// récent que le précédent. On démarre une heure en arrière pour avoir
// de la marge sans jamais dépasser le présent (au-delà de 5 minutes
// d'avance le serveur refuse).
let clock = Date.now() - 3600 * 1000;
const nextIso = () => new Date((clock += 1000)).toISOString();

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (v) => JSON.stringify(v);
const cut = (s, n = 160) => String(s ?? "").slice(0, n);

// Les 12 champs de l'export, dans l'ordre exact où la route les écrit.
const CHAMPS_EXPORT = [
  "id", "type", "title", "content", "items", "tags",
  "images", "icon", "color", "pinned", "position", "timestamp",
];

const IMAGE_TEST = {
  id: "img-1",
  src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
  name: "photo.png",
};

const inst = await startInstance({ port: PORT });
const compte = (nom) => createAndLogin(inst, {
  name: nom, email: `${nom}@glasskeep.test`, password: `Passw0rd-${nom}`,
});

try {
  // ─────────────────────────────────────────────────────────────────
  // 1. Cycle de vie des étiquettes sur une note: poser, remplacer,
  //    vider, puis ne pas y toucher.
  // ─────────────────────────────────────────────────────────────────
  const cyc = await compte("cycle");
  const tsCreation = nextIso();
  const cree = await inst.call("POST", "/api/notes", {
    token: cyc.token,
    body: {
      id: "cycle-1", title: "Note à étiqueter", content: "corps",
      tags: ["Travail", "Urgent"],
      timestamp: tsCreation, client_updated_at: tsCreation,
    },
  });
  t.check(
    "la création rend les étiquettes envoyées, dans le même ordre",
    cree.status === 201 && same(cree.json?.tags, ["Travail", "Urgent"]),
    `http ${cree.status}, tags=${show(cree.json?.tags)}`,
  );

  const remplace = await inst.call("PATCH", "/api/notes/cycle-1", {
    token: cyc.token, body: { tags: ["Perso"], client_updated_at: nextIso() },
  });
  t.check(
    "remplacer les étiquettes efface l'ancienne liste au lieu de s'y ajouter",
    remplace.status === 200 && remplace.json?.ok === true
      && !remplace.json?.stale && same(remplace.json?.note?.tags, ["Perso"]),
    `http ${remplace.status}, stale=${show(remplace.json?.stale)}, tags=${show(remplace.json?.note?.tags)}`,
  );

  const vide = await inst.call("PATCH", "/api/notes/cycle-1", {
    token: cyc.token, body: { tags: [], client_updated_at: nextIso() },
  });
  t.check(
    "envoyer une liste vide retire toutes les étiquettes",
    vide.status === 200 && !vide.json?.stale && same(vide.json?.note?.tags, []),
    `http ${vide.status}, tags=${show(vide.json?.note?.tags)}`,
  );

  const repose = await inst.call("PATCH", "/api/notes/cycle-1", {
    token: cyc.token, body: { tags: ["Final"], client_updated_at: nextIso() },
  });
  t.check(
    "on peut réétiqueter une note qui avait été vidée",
    repose.status === 200 && same(repose.json?.note?.tags, ["Final"]),
    `http ${repose.status}, tags=${show(repose.json?.note?.tags)}`,
  );

  const titreSeul = await inst.call("PATCH", "/api/notes/cycle-1", {
    token: cyc.token,
    body: { title: "Titre changé", client_updated_at: nextIso() },
  });
  t.check(
    "changer le titre sans parler d'étiquettes laisse les étiquettes en place",
    titreSeul.status === 200 && !titreSeul.json?.stale
      && titreSeul.json?.note?.title === "Titre changé"
      && same(titreSeul.json?.note?.tags, ["Final"]),
    `http ${titreSeul.status}, titre=${show(titreSeul.json?.note?.title)}, tags=${show(titreSeul.json?.note?.tags)}`,
  );

  const relu = await inst.call("GET", "/api/notes/cycle-1", { token: cyc.token });
  t.check(
    "relire la note plus tard rend la même liste d'étiquettes",
    relu.status === 200 && same(relu.json?.tags, ["Final"]),
    `http ${relu.status}, tags=${show(relu.json?.tags)}`,
  );

  {
    // Sonde en base: les étiquettes sont personnelles, elles doivent
    // vivre dans note_user_tags et jamais dans la colonne partagée.
    const base = inst.db(true);
    const perso = base
      .prepare("SELECT tags_json FROM note_user_tags WHERE note_id = ? AND user_id = ?")
      .get("cycle-1", cyc.id);
    const lignes = base
      .prepare("SELECT COUNT(*) AS c FROM note_user_tags WHERE note_id = ?")
      .get("cycle-1");
    const partage = base.prepare("SELECT tags_json FROM notes WHERE id = ?").get("cycle-1");
    base.close();
    t.check(
      "en base, les étiquettes sont rangées par utilisateur sur une seule ligne",
      perso?.tags_json === '["Final"]' && lignes?.c === 1,
      `note_user_tags=${show(perso?.tags_json)}, lignes=${show(lignes?.c)}`,
    );
    t.check(
      "en base, la colonne d'étiquettes partagée de la note reste vide",
      partage?.tags_json === "[]",
      `notes.tags_json=${show(partage?.tags_json)}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // 2. Accents, espaces et doublons: le serveur ne doit rien nettoyer.
  // ─────────────────────────────────────────────────────────────────
  const acc = await compte("accents");
  const ETIQUETTES = ["  Été accentué  ", "à faire", "Étiquette avec espaces", "à faire"];
  const tsAcc = nextIso();
  const noteAcc = await inst.call("POST", "/api/notes", {
    token: acc.token,
    body: {
      id: "accents-1", title: "Voyage", content: "réserver l'hôtel",
      tags: ETIQUETTES, timestamp: tsAcc, client_updated_at: tsAcc,
    },
  });
  t.check(
    "les accents, les espaces autour et les doublons d'étiquettes sont conservés tels quels à la création",
    noteAcc.status === 201 && same(noteAcc.json?.tags, ETIQUETTES),
    `http ${noteAcc.status}, tags=${show(noteAcc.json?.tags)}`,
  );

  const reluAcc = await inst.call("GET", "/api/notes/accents-1", { token: acc.token });
  t.check(
    "relire la note rend les étiquettes accentuées caractère pour caractère",
    same(reluAcc.json?.tags, ETIQUETTES),
    `tags=${show(reluAcc.json?.tags)}`,
  );

  const exportAcc = await inst.call("GET", "/api/notes/export", { token: acc.token });
  t.check(
    "l'export rend les étiquettes accentuées sans les rogner",
    same(exportAcc.json?.notes?.[0]?.tags, ETIQUETTES),
    `tags=${show(exportAcc.json?.notes?.[0]?.tags)}`,
  );

  const accBis = await compte("accentsbis");
  const importAcc = await inst.call("POST", "/api/notes/import", {
    token: accBis.token, body: exportAcc.json,
  });
  const listeAccBis = await inst.call("GET", "/api/notes", { token: accBis.token });
  t.check(
    "après un aller-retour export puis import, les étiquettes accentuées sont intactes",
    importAcc.json?.imported === 1 && same(listeAccBis.json?.[0]?.tags, ETIQUETTES),
    `import=${show(importAcc.json)}, tags=${show(listeAccBis.json?.[0]?.tags)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 3. Forme exacte de l'export, puis aller-retour vers un autre compte.
  // ─────────────────────────────────────────────────────────────────
  const src = await compte("source");
  const dst = await compte("destination");
  const tsA = nextIso(), tsB = nextIso(), tsC = nextIso();
  await inst.call("POST", "/api/notes", {
    token: src.token,
    body: {
      id: "src-epinglee", type: "text", title: "Épinglée", content: "corps un",
      tags: ["photo"], images: [IMAGE_TEST], color: "blue",
      pinned: true, position: 5000, timestamp: tsA, client_updated_at: tsA,
    },
  });
  await inst.call("POST", "/api/notes", {
    token: src.token,
    body: {
      id: "src-liste", type: "checklist", title: "Courses",
      items: [{ id: "it-1", text: "pain", done: false }, { id: "it-2", text: "lait", done: true }],
      tags: ["Maison"], position: 9000, timestamp: tsB, client_updated_at: tsB,
    },
  });
  await inst.call("POST", "/api/notes", {
    token: src.token,
    body: {
      id: "src-nue", type: "text", title: "Nue", content: "sans rien",
      position: 100, timestamp: tsC, client_updated_at: tsC,
    },
  });

  const exp = await inst.call("GET", "/api/notes/export", { token: src.token });
  const enveloppe = exp.json || {};
  t.check(
    "l'export est une enveloppe signée par l'application et par le compte, pas un simple tableau",
    exp.status === 200 && !Array.isArray(enveloppe)
      && enveloppe.app === "glass-keep" && enveloppe.version === 1
      && enveloppe.user === src.email
      && typeof enveloppe.exportedAt === "string" && enveloppe.exportedAt.endsWith("Z")
      && Number.isFinite(Date.parse(enveloppe.exportedAt))
      && Array.isArray(enveloppe.notes) && enveloppe.notes.length === 3,
    `http ${exp.status}, app=${show(enveloppe.app)}, version=${show(enveloppe.version)}, user=${show(enveloppe.user)}, exportedAt=${show(enveloppe.exportedAt)}, nb=${enveloppe.notes?.length}`,
  );

  t.check(
    "chaque note exportée porte exactement les douze champs prévus et rien de plus",
    enveloppe.notes?.every((nt) => same(Object.keys(nt), CHAMPS_EXPORT)),
    `champs de la première note=${show(Object.keys(enveloppe.notes?.[0] || {}))}`,
  );

  t.check(
    "l'export ne laisse fuiter ni le propriétaire ni l'état interne de la note",
    enveloppe.notes?.every((nt) => ["user_id", "updated_at", "client_updated_at", "archived",
      "trashed", "lastEditedBy", "collaborators", "access", "federation"]
      .every((c) => !(c in nt))),
    `champs=${show(Object.keys(enveloppe.notes?.[0] || {}))}`,
  );

  t.check(
    "l'export range les notes épinglée d'abord, puis de la position la plus haute à la plus basse",
    same(enveloppe.notes?.map((nt) => nt.id), ["src-epinglee", "src-liste", "src-nue"]),
    `ordre obtenu=${show(enveloppe.notes?.map((nt) => `${nt.id}/pinned=${nt.pinned}/pos=${nt.position}`))}`,
  );

  const listeExportee = enveloppe.notes?.find((nt) => nt.id === "src-liste");
  t.check(
    "une liste à cocher est exportée avec ses items et leurs identifiants",
    same(listeExportee?.items, [
      { id: "it-1", text: "pain", done: false },
      { id: "it-2", text: "lait", done: true },
    ]) && listeExportee?.content === "" && listeExportee?.type === "checklist",
    `items=${show(listeExportee?.items)}, content=${show(listeExportee?.content)}`,
  );

  const imp = await inst.call("POST", "/api/notes/import", {
    token: dst.token, body: enveloppe,
  });
  t.check(
    "importer l'export d'un autre compte crée les trois notes et n'en saute aucune",
    imp.status === 200 && same(imp.json, { ok: true, imported: 3, updated: 0, skipped: 0 }),
    `http ${imp.status}, corps=${cut(imp.text)}`,
  );
  t.check(
    "la réponse d'import ne dit que combien de notes sont passées, jamais leur contenu ni leurs identifiants",
    same(Object.keys(imp.json || {}).sort(), ["imported", "ok", "skipped", "updated"]),
    `champs=${show(Object.keys(imp.json || {}))}`,
  );

  const chezDst = await inst.call("GET", "/api/notes", { token: dst.token });
  const parTitre = new Map((chezDst.json || []).map((nt) => [nt.title, nt]));
  const champsPreserves = ["type", "title", "content", "items", "tags", "images", "color", "pinned", "position", "timestamp"];
  const ecarts = [];
  for (const attendue of enveloppe.notes || []) {
    const obtenue = parTitre.get(attendue.title);
    if (!obtenue) { ecarts.push(`note "${attendue.title}" absente`); continue; }
    for (const c of champsPreserves) {
      if (!same(obtenue[c], attendue[c])) {
        ecarts.push(`"${attendue.title}".${c}: attendu ${show(attendue[c])}, obtenu ${show(obtenue[c])}`);
      }
    }
  }
  t.check(
    "l'aller-retour préserve titre, contenu, type, items, étiquettes, images, couleur, épinglage, position et date",
    (chezDst.json?.length === 3) && ecarts.length === 0,
    ecarts.length ? ecarts.join(" | ") : `${chezDst.json?.length} notes reçues`,
  );

  t.check(
    "les notes importées appartiennent au porteur du jeton, pas au compte inscrit dans le fichier",
    (chezDst.json || []).every((nt) => nt.user_id === dst.id) && enveloppe.user === src.email,
    `user_id obtenus=${show((chezDst.json || []).map((nt) => nt.user_id))}, attendu ${dst.id}, fichier signé par ${enveloppe.user}`,
  );

  t.check(
    "les notes importées reçoivent de nouveaux identifiants, ceux de l'export étant déjà pris",
    (chezDst.json || []).every((nt) => !["src-epinglee", "src-liste", "src-nue"].includes(nt.id)),
    `ids obtenus=${show((chezDst.json || []).map((nt) => nt.id))}`,
  );

  t.check(
    "une note importée n'est marquée comme modifiée par personne",
    (chezDst.json || []).every((nt) => nt.updated_at === null && nt.lastEditedBy === null),
    `updated_at=${show((chezDst.json || []).map((nt) => nt.updated_at))}, lastEditedBy=${show((chezDst.json || []).map((nt) => nt.lastEditedBy))}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 4. Réimporter son propre export ne duplique rien et n'écrase rien.
  // ─────────────────────────────────────────────────────────────────
  const rei = await compte("reimport");
  for (const [id, titre, tags, couleur] of [
    ["rei-1", "Recettes", ["cuisine"], "yellow"],
    ["rei-2", "Bricolage", ["maison", "outils"], "green"],
  ]) {
    const ts = nextIso();
    await inst.call("POST", "/api/notes", {
      token: rei.token,
      body: { id, title: titre, content: `corps de ${titre}`, tags, color: couleur, timestamp: ts, client_updated_at: ts },
    });
  }
  const expRei = await inst.call("GET", "/api/notes/export", { token: rei.token });
  const avant = await inst.call("GET", "/api/notes", { token: rei.token });
  const empreinte = (l) => (l || []).map((nt) => `${nt.id}|${nt.title}|${show(nt.tags)}|${nt.color}|${nt.content}`);
  const impRei = await inst.call("POST", "/api/notes/import", {
    token: rei.token, body: expRei.json,
  });
  const apres = await inst.call("GET", "/api/notes", { token: rei.token });
  t.check(
    "réimporter son propre export ne crée aucune note et signale les deux notes sautées",
    same(impRei.json, { ok: true, imported: 0, updated: 0, skipped: 2 }),
    `corps=${cut(impRei.text)}`,
  );
  t.check(
    "après ce réimport, la liste de notes est rigoureusement identique",
    same(empreinte(avant.json), empreinte(apres.json)),
    `avant=${show(empreinte(avant.json))} après=${show(empreinte(apres.json))}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 5. Un lot mélangé: doublon déjà présent, doublon interne au lot,
  //    note neuve. Le total annoncé doit couvrir tout le lot.
  // ─────────────────────────────────────────────────────────────────
  const mix = await compte("melange");
  const tsMix = nextIso();
  await inst.call("POST", "/api/notes", {
    token: mix.token,
    body: { id: "mix-0", title: "Déjà là", content: "x", tags: ["ancien"], timestamp: tsMix, client_updated_at: tsMix },
  });
  const lot = [
    { id: "mix-a", title: "Déjà là", content: "x" },
    { id: "mix-b", title: "Neuve", content: "n" },
    { id: "mix-c", title: "Neuve", content: "n" },
  ];
  const impMix = await inst.call("POST", "/api/notes/import", {
    token: mix.token, body: { notes: lot },
  });
  const apresMix = await inst.call("GET", "/api/notes", { token: mix.token });
  t.check(
    "dans un lot, un doublon d'une note existante et un doublon interne au lot sont tous deux sautés",
    same(impMix.json, { ok: true, imported: 1, updated: 0, skipped: 2 }),
    `corps=${cut(impMix.text)}`,
  );
  t.check(
    "le compte des notes importées plus sautées couvre bien tout le lot envoyé",
    (impMix.json?.imported ?? -1) + (impMix.json?.skipped ?? -1) === lot.length,
    `${impMix.json?.imported} + ${impMix.json?.skipped} pour ${lot.length} notes envoyées`,
  );
  t.check(
    "le compte ne contient que la note d'origine et la seule note vraiment neuve",
    same((apresMix.json || []).map((nt) => nt.title).sort(), ["Déjà là", "Neuve"]),
    `titres=${show((apresMix.json || []).map((nt) => nt.title))}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 6. Une note de même contenu mais d'étiquettes et de couleur
  //    différentes est sautée: le dédoublonnage ne regarde ni l'un ni
  //    l'autre. Ce n'est ni une mise à jour ni une duplication.
  // ─────────────────────────────────────────────────────────────────
  const dou = await compte("doublon");
  const tsDou = nextIso();
  await inst.call("POST", "/api/notes", {
    token: dou.token,
    body: { id: "dou-1", title: "Idées", content: "a", tags: ["vieux"], color: "default", timestamp: tsDou, client_updated_at: tsDou },
  });
  const impDou = await inst.call("POST", "/api/notes/import", {
    token: dou.token,
    body: { notes: [{ id: "dou-neuf", title: "Idées", content: "a", tags: ["neuf"], color: "blue" }] },
  });
  const apresDou = await inst.call("GET", "/api/notes", { token: dou.token });
  t.check(
    "une note déjà là dont la sauvegarde porte d'autres étiquettes est restaurée, pas dupliquée ni sautée",
    same(impDou.json, { ok: true, imported: 0, updated: 1, skipped: 0 }),
    `corps=${cut(impDou.text)}`,
  );
  t.check(
    "la note en place récupère les étiquettes et la couleur du fichier, sans devenir une seconde note",
    apresDou.json?.length === 1 && same(apresDou.json?.[0]?.tags, ["neuf"])
      && apresDou.json?.[0]?.color === "blue" && apresDou.json?.[0]?.id === "dou-1",
    `nb=${apresDou.json?.length}, note=${show(apresDou.json?.[0] && { id: apresDou.json[0].id, tags: apresDou.json[0].tags, color: apresDou.json[0].color })}`,
  );

  // Rejouer exactement le même fichier ne doit plus rien changer: c'est
  // la contrepartie de la restauration, sans quoi chaque import
  // compterait des mises à jour fantômes.
  const impDouBis = await inst.call("POST", "/api/notes/import", {
    token: dou.token,
    body: { notes: [{ id: "dou-neuf", title: "Idées", content: "a", tags: ["neuf"], color: "blue" }] },
  });
  t.check(
    "réimporter le même fichier une seconde fois ne restaure plus rien",
    same(impDouBis.json, { ok: true, imported: 0, updated: 0, skipped: 1 }),
    `corps=${cut(impDouBis.text)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 7. Importer une version modifiée ajoute une note et laisse
  //    l'originale strictement telle quelle.
  // ─────────────────────────────────────────────────────────────────
  const edi = await compte("edition");
  const tsEdi = nextIso();
  await inst.call("POST", "/api/notes", {
    token: edi.token,
    body: { id: "edi-1", title: "Rapport", content: "v1", tags: ["boulot"], timestamp: tsEdi, client_updated_at: tsEdi },
  });
  const expEdi = await inst.call("GET", "/api/notes/export", { token: edi.token });
  const modifie = { ...expEdi.json, notes: expEdi.json.notes.map((nt) => ({ ...nt, title: "Rapport v2" })) };
  const impEdi = await inst.call("POST", "/api/notes/import", { token: edi.token, body: modifie });
  const apresEdi = await inst.call("GET", "/api/notes", { token: edi.token });
  const origine = (apresEdi.json || []).find((nt) => nt.title === "Rapport");
  const version2 = (apresEdi.json || []).find((nt) => nt.title === "Rapport v2");
  t.check(
    "importer une version retouchée crée bien une note supplémentaire",
    same(impEdi.json, { ok: true, imported: 1, updated: 0, skipped: 0 }) && apresEdi.json?.length === 2,
    `corps=${cut(impEdi.text)}, nb notes=${apresEdi.json?.length}`,
  );
  t.check(
    "l'import n'a rien écrasé: la note d'origine garde son identifiant, son contenu et ses étiquettes",
    origine?.id === "edi-1" && origine?.content === "v1" && same(origine?.tags, ["boulot"]),
    `origine=${show(origine && { id: origine.id, content: origine.content, tags: origine.tags })}`,
  );
  t.check(
    "la version retouchée arrive sous un identifiant neuf et non sous celui de l'originale",
    !!version2 && version2.id !== "edi-1",
    `version2=${show(version2 && { id: version2.id, title: version2.title })}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 8. Un tableau nu est un corps d'import valide, et un identifiant
  //    encore libre est conservé.
  // ─────────────────────────────────────────────────────────────────
  const nue = await compte("tableaunu");
  const impNu = await inst.call("POST", "/api/notes/import", {
    token: nue.token,
    body: [{ id: "nu-1", title: "Sans enveloppe", content: "importée à plat", tags: ["direct"] }],
  });
  const apresNu = await inst.call("GET", "/api/notes", { token: nue.token });
  t.check(
    "un import envoyé comme un simple tableau de notes est accepté",
    impNu.status === 200 && same(impNu.json, { ok: true, imported: 1, updated: 0, skipped: 0 }),
    `http ${impNu.status}, corps=${cut(impNu.text)}`,
  );
  t.check(
    "la note importée à plat garde son identifiant libre, son contenu et ses étiquettes",
    apresNu.json?.[0]?.id === "nu-1" && apresNu.json?.[0]?.content === "importée à plat"
      && same(apresNu.json?.[0]?.tags, ["direct"]),
    `note=${show(apresNu.json?.[0] && { id: apresNu.json[0].id, content: apresNu.json[0].content, tags: apresNu.json[0].tags })}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 9. Refus d'import: chaque corps inexploitable doit être écarté avec
  //    le bon message, et sans rien créer.
  // ─────────────────────────────────────────────────────────────────
  const ref = await compte("refus");
  const corpsVides = [
    ["un objet vide", {}],
    ["une liste de notes vide", { notes: [] }],
    ["un champ notes qui n'est pas une liste", { notes: "pas un tableau" }],
    ["un tableau vide", []],
  ];
  for (const [description, corps] of corpsVides) {
    const r = await inst.call("POST", "/api/notes/import", { token: ref.token, body: corps });
    t.check(
      `un import contenant ${description} est refusé avec le message "No notes to import."`,
      r.status === 400 && r.json?.error === "No notes to import.",
      `http ${r.status}, corps=${cut(r.text)}`,
    );
  }
  const casse = await inst.call("POST", "/api/notes/import", {
    token: ref.token, raw: "{ceci n'est pas du json",
  });
  t.check(
    "un corps qui n'est même pas du JSON est refusé, mais sans message exploitable par le client",
    casse.status === 400 && casse.json === null,
    `http ${casse.status}, corps=${cut(casse.text, 80)}`,
  );
  const sansJeton = await inst.call("POST", "/api/notes/import", {
    body: { notes: [{ id: "pirate", title: "Sans jeton" }] },
  });
  t.check(
    "un import sans jeton d'authentification est refusé",
    sansJeton.status === 401 && sansJeton.json?.error === "Missing token",
    `http ${sansJeton.status}, corps=${cut(sansJeton.text)}`,
  );
  const jetonCasse = await inst.call("GET", "/api/notes/export", { token: "pas.un.jeton" });
  t.check(
    "un export demandé avec un jeton invalide est refusé",
    jetonCasse.status === 401 && jetonCasse.json?.error === "Invalid token",
    `http ${jetonCasse.status}, corps=${cut(jetonCasse.text)}`,
  );
  const apresRefus = await inst.call("GET", "/api/notes", { token: ref.token });
  t.check(
    "aucun de ces imports refusés n'a créé la moindre note",
    apresRefus.json?.length === 0,
    `notes trouvées=${show((apresRefus.json || []).map((nt) => nt.title))}`,
  );
  const expVide = await inst.call("GET", "/api/notes/export", { token: ref.token });
  t.check(
    "l'export d'un compte sans note rend une enveloppe complète avec une liste vide",
    expVide.status === 200 && expVide.json?.app === "glass-keep"
      && same(expVide.json?.notes, []),
    `http ${expVide.status}, corps=${cut(expVide.text)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 10. L'export ne montre que les notes actives dont on est
  //     propriétaire, et les étiquettes d'une note partagée restent
  //     propres à chacun.
  // ─────────────────────────────────────────────────────────────────
  const expo = await compte("exportateur");
  const tiers = await compte("tiers");
  for (const [id, titre] of [["act-a", "Active"], ["act-b", "À archiver"], ["act-c", "À jeter"]]) {
    const ts = nextIso();
    await inst.call("POST", "/api/notes", {
      token: expo.token,
      body: { id, title: titre, content: `contenu de ${titre}`, tags: ["tri"], timestamp: ts, client_updated_at: ts },
    });
  }
  const archivage = await inst.call("POST", "/api/notes/act-b/archive", {
    token: expo.token, body: { archived: true, client_updated_at: nextIso() },
  });
  const corbeille = await inst.call("POST", "/api/notes/act-c/trash", {
    token: expo.token, body: { client_updated_at: nextIso() },
  });
  t.check(
    "l'archivage et la mise à la corbeille de préparation sont bien acceptés",
    archivage.status === 200 && !archivage.json?.stale
      && corbeille.status === 200 && !corbeille.json?.stale,
    `archive http ${archivage.status} ${cut(archivage.text, 80)}, corbeille http ${corbeille.status} ${cut(corbeille.text, 80)}`,
  );

  const tsPartage = nextIso();
  await inst.call("POST", "/api/notes", {
    token: tiers.token,
    body: { id: "part-1", title: "Note partagée", content: "à deux", tags: ["classement du propriétaire"], timestamp: tsPartage, client_updated_at: tsPartage },
  });
  const partage = await inst.call("POST", "/api/notes/part-1/collaborate", {
    token: tiers.token, body: { username: expo.email },
  });
  t.check(
    "le partage de préparation avec l'autre compte est accepté",
    partage.status === 200 && partage.json?.ok === true,
    `http ${partage.status}, corps=${cut(partage.text)}`,
  );

  const expExpo = await inst.call("GET", "/api/notes/export", { token: expo.token });
  t.check(
    "l'export ne contient que la note active: ni l'archivée, ni celle en corbeille, ni celle qu'on nous a partagée",
    same(expExpo.json?.notes?.map((nt) => nt.id), ["act-a"]),
    `notes exportées=${show(expExpo.json?.notes?.map((nt) => nt.title))}`,
  );
  t.check(
    "aucun titre de note archivée, jetée ou partagée ne traîne dans le fichier d'export",
    !expExpo.text.includes("À archiver") && !expExpo.text.includes("À jeter")
      && !expExpo.text.includes("Note partagée"),
    `taille du corps=${expExpo.text.length}`,
  );

  const tagsPartage = await inst.call("PATCH", "/api/notes/part-1", {
    token: expo.token, body: { tags: ["mon classement"], client_updated_at: nextIso() },
  });
  const vueDestinataire = await inst.call("GET", "/api/notes/part-1", { token: expo.token });
  const vueProprietaire = await inst.call("GET", "/api/notes/part-1", { token: tiers.token });
  t.check(
    "sur une note partagée, chacun garde ses propres étiquettes sans écraser celles de l'autre",
    tagsPartage.status === 200 && !tagsPartage.json?.stale
      && same(vueDestinataire.json?.tags, ["mon classement"])
      && same(vueProprietaire.json?.tags, ["classement du propriétaire"]),
    `patch http ${tagsPartage.status}, vue du destinataire=${show(vueDestinataire.json?.tags)}, vue du propriétaire=${show(vueProprietaire.json?.tags)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 11. Épinglage: l'export doit montrer ce que l'écran montre.
  //     L'épingle est personnelle, elle vit dans note_user_positions;
  //     l'export lisait la colonne partagée et rendait donc épinglée
  //     une note que l'utilisateur avait dépinglée.
  // ─────────────────────────────────────────────────────────────────
  const epi = await compte("epinglage");
  const tsEpi = nextIso();
  await inst.call("POST", "/api/notes", {
    token: epi.token,
    body: { id: "epi-1", title: "Épinglée puis dépinglée", content: "c", pinned: true, timestamp: tsEpi, client_updated_at: tsEpi },
  });
  const depingle = await inst.call("PATCH", "/api/notes/epi-1", {
    token: epi.token, body: { pinned: false },
  });
  const vueEcran = await inst.call("GET", "/api/notes", { token: epi.token });
  const vueExport = await inst.call("GET", "/api/notes/export", { token: epi.token });
  t.check(
    "dépingler une note ne demande pas d'horodatage et est accepté",
    depingle.status === 200 && depingle.json?.ok === true,
    `http ${depingle.status}, corps=${cut(depingle.text)}`,
  );
  t.check(
    "la liste affichée montre bien la note comme dépinglée",
    vueEcran.json?.[0]?.pinned === false,
    `pinned dans la liste=${show(vueEcran.json?.[0]?.pinned)}`,
  );
  t.check(
    "l'export dit la même chose que l'écran: la note y est dépinglée",
    vueExport.json?.notes?.[0]?.pinned === false,
    `pinned dans l'export=${show(vueExport.json?.notes?.[0]?.pinned)}`,
  );
  t.check(
    "et il emporte le rangement personnel, pas la position de départ",
    vueExport.json?.notes?.[0]?.position === vueEcran.json?.[0]?.position,
    `export=${show(vueExport.json?.notes?.[0]?.position)}, écran=${show(vueEcran.json?.[0]?.position)}`,
  );

  // C'est le trajet qui compte vraiment: restaurer la sauvegarde ne doit
  // pas réépingler ce que l'utilisateur avait dépinglé.
  const epiBis = await compte("epinglagebis");
  await inst.call("POST", "/api/notes/import", { token: epiBis.token, body: vueExport.json });
  const listeEpiBis = await inst.call("GET", "/api/notes", { token: epiBis.token });
  t.check(
    "après restauration de la sauvegarde, la note est toujours dépinglée",
    listeEpiBis.json?.length === 1 && listeEpiBis.json?.[0]?.pinned === false,
    `note=${show(listeEpiBis.json?.[0] && { title: listeEpiBis.json[0].title, pinned: listeEpiBis.json[0].pinned })}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 12. Changer d'étiquettes exige un horodatage valide, et une
  //     écriture en retard ne doit rien écrire du tout.
  // ─────────────────────────────────────────────────────────────────
  const hor = await compte("horodatage");
  const tsHor = nextIso();
  await inst.call("POST", "/api/notes", {
    token: hor.token,
    body: { id: "hor-1", title: "Protégée", content: "c", tags: ["Origine"], timestamp: tsHor, client_updated_at: tsHor },
  });
  const sansTs = await inst.call("PATCH", "/api/notes/hor-1", {
    token: hor.token, body: { tags: ["Pirate"] },
  });
  t.check(
    "changer les étiquettes sans horodatage est refusé",
    sansTs.status === 400 && sansTs.json?.error === "client_updated_at is required",
    `http ${sansTs.status}, corps=${cut(sansTs.text)}`,
  );
  const decalage = await inst.call("PATCH", "/api/notes/hor-1", {
    token: hor.token, body: { tags: ["Pirate"], client_updated_at: "2026-01-01T10:00:00+02:00" },
  });
  t.check(
    "un horodatage avec un décalage horaire au lieu de l'heure universelle est refusé",
    decalage.status === 400 && String(decalage.json?.error || "").startsWith("Invalid timestamp format"),
    `http ${decalage.status}, corps=${cut(decalage.text)}`,
  );
  const futur = await inst.call("PATCH", "/api/notes/hor-1", {
    token: hor.token,
    body: { tags: ["Pirate"], client_updated_at: new Date(Date.now() + 3600 * 1000).toISOString() },
  });
  t.check(
    "un horodatage situé loin dans le futur est refusé",
    futur.status === 400 && String(futur.json?.error || "").startsWith("Timestamp too far in the future"),
    `http ${futur.status}, corps=${cut(futur.text)}`,
  );
  const enRetard = await inst.call("PATCH", "/api/notes/hor-1", {
    token: hor.token, body: { tags: ["Pirate"], client_updated_at: "2020-01-01T00:00:00.000Z" },
  });
  t.check(
    "une écriture plus ancienne que celle déjà enregistrée est signalée comme dépassée et n'écrit rien",
    enRetard.status === 200 && enRetard.json?.stale === true
      && same(enRetard.json?.note?.tags, ["Origine"]),
    `http ${enRetard.status}, stale=${show(enRetard.json?.stale)}, tags rendus=${show(enRetard.json?.note?.tags)}`,
  );
  const reluHor = await inst.call("GET", "/api/notes/hor-1", { token: hor.token });
  t.check(
    "après ces quatre tentatives, les étiquettes d'origine sont toujours en place",
    same(reluHor.json?.tags, ["Origine"]),
    `tags=${show(reluHor.json?.tags)}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 13. L'icône personnelle part dans l'export mais ne revient pas de
  //     l'import: perte connue de l'aller-retour.
  // ─────────────────────────────────────────────────────────────────
  const ico = await compte("icone");
  const icoBis = await compte("iconebis");
  const tsIco = nextIso();
  await inst.call("POST", "/api/notes", {
    token: ico.token,
    body: { id: "ico-1", title: "Avec icône", content: "c", tags: ["deco"], timestamp: tsIco, client_updated_at: tsIco },
  });
  const ICONE = { id: "ic1", src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==", name: "ic.png" };
  const poseIcone = await inst.call("PUT", "/api/notes/ico-1/icon", {
    token: ico.token, body: { icon: ICONE },
  });
  const expIco = await inst.call("GET", "/api/notes/export", { token: ico.token });
  t.check(
    "l'icône personnelle d'une note figure bien dans l'export",
    poseIcone.status === 200 && same(expIco.json?.notes?.[0]?.icon, ICONE),
    `pose http ${poseIcone.status}, icon exportée=${show(expIco.json?.notes?.[0]?.icon)}`,
  );
  await inst.call("POST", "/api/notes/import", { token: icoBis.token, body: expIco.json });
  const listeIcoBis = await inst.call("GET", "/api/notes", { token: icoBis.token });
  t.check(
    "après import, la note retrouve ses étiquettes et son icône",
    listeIcoBis.json?.length === 1 && same(listeIcoBis.json?.[0]?.tags, ["deco"])
      && same(listeIcoBis.json?.[0]?.icon, ICONE),
    `note=${show(listeIcoBis.json?.[0] && { tags: listeIcoBis.json[0].tags, icon: listeIcoBis.json[0].icon })}`,
  );

  // ─────────────────────────────────────────────────────────────────
  // 14. L'import est silencieux: aucune notification temps réel n'est
  //     poussée aux autres onglets de l'utilisateur. On le prouve en
  //     déclenchant ensuite une écriture qui, elle, notifie: si son
  //     signal arrive et qu'aucun signal ne concerne la note importée,
  //     c'est que l'import n'en a émis aucun.
  // ─────────────────────────────────────────────────────────────────
  const sil = await compte("silence");
  const flux = await listenEvents(inst, sil.token);
  try {
    await inst.call("POST", "/api/notes/import", {
      token: sil.token,
      body: { notes: [{ id: "sil-1", title: "Importée en silence", content: "c", tags: ["muet"] }] },
    });
    const apresImport = await inst.call("GET", "/api/notes", { token: sil.token });
    const idImporte = apresImport.json?.[0]?.id;
    const tsSil = nextIso();
    const creeApres = await inst.call("POST", "/api/notes", {
      token: sil.token,
      body: { id: "sil-2", title: "Créée normalement", content: "c", timestamp: tsSil, client_updated_at: tsSil },
    });
    const signal = await flux.waitFor(
      (e) => e.data?.type === "note_updated" && e.data?.noteId === creeApres.json?.id,
      { timeout: 5000 },
    );
    t.check(
      "une création ordinaire prévient bien les autres onglets de l'utilisateur",
      !!signal,
      `événements reçus=${show(flux.events.map((e) => e.data?.type))}`,
    );
    t.check(
      "l'import, lui, ne prévient personne: aucun signal ne concerne la note importée",
      !!idImporte && !flux.events.some((e) => e.data?.noteId === idImporte),
      `note importée=${show(idImporte)}, signaux=${show(flux.events.map((e) => e.data?.noteId))}`,
    );
  } finally {
    flux.close();
  }
} finally {
  inst.stop();
}

process.exit(t.summary() ? 0 : 1);
