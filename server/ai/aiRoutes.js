// server/ai/aiRoutes.js
// Express routes for the OpenAI-compatible AI integration.
//
// Three surfaces:
//   - /api/admin/ai/* — admin-only configuration and connectivity test.
//   - /api/user/ai/*  — per-user preferences (mode + optional custom config).
//   - /api/ai/chat    — chat endpoint, resolves to admin or user config.
//
// Neither admin nor user API keys are ever returned in plain form. The
// admin UI exposes `hasApiKey`, the user UI exposes its own `hasApiKey`,
// and the chat endpoint never echoes either back.

const aiSettings = require("./aiSettings");
const provider = require("./openaiCompatibleProvider");
const { t } = require("../i18n");

// Generic words that match in almost every note and would otherwise
// dominate the score. Mostly French + English filler — keep tight on
// purpose so domain words ("rustdesk", "wireguard", …) survive.
const STOP_WORDS = new Set([
  // English
  "the","is","are","was","were","be","been","being","of","and","or","not",
  "to","in","on","at","for","with","from","by","about","into","over","as",
  "this","that","these","those","there","here","it","its","i","you","he",
  "she","we","they","me","him","her","us","them","my","your","his","our",
  "their","do","does","did","done","have","has","had","can","could","will",
  "would","should","may","might","what","when","where","which","who","why",
  "how","find","search","note","notes","please","tell","show","give","get",
  // French
  "le","la","les","un","une","des","du","de","au","aux","et","ou","ne",
  "pas","plus","tres","sur","sous","dans","par","pour","avec","sans","entre",
  "ma","mon","mes","ta","ton","tes","sa","son","ses","notre","votre","leur",
  "leurs","ce","cet","cette","ces","est","sont","ai","as","ont","etait",
  "etaient","ete","fait","faire","faut","ai","si","mais","car","donc","or",
  "que","qui","quoi","dont","ou","comme","tout","tous","toute","toutes",
  "moi","toi","lui","eux","elles","ils","elle","il","on","nous","vous",
  "trouve","trouver","cherche","chercher","montre","montrer","dis","donne",
  "donner","ouvre","ouvrir","quelle","quel","quelles","quels",
]);

// Tokenize a string into searchable lowercase tokens (≥ 2 chars).
function tokenize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
}

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Score notes against the question's tokens, with stop-word filtering
// and per-token IDF weighting so a generic word that matches every
// note ("note", "le", …) doesn't drown the rare, informative ones
// (project names, identifiers). Title matches still get a small
// boost over body matches.
function pickRelevantNotes(notes, question, limit) {
  if (!Array.isArray(notes) || notes.length === 0) return [];

  const rawTokens = Array.from(new Set(tokenize(question)));
  const queryTokens = rawTokens.filter((t) => !STOP_WORDS.has(t));
  // If everything was filtered out (very short generic question), fall
  // back to the unfiltered set so we still pick *something* relevant.
  const tokens = queryTokens.length > 0 ? queryTokens : rawTokens;
  // No usable tokens at all → caller will short-circuit with the
  // localized "no relevant notes" reply rather than dumping arbitrary
  // notes into the model's context (which led to hallucinated answers).
  if (tokens.length === 0) return [];

  // Pre-normalize each note's haystacks once.
  const docs = [];
  for (const n of notes) {
    if (!n) continue;
    const title = String(n.title || "");
    const content = String(n.content || "");
    if (!title.trim() && !content.trim()) continue;
    docs.push({
      note: n,
      hayTitle: normalize(title),
      hayBody: normalize(content),
    });
  }
  if (docs.length === 0) return [];

  // Document frequency per token (any occurrence in title or body counts).
  const N = docs.length;
  const df = new Map();
  for (const tok of tokens) {
    let count = 0;
    for (const d of docs) {
      if (d.hayTitle.includes(tok) || d.hayBody.includes(tok)) count += 1;
    }
    df.set(tok, count);
  }

  // Weight rare tokens much more than common ones (classic IDF).
  // log((N+1)/(df+1)) keeps the value positive and ≈ 0 when the token
  // is in nearly every note (e.g. "note" itself).
  const idf = new Map();
  for (const tok of tokens) {
    idf.set(tok, Math.log((N + 1) / ((df.get(tok) || 0) + 1)));
  }

  const scored = [];
  for (const d of docs) {
    let score = 0;
    for (const tok of tokens) {
      const w = idf.get(tok) || 0;
      if (w <= 0) continue;
      if (d.hayTitle.includes(tok)) score += 3 * w;
      let idx = 0;
      let hits = 0;
      while (hits < 5) {
        const found = d.hayBody.indexOf(tok, idx);
        if (found === -1) break;
        hits += 1;
        idx = found + tok.length;
      }
      score += hits * w;
    }
    if (score > 0) scored.push({ note: d.note, score });
  }

  if (scored.length > 0) {
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.note);
  }

  // No note actually matched the (filtered) tokens. Returning [] makes
  // the chat handler short-circuit with the localized "not found"
  // reply — never feed arbitrary notes to the model, which would let
  // it answer from external knowledge or hallucinate.
  return [];
}

function buildOverride(saved, body) {
  const cfg = {
    enabled: true,
    provider: aiSettings.PROVIDER_OPENAI_COMPATIBLE,
    baseUrl:
      typeof body.baseUrl === "string" ? body.baseUrl.trim() : saved.baseUrl,
    model: typeof body.model === "string" ? body.model.trim() : saved.model,
    apiKey:
      typeof body.apiKey === "string" ? body.apiKey.trim() : saved.apiKey,
    temperature:
      typeof body.temperature === "number"
        ? body.temperature
        : saved.temperature,
    maxTokens:
      typeof body.maxTokens === "number" ? body.maxTokens : saved.maxTokens,
  };
  return cfg;
}

function buildSystemPrompt(lang, context) {
  const base = t(lang, "aiSystemPromptBase");
  const label = t(lang, "aiSystemPromptContextLabel");
  const noCtx = t(lang, "aiSystemPromptNoContext");
  return context
    ? `${base}\n\n${label}:\n${context}`
    : `${base}\n\n${label}: ${noCtx}`;
}

function attachAiRoutes(app, { db, auth, adminOnly }) {
  aiSettings.ensureSchema(db);

  // ── Admin: read current settings (no API key in payload) ────────────
  app.get("/api/admin/ai/settings", auth, adminOnly, (_req, res) => {
    try {
      res.json(aiSettings.getAdminPublicConfig(db));
    } catch (err) {
      console.error("[ai] failed to read admin settings:", err?.message);
      res.status(500).json({ error: "Failed to read AI settings." });
    }
  });

  // ── Admin: update settings ─────────────────────────────────────────
  app.put("/api/admin/ai/settings", auth, adminOnly, (req, res) => {
    try {
      const {
        enabled,
        baseUrl,
        model,
        temperature,
        maxTokens,
        apiKey,
        allowServerAiForUsers,
      } = req.body || {};
      const updated = aiSettings.updateAdminConfig(db, {
        enabled,
        baseUrl,
        model,
        temperature,
        maxTokens,
        apiKey,
        allowServerAiForUsers,
      });
      res.json(updated);
    } catch (err) {
      console.error("[ai] failed to update admin settings:", err?.message);
      res.status(500).json({ error: "Failed to update AI settings." });
    }
  });

  // ── Admin: test the configured (or override) provider ──────────────
  app.post("/api/admin/ai/test", auth, adminOnly, async (req, res) => {
    try {
      const saved = aiSettings.getAdminConfig(db);
      const cfg = buildOverride(saved, req.body || {});
      const result = await provider.testConnection(cfg);
      res.json({
        ok: true,
        reply: (result.content || "").trim().slice(0, 200),
      });
    } catch (err) {
      const status = err instanceof provider.AIProviderError ? err.status : 500;
      const message = err?.message || "AI test failed.";
      console.warn("[ai] admin test failed:", message);
      res.status(status).json({ ok: false, error: message });
    }
  });

  // ── User: read own settings ────────────────────────────────────────
  app.get("/api/user/ai/settings", auth, (req, res) => {
    try {
      res.json(aiSettings.getUserPublicConfig(db, req.user.id));
    } catch (err) {
      console.error("[ai] failed to read user settings:", err?.message);
      res.status(500).json({ error: "Failed to read AI settings." });
    }
  });

  // ── User: update own settings ──────────────────────────────────────
  // Same apiKey semantics as the admin route (omitted/keep, ""/clear,
  // value/replace).
  app.put("/api/user/ai/settings", auth, (req, res) => {
    try {
      const { enabled, mode, baseUrl, model, temperature, maxTokens, apiKey } =
        req.body || {};
      const updated = aiSettings.updateUserConfig(db, req.user.id, {
        enabled,
        mode,
        baseUrl,
        model,
        temperature,
        maxTokens,
        apiKey,
      });
      res.json(updated);
    } catch (err) {
      console.error("[ai] failed to update user settings:", err?.message);
      res.status(500).json({ error: "Failed to update AI settings." });
    }
  });

  // ── User: test their effective (or override) config ────────────────
  // Body fields:
  //   mode: "server" | "custom" — override the saved mode for this test
  //   baseUrl, model, apiKey, temperature, maxTokens — custom-mode overrides
  // When mode is "server", the admin config is used (and the user must
  // have permission). When omitted, falls back to the user's saved
  // config — which itself goes through resolveEffectiveConfig and its
  // permission checks.
  app.post("/api/user/ai/test", auth, async (req, res) => {
    try {
      const body = req.body || {};
      const requestedMode =
        body.mode === "server" || body.mode === "custom" ? body.mode : null;

      let cfg;
      if (requestedMode === "server") {
        const adminCfg = aiSettings.getAdminConfig(db);
        if (
          !adminCfg.enabled ||
          !adminCfg.allowServerAiForUsers ||
          !adminCfg.baseUrl ||
          !adminCfg.model
        ) {
          return res
            .status(503)
            .json({ ok: false, error: "Server AI is not available." });
        }
        cfg = {
          enabled: true,
          provider: aiSettings.PROVIDER_OPENAI_COMPATIBLE,
          baseUrl: adminCfg.baseUrl,
          apiKey: adminCfg.apiKey,
          model: adminCfg.model,
          temperature: adminCfg.temperature,
          maxTokens: adminCfg.maxTokens,
        };
      } else if (requestedMode === "custom") {
        const saved = aiSettings.getUserConfig(db, req.user.id);
        cfg = buildOverride(saved, body);
        if (!cfg.baseUrl || !cfg.model) {
          return res
            .status(400)
            .json({ ok: false, error: "Custom AI is not configured." });
        }
      } else {
        // No explicit mode — use whatever resolves for this user right now.
        try {
          cfg = aiSettings.resolveEffectiveConfig(db, req.user.id);
        } catch (resolveErr) {
          return res.status(resolveErr.status || 400).json({
            ok: false,
            error: resolveErr.message || "AI is not configured.",
          });
        }
      }

      const result = await provider.testConnection(cfg);
      res.json({
        ok: true,
        reply: (result.content || "").trim().slice(0, 200),
      });
    } catch (err) {
      const status = err instanceof provider.AIProviderError ? err.status : 500;
      const message = err?.message || "AI test failed.";
      console.warn("[ai] user test failed:", message);
      res.status(status).json({ ok: false, error: message });
    }
  });

  // ── User: chat completion ──────────────────────────────────────────
  // Resolves the effective config for this user (server vs. custom)
  // before forwarding to the provider. The choice — and the underlying
  // base URL / API key — never leaves the server.
  app.post("/api/ai/chat", auth, async (req, res) => {
    let cfg;
    try {
      cfg = aiSettings.resolveEffectiveConfig(db, req.user.id);
    } catch (resolveErr) {
      return res
        .status(resolveErr.status || 400)
        .json({ error: resolveErr.message || "AI is not available." });
    }

    try {
      const body = req.body || {};
      let messages = null;

      const lang = body.lang === "fr" ? "fr" : "en";

      let pickedIds = [];

      if (Array.isArray(body.messages) && body.messages.length > 0) {
        messages = body.messages
          .filter(
            (m) =>
              m &&
              typeof m.role === "string" &&
              typeof m.content === "string" &&
              m.content.length > 0,
          )
          .slice(0, 32);
      } else if (typeof body.question === "string" && body.question.trim()) {
        const question = body.question.trim();
        const allNotes = Array.isArray(body.notes) ? body.notes : [];
        const picked = pickRelevantNotes(allNotes, question, 8);

        // No relevant note → don't call the provider at all. Returning
        // the localized "not found" string here is what the strict
        // prompt would produce anyway, but it also prevents the model
        // from drifting onto external knowledge when the context is
        // weak or empty.
        if (picked.length === 0) {
          return res.json({
            answer: t(lang, "aiNoRelevantNotes"),
            citedNoteIds: [],
            finishReason: "no_context",
          });
        }

        pickedIds = picked.map((n) => String(n?.id || "")).filter(Boolean);
        const context = picked
          .map((n) => {
            const id = (n?.id || "").toString();
            const title = (n?.title || "").toString();
            const content = (n?.content || "").toString().slice(0, 2000);
            return `[${id}] TITLE: ${title}\nCONTENT: ${content}`;
          })
          .join("\n\n---\n\n");

        messages = [
          {
            role: "system",
            content: buildSystemPrompt(lang, context),
          },
          { role: "user", content: question },
        ];
      }

      if (!messages || messages.length === 0) {
        return res.status(400).json({ error: "Missing messages or question." });
      }

      const result = await provider.chatCompletion(cfg, { messages });
      const raw = (result.content || "").trim();
      // Pull the [[NOTES:id1,id2]] marker out of the answer (case
      // tolerant; brackets occasionally drift to single). Whatever the
      // model emits, we only keep IDs that were actually in the
      // selected context — never trust the model to invent IDs.
      const markerRe = /\[\[?\s*NOTES\s*:\s*([^\]]*?)\s*\]?\]/i;
      const match = raw.match(markerRe);
      const allowed = new Set(pickedIds);
      let citedNoteIds = [];
      if (match) {
        citedNoteIds = match[1]
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter((s) => s && allowed.has(s));
      }
      // If we sent notes to the model but it didn't cite a single
      // valid one (no marker, empty marker, or invented IDs), the
      // answer can't be verified against any note we control. Treat it
      // as unreliable and replace it with the localized "not found"
      // string instead of leaking external-knowledge text to the user.
      if (pickedIds.length > 0 && citedNoteIds.length === 0) {
        return res.json({
          answer: t(lang, "aiNoRelevantNotes"),
          citedNoteIds: [],
          finishReason: "no_valid_citation",
        });
      }

      const answer = raw.replace(markerRe, "").trim();
      res.json({
        answer,
        citedNoteIds,
        finishReason: result.finishReason || null,
      });
    } catch (err) {
      const status = err instanceof provider.AIProviderError ? err.status : 500;
      const message = err?.message || "AI request failed.";
      console.warn("[ai] chat failed:", message);
      res.status(status).json({ error: message });
    }
  });
}

module.exports = { attachAiRoutes };
