import {
  isItem,
  isSection,
  makeItem,
  makeSection,
  normalizeItems,
} from "./checklist.js";

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
 *
 * Empty input returns an empty array — caller decides whether to keep
 * the note empty or seed a blank item.
 */
export function textToChecklistItems(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const lines = text.split(/\r?\n/);
  const entries = [];

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Markdown heading → section marker.
    const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      entries.push(makeSection(heading[1].trim()));
      continue;
    }

    // Task list item — `- [ ] foo`, `* [x] bar`, `+ [X] baz`.
    const task = trimmed.match(/^[-*+]\s+\[([ xX])\]\s*(.*)$/);
    if (task) {
      entries.push(makeItem(task[2].trim(), task[1].toLowerCase() === "x"));
      continue;
    }

    // Bullet list — `- foo`, `* foo`, `+ foo`.
    const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      entries.push(makeItem(bullet[1].trim(), false));
      continue;
    }

    // Ordered list — `1. foo`, `2) bar`.
    const ordered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (ordered) {
      entries.push(makeItem(ordered[1].trim(), false));
      continue;
    }

    // Blockquote — keep text, drop marker.
    const quote = trimmed.match(/^>+\s*(.*)$/);
    if (quote) {
      const inner = quote[1].trim();
      if (inner) entries.push(makeItem(inner, false));
      continue;
    }

    entries.push(makeItem(trimmed, false));
  }

  return entries;
}

/**
 * Convert a checklist `entries` array back to a markdown-like text body.
 * Round-trips with `textToChecklistItems` (items re-parse to the same
 * done state).
 *
 *   - Section header            → `## Title`
 *   - Checked item              → `- [x] text`
 *   - Unchecked item            → `- [ ] text`
 *
 * Empty items are skipped so the resulting text stays clean.
 */
export function checklistItemsToText(entries) {
  const items = normalizeItems(entries);
  if (items.length === 0) return "";

  const lines = [];
  for (const e of items) {
    if (isSection(e)) {
      const title = (e.title || "").trim();
      if (!title) continue;
      if (lines.length && lines[lines.length - 1] !== "") lines.push("");
      lines.push(`## ${title}`);
      continue;
    }
    if (isItem(e)) {
      const txt = (e.text || "").trim();
      if (!txt) continue;
      lines.push(`- [${e.done ? "x" : " "}] ${txt}`);
    }
  }

  return lines.join("\n");
}
