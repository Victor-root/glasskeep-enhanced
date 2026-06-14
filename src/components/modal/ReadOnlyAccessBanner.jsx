import React from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";

// Shown when the current user is a READ-ONLY collaborator on a note — the
// owner shared it with them as read-only, so they can open it but not
// change its shared content. Distinct from the federation "peer offline"
// banner (FederationReadOnlyBanner): this is a deliberate permission, not
// an outage, so it uses a calm neutral tone.
export default function ReadOnlyAccessBanner({ visible }) {
  if (!visible) return null;
  return (
    <div className="mx-4 mt-2 sm:mx-6 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm bg-gray-50 dark:bg-white/5 border-[var(--border-light)] text-gray-600 dark:text-gray-300">
      <TI.Eye className="tabler-icon w-4 h-4 shrink-0" />
      <span>{t("readOnlyAccessBanner")}</span>
    </div>
  );
}
