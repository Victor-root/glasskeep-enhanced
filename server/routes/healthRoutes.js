// server/routes/healthRoutes.js
//
// The unauthenticated health check (Docker HEALTHCHECK, client
// reconnection probe).

function attachHealthRoutes(app, deps) {
  const { nodeEnv } = deps;

  app.get("/api/health", (_req, res) => res.json({
    ok: true,
    service: "glasskeep",
    env: nodeEnv,
    startedAt: Math.round(Date.now() - process.uptime() * 1000),
  }));
}

module.exports = { attachHealthRoutes };
