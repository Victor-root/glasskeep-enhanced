import React from "react";
import { t } from "../../i18n";

function formatDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function Badge({ color, children }) {
  const klass = {
    indigo: "bg-[var(--gk-accent-soft-bg)] text-[var(--gk-chrome-accent)]",
    amber:  "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    gray:   "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  }[color] || "bg-gray-100 text-gray-700";
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${klass}`}>
      {children}
    </span>
  );
}

// One saved passkey: name, badges, last use, and its test / rename /
// delete / instance-unlock actions.
export default function PasskeyListItem({
  p,
  isAdmin,
  encryptionEnabled,
  unlockToggleAllowed,
  busyId,
  testingId,
  onTest,
  onRename,
  onDelete,
  onToggleUnlock,
}) {
  return (
    <li
      // One wrapping row: info + actions sit side by side when there's
      // room and the actions drop to their own line when there isn't.
      // The info column keeps a min width so it can never collapse to
      // ~0 (which made its badges overflow on top of the buttons).
      className="rounded-lg border border-[var(--border-light)] p-3 flex flex-wrap items-center gap-x-4 gap-y-3"
    >
      <div className="flex-1 min-w-[14rem]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">
            {p.name || t("passkeyUnnamed")}
          </span>
          <Badge color="indigo">{t("passkeyBadgeLogin")}</Badge>
          {p.canUnlockInstance && (
            <Badge color="amber">{t("passkeyBadgeUnlock")}</Badge>
          )}
          {p.backedUp && (
            <Badge color="gray">{t("passkeyBadgeSynced")}</Badge>
          )}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {p.lastUsedAt
            ? t("passkeyLastUsed").replace("%s", formatDate(p.lastUsedAt))
            : t("passkeyNeverUsed")}
        </div>
        {!p.prfSupported && isAdmin && encryptionEnabled && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 italic">
            {t("passkeyNoPrfRow")}
          </div>
        )}
      </div>

      {/* Actions stay wrappable and shrinkable: with the extra
          "allow unlock" button (long label) the old md:flex-nowrap +
          md:shrink-0 forced a fixed-width block that crushed the info
          column to ~0, so its badges overflowed on top of the buttons.
          Letting the buttons wrap keeps the info column from collapsing.
          Left-aligned; the long "(dis)allow unlock" button goes last. */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => onTest(p)}
          disabled={busyId === p.credentialId || testingId === p.credentialId}
          className="px-2.5 py-1 rounded text-xs border border-[var(--border-light)] text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
        >
          {testingId === p.credentialId ? t("passkeyTestInProgress") : t("passkeyTestCta")}
        </button>
        <button
          type="button"
          onClick={() => onRename(p)}
          disabled={busyId === p.credentialId}
          className="px-2.5 py-1 rounded text-xs border border-[var(--border-light)] text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
        >{t("rename")}</button>
        <button
          type="button"
          onClick={() => onDelete(p)}
          disabled={busyId === p.credentialId}
          className="px-2.5 py-1 rounded text-xs border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
        >{t("delete")}</button>
        {/* Instance-unlock toggle (admins, PRF-capable, unlocked vault) — last */}
        {isAdmin && encryptionEnabled && p.prfSupported && (
          <button
            type="button"
            onClick={() => onToggleUnlock(p)}
            disabled={busyId === p.credentialId || !unlockToggleAllowed}
            title={!unlockToggleAllowed ? t("passkeyUnlockToggleDisabledHint") : undefined}
            className={`px-2.5 py-1 rounded text-xs font-medium border ${
              p.canUnlockInstance
                ? "border-amber-500 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                : "border-[var(--border-light)] text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
            } disabled:opacity-50`}
          >
            {p.canUnlockInstance ? t("passkeyDisableUnlock") : t("passkeyEnableUnlock")}
          </button>
        )}
      </div>
    </li>
  );
}
