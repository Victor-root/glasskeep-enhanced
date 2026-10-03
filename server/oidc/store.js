// server/oidc/store.js
//
// Data layer for OpenID Connect sign-in.
//
// Two tables, kept apart on purpose:
//
//   oidc_providers            one row per identity provider GlassKeep
//                             trusts. `owner_user_id` NULL is a provider
//                             configured by an admin for the whole
//                             instance. A non-NULL owner is reserved for
//                             a provider a user brings for their own
//                             account; nothing creates one yet, but
//                             nothing here assumes there is only one row.
//
//   user_external_identities  which GlassKeep account an external identity
//                             opens. The identity is the pair (issuer,
//                             subject), the only stable and unique handle
//                             OIDC guarantees. The email the provider
//                             reports is kept for display, never matched
//                             on: a provider may let people change it.
//
// The client secret is stored like the federation shared secrets: in the
// clear in the database, never returned to a browser.

const crypto = require("crypto");

function nowIso() {
  return new Date().toISOString();
}

function createOidcStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS oidc_providers (
      id TEXT PRIMARY KEY,
      owner_user_id INTEGER,               -- NULL = instance-wide, admin-managed
      display_name TEXT NOT NULL,
      issuer TEXT NOT NULL DEFAULT '',
      client_id TEXT NOT NULL DEFAULT '',
      client_secret TEXT,
      public_origin TEXT NOT NULL DEFAULT '', -- GlassKeep origin the callback lives on
      enabled INTEGER NOT NULL DEFAULT 0,
      auto_create_accounts INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_oidc_providers_owner ON oidc_providers(owner_user_id);

    CREATE TABLE IF NOT EXISTS user_external_identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      provider_id TEXT,
      issuer TEXT NOT NULL,
      subject TEXT NOT NULL,
      email TEXT,
      created_at TEXT NOT NULL,
      last_login_at TEXT,
      UNIQUE(issuer, subject),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(provider_id) REFERENCES oidc_providers(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_external_identities_user ON user_external_identities(user_id);
  `);

  const stmts = {
    getProvider: db.prepare(`SELECT * FROM oidc_providers WHERE id = ?`),
    getInstanceProvider: db.prepare(
      `SELECT * FROM oidc_providers WHERE owner_user_id IS NULL ORDER BY created_at ASC LIMIT 1`,
    ),
    listEnabledInstanceProviders: db.prepare(
      `SELECT * FROM oidc_providers WHERE owner_user_id IS NULL AND enabled = 1 ORDER BY created_at ASC`,
    ),
    insertProvider: db.prepare(`
      INSERT INTO oidc_providers
        (id, owner_user_id, display_name, issuer, client_id, client_secret, public_origin,
         enabled, auto_create_accounts, created_by, created_at, updated_at)
      VALUES
        (@id, @owner_user_id, @display_name, @issuer, @client_id, @client_secret, @public_origin,
         @enabled, @auto_create_accounts, @created_by, @created_at, @updated_at)
    `),
    updateProvider: db.prepare(`
      UPDATE oidc_providers SET
        display_name = @display_name, issuer = @issuer, client_id = @client_id,
        client_secret = @client_secret, public_origin = @public_origin, enabled = @enabled,
        auto_create_accounts = @auto_create_accounts, updated_at = @updated_at
      WHERE id = @id
    `),

    getIdentity: db.prepare(
      `SELECT * FROM user_external_identities WHERE issuer = ? AND subject = ?`,
    ),
    listIdentitiesForUser: db.prepare(`
      SELECT i.id, i.provider_id, i.issuer, i.email, i.created_at, i.last_login_at,
             p.display_name AS provider_name
      FROM user_external_identities i
      LEFT JOIN oidc_providers p ON p.id = i.provider_id
      WHERE i.user_id = ?
      ORDER BY i.created_at ASC
    `),
    insertIdentity: db.prepare(`
      INSERT INTO user_external_identities
        (user_id, provider_id, issuer, subject, email, created_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    touchIdentity: db.prepare(
      `UPDATE user_external_identities SET email = ?, last_login_at = ? WHERE id = ?`,
    ),
    deleteIdentitiesForUserProvider: db.prepare(
      `DELETE FROM user_external_identities WHERE user_id = ? AND provider_id = ?`,
    ),
    deleteIdentity: db.prepare(
      `DELETE FROM user_external_identities WHERE id = ? AND user_id = ?`,
    ),
  };

  // Writes the instance-wide provider, creating its row the first time.
  function saveInstanceProvider(fields, adminId) {
    const existing = stmts.getInstanceProvider.get();
    const updatedAt = nowIso();
    if (existing) {
      stmts.updateProvider.run({ ...fields, id: existing.id, updated_at: updatedAt });
      return stmts.getProvider.get(existing.id);
    }
    const id = crypto.randomBytes(12).toString("base64url");
    stmts.insertProvider.run({
      ...fields,
      id,
      owner_user_id: null,
      created_by: adminId ?? null,
      created_at: updatedAt,
      updated_at: updatedAt,
    });
    return stmts.getProvider.get(id);
  }

  // One identity per account and provider: linking again replaces the
  // previous one, so an account never collects stale identities from a
  // provider whose issuer was reconfigured.
  const linkIdentity = db.transaction(({ userId, providerId, issuer, subject, email }) => {
    const at = nowIso();
    stmts.deleteIdentitiesForUserProvider.run(userId, providerId);
    stmts.insertIdentity.run(userId, providerId, issuer, subject, email || null, at, at);
  });

  return {
    getProvider: (id) => (typeof id === "string" ? stmts.getProvider.get(id) : undefined),
    getInstanceProvider: () => stmts.getInstanceProvider.get(),
    listEnabledInstanceProviders: () => stmts.listEnabledInstanceProviders.all(),
    saveInstanceProvider,
    getIdentity: (issuer, subject) => stmts.getIdentity.get(issuer, subject),
    listIdentitiesForUser: (userId) => stmts.listIdentitiesForUser.all(userId),
    linkIdentity,
    touchIdentity: (id, email) => stmts.touchIdentity.run(email || null, nowIso(), id),
    deleteIdentity: (id, userId) => stmts.deleteIdentity.run(id, userId).changes > 0,
  };
}

module.exports = { createOidcStore };
