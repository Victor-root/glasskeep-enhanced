// Règles pures, F-21. Les décisions de sécurité qui tiennent dans une
// fonction, éprouvées sans serveur, sans réseau et sans navigateur.
//
// Chacune de ces fonctions est déjà couverte de bout en bout par un
// scénario d'intégration. L'intérêt de les reprendre ici est la vitesse:
// ce fichier tourne en une seconde, donc il peut être lancé avant chaque
// commit, alors que la suite complète demande plusieurs minutes et des
// ports libres. Une régression sur une de ces règles est attrapée tout
// de suite plutôt qu'au moment où on pense à jouer la suite lourde.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runner } from "../federation/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const t = runner("Règles pures");

// ── F-05: où le serveur accepte d'aller chercher une IA ─────────────
{
  const guard = require(path.join(ROOT, "server", "ai", "endpointGuard.js"));
  const privees = ["10.0.0.1", "127.0.0.1", "192.168.1.1", "172.16.0.1", "169.254.1.1",
    "100.64.0.1", "::1", "fd00::1", "fe80::1", "0.0.0.0"];
  const publiques = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1", "100.128.0.1",
    "2001:4860:4860::8888"];
  t.check("adresses privées reconnues", privees.every(guard.isPrivateAddress), privees.join(" "));
  t.check("adresses publiques reconnues", publiques.every((a) => !guard.isPrivateAddress(a)),
          publiques.join(" "));
  t.check("un schéma non HTTP est refusé",
          guard.normalizeProviderUrl("file:///etc/passwd").reason === guard.REASON.SCHEME);
  t.check("des identifiants dans l'adresse sont refusés",
          guard.normalizeProviderUrl("https://u:p@x.example").reason === guard.REASON.CREDENTIALS);
  t.check("une adresse normale passe", guard.normalizeProviderUrl("https://api.example/v1").ok === true);
}

// ── F-10: quand les scripts vérifient le certificat ─────────────────
{
  const req = require(path.join(ROOT, "scripts", "lib", "secureRequest.cjs"));
  t.check("la boucle locale est reconnue",
          ["127.0.0.1", "127.0.0.53", "localhost", "::1"].every(req.isLoopbackHost));
  t.check("rien d'autre ne passe pour elle",
          ["192.168.1.10", "example.com", "0.0.0.0", ""].every((h) => !req.isLoopbackHost(h)));
  t.check("vers la boucle locale, pas de vérification exigée",
          req.tlsOptionsFor({ host: "127.0.0.1", httpsEnabled: true }).rejectUnauthorized === false);
  t.check("vers ailleurs, elle l'est",
          req.tlsOptionsFor({ host: "notes.example.com", httpsEnabled: true }).rejectUnauthorized === true);
  t.check("un secret en clair vers une machine distante est refusé", (() => {
    try { req.assertSafeForSecrets({ host: "notes.example.com", httpsEnabled: false }); return false; }
    catch { return true; }
  })());
}

// ── F-11: d'où vient le domaine des passkeys ────────────────────────
{
  const rp = require(path.join(ROOT, "server", "services", "webauthnRp.js"));
  const req = (host, proto = "http") => ({
    hostname: host.split(":")[0], headers: { host }, protocol: proto, secure: proto === "https",
  });
  t.check("un domaine public forgé dans l'en-tête ne décide de rien",
          rp.resolveRp(req("notes.example.com"), { API_PORT: "8080" }).ok === false);
  t.check("une adresse locale reste utilisable sans configuration",
          ["localhost:8080", "192.168.1.10", "nas", "box.local"]
            .every((h) => rp.resolveRp(req(h), { API_PORT: "8080" }).source === "local-request"));
  t.check("ce que l'opérateur déclare l'emporte",
          rp.resolveRp(req("evil.example"), { WEBAUTHN_RP_ID: "notes.example.com" }).rpId
            === "notes.example.com");
}

// ── F-13: ce qui survit au filtre de style ──────────────────────────
{
  const style = await import(path.join(ROOT, "src", "utils", "safeStyle.js"));
  t.check("une déclaration qui va chercher une ressource ne survit pas",
          style.sanitizeStyleAttribute("background-image:url(https://x.example/p)") === "");
  t.check("les déclarations de l'éditeur survivent",
          style.sanitizeStyleAttribute("color: red; text-align: center") === "color: red; text-align: center");
  t.check("les fonctions de couleur restent permises",
          style.isInertStyleValue("rgb(1, 2, 3)") === true);
  t.check("les autres appels ne le sont pas",
          ["url(x)", "image-set(url(x) 1x)", "attr(href)"].every((v) => !style.isInertStyleValue(v)));
}

// ── F-18: le sceau du chiffrement au repos ──────────────────────────
{
  const aead = require(path.join(ROOT, "server", "encryption", "aeadGcm.js"));
  const crypto = require("node:crypto");
  const key = crypto.randomBytes(32);
  const sealed = aead.encrypt(key, "message");
  t.check("le sceau fait seize octets", sealed.tag.length === 16);
  t.check("l'aller-retour fonctionne",
          aead.decrypt(key, sealed.iv, sealed.ct, sealed.tag).toString("utf8") === "message");
  const refuse = (fn) => { try { fn(); return false; } catch { return true; } };
  t.check("un sceau tronqué est refusé",
          refuse(() => aead.decrypt(key, sealed.iv, sealed.ct, sealed.tag.subarray(0, 4))));
  t.check("un chiffré modifié est refusé", refuse(() => {
    const bad = Buffer.from(sealed.ct); bad[0] ^= 0xff;
    return aead.decrypt(key, sealed.iv, bad, sealed.tag);
  }));
}

// ── F-06: le freinage de la connexion ───────────────────────────────
{
  const throttle = require(path.join(ROOT, "server", "services", "loginThrottle.js"));
  throttle.reset();
  const ip = "203.0.113.50";
  for (let i = 0; i < throttle.FREE_ATTEMPTS; i++) throttle.recordFailure({ ip, accountId: 1 });
  t.check("les dix premiers échecs ne coûtent rien",
          throttle.penaltyMs({ ip, accountId: 1 }) === 0 && throttle.blockedForSeconds({ ip, accountId: 1 }) === 0);
  throttle.recordFailure({ ip, accountId: 1 });
  t.check("le onzième commence à faire attendre", throttle.penaltyMs({ ip, accountId: 1 }) > 0);
  for (let i = 0; i < throttle.MAX_PER_ACCOUNT; i++) throttle.recordFailure({ ip, accountId: 1 });
  t.check("le martèlement finit par bloquer", throttle.blockedForSeconds({ ip, accountId: 1 }) > 0);
  t.check("mais pas le propriétaire arrivant d'ailleurs",
          throttle.blockedForSeconds({ ip: "198.51.100.7", accountId: 1 }) === 0);
  throttle.recordSuccess({ ip, accountId: 1 });
  t.check("une connexion réussie remet tout à zéro",
          throttle.blockedForSeconds({ ip, accountId: 1 }) === 0);
  throttle.reset();
}

process.exit(t.summary() ? 0 : 1);
