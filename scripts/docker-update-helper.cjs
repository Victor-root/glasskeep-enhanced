#!/usr/bin/env node
/* eslint-disable no-console */
// =============================================================================
//  GlassKeep — Docker self-update helper
//
//  Runs inside a short-lived "updater" container (spawned by the main
//  GlassKeep container via the Docker socket). Its job is to swap the
//  main container with a fresh one using the latest image.
//
//  Why a sidecar? A container cannot recreate itself: once it stops,
//  nothing is left to start the replacement. So the main app spawns
//  this helper, then exits when the helper stops it.
//
//  On any failure, the helper attempts to roll back by restoring the
//  previous container (rename back + start) so the admin is never
//  left without a running app.
// =============================================================================

const fs = require("fs");
const http = require("http");
const path = require("path");

const DOCKER_SOCK = process.env.DOCKER_SOCKET || "/var/run/docker.sock";
const MAIN_CONTAINER = process.env.MAIN_CONTAINER;
const TARGET_IMAGE = process.env.TARGET_IMAGE;
const STATUS_FILE = process.env.STATUS_FILE || "/data/.update-status.json";
const LOG_FILE =
    process.env.LOG_FILE || path.join(path.dirname(STATUS_FILE), ".update.log");
const FROM_VERSION = process.env.FROM_VERSION || null;
const TO_VERSION = process.env.TO_VERSION || null;
const STARTED_AT = process.env.STARTED_AT || new Date().toISOString();

// Mirror stdout/stderr to the same /data/.update.log file that
// self-update.sh writes to, so the admin's "Show details" panel can
// surface the same kind of expert output for Docker installs.
try { fs.writeFileSync(LOG_FILE, ""); } catch { /* ignore */ }
const _appendLog = (s) => {
    try { fs.appendFileSync(LOG_FILE, s + "\n"); } catch { /* ignore */ }
};
const _origLog = console.log.bind(console);
const _origErr = console.error.bind(console);
console.log = (...args) => {
    _origLog(...args);
    _appendLog(args.map(String).join(" "));
};
console.error = (...args) => {
    _origErr(...args);
    _appendLog(args.map(String).join(" "));
};

const TOTAL_STEPS = 5;
let CURRENT_STEP = 0;
let PRE_RENAMED_NAME = null; // name we renamed the old container to (for rollback)

if (!MAIN_CONTAINER || !TARGET_IMAGE) {
    console.error("[docker-update-helper] missing MAIN_CONTAINER or TARGET_IMAGE env");
    process.exit(1);
}

// Early diagnostics: surface uid/gid/groups, env, and docker socket
// reachability BEFORE doing any real work so a permissions issue (the
// usual suspect when this helper crashes silently) is visible in
// `docker logs <helper>` even if /data is not writable yet.
console.log(`[docker-update-helper] booting (pid ${process.pid})`);
try {
    console.log(
        `[docker-update-helper] uid=${process.getuid()} gid=${process.getgid()} groups=${process.getgroups().join(",")}`
    );
} catch (e) {
    console.log(`[docker-update-helper] uid/gid lookup failed: ${e.message}`);
}
console.log(`[docker-update-helper] MAIN_CONTAINER=${MAIN_CONTAINER}`);
console.log(`[docker-update-helper] TARGET_IMAGE=${TARGET_IMAGE}`);
console.log(`[docker-update-helper] STATUS_FILE=${STATUS_FILE}`);
console.log(`[docker-update-helper] LOG_FILE=${LOG_FILE}`);
console.log(`[docker-update-helper] DOCKER_SOCK=${DOCKER_SOCK}`);
try {
    fs.accessSync(DOCKER_SOCK, fs.constants.R_OK | fs.constants.W_OK);
    console.log("[docker-update-helper] docker socket: accessible");
} catch (e) {
    console.error(
        "[docker-update-helper] docker socket NOT accessible:",
        e.message
    );
}
try {
    fs.accessSync(path.dirname(STATUS_FILE), fs.constants.W_OK);
    console.log("[docker-update-helper] data dir: writable");
} catch (e) {
    console.error(
        "[docker-update-helper] data dir NOT writable:",
        e.message
    );
}

// ── Status writer (atomic) ───────────────────────────────────────────────────
function writeStatus(state, step, message, error = null, rolledBack = false) {
    const terminal = ["success", "error", "rolled_back"].includes(state);
    const data = {
        mode: "docker",
        state,
        step,
        totalSteps: TOTAL_STEPS,
        message: message || "",
        startedAt: STARTED_AT,
        endedAt: terminal ? new Date().toISOString() : null,
        fromVersion: FROM_VERSION,
        toVersion: TO_VERSION,
        error: error || null,
        rolledBack: !!rolledBack,
    };
    try {
        fs.writeFileSync(STATUS_FILE + ".tmp", JSON.stringify(data));
        fs.renameSync(STATUS_FILE + ".tmp", STATUS_FILE);
    } catch (e) {
        console.error("[docker-update-helper] cannot write status file:", e.message);
    }
    // Also surface the step in the human-readable log so the admin's
    // "Show details" panel reflects progress beyond the structured
    // status fields. Errors get an explicit marker for grep-ability.
    const errSuffix = error ? ` — ${error}` : "";
    console.log(`[${state} ${step}/${TOTAL_STEPS}] ${message}${errSuffix}`);
}

// ── Docker HTTP API client over the Unix socket ──────────────────────────────
function dockerRequest(method, path, body, { stream = false } = {}) {
    return new Promise((resolve, reject) => {
        const opts = {
            socketPath: DOCKER_SOCK,
            method,
            path,
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
                            `Docker API ${res.statusCode} on ${method} ${path}: ${raw.slice(0, 400)}`
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

async function dockerPullImage(image) {
    // POST /images/create streams JSON lines of progress; we just drain
    // the stream and surface errors. Pull may take a while on slow
    // networks — no timeout here on purpose.
    const [repo, tag] = splitImageRef(image);
    const path = `/images/create?fromImage=${encodeURIComponent(repo)}&tag=${encodeURIComponent(tag)}`;
    const res = await dockerRequest("POST", path, null, { stream: true });
    return new Promise((resolve, reject) => {
        let lastErr = null;
        res.setEncoding("utf8");
        let buf = "";
        res.on("data", (chunk) => {
            buf += chunk;
            let idx;
            while ((idx = buf.indexOf("\n")) >= 0) {
                const line = buf.slice(0, idx).trim();
                buf = buf.slice(idx + 1);
                if (!line) continue;
                try {
                    const obj = JSON.parse(line);
                    if (obj.error) lastErr = obj.error;
                } catch {
                    /* ignore non-JSON lines */
                }
            }
        });
        res.on("end", () => {
            if (res.statusCode && res.statusCode >= 400) {
                return reject(new Error(`pull HTTP ${res.statusCode}`));
            }
            if (lastErr) return reject(new Error(lastErr));
            resolve();
        });
        res.on("error", reject);
    });
}

function splitImageRef(ref) {
    // Splits "registry/repo:tag" → ["registry/repo", "tag"].
    // Defaults the tag to "latest" if not provided.
    const lastColon = ref.lastIndexOf(":");
    const lastSlash = ref.lastIndexOf("/");
    if (lastColon > lastSlash) {
        return [ref.slice(0, lastColon), ref.slice(lastColon + 1)];
    }
    return [ref, "latest"];
}

// Translate an "inspect" payload into a valid "create" payload. The
// REST API uses slightly different field shapes between the two.
function buildCreateConfig(inspect, newImage) {
    const cfg = { ...(inspect.Config || {}) };
    cfg.Image = newImage;
    // Hostname / Domainname must NOT be inherited. Docker auto-fills
    // Hostname with the container's short ID when left empty, but the
    // inspect output captures the OLD container's ID — preserving it
    // freezes the new container's /etc/hostname at a stale value and
    // breaks the next self-update (the orchestrator can no longer find
    // its own container by hostname).
    delete cfg.Hostname;
    delete cfg.Domainname;

    const hostConfig = { ...(inspect.HostConfig || {}) };

    // NetworkingConfig: rebuild from the live network attachments so
    // the new container ends up on the same user-defined networks
    // (the common docker-compose case). We strip per-instance fields
    // (IPs, MAC, EndpointID) — Docker will re-assign them.
    const networkingConfig = { EndpointsConfig: {} };
    const nets = inspect.NetworkSettings && inspect.NetworkSettings.Networks;
    if (nets && typeof nets === "object") {
        for (const [name, net] of Object.entries(nets)) {
            networkingConfig.EndpointsConfig[name] = {
                Aliases: Array.isArray(net.Aliases) ? net.Aliases : undefined,
                Links: Array.isArray(net.Links) ? net.Links : undefined,
            };
        }
    }

    return { ...cfg, HostConfig: hostConfig, NetworkingConfig: networkingConfig };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function inspectContainer(nameOrId) {
    return dockerRequest("GET", `/containers/${encodeURIComponent(nameOrId)}/json`);
}

async function waitHealthy(containerId, timeoutMs = 90_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const info = await inspectContainer(containerId);
            const state = info.State || {};
            const health = state.Health && state.Health.Status;
            if (health === "healthy") return true;
            if (health === "unhealthy") return false;
            // No healthcheck configured → fall back to "Running"
            if (!state.Health && state.Running) return true;
            if (state.Status === "exited") return false;
        } catch {
            /* container might not be queryable yet */
        }
        await sleep(2000);
    }
    return false;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// ── Rollback ─────────────────────────────────────────────────────────────────
async function rollback() {
    if (!PRE_RENAMED_NAME) {
        console.error("[docker-update-helper] nothing to roll back");
        return false;
    }
    try {
        console.log("[docker-update-helper] rolling back to", PRE_RENAMED_NAME);
        // Best-effort: remove any partially-created new container.
        try {
            await dockerRequest("DELETE", `/containers/${encodeURIComponent(MAIN_CONTAINER)}?force=true`);
        } catch {
            /* ignore — may not exist */
        }
        // Rename the old container back to its original name.
        await dockerRequest(
            "POST",
            `/containers/${encodeURIComponent(PRE_RENAMED_NAME)}/rename?name=${encodeURIComponent(MAIN_CONTAINER)}`
        );
        await dockerRequest("POST", `/containers/${encodeURIComponent(MAIN_CONTAINER)}/start`);
        return true;
    } catch (e) {
        console.error("[docker-update-helper] rollback failed:", e.message);
        return false;
    }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    writeStatus("preparing", 0, "Preparing update...");

    // Sanity check: confirm the main container exists and grab its config.
    CURRENT_STEP = 1;
    writeStatus("fetching", CURRENT_STEP, "Downloading the latest image...");
    const oldInspect = await inspectContainer(MAIN_CONTAINER);
    await dockerPullImage(TARGET_IMAGE);

    // Step 2: stop the running container.
    CURRENT_STEP = 2;
    writeStatus("stopping_service", CURRENT_STEP, "Stopping the running container...");
    try {
        await dockerRequest("POST", `/containers/${encodeURIComponent(MAIN_CONTAINER)}/stop?t=15`);
    } catch (e) {
        // If already stopped that's fine.
        if (!/304/.test(e.message) && !/already/i.test(e.message)) throw e;
    }

    // Step 3: rename old container so we can create the new one under
    // the original name.
    CURRENT_STEP = 3;
    PRE_RENAMED_NAME = `${MAIN_CONTAINER}-pre-update-${Date.now()}`;
    writeStatus("renaming", CURRENT_STEP, "Preparing for the new version...");
    await dockerRequest(
        "POST",
        `/containers/${encodeURIComponent(MAIN_CONTAINER)}/rename?name=${encodeURIComponent(PRE_RENAMED_NAME)}`
    );

    // Step 4: create + start a new container with the new image.
    CURRENT_STEP = 4;
    writeStatus("creating", CURRENT_STEP, "Starting the new version...");
    const createCfg = buildCreateConfig(oldInspect, TARGET_IMAGE);
    const created = await dockerRequest(
        "POST",
        `/containers/create?name=${encodeURIComponent(MAIN_CONTAINER)}`,
        createCfg
    );
    await dockerRequest("POST", `/containers/${encodeURIComponent(created.Id)}/start`);

    // Step 5: wait for the new container to be healthy (or just Running
    // if no healthcheck is configured).
    CURRENT_STEP = 5;
    writeStatus("starting_service", CURRENT_STEP, "Waiting for the new version to come up...");
    const ok = await waitHealthy(created.Id, 90_000);
    if (!ok) {
        throw new Error("new container did not become healthy in 90s");
    }

    // Clean up the old container — its data volume is mounted in the
    // new one so we are not losing anything.
    try {
        await dockerRequest(
            "DELETE",
            `/containers/${encodeURIComponent(PRE_RENAMED_NAME)}?force=true`
        );
    } catch (e) {
        console.error("[docker-update-helper] could not remove old container:", e.message);
    }
    PRE_RENAMED_NAME = null;

    writeStatus("success", TOTAL_STEPS, "Update completed successfully.");
    console.log("[docker-update-helper] done.");
}

main().catch(async (err) => {
    console.error("[docker-update-helper] failed:", err && err.stack ? err.stack : err);
    const msg = (err && err.message) || String(err);
    const rolled = await rollback();
    if (rolled) {
        writeStatus(
            "rolled_back",
            CURRENT_STEP,
            "Previous version restored after a failed update.",
            msg,
            true
        );
    } else {
        writeStatus("error", CURRENT_STEP, "Update failed.", msg, false);
    }
    process.exit(1);
});
