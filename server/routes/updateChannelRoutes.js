// server/routes/updateChannelRoutes.js
//
// The update channel an admin picks (see services/updateChannel.js).
//
//   GET  /api/admin/update-channel   where things stand: the channel, the
//        running build, the database's format level, the latest stable
//        release and whether it reads this database, and the backup taken
//        before the beta.
//   POST /api/admin/update-channel   { channel, action }
//        "beta"    backs the database up (when leaving a stable build),
//                  switches, and installs the beta on offer, if any.
//        "stable"  from a stable build, only switches. From a beta, how to
//                  leave it is the admin's call (`action`):
//                    now      install the latest stable release now, when
//                             it reads the beta's data;
//                    restore  install it and restore the backup taken
//                             before the beta, losing what changed since;
//                    wait     keep this beta until a newer stable release
//                             replaces it, like any update.
//
// Installing goes through the one-click update, with its progress modal,
// its rollback and its backups (see db/dbSafety.js).

const orchestrator = require("../services/updateOrchestrator");
const safety = require("../db/dbSafety");

const LEAVE_ACTIONS = new Set(["now", "restore", "wait"]);

function attachUpdateChannelRoutes(app, { db, dbFile, auth, adminOnly, updateChannel, build, log = console } = {}) {
  // Whether the one-click update can install a build right now.
  async function readiness() {
    const mode = await orchestrator.getMode({ verifyDocker: true });
    if (!mode.oneClickAvailable) return { ok: false, reason: mode.reason || "unavailable" };
    if (orchestrator.isUpdateInProgress()) return { ok: false, reason: "in_progress" };
    return { ok: true };
  }

  async function install(target) {
    await orchestrator.startUpdate({ fromVersion: build.label, target });
    return { started: true, toVersion: target.label };
  }

  app.get("/api/admin/update-channel", auth, adminOnly, async (_req, res) => {
    let stable = null;
    try {
      stable = (await updateChannel.check()).stable;
    } catch { /* GitHub unreachable: the panel says so */ }
    const level = safety.dbLevel(db);
    const ready = await readiness();
    res.json({
      channel: updateChannel.getChannel(),
      build: { version: build.version, label: build.label, commit: build.commit, beta: build.beta },
      dbLevel: level,
      stable: stable && {
        version: stable.version,
        dbCompat: stable.dbCompat,
        readsThisDatabase: level <= stable.dbCompat,
      },
      preBetaBackup: safety.readPreBetaBackup(dbFile),
      oneClick: { available: ready.ok, reason: ready.ok ? null : ready.reason },
    });
  });

  app.post("/api/admin/update-channel", auth, adminOnly, async (req, res) => {
    const channel = req.body?.channel;
    const action = req.body?.action;
    try {
      if (channel === "beta") return res.json(await enterBeta());
      if (channel === "stable") {
        if (!build.beta) {
          updateChannel.setChannel("stable");
          return res.json({ channel: "stable", started: false });
        }
        if (!LEAVE_ACTIONS.has(action)) return res.status(400).json({ error: "action must be now, restore or wait" });
        return await leaveBeta(action, res);
      }
      return res.status(400).json({ error: "channel must be stable or beta" });
    } catch (e) {
      log.warn?.(`[update-channel] ${channel}/${action || "-"} failed: ${e.message}`);
      return res.status(500).json({ error: e.message || "channel change failed" });
    }
  });

  async function enterBeta() {
    // The backup to come back to belongs to the stable build being left.
    // From a beta (one the admin chose to wait on) the existing one stays.
    if (!build.beta) safety.takePreBetaBackup(db, dbFile, build);
    updateChannel.setChannel("beta");
    const { target } = await updateChannel.check({ force: true });
    if (!target) return { channel: "beta", started: false, reason: "no_beta" };
    const ready = await readiness();
    if (!ready.ok) return { channel: "beta", started: false, reason: ready.reason };
    return { channel: "beta", ...(await install(target)) };
  }

  async function leaveBeta(action, res) {
    if (action === "wait") {
      updateChannel.setChannel("stable");
      return res.json({ channel: "stable", started: false });
    }
    let stable;
    try {
      stable = (await updateChannel.check({ force: true })).stable;
    } catch {
      return res.status(502).json({ error: "the update check could not reach GitHub" });
    }
    if (!stable) return res.status(502).json({ error: "no stable release found" });
    if (action === "now" && safety.dbLevel(db) > stable.dbCompat) {
      return res.status(409).json({ error: "incompatible", stable: stable.version });
    }
    if (action === "restore" && !safety.readPreBetaBackup(dbFile)) {
      return res.status(409).json({ error: "no_backup" });
    }
    const ready = await readiness();
    if (!ready.ok) return res.status(409).json({ error: ready.reason });

    if (action === "restore") safety.requestRestore(dbFile, stable.version);
    updateChannel.setChannel("stable");
    try {
      return res.json({ channel: "stable", ...(await install(stable)) });
    } catch (e) {
      // Nothing was installed: leave everything as it was.
      safety.cancelRestore(dbFile);
      updateChannel.setChannel("beta");
      throw e;
    }
  }
}

module.exports = { attachUpdateChannelRoutes };
