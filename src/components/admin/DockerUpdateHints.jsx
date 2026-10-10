import React, { useState } from "react";
import { t } from "../../i18n";
import { CopyFeedback } from "./UpdateCommandRow.jsx";

// The exact line users with an older docker-compose.yml need to add to
// unlock the one-click update. Kept here so we can show it inline.
const DOCKER_SOCKET_MOUNT_HINT = "- /var/run/docker.sock:/var/run/docker.sock";

// Inline hint shown when running in Docker without the socket mount:
// guides the admin through the one-time docker-compose.yml edit that
// unlocks the one-click button.
export function DockerSocketHint() {
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
    <div className="rounded-lg border border-[var(--gk-accent-soft-border)] bg-[var(--gk-accent-soft-bg)] p-3 mb-3">
      <p className="text-xs text-[var(--gk-chrome-accent)] mb-2">
        {t("selfUpdateDockerHintIntro")}
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs font-mono text-[var(--gk-chrome-accent)] bg-white dark:bg-black/40 border border-[var(--gk-accent-soft-border)] rounded-md px-2 py-1.5 whitespace-nowrap overflow-x-auto">
          {DOCKER_SOCKET_MOUNT_HINT}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-white dark:bg-white/10 border border-[var(--gk-accent-soft-border)] hover:bg-[var(--gk-accent-soft-bg)] dark:hover:bg-white/15"
        >
          <CopyFeedback copied={copied} />
        </button>
      </div>
      <p className="text-[11px] text-[var(--gk-chrome-accent)] opacity-80 mt-2">
        {t("selfUpdateDockerHintFootnote")}
      </p>
    </div>
  );
}

// Shown when the socket IS mounted but the app still can't drive Docker:
// permission denied (the Synology root:root case) or the daemon not
// answering. Unlike DockerSocketHint there is no line to copy: the
// remedy is to recreate/restart the container or fix the daemon, so
// this is a text-only notice in a distinct (amber) colour.
export function DockerNoticeHint({ intro, footnote }) {
  return (
    <div className="rounded-lg border border-amber-300/60 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 mb-3">
      <p className="text-xs text-amber-900 dark:text-amber-200">{intro}</p>
      {footnote && (
        <p className="text-[11px] font-mono text-amber-800/80 dark:text-amber-200/70 mt-2">
          {footnote}
        </p>
      )}
    </div>
  );
}
