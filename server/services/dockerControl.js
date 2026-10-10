// =============================================================================
//  GlassKeep: talking to the Docker daemon from inside the container
//
//  The mounted Docker socket, as services/updateOrchestrator.js uses it: is
//  it usable (and if not, why), which container are we, and the short-lived
//  helper container that performs a Docker update.
// =============================================================================

const path = require("path");
const http = require("http");

const { DOCKER_DEFAULTS, safeExists, readFile } = require("./updateStatus");

// ── Docker capability check ──────────────────────────────────────────────────
// Probe the Docker socket and classify WHY one-click is unavailable so the
// admin panel can show an accurate remedy instead of a single catch-all
// "the socket is missing" message. The distinction matters on platforms
// like Synology, where the socket IS mounted but owned by root:root: the
// app user gets EACCES, which used to be reported as "missing".
async function probeDockerSocket() {
    if (!safeExists(DOCKER_DEFAULTS.socket)) {
        return { ok: false, reason: "docker-socket-missing" };
    }
    try {
        await dockerApi("GET", "/_ping");
        return { ok: true, reason: null };
    } catch (e) {
        const code = e && e.code;
        // EACCES/EPERM: socket exists but the app user cannot open it
        // (the classic Synology root:root case).
        if (code === "EACCES" || code === "EPERM") {
            return { ok: false, reason: "docker-socket-permission-denied" };
        }
        // ENOENT: the socket vanished between the existence check and the
        // connect: treat it as missing.
        if (code === "ENOENT") {
            return { ok: false, reason: "docker-socket-missing" };
        }
        // ECONNREFUSED, timeouts, or a non-2xx /_ping reply: the socket is
        // reachable but the daemon did not answer cleanly.
        return { ok: false, reason: "docker-daemon-unreachable" };
    }
}

async function dockerSocketAvailable() {
    return (await probeDockerSocket()).ok;
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

// Our own container's id. Docker sets HOSTNAME to the short container ID
// by default.
function getOwnContainerId() {
    const fromEnv = process.env.HOSTNAME;
    if (fromEnv) return fromEnv.trim();
    const fromFile = readFile("/etc/hostname");
    return fromFile ? fromFile.trim() : "";
}

// ── Docker trigger ───────────────────────────────────────────────────────────
async function startDockerUpdate({ fromVersion, toVersion }) {
    // 1. Find our own container by hostname.
    const ownId = getOwnContainerId();
    if (!ownId) throw new Error("cannot determine own container id");
    const own = await dockerApi("GET", `/containers/${encodeURIComponent(ownId)}/json`);
    const ownName = (own.Name || "").replace(/^\//, "");
    if (!ownName) throw new Error("cannot determine own container name");

    // 2. Compute target image: always pull the same repo at ":latest"
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
        Image: currentImageRef, // use the OLD image: it has our helper
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
        // networks: Docker socket access is enough.
    };

    const created = await dockerApi(
        "POST",
        `/containers/create?name=${encodeURIComponent(helperName)}`,
        helperConfig
    );
    await dockerApi("POST", `/containers/${created.Id}/start`);
    return { helperContainer: helperName };
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

module.exports = {
    probeDockerSocket,
    dockerSocketAvailable,
    dockerApi,
    getOwnContainerId,
    startDockerUpdate,
};
