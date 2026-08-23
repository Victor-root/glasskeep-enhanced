// Socle des scénarios fonctionnels.
//
// Ces scénarios ne cherchent pas de faille: ils vérifient que
// l'application fait ce qu'elle promet. Une note créée se relit, une
// corbeille se vide, un partage donne les droits annoncés, un réglage
// enregistré revient. Ce sont les régressions du quotidien, celles que
// la suite de sécurité laisse passer sans rien voir.
//
// Chaque scénario démarre sa propre instance sur son propre port et sa
// propre base, dans un dossier temporaire effacé à la fin. Rien à
// nettoyer à la main, rien de partagé entre scénarios, donc rien qui
// dépende de l'ordre d'exécution.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";

export { runner, sleep } from "../federation/lib.mjs";
import { sleep } from "../federation/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(HERE, "..", "..");
const require = createRequire(import.meta.url);

const Database = require(path.join(ROOT, "node_modules", "better-sqlite3"));
const bcrypt = require(path.join(ROOT, "node_modules", "bcryptjs"));

// Démarre une instance et rend de quoi lui parler. `stop()` est
// idempotent et efface la base; appelez-le dans un `finally`.
export async function startInstance({ port, env = {}, timeoutMs = 20000 } = {}) {
  if (!port) throw new Error("startInstance: port requis");
  const dir = mkdtempSync(path.join(tmpdir(), "gk-fonc-"));
  const dbFile = path.join(dir, "data.sqlite");
  const base = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
    env: {
      ...process.env,
      DB_FILE: dbFile,
      JWT_SECRET: "0".repeat(64),
      API_PORT: String(port),
      NODE_ENV: "production",
      HTTPS_ENABLED: "false",
      TRUST_PROXY: "",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => { log += d; });
  child.stderr.on("data", (d) => { log += d; });

  const until = Date.now() + timeoutMs;
  let up = false;
  while (Date.now() < until && !up) {
    try { up = (await fetch(base + "/api/health")).ok; } catch { /* pas encore là */ }
    if (!up) await sleep(300);
  }
  if (!up) {
    child.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`l'instance sur ${port} n'a pas démarré:\n${log.slice(-800)}`);
  }

  let stopped = false;
  return {
    base,
    dbFile,
    logs: () => log,
    // Un appel HTTP. Rend toujours { status, ok, json, text } sans jamais
    // lever, pour que le scénario puisse vérifier un refus comme un succès.
    async call(method, p, { body, token, headers = {}, raw } = {}) {
      const h = { "content-type": "application/json", ...headers };
      if (token) h.authorization = "Bearer " + token;
      const res = await fetch(base + p, {
        method,
        headers: h,
        body: raw !== undefined ? raw : (body === undefined ? undefined : JSON.stringify(body)),
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* pas du JSON */ }
      return { status: res.status, ok: res.ok, json, text };
    },
    // Ouvre la base directement. Sert à préparer un état ou à vérifier
    // ce qui a réellement été écrit, pas à contourner l'API.
    db(readonly = false) {
      return new Database(dbFile, { readonly });
    },
    stop() {
      if (stopped) return;
      stopped = true;
      child.kill("SIGKILL");
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

// Crée un compte directement en base: l'inscription passe par une
// approbation d'administrateur, ce qui n'a pas sa place dans la
// préparation d'un scénario qui teste autre chose.
export function createUser(inst, { name, email, password, isAdmin = false } = {}) {
  const db = inst.db();
  try {
    const info = db
      .prepare("INSERT INTO users (name,email,password_hash,created_at,is_admin) VALUES (?,?,?,?,?)")
      .run(name, email, bcrypt.hashSync(password, 10), new Date().toISOString(), isAdmin ? 1 : 0);
    return Number(info.lastInsertRowid);
  } finally {
    db.close();
  }
}

// Crée le compte puis se connecte. Rend { id, token, email, password }.
export async function createAndLogin(inst, opts) {
  const id = createUser(inst, opts);
  const r = await inst.call("POST", "/api/login", {
    body: { email: opts.email, password: opts.password },
  });
  if (!r.json?.token) {
    throw new Error(`connexion de ${opts.email} refusée: ${r.status} ${r.text.slice(0, 200)}`);
  }
  return { id, token: r.json.token, email: opts.email, password: opts.password };
}

// Écoute le flux d'événements et accumule ce qui arrive. Rend un objet
// avec `events` (les messages reçus, décodés) et `close()`.
export async function listenEvents(inst, token, { clientId } = {}) {
  const controller = new AbortController();
  const headers = { authorization: "Bearer " + token };
  if (clientId) headers["x-client-id"] = clientId;
  const res = await fetch(inst.base + "/api/events", { headers, signal: controller.signal });
  if (!res.ok) throw new Error(`flux d'événements refusé: ${res.status}`);

  const events = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const event = { type: null, data: null };
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) event.type = line.slice(6).trim();
            else if (line.startsWith("data:")) {
              const raw = line.slice(5).trim();
              try { event.data = JSON.parse(raw); } catch { event.data = raw; }
            }
          }
          if (event.type || event.data) events.push(event);
        }
      }
    } catch { /* flux fermé */ }
  })();

  return {
    events,
    // Attend un événement satisfaisant le prédicat, ou rend null.
    async waitFor(predicate, { timeout = 5000, every = 100 } = {}) {
      const until = Date.now() + timeout;
      while (Date.now() < until) {
        const hit = events.find(predicate);
        if (hit) return hit;
        await sleep(every);
      }
      return null;
    },
    close() { try { controller.abort(); } catch { /* déjà fermé */ } },
  };
}
