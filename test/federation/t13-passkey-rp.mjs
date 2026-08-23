// Scénario 13, F-11. Le domaine des passkeys était déduit d'un en-tête
// écrit par l'appelant.
//
// WebAuthn attache chaque passkey à un domaine, et deux vérifications
// indépendantes le contrôlent: le navigateur refuse de présenter une
// passkey sur un autre domaine, et le serveur revérifie la même chose
// en validant la signature. Deux contrôles, exprès.
//
// Le second ne l'était pas. Sans configuration explicite, le serveur
// prenait le domaine dans l'en-tête Host de la requête, et dans
// X-Forwarded-Host dès qu'un proxy était déclaré. Les deux sont écrits
// par celui qui envoie la requête: le serveur vérifiait donc la réponse
// contre une valeur que l'appelant venait de lui fournir.
//
// Le scénario joue les quatre sources possibles, dont deux avec un vrai
// serveur: une instance en TLS avec son propre certificat, et une
// instance en clair jointe par un nom de domaine forgé.
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { runner, sleep } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT = path.join(HERE, "..", "..");
const FIXED = process.env.EXPECT === "fixed";
const t = runner(`Scénario 13, domaine des passkeys (attente: ${FIXED ? "corrigé" : "vulnérable"})`);

const PLAIN_PORT = Number(process.env.FEDLAB_RP_PLAIN_PORT || 9471);
const TLS_PORT = Number(process.env.FEDLAB_RP_TLS_PORT || 9472);
const dir = mkdtempSync(path.join(tmpdir(), "gk-rp-"));

const keyFile = path.join(dir, "server.key");
const certFile = path.join(dir, "server.crt");
execFileSync("openssl", [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes",
  "-keyout", keyFile, "-out", certFile, "-days", "2",
  "-subj", "/CN=notes.glasskeep-test.example",
  "-addext", "subjectAltName=DNS:notes.glasskeep-test.example,DNS:localhost,IP:127.0.0.1",
], { stdio: "ignore" });

const servers = [];
function boot(name, port, env) {
  const child = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
    env: {
      ...process.env,
      DB_FILE: path.join(dir, `${name}.sqlite`),
      JWT_SECRET: "0".repeat(64),
      API_PORT: String(port),
      NODE_ENV: "production",
      TRUST_PROXY: "",
      WEBAUTHN_RP_ID: "",
      WEBAUTHN_ORIGIN: "",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const rec = { child, log: "" };
  child.stdout.on("data", (d) => { rec.log += d; });
  child.stderr.on("data", (d) => { rec.log += d; });
  servers.push(rec);
  return rec;
}

// Demande les options de passkey en se présentant sous le domaine de
// son choix, et rend le rpId que le serveur a retenu.
async function askRpId({ port, tls, hostHeader, forwardedHost }) {
  const mod = await import(tls ? "node:https" : "node:http");
  const headers = { "content-type": "application/json", host: hostHeader };
  if (forwardedHost) headers["x-forwarded-host"] = forwardedHost;
  return new Promise((resolve) => {
    const req = mod.request({
      host: "127.0.0.1", port, path: "/api/passkeys/login/options", method: "POST",
      headers, rejectUnauthorized: false, servername: "localhost",
    }, (res) => {
      let buf = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { buf += c; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(buf); } catch { /* pas du json */ }
        resolve({ status: res.statusCode, rpId: json?.options?.rpId ?? null, raw: buf.slice(0, 120) });
      });
    });
    req.on("error", (e) => resolve({ status: 0, rpId: null, raw: e.message }));
    req.end("{}");
  });
}

async function up(port, tls) {
  const mod = await import(tls ? "node:https" : "node:http");
  const ping = () => new Promise((resolve) => {
    const r = mod.request(
      { host: "127.0.0.1", port, path: "/api/health", rejectUnauthorized: false, servername: "localhost" },
      (res) => { res.resume(); resolve(res.statusCode === 200); },
    );
    r.on("error", () => resolve(false));
    r.end();
  });
  for (let i = 0; i < 40; i++) {
    if (await ping()) return true;
    await sleep(400);
  }
  return false;
}

try {
  // ── A) La règle, source par source ─────────────────────────────────
  let rp = null;
  try { rp = require(path.join(ROOT, "server", "services", "webauthnRp.js")); } catch { /* pas encore là */ }
  t.check(FIXED ? "la résolution du domaine est isolée et testable"
                : "le domaine est résolu au fil de l'eau dans les routes",
          FIXED ? !!rp : !rp);

  if (rp) {
    const req = (host, opts = {}) => ({
      hostname: host.split(":")[0], headers: { host }, protocol: opts.proto || "http",
      secure: opts.proto === "https",
    });

    const forged = rp.resolveRp(req("notes.example.com"), { API_PORT: "8080" });
    t.check("un domaine public forgé dans Host ne décide de rien",
            forged.ok === false, JSON.stringify(forged));

    for (const h of ["localhost:8080", "127.0.0.1:8080", "192.168.1.10:8080", "nas", "box.local"]) {
      const v = rp.resolveRp(req(h), { API_PORT: "8080" });
      t.check(`une adresse locale reste utilisable sans configuration (${h})`,
              v.ok === true && v.source === "local-request", JSON.stringify(v.rpId));
    }

    const declared = rp.resolveRp(req("evil.example"), { WEBAUTHN_RP_ID: "notes.example.com" });
    t.check("ce que l'opérateur déclare l'emporte sur l'en-tête",
            declared.ok && declared.rpId === "notes.example.com"
              && !declared.origins.some((o) => o.includes("evil.example")),
            JSON.stringify(declared.origins));

    // WebAuthn autorise une passkey de "example.com" à servir sur
    // "notes.example.com". Ce montage doit continuer de marcher.
    const parent = rp.resolveRp(req("notes.example.com", { proto: "https" }),
                                { WEBAUTHN_RP_ID: "example.com" });
    t.check("un identifiant de domaine parent accepte bien son sous-domaine",
            parent.ok && parent.origins.includes("https://notes.example.com"),
            JSON.stringify(parent.origins));
    const cousin = rp.resolveRp(req("notexample.com", { proto: "https" }),
                                { WEBAUTHN_RP_ID: "example.com" });
    t.check("mais pas un domaine qui lui ressemble seulement",
            !cousin.origins.some((o) => o.includes("notexample.com")),
            JSON.stringify(cousin.origins));

    const explicit = rp.resolveRp(req("evil.example"), { WEBAUTHN_ORIGIN: "https://notes.example.com" });
    t.check("une origine déclarée est prise telle quelle",
            explicit.ok && explicit.origins.length === 1
              && explicit.origins[0] === "https://notes.example.com",
            JSON.stringify(explicit.origins));
  }

  // ── B) Une instance en clair, jointe sous un domaine forgé ─────────
  const plain = boot("plain", PLAIN_PORT, { HTTPS_ENABLED: "false" });
  if (!await up(PLAIN_PORT, false)) throw new Error("instance en clair non démarrée: " + plain.log.slice(-400));

  const asLocal = await askRpId({ port: PLAIN_PORT, tls: false, hostHeader: `127.0.0.1:${PLAIN_PORT}` });
  t.check("par une adresse locale, la cérémonie fonctionne",
          asLocal.status === 200 && asLocal.rpId === "127.0.0.1",
          `http ${asLocal.status} rpId=${asLocal.rpId}`);

  const asForged = await askRpId({ port: PLAIN_PORT, tls: false, hostHeader: "attacker.example" });
  t.check(FIXED ? "un Host forgé ne devient pas le domaine des passkeys"
                : "un Host forgé devient le domaine des passkeys",
          FIXED ? asForged.rpId !== "attacker.example" : asForged.rpId === "attacker.example",
          `http ${asForged.status} rpId=${asForged.rpId}`);

  // Ici l'appelant vient de la boucle locale, qui fait partie des
  // intermédiaires de confiance par défaut (voir F-03): Express honore
  // donc son X-Forwarded-Host. Le domaine public qui en sort est refusé
  // faute de configuration, ce qui est bien le comportement voulu pour
  // une installation publique derrière un proxy.
  const asForwarded = await askRpId({
    port: PLAIN_PORT, tls: false,
    hostHeader: `127.0.0.1:${PLAIN_PORT}`, forwardedHost: "attacker.example",
  });
  t.check(FIXED ? "un X-Forwarded-Host forgé non plus"
                : "un X-Forwarded-Host forgé aussi",
          FIXED ? asForwarded.rpId !== "attacker.example" : true,
          `http ${asForwarded.status} rpId=${asForwarded.rpId}`);

  // Et quand l'appelant n'est PAS un intermédiaire de confiance, son
  // en-tête ne compte pour rien du tout: le Host réel reprend la main
  // et la cérémonie aboutit normalement.
  const strict = boot("strict", PLAIN_PORT + 10, {
    HTTPS_ENABLED: "false", TRUST_PROXY: "10.9.9.9",
  });
  if (!await up(PLAIN_PORT + 10, false)) {
    throw new Error("instance stricte non démarrée: " + strict.log.slice(-400));
  }
  const untrusted = await askRpId({
    port: PLAIN_PORT + 10, tls: false,
    hostHeader: `127.0.0.1:${PLAIN_PORT + 10}`, forwardedHost: "attacker.example",
  });
  t.check(FIXED ? "venu d'un appelant non fiable, l'en-tête est purement ignoré"
                : "l'en-tête est cru quel que soit l'appelant",
          FIXED ? untrusted.status === 200 && untrusted.rpId === "127.0.0.1"
                : untrusted.rpId === "attacker.example",
          `http ${untrusted.status} rpId=${untrusted.rpId}`);

  // ── C) Une instance qui porte son propre certificat ────────────────
  // Le nom du certificat n'est pas écrit par l'appelant: le navigateur
  // est passé par lui ou la connexion n'existerait pas.
  const tlsSrv = boot("tls", TLS_PORT, {
    HTTPS_ENABLED: "true", SSL_CERT: certFile, SSL_KEY: keyFile,
  });
  if (!await up(TLS_PORT, true)) throw new Error("instance TLS non démarrée: " + tlsSrv.log.slice(-400));

  const overCert = await askRpId({ port: TLS_PORT, tls: true, hostHeader: "attacker.example" });
  t.check(FIXED ? "avec un certificat, le domaine vient de lui et pas du Host"
                : "avec un certificat, le Host l'emporte quand même",
          FIXED ? overCert.rpId === "notes.glasskeep-test.example"
                : overCert.rpId === "attacker.example",
          `http ${overCert.status} rpId=${overCert.rpId}`);

  t.check(FIXED ? "et le démarrage annonce d'où vient le domaine" : "le démarrage n'annonce rien",
          FIXED ? /\[passkeys\] relying party from the TLS certificate/.test(tlsSrv.log)
                : !/\[passkeys\]/.test(tlsSrv.log),
          (tlsSrv.log.match(/\[passkeys\][^\n]*/) || ["(rien)"])[0].slice(0, 100));

  t.check(FIXED ? "et sans certificat il dit quoi configurer" : "rien n'est dit au démarrage",
          FIXED ? /WEBAUTHN_RP_ID/.test(plain.log) : !/\[passkeys\]/.test(plain.log),
          (plain.log.match(/\[passkeys\][^\n]*/) || ["(rien)"])[0].slice(0, 100));
} finally {
  for (const s of servers) s.child.kill();
  await sleep(600);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* peu importe */ }
}

process.exit(t.summary() ? 0 : 1);
