import {
  isSection,
  makeItem,
  makeSection,
  normalizeItems,
} from "./checklist.js";
import { emptyRichDoc } from "./richText.js";

/**
 * Convert a free-form text body into a checklist `entries` array
 * (items + optional section markers).
 *
 * Parsing rules — best effort to preserve user intent:
 *   - Markdown headings (`#`, `##`, …)           → section header
 *   - Markdown task lines (`- [ ]`, `- [x]`)     → item with its done state
 *   - Bullet list lines (`-`, `*`, `+`)          → item (unchecked)
 *   - Ordered list lines (`1.`, `2)` …)          → item (unchecked)
 *   - Blockquote markers (`>`) are stripped      → item (unchecked)
 *   - Any other non-empty line                   → item (unchecked)
 *   - Empty lines are dropped (checklists have no blank rows).
 *   - A task line with leading whitespace        → indented item, unless
 *     it's the first item of the list/section, matching the same rule
 *     `normalizeItems` enforces everywhere else.
 *
 * Empty input returns an empty array — caller decides whether to keep
 * the note empty or seed a blank item.
 */
export function textToChecklistItems(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const lines = text.split(/\r?\n/);
  const entries = [];
  let atSectionStart = true;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    if (!trimmed) continue;
    const indented = /^\s/.test(line);

    // Markdown heading → section marker.
    const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      entries.push(makeSection(heading[1].trim()));
      atSectionStart = true;
      continue;
    }

    // Task list item — `- [ ] foo`, `* [x] bar`, `+ [X] baz`.
    const task = trimmed.match(/^[-*+]\s+\[([ xX])\]\s*(.*)$/);
    if (task) {
      const item = makeItem(task[2].trim(), task[1].toLowerCase() === "x");
      if (indented && !atSectionStart) item.indent = 1;
      entries.push(item);
      atSectionStart = false;
      continue;
    }

    // Bullet list — `- foo`, `* foo`, `+ foo`.
    const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      entries.push(makeItem(bullet[1].trim(), false));
      atSectionStart = false;
      continue;
    }

    // Ordered list — `1. foo`, `2) bar`.
    const ordered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (ordered) {
      entries.push(makeItem(ordered[1].trim(), false));
      atSectionStart = false;
      continue;
    }

    // Blockquote — keep text, drop marker.
    const quote = trimmed.match(/^>+\s*(.*)$/);
    if (quote) {
      const inner = quote[1].trim();
      if (inner) entries.push(makeItem(inner, false));
      atSectionStart = false;
      continue;
    }

    entries.push(makeItem(trimmed, false));
    atSectionStart = false;
  }

  return entries;
}

/**
 * Convert a rich text note (Tiptap doc) into checklist `entries`.
 *
 *   - Heading                         → section header
 *   - Task item                       → item with its done state
 *   - Bullet / numbered item          → item (unchecked)
 *   - Item of a list nested in a list → indented item
 *   - Any other line                  → item (unchecked)
 *
 * Empty lines are dropped, as in `textToChecklistItems`.
 */
export function richDocToChecklistItems(doc) {
  const entries = [];
  const inlineText = (node) =>
    (node.content || [])
      .map((child) => (child.type === "text" ? child.text : child.type === "hardBreak" ? "\n" : ""))
      .join("");
  const pushLines = (text, indent, done = false) => {
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) entries.push({ ...makeItem(trimmed, done), indent });
    }
  };
  const walk = (nodes, indent) => {
    for (const node of nodes || []) {
      if (node.type === "heading") {
        const title = inlineText(node).replace(/\s+/g, " ").trim();
        if (title) entries.push(makeSection(title));
      } else if (node.type === "paragraph" || node.type === "codeBlock") {
        pushLines(inlineText(node), indent);
      } else if (node.type === "listItem" || node.type === "taskItem") {
        const [first, ...rest] = node.content || [];
        const done = node.type === "taskItem" && !!node.attrs?.checked;
        if (first?.type === "paragraph") pushLines(inlineText(first), indent, done);
        else walk([first], indent);
        walk(rest, 1);
      } else {
        walk(node.content, indent);
      }
    }
  };
  walk(doc?.content, 0);
  return normalizeItems(entries);
}

/**
 * Convert checklist `entries` into a rich text note (Tiptap doc), the
 * inverse of `richDocToChecklistItems`: sections become level-2 headings,
 * items a checkbox list keeping their done state, indented items a list
 * nested in the item above. Empty items are skipped.
 */
export function checklistItemsToRichDoc(entries) {
  const content = [];
  let list = null;
  for (const e of normalizeItems(entries)) {
    if (isSection(e)) {
      const title = e.title.trim();
      if (!title) continue;
      content.push({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: title }] });
      list = null;
      continue;
    }
    const text = e.text.trim();
    if (!text) continue;
    const item = {
      type: "taskItem",
      attrs: { checked: e.done },
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    };
    const parent = list?.content[list.content.length - 1];
    if (e.indent && parent) {
      if (!parent.content[1]) parent.content.push({ type: "taskList", content: [] });
      parent.content[1].content.push(item);
    } else {
      if (!list) {
        list = { type: "taskList", content: [] };
        content.push(list);
      }
      list.content.push(item);
    }
  }
  return content.length ? { type: "doc", content } : emptyRichDoc();
}
