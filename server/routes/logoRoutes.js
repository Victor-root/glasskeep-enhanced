// server/routes/logoRoutes.js
//
// The user's logo library.

const crypto = require("crypto");

function attachLogoRoutes(app, deps) {
  const { db, auth, sendEventToUser } = deps;

  // Logos live independently from notes: a user can collect logos that
  // don't appear on any note, and removing a logo from the library does
  // NOT touch notes that already use it (those keep their own copy of
  // the icon embedded in their images_json).
  const listLogosStmt = db.prepare(
    `SELECT id, name, src, created_at FROM logos WHERE user_id = ? ORDER BY created_at ASC`
  );
  const insertLogoStmt = db.prepare(
    `INSERT INTO logos (id, user_id, name, src, created_at) VALUES (?, ?, ?, ?, ?)`
  );
  const deleteLogoStmt = db.prepare(
    `DELETE FROM logos WHERE id = ? AND user_id = ?`
  );
  const findLogoBySrcStmt = db.prepare(
    `SELECT id, name, src, created_at FROM logos WHERE user_id = ? AND src = ? LIMIT 1`
  );

  app.get("/api/logos", auth, (req, res) => {
    try {
      const rows = listLogosStmt.all(req.user.id);
      res.json(rows);
    } catch (e) {
      console.error("[logos] list failed", e);
      res.status(500).json({ error: "Failed to list logos" });
    }
  });

  app.post("/api/logos", auth, (req, res) => {
    const { id, name, src } = req.body || {};
    if (typeof src !== "string" || !src.startsWith("data:")) {
      return res.status(400).json({ error: "src must be a data URL" });
    }
    // Dedup by src: same image uploaded twice returns the existing entry.
    const existing = findLogoBySrcStmt.get(req.user.id, src);
    if (existing) return res.json(existing);
    const newId = (typeof id === "string" && id) || crypto.randomUUID();
    const createdAt = new Date().toISOString();
    try {
      insertLogoStmt.run(newId, req.user.id, String(name || "").slice(0, 200), src, createdAt);
      const logo = { id: newId, name: name || "", src, created_at: createdAt };
      sendEventToUser(req.user.id, { type: "logo_added", logo });
      res.json(logo);
    } catch (e) {
      console.error("[logos] insert failed", e);
      res.status(500).json({ error: "Failed to save logo" });
    }
  });

  app.delete("/api/logos/:id", auth, (req, res) => {
    try {
      const result = deleteLogoStmt.run(req.params.id, req.user.id);
      if (result.changes === 0) return res.status(404).json({ error: "Logo not found" });
      sendEventToUser(req.user.id, { type: "logo_deleted", id: req.params.id });
      res.status(204).end();
    } catch (e) {
      console.error("[logos] delete failed", e);
      res.status(500).json({ error: "Failed to delete logo" });
    }
  });
}

module.exports = { attachLogoRoutes };
