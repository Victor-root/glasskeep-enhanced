// =============================================================================
//  GlassKeep — self-update orchestrator
//
//  Decides whether the running install is "native" (systemd) or "docker",
//  exposes the current update status, and triggers an update by either:
//    - native : `systemctl start glass-keep-updater.service --no-block`
//    - docker : creating and starting a short-lived helper container via
//               the mounted Docker socket
//
//  All long-running work happens outside the main process so the API
//  call returns instantly. Progress is reported through the status file
//  (atomic JSON), which the frontend polls.
// =============================================================================

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const pkg = require("../../package.json");

const NATIVE_DEFAULTS = {
    installDir: "/opt/glass-keep/app",
    dataDir: "/opt/glass-keep/data",
    serviceName: "glass-keep",
    updaterService: "glass-keep-updater.service",
};

const DOCKER_DEFAULTS = {
    dataDir: "/data",
    socket: "/var/run/docker.sock",
    helperScript: "/app/scripts/docker-update-helper.js",
};

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

// ── Status I/O ───────────────────────────────────────────────────────────────
function readStatus() {
    try {
        const raw = fs.readFileSync(getStatusFilePath(), "utf8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

// In-progress = the status file says we are running AND the last write
// is recent enough (stale-lock recovery: if the process died, we let
// the user retry after 10 minutes).
function isUpdateInProgress() {
    const s = readStatus();
    if (!s) return false;
    if (["success", "error", "rolled_back"].includes(s.state)) return false;
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
    // Native does the heavy lifting before stopping the service, so it
    // exposes 4 user-visible steps; docker still has 5 (pull + the
    // container swap dance). Each updater later rewrites this file
    // with its own totalSteps, but matching the initial value avoids
    // a brief flicker in the progress bar denominator.
    const totalSteps = mode === "docker" ? 5 : 4;
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
        fs.writeFileSync(p + ".tmp", JSON.stringify(data));
        fs.renameSync(p + ".tmp", p);
    } catch (e) {
        throw new Error(`cannot write status file at ${p}: ${e.message}`);
    }
    return data;
}

// ── Docker capability check ──────────────────────────────────────────────────
async function dockerSocketAvailable() {
    if (!safeExists(DOCKER_DEFAULTS.socket)) return false;
    try {
        await dockerApi("GET", "/_ping");
        return true;
    } catch {
        return false;
    }
}

function dockerApi(method, apiPath, body, { stream = false } = {}) {
    return new Promise((resolve, reject) => {
        const opts = {
            socketPath: DOCKER_DEFAULTS.socket,
            method,
            path: apiPath,
            headers: {},
        };
        let payload = null;
        if (body !== undefined && body !== null) {
            payload = typeof body === "string" ? body : JSON.stringify(body);
            opts.headers["Content-Type"] = "application/json";
            opts.headers["Content-Length"] = Buffer.byteLength(payload);
        }
        const req = http.request(opts, (res) => {
            if (stream) return resolve(res);
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
                const raw = Buffer.concat(chunks).toString("utf8");
                if (res.statusCode >= 400) {
                    return reject(
                        new Error(
                            `Docker API ${res.statusCode} on ${method} ${apiPath}: ${raw.slice(0, 400)}`
                        )
                    );
                }
                if (!raw) return resolve(null);
                try {
                    resolve(JSON.parse(raw));
                } catch {
                    resolve(raw);
                }
            });
        });
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function getMode({ verifyDocker = true } = {}) {
    const mode = detectMode();
    if (mode === "docker") {
        const oneClickAvailable = verifyDocker ? await dockerSocketAvailable() : true;
        return {
            mode,
            oneClickAvailable,
            reason: oneClickAvailable
                ? null
                : "docker-socket-missing",
        };
    }
    if (mode === "native") {
        return { mode, oneClickAvailable: true, reason: null };
    }
    return { mode, oneClickAvailable: false, reason: "unknown-environment" };
}

// ── Native trigger (systemd) ─────────────────────────────────────────────────
function startNativeUpdate() {
    const updaterUnit = process.env.UPDATER_UNIT || NATIVE_DEFAULTS.updaterService;
    return new Promise((resolve, reject) => {
        const child = spawn(
            "systemctl",
            ["start", updaterUnit, "--no-block"],
            { stdio: "ignore", detached: true }
        );
        let resolved = false;
        const onExit = (code) => {
            if (resolved) return;
            resolved = true;
            if (code === 0) resolve();
            else reject(new Error(`systemctl start exited with code ${code}`));
        };
        child.on("error", (err) => {
            if (resolved) return;
            resolved = true;
            reject(err);
        });
        child.on("exit", onExit);
        // Safety: systemctl --no-block should return in milliseconds.
        setTimeout(() => {
            if (resolved) return;
            resolved = true;
            try { child.kill(); } catch { /* noop */ }
            reject(new Error("systemctl start timed out"));
        }, 8000);
        child.unref();
    });
}

// ── Docker trigger ───────────────────────────────────────────────────────────
async function startDockerUpdate({ fromVersion, toVersion }) {
    // 1. Find our own container by hostname (Docker sets HOSTNAME to the
    //    short container ID by default).
    const ownId = (process.env.HOSTNAME || readFile("/etc/hostname")).trim();
    if (!ownId) throw new Error("cannot determine own container id");
    const own = await dockerApi("GET", `/containers/${encodeURIComponent(ownId)}/json`);
    const ownName = (own.Name || "").replace(/^\//, "");
    if (!ownName) throw new Error("cannot determine own container name");

    // 2. Compute target image — always pull the same repo at ":latest"
    //    so the admin gets whatever GitHub Actions published last.
    const currentImageRef = (own.Config && own.Config.Image) || "";
    const [repo] = splitImageRef(currentImageRef);
    const targetImage = `${repo}:latest`;

    // 3. Spawn helper container using the SAME image (it ships the
    //    helper script in /app/scripts/). The helper mounts the data
    //    volume so it can write the status file and the Docker socket
    //    so it can drive Docker.
    const dataMount = findDataMount(own);
    if (!dataMount) {
        throw new Error("could not locate the /data mount on the main container");
    }
    const helperName = `${ownName}-updater-${Date.now()}`;
    // AutoRemove is normally true so the helper cleans itself up after
    // the swap. Setting UPDATE_KEEP_HELPER=1 in the main container's
    // environment keeps the helper around (exited state) so the admin
    // can run `docker logs <helper>` to inspect a failure.
    const keepHelper = process.env.UPDATE_KEEP_HELPER === "1";
    const helperConfig = {
        Image: currentImageRef, // use the OLD image — it has our helper
        Cmd: ["node", DOCKER_DEFAULTS.helperScript],
        Env: [
            `MAIN_CONTAINER=${ownName}`,
            `TARGET_IMAGE=${targetImage}`,
            `STATUS_FILE=${path.join(DOCKER_DEFAULTS.dataDir, ".update-status.json")}`,
            `DOCKER_SOCKET=${DOCKER_DEFAULTS.socket}`,
            `FROM_VERSION=${fromVersion || ""}`,
            `TO_VERSION=${toVersion || ""}`,
            `STARTED_AT=${new Date().toISOString()}`,
        ],
        HostConfig: {
            AutoRemove: !keepHelper,
            Binds: [
                `${dataMount}:${DOCKER_DEFAULTS.dataDir}`,
                `${DOCKER_DEFAULTS.socket}:${DOCKER_DEFAULTS.socket}`,
            ],
            RestartPolicy: { Name: "no" },
        },
        // The helper does not need to be in the main container's
        // networks — Docker socket access is enough.
    };

    const created = await dockerApi(
        "POST",
        `/containers/create?name=${encodeURIComponent(helperName)}`,
        helperConfig
    );
    await dockerApi("POST", `/containers/${created.Id}/start`);
    return { helperContainer: helperName };
}

function readFile(p) {
    try {
        return fs.readFileSync(p, "utf8");
    } catch {
        return "";
    }
}

function splitImageRef(ref) {
    const lastColon = ref.lastIndexOf(":");
    const lastSlash = ref.lastIndexOf("/");
    if (lastColon > lastSlash) {
        return [ref.slice(0, lastColon), ref.slice(lastColon + 1)];
    }
    return [ref, "latest"];
}

// Find what the host side of the /data bind/volume is so the helper
// container can mount the same persistent storage.
function findDataMount(ownInspect) {
    const mounts = ownInspect.Mounts || [];
    for (const m of mounts) {
        if (m.Destination === DOCKER_DEFAULTS.dataDir) {
            // Bind mount → return host path; named volume → return volume name.
            return m.Source || m.Name || null;
        }
    }
    return null;
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
// client thinks it is acknowledging — protects against acking the
// wrong outcome if a new update started between the user's click and
// this call.
function acknowledgeStatus(endedAt) {
    const current = readStatus();
    if (!current) return { ok: false, reason: "no-status" };
    if (!["success", "error", "rolled_back"].includes(current.state)) {
        return { ok: false, reason: "not-terminal" };
    }
    if (!current.endedAt || current.endedAt !== endedAt) {
        return { ok: false, reason: "stale" };
    }
    if (current.acknowledgedAt) {
        return { ok: true, reason: "already-acknowledged" };
    }
    const next = { ...current, acknowledgedAt: new Date().toISOString() };
    const p = getStatusFilePath();
    try {
        fs.writeFileSync(p + ".tmp", JSON.stringify(next));
        fs.renameSync(p + ".tmp", p);
    } catch (e) {
        return { ok: false, reason: "write-failed", error: e.message };
    }
    return { ok: true };
}

// ── Public: start an update ─────────────────────────────────────────────────
async function startUpdate({ fromVersion, toVersion }) {
    if (isUpdateInProgress()) {
        const err = new Error("an update is already in progress");
        err.code = "in_progress";
        throw err;
    }
    const mode = detectMode();
    writeInitialStatus({ fromVersion: fromVersion || pkg.version, toVersion });

    if (mode === "native") {
        await startNativeUpdate();
        return { mode };
    }
    if (mode === "docker") {
        await startDockerUpdate({
            fromVersion: fromVersion || pkg.version,
            toVersion,
        });
        return { mode };
    }
    const err = new Error("self-update is not supported on this install type");
    err.code = "unsupported";
    throw err;
}

module.exports = {
    detectMode,
    getMode,
    readStatus,
    readLog,
    isUpdateInProgress,
    startUpdate,
    acknowledgeStatus,
    // exposed for tests / introspection
    _internals: {
        getStatusFilePath,
        getLockFilePath,
        getDataDir,
        dockerSocketAvailable,
    },
};
