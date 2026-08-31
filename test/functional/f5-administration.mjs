// Scénario fonctionnel: le panneau d'administration.
//
// Ce qui est vérifié ici, c'est la chaîne complète d'un compte vue par
// l'administrateur: une inscription qui attend son approbation et
// n'ouvre rien avant, un compte créé à la main avec son mot de passe
// temporaire, les garde-fous qui empêchent l'instance de se retrouver
// sans administrateur, et les réglages d'instance qui doivent revenir
// tels qu'ils ont été posés, y compris sur les pages publiques.
//
// L'inscription est fermée par défaut sur une instance neuve: le
// scénario le vérifie d'abord, puis l'ouvre par le panneau, ce qui est
// exactement le chemin d'un opérateur.
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { startInstance, createAndLogin, listenEvents, runner } from "./lab.mjs";

const PORT = 9515;
// Le domaine des passkeys se joue derrière un proxy, sur une instance
// qui a sa propre base parce qu'elle doit survivre à un redémarrage.
const PORT_PROXY = 9516;
const PORT_PROXY_BIS = 9517;
const PORT_ENV = 9518;
const t = runner("Panneau d'administration");

const j = (v) => JSON.stringify(v);
const bout = (s, n = 160) => String(s ?? "").slice(0, n);
const emails = (liste) => (Array.isArray(liste) ? liste.map((u) => u.email) : liste);

const inst = await startInstance({ port: PORT });
const flux = [];

try {
  const chef = await createAndLogin(inst, {
    name: "Chef", email: "chef@glasskeep.test", password: "Passw0rd-chef", isAdmin: true,
  });
  const simple = await createAndLogin(inst, {
    name: "Simple", email: "simple@glasskeep.test", password: "Passw0rd-simple",
  });

  // ───────────────────────────────────────────────────────────────────
  // 1. La porte: qui a le droit d'entrer dans le panneau.
  // ───────────────────────────────────────────────────────────────────
  const ROUTES_ADMIN = [
    ["GET", "/api/admin/settings"],
    ["GET", "/api/admin/users"],
    ["GET", "/api/admin/pending-users"],
  ];
  const sansJeton = [];
  const avecCompteOrdinaire = [];
  for (const [methode, chemin] of ROUTES_ADMIN) {
    sansJeton.push((await inst.call(methode, chemin)).status);
    avecCompteOrdinaire.push((await inst.call(methode, chemin, { token: simple.token })).status);
  }
  t.check(
    "sans être connecté, le panneau ne dit rien du tout",
    sansJeton.every((s) => s === 401), `codes=${j(sansJeton)}`,
  );
  t.check(
    "connecté en simple utilisateur, le panneau reste fermé",
    avecCompteOrdinaire.every((s) => s === 403), `codes=${j(avecCompteOrdinaire)}`,
  );

  const creationParSimple = await inst.call("POST", "/api/admin/users", {
    token: simple.token,
    body: { name: "Intrus", email: "intrus@glasskeep.test", password: "Passw0rd-intrus" },
  });
  const listeApres = await inst.call("GET", "/api/admin/users", { token: chef.token });
  t.check(
    "un utilisateur ordinaire ne peut pas se fabriquer un collègue",
    creationParSimple.status === 403
      && !emails(listeApres.json).includes("intrus@glasskeep.test"),
    `http ${creationParSimple.status}, comptes=${j(emails(listeApres.json))}`,
  );

  // ───────────────────────────────────────────────────────────────────
  // 2. Les garde-fous: une instance ne doit jamais se retrouver sans
  //    administrateur. Testés maintenant, tant qu'il n'y en a qu'un.
  // ───────────────────────────────────────────────────────────────────
  const seRetrograder = await inst.call("PATCH", `/api/admin/users/${chef.id}`, {
    token: chef.token, body: { is_admin: false },
  });
  const toujoursChef = await inst.call("GET", "/api/admin/users", { token: chef.token });
  t.check(
    "le dernier administrateur ne peut pas se retirer son propre statut",
    seRetrograder.status === 400 && /last admin/i.test(seRetrograder.json?.error || "")
      && toujoursChef.status === 200,
    `http ${seRetrograder.status}, ${j(seRetrograder.json?.error)}`,
  );

  // Le garde-fou doit tenir quelle que soit la façon d'écrire « non ».
  // Comparé strictement à false, il laissait passer un 0, et l'instance
  // se retrouvait sans le moindre administrateur, sans moyen d'en refaire
  // un depuis l'interface.
  const contournements = [];
  for (const valeur of [0, "", null]) {
    const r = await inst.call("PATCH", `/api/admin/users/${chef.id}`, {
      token: chef.token, body: { is_admin: valeur },
    });
    const encoreAdmin = (await inst.call("GET", "/api/user/me", { token: chef.token })).json?.is_admin;
    contournements.push({ valeur, status: r.status, encoreAdmin });
  }
  t.check(
    "le garde-fou ne se contourne pas en écrivant « non » autrement",
    contournements.every((c) => c.status === 400 && c.encoreAdmin === true),
    `essais=${j(contournements)}`,
  );

  const seSupprimer = await inst.call("DELETE", `/api/admin/users/${chef.id}`, {
    token: chef.token,
  });
  const encoreLa = await inst.call("GET", "/api/user/me", { token: chef.token });
  t.check(
    "un administrateur ne peut pas supprimer son propre compte",
    seSupprimer.status === 400 && encoreLa.status === 200 && encoreLa.json?.id === chef.id,
    `http ${seSupprimer.status}, ${j(seSupprimer.json?.error)}`,
  );

  // ───────────────────────────────────────────────────────────────────
  // 3. Les réglages d'instance, et ce que le public en voit.
  // ───────────────────────────────────────────────────────────────────
  const avant = await inst.call("GET", "/api/admin/settings", { token: chef.token });
  t.check(
    "sur une instance neuve, les inscriptions sont fermées",
    avant.status === 200 && avant.json?.allowNewAccounts === false,
    `corps=${bout(avant.text)}`,
  );

  const regle = await inst.call("PATCH", "/api/admin/settings", {
    token: chef.token,
    body: {
      allowNewAccounts: true,
      loginSlogan: "Vos notes, chez vous",
      appName: "NomBeaucoupTropLong",
      loginBackgroundBlur: 99,
      loginTheme: "emerald",
    },
  });
  t.check(
    "les réglages posés reviennent tels quels, sauf ceux que le serveur borne exprès",
    regle.status === 200 && regle.json?.allowNewAccounts === true
      && regle.json?.loginSlogan === "Vos notes, chez vous"
      && regle.json?.loginTheme === "emerald"
      && regle.json?.appName === "NomBeaucou" && regle.json?.loginBackgroundBlur === 20,
    `corps=${bout(regle.text)}`,
  );

  const relus = await inst.call("GET", "/api/admin/settings", { token: chef.token });
  t.check(
    "et ils sont bien enregistrés, pas seulement renvoyés",
    relus.json?.allowNewAccounts === true && relus.json?.appName === "NomBeaucou"
      && relus.json?.loginSlogan === "Vos notes, chez vous",
    `corps=${bout(relus.text)}`,
  );

  const slogan = await inst.call("GET", "/api/admin/login-slogan");
  const ouverture = await inst.call("GET", "/api/admin/allow-registration");
  const habillage = await inst.call("GET", "/api/branding");
  t.check(
    "l'écran de connexion, qui n'est pas authentifié, voit les mêmes valeurs",
    slogan.json?.loginSlogan === "Vos notes, chez vous"
      && ouverture.json?.allowNewAccounts === true
      && habillage.json?.appName === "NomBeaucou" && habillage.json?.loginTheme === "emerald",
    `slogan=${j(slogan.json)}, ouverture=${j(ouverture.json)}, habillage=${bout(habillage.text, 120)}`,
  );

  const imageBancale = await inst.call("PATCH", "/api/admin/settings", {
    token: chef.token, body: { logo: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" },
  });
  const habillageIntact = await inst.call("GET", "/api/branding");
  t.check(
    "un logo dans un format non prévu est refusé et ne casse pas l'habillage en place",
    imageBancale.status === 400 && habillageIntact.json?.appName === "NomBeaucou",
    `http ${imageBancale.status}, ${j(imageBancale.json?.error)}`,
  );

  // ───────────────────────────────────────────────────────────────────
  // 4. L'inscription: elle attend, elle ne s'ouvre pas toute seule.
  // ───────────────────────────────────────────────────────────────────
  await inst.call("PATCH", "/api/admin/settings", {
    token: chef.token, body: { allowNewAccounts: false },
  });
  const inscriptionFermee = await inst.call("POST", "/api/register", {
    body: { name: "Refusée", email: "refusee@glasskeep.test", password: "Passw0rd-refusee" },
  });
  t.check(
    "inscriptions fermées: une demande est refusée en le disant",
    inscriptionFermee.status === 403 && /disabled/i.test(inscriptionFermee.json?.error || ""),
    `http ${inscriptionFermee.status}, ${j(inscriptionFermee.json?.error)}`,
  );
  await inst.call("PATCH", "/api/admin/settings", {
    token: chef.token, body: { allowNewAccounts: true },
  });

  const ecouteChef = await listenEvents(inst, chef.token);
  flux.push(ecouteChef);
  await ecouteChef.waitFor((e) => e.type === "hello");

  const demande = await inst.call("POST", "/api/register", {
    body: { name: "Nouvelle", email: "nouvelle@glasskeep.test", password: "Passw0rd-nouvelle" },
  });
  t.check(
    "une inscription est acceptée comme demande, sans ouvrir de session",
    demande.status === 202 && demande.json?.pending === true && !demande.json?.token,
    `http ${demande.status}, corps=${bout(demande.text)}`,
  );

  const connexionAvant = await inst.call("POST", "/api/login", {
    body: { email: "nouvelle@glasskeep.test", password: "Passw0rd-nouvelle" },
  });
  const comptesAvant = await inst.call("GET", "/api/admin/users", { token: chef.token });
  t.check(
    "tant que personne n'a approuvé, le compte n'existe pas et ne se connecte pas",
    !connexionAvant.json?.token
      && !emails(comptesAvant.json).includes("nouvelle@glasskeep.test"),
    `http ${connexionAvant.status}, comptes=${j(emails(comptesAvant.json))}`,
  );

  const prevenu = await ecouteChef.waitFor((e) => e.data?.type === "pending_user_registered");
  t.check(
    "l'administrateur connecté est prévenu tout de suite de la demande",
    prevenu?.data?.email === "nouvelle@glasskeep.test",
    `reçu=${j(prevenu?.data)}`,
  );

  const enAttente = await inst.call("GET", "/api/admin/pending-users", { token: chef.token });
  const laDemande = (enAttente.json || []).find((d) => d.email === "nouvelle@glasskeep.test");
  t.check(
    "la demande est listée avec son nom et son adresse, jamais son mot de passe",
    !!laDemande && laDemande.name === "Nouvelle"
      && !Object.keys(laDemande).some((k) => /password/i.test(k)),
    `demande=${j(laDemande)}`,
  );

  const approuve = await inst.call("POST", `/api/admin/pending-users/${laDemande.id}/approve`, {
    token: chef.token,
  });
  const connexionApres = await inst.call("POST", "/api/login", {
    body: { email: "nouvelle@glasskeep.test", password: "Passw0rd-nouvelle" },
  });
  t.check(
    "approuver crée le compte, qui se connecte avec le mot de passe choisi à l'inscription",
    approuve.status === 200 && approuve.json?.email === "nouvelle@glasskeep.test"
      && !!connexionApres.json?.token && connexionApres.json?.must_change_password !== true,
    `http ${approuve.status}, connexion=${connexionApres.status}, doitChanger=${j(connexionApres.json?.must_change_password)}`,
  );

  const listeVidee = await inst.call("GET", "/api/admin/pending-users", { token: chef.token });
  const reApprouve = await inst.call("POST", `/api/admin/pending-users/${laDemande.id}/approve`, {
    token: chef.token,
  });
  t.check(
    "une demande traitée quitte la file et ne peut pas être approuvée deux fois",
    !(listeVidee.json || []).some((d) => d.id === laDemande.id) && reApprouve.status === 404,
    `file=${j((listeVidee.json || []).map((d) => d.email))}, seconde approbation=${reApprouve.status}`,
  );

  // ───────────────────────────────────────────────────────────────────
  // 5. Le rejet: rien ne doit rester derrière.
  // ───────────────────────────────────────────────────────────────────
  await inst.call("POST", "/api/register", {
    body: { name: "Indésirable", email: "indesirable@glasskeep.test", password: "Passw0rd-indes" },
  });
  const fileAvantRejet = await inst.call("GET", "/api/admin/pending-users", { token: chef.token });
  const aRejeter = (fileAvantRejet.json || []).find((d) => d.email === "indesirable@glasskeep.test");
  const rejet = await inst.call("POST", `/api/admin/pending-users/${aRejeter.id}/reject`, {
    token: chef.token,
  });
  const comptesApresRejet = await inst.call("GET", "/api/admin/users", { token: chef.token });
  const connexionRejete = await inst.call("POST", "/api/login", {
    body: { email: "indesirable@glasskeep.test", password: "Passw0rd-indes" },
  });
  t.check(
    "rejeter une demande ne crée aucun compte et ne laisse aucune connexion possible",
    rejet.status === 200 && rejet.json?.ok === true
      && !emails(comptesApresRejet.json).includes("indesirable@glasskeep.test")
      && !connexionRejete.json?.token,
    `http ${rejet.status}, connexion=${connexionRejete.status}`,
  );

  // ───────────────────────────────────────────────────────────────────
  // 6. Les comptes créés depuis le panneau.
  // ───────────────────────────────────────────────────────────────────
  const cree = await inst.call("POST", "/api/admin/users", {
    token: chef.token,
    body: { name: "Recrue", email: "recrue@glasskeep.test", password: "Passw0rd-recrue" },
  });
  const premiereConnexion = await inst.call("POST", "/api/login", {
    body: { email: "recrue@glasskeep.test", password: "Passw0rd-recrue" },
  });
  t.check(
    "un compte créé par l'administrateur se connecte, mais doit changer son mot de passe",
    cree.status === 201 && cree.json?.email === "recrue@glasskeep.test"
      && cree.json?.is_admin === false
      && premiereConnexion.json?.must_change_password === true,
    `http ${cree.status}, doitChanger=${j(premiereConnexion.json?.must_change_password)}`,
  );

  const emailDejaPris = await inst.call("POST", "/api/admin/users", {
    token: chef.token,
    body: { name: "Doublon", email: "RECRUE@glasskeep.test", password: "Passw0rd-doublon" },
  });
  t.check(
    "deux comptes ne peuvent pas partager une adresse, même écrite autrement",
    emailDejaPris.status === 409, `http ${emailDejaPris.status}, ${j(emailDejaPris.json?.error)}`,
  );

  const jetonRecrue = premiereConnexion.json?.token;
  const reinitialise = await inst.call("PATCH", `/api/admin/users/${cree.json.id}`, {
    token: chef.token, body: { password: "Reinitialise-2026" },
  });
  const ancienneSession = await inst.call("GET", "/api/user/me", { token: jetonRecrue });
  const ancienMotDePasse = await inst.call("POST", "/api/login", {
    body: { email: "recrue@glasskeep.test", password: "Passw0rd-recrue" },
  });
  const nouveauMotDePasse = await inst.call("POST", "/api/login", {
    body: { email: "recrue@glasskeep.test", password: "Reinitialise-2026" },
  });
  t.check(
    "réinitialiser un mot de passe depuis le panneau coupe la session de la personne",
    reinitialise.status === 200 && ancienneSession.status === 401,
    `http ${reinitialise.status}, ancienne session=${ancienneSession.status}`,
  );
  t.check(
    "et seul le nouveau mot de passe rouvre le compte",
    !ancienMotDePasse.json?.token && !!nouveauMotDePasse.json?.token,
    `ancien=${ancienMotDePasse.status}, nouveau=${nouveauMotDePasse.status}`,
  );

  const supprime = await inst.call("DELETE", `/api/admin/users/${cree.json.id}`, {
    token: chef.token,
  });
  const comptesApresSuppression = await inst.call("GET", "/api/admin/users", { token: chef.token });
  t.check(
    "supprimer un compte le retire vraiment, et le serveur dit lequel",
    supprime.status === 200 && supprime.json?.deletedUser?.email === "recrue@glasskeep.test"
      && !emails(comptesApresSuppression.json).includes("recrue@glasskeep.test"),
    `http ${supprime.status}, supprimé=${j(supprime.json?.deletedUser)}`,
  );

  const supprimeInconnu = await inst.call("DELETE", "/api/admin/users/999999", {
    token: chef.token,
  });
  t.check(
    "supprimer un compte qui n'existe pas est un échec franc",
    supprimeInconnu.status === 404,
    `http ${supprimeInconnu.status}, ${j(supprimeInconnu.json?.error)}`,
  );

  // ───────────────────────────────────────────────────────────────────
  // 7. Le statut d'administrateur est relu en base à chaque requête.
  //    Sinon, retirer les droits à quelqu'un ne prendrait effet qu'à sa
  //    prochaine connexion, c'est à dire jamais s'il reste connecté.
  // ───────────────────────────────────────────────────────────────────
  const second = await inst.call("POST", "/api/admin/users", {
    token: chef.token,
    body: {
      name: "Adjoint", email: "adjoint@glasskeep.test",
      password: "Passw0rd-adjoint", is_admin: true,
    },
  });
  const connexionAdjoint = await inst.call("POST", "/api/login", {
    body: { email: "adjoint@glasskeep.test", password: "Passw0rd-adjoint" },
  });
  const jetonAdjoint = connexionAdjoint.json?.token;
  const adjointEntre = await inst.call("GET", "/api/admin/users", { token: jetonAdjoint });
  t.check(
    "un second administrateur créé depuis le panneau a bien accès au panneau",
    second.status === 201 && second.json?.is_admin === true && adjointEntre.status === 200,
    `création=${second.status}, accès=${adjointEntre.status}`,
  );

  const retrograde = await inst.call("PATCH", `/api/admin/users/${second.json.id}`, {
    token: chef.token, body: { is_admin: false },
  });
  const adjointRefuse = await inst.call("GET", "/api/admin/users", { token: jetonAdjoint });
  const adjointExiste = await inst.call("GET", "/api/user/profile", { token: jetonAdjoint });
  t.check(
    "lui retirer ses droits ferme le panneau immédiatement, sans attendre sa reconnexion",
    retrograde.status === 200 && retrograde.json?.is_admin === false
      && adjointRefuse.status === 403,
    `retrait=${retrograde.status}, accès ensuite=${adjointRefuse.status}`,
  );
  t.check(
    "mais son compte reste utilisable: on lui a retiré un rôle, pas sa session",
    adjointExiste.status === 200 && adjointExiste.json?.email === "adjoint@glasskeep.test",
    `http ${adjointExiste.status}`,
  );

  // ───────────────────────────────────────────────────────────────────
  // 8. La bibliothèque de logos: elle appartient à chacun, pas à
  //    l'administration.
  // ───────────────────────────────────────────────────────────────────
  const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
  const ajout = await inst.call("POST", "/api/logos", {
    token: simple.token, body: { name: "Mon logo", src: LOGO },
  });
  const mesLogos = await inst.call("GET", "/api/logos", { token: simple.token });
  t.check(
    "un utilisateur ordinaire peut ranger un logo et le retrouver",
    ajout.status === 200 && typeof ajout.json?.id === "string"
      && (mesLogos.json || []).some((l) => l.id === ajout.json.id && l.src === LOGO),
    `http ${ajout.status}, logos=${bout(mesLogos.text, 120)}`,
  );

  const memeImage = await inst.call("POST", "/api/logos", {
    token: simple.token, body: { name: "Le même en double", src: LOGO },
  });
  const apresDoublon = await inst.call("GET", "/api/logos", { token: simple.token });
  t.check(
    "ranger deux fois la même image ne crée pas de doublon",
    memeImage.json?.id === ajout.json.id
      && (apresDoublon.json || []).filter((l) => l.src === LOGO).length === 1,
    `id=${j(memeImage.json?.id)}, total=${(apresDoublon.json || []).length}`,
  );

  const logosDuChef = await inst.call("GET", "/api/logos", { token: chef.token });
  const suppressionParAutrui = await inst.call("DELETE", `/api/logos/${ajout.json.id}`, {
    token: chef.token,
  });
  t.check(
    "le logo d'un autre ne se voit pas et ne se supprime pas, même par un administrateur",
    (logosDuChef.json || []).length === 0 && suppressionParAutrui.status === 404,
    `logos du chef=${bout(logosDuChef.text, 60)}, suppression=${suppressionParAutrui.status}`,
  );

  const suppression = await inst.call("DELETE", `/api/logos/${ajout.json.id}`, {
    token: simple.token,
  });
  const plusDeLogo = await inst.call("GET", "/api/logos", { token: simple.token });
  t.check(
    "son propriétaire, lui, le supprime",
    suppression.status === 204 && (plusDeLogo.json || []).length === 0,
    `http ${suppression.status}, restants=${bout(plusDeLogo.text, 60)}`,
  );

  const pasUneImage = await inst.call("POST", "/api/logos", {
    token: simple.token, body: { name: "Pas une image", src: "https://exemple.test/logo.png" },
  });
  t.check(
    "une adresse externe n'est pas acceptée comme logo: la bibliothèque ne va rien chercher au dehors",
    pasUneImage.status === 400, `http ${pasUneImage.status}, ${j(pasUneImage.json?.error)}`,
  );

  // ───────────────────────────────────────────────────────────────────
  // 6. Le domaine des passkeys.
  //
  // Derrière un proxy, le seul endroit où le domaine apparaît est un
  // en-tête écrit par l'appelant: le serveur refuse de s'en servir. Un
  // administrateur le déclare donc une fois depuis le panneau, et cette
  // déclaration doit tenir, survivre au redémarrage, et ne jamais être
  // déplacée par une requête qui annonce autre chose.
  // ───────────────────────────────────────────────────────────────────
  const dossierPasskeys = mkdtempSync(path.join(tmpdir(), "gk-rp-"));
  const basePasskeys = path.join(dossierPasskeys, "data.sqlite");
  const proxy = { "x-forwarded-host": "notes.exemple.fr", "x-forwarded-proto": "https" };
  const autreProxy = { "x-forwarded-host": "mechant.exemple.fr", "x-forwarded-proto": "https" };

  const derriereProxy = await startInstance({
    port: PORT_PROXY, dbFile: basePasskeys, env: { TRUST_PROXY: "true" },
  });
  try {
    const patron = await createAndLogin(derriereProxy, {
      name: "Patron", email: "patron@glasskeep.test", password: "Passw0rd-patron", isAdmin: true,
    });
    const employe = await createAndLogin(derriereProxy, {
      name: "Employé", email: "employe@glasskeep.test", password: "Passw0rd-employe",
    });
    const etat = async (headers = proxy, token = patron.token) =>
      (await derriereProxy.call("GET", "/api/admin/settings", { token, headers })).json?.passkeyDomainState;

    const avant = await etat();
    t.check(
      "sur un domaine public, tant que rien n'est déclaré le panneau le dit et propose le domaine vu",
      avant?.source === "none" && avant?.effective === "" && avant?.suggested === "notes.exemple.fr",
      j(avant),
    );

    const refuses = [];
    for (const mauvais of ["https://notes.exemple.fr", "notes.exemple.fr:8080", "192.168.1.10", "notes.exemple.fr/app"]) {
      const r = await derriereProxy.call("PATCH", "/api/admin/settings", {
        token: patron.token, headers: proxy, body: { passkeyDomain: mauvais },
      });
      refuses.push(`${mauvais}=${r.status}`);
    }
    const toujoursVide = await etat();
    t.check(
      "une adresse collée depuis la barre du navigateur est refusée, pas rabotée en silence",
      refuses.every((r) => r.endsWith("=400")) && toujoursVide?.declared === "",
      `${refuses.join(" ")}, declared=${j(toujoursVide?.declared)}`,
    );

    const pose = await derriereProxy.call("PATCH", "/api/admin/settings", {
      token: patron.token, headers: proxy, body: { passkeyDomain: "Notes.Exemple.FR " },
    });
    t.check(
      "le domaine déclaré par l'administrateur devient celui des passkeys, en minuscules",
      pose.status === 200
        && pose.json?.passkeyDomainState?.source === "admin"
        && pose.json?.passkeyDomainState?.effective === "notes.exemple.fr",
      `http ${pose.status}, ${j(pose.json?.passkeyDomainState)}`,
    );

    const enBase = (() => {
      const db = derriereProxy.db(true);
      try { return db.prepare("SELECT webauthn_rp_id FROM app_settings WHERE id = 1").get(); }
      finally { db.close(); }
    })();
    t.check(
      "il est écrit en base et pas seulement gardé en mémoire",
      enBase?.webauthn_rp_id === "notes.exemple.fr", j(enBase),
    );

    const detourne = await etat(autreProxy);
    t.check(
      "une requête qui annonce un autre domaine ne déplace pas celui des passkeys",
      detourne?.effective === "notes.exemple.fr" && detourne?.source === "admin", j(detourne),
    );

    const parUnSimple = await derriereProxy.call("PATCH", "/api/admin/settings", {
      token: employe.token, headers: proxy, body: { passkeyDomain: "mechant.exemple.fr" },
    });
    const inchange = await etat();
    t.check(
      "un compte ordinaire ne peut pas le changer",
      parUnSimple.status === 403 && inchange?.effective === "notes.exemple.fr",
      `http ${parUnSimple.status}, ${j(inchange?.effective)}`,
    );
    derriereProxy.stop();

    // Le point de tout l'exercice: une variable d'environnement tenait
    // déjà après un redémarrage, un réglage gardé en mémoire non.
    const apresRedemarrage = await startInstance({
      port: PORT_PROXY_BIS, dbFile: basePasskeys, env: { TRUST_PROXY: "true" },
    });
    try {
      const revenu = await apresRedemarrage.call("POST", "/api/login", {
        body: { email: patron.email, password: patron.password },
      });
      const etatApres = (await apresRedemarrage.call("GET", "/api/admin/settings", {
        token: revenu.json?.token, headers: proxy,
      })).json?.passkeyDomainState;
      t.check(
        "il survit au redémarrage du serveur, et le journal de démarrage le nomme",
        etatApres?.effective === "notes.exemple.fr" && etatApres?.source === "admin"
          && apresRedemarrage.logs().includes("[passkeys] relying party from the admin panel (notes.exemple.fr)"),
        `${j(etatApres)}, journal=${bout(apresRedemarrage.logs().split("\n").find((l) => l.includes("[passkeys]")), 120)}`,
      );

      const vide = await apresRedemarrage.call("PATCH", "/api/admin/settings", {
        token: revenu.json?.token, headers: proxy, body: { passkeyDomain: "" },
      });
      t.check(
        "le vider rend la main à la résolution automatique",
        vide.status === 200 && vide.json?.passkeyDomainState?.source === "none",
        `http ${vide.status}, ${j(vide.json?.passkeyDomainState)}`,
      );
    } finally {
      apresRedemarrage.stop();
    }
  } finally {
    // stop() est idempotent: l'appel plus haut coupe l'instance avant le
    // redémarrage, celui-ci rattrape le cas où le scénario a échoué avant
    // d'y arriver. Sans lui, un échec laisse le port occupé et fait
    // échouer toutes les exécutions suivantes pour une autre raison.
    derriereProxy.stop();
    rmSync(dossierPasskeys, { recursive: true, force: true });
  }

  // Une instance dont l'opérateur a posé la variable: le panneau la
  // montre et refuse de la contredire, plutôt que d'accepter un
  // changement qui ne servirait à rien.
  const avecVariable = await startInstance({
    port: PORT_ENV, env: { TRUST_PROXY: "true", WEBAUTHN_RP_ID: "fixe.exemple.fr" },
  });
  try {
    const operateur = await createAndLogin(avecVariable, {
      name: "Opérateur", email: "op@glasskeep.test", password: "Passw0rd-op", isAdmin: true,
    });
    const vu = (await avecVariable.call("GET", "/api/admin/settings", {
      token: operateur.token, headers: proxy,
    })).json?.passkeyDomainState;
    const tentative = await avecVariable.call("PATCH", "/api/admin/settings", {
      token: operateur.token, headers: proxy, body: { passkeyDomain: "autre.exemple.fr" },
    });
    t.check(
      "quand la variable du serveur fixe le domaine, le panneau le montre et refuse de le changer",
      vu?.source === "configured" && vu?.effective === "fixe.exemple.fr" && vu?.lockedByEnv === true
        && tentative.status === 409,
      `${j(vu)}, tentative=${tentative.status}`,
    );
  } finally {
    avecVariable.stop();
  }
} finally {
  for (const f of flux) f.close();
  inst.stop();
}

process.exit(t.summary() ? 0 : 1);
