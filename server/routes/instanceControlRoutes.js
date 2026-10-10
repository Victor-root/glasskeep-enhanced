// server/routes/instanceControlRoutes.js
//
// Admin restart and shutdown of the running instance.

const { restartSelf, shutdownSelf } = require("../services/updateOrchestrator");

function attachInstanceControlRoutes(app, deps) {
  const { auth, adminOnly } = deps;

  // Restart the running GlassKeep instance.
  // - Native (systemd): `systemctl restart glass-keep`
  // - Docker: POST /containers/<self>/restart on the mounted socket
  // Responds immediately so the client receives the 200 before the process dies.
  app.post("/api/admin/restart", auth, adminOnly, (_req, res) => {
    res.json({ ok: true });
    setTimeout(() => {
      restartSelf().catch((err) => console.error("restartSelf failed:", err?.message || err));
    }, 300);
  });

  // Shutdown the running GlassKeep instance.
  // - Native (systemd): `systemctl stop glass-keep`
  // - Docker: POST /containers/<self>/stop on the mounted socket. The
  //   restart policy (`unless-stopped` in the documented compose) honours
  //   the manual stop, so the container stays down.
  // Responds immediately so the client receives the 200 before the process dies.
  app.post("/api/admin/shutdown", auth, adminOnly, (_req, res) => {
    res.json({ ok: true });
    setTimeout(() => {
      shutdownSelf().catch((err) => console.error("shutdownSelf failed:", err?.message || err));
    }, 300);
  });
}

module.exports = { attachInstanceControlRoutes };
