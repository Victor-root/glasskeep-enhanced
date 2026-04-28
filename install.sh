#!/usr/bin/env bash
# =============================================================================
#  GlassKeep — Install / Update / Uninstall script
#  Supports: Debian, Ubuntu, Proxmox LXC (Debian-based)
#  Repo   : https://github.com/Victor-root/glasskeep-enhanced.git
#  Install: /opt/glass-keep/app
#  Service: glass-keep (systemd)
# =============================================================================

set -euo pipefail

# ── Visual palette ────────────────────────────────────────────────────────────
# Semantic colours, kept consistent across the script:
#   INDIGO/VIOLET → brand accent (matches the app's indigo→violet UI)
#   GREEN         → success
#   AMBER         → warning + sensitive info
#   RED           → error + destructive
#   GRAY          → muted / secondary text
#   CYAN          → command snippets the user can copy
INDIGO='\033[38;5;105m'
VIOLET='\033[38;5;141m'
GREEN='\033[38;5;71m'
AMBER='\033[38;5;214m'
RED='\033[38;5;203m'
CYAN='\033[38;5;110m'
GRAY='\033[38;5;245m'
WHITE='\033[1;37m'
BOLD='\033[1m'
DIM='\033[2m'
ITALIC='\033[3m'
RESET='\033[0m'
# Legacy aliases so older string templates ($BLUE / $YELLOW) keep
# rendering until they're swept away by the helpers below.
BLUE=$INDIGO
YELLOW=$AMBER

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
        MSG_STEP_SSL="Génération du certificat SSL auto-signé"
        MSG_HTTPS_MENU_TITLE="Comment souhaitez-vous configurer le HTTPS ?"
        MSG_HTTPS_OPT1="Reverse proxy (Nginx, Apache, Caddy, Traefik…) — le chiffrement est géré en amont"
        MSG_HTTPS_OPT2="Certificat auto-signé — recommandé si vous accédez directement à GlassKeep"
        MSG_HTTPS_OPT3="Mon propre certificat SSL — si vous avez déjà un certificat valide"
        MSG_HTTPS_PROMPT="(Si vous ne savez pas, choisissez 2.) [1/2/3] : "
        MSG_HTTPS_INVALID="Choix invalide. Entrez 1, 2 ou 3."
        MSG_CERT_PATH_PROMPT="Chemin complet vers le fichier certificat (.crt ou .pem)\n  ex: /etc/ssl/certs/mon-domaine.crt\n→ "
        MSG_KEY_PATH_PROMPT="Chemin complet vers le fichier clé privée (.key ou .pem)\n  ex: /etc/ssl/private/mon-domaine.key\n→ "
        MSG_CERT_NOT_FOUND="Fichier introuvable : %s"
        MSG_PROXY_INVALID="Répondez par oui ou non."
        MSG_PRESS_KEY="Appuyez sur une touche pour lancer l'installation..."
        MSG_PRESS_KEY_UPDATE="Appuyez sur une touche pour lancer la mise à jour..."
        MSG_PROXY_YES_INFO="  → HTTPS désactivé côté GlassKeep : votre reverse proxy gère le chiffrement."
        MSG_PROXY_NO_INFO="  → Un certificat SSL auto-signé va être généré.\n     Ce certificat chiffre les échanges entre votre navigateur et GlassKeep,\n     protégeant vos données (mot de passe, notes) sur le réseau.\n     Votre navigateur affichera un avertissement \"site non sécurisé\" : c'est normal\n     pour un certificat auto-signé, cliquez sur \"Continuer quand même\".\n     Pour modifier ce réglage plus tard, relancez ce script et choisissez\n     \"2) ${MSG_OPT_UPDATE}\"."
        MSG_HTTPS_OPT3_INFO="  → Votre certificat sera utilisé directement.\n     Assurez-vous que les fichiers restent accessibles par le service.\n     Pour modifier ce réglage plus tard, relancez ce script et choisissez\n     \"2) ${MSG_OPT_UPDATE}\"."
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

        MSG_ENC_TITLE="Chiffrement des données au repos (côté serveur)"
        MSG_ENC_INTRO="Cette option chiffre le contenu des notes dans la base de données.\n  Protège contre : vol du serveur, du disque, de la base SQLite, des sauvegardes.\n  Ne protège PAS contre : l'administrateur du serveur, ou un serveur déjà déverrouillé qui serait compromis.\n  À chaque redémarrage du service GlassKeep (mise à jour, reboot, etc.), un administrateur devra déverrouiller l'instance avec la passphrase ou la recovery key. Une fois l'instance déverrouillée, les utilisateurs se connectent normalement comme d'habitude.\n  Si vous perdez à la fois la passphrase ET la recovery key, les notes chiffrées seront irrécupérables.\n\n  ${YELLOW}Déconseillé si vous débutez en self-hosting${RESET} : la gestion des secrets (passphrase + recovery key) demande de la rigueur. En cas d'oubli des deux, les données sont définitivement perdues.\n  Vous pouvez répondre ${BOLD}non${RESET} maintenant et activer la protection plus tard depuis l'interface admin (panneau Administration → section \"Chiffrement au repos\")."
        MSG_ENC_PROMPT="Activer la protection des données au repos ? [oui/non] (par défaut : non) : "
        MSG_ENC_PASS_PROMPT="Passphrase de l'instance (min. 8 caractères) : "
        MSG_ENC_PASS_CONFIRM="Confirmer la passphrase : "
        MSG_ENC_PASS_TOO_SHORT="La passphrase doit contenir au moins 8 caractères."
        MSG_ENC_PASS_MISMATCH="Les passphrases ne correspondent pas."
        MSG_ENC_RECOVERY_TITLE="Recovery key (à noter MAINTENANT — affichée une seule fois)"
        MSG_ENC_RECOVERY_WARN="Cette recovery key permet de déverrouiller l'instance si la passphrase est perdue. Si vous perdez les deux, les notes chiffrées seront irrécupérables."
        MSG_ENC_RECOVERY_ACK="Saisissez \"oui\" une fois la recovery key sauvegardée : "
        MSG_ENC_ACTIVATING="Activation du chiffrement au repos"
        MSG_ENC_DONE="Chiffrement au repos activé."
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
        MSG_STEP_SSL="Generating self-signed SSL certificate"
        MSG_HTTPS_MENU_TITLE="How do you want to configure HTTPS?"
        MSG_HTTPS_OPT1="Reverse proxy (Nginx, Apache, Caddy, Traefik…) — encryption handled upstream"
        MSG_HTTPS_OPT2="Self-signed certificate — recommended for direct access to GlassKeep"
        MSG_HTTPS_OPT3="My own SSL certificate — if you already have a valid certificate"
        MSG_HTTPS_PROMPT="(If unsure, choose 2.) [1/2/3]: "
        MSG_HTTPS_INVALID="Invalid choice. Enter 1, 2 or 3."
        MSG_CERT_PATH_PROMPT="Full path to the certificate file (.crt or .pem)\n  e.g: /etc/ssl/certs/my-domain.crt\n→ "
        MSG_KEY_PATH_PROMPT="Full path to the private key file (.key or .pem)\n  e.g: /etc/ssl/private/my-domain.key\n→ "
        MSG_CERT_NOT_FOUND="File not found: %s"
        MSG_PROXY_INVALID="Please answer yes or no."
        MSG_PRESS_KEY="Press any key to start the installation..."
        MSG_PRESS_KEY_UPDATE="Press any key to start the update..."
        MSG_PROXY_YES_INFO="  → HTTPS disabled on the GlassKeep side: your reverse proxy handles encryption."
        MSG_PROXY_NO_INFO="  → A self-signed SSL certificate will be generated.\n     This certificate encrypts traffic between your browser and GlassKeep,\n     protecting your data (password, notes) on the network.\n     Your browser will show a \"not secure\" warning: this is normal for\n     a self-signed certificate, just click \"Proceed anyway\".\n     To change this setting later, re-run this script and choose\n     \"2) ${MSG_OPT_UPDATE}\"."
        MSG_HTTPS_OPT3_INFO="  → Your certificate will be used directly.\n     Make sure these files remain accessible by the service.\n     To change this setting later, re-run this script and choose\n     \"2) ${MSG_OPT_UPDATE}\"."
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

        MSG_ENC_TITLE="At-rest encryption (server-side)"
        MSG_ENC_INTRO="This option encrypts note contents in the database.\n  Protects against: theft of the server, the disk, the SQLite file, backups.\n  Does NOT protect against: the server administrator, or an already-unlocked, compromised server.\n  Whenever the GlassKeep service restarts (update, reboot, etc.), an administrator must unlock the instance with the passphrase or recovery key. Once the instance is unlocked, regular users sign in as usual.\n  If you lose BOTH the passphrase AND the recovery key, encrypted notes are unrecoverable.\n\n  ${YELLOW}Not recommended if you are new to self-hosting${RESET}: managing the secrets (passphrase + recovery key) requires discipline. If both are ever lost, the data is gone for good.\n  You can answer ${BOLD}no${RESET} now and turn protection on later from the admin UI (Admin panel → \"At-rest encryption\" section)."
        MSG_ENC_PROMPT="Enable at-rest data protection? [yes/no] (default: no): "
        MSG_ENC_PASS_PROMPT="Instance passphrase (min. 8 characters): "
        MSG_ENC_PASS_CONFIRM="Confirm passphrase: "
        MSG_ENC_PASS_TOO_SHORT="Passphrase must be at least 8 characters."
        MSG_ENC_PASS_MISMATCH="Passphrases do not match."
        MSG_ENC_RECOVERY_TITLE="Recovery key (write this down NOW — shown only once)"
        MSG_ENC_RECOVERY_WARN="This recovery key lets you unlock the instance if the passphrase is lost. If you lose both, encrypted notes are unrecoverable."
        MSG_ENC_RECOVERY_ACK="Type \"yes\" once you have saved the recovery key: "
        MSG_ENC_ACTIVATING="Activating at-rest encryption"
        MSG_ENC_DONE="At-rest encryption enabled."
    fi

    # Export detected lang code for use in .env
    GLASSKEEP_LANG="$lang"
}

# ── Helpers ───────────────────────────────────────────────────────────────────
# All output flows through these helpers so the script keeps a single
# visual identity. Glyphs:
#   ›  info       (gray, dim)
#   ✓  success    (green)
#   ⚠  warning    (amber)
#   ✗  error      (red)
#   ▸  step start (indigo)
info()    { printf "${GRAY}›${RESET} %b\n" "$*"; }
success() { printf "${GREEN}✓${RESET} %b\n" "$*"; }
warn()    { printf "${AMBER}⚠${RESET} %b\n" "$*"; }
error()   { printf "${RED}✗${RESET} %b\n" "$*" >&2; }

die() {
    error "$*"
    exit 1
}

# A horizontal rule that adapts to the terminal width (capped at 78
# cols so the result stays readable on wide terminals too).
_term_width() {
    local cols
    cols=$(tput cols 2>/dev/null || echo 80)
    [[ -z "$cols" || "$cols" -lt 50 ]] && cols=80
    [[ "$cols" -gt 78 ]] && cols=78
    echo "$cols"
}
hr() {
    local color="${1:-$INDIGO}"
    local cols; cols=$(_term_width)
    printf "${color}"
    for ((i=0; i<cols; i++)); do printf "─"; done
    printf "${RESET}\n"
}

# Section header — used at the start of each logical phase.
# Renders as a top rule + an indigo arrow + the title in bold + an
# optional one-line subtitle in gray.
section() {
    local title="$1"
    local subtitle="${2:-}"
    echo
    hr "$INDIGO"
    printf "  ${BOLD}${INDIGO}▸${RESET}  ${BOLD}%s${RESET}\n" "$title"
    if [[ -n "$subtitle" ]]; then
        printf "     ${GRAY}%s${RESET}\n" "$subtitle"
    fi
    hr "$INDIGO"
}

# Status panel — left accent bar + lines. Auto-sizes to whatever you
# put in it, no overflow possible. First arg is the colour (one of
# $GREEN, $AMBER, $RED, $INDIGO); subsequent args are the body lines.
panel() {
    local color="$1"; shift
    local title="$1"; shift
    echo
    printf "${color}┌${RESET} ${BOLD}${color}%s${RESET}\n" "$title"
    while (( $# )); do
        printf "${color}│${RESET} %b\n" "$1"
        shift
    done
    printf "${color}└${RESET}\n"
}

# Run a command with a status label, abort on failure.
step() {
    local label="$1"; shift
    printf "\n${INDIGO}▸${RESET}  ${BOLD}%s${RESET}\n" "$label"
    if ! "$@"; then
        # shellcheck disable=SC2059
        die "$(printf "$MSG_STEP_FAIL" "$label")"
    fi
    printf "${GREEN}✓${RESET}  ${DIM}%s${RESET}\n" "$label"
}

# Inline numbered choice. Used in menus + the SSL choice prompt.
# Args: <number> <colour> <title> <description>
# Note the explicit `if/fi` rather than `[[ -n "$desc" ]] && printf`:
# under `set -e`, a false `[[ ]]` would make the whole compound
# statement non-zero and kill the script — silently truncating the
# menu after the first item.
menu_item() {
    local num="$1" color="$2" title="$3" desc="${4:-}"
    printf "  ${color}${BOLD}%s${RESET}  ${BOLD}%s${RESET}\n" "$num" "$title"
    if [[ -n "$desc" ]]; then
        printf "     ${GRAY}%s${RESET}\n" "$desc"
    fi
}

# Prompt with a leading glyph — produces the string that bash's
# `read -p` should display. Trims any trailing ' :' / ': ' / ' ' from
# the message string so it composes cleanly with the trailing › glyph
# (a lot of MSG_* values were authored with their own ': ' suffix).
prompt_text() {
    local s="$1"
    # Strip trailing whitespace + colons (handles "... : " / "... :" /
    # "...:" / "... " — every MSG_* shape used in this script).
    while [[ "$s" =~ [[:space:]:]$ ]]; do s="${s::-1}"; done
    printf "${BOLD}${INDIGO}❯${RESET} %s ${GRAY}›${RESET} " "$s"
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

# Variables set by ask_ssl_config
SSL_MODE=""          # "proxy" | "selfsigned" | "custom"
CUSTOM_CERT_PATH=""
CUSTOM_KEY_PATH=""

# Variables set by ask_encryption_config
ENC_ENABLE="no"
ENC_PASSPHRASE=""

ask_encryption_config() {
    section "$MSG_ENC_TITLE"
    printf "  %s\n\n" "$(echo -e "$MSG_ENC_INTRO")"
    local ans
    while true; do
        read -rp "$(prompt_text "$MSG_ENC_PROMPT")" ans </dev/tty
        # Empty answer (just Enter) defaults to "no" — matches the
        # safer fallback advertised in the prompt and avoids forcing
        # someone unsure into a key-management commitment.
        case "${ans,,}" in
            y|yes|o|oui)
                ENC_ENABLE="yes"
                break ;;
            ""|n|no|non)
                ENC_ENABLE="no"
                return 0 ;;
            *)
                warn "$MSG_PROXY_INVALID" ;;
        esac
    done

    local pass1 pass2
    while true; do
        read -rsp "$(prompt_text "$MSG_ENC_PASS_PROMPT")" pass1 </dev/tty
        echo
        if [[ ${#pass1} -lt 8 ]]; then
            warn "$MSG_ENC_PASS_TOO_SHORT"
            continue
        fi
        read -rsp "$(prompt_text "$MSG_ENC_PASS_CONFIRM")" pass2 </dev/tty
        echo
        if [[ "$pass1" != "$pass2" ]]; then
            warn "$MSG_ENC_PASS_MISMATCH"
            continue
        fi
        break
    done
    ENC_PASSPHRASE="$pass1"
}

# Initialise the at-rest vault from the install script. Generates the
# DEK, wraps it under (passphrase, recovery key), encrypts every
# pre-existing note (typically none on a fresh install), and prints
# the recovery key once on stdout for the admin to save.
activate_encryption() {
    local db_file="$1"
    local passphrase="$2"
    local script="${INSTALL_DIR}/server/encryption/_install_activate.js"

    cat > "$script" <<'NODESCRIPT'
const Database = require("better-sqlite3");
const vault = require("./instanceVault");
const noteCipher = require("./noteCipher");
const runtime = require("./runtimeUnlockState");

const dbFile = process.argv[2];
const passphrase = process.argv[3];
if (!dbFile || !passphrase) {
  console.error("usage: node _install_activate.js <dbFile> <passphrase>");
  process.exit(1);
}

const db = new Database(dbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
// Make sure the notes table has the encryption columns even if this
// is a brand-new database (in which case there are no rows to encrypt).
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    items_json TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    images_json TEXT NOT NULL,
    color TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    position REAL NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    trashed INTEGER NOT NULL DEFAULT 0,
    client_updated_at TEXT,
    updated_at TEXT,
    last_edited_by TEXT,
    last_edited_at TEXT
  )
`);
// note_user_tags is the per-user tag table the encryption layer also
// touches. Create it here so the activation transaction (which
// iterates note_user_tags to encrypt any plaintext rows) doesn't
// blow up on a fresh install where the server hasn't booted yet.
db.exec(`
  CREATE TABLE IF NOT EXISTS note_user_tags (
    note_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (note_id, user_id)
  )
`);
vault.ensureSchema(db);

const init = vault.initialize(db, passphrase);
runtime.setEnabled(true);
runtime.unlockWithDek(init.dek);

const tx = db.transaction(() => {
  const rows = db.prepare("SELECT * FROM notes").all();
  const upd = db.prepare(`
    UPDATE notes SET
      title = @title, content = @content,
      items_json = @items_json, tags_json = @tags_json,
      images_json = @images_json, color = @color,
      is_server_encrypted = @is_server_encrypted,
      enc_version = @enc_version,
      enc_payload = @enc_payload
    WHERE id = @id
  `);
  for (const row of rows) {
    if (row.is_server_encrypted) continue;
    const prepared = noteCipher.prepareRowForWrite({
      title: row.title,
      content: row.content,
      items_json: row.items_json,
      tags_json: row.tags_json,
      images_json: row.images_json,
      color: row.color,
    }, { noteId: row.id, userId: row.user_id });
    upd.run({
      id: row.id,
      title: prepared.title,
      content: prepared.content,
      items_json: prepared.items_json,
      tags_json: prepared.tags_json,
      images_json: prepared.images_json,
      color: prepared.color,
      is_server_encrypted: prepared.is_server_encrypted,
      enc_version: prepared.enc_version,
      enc_payload: prepared.enc_payload,
    });
  }
  // Encrypt per-user tag rows in the same transaction so the install
  // never leaves readable tags on disk after activation.
  try {
    const tagRows = db.prepare(
      "SELECT note_id, user_id, tags_json FROM note_user_tags WHERE is_encrypted = 0"
    ).all();
    const updTag = db.prepare(
      "UPDATE note_user_tags SET tags_json = '[]', is_encrypted = 1, enc_payload = ? WHERE note_id = ? AND user_id = ?"
    );
    for (const r of tagRows) {
      if (!r.tags_json || r.tags_json === "[]") continue;
      const enc = noteCipher.encryptTagsJson(r.tags_json, {
        noteId: r.note_id, userId: r.user_id,
      });
      updTag.run(enc, r.note_id, r.user_id);
    }
  } catch (e) {
    process.stderr.write("tag encryption skipped: " + e.message + "\n");
  }
  vault.markMigrated(db);
});
tx();

// Critical: physically purge plaintext residue. SQLite UPDATE only
// marks old pages as free without zeroing them; VACUUM rewrites the
// file dropping freed pages, and we bracket it with two truncating
// WAL checkpoints so neither the main file nor the WAL keep stale
// pre-encryption bytes around. Without this an attacker reading the
// raw .db file can still grep the original note contents.
try {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.exec("VACUUM");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
} catch (e) {
  process.stderr.write("VACUUM failed: " + e.message + "\n");
}

// Output exactly: "OK <recoveryKey>" so the bash caller can pluck the
// key without parsing JSON.
process.stdout.write("OK " + init.recoveryKey + "\n");
db.close();
NODESCRIPT

    # Capture both stdout and stderr so any warning shows up in the
    # error report when something fails. We then extract the recovery
    # key from anywhere in the output via grep — robust to a stray
    # stderr line landing before the "OK <key>" stdout marker.
    local out
    out=$(cd "$INSTALL_DIR" && node "$script" "$db_file" "$passphrase" 2>&1)
    local code=$?
    rm -f "$script"
    local key
    key=$(printf '%s\n' "$out" | grep -oE 'OK GKRV-[A-Z0-9-]+' | tail -1 | sed 's/^OK //')
    if [[ $code -ne 0 ]] || [[ -z "$key" ]]; then
        error "Encryption activation failed: $out"
        return 1
    fi
    GLASSKEEP_RECOVERY_KEY="$key"
    return 0
}

ask_ssl_config() {
    section "HTTPS / SSL" "$MSG_HTTPS_MENU_TITLE"
    echo
    menu_item "1" "$INDIGO" "$MSG_HTTPS_OPT1"
    menu_item "2" "$INDIGO" "$MSG_HTTPS_OPT2"
    menu_item "3" "$INDIGO" "$MSG_HTTPS_OPT3"
    echo
    local choice
    while true; do
        read -rp "$(prompt_text "$MSG_HTTPS_PROMPT")" choice </dev/tty
        case "$choice" in
            1)
                SSL_MODE="proxy"
                printf "  ${GRAY}%s${RESET}\n" "$(echo -e "$MSG_PROXY_YES_INFO")"
                break ;;
            2)
                SSL_MODE="selfsigned"
                printf "  ${GRAY}%s${RESET}\n" "$(echo -e "$MSG_PROXY_NO_INFO")"
                break ;;
            3)
                SSL_MODE="custom"
                while true; do
                    read -rp "$(prompt_text "$MSG_CERT_PATH_PROMPT")" CUSTOM_CERT_PATH </dev/tty
                    CUSTOM_CERT_PATH="${CUSTOM_CERT_PATH/#\~/$HOME}"
                    [[ -f "$CUSTOM_CERT_PATH" ]] && break
                    # shellcheck disable=SC2059
                    warn "$(printf "$MSG_CERT_NOT_FOUND" "$CUSTOM_CERT_PATH")"
                done
                while true; do
                    read -rp "$(prompt_text "$MSG_KEY_PATH_PROMPT")" CUSTOM_KEY_PATH </dev/tty
                    CUSTOM_KEY_PATH="${CUSTOM_KEY_PATH/#\~/$HOME}"
                    [[ -f "$CUSTOM_KEY_PATH" ]] && break
                    # shellcheck disable=SC2059
                    warn "$(printf "$MSG_CERT_NOT_FOUND" "$CUSTOM_KEY_PATH")"
                done
                printf "  ${GRAY}%s${RESET}\n" "$(echo -e "$MSG_HTTPS_OPT3_INFO")"
                break ;;
            *)
                warn "$MSG_HTTPS_INVALID" ;;
        esac
    done
}

generate_selfsigned_cert() {
    local ssl_dir="/opt/glass-keep/ssl"
    [[ -f "$ssl_dir/cert.pem" ]] && return 0
    local ssl_ip
    ssl_ip=$(get_server_ip)
    mkdir -p "$ssl_dir"
    step "$MSG_STEP_SSL" \
        openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
            -keyout "$ssl_dir/key.pem" \
            -out    "$ssl_dir/cert.pem" \
            -subj   "/CN=glasskeep" \
            -addext "subjectAltName=IP:${ssl_ip},IP:127.0.0.1,DNS:localhost" \
            2>/dev/null
    chmod 600 "$ssl_dir/key.pem"
}

apply_ssl_to_env() {
    local ssl_dir="/opt/glass-keep/ssl"
    case "$SSL_MODE" in
        proxy)
            set_env_var "HTTPS_ENABLED" "false" "$ENV_FILE"
            # Required so req.secure / X-Forwarded-Proto from the
            # upstream proxy are trusted. Without this the at-rest
            # unlock endpoint refuses to accept the secret because it
            # still sees a "plaintext HTTP" socket from Node's POV.
            set_env_var "TRUST_PROXY"   "true"  "$ENV_FILE"
            ;;
        selfsigned)
            generate_selfsigned_cert
            set_env_var "HTTPS_ENABLED" "true"              "$ENV_FILE"
            set_env_var "SSL_CERT"      "${ssl_dir}/cert.pem" "$ENV_FILE"
            set_env_var "SSL_KEY"       "${ssl_dir}/key.pem"  "$ENV_FILE"
            set_env_var "TRUST_PROXY"   "false"             "$ENV_FILE"
            ;;
        custom)
            set_env_var "HTTPS_ENABLED" "true"              "$ENV_FILE"
            set_env_var "SSL_CERT"      "$CUSTOM_CERT_PATH" "$ENV_FILE"
            set_env_var "SSL_KEY"       "$CUSTOM_KEY_PATH"  "$ENV_FILE"
            set_env_var "TRUST_PROXY"   "false"             "$ENV_FILE"
            ;;
    esac
}

# Set or update a KEY=VALUE line in a file
set_env_var() {
    local key="$1" val="$2" file="$3"
    if grep -q "^${key}=" "$file" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${val}|" "$file"
    else
        echo "${key}=${val}" >> "$file"
    fi
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
    section "$MSG_HDR_INSTALL"

    # Ask port
    local port
    read -rp "$(prompt_text "$MSG_PROMPT_PORT")" port </dev/tty
    port="${port:-8080}"

    if ! [[ "$port" =~ ^[0-9]+$ ]] || [[ "$port" -lt 1 || "$port" -gt 65535 ]]; then
        # shellcheck disable=SC2059
        die "$(printf "$MSG_INVALID_PORT" "$port")"
    fi

    # Collect admin credentials right after port (skip if database already exists)
    local admin_name="" admin_login="" admin_pass=""

    if [[ ! -f "${DATA_DIR}/notes.db" ]]; then
        section "$MSG_ADMIN_SETUP_TITLE"
        echo

        local admin_pass2
        while true; do
            read -rp "$(prompt_text "$MSG_ADMIN_NAME_PROMPT")" admin_name </dev/tty
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
            read -rp "$(prompt_text "$(printf "$MSG_ADMIN_LOGIN_PROMPT" "$admin_name")")" admin_login </dev/tty
            admin_login="$(echo -e "${admin_login}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
            admin_login="${admin_login:-$admin_name}"

            if [[ ${#admin_login} -lt 3 || ${#admin_login} -gt 32 ]] || ! [[ "$admin_login" =~ ^[A-Za-z0-9._-]+$ ]]; then
                warn "$MSG_ADMIN_LOGIN_INVALID"
                continue
            fi

            read -rsp "$(prompt_text "$MSG_ADMIN_PASS_PROMPT")" admin_pass </dev/tty
            echo
            read -rsp "$(prompt_text "$MSG_ADMIN_PASS_CONFIRM")" admin_pass2 </dev/tty
            echo

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

    # Offer at-rest encryption (asked here so all answers are collected
    # up-front; activation itself runs after the DB has been created).
    ask_encryption_config

    # Ask SSL config (last question, before installation starts)
    ask_ssl_config

    echo
    read -rsn1 -p "$(printf "${DIM}${MSG_PRESS_KEY}${RESET}")" </dev/tty
    echo

    panel "$INDIGO" "$MSG_HDR_INSTALL" \
        "${GRAY}${MSG_INFO_DIR}${RESET}${BOLD}${INSTALL_DIR}${RESET}" \
        "${GRAY}${MSG_INFO_PORT}${RESET}${BOLD}${port}${RESET}" \
        "${GRAY}${MSG_INFO_SERVICE}${RESET}${BOLD}${SERVICE_NAME}${RESET}"

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
        git clone --depth=1 --no-single-branch "$REPO_URL" "$INSTALL_DIR"

    step "$MSG_STEP_NPM" \
        bash -c "cd '${INSTALL_DIR}' && npm install --silent"

    step "$MSG_STEP_BUILD" \
        bash -c "cd '${INSTALL_DIR}' && npm run build"

    mkdir -p "$DATA_DIR"

    GLASSKEEP_ADMIN_LOGIN=""
    setup_admin "${DATA_DIR}/notes.db" "$admin_name" "$admin_login" "$admin_pass"

    GLASSKEEP_RECOVERY_KEY=""
    if [[ "$ENC_ENABLE" == "yes" ]]; then
        step "$MSG_ENC_ACTIVATING" \
            activate_encryption "${DATA_DIR}/notes.db" "$ENC_PASSPHRASE"
    fi
    # Wipe the passphrase from this shell as soon as we're done with it.
    ENC_PASSPHRASE=""

    local jwt_secret
    jwt_secret=$(openssl rand -hex 32 2>/dev/null || cat /proc/sys/kernel/random/uuid | tr -d '-' | head -c 64)

    local ssl_dir="/opt/glass-keep/ssl"
    [[ "$SSL_MODE" == "selfsigned" ]] && generate_selfsigned_cert

    cat > "$ENV_FILE" <<EOF
NODE_ENV=production
API_PORT=${port}
JWT_SECRET=${jwt_secret}
DB_FILE=${DATA_DIR}/notes.db
ADMIN_EMAILS=${GLASSKEEP_ADMIN_LOGIN}
ALLOW_REGISTRATION=false
HTTPS_ENABLED=$([[ "$SSL_MODE" == "proxy" ]] && echo "false" || echo "true")
TRUST_PROXY=$([[ "$SSL_MODE" == "proxy" ]] && echo "true" || echo "false")
EOF
    case "$SSL_MODE" in
        selfsigned) printf 'SSL_CERT=%s/cert.pem\nSSL_KEY=%s/key.pem\n' "$ssl_dir" "$ssl_dir" >> "$ENV_FILE" ;;
        custom)     printf 'SSL_CERT=%s\nSSL_KEY=%s\n' "$CUSTOM_CERT_PATH" "$CUSTOM_KEY_PATH"  >> "$ENV_FILE" ;;
    esac
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
        # If we activated encryption, surface the recovery key now —
        # before the access-info banner — and force the admin to
        # acknowledge they have written it down.
        if [[ -n "$GLASSKEEP_RECOVERY_KEY" ]]; then
            panel "$AMBER" "$MSG_ENC_RECOVERY_TITLE" \
                "" \
                "  ${BOLD}${WHITE}${GLASSKEEP_RECOVERY_KEY}${RESET}" \
                "" \
                "${AMBER}${MSG_ENC_RECOVERY_WARN}${RESET}"
            local ack
            while true; do
                read -rp "$(prompt_text "${AMBER}${MSG_ENC_RECOVERY_ACK}${RESET}")" ack </dev/tty
                case "${ack,,}" in
                    y|yes|o|oui) break ;;
                esac
            done
            success "$MSG_ENC_DONE"
            # Clear the variable from the shell so the recovery key is
            # not retrievable from a `set` dump or environment crawl.
            GLASSKEEP_RECOVERY_KEY=""
        fi
        show_access_info "$port"
    else
        warn "$MSG_WARN_SERVICE"
        info "${CYAN}journalctl -u ${SERVICE_NAME} -n 30 --no-pager${RESET}"
    fi
}

action_update() {
    section "$MSG_HDR_UPDATE"

    if ! is_installed; then
        # shellcheck disable=SC2059
        die "$(printf "$MSG_NOT_INSTALLED" "$INSTALL_DIR")"
    fi

    local port="8080"
    if [[ -f "$ENV_FILE" ]]; then
        port=$(grep -E '^API_PORT=' "$ENV_FILE" | cut -d= -f2 | tr -d '[:space:]' || echo "8080")
    fi

    # Ask SSL config (allow changing the setting)
    ask_ssl_config

    echo
    read -rsn1 -p "$(printf "${DIM}${MSG_PRESS_KEY_UPDATE}${RESET}")" </dev/tty
    echo

    # shellcheck disable=SC2059
    step "$(printf "$MSG_STEP_STOP" "$SERVICE_NAME")" \
        systemctl stop "$SERVICE_NAME"

    step "$MSG_STEP_PULL" \
        bash -c "cd '${INSTALL_DIR}' && git pull origin main"

    step "$MSG_STEP_NPM_UPDATE" \
        bash -c "cd '${INSTALL_DIR}' && npm install --silent"

    step "$MSG_STEP_REBUILD" \
        bash -c "cd '${INSTALL_DIR}' && npm run build"

    # Apply HTTPS setting based on user's choice
    apply_ssl_to_env

    # shellcheck disable=SC2059
    step "$(printf "$MSG_STEP_START" "$SERVICE_NAME")" \
        systemctl start "$SERVICE_NAME"

    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        show_access_info "$port"
    else
        warn "$MSG_WARN_SERVICE"
        info "${CYAN}journalctl -u ${SERVICE_NAME} -n 30 --no-pager${RESET}"
    fi
}

action_uninstall() {
    section "$MSG_HDR_UNINSTALL"

    if ! is_installed; then
        warn "$MSG_NOT_INSTALLED_WARN"
    fi

    panel "$RED" "$MSG_UNINSTALL_WARN" \
        "${MSG_UNINSTALL_SVC}${BOLD}${SERVICE_FILE}${RESET}" \
        "${MSG_UNINSTALL_APP}${BOLD}${INSTALL_DIR}${RESET}" \
        "${MSG_UNINSTALL_DATA}${BOLD}${DATA_DIR}${RESET}" \
        "${MSG_UNINSTALL_CFG}${BOLD}${ENV_FILE}${RESET}"
    local confirm
    read -rp "$(prompt_text "$MSG_PROMPT_CONFIRM")" confirm </dev/tty
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

    local proto="http"
    local https_val
    https_val=$(grep -E '^HTTPS_ENABLED=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
    [[ "$https_val" == "true" ]] && proto="https"

    panel "$GREEN" "$MSG_ACCESS_TITLE" \
        "" \
        "${BOLD}${MSG_ACCESS_LOCAL}${RESET} ${CYAN}${proto}://localhost:${port}${RESET}" \
        "${BOLD}${MSG_ACCESS_NET}${RESET} ${CYAN}${proto}://${ip}:${port}${RESET}" \
        "" \
        "${MSG_ACCESS_CREDS}" \
        "" \
        "${GRAY}${MSG_ACCESS_LOGS}${RESET}   ${CYAN}journalctl -u ${SERVICE_NAME} -f${RESET}" \
        "${GRAY}${MSG_ACCESS_STATUS}${RESET}  ${CYAN}systemctl status ${SERVICE_NAME}${RESET}"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
    setup_i18n
    require_root
    check_os

    echo
    # Logo: GLASS KEEP rendered in indigo→violet for brand cohesion
    # with the app's gradient buttons. Subtitle in gray for hierarchy.
    printf "${BOLD}${INDIGO}"
    echo "   ██████╗ ██╗      █████╗ ███████╗███████╗"
    echo "  ██╔════╝ ██║     ██╔══██╗██╔════╝██╔════╝"
    echo "  ██║  ███╗██║     ███████║███████╗███████╗"
    printf "${BOLD}${VIOLET}"
    echo "  ██║   ██║██║     ██╔══██║╚════██║╚════██║"
    echo "  ╚██████╔╝███████╗██║  ██║███████║███████║"
    echo "   ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝"
    printf "${RESET}"
    printf "          ${BOLD}K E E P${RESET}  ${GRAY}·  %s${RESET}\n" "$MSG_SUBTITLE"
    echo

    if is_installed; then
        info "${MSG_EXISTING} ${BOLD}${INSTALL_DIR}${RESET}"
    else
        info "${MSG_NO_INSTALL}"
    fi

    echo
    printf "${BOLD}%s${RESET}\n" "$MSG_MENU_TITLE"
    echo
    menu_item "1" "$GREEN"  "$MSG_OPT_INSTALL"   ""
    menu_item "2" "$AMBER"  "$MSG_OPT_UPDATE"    ""
    menu_item "3" "$RED"    "$MSG_OPT_UNINSTALL" ""
    echo
    local choice
    read -rp "$(prompt_text "$MSG_PROMPT_CHOICE")" choice </dev/tty

    case "$choice" in
        1) action_install   ;;
        2) action_update    ;;
        3) action_uninstall ;;
        # shellcheck disable=SC2059
        *) die "$(printf "$MSG_INVALID_CHOICE" "$choice")" ;;
    esac
}

main "$@"
