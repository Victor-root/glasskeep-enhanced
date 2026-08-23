// Invariant 16, F-21. L'assainissement doit rester la dernière étape
// avant l'affichage, à chaque point d'affichage.
//
// POURQUOI CE TEST EXISTE. Plusieurs conclusions de l'audit tiennent sur
// une seule phrase: « le contenu des notes est nettoyé avant d'être
// affiché ». C'est vrai aujourd'hui à chacun des points où React reçoit
// du HTML brut. Mais rien n'empêche une modification future d'ajouter un
// point d'affichage de plus, alimenté directement par le contenu d'une
// note, et personne ne s'en apercevrait. Ce n'est pas un test d'une
// fonction, c'est un test de la règle: il casse le jour où quelqu'un
// ajoute un endroit qui affiche du HTML sans passer par un nettoyeur.
//
// Comment il s'y prend: React n'affiche du HTML brut que par
// `dangerouslySetInnerHTML`. Le test recense chaque occurrence dans
// `src/`, remonte à la valeur qui l'alimente, et vérifie qu'elle
// descend d'un nettoyeur connu, en suivant les variables, les fonctions
// locales et une propriété passée à un sous-composant.
//
// CE QU'IL NE FAIT PAS, pour que personne ne s'y trompe: ce n'est pas un
// analyseur de flot. Il répond à « cette valeur descend-elle d'un
// nettoyeur », pas à « cette valeur est-elle correctement construite ».
// Un code qui concatènerait du contenu brut à du HTML nettoyé passerait.
// Le but est de faire échouer la construction le jour où quelqu'un
// ajoute un point d'affichage alimenté directement par une note, ce qui
// est le scénario que l'audit a laissé sans garde-fou.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { runner } from "../federation/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const SRC = path.join(ROOT, "src");
const t = runner("Invariant 16, assainissement avant affichage");

// Les seules fonctions autorisées à produire du HTML destiné à
// l'affichage. Toutes passent par DOMPurify.
const SANITIZERS = [
  "contentToHTML",
  "contentToHTMLPreview",
  "richDocToHTML",
  "renderSafeMarkdown",
  "compileMarkdown",
  "DOMPurify.sanitize",
];

// Exception unique et nommée: les icônes de l'éditeur sont du SVG
// écrit dans le dépôt, pas du contenu d'utilisateur. Une exception qui
// doit être listée ici est une exception qu'on a vue.
const ALLOWED_EXCEPTIONS = [
  { file: "src/icons/editor/index.jsx", why: "SVG des icônes, écrit dans le dépôt, aucun contenu utilisateur" },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(jsx?|tsx?)$/.test(entry)) out.push(full);
  }
  return out;
}

// Reconstitue, fichier par fichier, l'ensemble des noms qui produisent
// du HTML déjà nettoyé. On part des nettoyeurs eux-mêmes, puis on ajoute
// par petits pas tout nom dont l'affectation ou le corps de fonction
// appelle un nom déjà connu comme sûr, jusqu'à ce que plus rien ne
// bouge. C'est grossier comparé à un vrai analyseur, et c'est voulu: la
// question posée n'est pas « ce code est-il correct » mais « cette
// valeur descend-elle d'un nettoyeur, oui ou non ».
// Découpe l'expression complète qui suit une position donnée, en
// suivant les parenthèses, accolades et crochets. Sans cela le corps
// d'un useMemo s'arrête à la première déclaration imbriquée, c'est-à-dire
// juste avant l'appel qui nous intéresse.
// Découpe ce qui suit une position, en suivant parenthèses, accolades et
// crochets. Deux terminaisons selon ce qu'on lit: une expression
// s'arrête au point-virgule de son niveau, un corps de fonction s'arrête
// à son accolade fermante et pas avant, sinon il se coupe au premier
// point-virgule interne.
function balancedFrom(source, start, { stopAtSemicolon }) {
  let depth = 0;
  const limit = Math.min(source.length, start + 6000);
  for (let i = start; i < limit; i++) {
    const c = source[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth < 0) return source.slice(start, i);
    } else if (c === ";" && depth === 0 && stopAtSemicolon) {
      return source.slice(start, i);
    }
  }
  return source.slice(start, limit);
}

function safeNamesIn(source) {
  const safe = new Set(SANITIZERS.map((fn) => fn.split(".")[0]));
  const declarations = [];
  for (const m of source.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) {
    declarations.push({
      name: m[1],
      body: balancedFrom(source, m.index + m[0].length, { stopAtSemicolon: true }),
    });
  }
  for (const m of source.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const brace = source.indexOf("{", m.index + m[0].length);
    if (brace !== -1) {
      declarations.push({
        name: m[1],
        body: balancedFrom(source, brace + 1, { stopAtSemicolon: false }),
      });
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const d of declarations) {
      if (safe.has(d.name)) continue;
      // Un nom devient sûr quand son corps appelle un nom déjà sûr, ou
      // s'y ramène simplement: `const x = condition ? aNettoyer : bNettoye`
      // est un alias, pas une nouvelle source.
      if ([...safe].some((n) => d.body.includes(`${n}(`) || new RegExp(`\\b${n}\\b`).test(d.body))) {
        safe.add(d.name);
        changed = true;
      }
    }
  }
  return safe;
}

// Une valeur peut aussi arriver par une propriété passée à un
// sous-composant du même fichier: `<Vue html={viewHtml} />`. On suit ce
// saut-là, une fois.
function resolvesToSanitizer(expression, source, safe) {
  const expr = expression.trim();
  const mentions = (text) => [...safe].some((n) => text.includes(`${n}(`) || new RegExp(`\\b${n}\\b`).test(text));
  if (mentions(expr)) return true;

  const name = expr.match(/^[A-Za-z_$][\w$]*/)?.[0];
  if (!name) return false;
  for (const m of source.matchAll(new RegExp(`\\b${name}\\s*=\\{([^}]{1,120})\\}`, "g"))) {
    if (mentions(m[1])) return true;
  }
  return false;
}

const files = walk(SRC);
const sites = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  // On ne veut que les vrais points d'affichage, pas les mentions du nom
  // dans un commentaire.
  for (const m of source.matchAll(/dangerouslySetInnerHTML\s*=\s*\{\{([\s\S]{0,300}?)\}\}/g)) {
    const inner = m[1];
    const value = inner.replace(/^[\s\S]*?__html\s*:/, "");
    sites.push({ rel, value: value.trim(), source });
  }
}

t.check("des points d'affichage sont bien trouvés dans le code",
        sites.length >= 8, `${sites.length} point(s)`);

for (const site of sites) {
  const exception = ALLOWED_EXCEPTIONS.find((e) => e.rel === site.rel || site.rel === e.file);
  if (exception) {
    t.check(`exception assumée: ${site.rel}`, true, exception.why);
    continue;
  }
  t.check(`nettoyé avant affichage: ${site.rel}`,
          resolvesToSanitizer(site.value, site.source, safeNamesIn(site.source)),
          site.value.replace(/\s+/g, " ").slice(0, 70));
}

// Le nettoyeur de Markdown refuse les images depuis toujours, pour
// éviter qu'une note aille chercher une ressource au dehors. Cette
// décision-là aussi mérite d'être verrouillée: elle a déjà été défaite
// une fois par un autre chemin (voir F-13).
const markdownSource = readFileSync(path.join(SRC, "utils", "markdown.jsx"), "utf8");
const stripComments = (txt) => txt.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const allowedTags = stripComments(markdownSource.match(/ALLOWED_TAGS:\s*\[([\s\S]*?)\]/)?.[1] || "");
t.check("le rendu Markdown continue de refuser les images",
        !/["']img["']/.test(allowedTags), allowedTags.replace(/\s+/g, " ").slice(0, 80));

const richSource = readFileSync(path.join(SRC, "utils", "richText.js"), "utf8");
const richTags = stripComments(richSource.match(/ALLOWED_TAGS:\s*\[([\s\S]*?)\]/)?.[1] || "");
t.check("l'éditeur riche non plus",
        !/["'](img|iframe|object|embed|video|audio|script)["']/.test(richTags),
        richTags.replace(/\s+/g, " ").slice(0, 80));

t.check("et le filtre de style est posé sur chaque chemin d'assainissement", (() => {
  const users = ["src/utils/richText.js", "src/utils/markdown.jsx", "src/components/admin/ChangelogModal.jsx"];
  return users.every((f) => readFileSync(path.join(ROOT, f), "utf8").includes("installStyleGuard("));
})());

process.exit(t.summary() ? 0 : 1);
