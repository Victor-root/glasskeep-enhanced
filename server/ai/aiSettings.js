// server/ai/aiSettings.js
// Persistence for AI provider configuration.
//
// Two tables live here:
//
//   ai_settings        — singleton row, holds the "server AI" the admin
//                        configures. Only admins ever see the API key
//                        or the base URL. The `allow_server_ai_for_users`
//                        flag decides whether regular users may opt to
//                        use this shared server AI.
//
//   user_ai_settings   — one row per user. Holds the user's preference
//                        (enabled? mode = "server" | "custom"?) plus
//                        their personal OpenAI-compatible config when
//                        mode = "custom". The user's API key is also
//                        stored server-side and never returned in full.

const PROVIDER_OPENAI_COMPATIBLE = "openai-compatible";
const MODES = Object.freeze(["server", "custom"]);

const ADMIN_DEFAULTS = Object.freeze({
  enabled: false,
  provider: PROVIDER_OPENAI_COMPATIBLE,
  baseUrl: "",
  apiKey: "",
  model: "",
  temperature: 0.2,
  maxTokens: 800,
  allowServerAiForUsers: false,
});

const USER_DEFAULTS = Object.freeze({
  enabled: false,
  mode: "server",
  baseUrl: "",
  apiKey: "",
  model: "",
  temperature: 0.2,
  maxTokens: 800,
});

// ── Schema ───────────────────────────────────────────────────────────
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

    CREATE TABLE IF NOT EXISTS user_ai_settings (
      user_id INTEGER PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'server',
      base_url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      temperature REAL NOT NULL DEFAULT 0.2,
      max_tokens INTEGER NOT NULL DEFAULT 800,
      updated_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Migration: add `allow_server_ai_for_users` to ai_settings if missing.
  // Wrapped in a try/catch so PRAGMA quirks don't crash boot.
  try {
    const cols = db.prepare(`PRAGMA table_info(ai_settings)`).all();
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("allow_server_ai_for_users")) {
      db.exec(
        `ALTER TABLE ai_settings ADD COLUMN allow_server_ai_for_users INTEGER NOT NULL DEFAULT 0`,
      );
    }
  } catch {
    // best-effort migration; the singleton row insert below is idempotent.
  }

  db.prepare(`
    INSERT OR IGNORE INTO ai_settings
      (id, enabled, provider, base_url, api_key, model, temperature, max_tokens, allow_server_ai_for_users, updated_at)
    VALUES (1, 0, 'openai-compatible', '', '', '', 0.2, 800, 0, datetime('now'))
  `).run();
}

// ── Helpers ──────────────────────────────────────────────────────────
function clampNumber(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function adminRowToInternal(row) {
  return {
    enabled: !!row.enabled,
    provider: row.provider || PROVIDER_OPENAI_COMPATIBLE,
    baseUrl: row.base_url || "",
    apiKey: row.api_key || "",
    model: row.model || "",
    temperature:
      typeof row.temperature === "number"
        ? row.temperature
        : ADMIN_DEFAULTS.temperature,
    maxTokens:
      typeof row.max_tokens === "number"
        ? row.max_tokens
        : ADMIN_DEFAULTS.maxTokens,
    allowServerAiForUsers: !!row.allow_server_ai_for_users,
  };
}

function userRowToInternal(row) {
  return {
    enabled: !!row.enabled,
    mode: row.mode === "custom" ? "custom" : "server",
    baseUrl: row.base_url || "",
    apiKey: row.api_key || "",
    model: row.model || "",
    temperature:
      typeof row.temperature === "number"
        ? row.temperature
        : USER_DEFAULTS.temperature,
    maxTokens:
      typeof row.max_tokens === "number"
        ? row.max_tokens
        : USER_DEFAULTS.maxTokens,
  };
}

// ── Admin / "server" config ──────────────────────────────────────────
function getAdminRow(db) {
  const row = db.prepare(`SELECT * FROM ai_settings WHERE id = 1`).get();
  if (row) return row;
  ensureSchema(db);
  return db.prepare(`SELECT * FROM ai_settings WHERE id = 1`).get();
}

// Internal use only: includes the API key. Never send this to the client.
function getAdminConfig(db) {
  return adminRowToInternal(getAdminRow(db));
}

// Sanitized payload for the admin UI: no API key (only `hasApiKey`).
function getAdminPublicConfig(db) {
  const cfg = getAdminConfig(db);
  return {
    enabled: cfg.enabled,
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    hasApiKey: cfg.apiKey.length > 0,
    allowServerAiForUsers: cfg.allowServerAiForUsers,
  };
}

// `patch.apiKey` semantics:
//   - undefined          -> keep
//   - "" (empty string)  -> clear
//   - other string       -> replace
function updateAdminConfig(db, patch = {}) {
  const current = getAdminConfig(db);
  const next = {
    enabled:
      typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    provider: PROVIDER_OPENAI_COMPATIBLE, // V1: single provider
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
    allowServerAiForUsers:
      typeof patch.allowServerAiForUsers === "boolean"
        ? patch.allowServerAiForUsers
        : current.allowServerAiForUsers,
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
           allow_server_ai_for_users = ?,
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
    next.allowServerAiForUsers ? 1 : 0,
  );

  return getAdminPublicConfig(db);
}

// ── User config ──────────────────────────────────────────────────────
function getUserRow(db, userId) {
  const row = db
    .prepare(`SELECT * FROM user_ai_settings WHERE user_id = ?`)
    .get(userId);
  if (row) return row;
  // Lazily insert defaults on first read so subsequent updates are
  // simple UPDATEs.
  db.prepare(`
    INSERT OR IGNORE INTO user_ai_settings
      (user_id, enabled, mode, base_url, api_key, model, temperature, max_tokens, updated_at)
    VALUES (?, 0, 'server', '', '', '', 0.2, 800, datetime('now'))
  `).run(userId);
  return db
    .prepare(`SELECT * FROM user_ai_settings WHERE user_id = ?`)
    .get(userId);
}

// Internal — includes the user's API key. Use only when building the
// outbound provider request.
function getUserConfig(db, userId) {
  return userRowToInternal(getUserRow(db, userId));
}

// Sanitized payload for the user-facing settings UI. Includes a hint
// (`serverAiAvailable`) so the UI can disable the "server" radio when
// the admin hasn't opted in.
function getUserPublicConfig(db, userId) {
  const userCfg = getUserConfig(db, userId);
  const adminCfg = getAdminConfig(db);
  const serverAiAvailable =
    !!adminCfg.enabled &&
    !!adminCfg.allowServerAiForUsers &&
    !!adminCfg.baseUrl &&
    !!adminCfg.model;
  return {
    enabled: userCfg.enabled,
    mode: userCfg.mode,
    baseUrl: userCfg.baseUrl,
    model: userCfg.model,
    temperature: userCfg.temperature,
    maxTokens: userCfg.maxTokens,
    hasApiKey: userCfg.apiKey.length > 0,
    serverAiAvailable,
  };
}

function updateUserConfig(db, userId, patch = {}) {
  const current = getUserConfig(db, userId);
  const nextMode = MODES.includes(patch.mode) ? patch.mode : current.mode;
  const next = {
    enabled:
      typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    mode: nextMode,
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
    UPDATE user_ai_settings
       SET enabled = ?,
           mode = ?,
           base_url = ?,
           api_key = ?,
           model = ?,
           temperature = ?,
           max_tokens = ?,
           updated_at = datetime('now')
     WHERE user_id = ?
  `).run(
    next.enabled ? 1 : 0,
    next.mode,
    next.baseUrl,
    next.apiKey,
    next.model,
    next.temperature,
    next.maxTokens,
    userId,
  );

  return getUserPublicConfig(db, userId);
}

// ── Effective-config resolver ────────────────────────────────────────
// Decides which config to use for an actual chat request. Throws an
// Error tagged with `.status` so the route layer can surface a clean
// HTTP response. Never returns the admin config when the admin hasn't
// authorised it — even if a user previously set `mode = 'server'`.
function resolveEffectiveConfig(db, userId) {
  const userCfg = getUserConfig(db, userId);
  if (!userCfg.enabled) {
    const err = new Error("AI is disabled for this user.");
    err.status = 403;
    err.code = "user_ai_disabled";
    throw err;
  }

  if (userCfg.mode === "server") {
    const adminCfg = getAdminConfig(db);
    if (!adminCfg.enabled || !adminCfg.allowServerAiForUsers) {
      const err = new Error("Server AI is not available.");
      err.status = 503;
      err.code = "server_ai_unavailable";
      throw err;
    }
    if (!adminCfg.baseUrl || !adminCfg.model) {
      const err = new Error("Server AI is not available.");
      err.status = 503;
      err.code = "server_ai_unavailable";
      throw err;
    }
    return {
      enabled: true,
      provider: adminCfg.provider,
      baseUrl: adminCfg.baseUrl,
      apiKey: adminCfg.apiKey,
      model: adminCfg.model,
      temperature: adminCfg.temperature,
      maxTokens: adminCfg.maxTokens,
      origin: "server",
    };
  }

  // mode === 'custom'
  if (!userCfg.baseUrl || !userCfg.model) {
    const err = new Error("Custom AI is not configured.");
    err.status = 400;
    err.code = "custom_ai_missing";
    throw err;
  }
  return {
    enabled: true,
    provider: PROVIDER_OPENAI_COMPATIBLE,
    baseUrl: userCfg.baseUrl,
    apiKey: userCfg.apiKey,
    model: userCfg.model,
    temperature: userCfg.temperature,
    maxTokens: userCfg.maxTokens,
    origin: "custom",
  };
}

module.exports = {
  PROVIDER_OPENAI_COMPATIBLE,
  MODES,
  ADMIN_DEFAULTS,
  USER_DEFAULTS,
  ensureSchema,
  // admin
  getAdminConfig,
  getAdminPublicConfig,
  updateAdminConfig,
  // user
  getUserConfig,
  getUserPublicConfig,
  updateUserConfig,
  // resolver
  resolveEffectiveConfig,
};
