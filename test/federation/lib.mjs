// Helpers partagés par les scénarios de test de fédération.
// Deux origines distinctes sur la même machine: le code de fédération
// distingue les pairs par origine, et le port en fait partie.
export const A = process.env.FEDLAB_A || "https://localhost:9443";
export const B = process.env.FEDLAB_B || "https://localhost:9444";

const creds = {
  [A]: { email: "admin@alpha.test", password: "Passw0rd-alpha" },
  [B]: { email: "admin@beta.test", password: "Passw0rd-beta" },
};

export async function api(base, path, { method = "GET", body, token } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* corps vide */ }
  return { status: res.status, ok: res.ok, json };
}

export async function login(base) {
  const r = await api(base, "/api/login", { method: "POST", body: creds[base] });
  if (!r.json?.token) throw new Error(`login ${base} a échoué: ${JSON.stringify(r.json)}`);
  return r.json.token;
}

export async function setSelfName(base, token, name) {
  return api(base, "/api/admin/federation/self-name", { method: "PUT", token, body: { name } });
}

export async function links(base, token) {
  const r = await api(base, "/api/admin/federation/links", { token });
  return r.json?.links ?? [];
}

export async function invite(base, token, peer, local, label) {
  return api(base, "/api/admin/federation/invite", {
    method: "POST", token, body: { peerBaseUrl: peer, localBaseUrl: local, label },
  });
}

export async function accept(base, token, id, local) {
  return api(base, `/api/admin/federation/links/${encodeURIComponent(id)}/accept`, {
    method: "POST", token, body: { localBaseUrl: local },
  });
}

export async function unpair(base, token, id) {
  return api(base, `/api/admin/federation/links/${encodeURIComponent(id)}`, { method: "DELETE", token });
}

// Remet les deux serveurs à zéro côté fédération, pour que chaque scénario
// parte du même état.
export async function reset(tA, tB) {
  for (const [base, token] of [[A, tA], [B, tB]]) {
    for (const l of await links(base, token)) await unpair(base, token, l.id);
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Attend qu'une condition sur les liens devienne vraie, ou rend la main.
export async function waitFor(base, token, predicate, { timeout = 30000, every = 700 } = {}) {
  const until = Date.now() + timeout;
  let last = [];
  while (Date.now() < until) {
    last = await links(base, token);
    if (predicate(last)) return last;
    await sleep(every);
  }
  return last;
}

// Petit cadre de test: compte les succès et les échecs, sort en code 1 si besoin.
export function runner(title) {
  const results = [];
  return {
    check(name, pass, detail = "") {
      results.push({ name, pass, detail });
      console.log(`${pass ? "  OK  " : " ÉCHEC"}  ${name}${detail ? "  ·  " + detail : ""}`);
      return pass;
    },
    summary() {
      const bad = results.filter((r) => !r.pass);
      console.log(`\n${title}: ${results.length - bad.length}/${results.length} vérifications passées`);
      if (bad.length) {
        console.log("Échecs:");
        for (const b of bad) console.log(`  - ${b.name} ${b.detail}`);
      }
      return bad.length === 0;
    },
  };
}
