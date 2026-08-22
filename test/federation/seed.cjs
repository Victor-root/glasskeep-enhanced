// Crée les comptes attendus par les scénarios. Le serveur a déjà créé le
// schéma au démarrage, donc on se contente d'insérer.
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const Database = require(path.join(ROOT, "node_modules", "better-sqlite3"));
const bcrypt = require(path.join(ROOT, "node_modules", "bcryptjs"));

const [file, side] = process.argv.slice(2);
const people = side === "alpha"
  ? [["Adminalpha", "admin@alpha.test", "Passw0rd-alpha", 1], ["Alice", "alice@alpha.test", "Passw0rd-alice", 0]]
  : [["Adminbeta", "admin@beta.test", "Passw0rd-beta", 1], ["Bob", "bob@beta.test", "Passw0rd-bob", 0]];

const db = new Database(file);
for (const [name, email, password, admin] of people) {
  if (db.prepare("SELECT 1 FROM users WHERE lower(email)=lower(?)").get(email)) continue;
  db.prepare("INSERT INTO users (name,email,password_hash,created_at,is_admin) VALUES (?,?,?,?,?)")
    .run(name, email, bcrypt.hashSync(password, 10), new Date().toISOString(), admin);
}
console.log(`  ${side}: ${people.map((p) => p[1]).join(", ")}`);
