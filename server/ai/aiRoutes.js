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
//
// Note retrieval (tokenization, scoring, snippet extraction) lives in
// noteRetrieval.js — this file is responsible for orchestration only.

const aiSettings = require("./aiSettings");
const provider = require("./openaiCompatibleProvider");
const retrieval = require("./noteRetrieval");
const { t } = require("../i18n");

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

function buildSystemPrompt(lang, context, listIntent) {
  const base = t(lang, "aiSystemPromptBase");
  const label = t(lang, "aiSystemPromptContextLabel");
  const noCtx = t(lang, "aiSystemPromptNoContext");
  const listHint = listIntent ? "\n\n" + t(lang, "aiSystemPromptListHint") : "";
  return context
    ? `${base}${listHint}\n\n${label}:\n${context}`
    : `${base}${listHint}\n\n${label}: ${noCtx}`;
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

        // List-intent queries ("liste mes wallets", "show my crypto",
        // "trouve mes notes …") flip the retriever into inventory mode:
        // each picked note keeps every matched line plus a one-line
        // neighborhood, so the model can extract every entry instead of
        // a few examples. Narrow Q&A queries stay in compact mode.
        const listIntent = retrieval.detectListIntent(question);
        const mode = listIntent ? "inventory" : "compact";

        const picked = retrieval.pickRelevantNotes(allNotes, question, {
          limit: 12,
          mode,
        });

        retrieval.debugRetrieval({
          question,
          totalNotes: allNotes.length,
          tokens: undefined,
          picked,
        });

        // No relevant note → don't call the provider at all. The
        // localized "not found" string is what the strict prompt would
        // produce anyway, and skipping the round-trip removes one path
        // for the model to hallucinate from external knowledge.
        if (picked.length === 0) {
          return res.json({
            answer: t(lang, "aiNoRelevantNotes"),
            citedNoteIds: [],
            finishReason: "no_context",
          });
        }

        pickedIds = picked
          .map((p) => String(p.note?.id || ""))
          .filter(Boolean);

        // Inventory mode gets a generous ~60 KB budget so the model
        // sees the full content of the picked notes — list/inventory
        // queries fail when notes are chopped into snippets. Compact
        // mode keeps the lean ~16 KB ceiling for narrow Q&A.
        // Top-scored notes are added first; if the budget runs out
        // the lower-ranked ones are dropped rather than silently
        // truncated, since a half-note is a worse signal to the model
        // than a missing one. Per the spec: 6 nearly-complete notes
        // beat 12 amputated ones.
        const maxTotalChars = listIntent ? 60000 : 16000;
        const blocks = [];
        let total = 0;
        for (const p of picked) {
          const block = retrieval.buildContextBlock(p, { mode });
          // +5 accounts for the "\n\n---\n\n" separator we add later.
          if (total + block.length + 5 > maxTotalChars) break;
          blocks.push(block);
          total += block.length + 5;
        }
        const context = blocks.join("\n\n---\n\n");

        messages = [
          {
            role: "system",
            content: buildSystemPrompt(lang, context, listIntent),
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
