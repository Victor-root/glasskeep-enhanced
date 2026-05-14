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

// Snapshots of cumulative CPU times at the time the /system endpoint
// was last queried. Re-used as the "previous" point when computing the
// next CPU usage delta. Discarded if older than CPU_SNAP_STALE_MS so
// a long pause between polls (admin closed and re-opened the modal)
// does not produce a misleading "average since last open" value.
//
// We keep two independent snapshots — cgroup-based and /proc-based —
// because they measure different things (container-scoped vs host-
// wide) and the fallback chain inside the handler may swap between
// them across requests.
let lastCpuSnap = null;
let lastCgroupCpuSnap = null;
const CPU_SNAP_STALE_MS = 30 * 1000;

// cgroup v1 reports "no limit" as a huge sentinel close to 2^63.
// Anything above 1 PB is treated as "unlimited" — no real-world
// container has more than that, and the value is a sentinel.
const CGROUP_NO_LIMIT_THRESHOLD = 1024 ** 5;

// ── /proc / cgroup readers ─────────────────────────────────────────────────
//
// Why cgroup at all? Inside a Docker container (and even inside an LXC
// running another containerised app) /proc and os.* return the kernel's
// global view — i.e. the values of the physical host, not the container.
// lxcfs covers that for plain LXC but does not propagate into a nested
// Docker container, so a Docker-in-LXC setup ends up showing the
// Proxmox host's RAM / CPU. cgroup is the kernel's accounting layer
// and reflects the actual limits applied at every nesting level, so
// it gives the right answer in both LXC and Docker.

function readSysFile(path) {
    try {
        return fs.readFileSync(path, "utf8");
    } catch {
        return null;
    }
}

function parseCgroupLimit(s) {
    // Returns the parsed byte count, or null when the cgroup has no
    // limit configured at this level (either the literal "max" string
    // in v2, or the huge sentinel value in v1).
    if (s === null || s === undefined) return null;
    const t = String(s).trim();
    if (!t || t === "max") return null;
    const n = parseInt(t, 10);
    if (!Number.isFinite(n) || n <= 0 || n > CGROUP_NO_LIMIT_THRESHOLD) return null;
    return n;
}

function readCgroupMemoryLimit() {
    // Returns the cgroup's memory limit in bytes, or null when no
    // explicit limit is set at this level (the container can use up
    // to the parent cgroup's limit — invisible from inside).
    const v2 = readSysFile("/sys/fs/cgroup/memory.max");
    if (v2 !== null) {
        const n = parseCgroupLimit(v2);
        if (n !== null) return n;
    }
    const v1 = readSysFile("/sys/fs/cgroup/memory/memory.limit_in_bytes");
    if (v1 !== null) return parseCgroupLimit(v1);
    return null;
}

function readCgroupMemoryUsage() {
    // Returns the cgroup's CURRENT memory usage in bytes (page cache
    // subtracted, so the value matches `docker stats` rather than
    // raw memory.current which is inflated by reclaimable cache).
    // Works even when no limit is set — the kernel always accounts
    // for usage regardless of whether a cap is configured.
    //
    // — cgroup v2 —
    const v2Cur = readSysFile("/sys/fs/cgroup/memory.current");
    if (v2Cur !== null) {
        const current = parseInt(String(v2Cur).trim(), 10);
        if (Number.isFinite(current)) {
            const stat = readSysFile("/sys/fs/cgroup/memory.stat") || "";
            const fileMatch = stat.match(/^file\s+(\d+)/m);
            const fileCache = fileMatch ? parseInt(fileMatch[1], 10) : 0;
            return Math.max(0, current - fileCache);
        }
    }
    // — cgroup v1 —
    const v1Cur = readSysFile("/sys/fs/cgroup/memory/memory.usage_in_bytes");
    if (v1Cur !== null) {
        const current = parseInt(String(v1Cur).trim(), 10);
        if (Number.isFinite(current)) {
            const stat = readSysFile("/sys/fs/cgroup/memory/memory.stat") || "";
            const cacheMatch = stat.match(/^cache\s+(\d+)/m);
            const cache = cacheMatch ? parseInt(cacheMatch[1], 10) : 0;
            return Math.max(0, current - cache);
        }
    }
    return null;
}

function readCgroupSwap() {
    // Returns { total, used } in bytes or null when no swap accounting
    // is configured for this cgroup.
    //
    // — cgroup v2 —
    const v2MaxStr = readSysFile("/sys/fs/cgroup/memory.swap.max");
    const v2CurStr = readSysFile("/sys/fs/cgroup/memory.swap.current");
    if (v2MaxStr !== null && v2CurStr !== null) {
        const total = parseCgroupLimit(v2MaxStr);
        const used = parseInt(String(v2CurStr).trim(), 10);
        if (total !== null && Number.isFinite(used)) {
            return { total, used };
        }
    }
    // — cgroup v1 (memsw = memory + swap combined) —
    const memswMaxStr = readSysFile("/sys/fs/cgroup/memory/memory.memsw.limit_in_bytes");
    const memswUsageStr = readSysFile("/sys/fs/cgroup/memory/memory.memsw.usage_in_bytes");
    const memMaxStr = readSysFile("/sys/fs/cgroup/memory/memory.limit_in_bytes");
    const memUsageStr = readSysFile("/sys/fs/cgroup/memory/memory.usage_in_bytes");
    if (memswMaxStr !== null && memMaxStr !== null && memswUsageStr !== null && memUsageStr !== null) {
        const memswMax = parseCgroupLimit(memswMaxStr);
        const memMax = parseCgroupLimit(memMaxStr);
        const memswUsage = parseInt(String(memswUsageStr).trim(), 10);
        const memUsage = parseInt(String(memUsageStr).trim(), 10);
        if (
            memswMax !== null &&
            memMax !== null &&
            memswMax > memMax &&
            Number.isFinite(memswUsage) &&
            Number.isFinite(memUsage)
        ) {
            return {
                total: memswMax - memMax,
                used: Math.max(0, memswUsage - memUsage),
            };
        }
    }
    return null;
}

function readCgroupCpuCount() {
    // Returns the effective allocated CPU count (float, e.g. 2.0 or
    // 0.5) derived from the cgroup CPU quota, or null when no quota
    // is set (the container can use as many CPUs as the host has).
    //
    // — cgroup v2 — cpu.max contains "quota period" or "max period"
    const v2 = readSysFile("/sys/fs/cgroup/cpu.max");
    if (v2) {
        const parts = String(v2).trim().split(/\s+/);
        if (parts.length >= 2 && parts[0] !== "max") {
            const quota = parseInt(parts[0], 10);
            const period = parseInt(parts[1], 10);
            if (quota > 0 && period > 0) return quota / period;
        }
    }
    // — cgroup v1 — cfs_quota_us / cfs_period_us
    const quotaStr = readSysFile("/sys/fs/cgroup/cpu/cpu.cfs_quota_us");
    const periodStr = readSysFile("/sys/fs/cgroup/cpu/cpu.cfs_period_us");
    if (quotaStr !== null && periodStr !== null) {
        const quota = parseInt(String(quotaStr).trim(), 10);
        const period = parseInt(String(periodStr).trim(), 10);
        if (quota > 0 && period > 0) return quota / period;
    }
    return null;
}

function snapCgroupCpu() {
    // Returns { usageNsec, at } or null. Tracks the cumulative CPU
    // time consumed by THIS cgroup specifically — works the same in
    // LXC and Docker because cgroup is the kernel's source of truth
    // independent of /proc virtualization.
    //
    // — cgroup v2 — cpu.stat has usage_usec
    const v2 = readSysFile("/sys/fs/cgroup/cpu.stat");
    if (v2) {
        const m = String(v2).match(/^usage_usec\s+(\d+)/m);
        if (m) {
            const usec = parseInt(m[1], 10);
            if (Number.isFinite(usec)) {
                return { usageNsec: usec * 1000, at: Date.now() };
            }
        }
    }
    // — cgroup v1 — cpuacct.usage is in nanoseconds already
    const v1 = readSysFile("/sys/fs/cgroup/cpuacct/cpuacct.usage");
    if (v1) {
        const n = parseInt(String(v1).trim(), 10);
        if (Number.isFinite(n)) {
            return { usageNsec: n, at: Date.now() };
        }
    }
    return null;
}

// Read CPU times directly from /proc/stat instead of going through
// os.cpus(), which silently drops the iowait / softirq / steal /
// guest / guest_nice categories. Missing those categories under-
// counts the total tick window and inflates the resulting "busy"
// percentage — particularly noticeable inside LXC / Docker where
// iowait can be a significant slice of the workload.
//
// Used as a fallback when cgroup CPU stats are not available
// (rare: cgroup is normally enabled wherever this app runs).
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
        // Forbid every layer of caching — browsers, the PWA's service
        // worker, intermediate proxies. Without this a 200 response
        // with no cache headers can be served from the browser's HTTP
        // cache for a refetch of the same URL, which would freeze the
        // gauge on its first reading.
        res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        res.set("Pragma", "no-cache");
        res.set("Expires", "0");

        // The Docker variant of the modal hides this whole panel,
        // so we only get here on native installs. On a native LXC
        // both cgroup and lxcfs-virtualized /proc see the same
        // values, so the cgroup readings double as a more accurate
        // version of the old os.totalmem() path.
        const cgMemLimit = readCgroupMemoryLimit();
        const cgMemUsage = readCgroupMemoryUsage();
        const totalMem = cgMemLimit !== null ? cgMemLimit : os.totalmem();
        const usedMem =
            cgMemUsage !== null
                ? cgMemUsage
                : Math.max(0, os.totalmem() - os.freemem());
        const freeMem = Math.max(0, totalMem - usedMem);

        // ── Swap ───────────────────────────────────────────────────────
        // Only cgroup swap is reliable — /info has no swap field, and
        // /proc/meminfo inside a Docker container reflects the
        // unrelated Proxmox host swap rather than the LXC's. When
        // we can't get an accurate per-container reading we hide the
        // bar entirely (null) rather than show a misleading value.
        // /proc/meminfo is still consulted for true native installs
        // (no Docker daemon detected), where lxcfs handles things.
        let swap = null;
        const cgSwap = readCgroupSwap();
        if (cgSwap && cgSwap.total > 0) {
            swap = {
                total: cgSwap.total,
                used: cgSwap.used,
                free: Math.max(0, cgSwap.total - cgSwap.used),
                percent: (cgSwap.used / cgSwap.total) * 100,
            };
        } else {
            // Native install (Docker hides the whole panel before
            // we get here): /proc/meminfo is lxcfs-virtualized so
            // we trust SwapTotal / SwapFree.
            try {
                const meminfo = fs.readFileSync("/proc/meminfo", "utf8");
                const totalMatch = meminfo.match(/^SwapTotal:\s+(\d+)/m);
                const freeMatch = meminfo.match(/^SwapFree:\s+(\d+)/m);
                const swapTotal = totalMatch ? parseInt(totalMatch[1], 10) * 1024 : 0;
                const swapFree = freeMatch ? parseInt(freeMatch[1], 10) * 1024 : 0;
                if (swapTotal > 0) {
                    const swapUsed = Math.max(0, swapTotal - swapFree);
                    swap = {
                        total: swapTotal,
                        free: swapFree,
                        used: swapUsed,
                        percent: (swapUsed / swapTotal) * 100,
                    };
                }
            } catch {
                /* /proc/meminfo unreachable — leave swap as null */
            }
        }

        // ── CPU ────────────────────────────────────────────────────────
        // Effective CPU count: cgroup quota (when set) → Docker /info
        // NCPU (correct in Docker-in-LXC) → os.cpus() (host view).
        // The percent is computed against this effective count so a
        // single-vCPU container pegging its core reads ~100 % rather
        // than ~25 % on a 4-core host.
        const cgCpuCount = readCgroupCpuCount();
        const cpuCount =
            cgCpuCount !== null
                ? cgCpuCount
                : (os.cpus() || []).length || 1;

        // CPU usage as a real 0-100 % derived from the delta of
        // cumulative cgroup counters between this call and the
        // previous one. On a native LXC this tracks the whole
        // container (which IS the LXC's view through cgroup), so
        // it matches what `top` reports inside the LXC.
        //
        // Returns null on the very first sample (or when the
        // previous sample is too old) — the frontend hides the
        // CPU bar until a valid percentage is available.
        let cpuPercent = null;
        const cgSnap = snapCgroupCpu();
        if (
            cgSnap &&
            lastCgroupCpuSnap &&
            cgSnap.at - lastCgroupCpuSnap.at < CPU_SNAP_STALE_MS
        ) {
            const usageDeltaNsec = cgSnap.usageNsec - lastCgroupCpuSnap.usageNsec;
            const elapsedNsec = (cgSnap.at - lastCgroupCpuSnap.at) * 1e6;
            if (elapsedNsec > 0 && usageDeltaNsec >= 0) {
                cpuPercent = Math.max(
                    0,
                    Math.min(
                        100,
                        (usageDeltaNsec / elapsedNsec / cpuCount) * 100
                    )
                );
            }
        }
        if (cgSnap) lastCgroupCpuSnap = cgSnap;

        // Fallback to /proc/stat only when cgroup cpu accounting is
        // not exposed. Tracked separately because the /proc-based
        // tick deltas and cgroup nsec deltas are not interchangeable.
        if (cpuPercent === null && !cgSnap) {
            const snap = snapCpuTimes();
            if (snap && lastCpuSnap && snap.at - lastCpuSnap.at < CPU_SNAP_STALE_MS) {
                const totalDelta = snap.total - lastCpuSnap.total;
                const idleDelta = snap.idle - lastCpuSnap.idle;
                if (totalDelta > 0) {
                    cpuPercent = Math.max(
                        0,
                        Math.min(
                            100,
                            ((totalDelta - idleDelta) / totalDelta) * 100
                        )
                    );
                }
            }
            if (snap) lastCpuSnap = snap;
        }

        return res.json({
            mem: {
                total: totalMem,
                free: freeMem,
                used: usedMem,
                percent: totalMem > 0 ? (usedMem / totalMem) * 100 : 0,
            },
            swap,
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

    // Kill a running update and roll the install back to its
    // pre-update snapshot. Admin-driven counterpart of /start.
    app.post("/api/admin/self-update/cancel", auth, adminOnly, async (_req, res) => {
        try {
            await orchestrator.cancelUpdate();
            return res.json({ cancelled: true });
        } catch (e) {
            if (log && log.warn) log.warn("self-update/cancel failed:", e.message);
            const status = e.code === "unsupported" ? 400 : 500;
            return res.status(status).json({
                error: e.message || "cancel failed",
                code: e.code || "internal",
            });
        }
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
