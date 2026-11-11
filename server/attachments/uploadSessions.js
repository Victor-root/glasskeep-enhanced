// server/attachments/uploadSessions.js
//
// Files sent in pieces of PIECE_BYTES, one request each. A reverse proxy in
// front of GlassKeep caps the size of a request (1 MB by default on nginx),
// far below what a file can weigh: pieces pass any of them, and a cut
// connection resumes from the last piece instead of starting over.
//
// Sessions live in memory: a restart loses them, and the client, told the
// session is gone, starts the file over.

const crypto = require("crypto");

const PIECE_BYTES = 512 * 1024;
const IDLE_MS = 30 * 60 * 1000;
const SWEEP_MS = 5 * 60 * 1000;

function createUploadSessions({ attachments, log = console }) {
  const sessions = new Map();

  async function begin({ userId, noteId, attachmentId, name, mime, size }) {
    const writer = await attachments.openPieceWriter();
    const id = crypto.randomUUID();
    sessions.set(id, { id, userId, noteId, attachmentId, name, mime, size, writer, next: 0, busy: false, touchedAt: Date.now() });
    return { uploadId: id, pieceSize: PIECE_BYTES, next: 0 };
  }

  // The session of `userId`, or null: a session id alone opens nothing.
  function get(id, userId) {
    const session = sessions.get(id);
    return session && session.userId === userId ? session : null;
  }

  async function drop(session) {
    sessions.delete(session.id);
    await session.writer.abort();
  }

  // Adds piece `index`. Returns the stored file once the last piece is in.
  async function add(session, index, piece, last) {
    session.busy = true;
    session.touchedAt = Date.now();
    try {
      await session.writer.append(piece, last);
      session.next = index + 1;
      if (!last) return null;
      sessions.delete(session.id);
      return await session.writer.finish();
    } finally {
      session.busy = false;
    }
  }

  setInterval(() => {
    const idleSince = Date.now() - IDLE_MS;
    for (const session of sessions.values()) {
      if (!session.busy && session.touchedAt < idleSince) {
        drop(session).catch((e) => log.warn?.(`[attachments] stale upload: ${e.message}`));
      }
    }
  }, SWEEP_MS).unref();

  return { begin, get, add, drop, PIECE_BYTES };
}

module.exports = { createUploadSessions, PIECE_BYTES };
