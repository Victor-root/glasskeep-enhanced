// server/services/userStore.js
//
// Prepared statements over the users table, shared by the routes and
// the federation engine.

function createUserStore(db) {
  const insertUser = db.prepare(
    "INSERT INTO users (name,email,password_hash,created_at) VALUES (?,?,?,?)"
  );

  // No default admin account: admin must be created explicitly via install.sh
  // If the database is empty and no admin exists, the server starts but
  // login/register endpoints will be the only way to create users.
  // The install.sh script handles initial admin creation at install time.
  const getUserById = db.prepare("SELECT * FROM users WHERE id = ?");

  const getUserByEmail = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?)");
  const getUserByName = db.prepare("SELECT * FROM users WHERE lower(name)=lower(?)");
  // Real-account lookups that EXCLUDE federated shadow stand-ins. The roster
  // reconcile uses these to resolve a real local recipient by ref without ever
  // matching a shadow that happens to share a name (e.g. two different people
  // both called "Victor" on different servers).
  const getRealUserByEmail = db.prepare(
    "SELECT * FROM users WHERE lower(email)=lower(?) AND federated_origin IS NULL"
  );
  const getRealUserByName = db.prepare(
    "SELECT * FROM users WHERE lower(name)=lower(?) AND federated_origin IS NULL"
  );

  // Per-recipient language for the localized reminder text. NULL ("auto")
  // has no server-visible browser hint, so we fall back to English (the
  // app's canonical fallback). Users who set their language explicitly in
  // Settings get their reminder text in that language.
  const getUserLanguageStmt = db.prepare("SELECT language FROM users WHERE id = ?");
  const getLatestPushLangStmt = db.prepare(
    "SELECT lang FROM push_subscriptions WHERE user_id = ? AND lang IS NOT NULL ORDER BY id DESC LIMIT 1",
  );
  function getUserLanguage(userId) {
    try {
      // 1. Explicit profile language wins.
      const profileLang = getUserLanguageStmt.get(userId)?.language;
      if (profileLang === "fr" || profileLang === "en") return profileLang;
      // 2. "auto"-language users have no server-visible browser hint, so
      //    fall back to the locale reported by their most recent push
      //    subscription (the device's UI language).
      const subLang = getLatestPushLangStmt.get(userId)?.lang;
      if (subLang === "fr" || subLang === "en") return subLang;
    } catch {
      /* fall through to default */
    }
    return "en";
  }

  return {
    insertUser,
    getUserById,
    getUserByEmail,
    getUserByName,
    getRealUserByEmail,
    getRealUserByName,
    getUserLanguage,
  };
}

module.exports = { createUserStore };
