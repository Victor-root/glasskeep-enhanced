// server/ai/aiRouteHelpers.js
// What the AI routes (aiRoutes.js and the routes it attaches) share: how
// a request finds the configuration it runs on, and the HTTP status a
// failed provider call answers with.

const aiSettings = require("./aiSettings");
const provider = require("./openaiCompatibleProvider");

// The configuration this user's AI requests resolve to, or null once the
// refusal has been answered (resolveEffectiveConfig says why).
function resolveConfigOrReply(db, userId, res) {
  try {
    return aiSettings.resolveEffectiveConfig(db, userId);
  } catch (resolveErr) {
    res
      .status(resolveErr.status || 400)
      .json({ error: resolveErr.message || "AI is not available." });
    return null;
  }
}

// A provider error carries the status it maps to; anything else is ours.
function failureStatus(err) {
  return err instanceof provider.AIProviderError ? err.status : 500;
}

module.exports = { resolveConfigOrReply, failureStatus };
