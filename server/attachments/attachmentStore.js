// server/attachments/attachmentStore.js
//
// Files attached to notes. A note's images live inside the note as data
// URLs, which suits small pictures but not a 50 MB PDF sent again with every
// save, so an attachment is two things kept apart:
//
//   - its bytes: one file on disk, next to the database, written once and
//     never changed. It stays out of SQLite so the copy taken of the
//     database at every version change does not grow with it.
//   - its reference: a note_attachments row carrying the name, the type and
//     the thumbnail, which belongs to one note and goes with it. Several
//     rows may share one file (the copy of a note a collaborator keeps).
//
// Rows change through their own routes, never through a note save: two
// devices adding a file at once must not overwrite each other, which a
// list saved with the note (last write wins) would do.
//
// At-rest encryption covers both: the file through fileCipher, the name and
// thumbnail through noteCipher. Files follow the instance's state in the
// background (encryptPendingFiles), each one atomically, so an interrupted
// pass only leaves work for the next unlock.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");
const runtime = require("../encryption/runtimeUnlockState");
const noteCipher = require("../encryption/noteCipher");
const { createEncryptStream, createDecryptStream } = require("./fileCipher");
const { nowISO } = require("../utils/timestamps");

const MAX_NAME_LENGTH = 255;
const MIME_RE = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/;
const STALE_UPLOAD_MS = 24 * 3600 * 1000;
// A file on disk without a row may be an upload finishing right now.
const ORPHAN_GRACE_MS = 3600 * 1000;
const SWEEP_EVERY_MS = 3600 * 1000;
const SWEEP_DELAY_MS = 5000;

class TooLargeError extends Error {}
class EncryptionTransitionError extends Error {}

function cleanName(name) {
  const base = String(name ?? "")
    .replace(/[\\/]/g, "_")
    // eslint-disable-next-line no-control-regex -- a name goes into headers and onto the screen
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return base && base !== "." && base !== ".." ? base : "file";
}

function cleanMime(mime) {
  const m = String(mime ?? "").split(";")[0].trim().toLowerCase();
  return MIME_RE.test(m) ? m : "application/octet-stream";
}

function createAttachmentStore({ db, dbFile, log = console }) {
  const dir = process.env.ATTACHMENTS_DIR || path.join(path.dirname(dbFile), "note-files");
  const tmpDir = path.join(dir, "tmp");
  fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });

  const q = {
    insertFile: db.prepare(`INSERT INTO attachment_files (id, size, sha256, is_encrypted, remote_link_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`),
    getFile: db.prepare(`SELECT * FROM attachment_files WHERE id = ?`),
    insertRow: db.prepare(`INSERT INTO note_attachments (id, note_id, file_id, uploaded_by, created_at, meta_json, enc_payload) VALUES (?, ?, ?, ?, ?, ?, ?)`),
    getRow: db.prepare(`SELECT a.*, f.size, f.sha256 FROM note_attachments a JOIN attachment_files f ON f.id = a.file_id WHERE a.id = ?`),
    listRows: db.prepare(`SELECT a.*, f.size, f.sha256 FROM note_attachments a JOIN attachment_files f ON f.id = a.file_id WHERE a.note_id = ? ORDER BY a.created_at, a.id`),
    countRows: db.prepare(`SELECT COUNT(*) AS n FROM note_attachments WHERE note_id = ?`),
    deleteRow: db.prepare(`DELETE FROM note_attachments WHERE id = ? AND note_id = ?`),
    updateMeta: db.prepare(`UPDATE note_attachments SET meta_json = ?, enc_payload = ? WHERE id = ?`),
    filesToEncrypt: db.prepare(`SELECT * FROM attachment_files WHERE is_encrypted = 0 AND remote_link_id IS NULL`),
    filesToDecrypt: db.prepare(`SELECT * FROM attachment_files WHERE is_encrypted = 1`),
    setFileEncrypted: db.prepare(`UPDATE attachment_files SET is_encrypted = ? WHERE id = ?`),
    setFileLocal: db.prepare(`UPDATE attachment_files SET remote_link_id = NULL, is_encrypted = ? WHERE id = ?`),
    unreferencedFiles: db.prepare(`SELECT f.id FROM attachment_files f WHERE NOT EXISTS (SELECT 1 FROM note_attachments a WHERE a.file_id = f.id)`),
    deleteFile: db.prepare(`DELETE FROM attachment_files WHERE id = ?`),
    allFileIds: db.prepare(`SELECT id FROM attachment_files`),
    totalSize: db.prepare(`SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(*) AS files FROM attachment_files`),
    plainMetaRows: db.prepare(`SELECT id, note_id, meta_json FROM note_attachments WHERE enc_payload IS NULL`),
    sealedMetaRows: db.prepare(`SELECT id, note_id, enc_payload FROM note_attachments WHERE enc_payload IS NOT NULL`),
  };

  const filePath = (fileId) => path.join(dir, fileId.slice(0, 2), fileId);
  const tmpPath = (fileId) => path.join(tmpDir, `${fileId}.${crypto.randomUUID()}`);

  // A copy of the key per stream: locking the instance wipes the DEK in
  // place, under the feet of any file still being read or written.
  const currentKey = () => Buffer.from(runtime.getDek());

  let uploadsInFlight = 0;
  let filesOnHold = false;
  let encryptPass = null;

  // ── Metadata ────────────────────────────────────────────────────────
  function sealMeta(noteId, attachmentId, meta) {
    const json = JSON.stringify(meta);
    if (!noteCipher.isActive()) return { meta_json: json, enc_payload: null };
    return { meta_json: "{}", enc_payload: noteCipher.encryptAttachmentMeta(json, { noteId, attachmentId }) };
  }

  function openMeta(row) {
    const json = row.enc_payload
      ? noteCipher.decryptAttachmentMeta(row.enc_payload, { noteId: row.note_id, attachmentId: row.id })
      : row.meta_json;
    return JSON.parse(json);
  }

  function publicShape(row) {
    const meta = openMeta(row);
    return {
      id: row.id,
      name: meta.name,
      mime: meta.mime,
      size: row.size,
      thumb: meta.thumb || null,
      createdAt: row.created_at,
    };
  }

  // ── Bytes ───────────────────────────────────────────────────────────
  // Writes `source` to a new file and registers it. `maxBytes` is checked as
  // the bytes arrive: a Content-Length is only a claim.
  async function writeFile(source, { maxBytes, expectedSha256, fileId = crypto.randomUUID(), remoteLinkId = null } = {}) {
    if (filesOnHold) throw new EncryptionTransitionError("Encryption is changing state");
    uploadsInFlight++;
    const tmp = tmpPath(fileId);
    const encrypted = noteCipher.isActive();
    const hash = crypto.createHash("sha256");
    let size = 0;
    const meter = new Transform({
      transform(chunk, _enc, done) {
        size += chunk.length;
        if (maxBytes && size > maxBytes) return done(new TooLargeError("File too large"));
        hash.update(chunk);
        done(null, chunk);
      },
    });
    // Fed by hand rather than through pipeline(), which destroys its source
    // on failure: for a request that means cutting the connection instead of
    // answering 413. A source that dies midway still fails the write.
    const onClose = () => {
      if (!source.readableEnded) meter.destroy(new Error("Source closed early"));
    };
    source.once("close", onClose);
    try {
      source.pipe(meter);
      const stages = [meter];
      if (encrypted) stages.push(createEncryptStream(currentKey(), fileId));
      stages.push(fs.createWriteStream(tmp, { mode: 0o600, flags: "wx" }));
      await pipeline(stages);
      const sha256 = hash.digest("hex");
      if (expectedSha256 && sha256 !== expectedSha256) throw new Error("Checksum mismatch");
      const final = filePath(fileId);
      await fs.promises.mkdir(path.dirname(final), { recursive: true, mode: 0o700 });
      await fs.promises.rename(tmp, final);
      return { fileId, size, sha256, encrypted, remoteLinkId };
    } catch (e) {
      await fs.promises.rm(tmp, { force: true }).catch(() => {});
      throw e;
    } finally {
      source.removeListener("close", onClose);
      source.unpipe(meter);
      uploadsInFlight--;
    }
  }

  function registerFile({ fileId, size, sha256, encrypted, remoteLinkId = null }) {
    q.insertFile.run(fileId, size, sha256, encrypted ? 1 : 0, remoteLinkId, nowISO());
  }

  // The file's plaintext. Throws on a file that is not on this server.
  function openFile(fileId) {
    const file = q.getFile.get(fileId);
    if (!file) throw new Error("Unknown attachment file");
    const raw = fs.createReadStream(filePath(fileId));
    if (!file.is_encrypted) return raw;
    const plain = createDecryptStream(currentKey(), fileId);
    raw.on("error", (e) => plain.destroy(e));
    return raw.pipe(plain);
  }

  // ── Attachments ─────────────────────────────────────────────────────
  function count(noteId) {
    return q.countRows.get(noteId).n;
  }

  // Adds a stored file to a note and hands back what the client shows.
  function attach(noteId, stored, { id, name, mime, thumb, uploadedBy }) {
    const attachmentId = id || crypto.randomUUID();
    const sealed = sealMeta(noteId, attachmentId, { name: cleanName(name), mime: cleanMime(mime), thumb: thumb || null });
    const createdAt = nowISO();
    db.transaction(() => {
      if (!q.getFile.get(stored.fileId)) registerFile(stored);
      q.insertRow.run(attachmentId, noteId, stored.fileId, uploadedBy ?? null, createdAt, sealed.meta_json, sealed.enc_payload);
    })();
    return publicShape(q.getRow.get(attachmentId));
  }

  function list(noteId) {
    return q.listRows.all(noteId).map(publicShape);
  }

  function get(attachmentId) {
    const row = q.getRow.get(attachmentId);
    if (!row) return null;
    return { ...publicShape(row), noteId: row.note_id, fileId: row.file_id, sha256: row.sha256 };
  }

  function setThumb(noteId, attachmentId, thumb) {
    const row = q.getRow.get(attachmentId);
    if (!row || row.note_id !== noteId) return false;
    const sealed = sealMeta(noteId, attachmentId, { ...openMeta(row), thumb });
    q.updateMeta.run(sealed.meta_json, sealed.enc_payload, attachmentId);
    return true;
  }

  function remove(noteId, attachmentId) {
    const removed = q.deleteRow.run(attachmentId, noteId).changes > 0;
    if (removed) scheduleSweep();
    return removed;
  }

  // The attachments of one note for another (a copy kept when a share ends,
  // the trashed copy of a collaborator leaving). The files are shared.
  function copyToNote(fromNoteId, toNoteId, uploadedBy) {
    db.transaction(() => {
      for (const row of q.listRows.all(fromNoteId)) {
        const copyId = crypto.randomUUID();
        const sealed = sealMeta(toNoteId, copyId, openMeta(row));
        q.insertRow.run(copyId, toNoteId, row.file_id, uploadedBy ?? row.uploaded_by, row.created_at, sealed.meta_json, sealed.enc_payload);
      }
    })();
  }

  // ── Encryption state ────────────────────────────────────────────────
  // In the same transaction as the notes: see encryptAllRows.
  function sealAllMeta() {
    for (const row of q.plainMetaRows.all()) {
      const enc = noteCipher.encryptAttachmentMeta(row.meta_json, { noteId: row.note_id, attachmentId: row.id });
      q.updateMeta.run("{}", enc, row.id);
    }
  }

  function openAllMeta() {
    for (const row of q.sealedMetaRows.all()) {
      const json = noteCipher.decryptAttachmentMeta(row.enc_payload, { noteId: row.note_id, attachmentId: row.id });
      q.updateMeta.run(json, null, row.id);
    }
  }

  // Rewrites one file on the disk through `transform`, atomically.
  async function rewriteFile(file, transform, encrypted) {
    const final = filePath(file.id);
    const tmp = tmpPath(file.id);
    try {
      await pipeline(fs.createReadStream(final), transform, fs.createWriteStream(tmp, { mode: 0o600, flags: "wx" }));
      await fs.promises.rename(tmp, final);
      q.setFileEncrypted.run(encrypted ? 1 : 0, file.id);
    } catch (e) {
      await fs.promises.rm(tmp, { force: true }).catch(() => {});
      throw e;
    }
  }

  // Background pass, after activation and after every unlock. A failure is
  // logged and left to the next unlock: the file stays readable either way.
  function encryptPendingFiles() {
    if (encryptPass) return encryptPass;
    encryptPass = (async () => {
      for (const file of q.filesToEncrypt.all()) {
        if (!noteCipher.isActive()) return;
        try {
          await rewriteFile(file, createEncryptStream(currentKey(), file.id), true);
        } catch (e) {
          log.warn?.(`[attachments] could not encrypt ${file.id}: ${e.message}`);
        }
      }
    })().finally(() => { encryptPass = null; });
    return encryptPass;
  }

  // Deactivation. Every file comes back to plaintext while the key is still
  // there, with new files held off for the duration: one written encrypted
  // after this pass would be lost with the key. Call releaseFiles() once the
  // rows are done, whatever happened.
  async function decryptAllFiles() {
    filesOnHold = true;
    if (encryptPass) await encryptPass;
    while (uploadsInFlight > 0) await new Promise((r) => setTimeout(r, 50));
    for (const file of q.filesToDecrypt.all()) {
      await rewriteFile(file, createDecryptStream(currentKey(), file.id), false);
    }
  }

  function releaseFiles() {
    filesOnHold = false;
  }

  // ── Housekeeping ────────────────────────────────────────────────────
  // Rows go with their note through ON DELETE CASCADE, the files they
  // leave behind go here, along with what a crash left on the disk.
  async function sweep() {
    for (const { id } of q.unreferencedFiles.all()) {
      await fs.promises.rm(filePath(id), { force: true }).catch(() => {});
      q.deleteFile.run(id);
    }
    const known = new Set(q.allFileIds.all().map((f) => f.id));
    const now = Date.now();
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const shard of entries) {
      if (!shard.isDirectory()) continue;
      const shardPath = path.join(dir, shard.name);
      const grace = shard.name === "tmp" ? STALE_UPLOAD_MS : ORPHAN_GRACE_MS;
      for (const name of await fs.promises.readdir(shardPath)) {
        if (shard.name !== "tmp" && known.has(name)) continue;
        const full = path.join(shardPath, name);
        const stat = await fs.promises.stat(full).catch(() => null);
        if (stat && now - stat.mtimeMs > grace) await fs.promises.rm(full, { force: true }).catch(() => {});
      }
    }
  }

  let sweepTimer = null;
  function scheduleSweep() {
    if (sweepTimer) return;
    sweepTimer = setTimeout(() => {
      sweepTimer = null;
      sweep().catch((e) => log.warn?.(`[attachments] sweep: ${e.message}`));
    }, SWEEP_DELAY_MS);
    sweepTimer.unref();
  }

  function startSweeping() {
    scheduleSweep();
    setInterval(scheduleSweep, SWEEP_EVERY_MS).unref();
  }

  return {
    writeFile,
    openFile,
    attach,
    list,
    get,
    count,
    setThumb,
    remove,
    copyToNote,
    usage: () => q.totalSize.get(),
    sealAllMeta,
    openAllMeta,
    encryptPendingFiles,
    decryptAllFiles,
    releaseFiles,
    sweep,
    scheduleSweep,
    startSweeping,
    getFile: (fileId) => q.getFile.get(fileId),
    filePath,
  };
}

module.exports = { createAttachmentStore, TooLargeError, EncryptionTransitionError };
