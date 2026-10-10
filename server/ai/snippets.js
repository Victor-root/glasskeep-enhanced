// server/ai/snippets.js
// What the AI sees of a picked note (see noteRetrieval.js): the matched
// lines in compact mode, the whole body (or its matched paragraphs) in
// inventory mode.
"use strict";

const { normalize } = require("./retrievalText");

// ── Snippet extraction ─────────────────────────────────────────────────
// Two modes:
//   "compact"   : top N short matched lines (good for narrow Q&A).
//   "inventory" : every matched line plus a single-line neighborhood,
//                 capped at maxChars. Used when the user asks for a
//                 list/inventory ("liste mes wallets", "show all
//                 my crypto wallets") and the model needs to extract
//                 every relevant entry, not just a few examples.
function extractSnippets(rawContent, allVariants, opts = {}) {
  const mode = opts.mode === "inventory" ? "inventory" : "compact";
  const content = String(rawContent || "");
  if (!content.trim()) return [];

  if (mode === "inventory") {
    return extractInventory(content, allVariants, opts);
  }
  return extractCompact(content, allVariants, opts);
}

function extractCompact(content, allVariants, opts) {
  const maxSnippets = opts.maxSnippets || 3;
  const radius = opts.radius || 140;
  const headFallback = opts.headFallback || 320;

  const lines = content.split(/\r?\n/);
  const scored = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const norm = normalize(line);
    if (!norm.trim()) continue;
    let hits = 0;
    for (const v of allVariants) if (v && norm.includes(v)) hits++;
    if (hits > 0) scored.push({ idx: i, line, hits });
  }

  if (scored.length === 0) {
    const head = content.slice(0, headFallback).trim();
    return head ? [head] : [];
  }

  scored.sort((a, b) => b.hits - a.hits || a.idx - b.idx);
  const picked = scored.slice(0, maxSnippets);
  picked.sort((a, b) => a.idx - b.idx);

  return picked.map(({ line }) => {
    const trimmed = line.trim();
    return trimmed.length > radius * 2
      ? trimmed.slice(0, radius * 2) + "…"
      : trimmed;
  });
}

// Inventory mode: send the full content of the matched note. The whole
// point of this mode is to let the model see every entry the user
// could be asking about (wallet lists, credentials, inventories), so
// snippet/block extraction would defeat the purpose. Truncation only
// happens when the note is genuinely larger than the per-note budget,
// and even then we prefer block-based fallback over a hard mid-sentence
// cut so the relevant zones survive.
function extractInventory(content, allVariants, opts) {
  const maxChars = opts.maxChars || 8000;
  const trimmed = String(content || "").trim();
  if (!trimmed) return [];

  // The note fits whole → send the entire body, no editing.
  if (trimmed.length <= maxChars) return [trimmed];

  // Note is too long: fall back to block-aware truncation. Keep every
  // paragraph (blank-line-separated block) that contains a matched
  // line. Better than slicing the middle of a wallet entry.
  const lines = trimmed.split(/\r?\n/);
  const blocks = []; // { start, end, lines, hasMatch }
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const blank = !lines[i].trim();
    if (blank) {
      if (cur) {
        blocks.push(cur);
        cur = null;
      }
    } else {
      if (!cur) cur = { start: i, end: i, lines: [], hasMatch: false };
      cur.end = i;
      cur.lines.push(lines[i]);
      const norm = normalize(lines[i]);
      for (const v of allVariants) {
        if (v && norm.includes(v)) {
          cur.hasMatch = true;
          break;
        }
      }
    }
  }
  if (cur) blocks.push(cur);

  const matchedBlocks = blocks.filter((b) => b.hasMatch);
  if (matchedBlocks.length === 0) {
    return [trimmed.slice(0, maxChars).replace(/\s+\S*$/, "") + "…"];
  }

  const out = [];
  let prevEnd = -2;
  for (const b of matchedBlocks) {
    if (b.start > prevEnd + 1 && out.length > 0) out.push("…");
    out.push(b.lines.join("\n"));
    prevEnd = b.end;
  }

  let joined = out.join("\n");
  if (joined.length > maxChars) {
    joined = joined.slice(0, maxChars).replace(/\s+\S*$/, "") + "…";
  }
  return [joined];
}

module.exports = { extractSnippets };
