// server/ai/aiRoutes.js
// Express routes for the OpenAI-compatible AI integration.
//
// Two surfaces:
//   - /api/admin/ai/* — admin-only configuration and connectivity test.
//   - /api/ai/chat    — authenticated user-facing chat endpoint.
//
// The admin GET endpoint never exposes the stored API key — only a
// `hasApiKey` flag. PUT supports replace/clear semantics so the UI can
// rotate or wipe the secret without ever round-tripping it.

const aiSettings = require("./aiSettings");
const provider = require("./openaiCompatibleProvider");

function attachAiRoutes(app, { db, auth, adminOnly }) {
  aiSettings.ensureSchema(db);

  // ── Admin: read current settings (no API key in payload) ────────────
  app.get("/api/admin/ai/settings", auth, adminOnly, (_req, res) => {
    try {
      res.json(aiSettings.getPublicConfig(db));
    } catch (err) {
      console.error("[ai] failed to read settings:", err?.message);
      res.status(500).json({ error: "Failed to read AI settings." });
    }
  });

  // ── Admin: update settings ─────────────────────────────────────────
  // The body shape mirrors the public config plus optional `apiKey`:
  //   - apiKey omitted     -> keep the existing key
  //   - apiKey === ""      -> clear the key
  //   - apiKey === "..."   -> replace the key
  app.put("/api/admin/ai/settings", auth, adminOnly, (req, res) => {
    try {
      const { enabled, baseUrl, model, temperature, maxTokens, apiKey } =
        req.body || {};
      const updated = aiSettings.updateConfig(db, {
        enabled,
        baseUrl,
        model,
        temperature,
        maxTokens,
        apiKey,
      });
      res.json(updated);
    } catch (err) {
      console.error("[ai] failed to update settings:", err?.message);
      res.status(500).json({ error: "Failed to update AI settings." });
    }
  });

  // ── Admin: test the configured (or override) provider ──────────────
  // Body may contain a partial config. Whatever isn't supplied falls
  // back to the saved settings — including the API key, which stays
  // server-side. Sending `apiKey: ""` explicitly tests with no key.
  app.post("/api/admin/ai/test", auth, adminOnly, async (req, res) => {
    try {
      const saved = aiSettings.getConfig(db);
      const body = req.body || {};
      const cfg = {
        enabled: true, // explicit test always enabled, even if globally disabled
        provider: aiSettings.PROVIDER_OPENAI_COMPATIBLE,
        baseUrl:
          typeof body.baseUrl === "string"
            ? body.baseUrl.trim()
            : saved.baseUrl,
        model:
          typeof body.model === "string" ? body.model.trim() : saved.model,
        apiKey:
          typeof body.apiKey === "string" ? body.apiKey.trim() : saved.apiKey,
        temperature:
          typeof body.temperature === "number"
            ? body.temperature
            : saved.temperature,
        maxTokens:
          typeof body.maxTokens === "number" ? body.maxTokens : saved.maxTokens,
      };

      const result = await provider.testConnection(cfg);
      res.json({
        ok: true,
        reply: (result.content || "").trim().slice(0, 200),
      });
    } catch (err) {
      const status = err instanceof provider.AIProviderError ? err.status : 500;
      const message = err?.message || "AI test failed.";
      // Never log the full prompt or the API key. The provider helper
      // already redacts; we just surface the friendly message here.
      console.warn("[ai] test connection failed:", message);
      res.status(status).json({ ok: false, error: message });
    }
  });

  // ── User: chat completion ──────────────────────────────────────────
  // Accepts either:
  //   { messages: [{role, content}, ...] }                 // raw chat
  //   { question: "...", notes: [{title, content}, ...] }  // legacy "ask AI"
  app.post("/api/ai/chat", auth, async (req, res) => {
    try {
      const cfg = aiSettings.getConfig(db);
      if (!cfg.enabled) {
        return res.status(503).json({ error: "AI is disabled." });
      }
      if (!cfg.baseUrl || !cfg.model) {
        return res
          .status(503)
          .json({ error: "AI is not configured. Ask an administrator." });
      }

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
