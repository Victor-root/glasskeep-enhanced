#!/usr/bin/env bash
# =============================================================================
#  GlassKeep — self-update script (native install)
#
#  Triggered by the admin panel via the glass-keep-updater systemd unit
#  (see install.sh). Runs independently from glass-keep.service so it
#  can stop / restart the main service without killing itself.
#
#  Status JSON is written atomically to $STATUS_FILE and read by the
#  /api/admin/self-update/status endpoint. Full output also goes to
#  $LOG_FILE.
#
#  On any failure the script rolls the working tree back to the commit
#  that was checked out at the start, rebuilds, and restarts the service
#  so the admin is never left with a half-updated install.
# =============================================================================
set -u
set -o pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/glass-keep/app}"
DATA_DIR="${DATA_DIR:-/opt/glass-keep/data}"
SERVICE_NAME="${SERVICE_NAME:-glass-keep}"
# Branch to pull from. Defaults to main; can be overridden via /opt/glass-keep/.env
# (`UPDATE_BRANCH=...`) to track a custom fork or pre-release branch.
TARGET_BRANCH="${UPDATE_BRANCH:-main}"
STATUS_FILE="${UPDATE_STATUS_FILE:-${DATA_DIR}/.update-status.json}"
LOG_FILE="${UPDATE_LOG_FILE:-${DATA_DIR}/.update.log}"
LOCK_FILE="${UPDATE_LOCK_FILE:-${DATA_DIR}/.update.lock}"
# Snapshot of dist/ + node_modules/ taken right before the update
# starts. On any failure we restore from here instead of re-running
# npm install + npm run build — a rebuild would just re-hit whatever
# caused the original failure (OOM on small VMs is the classic case).
BACKUP_DIR="${UPDATE_BACKUP_DIR:-${DATA_DIR}/.update-backup}"

TOTAL_STEPS=4
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
PREV_COMMIT=""
FROM_VERSION=""
TO_VERSION=""
ROLLED_BACK=0

mkdir -p "$DATA_DIR"
: > "$LOG_FILE"

# Tee everything from now on into the log file.
exec > >(tee -a "$LOG_FILE") 2>&1

# ── Lock ─────────────────────────────────────────────────────────────────────
exec 9>"$LOCK_FILE" || { echo "[self-update] cannot open lock file $LOCK_FILE"; exit 1; }
if ! flock -n 9; then
    echo "[self-update] another update is already running — abort."
    exit 2
fi

# ── Status writer (atomic) ───────────────────────────────────────────────────
# Uses a small node one-liner so we get correct JSON escaping for
# arbitrary user-facing strings without re-implementing JSON in bash.
write_status() {
    local state="$1"
    local step="$2"
    local message="$3"
    local err="${4:-}"
    local now
    now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    local terminal=0
    case "$state" in
        success|error|rolled_back) terminal=1 ;;
    esac
    STATE="$state" STEP="$step" TOTAL="$TOTAL_STEPS" MESSAGE="$message" \
    STARTED_AT="$STARTED_AT" NOW="$now" TERMINAL="$terminal" \
    FROM_VERSION="$FROM_VERSION" TO_VERSION="$TO_VERSION" \
    ERR="$err" ROLLED_BACK="$ROLLED_BACK" \
    node -e '
        const fs = require("fs");
        const path = process.env.STATUS_FILE || "'"$STATUS_FILE"'";
        const data = {
            mode: "native",
            state: process.env.STATE,
            step: parseInt(process.env.STEP, 10) || 0,
            totalSteps: parseInt(process.env.TOTAL, 10) || 0,
            message: process.env.MESSAGE || "",
            startedAt: process.env.STARTED_AT || null,
            endedAt: process.env.TERMINAL === "1" ? process.env.NOW : null,
            fromVersion: process.env.FROM_VERSION || null,
            toVersion: process.env.TO_VERSION || null,
            error: process.env.ERR || null,
            rolledBack: process.env.ROLLED_BACK === "1",
        };
        const tmp = path + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(data));
        fs.renameSync(tmp, path);
    ' STATUS_FILE="$STATUS_FILE" || true
}

read_version_from_pkg() {
    # Reads .version from package.json without needing npm/jq.
    node -e '
        try {
            console.log(require("'"$1"'").version || "");
        } catch (e) { console.log(""); }
    ' 2>/dev/null || echo ""
}

# Take a snapshot of the install dir's "built" state (dist/ and
# node_modules/) so a failed update can be reversed by just moving
# the snapshot back in place — no second npm install + npm run build
# pass that would just re-hit whatever caused the original failure
# (the OOM-during-build case on small VMs being the obvious
# motivator). Same-filesystem hardlinks are used when possible so
# the snapshot costs effectively zero disk space; we fall back to a
# real copy if dist/ or node_modules/ live on a different mount.
take_snapshot() {
    rm -rf "$BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
    for sub in dist node_modules; do
        if [[ -d "$INSTALL_DIR/$sub" ]]; then
            if cp -al "$INSTALL_DIR/$sub" "$BACKUP_DIR/$sub" 2>/dev/null; then
                echo "[self-update] snapshot: hardlinked $sub"
            else
                echo "[self-update] snapshot: cross-FS fallback, copying $sub"
                cp -a "$INSTALL_DIR/$sub" "$BACKUP_DIR/$sub"
            fi
        fi
    done
    # Also stash package.json + lock so the running app's manifest
    # always matches the dist + node_modules we put back.
    [[ -f "$INSTALL_DIR/package.json" ]] && cp "$INSTALL_DIR/package.json" "$BACKUP_DIR/package.json"
    [[ -f "$INSTALL_DIR/package-lock.json" ]] && cp "$INSTALL_DIR/package-lock.json" "$BACKUP_DIR/package-lock.json"
}

# Move a directory from the snapshot back into the install dir. Uses
# `mv` on the same filesystem (instant rename) when possible, falls
# back to a copy + delete if a cross-FS snapshot was made.
restore_from_snapshot() {
    local sub="$1"
    if [[ ! -e "$BACKUP_DIR/$sub" ]]; then
        return
    fi
    rm -rf "$INSTALL_DIR/$sub"
    if mv "$BACKUP_DIR/$sub" "$INSTALL_DIR/$sub" 2>/dev/null; then
        echo "[self-update] restored $sub from snapshot"
    else
        cp -a "$BACKUP_DIR/$sub" "$INSTALL_DIR/$sub"
        rm -rf "$BACKUP_DIR/$sub"
        echo "[self-update] restored $sub from snapshot (cross-FS)"
    fi
}

# ── Rollback ─────────────────────────────────────────────────────────────────
# Restores the install dir from the pre-update snapshot, restarts the
# service. Crucially we DO NOT re-run npm install or npm run build —
# whatever caused the update to fail (OOM, disk pressure, missing
# tooling…) would just bite us a second time. Best-effort throughout.
rollback() {
    if [[ -z "$PREV_COMMIT" ]]; then
        echo "[self-update] no previous commit recorded — skipping rollback"
        return
    fi
    echo "[self-update] rolling back to $PREV_COMMIT"
    write_status "rolling_back" 0 "Restoring previous version..." ""
    (
        cd "$INSTALL_DIR" || exit 1
        git reset --hard "$PREV_COMMIT" || true
    )
    # Restore the artifacts from the snapshot. If the snapshot is
    # incomplete for some reason (rare: someone deleted it, the
    # snapshot step itself failed silently…) we DON'T rebuild — we
    # just restart what's there and let the operator deal with it.
    restore_from_snapshot dist
    restore_from_snapshot node_modules
    if [[ -f "$BACKUP_DIR/package.json" ]]; then
        cp "$BACKUP_DIR/package.json" "$INSTALL_DIR/package.json"
    fi
    if [[ -f "$BACKUP_DIR/package-lock.json" ]]; then
        cp "$BACKUP_DIR/package-lock.json" "$INSTALL_DIR/package-lock.json"
    fi
    # restart (not start): with the new step order the main service
    # may still be running on the half-updated checkout, so we always
    # bounce it to make sure it's running the restored code.
    systemctl restart "$SERVICE_NAME" || true
    ROLLED_BACK=1
}

# ── Error trap ───────────────────────────────────────────────────────────────
on_error() {
    local exit_code=$?
    local last_step="${CURRENT_STEP:-0}"
    local err_msg="${CURRENT_ACTION:-update failed} (exit $exit_code)"
    echo "[self-update] ERROR during step $last_step: $err_msg"
    rollback
    if [[ "$ROLLED_BACK" == "1" ]]; then
        write_status "rolled_back" "$last_step" "Previous version restored after a failed update." "$err_msg"
    else
        write_status "error" "$last_step" "Update failed." "$err_msg"
    fi
    exit "$exit_code"
}
trap on_error ERR

CURRENT_STEP=0
CURRENT_ACTION="initializing"

# ── Preflight ────────────────────────────────────────────────────────────────
FROM_VERSION="$(read_version_from_pkg "$INSTALL_DIR/package.json")"
write_status "preparing" 0 "Preparing update..." ""

if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    echo "[self-update] $INSTALL_DIR is not a git checkout — refusing to update."
    write_status "error" 0 "Install directory is not a git checkout." "missing .git"
    exit 1
fi

PREV_COMMIT="$(cd "$INSTALL_DIR" && git rev-parse HEAD 2>/dev/null || true)"
echo "[self-update] previous commit: $PREV_COMMIT"

# Snapshot the current built artifacts so a failed update can be
# undone without rebuilding (the rebuild would just re-hit OOM /
# whatever caused the original failure). Cheap thanks to hardlinks
# when the install dir + data dir share a filesystem.
take_snapshot

# Step order rationale: we do all the "heavy" work (git pull, npm
# install, npm build) BEFORE stopping the service. The frontend is
# polling /api/admin/self-update/status, so as long as glass-keep is
# up the user sees real-time progress. We only cut the service for
# the final restart, which is brief (~2 s). Running git/npm in place
# is safe because the live Node process keeps its modules in memory —
# it doesn't re-read source files at runtime, so we can update them
# under its feet without breaking anything.

# ── Step 1: pull the latest code ─────────────────────────────────────────────
CURRENT_STEP=1
CURRENT_ACTION="downloading the latest version"
write_status "fetching" "$CURRENT_STEP" "Downloading the latest version..." ""
echo "[self-update] target branch: $TARGET_BRANCH"
(
    cd "$INSTALL_DIR"
    # Guard against local edits leaking into the rebuild.
    git fetch --depth=1 origin "$TARGET_BRANCH"
    git reset --hard "origin/$TARGET_BRANCH"
)

TO_VERSION="$(read_version_from_pkg "$INSTALL_DIR/package.json")"
echo "[self-update] new package.json version: ${TO_VERSION:-unknown}"

# ── Step 2: install dependencies ─────────────────────────────────────────────
CURRENT_STEP=2
CURRENT_ACTION="installing dependencies"
write_status "installing" "$CURRENT_STEP" "Installing dependencies..." ""
(
    cd "$INSTALL_DIR"
    # systemd starts us with NODE_ENV=production (from /opt/glass-keep/.env),
    # which makes `npm install` strip devDependencies — including vite and
    # @vitejs/plugin-react, both of which are needed by the next step's
    # `vite build`. Scope NODE_ENV=development to just this command and
    # pass --include=dev for belt-and-suspenders so the build that follows
    # has everything it needs.
    NODE_ENV=development npm install --silent --include=dev
)

# ── Step 3: build the front-end ──────────────────────────────────────────────
CURRENT_STEP=3
CURRENT_ACTION="building the application"
write_status "building" "$CURRENT_STEP" "Building the application..." ""
(
    cd "$INSTALL_DIR"
    npm run build
)

# ── Step 4: restart the service ──────────────────────────────────────────────
# This is the only moment the app is unreachable. The frontend will
# briefly show "waiting for the server" here before resuming.
CURRENT_STEP=4
CURRENT_ACTION="restarting the service"
write_status "starting_service" "$CURRENT_STEP" "Restarting the service..." ""
systemctl restart "$SERVICE_NAME"

# Give the service a moment to come up. Healthcheck-ish.
sleep 2
if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    # Try once more after a longer wait; better-sqlite3 can take a beat
    # on slower hosts after a fresh build.
    sleep 5
    if ! systemctl is-active --quiet "$SERVICE_NAME"; then
        CURRENT_ACTION="service failed to start after update"
        false
    fi
fi

# ── Success ──────────────────────────────────────────────────────────────────
trap - ERR
# Update worked — the snapshot served its purpose and is just disk
# usage at this point. Wipe it.
rm -rf "$BACKUP_DIR"
write_status "success" "$TOTAL_STEPS" "Update completed successfully." ""
echo "[self-update] done."
exit 0
