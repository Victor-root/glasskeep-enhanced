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
//
// The vocabulary and text matching live in retrievalText.js, the snippet
// extraction in snippets.js.
"use strict";

const {
  STOP_WORDS,
  WEAK_TOKENS,
  SYNONYMS,
  normalize,
  tokenize,
  expandPluralVariants,
  expandToken,
  variantInField,
  countVariantInBody,
} = require("./retrievalText");
const { extractSnippets } = require("./snippets");

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

// ── Scoring ────────────────────────────────────────────────────────────
// IDF with a floor of 1, so common words still contribute (we never
// want a token to disappear just because half the user's notes contain
// it). Multipliers: title ×3, tags ×2, body ×1 per hit (capped at 5).

function scoreNote(haystacks, queryEntries, normalizedQuestion) {
  let score = 0;
  const matched = new Set();
  let matchedTokenCount = 0;
  let matchedAnchorCount = 0;
  let matchedWeakCount = 0;
  const matchedAnchors = [];
  const matchedWeakTokens = [];
  let titleMatchCount = 0;
  let tagMatchCount = 0;
  let bodyMatchCount = 0;
  let titleAnchorMatchCount = 0;

  for (const entry of queryEntries) {
    // Weak tokens help rank notes that already match the real subject,
    // but they contribute at 25 % weight so a note can't float to the
    // top by matching only "config" or "installation".
    const w = entry.isWeak ? entry.idf * 0.25 : entry.idf;
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

    // Body repetition capped at 2 (was 5) so a note with many keyword
    // occurrences in its body can't outrank a note that names the subject
    // directly in its title.
    let bestBodyHits = 0;
    for (const v of vArr) {
      const hits = Math.min(
        countVariantInBody(v, haystacks.body, haystacks.bodyTokenSet),
        2,
      );
      if (hits > bestBodyHits) bestBodyHits = hits;
    }
    if (bestBodyHits > 0) {
      score += bestBodyHits * w;
      matched.add(entry.original);
      tokenMatched = true;
      inBody = true;
    }

    if (tokenMatched) {
      matchedTokenCount++;
      if (entry.isWeak) {
        matchedWeakCount++;
        matchedWeakTokens.push(entry.original);
      } else {
        matchedAnchorCount++;
        matchedAnchors.push(entry.original);
      }
    }
    if (inTitle) {
      titleMatchCount++;
      if (!entry.isWeak) titleAnchorMatchCount++;
    }
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
    matchedAnchorCount,
    matchedWeakCount,
    matchedAnchors,
    matchedWeakTokens,
    titleMatchCount,
    tagMatchCount,
    bodyMatchCount,
    titleAnchorMatchCount,
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

function makeDropEntry(s, reason) {
  return {
    id: s.note?.id != null ? String(s.note.id) : "",
    title: String(s.note?.title || "").slice(0, 80),
    score: Number(s.score.toFixed(3)),
    matched: s.matched,
    matchedAnchorCount: s.matchedAnchorCount,
    matchedWeakCount: s.matchedWeakCount,
    matchedAnchors: s.matchedAnchors || [],
    matchedWeakTokens: s.matchedWeakTokens || [],
    anchorCoverage: Number((s.anchorCoverage || 0).toFixed(3)),
    rareAnchorCoverage: Number((s.rareAnchorCoverage || 0).toFixed(3)),
    reason,
  };
}

function pruneScoredNotes(scored, opts = {}) {
  if (!Array.isArray(scored) || scored.length === 0) {
    return { kept: [], dropped: [], topScore: 0, topIsObvious: false };
  }

  const hasAnchors = opts.hasAnchors || false;
  const usefulTokenCount = opts.usefulTokenCount || 0;
  const mode = opts.mode === "inventory" ? "inventory" : "compact";
  const dropped = [];

  // ── Phase 1: anchor gate ─────────────────────────────────────────────
  // When the query has at least one anchor token (not in WEAK_TOKENS),
  // notes that only matched generic/weak tokens ("config", "setup", …)
  // are discarded before score-ratio pruning. A note about "STORJ
  // NODES CONFIG" must not appear for "config jellyfin" just because
  // it has the word "config". This gate applies to every note including
  // the top scorer — if no note matches an anchor, we return [] so the
  // caller can skip the model call.
  let pool;
  if (hasAnchors) {
    pool = [];
    for (const s of scored) {
      if (s.matchedAnchorCount > 0) {
        pool.push(s);
      } else {
        dropped.push(makeDropEntry(s, "weak-only-match"));
      }
    }
    if (pool.length === 0) {
      return { kept: [], dropped, topScore: 0, topIsObvious: false };
    }
  } else {
    pool = scored;
  }

  // ── Phase 2: score-ratio pruning ─────────────────────────────────────
  const top = pool[0];
  const topScore = top.score;
  const second = pool[1];

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

  for (const s of pool) {
    if (s === top) {
      kept.push(s);
      continue;
    }

    const passes = [];
    if (s.score >= minRatioScore) passes.push("score-ratio");
    // When topIsObvious the dominant note already has a multi-token title
    // hit and 1.5× the runner-up — field-strength overrides would let a
    // weak second note sneak through despite a clearly superior top note.
    // Restrict to score-ratio only so "topIsObvious" actually collapses
    // the result to a single answer.
    if (!topIsObvious) {
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
    }

    if (passes.length > 0) {
      kept.push(s);
    } else {
      dropped.push(makeDropEntry(s, "weak-match"));
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
  // isWeak: token is in WEAK_TOKENS (generic label like "config",
  // "installation", "tuto"). Weak tokens score at 25 % and, when the
  // query also has anchor tokens, cannot alone keep a note in context.
  const queryEntries = tokens.map((tok) => {
    const variants = expandToken(tok);
    return {
      original: tok,
      variants,
      variantsArr: [...variants],
      idf: 0,
      isWeak: WEAK_TOKENS.has(tok),
    };
  });

  const anchorTokens = queryEntries.filter((e) => !e.isWeak).map((e) => e.original);
  const weakQueryTokens = queryEntries.filter((e) => e.isWeak).map((e) => e.original);
  const hasAnchors = anchorTokens.length > 0;

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
        matchedAnchorCount: result.matchedAnchorCount,
        matchedWeakCount: result.matchedWeakCount,
        matchedAnchors: result.matchedAnchors,
        matchedWeakTokens: result.matchedWeakTokens,
        titleMatchCount: result.titleMatchCount,
        tagMatchCount: result.tagMatchCount,
        bodyMatchCount: result.bodyMatchCount,
        titleAnchorMatchCount: result.titleAnchorMatchCount || 0,
        anchorCoverage: 0,
        rareAnchorCoverage: 0,
        rareAnchorPenalty: false,
      });
    }
  }

  // Identify rarest anchor token(s) by IDF (highest IDF = least common
  // in corpus = most discriminating signal). Used in Phase 1.5 pruning.
  const anchorCount = anchorTokens.length;
  const anchorEntries = queryEntries.filter((e) => !e.isWeak);
  let rareAnchorTokens = [];
  if (anchorEntries.length > 0) {
    const sortedByIdf = [...anchorEntries].sort((a, b) => b.idf - a.idf);
    const topIdf = sortedByIdf[0].idf;
    rareAnchorTokens = sortedByIdf
      .filter((e) => e.idf >= topIdf * 0.9)
      .map((e) => e.original);
  }

  const baseMetrics = {
    queryTokens: tokens,
    anchorTokens,
    weakQueryTokens,
    hasAnchors,
    rareAnchorTokens,
    usefulTokenCount: tokens.length,
  };

  if (scored.length === 0) {
    if (metricsOut) {
      Object.assign(metricsOut, baseMetrics, {
        beforePruningCount: 0,
        afterPruningCount: 0,
        topScore: 0,
        topIsObvious: false,
        dropped: [],
      });
    }
    return [];
  }

  // Apply per-note bonuses based on anchor coverage and title anchor hits.
  // These run after IDF is known so the multipliers are data-driven.
  for (const s of scored) {
    const cov = anchorCount > 0 ? s.matchedAnchorCount / anchorCount : 0;
    const rareMatches = rareAnchorTokens.filter(
      (tok) => s.matchedAnchors.includes(tok),
    ).length;
    const rareCov =
      rareAnchorTokens.length > 0
        ? rareMatches / rareAnchorTokens.length
        : 0;
    s.anchorCoverage = cov;
    s.rareAnchorCoverage = rareCov;

    // Proportional bonus for covering more of the query's anchor tokens.
    if (anchorCount > 0 && cov > 0) s.score *= 1 + 0.4 * cov;

    // Title multi-anchor bonus: note whose title directly names both
    // the action and subject beats one that only mentions them in the body.
    if (s.titleAnchorMatchCount >= 2) {
      const allInTitle =
        anchorCount >= 2 && s.titleAnchorMatchCount >= anchorCount;
      s.score *= allInTitle ? 1.8 : 1.5;
    }
  }

  // Phase 1.5: rare-anchor filtering.
  // When the rarest (highest-IDF) anchor appears in at least one note,
  // notes that miss it receive one of two outcomes:
  //   • hard drop  — note has no strong coverage of the remaining query
  //                  (e.g. config-only note for "config jellyfin")
  //   • score ×0.75 — note already matches ≥2 anchors, or has a title
  //                   hit + some anchor match, or ≥67 % anchor coverage.
  //                   Keeps "clé github access token" alive for the query
  //                   "clé api github" even though "api" is absent, because
  //                   the note matches the two other meaningful anchors.
  const phase15Dropped = [];
  let scoredPool = scored;
  if (rareAnchorTokens.length > 0) {
    const anyMatchesRare = scored.some((s) => s.rareAnchorCoverage > 0);
    if (anyMatchesRare) {
      scoredPool = [];
      for (const s of scored) {
        if (s.rareAnchorCoverage > 0) {
          scoredPool.push(s);
        } else {
          // A note that matches multiple anchor tokens or has the subject
          // in its title is still a strong candidate — penalise but keep.
          const hasStrongFallback =
            s.matchedAnchorCount >= 2 ||
            (s.titleMatchCount >= 1 && s.matchedAnchorCount >= 1) ||
            s.anchorCoverage >= 0.67;
          if (hasStrongFallback) {
            s.score *= 0.75;
            s.rareAnchorPenalty = true;
            scoredPool.push(s);
          } else {
            phase15Dropped.push(makeDropEntry(s, "rare-anchor-miss"));
          }
        }
      }
    }
  }

  scoredPool.sort((a, b) => b.score - a.score);

  // Prune: Phase 1 = anchor gate (drop notes with no anchor match when
  // query has anchors). Phase 2 = score-ratio / field-strength gate.
  const { kept, dropped: phase2Dropped, topScore, topIsObvious } = pruneScoredNotes(scoredPool, {
    mode,
    usefulTokenCount: tokens.length,
    hasAnchors,
  });

  const allDropped = [...phase15Dropped, ...phase2Dropped];

  if (metricsOut) {
    Object.assign(metricsOut, baseMetrics, {
      beforePruningCount: scored.length,
      afterPruningCount: kept.length,
      topScore,
      topIsObvious,
      dropped: allDropped,
    });
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
    matchedAnchorCount: s.matchedAnchorCount,
    matchedWeakCount: s.matchedWeakCount,
    matchedAnchors: s.matchedAnchors,
    matchedWeakTokens: s.matchedWeakTokens,
    titleMatchCount: s.titleMatchCount,
    tagMatchCount: s.tagMatchCount,
    bodyMatchCount: s.bodyMatchCount,
    titleAnchorMatchCount: s.titleAnchorMatchCount || 0,
    anchorCoverage: s.anchorCoverage || 0,
    rareAnchorCoverage: s.rareAnchorCoverage || 0,
    rareAnchorPenalty: s.rareAnchorPenalty || false,
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
    WEAK_TOKENS,
    SYNONYMS,
  },
};
