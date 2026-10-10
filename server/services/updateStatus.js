// =============================================================================
//  GlassKeep: where the install lives, and the self-update's status files
//
//  The install type ("native" under systemd, "docker", or neither), its data
//  directory, and the files a running update reports through: the status
//  JSON the frontend polls, the script's log, and the target version handed
//  to the native updater. Used by services/updateOrchestrator.js.
// =============================================================================

const fs = require("fs");
const path = require("path");

const NATIVE_DEFAULTS = {
    installDir: "/opt/glass-keep/app",
    dataDir: "/opt/glass-keep/data",
    serviceName: "glass-keep",
    updaterService: "glass-keep-updater.service",
};

const DOCKER_DEFAULTS = {
    dataDir: "/data",
    socket: "/var/run/docker.sock",
    helperScript: "/app/scripts/docker-update-helper.cjs",
};

// The states an update run ends in.
const TERMINAL_STATES = ["success", "error", "rolled_back", "cancelled"];

let cachedMode = null;

// ── Mode detection ───────────────────────────────────────────────────────────
function detectMode() {
    if (cachedMode) return cachedMode;
    const inDocker =
        !!process.env.IN_DOCKER ||
        safeExists("/.dockerenv") ||
        safeExists("/run/.containerenv");
    if (inDocker) {
        cachedMode = "docker";
    } else if (safeExists("/etc/systemd/system/glass-keep.service")) {
        cachedMode = "native";
    } else {
        cachedMode = "unsupported";
    }
    return cachedMode;
}

function safeExists(p) {
    try {
        return fs.existsSync(p);
    } catch {
        return false;
    }
}

function readFile(p) {
    try {
        return fs.readFileSync(p, "utf8");
    } catch {
        return "";
    }
}

function getDataDir() {
    if (detectMode() === "docker") {
        return process.env.DATA_DIR || DOCKER_DEFAULTS.dataDir;
    }
    return process.env.DATA_DIR || NATIVE_DEFAULTS.dataDir;
}

function getStatusFilePath() {
    return (
        process.env.UPDATE_STATUS_FILE ||
        path.join(getDataDir(), ".update-status.json")
    );
}

function getLockFilePath() {
    return (
        process.env.UPDATE_LOCK_FILE ||
        path.join(getDataDir(), ".update.lock")
    );
}

// The exact release the admin was told about, handed off to
// self-update.sh so it checks out that tag instead of whatever
// currently sits on the tracked branch. A file rather than an
// environment variable: `systemctl start` does not forward the
// caller's environment to the unit it starts, only what the unit
// file's own Environment=/EnvironmentFile= already provide.
function getTargetVersionFilePath() {
    return (
        process.env.UPDATE_TARGET_VERSION_FILE ||
        path.join(getDataDir(), ".update-target-version")
    );
}

// ── Status I/O ───────────────────────────────────────────────────────────────
function readStatus() {
    try {
        const raw = fs.readFileSync(getStatusFilePath(), "utf8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

// Replace the status file atomically (write aside, then rename), so the
// frontend never polls a half-written file. Throws on failure.
function writeStatus(data) {
    const p = getStatusFilePath();
    fs.writeFileSync(p + ".tmp", JSON.stringify(data));
    fs.renameSync(p + ".tmp", p);
}

// In-progress = the status file says we are running AND the last write
// is recent enough (stale-lock recovery: if the process died, we let
// the user retry after 10 minutes).
function isUpdateInProgress() {
    const s = readStatus();
    if (!s) return false;
    if (TERMINAL_STATES.includes(s.state)) return false;
    try {
        const stat = fs.statSync(getStatusFilePath());
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > 10 * 60 * 1000) return false;
    } catch {
        return false;
    }
    return true;
}

function writeInitialStatus({ fromVersion, toVersion }) {
    const mode = detectMode();
    // Native exposes 5 visible steps (fetch / Node.js / install /
    // build / restart). Docker exposes only 2: the pull and the swap-and-
    // healthcheck, because the rest of the swap dance happens while
    // the API server is offline and would never reach the frontend.
    // Each updater later rewrites this file with its own totalSteps,
    // but matching the initial value avoids a flicker in the
    // progress bar denominator.
    const totalSteps = mode === "docker" ? 2 : 5;
    const data = {
        mode,
        state: "queued",
        step: 0,
        totalSteps,
        message: "Update queued...",
        startedAt: new Date().toISOString(),
        endedAt: null,
        fromVersion: fromVersion || null,
        toVersion: toVersion || null,
        error: null,
        rolledBack: false,
    };
    const p = getStatusFilePath();
    try {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        writeStatus(data);
    } catch (e) {
        throw new Error(`cannot write status file at ${p}: ${e.message}`, { cause: e });
    }
    return data;
}

// Returns the tail of the script's stdout/stderr log (capped to keep
// the response small). The script truncates the file at every run so
// the content always belongs to the current / most recent update.
function readLog({ maxBytes = 256 * 1024 } = {}) {
    const logPath = path.join(getDataDir(), ".update.log");
    try {
        const stats = fs.statSync(logPath);
        const start = Math.max(0, stats.size - maxBytes);
        const buf = Buffer.alloc(stats.size - start);
        const fd = fs.openSync(logPath, "r");
        try {
            fs.readSync(fd, buf, 0, buf.length, start);
        } finally {
            fs.closeSync(fd);
        }
        let text = buf.toString("utf8");
        // Drop a partial first line if we truncated mid-line.
        if (start > 0) {
            const nl = text.indexOf("\n");
            if (nl >= 0) text = text.slice(nl + 1);
        }
        return { ok: true, text, truncated: start > 0, size: stats.size };
    } catch (e) {
        if (e.code === "ENOENT") return { ok: false, reason: "not-found" };
        return { ok: false, reason: e.message };
    }
}

// Marks the current terminal status as "seen by the admin" so the
// progress modal does not pop again on the next refresh / login.
// Only stamps the file when the recorded endedAt matches the one the
// client thinks it is acknowledging: protects against acking the
// wrong outcome if a new update started between the user's click and
// this call.
function acknowledgeStatus(endedAt) {
    const current = readStatus();
    if (!current) return { ok: false, reason: "no-status" };
    if (!TERMINAL_STATES.includes(current.state)) {
        return { ok: false, reason: "not-terminal" };
    }
    if (!current.endedAt || current.endedAt !== endedAt) {
        return { ok: false, reason: "stale" };
    }
    if (current.acknowledgedAt) {
        return { ok: true, reason: "already-acknowledged" };
    }
    const next = { ...current, acknowledgedAt: new Date().toISOString() };
    try {
        writeStatus(next);
    } catch (e) {
        return { ok: false, reason: "write-failed", error: e.message };
    }
    return { ok: true };
}

module.exports = {
    NATIVE_DEFAULTS,
    DOCKER_DEFAULTS,
    detectMode,
    safeExists,
    readFile,
    getDataDir,
    getStatusFilePath,
    getLockFilePath,
    getTargetVersionFilePath,
    readStatus,
    writeStatus,
    isUpdateInProgress,
    writeInitialStatus,
    readLog,
    acknowledgeStatus,
};
