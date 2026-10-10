// server/ai/chatRoute.js
// POST /api/ai/chat, the assistant that answers from the user's notes:
// retrieval (noteRetrieval.js), the prompt budget, the provider call and
// the [[NOTES:…]] citation checks. Attached by aiRoutes.js.

const provider = require("./openaiCompatibleProvider");
const retrieval = require("./noteRetrieval");
const { resolveConfigOrReply, failureStatus } = require("./aiRouteHelpers");
const { t } = require("../i18n");

function buildSystemPrompt(lang, context, listIntent) {
  const base = t(lang, "aiSystemPromptBase");
  const label = t(lang, "aiSystemPromptContextLabel");
  const noCtx = t(lang, "aiSystemPromptNoContext");
  const listHint = listIntent ? "\n\n" + t(lang, "aiSystemPromptListHint") : "";
  return context
    ? `${base}${listHint}\n\n${label}:\n${context}`
    : `${base}${listHint}\n\n${label}: ${noCtx}`;
}

function attachAiChatRoute(app, { db, auth }) {
  // ── User: chat completion ──────────────────────────────────────────
  // Resolves the effective config for this user (server vs. custom)
  // before forwarding to the provider. The choice, and the underlying
  // base URL / API key, never leaves the server.
  app.post("/api/ai/chat", auth, async (req, res) => {
    const cfg = resolveConfigOrReply(db, req.user.id, res);
    if (!cfg) return;

    try {
      const body = req.body || {};
      let messages = null;

      const lang = body.lang === "fr" ? "fr" : "en";
      const debugRequested = body.debug === true;

      // pickedIds tracks ALL retrieval results; allowedCitationIds
      // narrows to only the notes whose context block actually fit in
      // the prompt budget: that's the set the model is allowed to
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
        // sees the full content of the picked notes: list/inventory
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
        // actually sent to the model: IDs we picked but dropped for
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
      // included in the prompt: never trust the model to invent IDs,
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
      // as a hallucination, give it one chance to add the marker,
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
          // rank: score can be inflated by body repetitions for the
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

        // No fallback eligibility: reject as before.
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
      const status = failureStatus(err);
      const message = err?.message || "AI request failed.";
      console.warn("[ai] chat failed:", message);
      res.status(status).json({ error: message });
    }
  });
}

module.exports = { attachAiChatRoute };
