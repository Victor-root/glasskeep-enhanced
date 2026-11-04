// server/routes/attachmentRoutes.js
//
// Adding, removing and opening the files attached to a note. See
// server/attachments/attachmentStore.js for how they are kept.

const { TooLargeError, EncryptionTransitionError } = require("../attachments/attachmentStore");
const { pipeline } = require("stream/promises");

const MAX_PER_NOTE = 100;
const THUMB_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
const MAX_THUMB_LENGTH = 64 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

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

function contentDisposition(kind, name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function attachAttachmentRoutes(app, deps) {
  const {
    auth,
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

  function changed(noteId, user) {
    markEditedBy(noteId, user);
    broadcastNoteAttachments(noteId);
  }

  app.get("/api/attachments/config", auth, (_req, res) => {
    res.json({ maxBytes: maxBytes(), maxPerNote: MAX_PER_NOTE });
  });

  // The file is the raw request body, sent as application/octet-stream
  // whatever it really is: the JSON and form parsers would otherwise eat a
  // .json or a .txt of the right type. Its name and type come in headers.
  // The id is the client's so a retry after a lost answer changes nothing.
  app.post("/api/notes/:id/attachments", auth, async (req, res) => {
    const note = writableNote(req, res);
    if (!note) return;

    const limit = maxBytes();
    if (!limit) return res.status(403).json({ error: "Attachments are turned off on this server." });
    if (Number(req.headers["content-length"]) > limit) {
      return res.status(413).json({ error: "File too large.", maxBytes: limit });
    }
    const id = String(req.headers["x-attachment-id"] || "");
    if (!ID_RE.test(id)) return res.status(400).json({ error: "Invalid attachment id." });
    const known = attachments.get(id);
    if (known) {
      if (known.noteId !== note.id) return res.status(409).json({ error: "Attachment id already in use." });
      req.resume();
      return res.json({ attachment: known });
    }
    if (attachments.count(note.id) >= MAX_PER_NOTE) {
      return res.status(409).json({ error: "This note has too many attachments." });
    }

    let name;
    try {
      name = decodeURIComponent(String(req.headers["x-attachment-name"] || ""));
    } catch {
      return res.status(400).json({ error: "Invalid file name." });
    }

    try {
      const stored = await attachments.writeFile(req, { maxBytes: limit });
      const attachment = attachments.attach(note.id, stored, {
        id,
        name,
        mime: req.headers["x-attachment-type"],
        uploadedBy: req.user.id,
      });
      changed(note.id, req.user);
      res.status(201).json({ attachment });
    } catch (e) {
      if (res.headersSent) return;
      // What is left of the body goes nowhere, and the connection with it.
      res.setHeader("Connection", "close");
      req.resume();
      if (e instanceof TooLargeError) return res.status(413).json({ error: "File too large.", maxBytes: limit });
      if (e instanceof EncryptionTransitionError) return res.status(503).json({ error: "Try again in a moment." });
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
    res.json({ ok: true });
  });

  app.delete("/api/notes/:id/attachments/:attachmentId", auth, (req, res) => {
    const note = writableNote(req, res);
    if (!note) return;
    if (attachments.remove(note.id, req.params.attachmentId)) changed(note.id, req.user);
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
      attachmentId: attachment.id,
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
      await pipeline(attachments.openFile(attachment.fileId), res);
    } catch (e) {
      if (!res.headersSent) return res.status(500).json({ error: "Could not read the file." });
      console.error("[attachments] read failed", e?.message);
      res.destroy();
    }
  });
}

module.exports = { attachAttachmentRoutes };
