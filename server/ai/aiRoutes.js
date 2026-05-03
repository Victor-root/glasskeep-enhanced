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
      const debugRequested = body.debug === true;

      // pickedIds tracks ALL retrieval results; allowedCitationIds
      // narrows to only the notes whose context block actually fit in
      // the prompt budget — that's the set the model is allowed to
      // cite. Citing a note we didn't send to the model is a fabrication.
      // includedNotes / blocks are hoisted here because the citation
      // fallback below this block also reads them.
      let pickedIds = [];
      let allowedCitationIds = [];
      let picked = [];
      let includedNotes = [];
      let blocks = [];
      let debugMeta = null;

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

        const retrievalMetrics = {};
        picked = retrieval.pickRelevantNotes(allNotes, question, {
          limit: 12,
          mode,
          metricsOut: retrievalMetrics,
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
          const resp = {
            answer: t(lang, "aiNoRelevantNotes"),
            citedNoteIds: [],
            finishReason: "no_context",
          };
          if (debugRequested) {
            resp.debug = {
              receivedNotesCount: allNotes.length,
              question,
              lang,
              listIntent,
              mode,
              queryTokens: retrievalMetrics.queryTokens || [],
              anchorTokens: retrievalMetrics.anchorTokens || [],
              weakTokens: retrievalMetrics.weakQueryTokens || [],
              hasAnchors: retrievalMetrics.hasAnchors || false,
              beforePruningCount: retrievalMetrics.beforePruningCount || 0,
              afterPruningCount: 0,
              topScore: retrievalMetrics.topScore || 0,
              topIsObvious: retrievalMetrics.topIsObvious || false,
              droppedNotes: retrievalMetrics.dropped || [],
              pickedCount: 0,
              pickedNotes: [],
              contextNoteIds: [],
              allowedCitationIds: [],
              rejectionReason: "no_context",
            };
          }
          return res.json(resp);
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
        // Reset the hoisted accumulators in case of upstream reuse.
        blocks = [];
        includedNotes = []; // picked items whose block fit in budget
        let total = 0;
        for (const p of picked) {
          const block = retrieval.buildContextBlock(p, { mode });
          // +5 accounts for the "\n\n---\n\n" separator we add later.
          if (total + block.length + 5 > maxTotalChars) break;
          blocks.push(block);
          includedNotes.push(p);
          total += block.length + 5;
        }
        const context = blocks.join("\n\n---\n\n");

        // Citations are only validated against notes whose block was
        // actually sent to the model — IDs we picked but dropped for
        // budget reasons aren't in the prompt and the model has no
        // basis to cite them. Treat such IDs as fabricated.
        allowedCitationIds = includedNotes
          .map((p) => String(p.note?.id || ""))
          .filter(Boolean);

        // Build debug metadata now (before the provider call) so it's
        // available on every response path below.
        if (debugRequested) {
          debugMeta = {
            receivedNotesCount: allNotes.length,
            question,
            lang,
            listIntent,
            mode,
            queryTokens: retrievalMetrics.queryTokens || [],
            anchorTokens: retrievalMetrics.anchorTokens || [],
            weakTokens: retrievalMetrics.weakQueryTokens || [],
            rareAnchorTokens: retrievalMetrics.rareAnchorTokens || [],
            hasAnchors: retrievalMetrics.hasAnchors || false,
            beforePruningCount: retrievalMetrics.beforePruningCount || 0,
            afterPruningCount: retrievalMetrics.afterPruningCount || picked.length,
            topScore: retrievalMetrics.topScore || (picked[0]?.score || 0),
            topIsObvious: retrievalMetrics.topIsObvious || false,
            droppedNotes: retrievalMetrics.dropped || [],
            pickedCount: picked.length,
            pickedNotes: picked.map((p, i) => ({
              id: p.note?.id,
              title: p.note?.title,
              score: p.score,
              matched: p.matched,
              matchedAnchorCount: p.matchedAnchorCount,
              matchedWeakCount: p.matchedWeakCount,
              matchedAnchors: p.matchedAnchors,
              matchedWeakTokens: p.matchedWeakTokens,
              matchedTokenCount: p.matchedTokenCount,
              titleMatchCount: p.titleMatchCount,
              tagMatchCount: p.tagMatchCount,
              bodyMatchCount: p.bodyMatchCount,
              anchorCoverage: p.anchorCoverage || 0,
              rareAnchorCoverage: p.rareAnchorCoverage || 0,
              rareAnchorPenalty: p.rareAnchorPenalty || false,
              contentLength: (p.note?.content || "").length,
              contextBlockLength: blocks[i] !== undefined ? blocks[i].length : 0,
              includedInContext: i < includedNotes.length,
            })),
            pickedIds,
            contextNoteIds: allowedCitationIds.slice(),
            allowedCitationIds: allowedCitationIds.slice(),
            contextLength: context.length,
            maxTotalChars,
          };
        }

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

      // Pull the [[NOTES:id1,id2]] marker out of an answer (case
      // tolerant; brackets occasionally drift to single). Whatever the
      // model emits, we only keep IDs whose block was actually
      // included in the prompt — never trust the model to invent IDs,
      // and never accept IDs that were dropped before the model saw
      // them (e.g. squeezed out by the context budget).
      const markerRe = /\[\[?\s*NOTES\s*:\s*([^\]]*?)\s*\]?\]/i;
      const allowed = new Set(allowedCitationIds);
      const parseMarker = (text) => {
        const m = text.match(markerRe);
        const rawIds = [];
        const validIds = [];
        if (m) {
          m[1]
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((s) => {
              rawIds.push(s);
              if (allowed.has(s)) validIds.push(s);
            });
        }
        return { match: m, rawCitedIds: rawIds, validCitedIds: validIds };
      };

      const result = await provider.chatCompletion(cfg, { messages });
      let raw = (result.content || "").trim();
      let parsed = parseMarker(raw);
      let finishReason = result.finishReason || null;
      let retryAttempted = false;
      let retryMarkerFound = false;

      // The model frequently forgets the [[NOTES:…]] marker even when
      // it answered correctly from the context. Before treating this
      // as a hallucination, give it one chance to add the marker —
      // same conversation, just a short reminder turn appended.
      if (allowedCitationIds.length > 0 && parsed.validCitedIds.length === 0) {
        retryAttempted = true;
        try {
          const reminderMessages = [
            ...messages,
            { role: "assistant", content: raw },
            { role: "user", content: t(lang, "aiCitationRetryReminder") },
          ];
          const retryResult = await provider.chatCompletion(cfg, {
            messages: reminderMessages,
          });
          const retryRaw = (retryResult.content || "").trim();
          const retryParsed = parseMarker(retryRaw);
          if (retryParsed.validCitedIds.length > 0) {
            retryMarkerFound = true;
            raw = retryRaw;
            parsed = retryParsed;
            finishReason = retryResult.finishReason || "citation_retry";
          }
        } catch (retryErr) {
          console.warn("[ai] citation retry failed:", retryErr?.message);
        }
      }

      // Still no valid citation after retry: try the fallback path
      // before rejecting outright. Sending a real, useful answer to
      // the user is better than masking it as "not found" when the
      // retrieval clearly identified relevant notes.
      if (allowedCitationIds.length > 0 && parsed.validCitedIds.length === 0) {
        const top = picked[0];
        const topMatchedCount = Array.isArray(top?.matched)
          ? top.matched.length
          : 0;
        const eligibleForFallback =
          (typeof top?.score === "number" && top.score >= 5) ||
          topMatchedCount >= 2 ||
          picked.length === 1;

        if (eligibleForFallback) {
          // Choose fallback IDs by anchor quality (most anchors matched,
          // then highest coverage, then title matches) rather than score
          // rank — score can be inflated by body repetitions for the
          // wrong note when the right one has a clean title match.
          const fallbackIds = includedNotes
            .slice()
            .sort(
              (a, b) =>
                (b.matchedAnchorCount || 0) - (a.matchedAnchorCount || 0) ||
                (b.anchorCoverage || 0) - (a.anchorCoverage || 0) ||
                (b.titleMatchCount || 0) - (a.titleMatchCount || 0),
            )
            .map((p) => String(p.note?.id || ""))
            .filter(Boolean)
            .slice(0, 3);

          // Keep the model's actual answer; append a discrete localized
          // note explaining that citations were attached automatically.
          const rawAnswer = raw.replace(markerRe, "").trim();
          const fallbackWarning = t(lang, "aiCitationFallbackNote");
          const answer =
            rawAnswer + (fallbackWarning ? "\n\n" + fallbackWarning : "");

          const resp = {
            answer,
            citedNoteIds: fallbackIds,
            finishReason: "citation_fallback",
          };
          if (debugRequested && debugMeta) {
            resp.debug = {
              ...debugMeta,
              finishReason: "citation_fallback",
              markerFound: !!parsed.match,
              rawCitedIds: parsed.rawCitedIds,
              validCitedIds: fallbackIds,
              rawAnswerLength: raw.length,
              rawAnswerPreview: raw.slice(0, 200),
              retryAttempted,
              retryMarkerFound,
              fallbackCitationUsed: true,
              fallbackIds,
              fallbackReason: "anchor-quality",
            };
          }
          return res.json(resp);
        }

        // No fallback eligibility — reject as before.
        const resp = {
          answer: t(lang, "aiNoRelevantNotes"),
          citedNoteIds: [],
          finishReason: "no_valid_citation",
        };
        if (debugRequested && debugMeta) {
          resp.debug = {
            ...debugMeta,
            finishReason: "no_valid_citation",
            markerFound: !!parsed.match,
            rawCitedIds: parsed.rawCitedIds,
            validCitedIds: [],
            rawAnswerLength: raw.length,
            retryAttempted,
            retryMarkerFound,
            fallbackCitationUsed: false,
            rejectionReason: "no_valid_citation",
          };
        }
        return res.json(resp);
      }

      const answer = raw.replace(markerRe, "").trim();
      const resp = {
        answer,
        citedNoteIds: parsed.validCitedIds,
        finishReason,
      };
      if (debugRequested && debugMeta) {
        resp.debug = {
          ...debugMeta,
          finishReason,
          markerFound: !!parsed.match,
          rawCitedIds: parsed.rawCitedIds,
          validCitedIds: parsed.validCitedIds,
          rawAnswerLength: raw.length,
          retryAttempted,
          retryMarkerFound,
          fallbackCitationUsed: false,
        };
      }
      res.json(resp);
    } catch (err) {
      const status = err instanceof provider.AIProviderError ? err.status : 500;
      const message = err?.message || "AI request failed.";
      console.warn("[ai] chat failed:", message);
      res.status(status).json({ error: message });
    }
  });

  // ── Per-note chat ──────────────────────────────────────────────────
  // A separate, simpler surface that scopes the AI to a single user-
  // opened note. No retrieval, no scoring, no pruning, no citation
  // marker — the context is one explicit note plus a temporary chat
  // history that lives only on the client. Reuses the same effective
  // config as /api/ai/chat so the user never reconfigures the AI.
  app.post("/api/ai/note-chat", auth, async (req, res) => {
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
      const lang = body.lang === "fr" ? "fr" : "en";
      const note = body.note && typeof body.note === "object" ? body.note : null;
      const question =
        typeof body.question === "string" ? body.question.trim() : "";

      if (!note) {
        return res.status(400).json({ error: t(lang, "aiNoteChatMissingNote") });
      }
      if (!question) {
        return res
          .status(400)
          .json({ error: t(lang, "aiNoteChatMissingQuestion") });
      }

      // Sanitize the conversation history. Only role + non-empty string
      // content survives; anything else is discarded to keep the prompt
      // shape predictable. Cap at 32 turns to bound prompt size — that's
      // already a longer-than-realistic per-note discussion.
      const history = Array.isArray(body.messages)
        ? body.messages
            .filter(
              (m) =>
                m &&
                typeof m.role === "string" &&
                (m.role === "user" || m.role === "assistant") &&
                typeof m.content === "string" &&
                m.content.trim().length > 0,
            )
            .slice(-32)
            .map((m) => ({ role: m.role, content: m.content }))
        : [];

      // Format the single-note context block. Title / tags / content
      // labels come from i18n so the note section header reads naturally
      // in French and English. Body content is sent verbatim — this is
      // the user's own note, not a retrieved excerpt.
      const titleLabel = t(lang, "aiNoteChatTitleLabel");
      const tagsLabel = t(lang, "aiNoteChatTagsLabel");
      const contentLabel = t(lang, "aiNoteChatContentLabel");
      const noteLabel = t(lang, "aiNoteChatNoteLabel");

      const titleStr = String(note.title || "").trim();
      const tagsArr = Array.isArray(note.tags) ? note.tags.map(String) : [];
      const contentStr = String(note.content || "").trim();

      // Cap the note content fed to the model. 24 KB is generous enough
      // for any realistic single note while staying well under typical
      // context windows once the system prompt and history are added.
      const MAX_NOTE_CHARS = 24000;
      const trimmedContent =
        contentStr.length > MAX_NOTE_CHARS
          ? contentStr.slice(0, MAX_NOTE_CHARS) + "…"
          : contentStr;

      const noteBlockLines = [`${noteLabel}:`];
      if (titleStr) noteBlockLines.push(`${titleLabel}: ${titleStr}`);
      if (tagsArr.length > 0) {
        noteBlockLines.push(`${tagsLabel}: ${tagsArr.join(", ")}`);
      }
      noteBlockLines.push(`${contentLabel}:`);
      noteBlockLines.push(trimmedContent || "(empty)");
      const noteBlock = noteBlockLines.join("\n");

      const systemPrompt =
        t(lang, "aiNoteChatSystemPromptBase") + "\n\n" + noteBlock;

      const messages = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: question },
      ];

      const result = await provider.chatCompletion(cfg, { messages });
      const answer = (result.content || "").trim();
      res.json({
        answer,
        finishReason: result.finishReason || null,
      });
    } catch (err) {
      const status = err instanceof provider.AIProviderError ? err.status : 500;
      const message = err?.message || "AI request failed.";
      console.warn("[ai] note-chat failed:", message);
      res.status(status).json({ error: message });
    }
  });
}

module.exports = { attachAiRoutes };
