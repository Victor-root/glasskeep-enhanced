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
//
//  The install layout and the status files live in updateStatus.js, the
//  Docker socket and the helper container in dockerControl.js.
// =============================================================================

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync, execFile } = require("child_process");

const pkg = require("../../package.json");
const {
    NATIVE_DEFAULTS,
    detectMode,
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
} = require("./updateStatus");
const {
    probeDockerSocket,
    dockerSocketAvailable,
    dockerApi,
    getOwnContainerId,
    startDockerUpdate,
} = require("./dockerControl");

async function getMode({ verifyDocker = true } = {}) {
    const mode = detectMode();
    if (mode === "docker") {
        if (!verifyDocker) {
            return { mode, oneClickAvailable: true, reason: null };
        }
        const probe = await probeDockerSocket();
        return {
            mode,
            oneClickAvailable: probe.ok,
            reason: probe.ok ? null : probe.reason,
        };
    }
    if (mode === "native") {
        return { mode, oneClickAvailable: true, reason: null };
    }
    return { mode, oneClickAvailable: false, reason: "unknown-environment" };
}

// ── Native trigger (systemd) ─────────────────────────────────────────────────
function startNativeUpdate(toVersion) {
    const updaterUnit = process.env.UPDATER_UNIT || NATIVE_DEFAULTS.updaterService;
    // Record which release this run is supposed to land on, for
    // self-update.sh to pick up (see getTargetVersionFilePath above).
    // Best-effort: if the write fails, the script falls back to
    // whatever sits on the tracked branch, same as before this existed.
    if (toVersion) {
        try {
            fs.writeFileSync(getTargetVersionFilePath(), String(toVersion).replace(/^v/i, ""));
        } catch { /* self-update.sh falls back to the tracked branch */ }
    }
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
            else {
                try { fs.unlinkSync(getTargetVersionFilePath()); } catch { /* noop */ }
                reject(new Error(`systemctl start exited with code ${code}`));
            }
        };
        child.on("error", (err) => {
            if (resolved) return;
            resolved = true;
            try { fs.unlinkSync(getTargetVersionFilePath()); } catch { /* noop */ }
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
        await startNativeUpdate(toVersion);
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

// Cancels a running native update: kills every process in the
// updater service's cgroup (the bash script, npm, vite, node…),
// restores the install directory from the snapshot taken at start,
// writes a "cancelled" status, and schedules a glass-keep restart
// so the cleanly-restored old version takes over. Docker is not
// supported here yet — the helper container's swap dance has a
// different rollback path.
async function cancelUpdate() {
    const mode = detectMode();
    if (mode !== "native") {
        const e = new Error("cancel currently supported only for native installs");
        e.code = "unsupported";
        throw e;
    }
    // Killing apt mid-install would leave Node.js itself half replaced.
    if (readStatus()?.state === "upgrading_runtime") {
        const e = new Error("Node.js is being upgraded; the update cannot be cancelled now");
        e.code = "not_cancellable";
        throw e;
    }
    const installDir = process.env.INSTALL_DIR || NATIVE_DEFAULTS.installDir;
    const dataDir = getDataDir();
    const backupDir = path.join(dataDir, ".update-backup");
    const serviceName = process.env.SERVICE_NAME || NATIVE_DEFAULTS.serviceName;
    const updaterUnit = process.env.UPDATER_UNIT || NATIVE_DEFAULTS.updaterService;

    // 1. Kill the whole updater cgroup hard. SIGKILL bypasses any
    //    trap the script might be in the middle of running; what we
    //    want here is "everything dies right now so RAM frees up".
    spawnSync("systemctl", ["kill", "--signal=SIGKILL", updaterUnit], {
        stdio: "ignore",
    });
    // Allow the unit to be started again later.
    spawnSync("systemctl", ["reset-failed", updaterUnit], { stdio: "ignore" });

    // 2. Give the kernel a second to reap the dead processes and
    //    release their memory — important when the cancel was
    //    triggered by RAM pressure.
    await new Promise((r) => setTimeout(r, 1500));

    // 3. Restore the install dir from the snapshot, exactly the same
    //    way the script's rollback path would have. PREV_COMMIT was
    //    written into BACKUP_DIR by take_snapshot so we know which
    //    commit to reset to.
    if (fs.existsSync(backupDir)) {
        try {
            const prevCommit = fs
                .readFileSync(path.join(backupDir, "PREV_COMMIT"), "utf8")
                .trim();
            if (prevCommit) {
                spawnSync("git", ["-C", installDir, "reset", "--hard", prevCommit], {
                    stdio: "ignore",
                });
            }
        } catch {
            /* no PREV_COMMIT file — leave git alone, the snapshot
             * dist + node_modules is still useful */
        }

        for (const sub of ["dist", "node_modules"]) {
            const src = path.join(backupDir, sub);
            const dst = path.join(installDir, sub);
            if (!fs.existsSync(src)) continue;
            spawnSync("rm", ["-rf", dst], { stdio: "ignore" });
            try {
                fs.renameSync(src, dst);
            } catch {
                // Cross-FS or rename failed — fall back to copy + delete.
                spawnSync("cp", ["-a", src, dst], { stdio: "ignore" });
                spawnSync("rm", ["-rf", src], { stdio: "ignore" });
            }
        }
        for (const f of ["package.json", "package-lock.json"]) {
            const src = path.join(backupDir, f);
            const dst = path.join(installDir, f);
            if (fs.existsSync(src)) {
                try { fs.copyFileSync(src, dst); } catch { /* ignore */ }
            }
        }
        // Same as the script's rebuild_if_node_changed: the run may have
        // upgraded Node before it was cancelled.
        const snapshotNode = (readFile(path.join(backupDir, "NODE_MAJOR")) || "").trim();
        if (snapshotNode && snapshotNode !== installedNodeMajor()) {
            spawnSync("npm", ["rebuild", "--silent"], {
                cwd: installDir,
                stdio: "ignore",
                timeout: 5 * 60 * 1000,
            });
        }
        spawnSync("rm", ["-rf", backupDir], { stdio: "ignore" });
    }

    // 4. Mark the status file as cancelled BEFORE the restart so the
    //    new glass-keep instance reports the right state right away.
    const current = readStatus() || {};
    const cancelStatus = {
        mode,
        state: "cancelled",
        step: current.step || 0,
        totalSteps: current.totalSteps || 4,
        message: "Update cancelled by the administrator.",
        startedAt: current.startedAt || null,
        endedAt: new Date().toISOString(),
        fromVersion: current.fromVersion || null,
        toVersion: current.toVersion || null,
        error: null,
        rolledBack: true,
    };
    try {
        writeStatus(cancelStatus);
    } catch (e) {
        // Status write failed — log but proceed. Frontend can still
        // tell the update is over via the empty/stale status.
        console.error("[cancelUpdate] status write failed:", e.message);
    }

    // 5. Bounce glass-keep so the just-restored code takes over.
    //    --no-block lets this HTTP response flush before systemd
    //    kills us.
    spawnSync("systemctl", ["restart", `${serviceName}.service`, "--no-block"], {
        stdio: "ignore",
    });
}

// Major of the Node.js installed on disk, which the restarted service will
// run: after an upgrade it differs from the one running this process.
function installedNodeMajor() {
    const r = spawnSync("node", ["-p", "process.versions.node.split('.')[0]"], {
        encoding: "utf8",
        timeout: 10000,
    });
    return (r.stdout || "").trim();
}

// ── Node.js runtime catch-up ─────────────────────────────────────────────────
// An update runs the self-update.sh of the version being replaced, which
// may predate its Node.js step: the new release then starts on the old
// Node. Once that run has finished, run the updater again for this same
// release, whose script upgrades Node. The marker keeps a failed attempt
// from looping on every start; the admin panel shows its outcome.
function completeRuntimeUpgrade(log = console) {
    if (detectMode() !== "native") return;
    const required = Number((pkg.engines?.node || "").match(/\d+/)?.[0]);
    const running = Number(process.versions.node.split(".")[0]);
    if (!required || running >= required) return;
    const updaterUnit = process.env.UPDATER_UNIT || NATIVE_DEFAULTS.updaterService;
    const marker = path.join(getDataDir(), ".runtime-upgrade-attempt");
    const deadline = Date.now() + 10 * 60 * 1000;

    const attempt = () => {
        // The update that installed this release restarted us before its
        // own last checks; starting the unit while it still runs would
        // only join that run.
        const unitState = spawnSync("systemctl", ["show", "-p", "ActiveState", "--value", updaterUnit], {
            encoding: "utf8",
            timeout: 10000,
        }).stdout?.trim();
        if (["activating", "active", "deactivating"].includes(unitState) || isUpdateInProgress()) {
            if (Date.now() < deadline) setTimeout(attempt, 5000).unref();
            return;
        }
        if (readFile(marker).trim() === pkg.version) {
            log.warn(`[self-update] still on Node.js ${process.version}, v${required} is required; the automatic upgrade already ran for ${pkg.version}`);
            return;
        }
        try {
            fs.writeFileSync(marker, pkg.version);
        } catch (e) {
            log.warn(`[self-update] cannot record the Node.js upgrade attempt: ${e.message}`);
            return;
        }
        log.log(`[self-update] Node.js ${process.version} is older than v${required}: upgrading it`);
        startUpdate({ fromVersion: pkg.version, toVersion: pkg.version }).catch((e) => {
            log.warn(`[self-update] Node.js upgrade failed to start: ${e.message}`);
        });
    };
    attempt();
}

// ── Lifecycle (restart / shutdown the running instance) ─────────────────────
// In native mode we delegate to systemd, which already supervises the unit.
// In docker mode we ask the Docker daemon (via the mounted socket) to act on
// our own container: the running JS process never has to coordinate its
// own death, the daemon SIGTERMs us and either starts a fresh container or
// leaves us stopped, depending on the call. `action` is "restart" or
// "stop", the verb both systemctl and the Docker API use.
async function controlSelf(action) {
    const mode = detectMode();
    if (mode === "docker") {
        if (!(await dockerSocketAvailable())) {
            throw new Error(`Docker socket is not mounted — cannot ${action} from inside the container.`);
        }
        const ownId = getOwnContainerId();
        if (!ownId) throw new Error("Could not determine own container ID.");
        await dockerApi("POST", `/containers/${encodeURIComponent(ownId)}/${action}?t=10`);
        return;
    }
    if (mode === "native") {
        return new Promise((resolve, reject) => {
            execFile(
                "systemctl",
                [action, NATIVE_DEFAULTS.serviceName],
                { timeout: 15000 },
                (err) => (err ? reject(err) : resolve()),
            );
        });
    }
    throw new Error("Server lifecycle not supported in this environment.");
}

function restartSelf() {
    return controlSelf("restart");
}

function shutdownSelf() {
    return controlSelf("stop");
}

module.exports = {
    detectMode,
    getMode,
    readStatus,
    readLog,
    isUpdateInProgress,
    startUpdate,
    cancelUpdate,
    completeRuntimeUpgrade,
    acknowledgeStatus,
    restartSelf,
    shutdownSelf,
    // exposed for tests / introspection
    _internals: {
        getStatusFilePath,
        getLockFilePath,
        getDataDir,
        dockerSocketAvailable,
        probeDockerSocket,
    },
};
