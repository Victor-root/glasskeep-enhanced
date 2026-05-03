// server/i18n/index.js
// Minimal server-side translation helper.
//
// Usage:  const { t } = require("../i18n");
//         t("fr", "aiSystemPromptBase")   // French string
//         t("xx", "aiSystemPromptBase")   // unknown lang → falls back to English
"use strict";

const locales = {
  en: require("./locales/en"),
  fr: require("./locales/fr"),
};

function t(lang, key) {
  const dict = locales[lang] || locales.en;
  return dict[key] ?? locales.en[key] ?? key;
}

module.exports = { t };
