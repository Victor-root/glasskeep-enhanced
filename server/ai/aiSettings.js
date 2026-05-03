// server/ai/aiSettings.js
// Persistence layer for the AI provider configuration.
//
// V1 only supports a single provider: "openai-compatible". The settings
// row is unique (id = 1) and stored in the same SQLite database as the
// rest of the app. The API key is kept server-side only — it is never
// returned to the client in plain form (a `hasApiKey` flag is exposed
// instead).

const PROVIDER_OPENAI_COMPATIBLE = "openai-compatible";

const DEFAULTS = Object.freeze({
  enabled: false,
  provider: PROVIDER_OPENAI_COMPATIBLE,
  baseUrl: "",
  apiKey: "",
  model: "",
  temperature: 0.2,
  maxTokens: 800,
});

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      provider TEXT NOT NULL DEFAULT 'openai-compatible',
      base_url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      temperature REAL NOT NULL DEFAULT 0.2,
      max_tokens INTEGER NOT NULL DEFAULT 800,
      updated_at TEXT
    );
  `);
  // Insert the singleton row if missing.
  db.prepare(`
    INSERT OR IGNORE INTO ai_settings (id, enabled, provider, base_url, api_key, model, temperature, max_tokens, updated_at)
    VALUES (1, 0, 'openai-compatible', '', '', '', 0.2, 800, datetime('now'))
  `).run();
}

function getRow(db) {
  const row = db.prepare(`SELECT * FROM ai_settings WHERE id = 1`).get();
  if (row) return row;
  ensureSchema(db);
  return db.prepare(`SELECT * FROM ai_settings WHERE id = 1`).get();
}

function rowToInternal(row) {
  return {
    enabled: !!row.enabled,
    provider: row.provider || PROVIDER_OPENAI_COMPATIBLE,
    baseUrl: row.base_url || "",
    apiKey: row.api_key || "",
    model: row.model || "",
    temperature: typeof row.temperature === "number" ? row.temperature : DEFAULTS.temperature,
    maxTokens: typeof row.max_tokens === "number" ? row.max_tokens : DEFAULTS.maxTokens,
  };
}

// Returns the full internal config (including the API key). Use only on
// the server side when the key is actually needed to make a request.
function getConfig(db) {
  return rowToInternal(getRow(db));
}

// Returns a sanitized config safe to send to a client. The API key is
// never included; only a boolean flag tells the UI whether one is set.
function getPublicConfig(db) {
  const cfg = rowToInternal(getRow(db));
  return {
    enabled: cfg.enabled,
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    hasApiKey: cfg.apiKey.length > 0,
  };
}

function clampNumber(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

// Patch the persisted settings. `patch.apiKey` semantics:
//   - undefined          -> keep the existing key
//   - "" (empty string)  -> clear the key
//   - other string       -> replace the key with the new value
function updateConfig(db, patch = {}) {
  const current = rowToInternal(getRow(db));
  const next = {
    enabled:
      typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    provider: PROVIDER_OPENAI_COMPATIBLE, // V1: single provider, ignore overrides
    baseUrl:
      typeof patch.baseUrl === "string"
        ? patch.baseUrl.trim()
        : current.baseUrl,
    apiKey:
      typeof patch.apiKey === "string" ? patch.apiKey.trim() : current.apiKey,
    model:
      typeof patch.model === "string" ? patch.model.trim() : current.model,
    temperature:
      patch.temperature === undefined
        ? current.temperature
        : clampNumber(patch.temperature, 0, 2, current.temperature),
    maxTokens:
      patch.maxTokens === undefined
        ? current.maxTokens
        : Math.round(clampNumber(patch.maxTokens, 1, 32768, current.maxTokens)),
  };

  db.prepare(`
    UPDATE ai_settings
       SET enabled = ?,
           provider = ?,
           base_url = ?,
           api_key = ?,
           model = ?,
           temperature = ?,
           max_tokens = ?,
           updated_at = datetime('now')
     WHERE id = 1
  `).run(
    next.enabled ? 1 : 0,
    next.provider,
    next.baseUrl,
    next.apiKey,
    next.model,
    next.temperature,
    next.maxTokens,
  );

  return getPublicConfig(db);
}

module.exports = {
  PROVIDER_OPENAI_COMPATIBLE,
  DEFAULTS,
  ensureSchema,
  getConfig,
  getPublicConfig,
  updateConfig,
};
