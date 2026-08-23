// Scénario 14, F-13. Une note piégée pouvait révéler l'adresse IP de
// qui la lit.
//
// Le contenu des notes est bien débarrassé de tout script, mais
// l'attribut de style était conservé tel quel pour garder les couleurs
// et l'alignement. Or une règle de style sait aller chercher une
// ressource: `background-image: url(https://chez-moi/p.png)` fait
// appeler le serveur de l'auteur par le navigateur du lecteur, à
// l'ouverture de la note. Sur une note partagée entre deux serveurs, ça
// livre l'adresse IP du lecteur et l'heure exacte de sa lecture. Le
// contenu de la note ne fuit pas; le lecteur, si.
//
// Deux serrures, testées séparément:
//   - l'assainissement refuse la déclaration (le vrai correctif),
//   - la politique de sécurité du contenu ne lui laisse nulle part où
//     pointer (la seconde serrure).
//
// La seconde est vérifiée dans un vrai navigateur, sur la vraie page
// construite, parce qu'une politique trop serrée casse l'application
// sans prévenir et qu'on ne peut pas l'affirmer sans regarder.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { runner, sleep } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT = path.join(HERE, "..", "..");
const FIXED = process.env.EXPECT === "fixed";
const t = runner(`Scénario 14, note-balise et politique de contenu (attente: ${FIXED ? "corrigé" : "vulnérable"})`);

const PORT = Number(process.env.FEDLAB_CSP_PORT || 9473);
const BEACON_PORT = Number(process.env.FEDLAB_BEACON_PORT || 9474);
const BASE = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(path.join(tmpdir(), "gk-csp-"));

let child = null;
try {
  // ── A) L'assainissement, déclaration par déclaration ───────────────
  const { JSDOM } = require(path.join(ROOT, "node_modules", "jsdom", "lib", "api.js"));
  const createDOMPurify = (await import(
    path.join(ROOT, "node_modules", "dompurify", "dist", "purify.es.mjs")
  )).default;

  let guard = null;
  try {
    guard = await import(path.join(ROOT, "src", "utils", "safeStyle.js"));
  } catch { /* pas encore là */ }
  t.check(FIXED ? "le filtre de style existe" : "aucun filtre de style n'existe",
          FIXED ? !!guard : !guard);

  const purify = createDOMPurify(new JSDOM("").window);
  if (guard) guard.installStyleGuard(purify);

  // La configuration réellement utilisée pour le contenu des notes.
  const CFG = {
    ALLOWED_TAGS: ["a", "b", "strong", "i", "em", "del", "s", "u", "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "br", "hr", "ul", "ol", "li", "blockquote", "pre", "code", "sub", "sup", "mark",
      "span", "div", "label", "input"],
    ALLOWED_ATTR: ["href", "title", "class", "target", "rel", "start", "style",
      "data-color", "data-text-align", "data-indent",
      "data-underline-style", "data-underline-color",
      "data-type", "data-checked", "type", "checked", "disabled"],
    ALLOW_DATA_ATTR: false,
  };
  const clean = (html) => purify.sanitize(html, CFG);

  // Toutes les façons connues de faire partir une requête depuis du CSS.
  const beacons = [
    ['background-image', `<p style="background-image:url(https://beacon.example/p.png)">x</p>`],
    ['background raccourci', `<span style="background:url('https://beacon.example/p')">x</span>`],
    ['list-style-image', `<div style="list-style-image:url(https://beacon.example/l)">x</div>`],
    ['cursor', `<p style="cursor:url(https://beacon.example/c),auto">x</p>`],
    ['image-set', `<p style="background-image:image-set(url(https://beacon.example/i) 1x)">x</p>`],
    ['src de police', `<span style="font-family:'F';src:url(https://beacon.example/f.woff)">x</span>`],
    ['-moz-binding', `<p style="-moz-binding:url(https://beacon.example/b)">x</p>`],
    ['behavior', `<p style="behavior:url(https://beacon.example/b)">x</p>`],
    ['url en majuscules', `<p style="BACKGROUND-IMAGE:URL(https://beacon.example/u)">x</p>`],
    ['url derrière un commentaire', `<p style="background-image:/**/url(https://beacon.example/k)">x</p>`],
    ['url échappée', `<p style="background-image:\\75 rl(https://beacon.example/e)">x</p>`],
    ['import', `<p style="@import url(https://beacon.example/i.css)">x</p>`],
  ];
  for (const [name, html] of beacons) {
    const out = clean(html);
    t.check(FIXED ? `refusé: ${name}` : `passe: ${name}`,
            FIXED ? !/beacon\.example/.test(out) : /beacon\.example/.test(out),
            out.slice(0, 90));
  }

  // ── B) Ce que l'éditeur produit vraiment doit survivre ─────────────
  const keep = [
    ['couleur', `<span style="color: rgb(255, 0, 0)">x</span>`, /color:\s*rgb\(255, 0, 0\)/],
    ['surlignage', `<mark style="background-color: #fef08a">x</mark>`, /background-color:\s*#fef08a/],
    ['alignement', `<p style="text-align: center">x</p>`, /text-align:\s*center/],
    ['taille', `<span style="font-size: 18px">x</span>`, /font-size:\s*18px/],
    ['police', `<span style="font-family: Georgia, serif">x</span>`, /font-family:\s*Georgia, serif/],
    ['retrait', `<p style="margin-inline-start: 2em">x</p>`, /margin-inline-start:\s*2em/],
    ['soulignement', `<u style="text-decoration-line: underline; text-decoration-style: wavy">x</u>`,
      /text-decoration-style:\s*wavy/],
    ['couleur de soulignement', `<u style="text-decoration-color: #ff0000">x</u>`,
      /text-decoration-color:\s*#ff0000/],
  ];
  for (const [name, html, expected] of keep) {
    const out = clean(html);
    t.check(`conservé: ${name}`, expected.test(out), out.slice(0, 90));
  }

  // ── B bis) Aucune balise ne peut pointer vers une ressource ────────
  // Ce point sert aussi F-14: le pont natif de l'application Android
  // vit dans une WebView, et l'argument « rien ne peut y arriver depuis
  // une note » repose sur le fait qu'une note ne peut porter aucune
  // balise qui charge quoi que ce soit. C'est vérifié ici plutôt
  // qu'affirmé.
  const loaders = [
    ['image', `<p><img src="https://beacon.example/i.png"></p>`],
    ['image content://', `<p><img src="content://media/external/images/1"></p>`],
    ['cadre', `<iframe src="https://beacon.example/f"></iframe>`],
    ['objet', `<object data="https://beacon.example/o"></object>`],
    ['embarqué', `<embed src="https://beacon.example/e">`],
    ['vidéo', `<video src="https://beacon.example/v"></video>`],
    ['audio', `<audio src="https://beacon.example/a"></audio>`],
    ['fichier local', `<p><img src="file:///data/data/com.glasskeep.app/databases/x"></p>`],
  ];
  for (const [name, html] of loaders) {
    const out = clean(html);
    t.check(`une note ne peut pas charger: ${name}`,
            !/beacon\.example|content:\/\/|file:\/\//.test(out), out.slice(0, 80));
  }

  // Le mélange: ce qui est légitime reste, la balise part.
  const mixed = clean(`<p style="color: red; background-image: url(https://beacon.example/x); text-align: right">x</p>`);
  t.check(FIXED ? "dans une déclaration mixte, seule la partie piégée saute"
                : "la déclaration mixte passe entière",
          FIXED ? /color:\s*red/.test(mixed) && /text-align:\s*right/.test(mixed)
                  && !/beacon\.example/.test(mixed)
                : /beacon\.example/.test(mixed),
          mixed.slice(0, 120));

  // ── C) La politique de contenu, sur la vraie page construite ───────
  if (!existsSync(path.join(ROOT, "dist", "index.html"))) {
    t.check("l'application est construite (npm run build) pour le test navigateur", false,
            "dist/index.html absent, partie C non jouée");
  } else {
    child = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
      env: {
        ...process.env,
        DB_FILE: path.join(dir, "data.sqlite"),
        JWT_SECRET: "0".repeat(64),
        API_PORT: String(PORT),
        NODE_ENV: "production",
        HTTPS_ENABLED: "false",
        TRUST_PROXY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout.on("data", (d) => { log += d; });
    child.stderr.on("data", (d) => { log += d; });
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) {
      try { ready = (await fetch(BASE + "/api/health")).ok; } catch { /* pas prêt */ }
      if (!ready) await sleep(400);
    }
    if (!ready) throw new Error("l'instance n'a pas démarré: " + log.slice(-400));

    const head = await fetch(BASE + "/");
    const csp = head.headers.get("content-security-policy") || "";
    t.check(FIXED ? "la politique borne les images à l'origine et aux données locales"
                  : "la politique ne parle que d'encadrement",
            FIXED ? /img-src 'self' data: blob:/.test(csp) : csp === "frame-ancestors 'none'",
            csp.slice(0, 120));
    t.check("l'encadrement reste refusé", /frame-ancestors 'none'/.test(csp));

    // Le vrai navigateur, sur la vraie page: la politique ne doit rien
    // casser, et doit bloquer la balise.
    let chromium = null;
    try {
      ({ chromium } = await import(path.join(ROOT, "node_modules", "playwright", "index.mjs")));
    } catch { /* playwright absent */ }

    if (!chromium) {
      // Playwright n'est pas une dépendance du projet: le faire installer
      // à tout le monde pour un seul scénario coûterait plus qu'il ne
      // rapporte. Quand il est là (npm install --no-save playwright), la
      // politique est vérifiée dans un vrai navigateur; sinon on le dit
      // et on s'arrête là plutôt que de faire semblant.
      console.log("  (ignoré)  vérification navigateur: playwright absent, "
        + "installez-le avec `npm install --no-save playwright` pour la jouer");
    } else {
      // GK_CHROMIUM permet de désigner un navigateur déjà présent quand
      // la version de playwright installée n'est pas celle qui a
      // téléchargé les binaires.
      const browser = await chromium.launch(
        process.env.GK_CHROMIUM ? { executablePath: process.env.GK_CHROMIUM } : {},
      );
      const page = await browser.newPage();
      const violations = [];
      const externalHits = [];
      page.on("console", (m) => {
        if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
      });
      page.on("request", (r) => {
        const u = r.url();
        if (!u.startsWith(BASE) && !u.startsWith("data:") && !u.startsWith("blob:")) {
          externalHits.push(u);
        }
      });
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await sleep(1200);

      t.check("la page se charge sans violer sa propre politique",
              violations.length === 0, violations.slice(0, 2).join(" | ").slice(0, 200));
      t.check("et sans appeler quoi que ce soit d'extérieur au démarrage",
              externalHits.length === 0, externalHits.slice(0, 3).join(" ").slice(0, 200));
      t.check("l'application a bien démarré derrière la politique",
              await page.evaluate(() => !!document.querySelector("#root")?.childElementCount));

      // La balise elle-même, injectée dans la page vivante, visant un
      // serveur qui compte vraiment ce qu'il reçoit. Le nombre de coups
      // reçus est la seule mesure qui vaille: le navigateur signale la
      // requête à l'outil de pilotage même quand la politique la tue
      // avant qu'elle parte, donc l'observer ne prouve rien.
      let beaconHits = 0;
      const beacon = createServer((_req, res) => {
        beaconHits++;
        res.writeHead(200, { "content-type": "image/png" });
        res.end();
      });
      await new Promise((r) => beacon.listen(BEACON_PORT, "127.0.0.1", r));

      await page.evaluate((port) => {
        window.__cspViolations = [];
        document.addEventListener("securitypolicyviolation", (e) => {
          window.__cspViolations.push(`${e.blockedURI} ${e.violatedDirective}`);
        });
        const d = document.createElement("div");
        d.setAttribute("style",
          `background-image:url(http://127.0.0.1:${port}/beacon.png); width:40px; height:40px`);
        document.body.appendChild(d);
      }, BEACON_PORT);
      await sleep(1200);
      const reported = await page.evaluate(() => window.__cspViolations || []);
      beacon.close();

      t.check(FIXED ? "une balise injectée dans la page n'atteint jamais son serveur"
                    : "une balise injectée atteint son serveur",
              FIXED ? beaconHits === 0 : beaconHits > 0,
              `${beaconHits} coup(s) reçu(s)`);
      t.check(FIXED ? "et le navigateur dit que c'est la politique qui l'a coupée"
                    : "rien ne la coupe",
              FIXED ? reported.some((v) => v.includes("img-src")) : reported.length === 0,
              reported.join(" | ").slice(0, 140));
      await browser.close();
    }
  }
} finally {
  if (child) child.kill();
  await sleep(600);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* peu importe */ }
}

process.exit(t.summary() ? 0 : 1);
