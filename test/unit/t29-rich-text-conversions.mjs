// Ce que le texte d'une note devient en dehors de l'éditeur: à l'import,
// à l'ouverture d'une ancienne note, en mode lecture, sur la carte de la
// grille, quand on la convertit en liste à cocher, quand on la copie.
//
// Chaque vérification tient une promesse qui a déjà été cassée une fois:
//   - l'import Google Keep perdait les retours à la ligne;
//   - le mode lecture écrasait la ligne qu'un saut de ligne en fin de
//     paragraphe ouvre dans l'éditeur;
//   - TROUVÉ PAR CES TESTS: convertir une liste à cocher en note texte
//     perdait les coches, et l'inverse perdait aussi les sections et
//     l'indentation;
//   - copier une liste vers le Bloc-notes donnait des lignes vides
//     partout, et depuis le mode lecture, des éléments collés bout à bout
//     numérotés à partir de 1.
// Le texte brut décide aussi si une note est vide, donc mise à la
// corbeille en la fermant: une note qui a du contenu ne doit jamais
// passer pour vide.
import "./dom-env.mjs";
import { runner } from "../federation/lib.mjs";

const { getSchema } = await import("@tiptap/core");
const { Node } = await import("@tiptap/pm/model");
const { RENDER_EXTENSIONS } = await import("../../src/components/richtext/richTextSchema.js");
const rt = await import("../../src/utils/richText.js");
const conv = await import("../../src/utils/noteConversion.js");
const clip = await import("../../src/utils/richTextClipboard.js");
const t = runner("Le texte d'une note hors de l'éditeur");

const schema = getSchema(RENDER_EXTENSIONS);
const txt = (text, marks) => ({ type: "text", text, ...(marks ? { marks } : {}) });
const P = (...inline) => ({ type: "paragraph", ...(inline.length ? { content: inline.map((i) => (typeof i === "string" ? txt(i) : i)) } : {}) });
const BR = { type: "hardBreak" };
const H = (level, text) => ({ type: "heading", attrs: { level }, content: [txt(text)] });
const item = (text, ...nested) => ({ type: "listItem", content: [P(text), ...nested] });
const task = (text, checked, ...nested) => ({ type: "taskItem", attrs: { checked }, content: [P(text), ...nested] });
const list = (type, items, attrs) => ({ type, ...(attrs ? { attrs } : {}), content: items });
const doc = (...content) => ({ type: "doc", content });
const stored = (d) => rt.serializeRichContent(d);
const valid = (d) => { try { Node.fromJSON(schema, d).check(); return true; } catch { return false; } };
// Les entrées d'une liste à cocher, sans leurs identifiants.
const entries = (items) => items.map((e) => (e.kind === "section" ? `## ${e.title}` : `${e.indent ? "  " : ""}[${e.done ? "x" : " "}] ${e.text}`));

// ── Import Google Keep ─────────────────────────────────────────────────
let d = rt.plainTextToRichDoc("ligne 1\nligne 2\n\nautre paragraphe");
t.check("un texte importé de Google Keep garde ses retours à la ligne et sa ligne vide",
  JSON.stringify(d.content) === JSON.stringify([P("ligne 1", BR, "ligne 2"), P(), P("autre paragraphe")]),
  JSON.stringify(d.content));

// ── Anciennes notes en Markdown ────────────────────────────────────────
d = rt.contentToRichDoc("# Titre\n**gras** et `code`\n\n- a\n- b\n\n1. un\n\n```\nx = 1\n```");
const types = d.content.map((n) => n.type).join(" ");
const marks = JSON.stringify(d).match(/"type":"(bold|code)"/g) || [];
t.check("une ancienne note en Markdown s'ouvre avec son titre, ses listes, son gras et son code",
  types === "heading paragraph bulletList orderedList codeBlock" && marks.length === 2 && valid(d),
  `${types} · ${marks.join(",")}`);
const html = rt.contentToHTML("salut <img src=x onerror=alert(1)><script>alert(2)</script>");
t.check("une ancienne note qui contient du HTML piégé s'affiche sans lui", !/onerror|<script|<img/i.test(html), html);

// ── Mode lecture ───────────────────────────────────────────────────────
const read = rt.richDocToHTML(doc(P("ligne", BR), list("bulletList", [{ type: "listItem", content: [P("élément", BR)] }])));
t.check("le mode lecture garde la ligne qu'ouvre un saut de ligne en fin de paragraphe, comme l'éditeur",
  (read.match(/<br><br><\/p>/g) || []).length === 2, read);
const many = stored(doc(...Array.from({ length: 12 }, (_, i) => P(`bloc${i + 1}`))));
const preview = rt.contentToHTMLPreview(many);
t.check("la carte de la grille ne dessine que le début d'une longue note",
  preview.includes("bloc8") && !preview.includes("bloc9") && rt.contentToHTML(many).includes("bloc12"));

// ── Une note vide, ou pas ──────────────────────────────────────────────
const isEmpty = (content) => !rt.contentToPlain(content).trim();
t.check("une note sans texte, ou faite de lignes vides, est vide",
  isEmpty(stored(rt.emptyRichDoc())) && isEmpty(stored(doc(P(), P(BR), P()))) && isEmpty(""));
const notEmpty = {
  "une case à cocher": doc(list("taskList", [task("acheter du pain", false)])),
  "un bloc de code": doc({ type: "codeBlock", content: [txt("npm test")] }),
  "un titre": doc(H(2, "Titre")),
  "une citation": doc({ type: "blockquote", content: [P("citation")] }),
  "une ancienne note en Markdown": "**gras**",
};
const wronglyEmpty = Object.entries(notEmpty).filter(([, c]) => isEmpty(typeof c === "string" ? c : stored(c))).map(([k]) => k);
t.check("une note qui ne contient qu'une case, du code, un titre ou une citation n'est pas vide", !wronglyEmpty.length, wronglyEmpty.join(", "));

// ── Conversion en liste à cocher et retour ─────────────────────────────
const checklist = [
  { id: "1", text: "avant", done: false },
  { id: "s", kind: "section", title: "Courses" },
  { id: "2", text: "pain", done: true },
  { id: "3", text: "bio", done: false, indent: 1 },
  { id: "4", text: "lait", done: false },
];
d = conv.checklistItemsToRichDoc(checklist);
t.check("une liste à cocher convertie en texte devient une liste à cases, avec ses coches, ses sections et ses sous-éléments",
  valid(d) && d.content.map((n) => n.type).join(" ") === "taskList heading taskList"
    && d.content[2].content[0].attrs.checked === true && d.content[2].content[0].content[1]?.type === "taskList",
  JSON.stringify(d.content.map((n) => n.type)));
let back = entries(conv.richDocToChecklistItems(d));
t.check("et redevient exactement la même liste à cocher",
  JSON.stringify(back) === JSON.stringify(entries(checklist)), back.join(" | "));
t.check("une liste à cocher vide donne une note texte vide", valid(conv.checklistItemsToRichDoc([])) && isEmpty(stored(conv.checklistItemsToRichDoc([]))));

back = entries(conv.richDocToChecklistItems(doc(
  H(1, "Semaine"),
  P("lundi", BR, "mardi"),
  list("orderedList", [item("un", list("bulletList", [item("sous-point")]))]),
  list("taskList", [task("fait", true), task("à faire", false)]),
  P(),
)));
t.check("une note texte convertie en liste à cocher garde ses titres en sections, ses coches et ses sous-éléments",
  JSON.stringify(back) === JSON.stringify(["## Semaine", "[ ] lundi", "[ ] mardi", "[ ] un", "  [ ] sous-point", "[x] fait", "[ ] à faire"]),
  back.join(" | "));
back = entries(conv.textToChecklistItems("## Courses\n- [x] pain\n  - [ ] bio\n- lait"));
t.check("une ancienne note en Markdown se convertit aussi avec ses coches et ses sections",
  JSON.stringify(back) === JSON.stringify(["## Courses", "[x] pain", "  [ ] bio", "[ ] lait"]), back.join(" | "));

// ── Copier vers une application de texte brut ─────────────────────────
const copied = Node.fromJSON(schema, doc(
  H(2, "Titre"),
  P("texte"),
  P(),
  list("orderedList", [item("trois", list("bulletList", [item("puce")])), item("quatre")], { start: 3 }),
  { type: "codeBlock", content: [txt("a\nb")] },
));
const plain = clip.sliceToCleanPlainText(copied.slice(0, copied.content.size));
t.check("copier vers le Bloc-notes donne une ligne par bloc, les numéros et les puces, sans lignes vides ajoutées",
  plain === "Titre\ntexte\n\n3. trois\n  - puce\n4. quatre\na\nb", JSON.stringify(plain));

document.body.innerHTML = '<ol start="5"><li><p>a</p></li><li><p>b</p></li><li><p>c</p></li></ol>';
const lis = document.querySelectorAll("li");
const range = document.createRange();
range.setStart(lis[1].firstChild.firstChild, 0);
range.setEnd(lis[2].firstChild.firstChild, 1);
window.getSelection().removeAllRanges();
window.getSelection().addRange(range);
const fromRead = clip.domSelectionToCleanPlainText();
t.check("copier des éléments d'une liste en mode lecture garde un élément par ligne et leurs vrais numéros",
  fromRead === "6. b\n7. c", JSON.stringify(fromRead));

process.exit(t.summary() ? 0 : 1);
