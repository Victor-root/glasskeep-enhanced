// server/ai/noteRetrieval.js
// Retrieval layer for the AI assistant.
//
// Public API:
//   pickRelevantNotes(notes, question, opts)  → [{ note, score, matched, snippet }]
//   buildContextBlock(scored)                  → string (one block per note)
//   detectListIntent(question)                 → boolean
//
// Design goals:
//   - Find the right notes for natural-language queries (FR/EN).
//   - Plural/singular tolerance via a small suffix rewriter (no fuzzy match).
//   - Synonym layer for the most common security/crypto/tech terms.
//   - Multi-field scoring: title ×3, tags ×2, body ×1, with phrase &
//     multi-token bonuses so "wallet crypto" beats "crypto" alone.
//   - IDF with floor (1 + log…) so common words still contribute.
//   - Snippet extraction so the model sees the relevant lines, not the
//     first 2000 chars of every long note.
//
// Anti-hallucination guarantee: if no note scores above zero, returns
// []. Never falls back to "give the model the first N notes".
"use strict";

// ── Stop-words ─────────────────────────────────────────────────────────
// Words too generic to carry meaning. Kept tight on purpose so domain
// terms (project names, "rustdesk", "wireguard", …) survive.
const STOP_WORDS = new Set([
  // English
  "the","is","are","was","were","be","been","being","of","and","or","not",
  "to","in","on","at","for","with","from","by","about","into","over","as",
  "this","that","these","those","there","here","it","its","i","you","he",
  "she","we","they","me","him","her","us","them","my","your","his","our",
  "their","do","does","did","done","have","has","had","can","could","will",
  "would","should","may","might","what","when","where","which","who","why",
  "how","find","search","note","notes","please","tell","show","give","get",
  "want","wants","wanted","need","needs","needed",
  // French
  "le","la","les","un","une","des","du","de","au","aux","et","ou","ne",
  "pas","plus","tres","sur","sous","dans","par","pour","avec","sans","entre",
  "ma","mon","mes","ta","ton","tes","sa","son","ses","notre","votre","leur",
  "leurs","ce","cet","cette","ces","est","sont","ai","as","ont","etait",
  "etaient","ete","fait","faire","faut","ai","si","mais","car","donc","or",
  "que","qui","quoi","dont","ou","comme","tout","tous","toute","toutes",
  "moi","toi","lui","eux","elles","ils","elle","il","on","nous","vous",
  "trouve","trouver","cherche","chercher","montre","montrer","dis","donne",
  "donner","ouvre","ouvrir","quelle","quel","quelles","quels","liste",
  "lister","afficher",
  "je","veux","voudrais","besoin","comment","peux","peut","a",
]);

// ── Synonyms ───────────────────────────────────────────────────────────
// Single-word equivalences. Built as a symmetric map so a query for
// "wallet" expands to "portefeuille" and vice versa. Multi-word terms
// (e.g. "seed phrase") are handled implicitly by phrase bonuses on the
// full normalized question, not here.
const SYNONYM_GROUPS = [
  ["wallet", "portefeuille"],
  ["crypto", "cryptomonnaie", "cryptocurrency"],
  ["seed", "mnemonic", "mnemonique"],
  ["password", "motdepasse", "mdp"],
  ["login", "identifiant"],
  ["address", "adresse"],
  ["server", "serveur"],
  ["key", "cle"],
  ["docker", "container", "conteneur"],
  ["vpn", "tunnel"],
];

const SYNONYMS = (() => {
  const map = new Map();
  for (const group of SYNONYM_GROUPS) {
    for (const word of group) {
      const set = map.get(word) || new Set();
      for (const other of group) if (other !== word) set.add(other);
      map.set(word, set);
    }
  }
  return map;
})();

// ── Normalization helpers ──────────────────────────────────────────────

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip combining diacritics
}

function tokenize(s) {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
}

// Conservative singular/plural expansion. Only ONE rule applies per
// token (else if), so "entries" → {entries, entry} (not also "entrie").
function expandPluralVariants(tok) {
  const v = new Set([tok]);
  if (tok.length > 4 && tok.endsWith("ies")) {
    v.add(tok.slice(0, -3) + "y");        // entries → entry
  } else if (tok.length > 3 && tok.endsWith("s") && !tok.endsWith("ss")) {
    v.add(tok.slice(0, -1));              // wallets → wallet
  }
  return v;
}

// Full variant set for one query token = plural variants of the token
// AND of each of its synonyms. Each synonym also gets its plural pass.
function expandToken(tok) {
  const out = new Set();
  for (const base of expandPluralVariants(tok)) {
    out.add(base);
    const syns = SYNONYMS.get(base);
    if (syns) {
      for (const s of syns) {
        for (const sv of expandPluralVariants(s)) out.add(sv);
      }
    }
  }
  return out;
}

// ── List-intent detection ──────────────────────────────────────────────
// Heuristic for "find/show/list my notes about X" type queries. The
// chat handler uses it to nudge the model toward a list-style reply.
const LIST_INTENT_RE =
  /\b(find|show|list|search|trouve|trouver|montre|montrer|cherche|chercher|liste|lister|affiche|afficher)\b/i;

function detectListIntent(question) {
  const q = String(question || "");
  return LIST_INTENT_RE.test(q);
}

// ── Haystack preparation ───────────────────────────────────────────────

// Tokenize a normalized field into a Set of distinct words. Unlike the
// query-side `tokenize` we keep length-1 entries too — they're harmless
// inside a Set lookup and let exact-match work for very short user
// tokens. Source string is expected to be already normalized.
function fieldTokenize(normStr) {
  return new Set(
    String(normStr || "")
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

function noteToHaystacks(n) {
  const title = String(n?.title || "");
  const content = String(n?.content || "");
  const tagStr = Array.isArray(n?.tags) ? n.tags.map(String).join(" ") : "";
  const titleNorm = normalize(title);
  const tagsNorm = normalize(tagStr);
  const bodyNorm = normalize(content);
  return {
    title: titleNorm,
    tags: tagsNorm,
    body: bodyNorm,
    rawContent: content,
    titleTokenSet: fieldTokenize(titleNorm),
    tagTokenSet: fieldTokenize(tagsNorm),
    bodyTokenSet: fieldTokenize(bodyNorm),
  };
}

// Match strategy depends on variant length. Short variants (≤3 chars
// like "vm", "ssh", "cle", "mdp") use exact token match against a Set,
// otherwise "vm" matches inside "lvm" / "kvm" / "vmware" via substring
// and creates lots of false positives. Longer variants keep substring
// matching so plurals, compound words and inflections still match.
function variantInField(variant, fieldStr, fieldTokenSet) {
  if (!variant) return false;
  if (variant.length <= 3) return fieldTokenSet.has(variant);
  return fieldStr.includes(variant);
}

function countVariantInBody(variant, bodyStr, bodyTokenSet) {
  if (!variant) return 0;
  if (variant.length <= 3) {
    if (!bodyTokenSet.has(variant)) return 0;
    const re = new RegExp(`(?:^|[^a-z0-9])${variant}(?:[^a-z0-9]|$)`, "g");
    const matches = bodyStr.match(re);
    return matches ? matches.length : 0;
  }
  let idx = 0;
  let hits = 0;
  while (true) {
    const found = bodyStr.indexOf(variant, idx);
    if (found === -1) break;
    hits++;
    idx = found + variant.length;
  }
  return hits;
}

// ── Snippet extraction ─────────────────────────────────────────────────
// Two modes:
//   "compact"   — top N short matched lines (good for narrow Q&A).
//   "inventory" — every matched line plus a single-line neighborhood,
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
// could be asking about — wallet lists, credentials, inventories — so
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

// ── Scoring ────────────────────────────────────────────────────────────
// IDF with a floor of 1, so common words still contribute (we never
// want a token to disappear just because half the user's notes contain
// it). Multipliers: title ×3, tags ×2, body ×1 per hit (capped at 5).

function scoreNote(haystacks, queryEntries, normalizedQuestion) {
  let score = 0;
  const matched = new Set();
  let matchedTokenCount = 0;
  let titleMatchCount = 0;
  let tagMatchCount = 0;
  let bodyMatchCount = 0;

  for (const entry of queryEntries) {
    const w = entry.idf;
    const vArr = entry.variantsArr;

    let tokenMatched = false;
    let inTitle = false;
    let inTags = false;
    let inBody = false;

    if (vArr.some((v) => variantInField(v, haystacks.title, haystacks.titleTokenSet))) {
      score += 3 * w;
      matched.add(entry.original);
      tokenMatched = true;
      inTitle = true;
    }
    if (vArr.some((v) => variantInField(v, haystacks.tags, haystacks.tagTokenSet))) {
      score += 2 * w;
      matched.add(entry.original);
      tokenMatched = true;
      inTags = true;
    }

    let bestBodyHits = 0;
    for (const v of vArr) {
      const hits = Math.min(
        countVariantInBody(v, haystacks.body, haystacks.bodyTokenSet),
        5,
      );
      if (hits > bestBodyHits) bestBodyHits = hits;
    }
    if (bestBodyHits > 0) {
      score += bestBodyHits * w;
      matched.add(entry.original);
      tokenMatched = true;
      inBody = true;
    }

    if (tokenMatched) matchedTokenCount++;
    if (inTitle) titleMatchCount++;
    if (inTags) tagMatchCount++;
    if (inBody) bodyMatchCount++;
  }

  // Phrase bonus: full normalized question appears verbatim somewhere.
  if (normalizedQuestion && normalizedQuestion.length >= 4) {
    if (haystacks.title.includes(normalizedQuestion)) score += 5;
    else if (haystacks.body.includes(normalizedQuestion)) score += 3;
    else if (haystacks.tags.includes(normalizedQuestion)) score += 3;
  }

  // Multi-token AND bonus: notes that match more than one query token
  // jump ahead. Without this, "wallet crypto" lets a generic "crypto"
  // note tie a "wallet+crypto" note.
  if (matchedTokenCount >= 2) {
    score *= 1 + 0.35 * (matchedTokenCount - 1);
  }

  return {
    score,
    matched: [...matched],
    matchedTokenCount,
    titleMatchCount,
    tagMatchCount,
    bodyMatchCount,
  };
}

// ── Pruning ────────────────────────────────────────────────────────────
// After scoring we drop the long tail of weak matches before the model
// ever sees them. A note isn't kept just because its score is > 0 —
// that's how 12 unrelated notes used to leak into the context. The top
// note is always kept; everything else has to clear at least one of:
//   - score within a fraction of the top score
//   - matches ≥2 useful tokens AND lands in title or tags
//   - title contains ≥2 useful query tokens
//   - tags contain ≥2 useful query tokens
//   - single-useful-token query with the token in title or tags
// `topIsObvious` means the best note clearly dominates the rest (multi-
// token title hit and ≥1.5× the runner-up); in that case the score-
// ratio threshold tightens so we collapse to just that note.

function pruneScoredNotes(scored, opts = {}) {
  if (!Array.isArray(scored) || scored.length === 0) {
    return { kept: [], dropped: [], topScore: 0, topIsObvious: false };
  }
  const top = scored[0];
  const topScore = top.score;
  const second = scored[1];
  const usefulTokenCount = opts.usefulTokenCount || 0;
  const mode = opts.mode === "inventory" ? "inventory" : "compact";

  const topIsObvious =
    top.matchedTokenCount >= 2 &&
    top.titleMatchCount >= 1 &&
    (!second || topScore >= (second.score || 0) * 1.5);

  let ratioThreshold;
  if (topIsObvious) ratioThreshold = 0.7;
  else if (mode === "inventory") ratioThreshold = 0.3;
  else ratioThreshold = 0.45;

  const minRatioScore = topScore * ratioThreshold;

  const kept = [];
  const dropped = [];

  for (const s of scored) {
    if (s === top) {
      kept.push(s);
      continue;
    }

    const passes = [];
    if (s.score >= minRatioScore) passes.push("score-ratio");
    if (
      s.matchedTokenCount >= 2 &&
      (s.titleMatchCount > 0 || s.tagMatchCount > 0)
    ) {
      passes.push("multi-token-field");
    }
    if (s.titleMatchCount >= 2) passes.push("strong-title");
    if (s.tagMatchCount >= 2) passes.push("strong-tag");
    if (
      usefulTokenCount === 1 &&
      (s.titleMatchCount > 0 || s.tagMatchCount > 0)
    ) {
      passes.push("single-token-field");
    }

    if (passes.length > 0) {
      kept.push(s);
    } else {
      dropped.push({
        id: s.note?.id != null ? String(s.note.id) : "",
        title: String(s.note?.title || "").slice(0, 80),
        score: Number(s.score.toFixed(3)),
        matched: s.matched,
        matchedTokenCount: s.matchedTokenCount,
        titleMatchCount: s.titleMatchCount,
        tagMatchCount: s.tagMatchCount,
        bodyMatchCount: s.bodyMatchCount,
        reason: "weak-match",
      });
    }
  }

  return { kept, dropped, topScore, topIsObvious };
}

// ── Public: pickRelevantNotes ──────────────────────────────────────────

function pickRelevantNotes(notes, question, opts = {}) {
  const limit = opts.limit || 12;
  const mode = opts.mode === "inventory" ? "inventory" : "compact";
  const perNoteMaxChars = opts.perNoteMaxChars;
  const metricsOut = opts.metricsOut && typeof opts.metricsOut === "object"
    ? opts.metricsOut
    : null;
  if (!Array.isArray(notes) || notes.length === 0) return [];

  const rawTokens = Array.from(new Set(tokenize(question)));
  const tokens = rawTokens.filter((t) => !STOP_WORDS.has(t));
  // If the question is only stopwords (e.g. "que faire ?"), no
  // meaningful retrieval is possible — caller short-circuits.
  // Falling back to the raw tokens here would substring-match generic
  // glue words like "que" inside real words ("mnemonique") and surface
  // arbitrary notes; that's exactly the hallucination vector we close.
  if (tokens.length === 0) return [];

  // Build query entries with their full variant sets.
  const queryEntries = tokens.map((tok) => {
    const variants = expandToken(tok);
    return {
      original: tok,
      variants,
      variantsArr: [...variants],
      idf: 0,
    };
  });

  // Materialize note haystacks once.
  const docs = [];
  for (const n of notes) {
    if (!n) continue;
    const hay = noteToHaystacks(n);
    if (!hay.title.trim() && !hay.body.trim() && !hay.tags.trim()) continue;
    docs.push({ note: n, hay });
  }
  if (docs.length === 0) return [];

  // IDF: doc frequency = docs where ANY variant is present in any field.
  // Floor of 1 keeps common words contributing to the score (no tower).
  // Uses the same length-aware matching as scoring so short tokens
  // don't inflate df via false-positive substring hits.
  const N = docs.length;
  for (const entry of queryEntries) {
    let dfCount = 0;
    for (const d of docs) {
      const present = entry.variantsArr.some(
        (v) =>
          variantInField(v, d.hay.title, d.hay.titleTokenSet) ||
          variantInField(v, d.hay.tags, d.hay.tagTokenSet) ||
          variantInField(v, d.hay.body, d.hay.bodyTokenSet),
      );
      if (present) dfCount++;
    }
    entry.idf = 1 + Math.log((N + 1) / (dfCount + 1));
  }

  const normalizedQuestion = normalize(question).trim();
  const scored = [];
  for (const d of docs) {
    const result = scoreNote(d.hay, queryEntries, normalizedQuestion);
    if (result.score > 0) {
      scored.push({
        note: d.note,
        hay: d.hay,
        score: result.score,
        matched: result.matched,
        matchedTokenCount: result.matchedTokenCount,
        titleMatchCount: result.titleMatchCount,
        tagMatchCount: result.tagMatchCount,
        bodyMatchCount: result.bodyMatchCount,
      });
    }
  }
  if (scored.length === 0) {
    if (metricsOut) {
      metricsOut.beforePruningCount = 0;
      metricsOut.afterPruningCount = 0;
      metricsOut.topScore = 0;
      metricsOut.topIsObvious = false;
      metricsOut.dropped = [];
      metricsOut.usefulTokenCount = tokens.length;
    }
    return [];
  }

  scored.sort((a, b) => b.score - a.score);

  // Prune the long tail of weak matches.
  const { kept, dropped, topScore, topIsObvious } = pruneScoredNotes(scored, {
    mode,
    usefulTokenCount: tokens.length,
  });

  if (metricsOut) {
    metricsOut.beforePruningCount = scored.length;
    metricsOut.afterPruningCount = kept.length;
    metricsOut.topScore = topScore;
    metricsOut.topIsObvious = topIsObvious;
    metricsOut.dropped = dropped;
    metricsOut.usefulTokenCount = tokens.length;
  }

  if (kept.length === 0) return [];

  // Compute snippets only for the top-K we'll actually return.
  const top = kept.slice(0, limit);
  const allVariants = new Set();
  for (const e of queryEntries) for (const v of e.variantsArr) allVariants.add(v);

  // Per-note budget defaults: compact mode keeps the old 1.2 KB cap so
  // narrow Q&A doesn't bloat the prompt; inventory mode opens it up to
  // 8 KB so long inventory notes (lists of wallets, credentials, …)
  // fit whole — the model needs the full content to enumerate every
  // entry, snippets defeat the purpose of an inventory query.
  const noteCap =
    typeof perNoteMaxChars === "number"
      ? perNoteMaxChars
      : mode === "inventory"
      ? 8000
      : 1200;
  const snippetOpts = { mode, maxChars: noteCap };

  return top.map((s) => ({
    note: s.note,
    score: s.score,
    matched: s.matched,
    matchedTokenCount: s.matchedTokenCount,
    titleMatchCount: s.titleMatchCount,
    tagMatchCount: s.tagMatchCount,
    bodyMatchCount: s.bodyMatchCount,
    snippet: extractSnippets(s.hay.rawContent, allVariants, snippetOpts).join(
      "\n",
    ),
    mode,
  }));
}

// ── Public: buildContextBlock ──────────────────────────────────────────
// Renders a single picked note as a structured block the model can read.
// Intentionally compact — no full bodies, only matched snippets.

function buildContextBlock(picked, opts = {}) {
  const { note, matched, snippet, mode: pickedMode } = picked || {};
  const mode = opts.mode || pickedMode || "compact";
  const id = String(note?.id || "");
  const title = String(note?.title || "");
  const tags =
    Array.isArray(note?.tags) && note.tags.length > 0
      ? note.tags.map(String).join(", ")
      : null;
  const matchedStr = matched && matched.length > 0 ? matched.join(", ") : null;
  // Block label flips to CONTENT in inventory mode so the model treats
  // it as the relevant excerpt of the note rather than a "snippet" hint.
  const bodyLabel = mode === "inventory" ? "CONTENT" : "SNIPPET";
  // Cap is just a safety net here — the snippet was already trimmed by
  // the retriever to the per-note budget that matches `mode`.
  const cap = mode === "inventory" ? 8000 : 1200;

  const lines = [`[${id}] TITLE: ${title}`];
  if (tags) lines.push(`TAGS: ${tags}`);
  if (matchedStr) lines.push(`MATCHED: ${matchedStr}`);
  if (snippet && snippet.trim()) {
    lines.push(`${bodyLabel}:`);
    lines.push(snippet.trim().slice(0, cap));
  }
  return lines.join("\n");
}

// ── Optional debug ─────────────────────────────────────────────────────
// Activated by AI_RETRIEVAL_DEBUG=true. Logs only metadata — never note
// content, never API keys, never the prompt itself.
function debugRetrieval({ question, totalNotes, tokens, picked }) {
  if (process.env.AI_RETRIEVAL_DEBUG !== "true") return;
  const summary = picked.map((p) => ({
    id: p.note?.id,
    title: String(p.note?.title || "").slice(0, 60),
    score: Number(p.score.toFixed(3)),
    matched: p.matched,
  }));
  // eslint-disable-next-line no-console
  console.log("[ai-retrieval]", {
    questionLength: String(question || "").length,
    totalNotes,
    tokens,
    pickedCount: picked.length,
    picked: summary,
  });
}

module.exports = {
  pickRelevantNotes,
  buildContextBlock,
  detectListIntent,
  debugRetrieval,
  // Exported for tests only.
  __internals: {
    normalize,
    tokenize,
    expandPluralVariants,
    expandToken,
    extractSnippets,
    pruneScoredNotes,
    variantInField,
    countVariantInBody,
    STOP_WORDS,
    SYNONYMS,
  },
};
