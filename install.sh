#!/usr/bin/env bash
# =============================================================================
#  GlassKeep — Install / Update / Uninstall script
#  Supports: Debian, Ubuntu, Proxmox LXC (Debian-based)
#  Repo   : https://github.com/Victor-root/react-glass-keep.git
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
REPO_URL="https://github.com/Victor-root/react-glass-keep.git"
INSTALL_DIR="/opt/glass-keep/app"
DATA_DIR="/opt/glass-keep/data"
ENV_FILE="/opt/glass-keep/.env"
SERVICE_NAME="glass-keep"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NODE_MAJOR=20

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }

die() {
    error "$*"
    exit 1
}

# Run a command, print a clear status line, abort on failure
step() {
    local label="$1"; shift
    echo -e "\n${CYAN}▶ ${label}${RESET}"
    if ! "$@"; then
        die "Étape échouée : ${label}"
    fi
    success "${label}"
}

require_root() {
    [[ $EUID -eq 0 ]] || die "Ce script doit être exécuté en tant que root (sudo $0)"
}

check_os() {
    if [[ ! -f /etc/os-release ]]; then
        die "Impossible de détecter l'OS. Debian/Ubuntu requis."
    fi
    # shellcheck source=/dev/null
    source /etc/os-release
    case "${ID:-}" in
        debian|ubuntu) ;;
        *) warn "OS détecté : ${PRETTY_NAME:-$ID}. Ce script est optimisé pour Debian/Ubuntu." ;;
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
        success "Node.js $(node --version) déjà installé — aucune action requise."
        return
    fi

    info "Installation de Node.js ${NODE_MAJOR}..."
    apt-get install -y curl gnupg ca-certificates &>/dev/null
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - &>/dev/null
    apt-get install -y nodejs &>/dev/null
    success "Node.js $(node --version) installé."
}

# ── Actions ───────────────────────────────────────────────────────────────────
action_install() {
    echo -e "\n${BOLD}═══════════════════════════════════════${RESET}"
    echo -e "${BOLD}  Installation de GlassKeep${RESET}"
    echo -e "${BOLD}═══════════════════════════════════════${RESET}"

    # Ask port
    local port
    read -rp "$(echo -e "${YELLOW}Port à utiliser [8080] : ${RESET}")" port
    port="${port:-8080}"

    if ! [[ "$port" =~ ^[0-9]+$ ]] || [[ "$port" -lt 1 || "$port" -gt 65535 ]]; then
        die "Port invalide : $port"
    fi

    info "Répertoire d'installation : ${INSTALL_DIR}"
    info "Port                      : ${port}"
    info "Service systemd           : ${SERVICE_NAME}"
    echo ""

    # Prerequisites
    step "Mise à jour de l'index APT" apt-get update -qq

    step "Installation des prérequis (git, curl, gnupg)" \
        apt-get install -y git curl gnupg ca-certificates

    # Node.js
    install_nodejs

    # Clone
    if [[ -d "$INSTALL_DIR" ]]; then
        warn "Le dossier $INSTALL_DIR existe déjà. Suppression avant réinstallation..."
        rm -rf "$INSTALL_DIR"
    fi

    step "Clonage du dépôt dans ${INSTALL_DIR}" \
        git clone --depth=1 "$REPO_URL" "$INSTALL_DIR"

    # npm install + build (need all deps including devDeps for the build)
    step "Installation des dépendances npm" \
        bash -c "cd '${INSTALL_DIR}' && npm install --silent"

    step "Build de l'application (Vite)" \
        bash -c "cd '${INSTALL_DIR}' && npm run build"

    # Data dir
    mkdir -p "$DATA_DIR"

    # Generate JWT secret
    local jwt_secret
    jwt_secret=$(openssl rand -hex 32 2>/dev/null || cat /proc/sys/kernel/random/uuid | tr -d '-' | head -c 64)

    # Write env file
    cat > "$ENV_FILE" <<EOF
NODE_ENV=production
API_PORT=${port}
JWT_SECRET=${jwt_secret}
DB_FILE=${DATA_DIR}/notes.db
ADMIN_EMAILS=admin
ALLOW_REGISTRATION=true
EOF
    chmod 600 "$ENV_FILE"
    success "Fichier de configuration créé : ${ENV_FILE}"

    # Systemd service
    cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=GlassKeep — Application de notes
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

    step "Rechargement de systemd" systemctl daemon-reload
    step "Activation et démarrage du service ${SERVICE_NAME}" \
        systemctl enable --now "$SERVICE_NAME"

    # Wait a moment then verify
    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        show_access_info "$port"
    else
        warn "Le service ne semble pas démarré. Vérifiez les logs :"
        echo -e "  ${CYAN}journalctl -u ${SERVICE_NAME} -n 30 --no-pager${RESET}"
    fi
}

action_update() {
    echo -e "\n${BOLD}═══════════════════════════════════════${RESET}"
    echo -e "${BOLD}  Mise à jour de GlassKeep${RESET}"
    echo -e "${BOLD}═══════════════════════════════════════${RESET}\n"

    if ! is_installed; then
        die "GlassKeep ne semble pas installé (${INSTALL_DIR} introuvable). Lancez d'abord l'installation."
    fi

    # Read current port from env
    local port="8080"
    if [[ -f "$ENV_FILE" ]]; then
        port=$(grep -E '^API_PORT=' "$ENV_FILE" | cut -d= -f2 | tr -d '[:space:]' || echo "8080")
    fi

    step "Arrêt du service ${SERVICE_NAME}" \
        systemctl stop "$SERVICE_NAME"

    step "Récupération des dernières modifications (git pull)" \
        bash -c "cd '${INSTALL_DIR}' && git pull origin main"

    step "Mise à jour des dépendances npm" \
        bash -c "cd '${INSTALL_DIR}' && npm install --silent"

    step "Rebuild de l'application" \
        bash -c "cd '${INSTALL_DIR}' && npm run build"

    step "Redémarrage du service ${SERVICE_NAME}" \
        systemctl start "$SERVICE_NAME"

    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        show_access_info "$port"
    else
        warn "Le service ne semble pas démarré. Vérifiez les logs :"
        echo -e "  ${CYAN}journalctl -u ${SERVICE_NAME} -n 30 --no-pager${RESET}"
    fi
}

action_uninstall() {
    echo -e "\n${BOLD}═══════════════════════════════════════${RESET}"
    echo -e "${BOLD}  Désinstallation de GlassKeep${RESET}"
    echo -e "${BOLD}═══════════════════════════════════════${RESET}\n"

    if ! is_installed; then
        warn "GlassKeep ne semble pas installé. Nettoyage quand même..."
    fi

    echo -e "${RED}${BOLD}ATTENTION :${RESET} Cette opération supprimera :"
    echo -e "  • Le service systemd  : ${SERVICE_FILE}"
    echo -e "  • Les fichiers app    : ${INSTALL_DIR}"
    echo -e "  • Les données (BDD)   : ${DATA_DIR}"
    echo -e "  • La configuration    : ${ENV_FILE}"
    echo ""
    read -rp "$(echo -e "${YELLOW}Confirmer la désinstallation complète ? [oui/non] : ${RESET}")" confirm
    if [[ "${confirm,,}" != "oui" ]]; then
        info "Désinstallation annulée."
        exit 0
    fi

    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        step "Arrêt du service ${SERVICE_NAME}" systemctl stop "$SERVICE_NAME"
    fi

    if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
        step "Désactivation du service ${SERVICE_NAME}" systemctl disable "$SERVICE_NAME"
    fi

    if [[ -f "$SERVICE_FILE" ]]; then
        rm -f "$SERVICE_FILE"
        success "Fichier service supprimé."
    fi

    systemctl daemon-reload

    if [[ -d "/opt/glass-keep" ]]; then
        rm -rf "/opt/glass-keep"
        success "Dossier /opt/glass-keep supprimé."
    fi

    echo ""
    success "GlassKeep a été désinstallé proprement."
}

show_access_info() {
    local port="$1"
    local ip
    ip=$(get_server_ip)

    echo ""
    echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════╗${RESET}"
    echo -e "${GREEN}${BOLD}║   GlassKeep est opérationnel !            ║${RESET}"
    echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════╝${RESET}"
    echo ""
    echo -e "  ${BOLD}Accès local     :${RESET}  http://localhost:${port}"
    echo -e "  ${BOLD}Accès réseau    :${RESET}  http://${ip}:${port}"
    echo ""
    echo -e "  ${BOLD}Identifiants par défaut :${RESET}"
    echo -e "    Login    : admin"
    echo -e "    Mot de passe : admin"
    echo ""
    echo -e "  ${CYAN}Logs en temps réel :${RESET}  journalctl -u ${SERVICE_NAME} -f"
    echo -e "  ${CYAN}Statut du service  :${RESET}  systemctl status ${SERVICE_NAME}"
    echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
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
    echo -e "           ${BOLD}K E E P${RESET}${CYAN}  —  Gestionnaire de notes${RESET}"
    echo ""

    # Auto-detect install state
    if is_installed; then
        info "Installation existante détectée dans ${INSTALL_DIR}"
    else
        info "Aucune installation existante détectée."
    fi

    echo ""
    echo -e "${BOLD}Que souhaitez-vous faire ?${RESET}"
    echo -e "  ${GREEN}1)${RESET} Installer GlassKeep"
    echo -e "  ${YELLOW}2)${RESET} Mettre à jour GlassKeep"
    echo -e "  ${RED}3)${RESET} Désinstaller GlassKeep"
    echo ""
    read -rp "$(echo -e "${BOLD}Votre choix [1/2/3] : ${RESET}")" choice

    case "$choice" in
        1) action_install   ;;
        2) action_update    ;;
        3) action_uninstall ;;
        *) die "Choix invalide : '$choice'. Entrez 1, 2 ou 3." ;;
    esac
}

main "$@"
