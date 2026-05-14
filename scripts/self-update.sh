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
STATUS_FILE="${UPDATE_STATUS_FILE:-${DATA_DIR}/.update-status.json}"
LOG_FILE="${UPDATE_LOG_FILE:-${DATA_DIR}/.update.log}"
LOCK_FILE="${UPDATE_LOCK_FILE:-${DATA_DIR}/.update.lock}"

TOTAL_STEPS=5
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

# ── Rollback ─────────────────────────────────────────────────────────────────
# Restores the working tree to PREV_COMMIT, rebuilds, restarts. Best-effort.
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
        npm install --silent || true
        npm run build || true
    )
    systemctl start "$SERVICE_NAME" || true
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

# ── Step 1: stop the service ─────────────────────────────────────────────────
CURRENT_STEP=1
CURRENT_ACTION="stopping the running service"
write_status "stopping_service" "$CURRENT_STEP" "Stopping the running service..." ""
systemctl stop "$SERVICE_NAME"

# ── Step 2: pull the latest code ─────────────────────────────────────────────
CURRENT_STEP=2
CURRENT_ACTION="downloading the latest version"
write_status "fetching" "$CURRENT_STEP" "Downloading the latest version..." ""
(
    cd "$INSTALL_DIR"
    # Guard against local edits leaking into the rebuild.
    git fetch --depth=1 origin main
    git reset --hard origin/main
)

TO_VERSION="$(read_version_from_pkg "$INSTALL_DIR/package.json")"
echo "[self-update] new package.json version: ${TO_VERSION:-unknown}"

# ── Step 3: install dependencies ─────────────────────────────────────────────
CURRENT_STEP=3
CURRENT_ACTION="installing dependencies"
write_status "installing" "$CURRENT_STEP" "Installing dependencies..." ""
(
    cd "$INSTALL_DIR"
    npm install --silent
)

# ── Step 4: build the front-end ──────────────────────────────────────────────
CURRENT_STEP=4
CURRENT_ACTION="building the application"
write_status "building" "$CURRENT_STEP" "Building the application..." ""
(
    cd "$INSTALL_DIR"
    npm run build
)

# ── Step 5: start the service back ───────────────────────────────────────────
CURRENT_STEP=5
CURRENT_ACTION="restarting the service"
write_status "starting_service" "$CURRENT_STEP" "Restarting the service..." ""
systemctl start "$SERVICE_NAME"

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
write_status "success" "$TOTAL_STEPS" "Update completed successfully." ""
echo "[self-update] done."
exit 0
