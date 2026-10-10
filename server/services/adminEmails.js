// server/services/adminEmails.js
//
// Accounts listed in ADMIN_EMAILS are made admins: the existing ones at
// boot, and a newly approved one as soon as it exists.

// Optionally promote admins from env (comma-separated)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Function to promote user to admin if they're in the admin list
function promoteToAdminIfNeeded(db, email) {
  if (ADMIN_EMAILS.length && ADMIN_EMAILS.includes(email.toLowerCase())) {
    const mkAdmin = db.prepare("UPDATE users SET is_admin=1 WHERE lower(email)=?");
    mkAdmin.run(email.toLowerCase());
    console.log(`Promoted user ${email} to admin`);
    return true;
  }
  return false;
}

// Promote existing users to admin on startup
function promoteExistingAdmins(db) {
  if (ADMIN_EMAILS.length) {
    console.log(`Admin emails configured: ${ADMIN_EMAILS.join(', ')}`);
    const mkAdmin = db.prepare("UPDATE users SET is_admin=1 WHERE lower(email)=?");
    for (const e of ADMIN_EMAILS) {
      const result = mkAdmin.run(e);
      if (result.changes > 0) {
        console.log(`Promoted existing user ${e} to admin`);
      }
    }
  }
}

module.exports = { promoteToAdminIfNeeded, promoteExistingAdmins };
