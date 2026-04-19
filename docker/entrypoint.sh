#!/bin/sh
# =============================================================================
#  GlassKeep — container entrypoint
#  - Fixes /data ownership on first run, drops to the 'node' user
#  - Persists an auto-generated JWT_SECRET in /data/.jwt_secret (if unset)
#  - Bootstraps the first admin account from ADMIN_EMAIL / ADMIN_PASSWORD
#  - Exec's the server
# =============================================================================
set -eu

DATA_DIR="/data"
DB_FILE="${DB_FILE:-${DATA_DIR}/notes.db}"
export DB_FILE

# Fix permissions once, then re-exec as the unprivileged 'node' user.
if [ "$(id -u)" = "0" ]; then
    mkdir -p "$DATA_DIR"
    chown -R node:node "$DATA_DIR"
    exec gosu node "$0" "$@"
fi

# --- Persistent JWT secret ----------------------------------------------------
# The server refuses to start without JWT_SECRET. If the operator did not
# provide one, generate it once and reuse it across restarts / image upgrades
# so existing login sessions keep working.
if [ -z "${JWT_SECRET:-}" ]; then
    JWT_FILE="${DATA_DIR}/.jwt_secret"
    if [ ! -s "$JWT_FILE" ]; then
        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > "$JWT_FILE"
        chmod 600 "$JWT_FILE"
        echo "[entrypoint] Generated JWT secret at $JWT_FILE"
    fi
    JWT_SECRET="$(cat "$JWT_FILE")"
    export JWT_SECRET
fi

# --- First-run admin bootstrap -----------------------------------------------
# If the DB has no users yet and ADMIN_EMAIL + ADMIN_PASSWORD are set,
# create the initial admin. Idempotent: skipped once any user exists.
if [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
    node /app/server/bootstrap-admin.js || \
        echo "[entrypoint] Admin bootstrap failed — continuing startup." >&2
fi

# Make sure ADMIN_EMAILS includes ADMIN_EMAIL so the server keeps the
# account flagged as admin on every restart (harmless if already set).
if [ -n "${ADMIN_EMAIL:-}" ] && [ -z "${ADMIN_EMAILS:-}" ]; then
    export ADMIN_EMAILS="$ADMIN_EMAIL"
fi

exec "$@"
