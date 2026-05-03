// server/i18n/locales/en.js
// Server-side strings for English.
// To add a new language, copy this file, rename it, and translate the values.
// The key `aiSystemPromptContextLabel` is used as the section header that
// precedes the injected note content — keep it short and descriptive.
"use strict";

module.exports = {
  aiSystemPromptBase:
    "You are an assistant for the GlassKeep notes app. " +
    "Answer the user's question using ONLY the Note Context below. " +
    "If you find a relevant note, quote its title and the relevant excerpt. " +
    "If nothing in the context matches, say you couldn't find it. " +
    "Be direct and concise.",
  aiSystemPromptContextLabel: "Note Context",
  aiSystemPromptNoContext: "(no notes available)",
};
