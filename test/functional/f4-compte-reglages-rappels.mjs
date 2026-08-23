// Scénario fonctionnel: le compte, ses réglages et ses rappels.
//
// Ce qui est vérifié ici, c'est la mémoire de l'application sur son
// utilisateur: un réglage enregistré revient après reconnexion, un
// avatar posé se relit à l'octet près, un rappel posé se déclenche
// vraiment et produit une notification, et un changement de mot de
// passe coupe bien les autres appareils.
//
// Le balayeur de rappels est réglé à un demi-seconde pour ce scénario:
// par défaut il ne passe que toutes les trente secondes, ce qui rendrait
// le test inutilisable. C'est le seul écart avec une instance normale.
import { startInstance, createAndLogin, listenEvents, runner, sleep } from "./lab.mjs";

const PORT = 9514;
const t = runner("Compte, réglages et rappels");

// Horodatage strict attendu par les routes d'écriture: ISO UTC, jamais
// plus de cinq minutes dans le futur. Horloge monotone pour que chaque
// écriture soit postérieure à la précédente.
let horloge = Date.now() - 3600 * 1000;
const iso = () => new Date((horloge += 1000)).toISOString();
const retard = () => new Date(horloge - 3600 * 1000).toISOString();

const j = (v) => JSON.stringify(v);
const bout = (s, n = 160) => String(s ?? "").slice(0, n);

// Une image minuscule mais conforme au motif attendu par l'avatar:
// png, jpeg ou webp, base64 sans espace ni retour à la ligne.
const AVATAR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

const inst = await startInstance({ port: PORT, env: { REMINDER_SWEEP_MS: "500" } });
const flux = [];

try {
  const moi = await createAndLogin(inst, {
    name: "Camille", email: "camille@glasskeep.test", password: "Passw0rd-camille",
  });

  // ───────────────────────────────────────────────────────────────────
  // 1. Le profil: ce que l'application sait de vous et ce qu'elle
  //    accepte de changer.
  // ───────────────────────────────────────────────────────────────────
  const me = await inst.call("GET", "/api/user/me", { token: moi.token });
  t.check(
    "le compte se relit avec son nom, son adresse et son statut",
    me.status === 200 && me.json?.id === moi.id && me.json?.name === "Camille"
      && me.json?.email === "camille@glasskeep.test" && me.json?.is_admin === false
      && me.json?.avatar_url === null,
    `http ${me.status}, corps=${bout(me.text)}`,
  );

  const profil = await inst.call("GET", "/api/user/profile", { token: moi.token });
  t.check(
    "un compte neuf ne s'affiche pas sur l'écran de connexion",
    profil.status === 200 && profil.json?.show_on_login === false,
    `show_on_login=${j(profil.json?.show_on_login)}`,
  );

  const surEcran = await inst.call("PATCH", "/api/user/profile", {
    token: moi.token, body: { show_on_login: true, language: "fr" },
  });
  t.check(
    "se rendre visible sur l'écran de connexion est accepté et confirmé",
    surEcran.status === 200 && surEcran.json?.ok === true
      && surEcran.json?.show_on_login === true && surEcran.json?.language === "fr",
    `http ${surEcran.status}, corps=${bout(surEcran.text)}`,
  );

  const listeConnexion = await inst.call("GET", "/api/login/profiles");
  t.check(
    "et le compte apparaît alors vraiment dans la liste publique de l'écran de connexion",
    listeConnexion.status === 200
      && (listeConnexion.json || []).some((p) => p.id === moi.id && p.name === "Camille"),
    `http ${listeConnexion.status}, liste=${bout(listeConnexion.text)}`,
  );

  const langueRelue = await inst.call("GET", "/api/user/me", { token: moi.token });
  const langueReglages = await inst.call("GET", "/api/user/settings", { token: moi.token });
  t.check(
    "la langue choisie est la même partout: profil, compte et réglages",
    langueRelue.json?.language === "fr" && langueReglages.json?.language === "fr",
    `me=${j(langueRelue.json?.language)}, settings=${j(langueReglages.json?.language)}`,
  );

  const pasBooleen = await inst.call("PATCH", "/api/user/profile", {
    token: moi.token, body: { show_on_login: 1 },
  });
  t.check(
    "un « oui » écrit autrement qu'en vrai booléen est refusé au lieu d'être deviné",
    pasBooleen.status === 400 && /boolean/i.test(pasBooleen.json?.error || ""),
    `http ${pasBooleen.status}, ${j(pasBooleen.json?.error)}`,
  );

  const renommer = await inst.call("PATCH", "/api/user/profile", {
    token: moi.token, body: { name: "Camille B." },
  });
  const nomInchange = await inst.call("GET", "/api/user/me", { token: moi.token });
  t.check(
    "le nom d'affichage ne se change pas ici, et la demande est refusée au lieu d'être ignorée",
    renommer.status === 400 && nomInchange.json?.name === "Camille",
    `http ${renommer.status}, ${j(renommer.json?.error)}, nom=${j(nomInchange.json?.name)}`,
  );

  // ───────────────────────────────────────────────────────────────────
  // 2. L'avatar: posé, relu à l'identique, retiré.
  // ───────────────────────────────────────────────────────────────────
  const poseAvatar = await inst.call("PUT", "/api/user/avatar", {
    token: moi.token, body: { avatar_url: AVATAR },
  });
  const avecAvatar = await inst.call("GET", "/api/user/me", { token: moi.token });
  const profilAvecAvatar = await inst.call("GET", "/api/user/profile", { token: moi.token });
  t.check(
    "l'avatar posé se relit à l'identique, sur le compte comme sur le profil",
    poseAvatar.status === 200 && poseAvatar.json?.avatar_url === AVATAR
      && avecAvatar.json?.avatar_url === AVATAR
      && profilAvecAvatar.json?.avatar_url === AVATAR,
    `http ${poseAvatar.status}, me=${bout(avecAvatar.json?.avatar_url, 40)}`,
  );

  const avatarSvg = await inst.call("PUT", "/api/user/avatar", {
    token: moi.token, body: { avatar_url: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" },
  });
  const toujoursLa = await inst.call("GET", "/api/user/me", { token: moi.token });
  t.check(
    "un format d'image non prévu est refusé et ne remplace pas l'avatar en place",
    avatarSvg.status === 400 && toujoursLa.json?.avatar_url === AVATAR,
    `http ${avatarSvg.status}, ${j(avatarSvg.json?.error)}`,
  );

  const retireAvatar = await inst.call("DELETE", "/api/user/avatar", { token: moi.token });
  const sansAvatar = await inst.call("GET", "/api/user/me", { token: moi.token });
  t.check(
    "retirer l'avatar le fait vraiment disparaître",
    retireAvatar.status === 200 && sansAvatar.json?.avatar_url === null,
    `http ${retireAvatar.status}, avatar=${j(sansAvatar.json?.avatar_url)}`,
  );

  // ───────────────────────────────────────────────────────────────────
  // 3. Les réglages: enregistrés, fusionnés, retrouvés après
  //    reconnexion, et diffusés aux autres onglets.
  // ───────────────────────────────────────────────────────────────────
  const vides = await inst.call("GET", "/api/user/settings", { token: moi.token });
  t.check(
    "un compte qui n'a rien réglé ne porte que sa langue",
    vides.status === 200 && vides.json && !Array.isArray(vides.json)
      && Object.keys(vides.json).filter((k) => k !== "language").length === 0,
    `corps=${bout(vides.text)}`,
  );

  const premier = await inst.call("PATCH", "/api/user/settings", {
    token: moi.token, body: { theme: "sombre", densite: "compacte" },
  });
  t.check(
    "enregistrer des réglages rend l'ensemble complet, pas seulement ce qui vient d'être envoyé",
    premier.status === 200 && premier.json?.theme === "sombre"
      && premier.json?.densite === "compacte",
    `http ${premier.status}, corps=${bout(premier.text)}`,
  );

  const second = await inst.call("PATCH", "/api/user/settings", {
    token: moi.token, body: { densite: "aérée" },
  });
  t.check(
    "changer un réglage ne fait pas oublier les autres",
    second.json?.densite === "aérée" && second.json?.theme === "sombre",
    `corps=${bout(second.text)}`,
  );

  // La fusion est superficielle: un objet imbriqué est remplacé en
  // entier, pas complété. C'est ce que le client attend, et un jour où
  // ce serait changé, tous les réglages imbriqués existants perdraient
  // discrètement des clés.
  await inst.call("PATCH", "/api/user/settings", {
    token: moi.token, body: { tri: { par: "date", sens: "desc" } },
  });
  const imbrique = await inst.call("PATCH", "/api/user/settings", {
    token: moi.token, body: { tri: { par: "titre" } },
  });
  t.check(
    "un réglage à tiroirs est remplacé en bloc et non complété",
    imbrique.json?.tri?.par === "titre" && imbrique.json?.tri?.sens === undefined,
    `tri=${j(imbrique.json?.tri)}`,
  );

  const reconnexion = await inst.call("POST", "/api/login", {
    body: { email: moi.email, password: moi.password },
  });
  const apresReconnexion = await inst.call("GET", "/api/user/settings", {
    token: reconnexion.json?.token,
  });
  t.check(
    "les réglages survivent à une reconnexion: ils tiennent au compte, pas à la session",
    apresReconnexion.json?.theme === "sombre" && apresReconnexion.json?.densite === "aérée",
    `corps=${bout(apresReconnexion.text)}`,
  );

  const mauvaisReglages = await inst.call("PATCH", "/api/user/settings", {
    token: moi.token, body: ["pas", "un", "objet"],
  });
  t.check(
    "une liste envoyée à la place d'un objet de réglages est refusée",
    mauvaisReglages.status === 400 && /settings/i.test(mauvaisReglages.json?.error || ""),
    `http ${mauvaisReglages.status}, ${j(mauvaisReglages.json?.error)}`,
  );

  // Deux onglets du même compte. Le serveur diffuse à tout le monde, y
  // compris à celui qui écrit; c'est l'identifiant d'onglet recopié
  // dans l'événement qui permet à l'émetteur de reconnaître son propre
  // écho et de l'ignorer. Sans cette recopie, chaque écriture
  // repartirait en boucle.
  const ongletA = await listenEvents(inst, moi.token);
  const ongletB = await listenEvents(inst, moi.token);
  flux.push(ongletA, ongletB);
  await ongletA.waitFor((e) => e.type === "hello");
  await ongletB.waitFor((e) => e.type === "hello");

  await inst.call("PATCH", "/api/user/settings", {
    token: moi.token, body: { theme: "clair" },
    headers: { "x-client-id": "onglet-A" },
  });
  const vuParA = await ongletA.waitFor((e) => e.data?.type === "user_settings_updated");
  const vuParB = await ongletB.waitFor((e) => e.data?.type === "user_settings_updated");

  t.check(
    "l'autre onglet est prévenu du réglage changé, avec la valeur",
    vuParB?.data?.settings?.theme === "clair",
    `reçu=${j(vuParB?.data)}`,
  );
  t.check(
    "l'onglet émetteur reçoit aussi le message, mais signé de son propre nom pour qu'il l'ignore",
    vuParA?.data?.originClientId === "onglet-A" && vuParB?.data?.originClientId === "onglet-A",
    `A=${j(vuParA?.data?.originClientId)}, B=${j(vuParB?.data?.originClientId)}`,
  );
  t.check(
    "le message ne transporte que ce qui a changé, pas tous les réglages",
    vuParB?.data?.settings && Object.keys(vuParB.data.settings).join(",") === "theme",
    `settings=${j(vuParB?.data?.settings)}`,
  );

  // ───────────────────────────────────────────────────────────────────
  // 4. Les rappels: posés, listés, effacés, et vraiment déclenchés.
  // ───────────────────────────────────────────────────────────────────
  const tsNote = iso();
  const note = await inst.call("POST", "/api/notes", {
    token: moi.token,
    body: {
      id: "rap-1", type: "text", title: "Sortir les poubelles",
      content: "mardi soir", timestamp: tsNote, client_updated_at: tsNote,
    },
  });
  t.check("une note support est créée pour le rappel", note.status === 201,
          `http ${note.status}, ${bout(note.text)}`);

  const dansUneHeure = new Date(Date.now() + 3600 * 1000).toISOString();
  const pose = await inst.call("POST", "/api/notes/rap-1/reminder", {
    token: moi.token, body: { reminderAt: dansUneHeure, client_updated_at: iso() },
  });
  t.check(
    "poser un rappel le range dans la note elle-même",
    pose.status === 200 && pose.json?.ok === true
      && pose.json?.note?.reminderAt === dansUneHeure && pose.json?.note?.reminderFiredAt === null,
    `http ${pose.status}, reminderAt=${j(pose.json?.note?.reminderAt)}`,
  );

  const aVenir = await inst.call("GET", "/api/reminders/upcoming", { token: moi.token });
  const entree = (aVenir.json?.reminders || []).find((r) => r.noteId === "rap-1");
  t.check(
    "le rappel apparaît dans les rappels à venir, à la bonne heure et avec le titre de la note",
    !!entree && entree.t === Date.parse(dansUneHeure) && entree.body === "Sortir les poubelles",
    `entrée=${j(entree)}`,
  );

  const enRetard = await inst.call("POST", "/api/notes/rap-1/reminder", {
    token: moi.token, body: { reminderAt: null, client_updated_at: retard() },
  });
  const toujoursPose = await inst.call("GET", "/api/notes/rap-1", { token: moi.token });
  t.check(
    "une commande arrivée en retard n'efface pas le rappel, et le dit",
    enRetard.status === 200 && enRetard.json?.stale === true
      && toujoursPose.json?.reminderAt === dansUneHeure,
    `stale=${j(enRetard.json?.stale)}, reminderAt=${j(toujoursPose.json?.reminderAt)}`,
  );

  const efface = await inst.call("POST", "/api/notes/rap-1/reminder", {
    token: moi.token, body: { reminderAt: null, client_updated_at: iso() },
  });
  const apresEffacement = await inst.call("GET", "/api/reminders/upcoming", { token: moi.token });
  t.check(
    "effacer le rappel le retire de la note et de la liste à venir",
    efface.json?.note?.reminderAt === null
      && !(apresEffacement.json?.reminders || []).some((r) => r.noteId === "rap-1"),
    `note=${j(efface.json?.note?.reminderAt)}, liste=${bout(apresEffacement.text)}`,
  );

  const sansHorodatage = await inst.call("POST", "/api/notes/rap-1/reminder", {
    token: moi.token, body: { reminderAt: dansUneHeure },
  });
  t.check(
    "un rappel sans horodatage de client est refusé: sans lui, deux appareils ne peuvent pas être départagés",
    sansHorodatage.status === 400 && /client_updated_at/.test(sansHorodatage.json?.error || ""),
    `http ${sansHorodatage.status}, ${j(sansHorodatage.json?.error)}`,
  );

  // Le vrai test du rappel: est-ce qu'il sonne. On en pose un dans une
  // seconde et demie et on attend que le balayeur fasse son travail.
  const ecoute = await listenEvents(inst, moi.token);
  flux.push(ecoute);
  await ecoute.waitFor((e) => e.type === "hello");

  const bientot = new Date(Date.now() + 1500).toISOString();
  await inst.call("POST", "/api/notes/rap-1/reminder", {
    token: moi.token, body: { reminderAt: bientot, client_updated_at: iso() },
  });

  const sonne = await ecoute.waitFor((e) => e.data?.type === "reminder_due", { timeout: 15000 });
  t.check(
    "le rappel finit par sonner tout seul et prévient l'appareil connecté",
    !!sonne, `événements=${bout(j(ecoute.events.map((e) => e.data?.type || e.type)))}`,
  );

  // La notification arrive en base juste après l'événement; on attend
  // qu'elle soit là plutôt que de deviner un délai.
  let attente = null;
  for (let i = 0; i < 40 && !attente; i++) {
    const r = await inst.call("GET", "/api/notifications/pending", { token: moi.token });
    attente = (r.json?.notifications || []).find((n) => n.note_id === "rap-1");
    if (!attente) await sleep(250);
  }
  t.check(
    "et il laisse une notification en attente, rattachée à la bonne note",
    !!attente && attente.type === "reminder" && attente.message === "Sortir les poubelles",
    `notification=${j(attente)}`,
  );

  const plusAVenir = await inst.call("GET", "/api/reminders/upcoming", { token: moi.token });
  t.check(
    "un rappel qui a sonné ne sonne pas deux fois: il quitte la liste à venir",
    !(plusAVenir.json?.reminders || []).some((r) => r.noteId === "rap-1"),
    `liste=${bout(plusAVenir.text)}`,
  );

  // ───────────────────────────────────────────────────────────────────
  // 5. Le cycle d'une notification: en attente, accusée, archivée,
  //    retirée.
  // ───────────────────────────────────────────────────────────────────
  const accuse = await inst.call("POST", "/api/notifications/mark-delivered", {
    token: moi.token, body: { ids: [attente.id] },
  });
  const signal = await ecoute.waitFor(
    (e) => e.data?.type === "notification_delivered" && (e.data?.ids || []).includes(attente.id));
  const enAttente = await inst.call("GET", "/api/notifications/pending", { token: moi.token });
  const historique = await inst.call("GET", "/api/notifications/history", { token: moi.token });
  t.check(
    "accuser réception fait passer la notification des messages en attente à l'historique",
    accuse.status === 200
      && !(enAttente.json?.notifications || []).some((n) => n.id === attente.id)
      && (historique.json?.notifications || []).some((n) => n.id === attente.id),
    `attente=${bout(enAttente.text, 80)}, historique=${bout(historique.text, 120)}`,
  );
  t.check(
    "et les autres appareils en sont informés",
    !!signal, `reçu=${j(signal?.data)}`,
  );

  const reAccuse = await inst.call("POST", "/api/notifications/mark-delivered", {
    token: moi.token, body: { ids: [attente.id] },
  });
  const historiqueApres = await inst.call("GET", "/api/notifications/history", { token: moi.token });
  t.check(
    "accuser deux fois la même notification ne la duplique pas",
    reAccuse.status === 200
      && (historiqueApres.json?.notifications || []).filter((n) => n.id === attente.id).length === 1,
    `historique=${bout(historiqueApres.text, 120)}`,
  );

  const idsVides = await inst.call("POST", "/api/notifications/mark-delivered", {
    token: moi.token, body: { ids: [] },
  });
  t.check(
    "un accusé de réception sans identifiant est refusé plutôt qu'accepté sans rien faire",
    idsVides.status === 400, `http ${idsVides.status}, ${j(idsVides.json?.error)}`,
  );

  const retire = await inst.call("POST", "/api/notifications/remove", {
    token: moi.token, body: { ids: [attente.id] },
  });
  const historiqueVide = await inst.call("GET", "/api/notifications/history", { token: moi.token });
  t.check(
    "retirer une notification la supprime vraiment, et le serveur dit laquelle",
    retire.status === 200 && (retire.json?.ids || []).includes(attente.id)
      && !(historiqueVide.json?.notifications || []).some((n) => n.id === attente.id),
    `retiré=${j(retire.json?.ids)}, historique=${bout(historiqueVide.text, 80)}`,
  );

  const retireInconnu = await inst.call("POST", "/api/notifications/remove", {
    token: moi.token, body: { ids: [999999] },
  });
  t.check(
    "retirer une notification qui n'existe pas ne supprime rien et ne prétend pas le contraire",
    retireInconnu.status === 200 && (retireInconnu.json?.ids || []).length === 0,
    `ids=${j(retireInconnu.json?.ids)}`,
  );

  // Un dernier rappel pour avoir de quoi vider.
  const bientot2 = new Date(Date.now() + 1200).toISOString();
  await inst.call("POST", "/api/notes/rap-1/reminder", {
    token: moi.token, body: { reminderAt: bientot2, client_updated_at: iso() },
  });
  let aVider = null;
  for (let i = 0; i < 40 && !aVider; i++) {
    const r = await inst.call("GET", "/api/notifications/pending", { token: moi.token });
    aVider = (r.json?.notifications || [])[0];
    if (!aVider) await sleep(250);
  }
  const vide = await inst.call("POST", "/api/notifications/clear", { token: moi.token });
  const plusRien = await inst.call("GET", "/api/notifications/pending", { token: moi.token });
  const plusRienNonPlus = await inst.call("GET", "/api/notifications/history", { token: moi.token });
  t.check(
    "vider les notifications vide tout, en attente comme historique",
    vide.status === 200 && (plusRien.json?.notifications || []).length === 0
      && (plusRienNonPlus.json?.notifications || []).length === 0,
    `attente=${bout(plusRien.text, 60)}, historique=${bout(plusRienNonPlus.text, 60)}`,
  );

  // ───────────────────────────────────────────────────────────────────
  // 6. Le changement de mot de passe. En dernier: il révoque tous les
  //    jetons du compte, y compris celui qui a servi jusqu'ici.
  // ───────────────────────────────────────────────────────────────────
  const autreAppareil = await inst.call("POST", "/api/login", {
    body: { email: moi.email, password: moi.password },
  });
  const jetonAutreAppareil = autreAppareil.json?.token;
  t.check("un second appareil se connecte", !!jetonAutreAppareil, `http ${autreAppareil.status}`);

  const mauvaisActuel = await inst.call("POST", "/api/user/change-password", {
    token: moi.token, body: { current_password: "ce-n-est-pas-le-bon", new_password: "Nouveau-Passw0rd" },
  });
  const encoreValide = await inst.call("GET", "/api/user/me", { token: jetonAutreAppareil });
  t.check(
    "se tromper de mot de passe actuel ne change rien et ne déconnecte personne",
    mauvaisActuel.status === 401 && encoreValide.status === 200,
    `http ${mauvaisActuel.status}, autre appareil=${encoreValide.status}`,
  );

  const tropCourt = await inst.call("POST", "/api/user/change-password", {
    token: moi.token, body: { current_password: moi.password, new_password: "abc" },
  });
  t.check(
    "un nouveau mot de passe trop court est refusé",
    tropCourt.status === 400 && /6/.test(tropCourt.json?.error || ""),
    `http ${tropCourt.status}, ${j(tropCourt.json?.error)}`,
  );

  const change = await inst.call("POST", "/api/user/change-password", {
    token: moi.token, body: { current_password: moi.password, new_password: "Nouveau-Passw0rd" },
  });
  t.check(
    "changer son mot de passe rend un nouveau jeton pour continuer sans se reconnecter",
    change.status === 200 && typeof change.json?.token === "string"
      && change.json?.token !== moi.token && change.json?.user?.id === moi.id,
    `http ${change.status}, corps=${bout(change.text, 120)}`,
  );

  const ancienJeton = await inst.call("GET", "/api/user/me", { token: moi.token });
  const jetonAutre = await inst.call("GET", "/api/user/me", { token: jetonAutreAppareil });
  const nouveauJeton = await inst.call("GET", "/api/user/me", { token: change.json?.token });
  t.check(
    "tous les appareils déjà connectés sont coupés, y compris celui qui a fait le changement",
    ancienJeton.status === 401 && jetonAutre.status === 401,
    `ancien=${ancienJeton.status}, autre appareil=${jetonAutre.status}`,
  );
  t.check(
    "seul le jeton remis au moment du changement continue de fonctionner",
    nouveauJeton.status === 200 && nouveauJeton.json?.id === moi.id,
    `http ${nouveauJeton.status}`,
  );

  const ancienMotDePasse = await inst.call("POST", "/api/login", {
    body: { email: moi.email, password: moi.password },
  });
  const nouveauMotDePasse = await inst.call("POST", "/api/login", {
    body: { email: moi.email, password: "Nouveau-Passw0rd" },
  });
  t.check(
    "l'ancien mot de passe ne rouvre plus rien, le nouveau ouvre",
    !ancienMotDePasse.json?.token && !!nouveauMotDePasse.json?.token,
    `ancien=${ancienMotDePasse.status}, nouveau=${nouveauMotDePasse.status}`,
  );
} finally {
  for (const f of flux) f.close();
  inst.stop();
}

process.exit(t.summary() ? 0 : 1);
