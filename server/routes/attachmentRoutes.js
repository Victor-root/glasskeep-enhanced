// server/routes/attachmentRoutes.js
//
// Adding, removing and opening the files attached to a note. See
// server/attachments/attachmentStore.js for how they are kept.

const fs = require("fs");
const { pipeline } = require("stream/promises");
const { EncryptionTransitionError, ID_RE, THUMB_RE } = require("../attachments/attachmentStore");
const { createUploadSessions } = require("../attachments/uploadSessions");

const MAX_PER_NOTE = 100;
const MAX_THUMB_LENGTH = 64 * 1024;

// Shown by the browser in place, with the app's scripts out of reach. The
// rest (HTML and SVG above all, which would run on this origin) can only
// be saved, whatever the name or type it was uploaded under.
const INLINE_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp",
  "application/pdf", "text/plain",
]);

// The PDF viewer of Chromium browsers refuses a sandboxed page, and has no
// access to the origin anyway.
const SANDBOXED = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";
const PDF_POLICY = "default-src 'none'; object-src 'self'; style-src 'unsafe-inline'";

// The whole body of a request, or null past `limit` bytes.
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.removeAllListeners("data");
        req.resume();
        resolve(null);
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => resolve(size > limit ? null : Buffer.concat(chunks, size)));
    req.on("error", reject);
  });
}

function contentDisposition(kind, name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function attachAttachmentRoutes(app, deps) {
  const {
    auth,
    adminOnly,
    attachments,
    downloadLinks,
    getAdminSettings,
    getNoteWithCollaboration,
    getUserById,
    currentTokenVersion,
    isCollabReadOnly,
    markEditedBy,
    broadcastNoteAttachments,
    noteFederation,
  } = deps;

  const uploads = createUploadSessions({ attachments });
  const maxBytes = () => (getAdminSettings().attachmentMaxMb || 0) * 1024 * 1024;

  // The note the requester may change, or the refusal already sent. A
  // read-only share and a mirror cut off from its server are refused
  // outright: unlike a note save, this is a deliberate action the user has
  // to hear about.
  function writableNote(req, res) {
    const note = getNoteWithCollaboration.get(req.user.id, req.params.id, req.user.id);
    if (!note) {
      res.status(404).json({ error: "Note not found" });
      return null;
    }
    if (noteFederation?.isReadOnly(note.id) || isCollabReadOnly(note.id, req.user.id)) {
      res.status(403).json({ error: "This note is read-only." });
      return null;
    }
    if (note.trashed) {
      res.status(409).json({ error: "This note is in the trash." });
      return null;
    }
    return note;
  }

  const tellFederation = (noteId, change) =>
    noteFederation ? noteFederation.onAttachmentChanged(noteId, change) : Promise.resolve(true);

  function changed(noteId, user) {
    markEditedBy(noteId, user);
    broadcastNoteAttachments(noteId);
  }

  app.get("/api/attachments/config", auth, (_req, res) => {
    res.json({ maxBytes: maxBytes(), maxPerNote: MAX_PER_NOTE });
  });

  app.get("/api/admin/attachments/usage", auth, adminOnly, (_req, res) => {
    res.json(attachments.usage());
  });

  // A file starts with what it is; its bytes follow in pieces (see
  // attachments/uploadSessions.js). The id is the client's, so a retry after
  // a lost answer changes nothing.
  app.post("/api/notes/:id/attachments", auth, async (req, res) => {
    const note = writableNote(req, res);
    if (!note) return;

    const limit = maxBytes();
    if (!limit) return res.status(403).json({ error: "Attachments are turned off on this server." });
    const { id, name, type, size } = req.body || {};
    if (!ID_RE.test(String(id || ""))) return res.status(400).json({ error: "Invalid attachment id." });
    if (!Number.isSafeInteger(size) || size < 0) return res.status(400).json({ error: "Invalid file size." });
    if (size > limit) return res.status(413).json({ error: "File too large.", maxBytes: limit });
    const known = attachments.get(id);
    if (known) {
      if (known.noteId !== note.id) return res.status(409).json({ error: "Attachment id already in use." });
      return res.json({ attachment: known });
    }
    if (attachments.count(note.id) >= MAX_PER_NOTE) {
      return res.status(409).json({ error: "This note has too many attachments." });
    }
    try {
      const upload = await uploads.begin({ userId: req.user.id, noteId: note.id, attachmentId: id, name: String(name ?? ""), mime: type, size });
      res.status(201).json(upload);
    } catch (e) {
      if (e instanceof EncryptionTransitionError) return res.status(503).json({ error: "Try again in a moment." });
      console.error("[attachments] upload start failed", e);
      res.status(500).json({ error: "Could not store the file." });
    }
  });

  // Where an upload has got to, to resume it.
  app.get("/api/attachment-uploads/:uploadId", auth, (req, res) => {
    const session = uploads.get(req.params.uploadId, req.user.id);
    if (!session) return res.status(404).json({ error: "Upload not found" });
    res.json({ next: session.next, pieceSize: uploads.PIECE_BYTES });
  });

  // One piece, as the raw body. X-Last marks the final one, which completes
  // the file and attaches it.
  app.put("/api/attachment-uploads/:uploadId/:index", auth, async (req, res) => {
    const session = uploads.get(req.params.uploadId, req.user.id);
    if (!session) return res.status(404).json({ error: "Upload not found" });
    const index = Number(req.params.index);
    if (session.busy) return res.status(409).json({ error: "Upload busy", next: session.next });
    // A piece already taken (its answer was lost) is simply acknowledged.
    if (index < session.next) {
      req.resume();
      return res.json({ next: session.next });
    }
    if (index !== session.next) return res.status(409).json({ error: "Unexpected piece", next: session.next });

    const piece = await readBody(req, uploads.PIECE_BYTES);
    if (!piece) {
      await uploads.drop(session);
      return res.status(413).json({ error: "Piece too large.", pieceSize: uploads.PIECE_BYTES });
    }
    const last = req.headers["x-last"] === "1";
    if (session.writer.size + piece.length > session.size || (last && session.writer.size + piece.length !== session.size)) {
      await uploads.drop(session);
      return res.status(400).json({ error: "The file does not match its announced size." });
    }

    try {
      const stored = await uploads.add(session, index, piece, last);
      if (!stored) return res.json({ next: session.next });
      const note = getNoteWithCollaboration.get(req.user.id, session.noteId, req.user.id);
      if (!note) {
        await fs.promises.rm(attachments.filePath(stored.fileId), { force: true });
        return res.status(404).json({ error: "Note not found" });
      }
      const attachment = attachments.attach(note.id, stored, {
        id: session.attachmentId,
        name: session.name,
        mime: session.mime,
        uploadedBy: req.user.id,
      });
      // On a mirror the note's own server has to take it, or nobody else
      // will ever see the file: better to say so now.
      if (!(await tellFederation(note.id, { add: attachments.peerItem(attachment.id) }))) {
        attachments.remove(note.id, attachment.id);
        return res.status(503).json({ error: "The server of this note can't be reached." });
      }
      changed(note.id, req.user);
      res.status(201).json({ attachment });
    } catch (e) {
      await uploads.drop(session).catch(() => {});
      if (res.headersSent) return;
      console.error("[attachments] upload failed", e);
      res.status(500).json({ error: "Could not store the file." });
    }
  });

  // The thumbnail arrives after the file: it is built by the client and has
  // no room in a raw upload.
  app.patch("/api/notes/:id/attachments/:attachmentId", auth, (req, res) => {
    const note = writableNote(req, res);
    if (!note) return;
    const { thumb } = req.body || {};
    if (typeof thumb !== "string" || thumb.length > MAX_THUMB_LENGTH || !THUMB_RE.test(thumb)) {
      return res.status(400).json({ error: "Invalid thumbnail." });
    }
    if (!attachments.setThumb(note.id, req.params.attachmentId, thumb)) {
      return res.status(404).json({ error: "Attachment not found" });
    }
    broadcastNoteAttachments(note.id);
    tellFederation(note.id, { add: attachments.peerItem(req.params.attachmentId) }).catch(() => {});
    res.json({ ok: true });
  });

  app.delete("/api/notes/:id/attachments/:attachmentId", auth, async (req, res) => {
    const note = writableNote(req, res);
    if (!note) return;
    const known = attachments.get(req.params.attachmentId);
    if (!known || known.noteId !== note.id) return res.json({ ok: true });
    if (!(await tellFederation(note.id, { removeId: known.id }))) {
      return res.status(503).json({ error: "The server of this note can't be reached." });
    }
    attachments.remove(note.id, known.id);
    changed(note.id, req.user);
    tellFederation(note.id, {}).catch(() => {});
    res.json({ ok: true });
  });

  // Any participant may read, a read-only one included.
  app.post("/api/notes/:id/attachments/:attachmentId/link", auth, (req, res) => {
    const note = getNoteWithCollaboration.get(req.user.id, req.params.id, req.user.id);
    const attachment = note && attachments.get(req.params.attachmentId);
    if (!attachment || attachment.noteId !== note.id) {
      return res.status(404).json({ error: "Attachment not found" });
    }
    const token = downloadLinks.issue({
      subject: attachment.id,
      userId: req.user.id,
      tokenVersion: currentTokenVersion(req.user.id),
      inline: !!req.body?.inline,
    });
    res.json({ url: `/api/attachments/${encodeURIComponent(attachment.id)}/file?t=${token}` });
  });

  // No auth middleware: the signed link is the proof. It is re-checked
  // against today's state, so losing access to the note, or a password
  // change, closes a link already handed out.
  app.get("/api/attachments/:attachmentId/file", async (req, res) => {
    const link = downloadLinks.verify(req.query.t, req.params.attachmentId);
    const attachment = link && attachments.get(req.params.attachmentId);
    const allowed = attachment
      && getUserById.get(link.userId)
      && currentTokenVersion(link.userId) === link.tokenVersion
      && getNoteWithCollaboration.get(link.userId, attachment.noteId, link.userId);
    if (!allowed) return res.status(403).json({ error: "This link is no longer valid." });

    const inline = link.inline && INLINE_TYPES.has(attachment.mime);
    res.setHeader("Content-Type", inline ? attachment.mime : "application/octet-stream");
    res.setHeader("Content-Length", attachment.size);
    res.setHeader("Content-Disposition", contentDisposition(inline ? "inline" : "attachment", attachment.name));
    res.setHeader("Content-Security-Policy", attachment.mime === "application/pdf" && inline ? PDF_POLICY : SANDBOXED);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    try {
      await noteFederation?.ensureAttachmentFile(attachment.fileId);
    } catch (e) {
      console.warn("[attachments] peer file:", e?.message);
      res.removeHeader("Content-Length");
      res.removeHeader("Content-Disposition");
      return res.status(502).json({ error: "The server holding this file can't be reached." });
    }
    try {
      await pipeline(attachments.openFile(attachment.fileId), res);
    } catch (e) {
      if (!res.headersSent) return res.status(500).json({ error: "Could not read the file." });
      console.error("[attachments] read failed", e?.message);
      res.destroy();
    }
  });
}

module.exports = { attachAttachmentRoutes };
