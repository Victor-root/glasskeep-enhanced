// server/oidc/store.js
//
// Data layer for OpenID Connect sign-in.
//
// Two tables, kept apart on purpose:
//
//   oidc_providers            the identity provider a user declared for
//                             their own account (`owner_user_id`). One per
//                             account today; nothing here relies on it.
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
      owner_user_id INTEGER NOT NULL,
      display_name TEXT NOT NULL,
      issuer TEXT NOT NULL,
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      public_origin TEXT NOT NULL,          -- GlassKeep origin the callback lives on
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
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
    getProviderForUser: db.prepare(
      `SELECT * FROM oidc_providers WHERE owner_user_id = ? ORDER BY created_at ASC LIMIT 1`,
    ),
    insertProvider: db.prepare(`
      INSERT INTO oidc_providers
        (id, owner_user_id, display_name, issuer, client_id, client_secret, public_origin,
         created_at, updated_at)
      VALUES
        (@id, @owner_user_id, @display_name, @issuer, @client_id, @client_secret, @public_origin,
         @created_at, @updated_at)
    `),
    updateProvider: db.prepare(`
      UPDATE oidc_providers SET
        display_name = @display_name, issuer = @issuer, client_id = @client_id,
        client_secret = @client_secret, public_origin = @public_origin, updated_at = @updated_at
      WHERE id = @id
    `),
    deleteProvider: db.prepare(`DELETE FROM oidc_providers WHERE id = ?`),
    // Whether at least one account can sign in through a provider, which is
    // all the login screen needs to know to offer the button.
    anyLinkedProvider: db.prepare(`
      SELECT 1 FROM user_external_identities i
      JOIN oidc_providers p ON p.id = i.provider_id AND p.owner_user_id = i.user_id
      LIMIT 1
    `),

    getIdentity: db.prepare(
      `SELECT * FROM user_external_identities WHERE issuer = ? AND subject = ?`,
    ),
    getIdentityForProvider: db.prepare(
      `SELECT * FROM user_external_identities WHERE provider_id = ? LIMIT 1`,
    ),
    insertIdentity: db.prepare(`
      INSERT INTO user_external_identities
        (user_id, provider_id, issuer, subject, email, created_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    touchIdentity: db.prepare(
      `UPDATE user_external_identities SET email = ?, last_login_at = ? WHERE id = ?`,
    ),
    // What linking replaces: whatever the provider was linked to, and this
    // same identity if the account had it attached to an earlier provider.
    deleteReplacedIdentities: db.prepare(`
      DELETE FROM user_external_identities
      WHERE provider_id = ? OR (user_id = ? AND issuer = ? AND subject = ?)
    `),
    deleteIdentitiesForProvider: db.prepare(
      `DELETE FROM user_external_identities WHERE provider_id = ?`,
    ),
  };

  // Creates or updates the account's provider. A new issuer or client is
  // a different relationship: the identity linked through the old one no
  // longer proves anything, so it has to be linked again.
  const saveProviderForUser = db.transaction((userId, fields) => {
    const existing = stmts.getProviderForUser.get(userId);
    const at = nowIso();
    if (existing) {
      if (existing.issuer !== fields.issuer || existing.client_id !== fields.client_id) {
        stmts.deleteIdentitiesForProvider.run(existing.id);
      }
      stmts.updateProvider.run({ ...fields, id: existing.id, updated_at: at });
      return stmts.getProvider.get(existing.id);
    }
    const id = crypto.randomBytes(12).toString("base64url");
    stmts.insertProvider.run({ ...fields, id, owner_user_id: userId, created_at: at, updated_at: at });
    return stmts.getProvider.get(id);
  });

  const deleteProvider = db.transaction((providerId) => {
    stmts.deleteIdentitiesForProvider.run(providerId);
    stmts.deleteProvider.run(providerId);
  });

  // One identity per provider: linking again replaces the previous one.
  const linkIdentity = db.transaction(({ userId, providerId, issuer, subject, email }) => {
    const at = nowIso();
    stmts.deleteReplacedIdentities.run(providerId, userId, issuer, subject);
    stmts.insertIdentity.run(userId, providerId, issuer, subject, email || null, at, at);
  });

  return {
    getProvider: (id) => (typeof id === "string" ? stmts.getProvider.get(id) : undefined),
    getProviderForUser: (userId) => stmts.getProviderForUser.get(userId),
    saveProviderForUser,
    deleteProvider,
    anyLinkedProvider: () => !!stmts.anyLinkedProvider.get(),
    getIdentity: (issuer, subject) => stmts.getIdentity.get(issuer, subject),
    getIdentityForProvider: (providerId) => stmts.getIdentityForProvider.get(providerId),
    linkIdentity,
    touchIdentity: (id, email) => stmts.touchIdentity.run(email || null, nowIso(), id),
    unlinkProvider: (providerId) => stmts.deleteIdentitiesForProvider.run(providerId).changes > 0,
  };
}

module.exports = { createOidcStore };
