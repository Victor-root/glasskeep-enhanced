// Deux listes du même type qui se touchent n'en font plus qu'une, comme
// dans Word ou LibreOffice (issue #35).
//
// TROUVÉ PAR UN UTILISATEUR: supprimer la ligne vide entre « 1. 2. 3. »
// et « 1. 2. 3. » laissait deux listes collées, numérotées 1 à 3 puis à
// nouveau 1 à 3 quand un titre précédait la première.
//
// Les règles vérifiées ici, sur le vrai schéma de l'éditeur: les listes
// numérotées, à puces et à cocher collées se fusionnent, à toute
// profondeur, en gardant leurs éléments dans l'ordre; deux listes de
// types différents restent séparées; une ligne entre deux listes les
// laisse séparées. Et dans le vrai éditeur, les gestes de l'issue:
// Retour arrière sur la ligne vide fusionne, Ctrl+Z défait le tout d'un
// coup.
import "./dom-env.mjs";
import { runner } from "../federation/lib.mjs";

const { getSchema, Editor } = await import("@tiptap/core");
const { Node } = await import("@tiptap/pm/model");
const { Transform } = await import("@tiptap/pm/transform");
const { RENDER_EXTENSIONS, buildRichTextExtensions } = await import("../../src/components/richtext/richTextSchema.js");
const { joinAdjacentLists } = await import("../../src/components/richtext/extensions/JoinAdjacentLists.js");
const t = runner("Deux listes du même type qui se touchent n'en font plus qu'une");

const schema = getSchema(RENDER_EXTENSIONS);
const P = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
const item = (text) => ({ type: "listItem", content: [P(text)] });
const task = (text) => ({ type: "taskItem", attrs: { checked: false }, content: [P(text)] });
const list = (type, items) => ({ type, content: items });
const joined = (content) => joinAdjacentLists(new Transform(Node.fromJSON(schema, { type: "doc", content }))).doc.toJSON().content;
const shape = (content) => content.map((n) => (n.content && n.type !== "paragraph" ? `${n.type}(${n.content.length})` : n.type)).join(" ");
const texts = (node) => JSON.stringify(node).match(/"text":"[^"]*"/g).map((s) => s.slice(8, -1)).join(",");

let r = joined([P("Project"), list("orderedList", [item("Test1"), item("Test2"), item("Test3")]), list("orderedList", [item("Design1"), item("Design2"), item("Design3")])]);
t.check("deux listes numérotées collées n'en font plus qu'une, éléments dans l'ordre",
  shape(r) === "paragraph orderedList(6)" && texts(r[1]) === "Test1,Test2,Test3,Design1,Design2,Design3", shape(r));

r = joined([list("bulletList", [item("a")]), list("bulletList", [item("b")]), list("bulletList", [item("c")])]);
t.check("trois listes à puces collées n'en font plus qu'une", shape(r) === "bulletList(3)", shape(r));

r = joined([list("taskList", [task("x")]), list("taskList", [task("y")])]);
t.check("deux listes à cocher collées n'en font plus qu'une", shape(r) === "taskList(2)", shape(r));

r = joined([list("bulletList", [item("a")]), list("orderedList", [item("1")]), list("taskList", [task("x")])]);
t.check("des listes de types différents restent séparées", shape(r) === "bulletList(1) orderedList(1) taskList(1)", shape(r));

r = joined([list("orderedList", [item("1")]), P("entre les deux"), list("orderedList", [item("1")])]);
t.check("une ligne entre deux listes les laisse séparées", shape(r) === "orderedList(1) paragraph orderedList(1)", shape(r));

r = joined([list("orderedList", [{ type: "listItem", content: [P("parent"), list("bulletList", [item("x")]), list("bulletList", [item("y")])] }])]);
t.check("les listes collées à l'intérieur d'un élément se fusionnent aussi",
  shape(r[0].content[0].content) === "paragraph bulletList(2)", shape(r[0].content[0].content));

// Les gestes de l'issue, dans le vrai éditeur.
const issue = [P("Project"), list("orderedList", [item("Test1"), item("Test2"), item("Test3")]), { type: "paragraph" },
  list("orderedList", [item("Design1"), item("Design2"), item("Design3")])];
// L'éditeur garde toujours une ligne vide après une liste qui finit la note.
const editor = new Editor({ extensions: buildRichTextExtensions(), content: { type: "doc", content: issue } });
let emptyLine = 0;
editor.state.doc.forEach((node, offset) => { if (!emptyLine && node.type.name === "paragraph" && !node.content.size) emptyLine = offset + 1; });
editor.commands.setTextSelection(emptyLine);
editor.view.someProp("handleKeyDown", (f) => f(editor.view, new KeyboardEvent("keydown", { key: "Backspace" })));
r = editor.getJSON().content;
t.check("dans l'éditeur, Retour arrière sur la ligne vide entre les deux listes n'en laisse qu'une, numérotée de 1 à 6",
  shape(r) === "paragraph orderedList(6) paragraph" && texts(r[1]) === "Test1,Test2,Test3,Design1,Design2,Design3", shape(r));
editor.commands.undo();
r = editor.getJSON().content;
t.check("un seul Ctrl+Z rend les deux listes et la ligne vide", shape(r) === "paragraph orderedList(3) paragraph orderedList(3) paragraph", shape(r));
editor.destroy();

process.exit(t.summary() ? 0 : 1);
