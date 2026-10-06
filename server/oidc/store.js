// server/oidc/store.js
//
// Data layer for OpenID Connect sign-in.
//
// Two tables, kept apart on purpose:
//
//   oidc_providers            the identity providers GlassKeep knows. An
//                             `owner_user_id` is a provider a user declared
//                             for their own account (one per account); NULL
//                             is the instance's provider, set up by an
//                             admin for everyone to link to (one at most).
//
//   user_external_identities  which GlassKeep account an external identity
//                             opens. The identity is the pair (issuer,
//                             subject), the only stable and unique handle
//                             OIDC guarantees. The email the provider
//                             reports is kept for display, never matched
//                             on: a provider may let people change it.
//                             An account has one at most: linking replaces
//                             whatever it had, so no forgotten second way
//                             in can linger.
//
// The client secret is stored like the federation shared secrets: in the
// clear in the database, never returned to a browser.

const crypto = require("crypto");

function nowIso() {
  return new Date().toISOString();
}

const providersTable = (name) => `
  CREATE TABLE IF NOT EXISTS ${name} (
    id TEXT PRIMARY KEY,
    owner_user_id INTEGER,                -- NULL: the instance's provider
    display_name TEXT NOT NULL,
    issuer TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    public_origin TEXT NOT NULL,          -- GlassKeep origin the callback lives on
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`;

// The table first required an owner. The instance's provider has none, and
// SQLite cannot relax a column constraint in place: the table is rebuilt
// the way SQLite documents it (copy, drop, rename the copy), which leaves
// the identities' foreign key pointing at the same name.
function allowInstanceProvider(db) {
  const owner = db.prepare(`PRAGMA table_info(oidc_providers)`).all()
    .find((c) => c.name === "owner_user_id");
  if (!owner?.notnull) return;
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        ${providersTable("oidc_providers_new")}
        INSERT INTO oidc_providers_new SELECT
          id, owner_user_id, display_name, issuer, client_id, client_secret, public_origin, created_at, updated_at
          FROM oidc_providers;
        DROP TABLE oidc_providers;
        ALTER TABLE oidc_providers_new RENAME TO oidc_providers;
      `);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

function createOidcStore(db) {
  db.exec(providersTable("oidc_providers"));
  allowInstanceProvider(db);
  db.exec(`
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
    getInstanceProvider: db.prepare(
      `SELECT * FROM oidc_providers WHERE owner_user_id IS NULL ORDER BY created_at ASC LIMIT 1`,
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
    // Whether at least one account can sign in through a provider the
    // policy allows, which is all the login screen needs to know to offer
    // the button. Personal providers only count when the policy allows them.
    anyUsableIdentity: db.prepare(`
      SELECT 1 FROM user_external_identities i
      JOIN oidc_providers p ON p.id = i.provider_id
      WHERE p.owner_user_id IS NULL OR (@personal = 1 AND p.owner_user_id = i.user_id)
      LIMIT 1
    `),

    getIdentity: db.prepare(
      `SELECT * FROM user_external_identities WHERE issuer = ? AND subject = ?`,
    ),
    getIdentityForUser: db.prepare(
      `SELECT * FROM user_external_identities WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
    ),
    countIdentitiesForProvider: db.prepare(
      `SELECT COUNT(*) AS n FROM user_external_identities WHERE provider_id = ?`,
    ),
    insertIdentity: db.prepare(`
      INSERT INTO user_external_identities
        (user_id, provider_id, issuer, subject, email, created_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    touchIdentity: db.prepare(
      `UPDATE user_external_identities SET email = ?, last_login_at = ? WHERE id = ?`,
    ),
    deleteIdentitiesForUser: db.prepare(`DELETE FROM user_external_identities WHERE user_id = ?`),
    deleteIdentitiesForProvider: db.prepare(
      `DELETE FROM user_external_identities WHERE provider_id = ?`,
    ),
  };

  const getOwnedProvider = (ownerId) => (
    ownerId == null ? stmts.getInstanceProvider.get() : stmts.getProviderForUser.get(ownerId)
  );

  // Creates or updates a provider: an account's own (`ownerId`) or the
  // instance's (`null`). A new issuer or client is a different
  // relationship: the identities linked through the old one no longer
  // prove anything, so they have to be linked again.
  const saveProvider = db.transaction((ownerId, fields) => {
    const existing = getOwnedProvider(ownerId);
    const at = nowIso();
    if (existing) {
      if (existing.issuer !== fields.issuer || existing.client_id !== fields.client_id) {
        stmts.deleteIdentitiesForProvider.run(existing.id);
      }
      stmts.updateProvider.run({ ...fields, id: existing.id, updated_at: at });
      return stmts.getProvider.get(existing.id);
    }
    const id = crypto.randomBytes(12).toString("base64url");
    stmts.insertProvider.run({ ...fields, id, owner_user_id: ownerId, created_at: at, updated_at: at });
    return stmts.getProvider.get(id);
  });

  const deleteProvider = db.transaction((providerId) => {
    stmts.deleteIdentitiesForProvider.run(providerId);
    stmts.deleteProvider.run(providerId);
  });

  // One identity per account: linking replaces the previous one, whatever
  // provider it came through.
  const linkIdentity = db.transaction(({ userId, providerId, issuer, subject, email }) => {
    const at = nowIso();
    stmts.deleteIdentitiesForUser.run(userId);
    stmts.insertIdentity.run(userId, providerId, issuer, subject, email || null, at, at);
  });

  return {
    getProvider: (id) => (typeof id === "string" ? stmts.getProvider.get(id) : undefined),
    getOwnedProvider,
    saveProvider,
    deleteProvider,
    anyUsableIdentity: ({ personal }) => !!stmts.anyUsableIdentity.get({ personal: personal ? 1 : 0 }),
    getIdentity: (issuer, subject) => stmts.getIdentity.get(issuer, subject),
    getIdentityForUser: (userId) => stmts.getIdentityForUser.get(userId),
    countIdentitiesForProvider: (providerId) => stmts.countIdentitiesForProvider.get(providerId).n,
    linkIdentity,
    touchIdentity: (id, email) => stmts.touchIdentity.run(email || null, nowIso(), id),
    unlinkUser: (userId) => stmts.deleteIdentitiesForUser.run(userId).changes > 0,
  };
}

module.exports = { createOidcStore };
