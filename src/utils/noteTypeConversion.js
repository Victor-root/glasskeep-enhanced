import { makeItem, makeSection } from "./checklist.js";

const CHECKED_LINE_RE = /^\s*[-*]\s+\[(x|X| )\]\s*(.*)$/;
const BULLET_LINE_RE = /^\s*[-*]\s+(.*)$/;
const HEADING_LINE_RE = /^\s*#{1,6}\s+(.*)$/;

export function textToChecklistItems(textContent) {
  if (typeof textContent !== "string" || !textContent.trim()) return [];

  const lines = textContent.replace(/\r\n/g, "\n").split("\n");
  const items = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const headingMatch = line.match(HEADING_LINE_RE);
    if (headingMatch) {
      items.push(makeSection(headingMatch[1]?.trim() || ""));
      continue;
    }

    const checkedMatch = line.match(CHECKED_LINE_RE);
    if (checkedMatch) {
      const done = checkedMatch[1].toLowerCase() === "x";
      items.push(makeItem(checkedMatch[2] || "", done));
      continue;
    }

    const bulletMatch = line.match(BULLET_LINE_RE);
    if (bulletMatch) {
      items.push(makeItem(bulletMatch[1] || "", false));
      continue;
    }

    items.push(makeItem(line, false));
  }

  return items;
}

export function checklistItemsToText(items) {
  if (!Array.isArray(items) || items.length === 0) return "";

  return items
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      if (entry.kind === "section") {
        return `## ${typeof entry.title === "string" ? entry.title : ""}`.trimEnd();
      }
      const text = typeof entry.text === "string" ? entry.text : "";
      return `- [${entry.done ? "x" : " "}] ${text}`.trimEnd();
    })
    .filter(Boolean)
    .join("\n");
}
