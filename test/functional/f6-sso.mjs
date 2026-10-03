// Scénario fonctionnel: la connexion par un fournisseur OpenID Connect.
//
// Un faux fournisseur tourne dans ce processus. Il publie sa découverte
// et ses clés, signe de vrais jetons RS256, vérifie le PKCE et
// l'authentification du client comme le ferait Authentik ou Keycloak.
// Le scénario peut lui faire mentir sur un point précis (signature,
// nonce) pour vérifier que GlassKeep refuse.
//
// Ce qui est vérifié: l'interrupteur de l'administrateur, le fournisseur
// que chaque compte déclare pour lui-même et son secret qui ne ressort
// jamais, l'adresse privée refusée à un compte ordinaire, l'association
// qui seule fait le lien, la connexion par identifiant jusqu'à une
// session GlassKeep ordinaire, l'identité tenue par issuer + sub, et
// chaque refus: autre identité, autre navigateur, ticket ou état rejoué,
// jeton falsifié, nonce faux.
import http from "node:http";
import crypto from "node:crypto";
import { startInstance, createAndLogin, runner } from "./lab.mjs";

const PORT = 9519;
const IDP_PORT = 9520;
const ISSUER = `http://127.0.0.1:${IDP_PORT}/realm/`;
const CLIENT_ID = "glasskeep";
const CLIENT_SECRET = "s3cret-du-client-oidc";
const t = runner("Connexion OpenID Connect");
const j = (v) => JSON.stringify(v);

// ── Le faux fournisseur ──────────────────────────────────────────────
const b64url = (v) => Buffer.from(v).toString("base64url");
const keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const autreCle = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "cle-1";
const idp = {
  // Ce que le fournisseur répondra à la prochaine authentification.
  personne: { sub: "u-1", email: "nouveau@sso.test", name: "Nouveau" },
  // Sabotages ponctuels, remis à zéro après usage.
  signerAvecAutreCle: false,
  mauvaisNonce: false,
  emailSeulementDansUserinfo: false,
  codes: new Map(),
  jetons: new Map(),
};

function signer(payload, privateKey) {
  const head = b64url(JSON.stringify({ alg: "RS256", kid: KID, typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), privateKey).toString("base64url");
  return `${head}.${body}.${sig}`;
}

function lireCorps(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", () => resolve(data));
  });
}

const serveurIdp = http.createServer(async (req, res) => {
  const url = new URL(req.url, ISSUER);
  const json = (code, obj) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (url.pathname === "/realm/.well-known/openid-configuration") {
    return json(200, {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}authorize`,
      token_endpoint: `${ISSUER}token`,
      userinfo_endpoint: `${ISSUER}userinfo`,
      jwks_uri: `${ISSUER}jwks`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_basic"],
    });
  }
  if (url.pathname === "/enorme/.well-known/openid-configuration") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ issuer: `http://127.0.0.1:${IDP_PORT}/enorme/`, remplissage: "x".repeat(3 * 1024 * 1024) }));
  }
  if (url.pathname === "/realm/jwks") {
    return json(200, { keys: [{ ...keys.publicKey.export({ format: "jwk" }), kid: KID, use: "sig", alg: "RS256" }] });
  }
  if (url.pathname === "/realm/authorize") {
    const p = url.searchParams;
    const code = crypto.randomBytes(16).toString("hex");
    idp.codes.set(code, {
      personne: { ...idp.personne },
      nonce: p.get("nonce"),
      challenge: p.get("code_challenge"),
      methode: p.get("code_challenge_method"),
      redirectUri: p.get("redirect_uri"),
      clientId: p.get("client_id"),
      scope: p.get("scope"),
    });
    const retour = new URL(p.get("redirect_uri"));
    retour.searchParams.set("code", code);
    retour.searchParams.set("state", p.get("state"));
    res.writeHead(302, { location: retour.href });
    return res.end();
  }
  if (url.pathname === "/realm/token" && req.method === "POST") {
    const form = new URLSearchParams(await lireCorps(req));
    // RFC 6749 §2.3.1: identifiant et secret sont encodés avant base64.
    const basic = Buffer.from(String(req.headers.authorization || "").replace(/^Basic /, ""), "base64").toString();
    const [id, secret] = basic.split(":").map((v) => decodeURIComponent(v || ""));
    if (id !== CLIENT_ID || secret !== CLIENT_SECRET) return json(401, { error: "invalid_client" });
    const entree = idp.codes.get(form.get("code"));
    idp.codes.delete(form.get("code"));
    if (!entree) return json(400, { error: "invalid_grant" });
    const calcule = crypto.createHash("sha256").update(form.get("code_verifier") || "").digest("base64url");
    if (entree.methode !== "S256" || calcule !== entree.challenge || form.get("redirect_uri") !== entree.redirectUri) {
      return json(400, { error: "invalid_grant" });
    }
    const maintenant = Math.floor(Date.now() / 1000);
    const claims = {
      iss: ISSUER,
      sub: entree.personne.sub,
      aud: CLIENT_ID,
      iat: maintenant,
      exp: maintenant + 300,
      nonce: idp.mauvaisNonce ? "un-autre-nonce" : entree.nonce,
      name: entree.personne.name,
      groups: ["admins", "glasskeep-admins"],
      is_admin: true,
    };
    if (!idp.emailSeulementDansUserinfo) claims.email = entree.personne.email;
    const accessToken = crypto.randomBytes(16).toString("hex");
    idp.jetons.set(accessToken, entree.personne);
    const cle = idp.signerAvecAutreCle ? autreCle.privateKey : keys.privateKey;
    idp.signerAvecAutreCle = false;
    idp.mauvaisNonce = false;
    return json(200, {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 300,
      id_token: signer(claims, cle),
    });
  }
  if (url.pathname === "/realm/userinfo") {
    const personne = idp.jetons.get(String(req.headers.authorization || "").replace(/^Bearer /, ""));
    if (!personne) return json(401, { error: "invalid_token" });
    return json(200, { sub: personne.sub, email: personne.email, name: personne.name });
  }
  json(404, { error: "not_found" });
});
await new Promise((r) => serveurIdp.listen(IDP_PORT, "127.0.0.1", r));

// ── Le navigateur simulé ─────────────────────────────────────────────
// Un navigateur ici, c'est un pot de cookies et des redirections suivies
// à la main pour voir chaque étape.
function navigateur() {
  let cookie = null;
  return {
    oublierCookie() { cookie = null; },
    retenir(res) {
      for (const c of res.headers.getSetCookie?.() || []) {
        const [paire] = c.split(";");
        if (paire.startsWith("gk_oidc=")) cookie = paire.length > "gk_oidc=".length ? paire : null;
      }
    },
    entetes() { return cookie ? { cookie } : {}; },
  };
}

// Va jusqu'au retour dans l'application et rend ses paramètres.
async function parcours(inst, nav, { chemin = "/api/auth/oidc/login", token, corps = {}, avantRappel } = {}) {
  const headers = { "content-type": "application/json", ...nav.entetes() };
  if (token) headers.authorization = "Bearer " + token;
  const depart = await fetch(inst.base + chemin, { method: "POST", headers, body: JSON.stringify(corps) });
  nav.retenir(depart);
  const reponse = await depart.json();
  if (!reponse.authorizationUrl) return { refus: reponse.error, status: depart.status, params: {} };
  const chezIdp = await fetch(reponse.authorizationUrl, { redirect: "manual" });
  const rappel = chezIdp.headers.get("location");
  if (avantRappel) await avantRappel(rappel);
  const retour = await fetch(rappel, { redirect: "manual", headers: nav.entetes() });
  const location = retour.headers.get("location") || "";
  return {
    authorizationUrl: new URL(reponse.authorizationUrl),
    location,
    params: Object.fromEntries(new URL(location, inst.base).searchParams),
  };
}

const echanger = (inst, nav, ticket) =>
  inst.call("POST", "/api/auth/oidc/exchange", { body: { ticket }, headers: nav.entetes() });

const inst = await startInstance({ port: PORT });

try {
  const chef = await createAndLogin(inst, {
    name: "Chef", email: "chef@glasskeep.test", password: "Passw0rd-chef", isAdmin: true,
  });
  const second = await createAndLogin(inst, {
    name: "Second", email: "second@glasskeep.test", password: "Passw0rd-second", isAdmin: true,
  });
  const simple = await createAndLogin(inst, {
    name: "Simple", email: "simple@glasskeep.test", password: "Passw0rd-simple",
  });
  const config = (extra = {}) => ({
    displayName: "Authentik", issuer: ISSUER, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET,
    publicOrigin: inst.base, ...extra,
  });

  // ───────────────────────────────────────────────────────────────────
  // 1. L'interrupteur de l'administrateur.
  // ───────────────────────────────────────────────────────────────────
  const ferme = await inst.call("GET", "/api/auth/oidc/status");
  const moiFerme = await inst.call("GET", "/api/auth/oidc/me", { token: chef.token });
  const refusFerme = await inst.call("PUT", "/api/auth/oidc/me", { token: chef.token, body: config() });
  t.check("sur une instance neuve, le SSO est fermé et ne se configure pas",
    ferme.json?.available === false && moiFerme.json?.allowed === false
      && refusFerme.status === 403 && refusFerme.json?.error === "oidc_not_allowed",
    `${ferme.text} ${moiFerme.text} ${refusFerme.text}`);

  const parSimple = await inst.call("PATCH", "/api/admin/settings", { token: simple.token, body: { ssoAllowed: true } });
  const ouverture = await inst.call("PATCH", "/api/admin/settings", { token: chef.token, body: { ssoAllowed: true } });
  t.check("seul un administrateur ouvre le SSO",
    parSimple.status === 403 && ouverture.ok && ouverture.json?.ssoAllowed === true, `${parSimple.status} ${ouverture.text.slice(0, 120)}`);

  // ───────────────────────────────────────────────────────────────────
  // 2. Chacun déclare son fournisseur, dans ses réglages.
  // ───────────────────────────────────────────────────────────────────
  const prive = await inst.call("POST", "/api/auth/oidc/me/test", {
    token: simple.token, body: { issuer: ISSUER, clientId: CLIENT_ID },
  });
  const privePut = await inst.call("PUT", "/api/auth/oidc/me", { token: simple.token, body: config() });
  t.check("un compte ordinaire ne fait pas aller le serveur sur le réseau local",
    prive.json?.ok === false && prive.json.error === "oidc_private_forbidden"
      && privePut.status === 400 && privePut.json?.error === "oidc_private_forbidden",
    `${prive.text} ${privePut.text}`);

  const sansSlash = await inst.call("POST", "/api/auth/oidc/me/test", {
    token: chef.token, body: { issuer: ISSUER.slice(0, -1), clientId: CLIENT_ID },
  });
  t.check("un issuer qui ne correspond pas exactement est signalé avec la bonne valeur",
    sansSlash.json?.ok === false && sansSlash.json.error === "oidc_issuer_mismatch"
      && sansSlash.json.advertisedIssuer === ISSUER, sansSlash.text);

  const test = await inst.call("POST", "/api/auth/oidc/me/test", {
    token: chef.token, body: { issuer: ISSUER, clientId: CLIENT_ID },
  });
  t.check("le test lit la découverte et les clés de signature, et prévient pour le http",
    test.json?.ok === true && test.json.keyCount === 1 && test.json.warnings?.includes("issuer_not_https"), test.text);

  const enorme = await inst.call("POST", "/api/auth/oidc/me/test", {
    token: chef.token, body: { issuer: `http://127.0.0.1:${IDP_PORT}/enorme/`, clientId: CLIENT_ID },
  });
  const vivant = await inst.call("GET", "/api/health");
  t.check("une réponse démesurée du fournisseur est coupée, le serveur reste debout",
    enorme.json?.ok === false && enorme.json.error === "oidc_discovery_failed" && vivant.ok, enorme.text.slice(0, 200));

  const incomplet = await inst.call("PUT", "/api/auth/oidc/me", { token: chef.token, body: config({ clientSecret: "" }) });
  const injoignable = await inst.call("PUT", "/api/auth/oidc/me", {
    token: chef.token, body: config({ issuer: "http://127.0.0.1:1/absent/" }),
  });
  t.check("on n'enregistre ni un fournisseur incomplet, ni un fournisseur qui ne répond pas",
    incomplet.json?.error === "oidc_incomplete" && injoignable.json?.error === "oidc_discovery_failed",
    `${incomplet.text} ${injoignable.text}`);

  const enregistre = await inst.call("PUT", "/api/auth/oidc/me", { token: chef.token, body: config() });
  const relu = await inst.call("GET", "/api/auth/oidc/me", { token: chef.token });
  t.check("le fournisseur est enregistré avec l'adresse de retour à déclarer",
    enregistre.ok && relu.json?.allowed === true
      && relu.json.provider?.callbackUrl === `${inst.base}/api/auth/oidc/callback`
      && relu.json.identity === null, relu.text);
  t.check("le secret client ne ressort jamais du serveur",
    !enregistre.text.includes(CLIENT_SECRET) && !relu.text.includes(CLIENT_SECRET));
  const autreCompte = await inst.call("GET", "/api/auth/oidc/me", { token: second.token });
  t.check("le fournisseur d'un compte n'apparaît pas chez un autre", autreCompte.json?.provider === null, autreCompte.text);

  const avantLien = await inst.call("GET", "/api/auth/oidc/status");
  const nav = navigateur();
  const tropTot = await parcours(inst, nav, { corps: { email: "chef@glasskeep.test" } });
  t.check("tant que le compte n'est pas associé, rien ne s'ouvre par le fournisseur",
    avantLien.json?.available === false && tropTot.refus === "oidc_not_configured", `${avantLien.text} ${j(tropTot)}`);

  // ───────────────────────────────────────────────────────────────────
  // 3. L'association, la seule chose qui fait le lien.
  // ───────────────────────────────────────────────────────────────────
  const sansSession = await inst.call("POST", "/api/auth/oidc/link", { body: {} });
  t.check("associer demande d'être connecté", sansSession.status === 401);
  const sansMotDePasse = await inst.call("POST", "/api/auth/oidc/link", { token: chef.token, body: {} });
  const mauvaisMotDePasse = await inst.call("POST", "/api/auth/oidc/link", { token: chef.token, body: { password: "faux" } });
  const toujoursConnecte = await inst.call("GET", "/api/user/me", { token: chef.token });
  t.check("associer demande aussi le mot de passe, sans couper la session quand il est faux",
    sansMotDePasse.status === 403 && mauvaisMotDePasse.status === 403 && toujoursConnecte.ok,
    `${sansMotDePasse.text} ${mauvaisMotDePasse.text}`);

  idp.personne = { sub: "u-chef", email: "chef@authentik.test", name: "Chef" };
  idp.emailSeulementDansUserinfo = true;
  const association = await parcours(inst, nav, { chemin: "/api/auth/oidc/link", token: chef.token, corps: { password: chef.password } });
  idp.emailSeulementDansUserinfo = false;
  const apresLien = await inst.call("GET", "/api/auth/oidc/me", { token: chef.token });
  const disponible = await inst.call("GET", "/api/auth/oidc/status");
  t.check("l'association revient dans l'application sans ouvrir de session",
    association.params.oidc_linked === "1" && !association.params.oidc_ticket, association.location);
  t.check("le compte voit son identité, avec l'email lu sur userinfo quand le jeton n'en porte pas",
    apresLien.json?.identity?.email === "chef@authentik.test", apresLien.text);
  t.check("la page de connexion propose maintenant le bouton", disponible.json?.available === true, disponible.text);

  // ───────────────────────────────────────────────────────────────────
  // 4. La connexion par identifiant, jusqu'à une session ordinaire.
  // ───────────────────────────────────────────────────────────────────
  const premier = await parcours(inst, nav, { corps: { email: "chef@glasskeep.test" } });
  const demande = premier.authorizationUrl?.searchParams;
  t.check("la demande au fournisseur est un code avec PKCE S256, state et nonce",
    demande?.get("response_type") === "code" && demande.get("code_challenge_method") === "S256"
      && !!demande.get("code_challenge") && !!demande.get("state") && !!demande.get("nonce")
      && demande.get("redirect_uri") === `${inst.base}/api/auth/oidc/callback`
      && demande.get("scope") === "openid profile email", premier.authorizationUrl?.href);
  t.check("le secret client ne passe jamais par le navigateur",
    !premier.authorizationUrl?.href.includes(CLIENT_SECRET) && !premier.location.includes(CLIENT_SECRET));
  t.check("le retour dans l'application porte un ticket et rien d'autre",
    !!premier.params.oidc_ticket && Object.keys(premier.params).length === 1, premier.location);

  const session = await echanger(inst, nav, premier.params.oidc_ticket);
  const moi = await inst.call("GET", "/api/user/me", { token: session.json?.token });
  t.check("le ticket donne une session GlassKeep qui ouvre le bon compte",
    session.ok && moi.ok && moi.json.id === chef.id, moi.text);
  const rejoue = await echanger(inst, nav, premier.params.oidc_ticket);
  t.check("un ticket ne sert qu'une fois", rejoue.status === 401, rejoue.text);

  const parProfil = await parcours(inst, nav, { corps: { userId: chef.id } });
  const sessionProfil = await echanger(inst, nav, parProfil.params.oidc_ticket);
  t.check("depuis un profil choisi à l'écran, le compte est connu sans le taper",
    sessionProfil.json?.user?.id === chef.id, j(sessionProfil.json?.user));

  const ailleurs = await inst.call("POST", "/api/auth/oidc/login", {
    body: { email: "chef@glasskeep.test" }, headers: { origin: "https://autre-adresse.test" },
  });
  t.check("depuis une autre adresse que celle de la configuration, on le dit tout de suite",
    ailleurs.status === 409 && ailleurs.json?.error === "oidc_wrong_origin", ailleurs.text);

  const inconnu = await inst.call("POST", "/api/auth/oidc/login", { body: { email: "personne@glasskeep.test" } });
  const sansFournisseur = await inst.call("POST", "/api/auth/oidc/login", { body: { email: "simple@glasskeep.test" } });
  t.check("un compte inconnu et un compte sans fournisseur reçoivent la même réponse",
    inconnu.status === sansFournisseur.status && inconnu.text === sansFournisseur.text
      && inconnu.json?.error === "oidc_not_configured", `${inconnu.status} ${inconnu.text} / ${sansFournisseur.text}`);

  idp.personne = { sub: "u-intrus", email: "chef@glasskeep.test", name: "Intrus" };
  const intrus = await parcours(inst, nav, { corps: { email: "chef@glasskeep.test" } });
  t.check("une autre identité chez le même fournisseur n'ouvre pas le compte, même avec son email",
    intrus.params.oidc_error === "oidc_identity_mismatch" && !intrus.params.oidc_ticket, intrus.location);

  // ───────────────────────────────────────────────────────────────────
  // 5. Les refus: autre navigateur, état rejoué, jeton falsifié.
  // ───────────────────────────────────────────────────────────────────
  idp.personne = { sub: "u-chef", email: "chef@authentik.test", name: "Chef" };
  const autreNavigateur = navigateur();
  const vole = await parcours(inst, autreNavigateur, {
    corps: { email: "chef@glasskeep.test" },
    avantRappel: () => autreNavigateur.oublierCookie(),
  });
  t.check("un lien de retour ouvert dans un autre navigateur est refusé",
    vole.params.oidc_error === "oidc_expired", vole.location);

  let rappelRejoue = null;
  const unique = await parcours(inst, nav, {
    corps: { email: "chef@glasskeep.test" },
    avantRappel: (r) => { rappelRejoue = r; },
  });
  const encore = await fetch(rappelRejoue, { redirect: "manual", headers: nav.entetes() });
  t.check("un retour du fournisseur ne sert qu'une fois",
    !!unique.params.oidc_ticket
      && new URL(encore.headers.get("location"), inst.base).searchParams.get("oidc_error") === "oidc_expired");
  const ticketSansCookie = await inst.call("POST", "/api/auth/oidc/exchange", { body: { ticket: unique.params.oidc_ticket } });
  t.check("un ticket présenté sans le cookie du navigateur est refusé", ticketSansCookie.status === 401);

  idp.signerAvecAutreCle = true;
  const falsifie = await parcours(inst, nav, { corps: { email: "chef@glasskeep.test" } });
  t.check("un jeton signé par une autre clé est refusé", falsifie.params.oidc_error === "oidc_failed", falsifie.location);
  idp.mauvaisNonce = true;
  const nonce = await parcours(inst, nav, { corps: { email: "chef@glasskeep.test" } });
  t.check("un jeton qui ne porte pas le nonce attendu est refusé", nonce.params.oidc_error === "oidc_failed", nonce.location);

  // ───────────────────────────────────────────────────────────────────
  // 6. Une identité n'appartient qu'à un compte, et suit la configuration.
  // ───────────────────────────────────────────────────────────────────
  await inst.call("PUT", "/api/auth/oidc/me", { token: second.token, body: config() });
  const navSecond = navigateur();
  const dejaPrise = await parcours(inst, navSecond, { chemin: "/api/auth/oidc/link", token: second.token, corps: { password: second.password } });
  t.check("une identité déjà associée à un autre compte ne change pas de compte",
    dejaPrise.params.oidc_error === "oidc_identity_in_use", dejaPrise.location);

  await inst.call("PUT", "/api/auth/oidc/me", { token: chef.token, body: config({ clientSecret: "" }) });
  const memeConfig = await inst.call("GET", "/api/auth/oidc/me", { token: chef.token });
  await inst.call("PUT", "/api/auth/oidc/me", { token: chef.token, body: config({ clientId: "autre-client" }) });
  const autreClient = await inst.call("GET", "/api/auth/oidc/me", { token: chef.token });
  t.check("réenregistrer à l'identique garde l'association, changer de client l'efface",
    !!memeConfig.json?.identity && autreClient.json?.identity === null, `${memeConfig.text} ${autreClient.text}`);

  await inst.call("PUT", "/api/auth/oidc/me", { token: chef.token, body: config() });
  await parcours(inst, nav, { chemin: "/api/auth/oidc/link", token: chef.token, corps: { password: chef.password } });
  const dissocie = await inst.call("DELETE", "/api/auth/oidc/me/identity", { token: chef.token });
  const apresDissociation = await parcours(inst, nav, { corps: { email: "chef@glasskeep.test" } });
  t.check("après la dissociation, le fournisseur n'ouvre plus le compte",
    dissocie.ok && dissocie.json?.identity === null && !!dissocie.json?.provider
      && apresDissociation.refus === "oidc_not_configured", `${dissocie.text} ${j(apresDissociation)}`);

  const supprime = await inst.call("DELETE", "/api/auth/oidc/me", { token: chef.token });
  t.check("le compte peut retirer son fournisseur", supprime.ok && supprime.json?.provider === null, supprime.text);

  // ───────────────────────────────────────────────────────────────────
  // 7. Refermé par l'administrateur, plus rien ne passe.
  // ───────────────────────────────────────────────────────────────────
  await inst.call("PUT", "/api/auth/oidc/me", { token: chef.token, body: config() });
  await parcours(inst, nav, { chemin: "/api/auth/oidc/link", token: chef.token, corps: { password: chef.password } });
  const enAttente = await parcours(inst, nav, { corps: { email: "chef@glasskeep.test" } });
  await inst.call("PATCH", "/api/admin/settings", { token: chef.token, body: { ssoAllowed: false } });
  const ticketApresFermeture = await echanger(inst, nav, enAttente.params.oidc_ticket);
  t.check("un ticket obtenu juste avant la fermeture ne s'échange plus",
    !!enAttente.params.oidc_ticket && ticketApresFermeture.status === 401, ticketApresFermeture.text);
  const statut = await inst.call("GET", "/api/auth/oidc/status");
  const tentative = await inst.call("POST", "/api/auth/oidc/login", { body: { email: "chef@glasskeep.test" } });
  const lien = await inst.call("POST", "/api/auth/oidc/link", { token: chef.token, body: {} });
  const garde = await inst.call("GET", "/api/auth/oidc/me", { token: chef.token });
  t.check("refermé, le SSO disparaît de la connexion et ne démarre plus rien",
    statut.json?.available === false && tentative.status === 404 && lien.status === 403,
    `${statut.text} ${tentative.text} ${lien.text}`);
  t.check("la configuration de chacun est gardée pour une réouverture",
    garde.json?.allowed === false && !!garde.json?.provider && !!garde.json?.identity, garde.text);
} finally {
  inst.stop();
  serveurIdp.close();
}

process.exit(t.summary() ? 0 : 1);
