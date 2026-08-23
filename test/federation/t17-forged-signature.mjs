// Scénario 17, F-21. Une requête entre serveurs signée avec la mauvaise
// clé doit être refusée.
//
// Une fois deux serveurs appairés, tout ce qu'ils s'échangent est signé
// avec le secret partagé né de la poignée de main: partage de note,
// modification, retrait, changement de droits, sonde de vivacité. Cette
// signature est la seule chose qui distingue le pair légitime de
// n'importe qui connaissant l'adresse et l'identifiant du lien.
//
// L'audit conclut que ce mécanisme tient. Rien ne le vérifiait. Ce
// scénario le vérifie sur les deux serveurs réels du bac à sable, et
// couvre les trois façons de rater une signature: la mauvaise clé, la
// signature absente, et l'horodatage hors fenêtre (qui doit être
// distingué, sinon un administrateur ré-appaire un lien qui n'était pas
// cassé).
import crypto from "node:crypto";
import { A, B, login, setSelfName, invite, accept, links, reset, waitFor, runner, sleep } from "./lib.mjs";

const t = runner("Scénario 17, signature falsifiée entre serveurs");

function signatureOf(secret, method, path, ts, body) {
  return crypto
    .createHmac("sha256", Buffer.from(String(secret), "utf8"))
    .update(`${method.toUpperCase()}\n${path}\n${ts}\n${body || ""}`, "utf8")
    .digest("base64");
}

// Appelle une route signée en choisissant soi-même la clé, l'horodatage
// et la signature.
async function callSigned(base, path, { linkId, secret, ts = Date.now(), signature, body = {} }) {
  const raw = JSON.stringify(body);
  const headers = {
    "content-type": "application/json",
    "x-gk-fed-link": linkId,
    "x-gk-fed-ts": String(ts),
  };
  const sig = signature !== undefined ? signature : signatureOf(secret, "POST", path, ts, raw);
  if (sig !== null) headers["x-gk-fed-sig"] = sig;
  const r = await fetch(base + path, { method: "POST", headers, body: raw });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

const tA = await login(A);
const tB = await login(B);
await reset(tA, tB);
await setSelfName(A, tA, "Alpha");
await setSelfName(B, tB, "Beta");

// ── Un appairage bien réel, pour avoir un lien actif à attaquer ─────
await invite(A, tA, B, A, "Beta");
const incoming = await waitFor(B, tB, (ls) => ls.some((l) => l.status === "incoming_pending"));
const pending = incoming.find((l) => l.status === "incoming_pending");
await accept(B, tB, pending.id, B);
const active = await waitFor(A, tA, (ls) => ls.some((l) => l.status === "active"), { timeout: 30000 });
const link = active.find((l) => l.status === "active");
t.check("un lien actif existe entre les deux serveurs", !!link, link?.status);

// Le secret partagé n'est pas exposé par l'API: on le lit dans la base
// du serveur A, qui est le rôle qu'occuperait le pair légitime.
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const path = await import("node:path");
const { fileURLToPath } = await import("node:url");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LAB = process.env.FEDLAB_DIR || path.join(HERE, ".lab");
const Database = require(path.join(HERE, "..", "..", "node_modules", "better-sqlite3"));
const dbA = new Database(path.join(LAB, "alpha", "data.sqlite"), { readonly: true });
const row = dbA.prepare("SELECT id, shared_secret FROM federation_links WHERE status='active'").get();
dbA.close();
t.check("le secret partagé est bien en place côté appelant", !!row?.shared_secret);

const HEALTH = "/api/federation/health";
const linkIdOnB = (await links(B, tB)).find((l) => l.status === "active")?.id;

// ── La référence: une signature juste passe ─────────────────────────
const good = await callSigned(B, HEALTH, { linkId: linkIdOnB, secret: row.shared_secret });
t.check("une requête correctement signée est acceptée", good.status === 200,
        `http ${good.status} ${JSON.stringify(good.json).slice(0, 70)}`);

// ── Les trois façons de rater ───────────────────────────────────────
const wrongKey = await callSigned(B, HEALTH, {
  linkId: linkIdOnB, secret: "ce-n-est-pas-le-bon-secret-partage",
});
t.check("signée avec une autre clé: refusée", wrongKey.status === 403,
        `http ${wrongKey.status} ${JSON.stringify(wrongKey.json).slice(0, 70)}`);

const noSig = await callSigned(B, HEALTH, { linkId: linkIdOnB, signature: null });
t.check("sans signature du tout: refusée", noSig.status === 403, `http ${noSig.status}`);

const garbage = await callSigned(B, HEALTH, { linkId: linkIdOnB, signature: "AAAA" });
t.check("avec une signature de longueur absurde: refusée", garbage.status === 403,
        `http ${garbage.status}`);

// Le corps fait partie de ce qui est signé: le modifier après coup doit
// casser la signature.
const tampered = await (async () => {
  const ts = Date.now();
  const honest = JSON.stringify({});
  const sig = signatureOf(row.shared_secret, "POST", HEALTH, ts, honest);
  const r = await fetch(B + HEALTH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-gk-fed-link": linkIdOnB,
      "x-gk-fed-ts": String(ts),
      "x-gk-fed-sig": sig,
    },
    body: JSON.stringify({ injecte: "contenu ajoute apres signature" }),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
})();
t.check("corps modifié après signature: refusée", tampered.status === 403,
        `http ${tampered.status}`);

// ── L'horodatage doit être distingué de la mauvaise clé ─────────────
// Confondre les deux a une conséquence concrète: l'administrateur
// ré-appaire un lien qui n'était pas cassé, la poignée de main réussit,
// et le lien retombe quelques secondes plus tard.
const stale = await callSigned(B, HEALTH, {
  linkId: linkIdOnB, secret: row.shared_secret, ts: Date.now() - 3600_000,
});
t.check("horodatage hors fenêtre: refusé", stale.status === 403, `http ${stale.status}`);
t.check("et le motif dit que c'est l'horloge, pas la clé",
        /clock/i.test(JSON.stringify(stale.json)),
        JSON.stringify(stale.json).slice(0, 70));
t.check("alors qu'une mauvaise clé dit bien la signature",
        /signature/i.test(JSON.stringify(wrongKey.json)),
        JSON.stringify(wrongKey.json).slice(0, 70));

// ── Un identifiant de lien inconnu ──────────────────────────────────
const unknown = await callSigned(B, HEALTH, {
  linkId: "00000000-0000-4000-8000-000000000000", secret: row.shared_secret,
});
t.check("un identifiant de lien inconnu est refusé", unknown.status === 404 || unknown.status === 403,
        `http ${unknown.status}`);

// ── Non-régression: le lien est toujours debout après tout ça ───────
await sleep(500);
const after = await callSigned(B, HEALTH, { linkId: linkIdOnB, secret: row.shared_secret });
t.check("après tous ces refus, le pair légitime passe toujours", after.status === 200,
        `http ${after.status}`);

process.exit(t.summary() ? 0 : 1);
