import React from "react";
import TI from "../../icons/editor/index.jsx";
import { t } from "../../i18n";

// Small themed badge marking a collaborator (or option) that lives on a
// paired peer server: the friendly server name, never a URL. Accent
// colours come from the active shell theme, so it follows every theme.
export default function ServerBadge({ label }) {
  return (
    <span className="shrink-0 inline-flex items-center gap-1 align-middle text-[11px] font-medium pl-1 pr-1.5 py-0.5 rounded-md bg-[var(--gk-accent-soft-bg)] text-[var(--gk-chrome-accent)] border border-[var(--gk-accent-soft-border)]">
      <TI.Server className="tabler-icon w-3.5 h-3.5 shrink-0" />
      <span className="truncate max-w-[10rem]">{label || t("fedRemoteServer")}</span>
    </span>
  );
}
