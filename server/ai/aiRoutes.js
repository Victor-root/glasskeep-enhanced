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
        const notes = Array.isArray(body.notes) ? body.notes.slice(0, 5) : [];
        const context = notes
          .map((n) => {
            const title = (n?.title || "").toString();
            const content = (n?.content || "").toString().slice(0, 1500);
            return `TITLE: ${title}\nCONTENT: ${content}`;
          })
          .join("\n\n---\n\n");

        messages = [
          {
            role: "system",
            content:
              "You are an assistant for the GlassKeep notes app. " +
              "Use only the provided Note Context to answer the user. " +
              "If the answer is not in the notes, say you couldn't find it. " +
              "Be direct, helpful, and concise." +
              (context ? `\n\nNote Context:\n${context}` : ""),
          },
          { role: "user", content: question },
        ];
      }

      if (!messages || messages.length === 0) {
        return res.status(400).json({ error: "Missing messages or question." });
      }

      const result = await provider.chatCompletion(cfg, { messages });
      const answer = (result.content || "").trim();
      res.json({ answer, finishReason: result.finishReason || null });
    } catch (err) {
      const status = err instanceof provider.AIProviderError ? err.status : 500;
      const message = err?.message || "AI request failed.";
      console.warn("[ai] chat failed:", message);
      res.status(status).json({ error: message });
    }
  });
}

module.exports = { attachAiRoutes };
