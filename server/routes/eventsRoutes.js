// server/routes/eventsRoutes.js
//
// The server-sent events stream (GET /api/events) each signed-in client
// keeps open for live updates.

function attachEventsRoutes(app, deps) {
  const { authFromQueryOrHeader, addSseClient, removeSseClient } = deps;

  app.get("/api/events", authFromQueryOrHeader, (req, res) => {
    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Help Nginx/Proxies not to buffer SSE
    try { res.setHeader("X-Accel-Buffering", "no"); } catch { /* optional proxy hint */ }
    // If served cross-origin (e.g. static site + separate API host), allow EventSource
    if (req.headers.origin) {
      try { res.setHeader("Access-Control-Allow-Origin", req.headers.origin); } catch { /* optional CORS header */ }
    }
    res.flushHeaders?.();

    // Initial hello
    res.write(`event: hello\n`);
    res.write(`data: {"ok":true}\n\n`);

    addSseClient(req.user.id, res);

    // Keepalive ping
    const ping = setInterval(() => {
      try {
        res.write("event: ping\ndata: {}\n\n");
      } catch {
        clearInterval(ping);
        removeSseClient(req.user.id, res);
        try { res.end(); } catch { /* connection already gone */ }
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(ping);
      removeSseClient(req.user.id, res);
      try { res.end(); } catch { /* connection already gone */ }
    });
  });
}

module.exports = { attachEventsRoutes };
