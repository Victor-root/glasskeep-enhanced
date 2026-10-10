// server/ai/noteChatRoute.js
// POST /api/ai/note-chat, the assistant scoped to the one note the user
// has open, streamed or not. Attached by aiRoutes.js.

const provider = require("./openaiCompatibleProvider");
const { resolveConfigOrReply, failureStatus } = require("./aiRouteHelpers");
const { t } = require("../i18n");

function attachNoteChatRoute(app, { db, auth }) {
  // ── Per-note chat ──────────────────────────────────────────────────
  // A separate, simpler surface that scopes the AI to a single user-
  // opened note. No retrieval, no scoring, no pruning, no citation
  // marker: the context is one explicit note plus a temporary chat
  // history that lives only on the client. Reuses the same effective
  // config as /api/ai/chat so the user never reconfigures the AI.
  app.post("/api/ai/note-chat", auth, async (req, res) => {
    const cfg = resolveConfigOrReply(db, req.user.id, res);
    if (!cfg) return;

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
      // shape predictable. Cap at 32 turns to bound prompt size: that's
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
      // in French and English. Body content is sent verbatim: this is
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

      // Stream branch, opt-in via { stream: true } in the request body.
      // Emits Server-Sent Events whose `data:` payloads are JSON of the
      // shape { delta } / { finishReason } / { error }, terminated by a
      // final `data: [DONE]` frame. Falls through to JSON otherwise so
      // older callers still work unchanged.
      if (body.stream === true) {
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        if (typeof res.flushHeaders === "function") res.flushHeaders();

        const send = (obj) => {
          res.write(`data: ${JSON.stringify(obj)}\n\n`);
          if (typeof res.flush === "function") res.flush();
        };
        try {
          for await (const chunk of provider.chatCompletionStream(cfg, { messages })) {
            send(chunk);
          }
          res.write("data: [DONE]\n\n");
        } catch (err) {
          const message = err?.message || "AI request failed.";
          console.warn("[ai] note-chat stream failed:", message);
          send({ error: message });
        } finally {
          res.end();
        }
        return;
      }

      const result = await provider.chatCompletion(cfg, { messages });
      const answer = (result.content || "").trim();
      res.json({
        answer,
        finishReason: result.finishReason || null,
      });
    } catch (err) {
      const status = failureStatus(err);
      const message = err?.message || "AI request failed.";
      console.warn("[ai] note-chat failed:", message);
      res.status(status).json({ error: message });
    }
  });
}

module.exports = { attachNoteChatRoute };
