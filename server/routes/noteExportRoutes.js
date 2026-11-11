// server/routes/noteExportRoutes.js
//
// The backup export of the user's active notes: a JSON file, or a ZIP
// archive holding that same file with the notes' attachments beside it.

const yazl = require("yazl");
const { nowISO } = require("../utils/timestamps");

// What a signed export link opens. The colon keeps it apart from every
// attachment id a link can also name.
const EXPORT_SUBJECT = "export:notes";
const NOTES_ENTRY = "notes.json";

// Where an attachment sits in the archive: its note and its id keep two
// files of the same name apart, the name stays readable for someone who
// opens the archive by hand.
const archivePath = (noteId, attachment) => `attachments/${noteId}/${attachment.id}/${attachment.name}`;

function attachNoteExportRoutes(app, deps) {
  const {
    auth, listNotes, getUserPosition, getUserTags, getUserIcon,
    attachments, downloadLinks, getUserById, currentTokenVersion, noteFederation,
  } = deps;

  function exportPayload(user) {
    const rows = listNotes.all(user.id);
    return {
      app: "glass-keep",
      version: 1,
      user: user.email,
      exportedAt: nowISO(),
      notes: rows.map((r) => {
        // L'épingle et le rangement sont personnels: ils vivent dans
        // note_user_positions, la colonne de la note ne portant que la
        // valeur de départ. Lire la colonne partagée ici exportait donc
        // l'état de départ et non celui de l'utilisateur, et une note
        // dépinglée ressortait épinglée. On lit la même source que
        // l'affichage.
        const perso = getUserPosition(r.id, user.id);
        return {
          id: r.id,
          type: r.type,
          title: r.title,
          content: r.content,
          items: JSON.parse(r.items_json || "[]"),
          tags: JSON.parse(getUserTags(r.id, user.id)),
          images: (JSON.parse(r.images_json || "[]") || []).filter((im) => !(im && im.role === "icon")),
          icon: getUserIcon(r.id, user.id),
          color: r.color,
          pinned: perso ? !!perso.pinned : !!r.pinned,
          position: perso ? perso.position : r.position,
          timestamp: r.timestamp,
        };
      }),
    };
  }

  app.get("/api/notes/export", auth, (req, res) => {
    res.json(exportPayload(req.user));
  });

  // The archive is fetched by the browser or by Android's DownloadManager,
  // straight to the disk: neither can send the session's token.
  app.post("/api/notes/export/link", auth, (req, res) => {
    const token = downloadLinks.issue({
      subject: EXPORT_SUBJECT,
      userId: req.user.id,
      tokenVersion: currentTokenVersion(req.user.id),
    });
    res.json({ url: `/api/notes/export/archive?t=${token}` });
  });

  // Streamed as it is read, stored without compression: its size is known
  // before the first byte, and the files are mostly compressed already.
  app.get("/api/notes/export/archive", async (req, res) => {
    const link = downloadLinks.verify(req.query.t, EXPORT_SUBJECT);
    const user = link && getUserById.get(link.userId);
    if (!user || currentTokenVersion(link.userId) !== link.tokenVersion) {
      return res.status(403).json({ error: "This link is no longer valid." });
    }

    const payload = exportPayload(user);
    const files = [];
    for (const note of payload.notes) {
      note.attachments = [];
      for (const { id } of attachments.list(note.id)) {
        const attachment = attachments.get(id);
        // A file a peer still holds comes over first; one out of reach is
        // left out rather than failing the whole backup.
        try {
          await noteFederation?.ensureAttachmentFile(attachment.fileId);
        } catch (e) {
          console.warn("[export] peer file left out:", e?.message);
          continue;
        }
        const path = archivePath(note.id, attachment);
        note.attachments.push({
          id: attachment.id,
          name: attachment.name,
          mime: attachment.mime,
          size: attachment.size,
          sha256: attachment.sha256,
          thumb: attachment.thumb,
          createdAt: attachment.createdAt,
          path,
        });
        files.push({ path, attachment });
      }
    }

    const zip = new yazl.ZipFile();
    const mtime = new Date();
    zip.addBuffer(Buffer.from(JSON.stringify(payload, null, 2)), NOTES_ENTRY, { mtime, compress: false });
    for (const { path, attachment } of files) {
      zip.addReadStreamLazy(path, {
        mtime: new Date(attachment.createdAt || mtime),
        compress: false,
        size: attachment.size,
      }, (cb) => {
        try {
          cb(null, attachments.openFile(attachment.fileId));
        } catch (e) {
          cb(e);
        }
      });
    }
    // Past the headers there is no answer left to give: a cut connection
    // is what tells the client the archive is incomplete.
    zip.on("error", (e) => {
      console.error("[export] archive failed:", e?.message);
      res.destroy();
    });
    zip.end({}, (total) => {
      res.setHeader("Content-Type", "application/zip");
      if (total >= 0) res.setHeader("Content-Length", total);
      res.setHeader("Content-Disposition", 'attachment; filename="glass-keep-notes.zip"');
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      zip.outputStream.pipe(res);
    });
  });
}

module.exports = { attachNoteExportRoutes };
