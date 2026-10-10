// server/routes/noteExportRoutes.js
//
// The backup export of the user's active notes.

const { nowISO } = require("../utils/timestamps");

function attachNoteExportRoutes(app, deps) {
  const { auth, listNotes, getUserPosition, getUserTags, getUserIcon } = deps;

  // Export/Import
  app.get("/api/notes/export", auth, (req, res) => {
    const rows = listNotes.all(req.user.id);
    res.json({
      app: "glass-keep",
      version: 1,
      user: req.user.email,
      exportedAt: nowISO(),
      notes: rows.map((r) => {
        // L'épingle et le rangement sont personnels: ils vivent dans
        // note_user_positions, la colonne de la note ne portant que la
        // valeur de départ. Lire la colonne partagée ici exportait donc
        // l'état de départ et non celui de l'utilisateur, et une note
        // dépinglée ressortait épinglée. On lit la même source que
        // l'affichage.
        const perso = getUserPosition(r.id, req.user.id);
        return {
          id: r.id,
          type: r.type,
          title: r.title,
          content: r.content,
          items: JSON.parse(r.items_json || "[]"),
          tags: JSON.parse(getUserTags(r.id, req.user.id)),
          images: (JSON.parse(r.images_json || "[]") || []).filter((im) => !(im && im.role === "icon")),
          icon: getUserIcon(r.id, req.user.id),
          color: r.color,
          pinned: perso ? !!perso.pinned : !!r.pinned,
          position: perso ? perso.position : r.position,
          timestamp: r.timestamp,
        };
      }),
    });
  });
}

module.exports = { attachNoteExportRoutes };
