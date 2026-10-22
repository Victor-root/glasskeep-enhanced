// Le script de mise à jour native et ses cibles: une version publiée ou
// une bêta désignée par son commit.
//
// Le vrai scripts/self-update.sh tourne dans un bac à sable: un dépôt
// d'origine local avec des versions et une branche bêta, une installation
// clonée dedans, et de faux systemctl / npm / apt-get / renice qui ne
// font que répondre. Chaque version du dépôt signe la fin de son script,
// ce qui montre lequel a terminé (le passage de main à la nouvelle
// version).
//
// Les règles vérifiées ici: une bêta s'installe par son commit, même à
// numéro de version égal; le panneau voit la bêta étiquetée avec son
// commit; une bêta déjà en place n'est pas retéléchargée; on redescend
// d'une bêta vers une version publiée; un commit invalide ou introuvable,
// ou un numéro qui ne correspond pas, ne laisse rien de cassé; une version
// qui a converti la base puis échoue au redémarrage laisse la base d'avant.
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { runner } from "../federation/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const SCRIPT = readFileSync(path.join(ROOT, "scripts", "self-update.sh"), "utf8");
const t = runner("Le script de mise à jour native et ses cibles");

const bac = mkdtempSync(path.join(tmpdir(), "gk-selfupdate-"));
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

try {
  // Faux outils système.
  const stub = path.join(bac, "stub");
  mkdirSync(stub);
  for (const outil of ["npm", "apt-get", "renice"]) {
    writeFileSync(path.join(stub, outil), `#!/bin/sh\necho "[stub] ${outil} $*"\nexit 0\n`);
    chmodSync(path.join(stub, outil), 0o755);
  }
  // Avec GK_ECHEC, le premier redémarrage joue une nouvelle version qui
  // copie la base puis la convertit (comme db/dbSafety.js), et le service
  // ne tient pas.
  writeFileSync(path.join(stub, "systemctl"), `#!/bin/sh
echo "[stub] systemctl $*"
if [ -n "$GK_ECHEC" ]; then
  if [ "$1" = restart ] && [ ! -f "$GK_ECHEC/redemarre" ]; then
    touch "$GK_ECHEC/redemarre"
    cp "$DATA_DIR/notes.db" "$DATA_DIR/backups/auto-2099-01-01-from-$GK_DEPUIS.db"
    echo "base convertie" > "$DATA_DIR/notes.db"
  fi
  [ "$1" = is-active ] && exit 3
fi
exit 0
`);
  chmodSync(path.join(stub, "systemctl"), 0o755);

  // Le dépôt d'origine: v1.0.0, v2.0.0, puis deux envois de la même bêta.
  const origin = path.join(bac, "origin.git");
  git(bac, "init", "-q", "--bare", origin);
  git(origin, "config", "uploadpack.allowAnySHA1InWant", "true");
  const work = path.join(bac, "work");
  git(bac, "clone", "-q", origin, work);
  git(work, "config", "user.email", "t@t");
  git(work, "config", "user.name", "t");
  mkdirSync(path.join(work, "scripts"));
  const version = (nom, v) => {
    writeFileSync(path.join(work, "scripts", "self-update.sh"),
      SCRIPT.replace('echo "[self-update] done."', `echo "[self-update] done (${nom} script)."`));
    writeFileSync(path.join(work, "package.json"), JSON.stringify({ version: v }));
    git(work, "add", "-A");
    git(work, "commit", "-q", "-m", nom);
    return git(work, "rev-parse", "HEAD");
  };
  const v1 = version("v1", "1.0.0");
  git(work, "tag", "v1.0.0");
  const v2 = version("v2", "2.0.0");
  git(work, "tag", "v2.0.0");
  const b1 = version("b1", "2.1.0-beta");
  const b2 = version("b2", "2.1.0-beta");
  git(work, "push", "-q", "origin", "HEAD:refs/heads/beta", "--tags");

  const app = path.join(bac, "app");
  git(bac, "clone", "-q", "--branch", "v1.0.0", origin, app);
  const data = path.join(bac, "data");
  mkdirSync(data);

  const lancer = ({ version: cible, commit, env = {} }) => {
    if (cible) writeFileSync(path.join(data, ".update-target-version"), cible);
    if (commit) writeFileSync(path.join(data, ".update-target-commit"), commit);
    const r = spawnSync("bash", [path.join(app, "scripts", "self-update.sh")], {
      env: { ...process.env, PATH: `${stub}:${process.env.PATH}`, INSTALL_DIR: app, DATA_DIR: data, ...env },
      encoding: "utf8",
    });
    spawnSync("sleep", ["0.3"]);
    return {
      code: r.status,
      statut: JSON.parse(readFileSync(path.join(data, ".update-status.json"), "utf8")),
      journal: readFileSync(path.join(data, ".update.log"), "utf8"),
      head: git(app, "rev-parse", "HEAD"),
    };
  };
  const court = (c) => c.slice(0, 7);

  let r = lancer({ version: "2.1.0-beta", commit: b1 });
  t.check("une bêta s'installe par son commit, et c'est son propre script qui termine",
    r.code === 0 && r.head === b1 && r.statut.state === "success" && r.journal.includes("done (b1 script)"),
    r.journal.split("\n").filter((l) => !l.includes("[stub]")).join(" | "));
  t.check("le panneau voit d'où l'on part et la bêta étiquetée avec son commit",
    r.statut.fromVersion === "1.0.0" && r.statut.toVersion === `2.1.0-beta+${court(b1)}`, JSON.stringify(r.statut));

  r = lancer({ version: "2.1.0-beta", commit: b2 });
  t.check("un nouvel envoi de la même bêta s'installe malgré le même numéro",
    r.code === 0 && r.head === b2 && r.statut.fromVersion === `2.1.0-beta+${court(b1)}`
      && r.statut.toVersion === `2.1.0-beta+${court(b2)}`, JSON.stringify(r.statut));

  r = lancer({ version: "2.1.0-beta", commit: b2 });
  t.check("une bêta déjà en place n'est pas retéléchargée",
    r.code === 0 && r.head === b2 && r.journal.includes(`already on ${b2}: nothing to download`));

  r = lancer({ version: "2.0.0" });
  t.check("on redescend d'une bêta vers une version publiée",
    r.code === 0 && r.head === v2 && r.statut.toVersion === "2.0.0" && r.journal.includes("done (v2 script)")
      && !existsSync(path.join(data, ".update-target-commit")), JSON.stringify(r.statut));

  const echec = path.join(bac, "echec");
  mkdirSync(echec);
  mkdirSync(path.join(data, "backups"));
  writeFileSync(path.join(data, "notes.db"), "base d'avant");
  writeFileSync(path.join(data, "backups", "auto-2000-01-01-from-2.0.0.db"), "vieille copie");
  spawnSync("sleep", ["1"]);
  r = lancer({ version: "2.1.0-beta", commit: b1, env: { GK_ECHEC: echec, GK_DEPUIS: "2.0.0" } });
  t.check("une version qui a converti la base puis ne tient pas laisse la base d'avant, pas une copie plus ancienne",
    r.code !== 0 && r.head === v2 && r.statut.state === "rolled_back"
      && readFileSync(path.join(data, "notes.db"), "utf8") === "base d'avant",
    `${r.statut.state} ${readFileSync(path.join(data, "notes.db"), "utf8")}`);

  r = lancer({ version: "2.1.0-beta", commit: "pas-un-commit" });
  t.check("un commit invalide est refusé avant de toucher à quoi que ce soit",
    r.code !== 0 && r.head === v2 && r.statut.state === "error" && r.statut.error === "invalid target commit");

  r = lancer({ version: "2.1.0-beta", commit: "f".repeat(40) });
  t.check("un commit introuvable fait revenir à la version d'avant",
    r.code !== 0 && r.head === v2 && r.statut.state === "rolled_back", JSON.stringify(r.statut));

  r = lancer({ version: "9.9.9", commit: b1 });
  t.check("un commit qui n'a pas le numéro annoncé fait revenir à la version d'avant",
    r.code !== 0 && r.head === v2 && r.statut.state === "rolled_back" && /reports version 2\.1\.0-beta/.test(r.statut.error),
    JSON.stringify(r.statut));
  t.check("les cibles sont consommées à chaque lancement",
    !existsSync(path.join(data, ".update-target-version")) && !existsSync(path.join(data, ".update-target-commit")));
  void v1;
} finally {
  rmSync(bac, { recursive: true, force: true });
}

process.exit(t.summary() ? 0 : 1);
