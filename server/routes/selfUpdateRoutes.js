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

const fs = require("fs");
const os = require("os");
const orchestrator = require("../services/updateOrchestrator");
const pkg = require("../../package.json");

// Snapshot of cumulative CPU times across all cores at the time the
// /system endpoint was last queried. Re-used as the "previous" point
// when computing the next CPU usage delta. Discarded if older than
// CPU_SNAP_STALE_MS so a long pause between polls (admin closed and
// re-opened the modal) does not produce a misleading "average since
// last open" value.
let lastCpuSnap = null;
const CPU_SNAP_STALE_MS = 30 * 1000;

// Read CPU times directly from /proc/stat instead of going through
// os.cpus(), which silently drops the iowait / softirq / steal /
// guest / guest_nice categories. Missing those categories under-
// counts the total tick window and inflates the resulting "busy"
// percentage — particularly noticeable inside LXC / Docker where
// iowait can be a significant slice of the workload.
//
// We use the aggregate first line ("cpu  user nice system idle
// iowait irq softirq steal guest guest_nice") so a single call
// gives us a system-wide reading that matches what `top` reports.
// Idle counts both literal idle AND iowait — the CPU is available
// in both cases, just waiting on a different queue.
function snapCpuTimes() {
    try {
        const text = fs.readFileSync("/proc/stat", "utf8");
        const firstLine = text.split("\n", 1)[0] || "";
        if (!firstLine.startsWith("cpu ")) return null;
        const fields = firstLine
            .trim()
            .split(/\s+/)
            .slice(1) // drop the leading "cpu" label
            .map((n) => parseInt(n, 10) || 0);
        if (fields.length < 4) return null;
        const total = fields.reduce((s, n) => s + n, 0);
        const idle = (fields[3] || 0) + (fields[4] || 0); // idle + iowait
        return { total, idle, at: Date.now() };
    } catch {
        return null;
    }
}

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
            // Server's own current package.json version. The frontend
            // uses this (NOT the bundle's __APP_VERSION__) to decide
            // whether a "success" record is still relevant — the
            // bundle in the browser is stale until the user reloads,
            // so comparing the recorded toVersion against the bundle
            // would suppress the success modal of a completed in-app
            // update.
            runningVersion: pkg.version,
        });
    });

    // Cheap snapshot of host RAM + CPU load. The progress modal polls
    // this while an update is running so the admin can tell whether
    // the build is just slow because the box is under-provisioned
    // (256 MB LXC, single vCPU...) rather than wondering if something
    // is wrong. os.freemem()/os.loadavg() are syscalls so this stays
    // responsive even while npm install is hogging the CPU.
    app.get("/api/admin/self-update/system", auth, adminOnly, (_req, res) => {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = Math.max(0, totalMem - freeMem);
        const cpuCount = (os.cpus() || []).length || 1;

        // CPU usage as a real 0-100 % derived from the delta of
        // cumulative tick counters between this call and the
        // previous one. Returns null on the very first sample (or
        // when the previous sample is too old to be meaningful) —
        // the frontend hides the CPU bar until a valid percentage
        // is available. Much more intuitive than load-avg / cores,
        // which can read above 100 % long after the CPU itself
        // has calmed down (load average is a slow-decaying queue
        // length, not an instantaneous usage).
        const snap = snapCpuTimes();
        let cpuPercent = null;
        if (snap && lastCpuSnap && snap.at - lastCpuSnap.at < CPU_SNAP_STALE_MS) {
            const totalDelta = snap.total - lastCpuSnap.total;
            const idleDelta = snap.idle - lastCpuSnap.idle;
            if (totalDelta > 0) {
                cpuPercent = Math.max(
                    0,
                    Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100)
                );
            }
        }
        if (snap) lastCpuSnap = snap;

        return res.json({
            mem: {
                total: totalMem,
                free: freeMem,
                used: usedMem,
                percent: totalMem > 0 ? (usedMem / totalMem) * 100 : 0,
            },
            cpu: {
                count: cpuCount,
                percent: cpuPercent,
            },
            uptimeSec: Math.floor(os.uptime()),
        });
    });

    // Raw stdout/stderr of the current / most recent update. Used by
    // the expert "details" panel to surface git / npm / vite output.
    // Returns 204 if no update has ever been run on this instance.
    app.get("/api/admin/self-update/log", auth, adminOnly, (_req, res) => {
        const r = orchestrator.readLog();
        if (!r.ok) {
            if (r.reason === "not-found") return res.status(204).end();
            return res.status(500).json({ error: r.reason });
        }
        return res.type("text/plain").send(r.text);
    });

    // Mark the current terminal outcome as seen by the admin so the
    // progress modal does not pop again on the next refresh / login.
    // Server-side state (not localStorage) so private browsing,
    // different devices, and re-logins all converge on the same view.
    app.post("/api/admin/self-update/acknowledge", auth, adminOnly, (req, res) => {
        const endedAt = req.body && req.body.endedAt;
        if (!endedAt || typeof endedAt !== "string") {
            return res.status(400).json({ error: "missing endedAt" });
        }
        const r = orchestrator.acknowledgeStatus(endedAt);
        if (!r.ok) {
            return res.status(409).json({ error: r.reason || "cannot acknowledge" });
        }
        return res.json({ acknowledged: true });
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
