// Scénario fonctionnel: la connexion par un fournisseur OpenID Connect.
//
// Un faux fournisseur tourne dans ce processus. Il publie sa découverte
// et ses clés, signe de vrais jetons RS256, vérifie le PKCE et
// l'authentification du client comme le ferait Authentik ou Keycloak.
// Le scénario peut lui faire mentir sur un point précis (signature,
// nonce) pour vérifier que GlassKeep refuse.
//
// Ce qui est vérifié: la configuration réservée à l'administrateur et
// son secret qui ne ressort jamais, le parcours complet jusqu'à une
// session GlassKeep ordinaire, l'identité tenue par issuer + sub et non
// par l'email, l'absence de droits d'administrateur venus du
// fournisseur, l'association d'un compte existant, et chaque refus:
// navigateur différent, ticket rejoué, état rejoué, jeton falsifié.
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
    cookie: () => cookie,
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
async function parcours(inst, nav, { chemin = "/api/auth/oidc/login", token, providerId, avantRappel } = {}) {
  const headers = { "content-type": "application/json", ...nav.entetes() };
  if (token) headers.authorization = "Bearer " + token;
  const depart = await fetch(inst.base + chemin, { method: "POST", headers, body: JSON.stringify({ providerId }) });
  nav.retenir(depart);
  const corps = await depart.json();
  if (!corps.authorizationUrl) return { refus: corps.error, status: depart.status };
  const chezIdp = await fetch(corps.authorizationUrl, { redirect: "manual" });
  const rappel = chezIdp.headers.get("location");
  if (avantRappel) await avantRappel(rappel);
  const retour = await fetch(rappel, { redirect: "manual", headers: nav.entetes() });
  const location = retour.headers.get("location") || "";
  return {
    authorizationUrl: new URL(corps.authorizationUrl),
    rappel,
    location,
    params: Object.fromEntries(new URL(location, inst.base).searchParams),
  };
}

async function echanger(inst, nav, ticket) {
  return inst.call("POST", "/api/auth/oidc/exchange", { body: { ticket }, headers: nav.entetes() });
}

const inst = await startInstance({ port: PORT });

try {
  const chef = await createAndLogin(inst, {
    name: "Chef", email: "chef@glasskeep.test", password: "Passw0rd-chef", isAdmin: true,
  });
  const simple = await createAndLogin(inst, {
    name: "Simple", email: "simple@glasskeep.test", password: "Passw0rd-simple",
  });

  // ───────────────────────────────────────────────────────────────────
  // 1. La configuration est l'affaire de l'administrateur seul.
  // ───────────────────────────────────────────────────────────────────
  const vide = await inst.call("GET", "/api/auth/oidc/providers");
  t.check("sans configuration, la page de connexion ne propose rien",
    vide.ok && Array.isArray(vide.json.providers) && vide.json.providers.length === 0, vide.text);

  const codes = [
    (await inst.call("GET", "/api/admin/oidc", { token: simple.token })).status,
    (await inst.call("PUT", "/api/admin/oidc", { token: simple.token, body: {} })).status,
    (await inst.call("POST", "/api/admin/oidc/test", { token: simple.token, body: {} })).status,
    (await inst.call("GET", "/api/admin/oidc")).status,
  ];
  t.check("un utilisateur ordinaire ne voit ni ne règle le fournisseur",
    j(codes) === j([403, 403, 403, 401]), j(codes));

  const sansSlash = await inst.call("POST", "/api/admin/oidc/test", {
    token: chef.token, body: { issuer: ISSUER.slice(0, -1), clientId: CLIENT_ID },
  });
  t.check("un issuer qui ne correspond pas exactement est signalé avec la bonne valeur",
    sansSlash.json?.ok === false && sansSlash.json.error === "oidc_issuer_mismatch"
      && sansSlash.json.advertisedIssuer === ISSUER, sansSlash.text);

  const test = await inst.call("POST", "/api/admin/oidc/test", {
    token: chef.token, body: { issuer: ISSUER, clientId: CLIENT_ID },
  });
  t.check("le test lit la découverte et les clés de signature",
    test.json?.ok === true && test.json.keyCount === 1 && test.json.issuer === ISSUER, test.text);
  t.check("le test prévient qu'un issuer en http n'est pas chiffré",
    test.json?.warnings?.includes("issuer_not_https"), j(test.json?.warnings));

  const incomplet = await inst.call("PUT", "/api/admin/oidc", {
    token: chef.token,
    body: { displayName: "Authentik", issuer: ISSUER, clientId: CLIENT_ID, publicOrigin: inst.base, enabled: true },
  });
  t.check("on n'active pas un fournisseur sans secret client",
    incomplet.status === 400 && incomplet.json?.error === "oidc_incomplete", incomplet.text);

  const injoignable = await inst.call("PUT", "/api/admin/oidc", {
    token: chef.token,
    body: {
      displayName: "Authentik", issuer: "http://127.0.0.1:1/absent/", clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET, publicOrigin: inst.base, enabled: true,
    },
  });
  t.check("on n'active pas un fournisseur qui ne répond pas",
    injoignable.status === 400 && injoignable.json?.error === "oidc_discovery_failed", injoignable.text);

  const enregistre = await inst.call("PUT", "/api/admin/oidc", {
    token: chef.token,
    body: {
      displayName: "Authentik", issuer: ISSUER, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET,
      publicOrigin: inst.base, enabled: true, autoCreateAccounts: true,
    },
  });
  const relu = await inst.call("GET", "/api/admin/oidc", { token: chef.token });
  t.check("la configuration est enregistrée avec l'adresse de retour à déclarer",
    enregistre.ok && relu.json?.provider?.enabled === true
      && relu.json.provider.callbackUrl === `${inst.base}/api/auth/oidc/callback`
      && relu.json.provider.hasClientSecret === true, relu.text);
  t.check("le secret client ne ressort jamais du serveur",
    !enregistre.text.includes(CLIENT_SECRET) && !relu.text.includes(CLIENT_SECRET));

  const sansNouveauSecret = await inst.call("PUT", "/api/admin/oidc", {
    token: chef.token,
    body: { displayName: "Authentik", issuer: ISSUER, clientId: CLIENT_ID, publicOrigin: inst.base, enabled: true },
  });
  t.check("réenregistrer sans retaper le secret le conserve",
    sansNouveauSecret.ok && sansNouveauSecret.json.provider.hasClientSecret === true, sansNouveauSecret.text);

  const liste = await inst.call("GET", "/api/auth/oidc/providers");
  const fournisseur = liste.json?.providers?.[0];
  t.check("la page de connexion propose le fournisseur, et rien de sensible",
    liste.json?.providers?.length === 1 && fournisseur.name === "Authentik"
      && fournisseur.origin === inst.base && !liste.text.includes(CLIENT_SECRET)
      && !liste.text.includes(CLIENT_ID), liste.text);
  const providerId = fournisseur?.id;

  // ───────────────────────────────────────────────────────────────────
  // 2. Le parcours complet, jusqu'à une session GlassKeep ordinaire.
  // ───────────────────────────────────────────────────────────────────
  const nav = navigateur();
  const premier = await parcours(inst, nav, { providerId });
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
  t.check("le ticket donne une session GlassKeep qui ouvre l'application",
    session.ok && moi.ok && moi.json.email === "nouveau@sso.test" && moi.json.name === "Nouveau", moi.text);
  t.check("les groupes et revendications du fournisseur ne donnent aucun droit d'administrateur",
    session.json?.user?.is_admin === false && moi.json?.is_admin === false
      && (await inst.call("GET", "/api/admin/users", { token: session.json?.token })).status === 403);
  const idNouveau = moi.json?.id;

  const rejoue = await echanger(inst, nav, premier.params.oidc_ticket);
  t.check("un ticket ne sert qu'une fois", rejoue.status === 401, rejoue.text);

  // L'email change chez le fournisseur: c'est toujours la même personne.
  idp.personne = { sub: "u-1", email: "change@sso.test", name: "Nouveau" };
  const deuxieme = await parcours(inst, nav, { providerId });
  const session2 = await echanger(inst, nav, deuxieme.params.oidc_ticket);
  t.check("la même identité rouvre le même compte, quel que soit son email",
    session2.json?.user?.id === idNouveau, j(session2.json?.user));

  // Une identité inconnue qui porte l'email d'un compte existant.
  idp.personne = { sub: "u-intrus", email: "simple@glasskeep.test", name: "Intrus" };
  const usurpation = await parcours(inst, nav, { providerId });
  t.check("un email déjà pris n'ouvre pas le compte qui le porte",
    usurpation.params.oidc_error === "oidc_account_exists" && !usurpation.params.oidc_ticket,
    usurpation.location);

  // ───────────────────────────────────────────────────────────────────
  // 3. Les refus: autre navigateur, état rejoué, jeton falsifié.
  // ───────────────────────────────────────────────────────────────────
  idp.personne = { sub: "u-1", email: "change@sso.test", name: "Nouveau" };
  const autreNavigateur = navigateur();
  const vole = await parcours(inst, autreNavigateur, {
    providerId,
    avantRappel: () => autreNavigateur.oublierCookie(),
  });
  t.check("un lien de retour ouvert dans un autre navigateur est refusé",
    vole.params.oidc_error === "oidc_expired", vole.location);

  let rappelRejoue = null;
  const unique = await parcours(inst, nav, { providerId, avantRappel: (r) => { rappelRejoue = r; } });
  const encore = await fetch(rappelRejoue, { redirect: "manual", headers: nav.entetes() });
  t.check("un retour du fournisseur ne sert qu'une fois",
    !!unique.params.oidc_ticket
      && new URL(encore.headers.get("location"), inst.base).searchParams.get("oidc_error") === "oidc_expired");

  const ticketSansCookie = await inst.call("POST", "/api/auth/oidc/exchange", {
    body: { ticket: unique.params.oidc_ticket },
  });
  t.check("un ticket présenté sans le cookie du navigateur est refusé", ticketSansCookie.status === 401);

  idp.signerAvecAutreCle = true;
  const falsifie = await parcours(inst, nav, { providerId });
  t.check("un jeton signé par une autre clé est refusé", falsifie.params.oidc_error === "oidc_failed", falsifie.location);

  idp.mauvaisNonce = true;
  const nonce = await parcours(inst, nav, { providerId });
  t.check("un jeton qui ne porte pas le nonce attendu est refusé", nonce.params.oidc_error === "oidc_failed", nonce.location);

  // ───────────────────────────────────────────────────────────────────
  // 4. Un compte existant associe son identité depuis ses réglages.
  // ───────────────────────────────────────────────────────────────────
  idp.personne = { sub: "u-simple", email: "simple@glasskeep.test", name: "Simple" };
  const navSimple = navigateur();
  const sansSession = await inst.call("POST", "/api/auth/oidc/link", { body: { providerId } });
  t.check("associer une identité demande d'être connecté", sansSession.status === 401);

  const association = await parcours(inst, navSimple, { chemin: "/api/auth/oidc/link", token: simple.token, providerId });
  t.check("l'association revient dans l'application sans ouvrir de session",
    association.params.oidc_linked === "1" && !association.params.oidc_ticket, association.location);
  const viaSso = await parcours(inst, navSimple, { providerId });
  const sessionSimple = await echanger(inst, navSimple, viaSso.params.oidc_ticket);
  t.check("ensuite, le fournisseur ouvre ce compte-là",
    sessionSimple.json?.user?.id === simple.id, j(sessionSimple.json?.user));

  idp.personne = { sub: "u-1", email: "change@sso.test", name: "Nouveau" };
  const dejaPrise = await parcours(inst, navSimple, { chemin: "/api/auth/oidc/link", token: simple.token, providerId });
  t.check("une identité déjà associée à un autre compte ne change pas de compte",
    dejaPrise.params.oidc_error === "oidc_identity_in_use", dejaPrise.location);

  const identites = await inst.call("GET", "/api/auth/oidc/identities", { token: simple.token });
  t.check("le compte voit son identité associée",
    identites.json?.identities?.length === 1 && identites.json.identities[0].providerName === "Authentik"
      && identites.json.hasPassword === true, identites.text);

  const identitesSso = await inst.call("GET", "/api/auth/oidc/identities", { token: session.json?.token });
  const retraitSansMotDePasse = await inst.call(
    "DELETE", `/api/auth/oidc/identities/${identitesSso.json?.identities?.[0]?.id}`, { token: session.json?.token },
  );
  t.check("un compte sans mot de passe ne peut pas se couper de son seul accès",
    identitesSso.json?.hasPassword === false && retraitSansMotDePasse.status === 409, retraitSansMotDePasse.text);
  const retraitAutrui = await inst.call(
    "DELETE", `/api/auth/oidc/identities/${identitesSso.json?.identities?.[0]?.id}`, { token: simple.token },
  );
  t.check("on ne retire pas l'identité d'un autre compte", retraitAutrui.status === 404, retraitAutrui.text);

  const retrait = await inst.call(
    "DELETE", `/api/auth/oidc/identities/${identites.json?.identities?.[0]?.id}`, { token: simple.token },
  );
  idp.personne = { sub: "u-simple", email: "simple@glasskeep.test", name: "Simple" };
  const apresRetrait = await parcours(inst, navSimple, { providerId });
  t.check("après le retrait, l'identité n'ouvre plus le compte",
    retrait.ok && apresRetrait.params.oidc_error === "oidc_account_exists", apresRetrait.location);

  // ───────────────────────────────────────────────────────────────────
  // 5. Les réglages de l'administrateur s'appliquent.
  // ───────────────────────────────────────────────────────────────────
  idp.personne = { sub: "u-userinfo", email: "userinfo@sso.test", name: "Userinfo" };
  idp.emailSeulementDansUserinfo = true;
  const viaUserinfo = await parcours(inst, nav, { providerId });
  const sessionUserinfo = await echanger(inst, nav, viaUserinfo.params.oidc_ticket);
  idp.emailSeulementDansUserinfo = false;
  t.check("un email absent du jeton est lu sur userinfo",
    sessionUserinfo.json?.user?.email === "userinfo@sso.test", j(sessionUserinfo.json?.user));

  await inst.call("PUT", "/api/admin/oidc", {
    token: chef.token,
    body: {
      displayName: "Authentik", issuer: ISSUER, clientId: CLIENT_ID, publicOrigin: inst.base,
      enabled: true, autoCreateAccounts: false,
    },
  });
  idp.personne = { sub: "u-inconnu", email: "inconnu@sso.test", name: "Inconnu" };
  const fermeture = await parcours(inst, nav, { providerId });
  t.check("sans création automatique, une identité inconnue n'ouvre rien",
    fermeture.params.oidc_error === "oidc_no_account", fermeture.location);

  await inst.call("PUT", "/api/admin/oidc", {
    token: chef.token,
    body: { displayName: "Authentik", issuer: ISSUER, clientId: CLIENT_ID, publicOrigin: inst.base, enabled: false },
  });
  const desactive = await inst.call("GET", "/api/auth/oidc/providers");
  const tentative = await inst.call("POST", "/api/auth/oidc/login", { body: { providerId } });
  t.check("désactivé, le fournisseur disparaît de la connexion et ne démarre plus rien",
    desactive.json?.providers?.length === 0 && tentative.status === 404, `${desactive.text} ${tentative.text}`);
} finally {
  inst.stop();
  serveurIdp.close();
}

process.exit(t.summary() ? 0 : 1);
