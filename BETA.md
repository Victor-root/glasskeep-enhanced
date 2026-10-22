# 🧪 The beta channel

Betas let testers try new features before a release, from the admin panel, without a command line, on native and Docker installs alike. This page covers how they reach instances, how to publish one, and how the data is kept safe when an instance goes back to the stable release.

---

## 👤 For the people testing

In the admin panel, **Server version → Update channel**:

* **Beta**: GlassKeep backs the database up (`data/backups/before-beta.db`), then installs the latest beta with the one-click update. Later betas are offered like any update. The panel shows the version with its commit (`v2.8.0-beta+abc1234`) and a **Beta** badge.
* **Stable**: from a beta, the panel asks how to leave it, offering only what is safe:
  * **Go back now**, when the latest stable release reads the beta's data. Nothing is lost.
  * **Go back now and restore my data**, when it cannot: the backup taken before the beta is restored, so what was created or changed since is lost (a copy is kept in `data/backups/`). Never picked in advance.
  * **Wait for the next stable release**, always possible: the beta stays until a newer stable release replaces it, like a normal update.

Betas install through the one-click update: a native install under systemd, or Docker with the Docker socket mounted (as in the provided `docker-compose.yml`). The manual update commands only ever install the latest release.

---

## 🧑‍💻 Publishing a beta

1. Bring the `beta` branch up to date with what is to be tested (create it from `main` the first time).
2. Give `package.json` a **pre-release version**: `2.8.0-beta`. The workflow refuses anything else. The same version can stay across every push of that beta: instances tell the pushes apart by their commit.
3. Push. The **Validate and publish a beta** workflow (`.github/workflows/beta.yml`) then:
   1. checks the version, runs `npm test` and the functional scenarios;
   2. runs the **rollback test** against the latest stable release (see below);
   3. publishes the Docker images `ghcr.io/victor-root/glasskeep-enhanced:beta-<commit>` and `:beta`;
   4. moves the `beta-validated` branch to the commit.

   Instances only read `beta-validated`. A red run publishes nothing, and testers stay on the previous beta.
4. To release: merge into `main`, set the version without a suffix (`2.8.0`), tag `v2.8.0` and publish the release as usual. Instances on a beta get it as an ordinary update, since `2.8.0` is newer than `2.8.0-beta`.

Never push a pre-release **tag** (`v2.8.0-beta.1`) as a way to publish a beta: betas go through the branch. As a safety net, `latest` and `install.sh` skip such tags anyway.

---

## 🛡️ Keeping data safe across versions

When an instance goes back from a beta to the stable release, the stable release reopens **the database the beta used**. Whether that works depends on what the beta changed.

### ✅ Safe changes (the vast majority)

* Adding a table, or a column with a default value: older releases ignore it.
* Adding a field to the data of a note that older releases keep when they save it (checklist sections and indents are an example: older releases copied items as they were).

### ⚠️ Changes that break going back

Real examples from this project's history:

* **Converting existing data in place**: the rich text editor (April 2026) stores text notes in a new format. A release from before would show them as code, and saving them there would damage them.
* **Moving data elsewhere**: per-user tags, note order and logos moved to their own tables. A release from before reads the old place, shows stale data, and what it changes is ignored once the newer release is back.
* **Rebuilding a table with a different key**: federated notes (June 2026).
* **Encrypting data**: at-rest encryption, unreadable to a release from before.
* **Raising the browser cache version** (`DB_VERSION` in `src/sync/localDb.js`): an older app cannot open a newer cache, so offline mode breaks until the site data is cleared.

### 🔢 The format level (`dbCompat`)

`package.json` declares the database format level a release writes:

```json
"glasskeep": { "dbCompat": 1 }
```

**Raise it by one** in the change that breaks going back, as listed above. Additions never raise it. The database remembers the highest level that opened it (SQLite's `PRAGMA user_version`), and then:

* a release that finds a level above its own **refuses to start**, with a message naming the backups, instead of misreading or damaging the data;
* the panel only offers **Go back now** when the stable release's level covers the database's, and **restore** or **wait** otherwise.

### 🧪 The rollback test

`test/rollback/rollback.mjs` (`npm run test:rollback -- <stable copy>`) is the proof the workflow asks for. The beta fills a database with every kind of data (rich text, checklists with sections and indents, tags, images, icon, archive, trash, reminder, share, settings), then the latest stable release reopens it and must return everything as stored; what it changes must then show in the beta. It also checks the beta kept every table and column of a fresh stable database, with the same type, and did not raise the browser cache version.

When it fails on purpose (an intended format change), raise `dbCompat`: the test then only checks that the stable release refuses the database cleanly, and the panel will offer restore or wait.

### 💾 Backups

* `data/backups/auto-<date>-from-<version>.db`: a copy taken before any migration, whenever a different version opens the database. The last five are kept.
* `data/backups/before-beta.db`: taken when entering the beta, kept until the next time.

They are complete SQLite databases (encrypted notes stay encrypted). To restore one by hand: stop GlassKeep, copy it over `data/notes.db`, delete `data/notes.db-wal` and `data/notes.db-shm` if present, start GlassKeep again. Each copy takes as much space as the database itself.
