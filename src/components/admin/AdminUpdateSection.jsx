import React, { useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";

const REPO_URL = "https://github.com/Victor-root/glasskeep-enhanced";

const INSTALL_COMMAND =
  "curl -fsSL https://raw.githubusercontent.com/Victor-root/glasskeep-enhanced/main/install.sh | sudo bash";
const DOCKER_COMMAND =
  "cd ~/glasskeep && docker compose pull && docker compose up -d";

// The exact line users with an older docker-compose.yml need to add to
// unlock the one-click update. Kept here so we can show it inline.
const DOCKER_SOCKET_MOUNT_HINT = "- /var/run/docker.sock:/var/run/docker.sock";

function CommandRow({ icon: Icon, label, description, command }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(command);
      } else {
        const ta = document.createElement("textarea");
        ta.value = command;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (_) {
      /* clipboard blocked — silent */
    }
  };

  return (
    <div className="rounded-lg border border-[var(--border-light)] bg-gray-50 dark:bg-black/30 p-3">
      {/* Title row: icon + label left, copy button right */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
          <Icon className="tabler-icon w-4 h-4" />
          {label}
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-white dark:bg-white/10 border border-[var(--border-light)] hover:bg-gray-100 dark:hover:bg-white/15"
          aria-label={t("copyCommand")}
        >
          {copied ? (
            <TI.Check className="tabler-icon w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" />
          ) : (
            <TI.Download className="tabler-icon w-3.5 h-3.5 opacity-70" />
          )}
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      {/* Description and command: full width, no icon indentation */}
      {description && (
        <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
          {description}
        </p>
      )}
      <code
        className="block w-full text-xs font-mono text-gray-800 dark:text-gray-100 bg-white dark:bg-black/40 border border-[var(--border-light)] rounded-md px-2 py-1.5 whitespace-nowrap overflow-x-auto"
        title={command}
      >
        {command}
      </code>
    </div>
  );
}

// Inline hint shown when running in Docker without the socket mount —
// guides the admin through the one-time docker-compose.yml edit that
// unlocks the one-click button.
function DockerSocketHint() {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(DOCKER_SOCKET_MOUNT_HINT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="rounded-lg border border-indigo-300/60 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 p-3 mb-3">
      <p className="text-xs text-indigo-900 dark:text-indigo-200 mb-2">
        {t("selfUpdateDockerHintIntro")}
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs font-mono text-indigo-900 dark:text-indigo-100 bg-white dark:bg-black/40 border border-indigo-200 dark:border-indigo-500/30 rounded-md px-2 py-1.5 whitespace-nowrap overflow-x-auto">
          {DOCKER_SOCKET_MOUNT_HINT}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-white dark:bg-white/10 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-50 dark:hover:bg-white/15"
        >
          {copied ? (
            <TI.Check className="tabler-icon w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" />
          ) : (
            <TI.Download className="tabler-icon w-3.5 h-3.5 opacity-70" />
          )}
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <p className="text-[11px] text-indigo-800/80 dark:text-indigo-200/70 mt-2">
        {t("selfUpdateDockerHintFootnote")}
      </p>
    </div>
  );
}

export default function AdminUpdateSection({
  updateInfo,
  selfUpdate,
  showGenericConfirm,
}) {
  const fallback =
    typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "";
  const currentVersion = updateInfo?.currentVersion || fallback;
  const updateAvailable =
    !!updateInfo?.updateAvailable && !!updateInfo?.latestVersion;
  const latestVersion = updateInfo?.latestVersion;

  const mode = selfUpdate?.mode || null;
  const oneClickAvailable = !!selfUpdate?.oneClickAvailable;
  const oneClickReason = selfUpdate?.modeReason || null;
  const isUpdateRunning = !!selfUpdate?.isActive;

  const canOneClick = updateAvailable && oneClickAvailable && !isUpdateRunning;

  const onClickUpdateNow = () => {
    if (!latestVersion) return;
    const fire = () => {
      try {
        selfUpdate?.startUpdate({ latestVersion });
      } catch {
        /* ignore — the modal will surface errors */
      }
    };
    if (typeof showGenericConfirm === "function") {
      showGenericConfirm({
        title: t("selfUpdateConfirmTitle").replace("{version}", latestVersion),
        message: t("selfUpdateConfirmMessage").replace(
          "{version}",
          latestVersion
        ),
        confirmText: t("selfUpdateConfirmButton"),
        cancelText: t("cancel"),
        onConfirm: fire,
      });
    } else {
      fire();
    }
  };

  return (
    <div
      className={`mb-6 rounded-xl border ${
        updateAvailable
          ? "border-emerald-300/60 dark:border-emerald-500/30"
          : "border-[var(--border-light)]"
      } bg-white/60 dark:bg-white/5 p-4`}
    >
      {/* Header row: icon + title + version badge — stays on one line */}
      <div className="flex items-center gap-3 mb-3">
        <span
          className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
            updateAvailable
              ? "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 dark:bg-emerald-400/15"
              : "text-indigo-600 dark:text-indigo-300 bg-indigo-500/10 dark:bg-indigo-400/15"
          }`}
        >
          <TI.Refresh className="tabler-icon w-6 h-6" />
        </span>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0">
          <h4 className="text-base font-semibold shrink-0">
            {t("appVersionSectionTitle")}
          </h4>
          <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400 shrink-0">
            v{currentVersion}
          </span>
          {updateAvailable && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
              {t("updateAvailable")} · v{latestVersion}
            </span>
          )}
        </div>
      </div>

      {/* All content below is full-width, aligned to the left edge */}
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
        {updateAvailable
          ? t("updateAvailableDescription").replace("{version}", latestVersion)
          : t("updateUpToDateDescription")}
      </p>

      {updateAvailable && (
        <>
          {/* Primary action: one-click update when available. */}
          {oneClickAvailable && (
            <div className="mb-3">
              <button
                type="button"
                onClick={onClickUpdateNow}
                disabled={!canOneClick}
                className={`inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg shadow-sm ${
                  canOneClick
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-gray-300 text-gray-600 cursor-not-allowed dark:bg-white/10 dark:text-gray-400"
                }`}
              >
                <TI.Download className="tabler-icon w-4 h-4" />
                {isUpdateRunning
                  ? t("selfUpdateRunning")
                  : t("selfUpdateButton")}
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                {t("selfUpdateButtonHint")}
              </p>
            </div>
          )}

          {/* Docker + no socket = guide the admin to add the one missing line */}
          {!oneClickAvailable &&
            mode === "docker" &&
            oneClickReason === "docker-socket-missing" && (
              <DockerSocketHint />
            )}

          {/* Manual commands stay around as a fallback for either mode. */}
          <div className="space-y-3 mb-3">
            <CommandRow
              icon={TI.Terminal2}
              label={t("updateMethodTerminal")}
              description={t("updateMethodTerminalDescription")}
              command={INSTALL_COMMAND}
            />
            <CommandRow
              icon={TI.BrandDocker}
              label={t("updateMethodDocker")}
              description={t("updateMethodDockerDescription")}
              command={DOCKER_COMMAND}
            />
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 dark:bg-white/10 dark:hover:bg-white/15"
        >
          <TI.BrandGithub className="tabler-icon w-4 h-4" />
          {t("openRepo")}
          <TI.ExternalLink className="tabler-icon w-3.5 h-3.5 opacity-70" />
        </a>
      </div>
    </div>
  );
}
