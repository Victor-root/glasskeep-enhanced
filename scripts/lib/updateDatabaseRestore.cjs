// scripts/lib/updateDatabaseRestore.cjs
//
// Puts the database back as it was before a failed Docker update, for
// docker-update-helper.cjs (self-update.sh does the same for native
// installs, in its restore_database).
//
// The new version copies the database before migrating it, whenever it
// opens one last opened by another build (server/db/dbSafety.js), naming
// the copy after that build. A copy named after the build being replaced
// and taken since the update started is that one. Without it, the old
// version could be restarted on a database the new one upgraded, which
// it may refuse to open. Nothing is touched when there is no such copy.

const fs = require("fs");
const path = require("path");

// Returns the copy restored, or null.
function restoreUpdateDatabase({ dbFile, fromLabel, since }) {
  if (!fromLabel) return null;
  const dir = path.join(path.dirname(dbFile), "backups");
  const suffix = `-from-${String(fromLabel).replace(/[^0-9A-Za-z.+-]/g, "_")}.db`;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const copy = names
    .filter((n) => n.startsWith("auto-") && n.endsWith(suffix))
    .filter((n) => fs.statSync(path.join(dir, n)).mtimeMs >= since)
    .sort()
    .pop();
  if (!copy) return null;
  fs.copyFileSync(path.join(dir, copy), `${dbFile}.rollback-tmp`);
  for (const journal of ["-wal", "-shm"]) fs.rmSync(dbFile + journal, { force: true });
  fs.renameSync(`${dbFile}.rollback-tmp`, dbFile);
  return copy;
}

module.exports = { restoreUpdateDatabase };
