// Les gestes de l'éditeur de texte, sur le vrai éditeur, avec le schéma
// et les réglages du presse-papiers de l'application.
//
// Chaque vérification tient une promesse qui a déjà été cassée une fois:
//   - retirer la couleur d'un mot dans une liste effaçait aussi les
//     couleurs, tailles et polices de toute la liste;
//   - indenter un élément de liste décalait le texte deux fois plus que
//     sa puce;
//   - « bloc de code » sur deux mots transformait tout le paragraphe, et
//     sur plusieurs lignes en faisait autant de blocs séparés;
//   - les soulignements ondulés, pointillés ou en couleur ne
//     s'affichaient pas;
//   - un texte collé depuis le Bloc-notes perdait ses retours à la ligne;
//   - en collage « texte seul », une adresse web collée restait du texte
//     inerte au lieu de devenir un lien.
import "./dom-env.mjs";
import { runner } from "../federation/lib.mjs";

const { Editor } = await import("@tiptap/core");
const { buildRichTextExtensions } = await import("../../src/components/richtext/richTextSchema.js");
const { clipboardEditorProps } = await import("../../src/utils/richTextClipboard.js");
const { richDocToHTML } = await import("../../src/utils/richText.js");
const t = runner("Les gestes de l'éditeur de texte");

let pasteMode = "rich";
const open = (content) => new Editor({
  extensions: buildRichTextExtensions(),
  content,
  editorProps: clipboardEditorProps(() => pasteMode),
});
const txt = (text, marks) => ({ type: "text", text, ...(marks ? { marks } : {}) });
const P = (...inline) => ({ type: "paragraph", ...(inline.length ? { content: inline.map((i) => (typeof i === "string" ? txt(i) : i)) } : {}) });
const doc = (...content) => ({ type: "doc", content });
const style = (attrs) => [{ type: "textStyle", attrs }];
// Sélectionne `text` (sa première occurrence dans la note).
const select = (editor, text) => {
  let range = null;
  editor.state.doc.descendants((node, pos) => {
    if (range || !node.isText) return;
    const at = node.text.indexOf(text);
    if (at >= 0) range = { from: pos + at, to: pos + at + text.length };
  });
  if (!range) throw new Error(`« ${text} » introuvable`);
  editor.commands.setTextSelection(range);
};
// Les attributs de style que porte le texte `text`.
const styleOf = (editor, text) => {
  let found = null;
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text === text) found = node.marks.find((m) => m.type.name === "textStyle")?.attrs ?? {};
  });
  return found;
};
const blocks = (editor) => editor.getJSON().content
  .filter((n, i, all) => !(i === all.length - 1 && n.type === "paragraph" && !n.content))
  .map((n) => `${n.type}(${(n.content || []).map((c) => c.text ?? (c.type === "hardBreak" ? "↵" : c.type)).join("")})`).join(" ");
const pasteEvent = (data) => {
  const event = new window.Event("paste");
  event.clipboardData = { getData: (type) => data[type] || "" };
  return event;
};

// ── Retirer un style ───────────────────────────────────────────────────
let ed = open(doc(
  { type: "bulletList", content: [
    { type: "listItem", content: [P(txt("rouge", style({ color: "#ff0000" })), " ", txt("grand", style({ fontSize: "20px" })))] },
    { type: "listItem", content: [P(txt("serif", style({ fontFamily: "serif" })))] },
  ] },
  { type: "blockquote", content: [P(txt("bleu", style({ color: "#0000ff" })), " ", txt("petit", style({ fontSize: "10px" })))] },
));
select(ed, "rouge");
ed.chain().unsetColor().run();
select(ed, "bleu");
ed.chain().unsetColor().run();
t.check("retirer la couleur d'un mot dans une liste ou une citation laisse les autres styles en place",
  !styleOf(ed, "rouge")?.color && !styleOf(ed, "bleu")?.color
    && styleOf(ed, "grand")?.fontSize === "20px" && styleOf(ed, "serif")?.fontFamily === "serif" && styleOf(ed, "petit")?.fontSize === "10px",
  JSON.stringify({ grand: styleOf(ed, "grand"), serif: styleOf(ed, "serif"), petit: styleOf(ed, "petit") }));
ed.destroy();

// ── Indenter ───────────────────────────────────────────────────────────
ed = open(doc({ type: "bulletList", content: [{ type: "listItem", content: [P("un")] }, { type: "listItem", content: [P("deux")] }] }));
select(ed, "deux");
ed.commands.indent();
let items = ed.getJSON().content[0].content;
t.check("indenter un élément de liste décale l'élément entier, sa puce avec, et lui seul",
  items[1].attrs.indent === 1 && items[1].content[0].attrs.indent === 0 && items[0].attrs.indent === 0,
  JSON.stringify(items.map((i) => [i.attrs.indent, i.content[0].attrs.indent])));
t.check("le décalage se voit aussi en mode lecture",
  /<li data-indent="1" style="margin-inline-start: 1.75em">/.test(richDocToHTML(ed.getJSON())), richDocToHTML(ed.getJSON()));
const outdents = [ed.commands.outdent(), ed.commands.outdent()];
t.check("désindenter revient à la marge et s'arrête là", outdents.join() === "true,false", outdents.join());
for (let i = 0; i < 12; i++) ed.commands.indent();
t.check("l'indentation plafonne à 8 niveaux", ed.getJSON().content[0].content[1].attrs.indent === 8);
ed.destroy();

// ── Bloc de code ───────────────────────────────────────────────────────
ed = open(doc(P("Lancer npm test ici")));
select(ed, "npm test");
ed.commands.smartToggleCodeBlock();
t.check("« bloc de code » sur quelques mots ne transforme que ces mots, le reste du paragraphe reste autour",
  blocks(ed) === "paragraph(Lancer ) codeBlock(npm test) paragraph( ici)", blocks(ed));
ed.destroy();

ed = open(doc(P("ligne a"), P("ligne b"), P("ligne c")));
ed.commands.setTextSelection({ from: 1, to: ed.state.doc.content.size - 1 });
ed.commands.smartToggleCodeBlock();
const asCode = blocks(ed);
ed.commands.smartToggleCodeBlock();
t.check("« bloc de code » sur plusieurs lignes en fait un seul bloc, et le retirer rend les lignes",
  asCode === "codeBlock(ligne a\nligne b\nligne c)" && blocks(ed) === "paragraph(ligne a↵ligne b↵ligne c)",
  `${JSON.stringify(asCode)} puis ${JSON.stringify(blocks(ed))}`);
ed.destroy();

// ── Soulignements ──────────────────────────────────────────────────────
ed = open(doc(P("ondulé")));
select(ed, "ondulé");
ed.commands.setUnderline({ style: "wavy", color: "#ff0000" });
const underlined = richDocToHTML(ed.getJSON());
ed.destroy();
t.check("un soulignement ondulé et coloré s'affiche en mode lecture",
  /<u [^>]*text-decoration-style: wavy/.test(underlined) && /text-decoration-color: (#ff0000|rgb\(255, 0, 0\))/.test(underlined), underlined);
ed = open(underlined);
const mark = ed.getJSON().content[0].content[0].marks?.[0];
t.check("et revient intact quand on le recopie dans l'éditeur",
  mark?.type === "underline" && mark.attrs.style === "wavy" && mark.attrs.color === "#ff0000", JSON.stringify(mark));
ed.destroy();

// ── Cases à cocher ─────────────────────────────────────────────────────
const tasks = doc({ type: "taskList", content: [
  { type: "taskItem", attrs: { checked: true }, content: [P("fait")] },
  { type: "taskItem", attrs: { checked: false }, content: [P("à faire")] },
] });
const taskHtml = richDocToHTML(tasks);
t.check("une case cochée s'affiche cochée en mode lecture, l'autre non",
  (taskHtml.match(/checked="checked"|checked=""/g) || []).length === 1 && taskHtml.includes('data-checked="true"'), taskHtml);
ed = open(taskHtml);
const states = ed.getJSON().content[0].content.map((i) => i.attrs.checked);
t.check("et une liste recopiée depuis le mode lecture garde ses coches", states.join() === "true,false", states.join());
ed.destroy();

// ── Coller ─────────────────────────────────────────────────────────────
ed = open(doc(P()));
ed.view.pasteText("un\r\ndeux\r\n\r\ntrois", pasteEvent({}));
t.check("un texte collé depuis le Bloc-notes garde une ligne par ligne, ligne vide comprise",
  blocks(ed) === "paragraph(un) paragraph(deux) paragraph() paragraph(trois)", blocks(ed));
ed.destroy();

const page = { "text/html": "<p><strong>gras</strong> https://glasskeep.test/page</p>", "text/plain": "gras https://glasskeep.test/page" };
const linkAndBold = (editor) => {
  const marks = editor.getJSON().content[0].content.flatMap((n) => (n.marks || []).map((m) => m.type + (m.attrs?.href ? `=${m.attrs.href}` : "")));
  return marks.join(",");
};
pasteMode = "plain";
ed = open(doc(P()));
ed.view.pasteHTML(page["text/html"], pasteEvent(page));
t.check("en collage « texte seul », la mise en forme tombe mais l'adresse devient un lien",
  linkAndBold(ed) === "link=https://glasskeep.test/page", linkAndBold(ed));
ed.destroy();
pasteMode = "rich";
ed = open(doc(P()));
ed.view.pasteHTML(page["text/html"], pasteEvent(page));
t.check("en collage normal, la mise en forme est gardée", linkAndBold(ed).split(",").includes("bold"), linkAndBold(ed));
ed.destroy();

// ── Copier ─────────────────────────────────────────────────────────────
ed = open(doc({ type: "orderedList", content: [{ type: "listItem", content: [P("un")] }, { type: "listItem", content: [P("deux")] }] }));
ed.commands.selectAll();
const copied = ed.view.serializeForClipboard(ed.state.selection.content()).text;
t.check("copier une liste depuis l'éditeur donne ses numéros, une ligne par élément", copied === "1. un\n2. deux", JSON.stringify(copied));
ed.destroy();

process.exit(t.summary() ? 0 : 1);
