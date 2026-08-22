// Scénario 7 — F-03, la politique de confiance elle-même.
//
// Ce que le correctif change tient en une phrase: quelles adresses ont le
// droit de réécrire, via X-Forwarded-For, l'adresse que le serveur retient.
// Express compile ce réglage en une fonction que l'on peut interroger
// directement, sans réseau. C'est le test le plus net de la propriété: une
// adresse publique doit-elle être crue quand elle annonce venir d'ailleurs ?
//
// Le bac à sable tourne entièrement sur la boucle locale, qui est justement
// un intermédiaire légitime. Impossible d'y fabriquer un appelant venant
// d'Internet, d'où cette vérification directe plutôt qu'un aller-retour HTTP.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runner } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const express = require(path.join(ROOT, "node_modules", "express"));

const t = runner("Scénario 7, politique de confiance des intermédiaires");

// Le réglage réellement appliqué par le serveur, lu dans son code plutôt que
// recopié ici: si quelqu'un le change, ce test suit.
const src = readFileSync(path.join(ROOT, "server", "index.js"), "utf8");
const m = src.match(/const SAFE_PROXY_RANGES = "([^"]+)"/);
t.check("le serveur définit bien un ensemble d'intermédiaires de confiance", !!m,
        m ? `"${m[1]}"` : "introuvable dans server/index.js");
if (!m) process.exit(t.summary() ? 0 : 1);

function trustFn(setting) {
  const app = express();
  app.set("trust proxy", setting);
  return app.get("trust proxy fn");
}

const safe = trustFn(m[1]);
const everything = trustFn(true); // l'ancien réglage, pour la comparaison

// Un intermédiaire légitime pour une installation auto-hébergée.
t.check("la boucle locale est un intermédiaire de confiance", safe("127.0.0.1", 0) === true);
t.check("une adresse de conteneur privée est de confiance", safe("172.17.0.3", 0) === true);
t.check("une adresse de réseau local est de confiance", safe("192.168.1.10", 0) === true);

// Le point qui compte: un appelant venu d'Internet ne doit pas pouvoir
// décider lui-même quelle adresse le serveur retiendra.
t.check("une adresse publique n'est PAS de confiance", safe("203.0.113.5", 0) === false,
        `résultat=${safe("203.0.113.5", 0)}`);
t.check("une autre adresse publique n'est PAS de confiance", safe("8.8.8.8", 0) === false);

// Et la démonstration que l'ancien réglage était bien le problème.
t.check("l'ancien réglage acceptait n'importe quelle adresse publique",
        everything("203.0.113.5", 0) === true,
        "c'est précisément ce que le correctif retire");

// Le serveur ne doit plus poser le réglage permissif quand TRUST_PROXY=true.
t.check("TRUST_PROXY=true ne se traduit plus par « tout accepter »",
        /app\.set\("trust proxy", setting\)/.test(src) &&
        /TRUST_PROXY === "true"\s*\?\s*SAFE_PROXY_RANGES/.test(src),
        "la résolution passe par SAFE_PROXY_RANGES");

// Les formes alternatives documentées doivent rester utilisables.
t.check("un nombre de sauts reste accepté", typeof trustFn(2) === "function");
t.check("une liste d'adresses reste acceptée", trustFn("10.0.0.7, 192.168.1.0/24")("10.0.0.7", 0) === true);

process.exit(t.summary() ? 0 : 1);
