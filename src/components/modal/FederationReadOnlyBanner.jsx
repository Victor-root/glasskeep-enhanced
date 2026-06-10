import React from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";

// Shown on a mirrored cross-server note when its authority peer can't be
// reached, so editing is blocked. The note stays fully visible; only the
// editing is paused until the peer is back. Message + tone vary by why.
const KEY_BY_STATE = {
  offline: "fedReadOnlyOffline",
  locked: "fedReadOnlyLocked",
  incompatible: "fedReadOnlyIncompatible",
};

export default function FederationReadOnlyBanner({ info }) {
  if (!info || !info.readOnly) return null;
  const peer = info.peerLabel || t("fedRemoteServer");
  const key = KEY_BY_STATE[info.state] || "fedReadOnlyUnknown";
  // Offline = red (it's down); locked / out-of-date = amber (actionable).
  const tone =
    info.state === "offline"
      ? "bg-rose-50 dark:bg-rose-900/30 border-rose-400 dark:border-rose-600 text-rose-800 dark:text-rose-200"
      : "bg-amber-50 dark:bg-amber-900/30 border-amber-400 dark:border-amber-600 text-amber-800 dark:text-amber-200";
  return (
    <div
      className={`mx-4 mt-2 sm:mx-6 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${tone}`}
    >
      <TI.Server className="tabler-icon w-4 h-4 shrink-0" />
      <span>{t(key).replace("{peer}", peer)}</span>
    </div>
  );
}
