#!/usr/bin/env bash
# =============================================================================
#  GlassKeep — Install / Update / Uninstall script
#  Supports: Debian, Ubuntu, Proxmox LXC (Debian-based)
#  Repo   : https://github.com/Victor-root/glasskeep-enhanced.git
#  Install: /opt/glass-keep/app
#  Service: glass-keep (systemd)
# =============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Constants ─────────────────────────────────────────────────────────────────
REPO_URL="https://github.com/Victor-root/glasskeep-enhanced.git"
INSTALL_DIR="/opt/glass-keep/app"
DATA_DIR="/opt/glass-keep/data"
ENV_FILE="/opt/glass-keep/.env"
SERVICE_NAME="glass-keep"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NODE_MAJOR=20

# ── Language detection ────────────────────────────────────────────────────────
detect_lang() {
    local l="${LANG:-${LANGUAGE:-en}}"
    [[ "${l,,}" == fr* ]] && echo "fr" || echo "en"
}

setup_i18n() {
    local lang
    lang=$(detect_lang)

    if [[ "$lang" == "fr" ]]; then
        # ── French strings ──────────────────────────────────────────────────
        MSG_SUBTITLE="Gestionnaire de notes"
        MSG_EXISTING="Installation existante détectée dans"
        MSG_NO_INSTALL="Aucune installation existante détectée."
        MSG_MENU_TITLE="Que souhaitez-vous faire ?"
        MSG_OPT_INSTALL="Installer GlassKeep"
        MSG_OPT_UPDATE="Mettre à jour GlassKeep"
        MSG_OPT_UNINSTALL="Désinstaller GlassKeep"
        MSG_PROMPT_CHOICE="Votre choix [1/2/3] : "
        MSG_INVALID_CHOICE="Choix invalide : '%s'. Entrez 1, 2 ou 3."

        MSG_HDR_INSTALL="Installation de GlassKeep"
        MSG_HDR_UPDATE="Mise à jour de GlassKeep"
        MSG_HDR_UNINSTALL="Désinstallation de GlassKeep"

        MSG_PROMPT_PORT="Port à utiliser [8080] : "
        MSG_INVALID_PORT="Port invalide : %s"
        MSG_INFO_DIR="Répertoire d'installation : "
        MSG_INFO_PORT="Port                      : "
        MSG_INFO_SERVICE="Service systemd           : "

        MSG_STEP_APT="Mise à jour de l'index APT"
        MSG_STEP_PREREQ="Installation des prérequis (git, curl, gnupg)"
        MSG_STEP_NODE="Installation de Node.js"
        MSG_NODE_OK="Node.js %s déjà installé — aucune action requise."
        MSG_NODE_INSTALLING="Installation de Node.js %s..."
        MSG_NODE_DONE="Node.js %s installé."
        MSG_STEP_CLONE="Clonage du dépôt dans %s"
        MSG_WARN_DIR_EXISTS="Le dossier %s existe déjà. Suppression avant réinstallation..."
        MSG_STEP_NPM="Installation des dépendances npm"
        MSG_STEP_BUILD="Build de l'application (Vite)"
        MSG_ENV_CREATED="Fichier de configuration créé : %s"
        MSG_STEP_DAEMON="Rechargement de systemd"
        MSG_STEP_SERVICE="Activation et démarrage du service %s"
        MSG_WARN_SERVICE="Le service ne semble pas démarré. Vérifiez les logs :"

        MSG_STEP_STOP="Arrêt du service %s"
        MSG_STEP_PULL="Récupération des dernières modifications (git pull)"
        MSG_STEP_NPM_UPDATE="Mise à jour des dépendances npm"
        MSG_STEP_REBUILD="Rebuild de l'application"
        MSG_STEP_START="Redémarrage du service %s"

        MSG_NOT_INSTALLED="GlassKeep ne semble pas installé (%s introuvable). Lancez d'abord l'installation."
        MSG_NOT_INSTALLED_WARN="GlassKeep ne semble pas installé. Nettoyage quand même..."

        MSG_UNINSTALL_WARN="ATTENTION : Cette opération supprimera :"
        MSG_UNINSTALL_SVC="• Le service systemd  : "
        MSG_UNINSTALL_APP="• Les fichiers app    : "
        MSG_UNINSTALL_DATA="• Les données (BDD)   : "
        MSG_UNINSTALL_CFG="• La configuration    : "
        MSG_PROMPT_CONFIRM="Confirmer la désinstallation complète ? [oui/non] : "
        MSG_CONFIRM_WORD="oui"
        MSG_UNINSTALL_CANCEL="Désinstallation annulée."
        MSG_STEP_DISABLE="Désactivation du service %s"
        MSG_SVC_REMOVED="Fichier service supprimé."
        MSG_DIR_REMOVED="Dossier /opt/glass-keep supprimé."
        MSG_UNINSTALL_DONE="GlassKeep a été désinstallé proprement."

        MSG_ACCESS_TITLE="GlassKeep est opérationnel !"
        MSG_ACCESS_LOCAL="Accès local     : "
        MSG_ACCESS_NET="Accès réseau    : "
        MSG_ADMIN_SETUP_TITLE="Création du compte administrateur"
        MSG_ADMIN_NAME_PROMPT="Nom affiché : "
        MSG_ADMIN_LOGIN_PROMPT="Nom d'utilisateur / login [%s] : "
        MSG_ADMIN_PASS_PROMPT="Mot de passe admin : "
        MSG_ADMIN_PASS_CONFIRM="Confirmer le mot de passe : "
        MSG_ADMIN_PASS_MISMATCH="Les mots de passe ne correspondent pas. Réessayez."
        MSG_ADMIN_EMPTY_NAME="Le nom affiché ne doit pas être vide."
        MSG_ADMIN_EMPTY_PASS="Le mot de passe ne doit pas être vide."
        MSG_ADMIN_NAME_TOO_LONG="Le nom affiché ne doit pas dépasser 40 caractères."
        MSG_ADMIN_LOGIN_INVALID="Le login ne doit contenir que des lettres, chiffres, points, tirets ou underscores (3–32 caractères)."
        MSG_ADMIN_PASS_TOO_SHORT="Le mot de passe doit contenir au moins 4 caractères."
        MSG_ADMIN_CREATED="Compte admin créé avec succès."
        MSG_ADMIN_CREATION_FAILED="Échec de la création du compte admin."
        MSG_ACCESS_CREDS="Connectez-vous avec le compte admin créé lors de l'installation."
        MSG_ACCESS_LOGS="Logs en temps réel : "
        MSG_ACCESS_STATUS="Statut du service  : "

        MSG_ERR_ROOT="Ce script doit être exécuté en tant que root (sudo %s)"
        MSG_ERR_OS="Impossible de détecter l'OS. Debian/Ubuntu requis."
        MSG_WARN_OS="OS détecté : %s. Ce script est optimisé pour Debian/Ubuntu."
        MSG_STEP_FAIL="Étape échouée : %s"
    else
        # ── English strings (default) ───────────────────────────────────────
        MSG_SUBTITLE="Note Manager"
        MSG_EXISTING="Existing installation detected in"
        MSG_NO_INSTALL="No existing installation detected."
        MSG_MENU_TITLE="What do you want to do?"
        MSG_OPT_INSTALL="Install GlassKeep"
        MSG_OPT_UPDATE="Update GlassKeep"
        MSG_OPT_UNINSTALL="Uninstall GlassKeep"
        MSG_PROMPT_CHOICE="Your choice [1/2/3]: "
        MSG_INVALID_CHOICE="Invalid choice: '%s'. Enter 1, 2 or 3."

        MSG_HDR_INSTALL="Installing GlassKeep"
        MSG_HDR_UPDATE="Updating GlassKeep"
        MSG_HDR_UNINSTALL="Uninstalling GlassKeep"

        MSG_PROMPT_PORT="Port to use [8080]: "
        MSG_INVALID_PORT="Invalid port: %s"
        MSG_INFO_DIR="Install directory: "
        MSG_INFO_PORT="Port             : "
        MSG_INFO_SERVICE="Systemd service  : "

        MSG_STEP_APT="Updating APT package index"
        MSG_STEP_PREREQ="Installing prerequisites (git, curl, gnupg)"
        MSG_STEP_NODE="Installing Node.js"
        MSG_NODE_OK="Node.js %s already installed — nothing to do."
        MSG_NODE_INSTALLING="Installing Node.js %s..."
        MSG_NODE_DONE="Node.js %s installed."
        MSG_STEP_CLONE="Cloning repository into %s"
        MSG_WARN_DIR_EXISTS="Directory %s already exists. Removing before reinstall..."
        MSG_STEP_NPM="Installing npm dependencies"
        MSG_STEP_BUILD="Building the application (Vite)"
        MSG_ENV_CREATED="Configuration file created: %s"
        MSG_STEP_DAEMON="Reloading systemd"
        MSG_STEP_SERVICE="Enabling and starting service %s"
        MSG_WARN_SERVICE="Service does not appear to be running. Check logs:"

        MSG_STEP_STOP="Stopping service %s"
        MSG_STEP_PULL="Fetching latest changes (git pull)"
        MSG_STEP_NPM_UPDATE="Updating npm dependencies"
        MSG_STEP_REBUILD="Rebuilding the application"
        MSG_STEP_START="Restarting service %s"

        MSG_NOT_INSTALLED="GlassKeep does not appear to be installed (%s not found). Run install first."
        MSG_NOT_INSTALLED_WARN="GlassKeep does not appear to be installed. Cleaning up anyway..."

        MSG_UNINSTALL_WARN="WARNING: This will permanently remove:"
        MSG_UNINSTALL_SVC="• Systemd service : "
        MSG_UNINSTALL_APP="• App files       : "
        MSG_UNINSTALL_DATA="• Database data   : "
        MSG_UNINSTALL_CFG="• Configuration   : "
        MSG_PROMPT_CONFIRM="Confirm full uninstall? [yes/no]: "
        MSG_CONFIRM_WORD="yes"
        MSG_UNINSTALL_CANCEL="Uninstall cancelled."
        MSG_STEP_DISABLE="Disabling service %s"
        MSG_SVC_REMOVED="Service file removed."
        MSG_DIR_REMOVED="Directory /opt/glass-keep removed."
        MSG_UNINSTALL_DONE="GlassKeep has been cleanly uninstalled."

        MSG_ACCESS_TITLE="GlassKeep is up and running!"
        MSG_ACCESS_LOCAL="Local access    : "
        MSG_ACCESS_NET="Network access  : "
        MSG_ADMIN_SETUP_TITLE="Admin account setup"
        MSG_ADMIN_NAME_PROMPT="Display name: "
        MSG_ADMIN_LOGIN_PROMPT="Username / login [%s]: "
        MSG_ADMIN_PASS_PROMPT="Admin password: "
        MSG_ADMIN_PASS_CONFIRM="Confirm password: "
        MSG_ADMIN_PASS_MISMATCH="Passwords do not match. Please try again."
        MSG_ADMIN_EMPTY_NAME="Display name must not be empty."
        MSG_ADMIN_EMPTY_PASS="Password must not be empty."
        MSG_ADMIN_NAME_TOO_LONG="Display name must not exceed 40 characters."
        MSG_ADMIN_LOGIN_INVALID="Login must contain only letters, digits, dots, hyphens or underscores (3–32 characters)."
        MSG_ADMIN_PASS_TOO_SHORT="Password must be at least 4 characters."
        MSG_ADMIN_CREATED="Admin account created successfully."
        MSG_ADMIN_CREATION_FAILED="Failed to create admin account."
        MSG_ACCESS_CREDS="Log in with the admin account created during installation."
        MSG_ACCESS_LOGS="Live logs  : "
        MSG_ACCESS_STATUS="Service status : "

        MSG_ERR_ROOT="This script must be run as root (sudo %s)"
        MSG_ERR_OS="Unable to detect OS. Debian/Ubuntu required."
        MSG_WARN_OS="Detected OS: %s. This script is optimized for Debian/Ubuntu."
        MSG_STEP_FAIL="Step failed: %s"
    fi

    # Export detected lang code for use in .env
    GLASSKEEP_LANG="$lang"
}

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }

die() {
    error "$*"
    exit 1
}

# Run a command with a status label, abort on failure
step() {
    local label="$1"; shift
    echo -e "\n${CYAN}▶ ${label}${RESET}"
    if ! "$@"; then
        # shellcheck disable=SC2059
        die "$(printf "$MSG_STEP_FAIL" "$label")"
    fi
    success "${label}"
}

require_root() {
    # shellcheck disable=SC2059
    [[ $EUID -eq 0 ]] || die "$(printf "$MSG_ERR_ROOT" "$0")"
}

check_os() {
    if [[ ! -f /etc/os-release ]]; then
        die "$MSG_ERR_OS"
    fi
    # shellcheck source=/dev/null
    source /etc/os-release
    case "${ID:-}" in
        debian|ubuntu) ;;
        # shellcheck disable=SC2059
        *) warn "$(printf "$MSG_WARN_OS" "${PRETTY_NAME:-$ID}")" ;;
    esac
}

is_installed() {
    [[ -d "$INSTALL_DIR" ]] && [[ -f "$SERVICE_FILE" ]]
}

get_server_ip() {
    hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1"
}

# ── Node.js installation ───────────────────────────────────────────────────────
install_nodejs() {
    local current_major=0
    if command -v node &>/dev/null; then
        current_major=$(node -e "process.stdout.write(process.version.split('.')[0].replace('v',''))" 2>/dev/null || echo 0)
    fi

    if [[ "$current_major" -ge "$NODE_MAJOR" ]]; then
        # shellcheck disable=SC2059
        success "$(printf "$MSG_NODE_OK" "$(node --version)")"
        return
    fi

    # shellcheck disable=SC2059
    info "$(printf "$MSG_NODE_INSTALLING" "$NODE_MAJOR")"
    apt-get install -y curl gnupg ca-certificates &>/dev/null
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - &>/dev/null
    apt-get install -y nodejs &>/dev/null
    # shellcheck disable=SC2059
    success "$(printf "$MSG_NODE_DONE" "$(node --version)")"
}

# ── Admin account setup ───────────────────────────────────────────────────────
setup_admin() {
    local db_file="$1"
    local admin_name="$2"
    local admin_login="$3"
    local admin_pass="$4"

    # If the database already exists and has users, skip admin creation entirely
    if [[ -f "$db_file" ]]; then
        local count
        count=$(node -e "
            const Database = require('better-sqlite3');
            const db = new Database('$db_file');
            try {
                const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
                process.stdout.write(String(row.count));
            } catch(e) { process.stdout.write('0'); }
            db.close();
        " 2>/dev/null || echo "0")
        if [[ "$count" -gt 0 ]]; then
            info "Users already exist in database — skipping admin setup."
            GLASSKEEP_ADMIN_LOGIN=$(node -e "
                const Database = require('better-sqlite3');
                const db = new Database('$db_file');
                const row = db.prepare('SELECT email FROM users WHERE is_admin=1 LIMIT 1').get();
                process.stdout.write(row ? row.email : '');
                db.close();
            " 2>/dev/null || echo "")
            return
        fi
    fi

    if [[ -z "$admin_name" || -z "$admin_login" || -z "$admin_pass" ]]; then
        return
    fi

    # Create admin via a small Node.js helper that uses the same bcrypt
    local create_script="${INSTALL_DIR}/server/create-admin.js"
    cat > "$create_script" <<'NODESCRIPT'
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const dbFile = process.argv[2];
const displayName = process.argv[3];
const login = process.argv[4];
const password = process.argv[5];

if (!dbFile || !displayName || !login || !password) {
  console.error("Usage: node create-admin.js <db_file> <name> <login> <password>");
  process.exit(1);
}

const db = new Database(dbFile);

// Ensure users table exists (same schema as server/index.js)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    secret_key_hash TEXT,
    secret_key_created_at TEXT
  )
`);

const existing = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
if (existing > 0) {
  console.log("Users already exist in database — skipping admin creation.");
  process.exit(0);
}

const hash = bcrypt.hashSync(password, 10);
const now = new Date().toISOString();
const info = db.prepare(
  "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
).run(displayName, login, hash, now);

db.prepare("UPDATE users SET is_admin=1 WHERE id=?").run(info.lastInsertRowid);

console.log("OK");
db.close();
NODESCRIPT

    local result
    result=$(node "$create_script" "$db_file" "$admin_name" "$admin_login" "$admin_pass" 2>&1)
    local exit_code=$?
    rm -f "$create_script"

    if [[ $exit_code -ne 0 ]] || [[ "$result" != "OK" && "$result" != *"skipping"* ]]; then
        error "$MSG_ADMIN_CREATION_FAILED"
        [[ -n "$result" ]] && error "$result"
        die "$MSG_ADMIN_CREATION_FAILED"
    fi

    success "$MSG_ADMIN_CREATED"

    # Set ADMIN_EMAILS in .env to the chosen login for admin promotion on restart
    GLASSKEEP_ADMIN_LOGIN="$admin_login"
}

# ── Actions ───────────────────────────────────────────────────────────────────
action_install() {
    echo -e "\n${BOLD}═══════════════════════════════════════${RESET}"
    echo -e "${BOLD}  ${MSG_HDR_INSTALL}${RESET}"
    echo -e "${BOLD}═══════════════════════════════════════${RESET}"

    # Ask port
    local port
    read -rp "$(echo -e "${YELLOW}${MSG_PROMPT_PORT}${RESET}")" port </dev/tty
    port="${port:-8080}"

    if ! [[ "$port" =~ ^[0-9]+$ ]] || [[ "$port" -lt 1 || "$port" -gt 65535 ]]; then
        # shellcheck disable=SC2059
        die "$(printf "$MSG_INVALID_PORT" "$port")"
    fi

    # Collect admin credentials right after port (skip if database already exists)
    local admin_name="" admin_login="" admin_pass=""

    if [[ ! -f "${DATA_DIR}/notes.db" ]]; then
        echo ""
        echo -e "${BOLD}${CYAN}▶ ${MSG_ADMIN_SETUP_TITLE}${RESET}"
        echo ""

        local admin_pass2
        while true; do
            read -rp "$(echo -e "${YELLOW}${MSG_ADMIN_NAME_PROMPT}${RESET}")" admin_name </dev/tty
            admin_name="$(echo -e "${admin_name}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

            if [[ -z "$admin_name" ]]; then
                warn "$MSG_ADMIN_EMPTY_NAME"
                continue
            fi
            if [[ ${#admin_name} -gt 40 ]]; then
                warn "$MSG_ADMIN_NAME_TOO_LONG"
                continue
            fi

            # shellcheck disable=SC2059
            read -rp "$(echo -e "${YELLOW}$(printf "$MSG_ADMIN_LOGIN_PROMPT" "$admin_name")${RESET}")" admin_login </dev/tty
            admin_login="$(echo -e "${admin_login}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
            admin_login="${admin_login:-$admin_name}"

            if [[ ${#admin_login} -lt 3 || ${#admin_login} -gt 32 ]] || ! [[ "$admin_login" =~ ^[A-Za-z0-9._-]+$ ]]; then
                warn "$MSG_ADMIN_LOGIN_INVALID"
                continue
            fi

            read -rsp "$(echo -e "${YELLOW}${MSG_ADMIN_PASS_PROMPT}${RESET}")" admin_pass </dev/tty
            echo ""
            read -rsp "$(echo -e "${YELLOW}${MSG_ADMIN_PASS_CONFIRM}${RESET}")" admin_pass2 </dev/tty
            echo ""

            if [[ -z "$admin_pass" ]]; then
                warn "$MSG_ADMIN_EMPTY_PASS"
                continue
            fi
            if [[ ${#admin_pass} -lt 4 ]]; then
                warn "$MSG_ADMIN_PASS_TOO_SHORT"
                continue
            fi
            if [[ "$admin_pass" != "$admin_pass2" ]]; then
                warn "$MSG_ADMIN_PASS_MISMATCH"
                continue
            fi

            break
        done
    fi

    echo ""
    info "${MSG_INFO_DIR}${INSTALL_DIR}"
    info "${MSG_INFO_PORT}${port}"
    info "${MSG_INFO_SERVICE}${SERVICE_NAME}"
    echo ""

    step "$MSG_STEP_APT"     apt-get update -qq
    step "$MSG_STEP_PREREQ"  apt-get install -y git curl gnupg ca-certificates

    install_nodejs

    if [[ -d "$INSTALL_DIR" ]]; then
        # shellcheck disable=SC2059
        warn "$(printf "$MSG_WARN_DIR_EXISTS" "$INSTALL_DIR")"
        rm -rf "$INSTALL_DIR"
    fi

    # shellcheck disable=SC2059
    step "$(printf "$MSG_STEP_CLONE" "$INSTALL_DIR")" \
        git clone --depth=1 "$REPO_URL" "$INSTALL_DIR"

    step "$MSG_STEP_NPM" \
        bash -c "cd '${INSTALL_DIR}' && npm install --silent"

    step "$MSG_STEP_BUILD" \
        bash -c "cd '${INSTALL_DIR}' && npm run build"

    mkdir -p "$DATA_DIR"

    GLASSKEEP_ADMIN_LOGIN=""
    setup_admin "${DATA_DIR}/notes.db" "$admin_name" "$admin_login" "$admin_pass"

    local jwt_secret
    jwt_secret=$(openssl rand -hex 32 2>/dev/null || cat /proc/sys/kernel/random/uuid | tr -d '-' | head -c 64)

    cat > "$ENV_FILE" <<EOF
NODE_ENV=production
API_PORT=${port}
JWT_SECRET=${jwt_secret}
DB_FILE=${DATA_DIR}/notes.db
ADMIN_EMAILS=${GLASSKEEP_ADMIN_LOGIN}
ALLOW_REGISTRATION=false
EOF
    chmod 600 "$ENV_FILE"
    # shellcheck disable=SC2059
    success "$(printf "$MSG_ENV_CREATED" "$ENV_FILE")"

    cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=GlassKeep — Note Manager
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    step "$MSG_STEP_DAEMON" systemctl daemon-reload
    # shellcheck disable=SC2059
    step "$(printf "$MSG_STEP_SERVICE" "$SERVICE_NAME")" \
        systemctl enable --now "$SERVICE_NAME"

    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        show_access_info "$port"
    else
        warn "$MSG_WARN_SERVICE"
        echo -e "  ${CYAN}journalctl -u ${SERVICE_NAME} -n 30 --no-pager${RESET}"
    fi
}

action_update() {
    echo -e "\n${BOLD}═══════════════════════════════════════${RESET}"
    echo -e "${BOLD}  ${MSG_HDR_UPDATE}${RESET}"
    echo -e "${BOLD}═══════════════════════════════════════${RESET}\n"

    if ! is_installed; then
        # shellcheck disable=SC2059
        die "$(printf "$MSG_NOT_INSTALLED" "$INSTALL_DIR")"
    fi

    local port="8080"
    if [[ -f "$ENV_FILE" ]]; then
        port=$(grep -E '^API_PORT=' "$ENV_FILE" | cut -d= -f2 | tr -d '[:space:]' || echo "8080")
    fi

    # shellcheck disable=SC2059
    step "$(printf "$MSG_STEP_STOP" "$SERVICE_NAME")" \
        systemctl stop "$SERVICE_NAME"

    step "$MSG_STEP_PULL" \
        bash -c "cd '${INSTALL_DIR}' && git pull origin main"

    step "$MSG_STEP_NPM_UPDATE" \
        bash -c "cd '${INSTALL_DIR}' && npm install --silent"

    step "$MSG_STEP_REBUILD" \
        bash -c "cd '${INSTALL_DIR}' && npm run build"

    # shellcheck disable=SC2059
    step "$(printf "$MSG_STEP_START" "$SERVICE_NAME")" \
        systemctl start "$SERVICE_NAME"

    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        show_access_info "$port"
    else
        warn "$MSG_WARN_SERVICE"
        echo -e "  ${CYAN}journalctl -u ${SERVICE_NAME} -n 30 --no-pager${RESET}"
    fi
}

action_uninstall() {
    echo -e "\n${BOLD}═══════════════════════════════════════${RESET}"
    echo -e "${BOLD}  ${MSG_HDR_UNINSTALL}${RESET}"
    echo -e "${BOLD}═══════════════════════════════════════${RESET}\n"

    if ! is_installed; then
        warn "$MSG_NOT_INSTALLED_WARN"
    fi

    echo -e "${RED}${BOLD}${MSG_UNINSTALL_WARN}${RESET}"
    echo -e "  ${MSG_UNINSTALL_SVC}${SERVICE_FILE}"
    echo -e "  ${MSG_UNINSTALL_APP}${INSTALL_DIR}"
    echo -e "  ${MSG_UNINSTALL_DATA}${DATA_DIR}"
    echo -e "  ${MSG_UNINSTALL_CFG}${ENV_FILE}"
    echo ""
    local confirm
    read -rp "$(echo -e "${YELLOW}${MSG_PROMPT_CONFIRM}${RESET}")" confirm </dev/tty
    if [[ "${confirm,,}" != "${MSG_CONFIRM_WORD}" ]]; then
        info "$MSG_UNINSTALL_CANCEL"
        exit 0
    fi

    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        # shellcheck disable=SC2059
        step "$(printf "$MSG_STEP_STOP" "$SERVICE_NAME")" \
            systemctl stop "$SERVICE_NAME"
    fi

    if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
        # shellcheck disable=SC2059
        step "$(printf "$MSG_STEP_DISABLE" "$SERVICE_NAME")" \
            systemctl disable "$SERVICE_NAME"
    fi

    if [[ -f "$SERVICE_FILE" ]]; then
        rm -f "$SERVICE_FILE"
        success "$MSG_SVC_REMOVED"
    fi

    systemctl daemon-reload

    if [[ -d "/opt/glass-keep" ]]; then
        rm -rf "/opt/glass-keep"
        success "$MSG_DIR_REMOVED"
    fi

    echo ""
    success "$MSG_UNINSTALL_DONE"
}

show_access_info() {
    local port="$1"
    local ip
    ip=$(get_server_ip)

    echo ""
    echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════╗${RESET}"
    echo -e "${GREEN}${BOLD}║   ${MSG_ACCESS_TITLE}${RESET}"
    echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════╝${RESET}"
    echo ""
    echo -e "  ${BOLD}${MSG_ACCESS_LOCAL}${RESET} http://localhost:${port}"
    echo -e "  ${BOLD}${MSG_ACCESS_NET}${RESET} http://${ip}:${port}"
    echo ""
    echo -e "  ${BOLD}${MSG_ACCESS_CREDS}${RESET}"
    echo ""
    echo -e "  ${CYAN}${MSG_ACCESS_LOGS}${RESET} journalctl -u ${SERVICE_NAME} -f"
    echo -e "  ${CYAN}${MSG_ACCESS_STATUS}${RESET} systemctl status ${SERVICE_NAME}"
    echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
    setup_i18n
    require_root
    check_os

    echo ""
    echo -e "${BOLD}${CYAN}"
    echo "   ██████╗ ██╗      █████╗ ███████╗███████╗"
    echo "  ██╔════╝ ██║     ██╔══██╗██╔════╝██╔════╝"
    echo "  ██║  ███╗██║     ███████║███████╗███████╗"
    echo "  ██║   ██║██║     ██╔══██║╚════██║╚════██║"
    echo "  ╚██████╔╝███████╗██║  ██║███████║███████║"
    echo "   ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝"
    echo -e "           ${BOLD}K E E P${RESET}${CYAN}  —  ${MSG_SUBTITLE}${RESET}"
    echo ""

    if is_installed; then
        info "${MSG_EXISTING} ${INSTALL_DIR}"
    else
        info "$MSG_NO_INSTALL"
    fi

    echo ""
    echo -e "${BOLD}${MSG_MENU_TITLE}${RESET}"
    echo -e "  ${GREEN}1)${RESET} ${MSG_OPT_INSTALL}"
    echo -e "  ${YELLOW}2)${RESET} ${MSG_OPT_UPDATE}"
    echo -e "  ${RED}3)${RESET} ${MSG_OPT_UNINSTALL}"
    echo ""
    local choice
    read -rp "$(echo -e "${BOLD}${MSG_PROMPT_CHOICE}${RESET}")" choice </dev/tty

    case "$choice" in
        1) action_install   ;;
        2) action_update    ;;
        3) action_uninstall ;;
        # shellcheck disable=SC2059
        *) die "$(printf "$MSG_INVALID_CHOICE" "$choice")" ;;
    esac
}

main "$@"
