// Lists pasted from Microsoft Word.
//
// Word puts no <ol>/<ul> on the clipboard: each item is a paragraph styled
// `mso-list: l0 level2 lfo1`, its number or bullet written out in a span
// marked `mso-list: Ignore` (or between <![if !supportLists]> comments).
// Pasted as is, a list became paragraphs starting with "1.    ". This
// rebuilds real nested lists from those paragraphs, numbered from the
// first number Word shows.

const LIST_STYLE = /mso-list:\s*l(\d+)\s+level(\d+)/i;
const ORDERED_MARKER = /^\(?(\d+|[a-z]|[ivxlcdm]+)[.)]$/i;

function listParagraph(el) {
  if (el.tagName !== "P") return null;
  const match = (el.getAttribute("style") || "").match(LIST_STYLE);
  return match ? { list: match[1], level: Number(match[2]) } : null;
}

// Takes the written-out marker out of a list paragraph and returns it.
function takeMarker(p) {
  let marker = p.querySelector('[style*="mso-list:Ignore" i], [style*="mso-list: Ignore" i]');
  if (!marker) {
    // Older Word: the marker is the first span, inside conditional comments.
    const first = p.firstElementChild;
    if (first?.tagName === "SPAN" && first.previousSibling?.nodeType === Node.COMMENT_NODE) marker = first;
  }
  if (!marker) return "";
  const text = marker.textContent.replace(/\u00a0/g, " ").trim();
  marker.remove();
  for (const node of [...p.childNodes]) {
    if (node.nodeType === Node.COMMENT_NODE) node.remove();
  }
  return text;
}

function buildLists(doc, paragraphs) {
  const root = doc.createDocumentFragment();
  const stack = []; // { level, list, item }
  for (const { p, level } of paragraphs) {
    const marker = takeMarker(p);
    const ordered = ORDERED_MARKER.test(marker);
    while (stack.length && stack.at(-1).level > level) stack.pop();
    let top = stack.at(-1);
    if (!top || top.level < level || (top.list.tagName === "OL") !== ordered) {
      if (top && top.level === level) stack.pop();
      const list = doc.createElement(ordered ? "ol" : "ul");
      const number = marker.match(/^\(?(\d+)/);
      if (ordered && number && number[1] !== "1") list.setAttribute("start", number[1]);
      const parent = stack.at(-1);
      (parent ? parent.item : root).append(list);
      top = { level, list, item: null };
      stack.push(top);
    }
    const item = doc.createElement("li");
    const para = doc.createElement("p");
    para.append(...p.childNodes);
    item.append(para);
    top.list.append(item);
    top.item = item;
  }
  return root;
}

export function officeListsToHTML(html) {
  if (!/mso-list/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = [...doc.body.querySelectorAll("p")];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const first = run[0].p;
    first.before(buildLists(doc, run));
    run.forEach(({ p }) => p.remove());
    run = [];
  };
  for (const p of blocks) {
    const info = listParagraph(p);
    const follows = run.length && run.at(-1).p.nextElementSibling === p;
    if (!info || !follows) flush();
    if (info) run.push({ p, level: info.level });
  }
  flush();
  return doc.body.innerHTML;
}
