// =============================================================================
//  GlassKeep — self-update HTTP surface (admin only)
//
//  GET  /api/admin/self-update/mode    — install type + one-click support
//  GET  /api/admin/self-update/status  — current update progress (poll)
//  POST /api/admin/self-update/start   — trigger an update
//
//  All endpoints require an admin JWT. They sit on /api/admin/* so they
//  are NOT in the lock-gate allow-list — the admin must have unlocked
//  the instance (when encryption is on) before they can update.
// =============================================================================

const orchestrator = require("../services/updateOrchestrator");
const pkg = require("../../package.json");

function parseSemver(v) {
    if (!v) return null;
    const m = String(v).trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function isStrictlyNewer(latest, current) {
    const a = parseSemver(latest);
    const b = parseSemver(current);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return true;
        if (a[i] < b[i]) return false;
    }
    return false;
}

function attachSelfUpdateRoutes(app, { auth, adminOnly, log = console } = {}) {
    // Mode + capability check. Cheap; safe to call on every panel mount.
    app.get("/api/admin/self-update/mode", auth, adminOnly, async (_req, res) => {
        try {
            const info = await orchestrator.getMode({ verifyDocker: true });
            return res.json(info);
        } catch (e) {
            if (log && log.warn) log.warn("self-update/mode failed:", e.message);
            return res.status(500).json({ error: "mode check failed" });
        }
    });

    // Current progress. Returns 204 when no update has ever been run on
    // this instance, otherwise the status JSON (or stale `success`/
    // `error`/`rolled_back` from a previous run).
    app.get("/api/admin/self-update/status", auth, adminOnly, (_req, res) => {
        const s = orchestrator.readStatus();
        if (!s) return res.status(204).end();
        return res.json({
            ...s,
            inProgress: orchestrator.isUpdateInProgress(),
        });
    });

    // Trigger the update. Body: { latestVersion: "x.y.z" }. We re-check
    // server-side that the target is strictly newer than the running
    // version so a stale browser cannot trigger a pointless rebuild.
    app.post("/api/admin/self-update/start", auth, adminOnly, async (req, res) => {
        const latest = req.body && req.body.latestVersion;
        if (!latest || typeof latest !== "string") {
            return res
                .status(400)
                .json({ error: "missing latestVersion in request body" });
        }
        if (!isStrictlyNewer(latest, pkg.version)) {
            return res.status(400).json({
                error: "target version is not newer than the running version",
                running: pkg.version,
                target: latest,
            });
        }
        if (orchestrator.isUpdateInProgress()) {
            return res
                .status(409)
                .json({ error: "an update is already in progress" });
        }
        try {
            const modeInfo = await orchestrator.getMode({ verifyDocker: true });
            if (!modeInfo.oneClickAvailable) {
                return res.status(400).json({
                    error: "one-click update not available",
                    mode: modeInfo.mode,
                    reason: modeInfo.reason,
                });
            }
            const r = await orchestrator.startUpdate({
                fromVersion: pkg.version,
                toVersion: String(latest).replace(/^v/i, ""),
            });
            return res.json({ started: true, mode: r.mode });
        } catch (e) {
            if (log && log.warn) log.warn("self-update/start failed:", e.message);
            const status =
                e.code === "in_progress" ? 409 :
                e.code === "unsupported" ? 400 : 500;
            return res.status(status).json({
                error: e.message || "self-update failed to start",
                code: e.code || "internal",
            });
        }
    });
}

module.exports = { attachSelfUpdateRoutes };
