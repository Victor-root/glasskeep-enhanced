import React, { useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { useUpdateChannel } from "../../hooks/useUpdateChannel.js";
import LeaveBetaDialog from "./LeaveBetaDialog.jsx";

const CHANNELS = [
  { id: "stable", titleKey: "updateChannelStable", descKey: "updateChannelStableDesc" },
  { id: "beta", titleKey: "updateChannelBeta", descKey: "updateChannelBetaDesc" },
];

// What the server answered instead of switching, said plainly.
const ERROR_KEYS = {
  incompatible: "updateChannelErrIncompatible",
  no_backup: "updateChannelErrNoBackup",
  in_progress: "updateChannelErrInProgress",
  one_click_unavailable: "updateChannelErrNoOneClick",
  "the update check could not reach GitHub": "updateChannelErrGithub",
};

// The update channel: stable releases, or betas ahead of them. Entering
// the beta backs the data up and installs the beta on offer; leaving it
// asks how (see LeaveBetaDialog). An update it starts shows in the usual
// progress modal.
export default function UpdateChannelControl({ token, selfUpdate, updateInfo, showGenericConfirm }) {
  const { info, change } = useUpdateChannel({ token, isAdmin: true });
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  if (!info) return null;

  const apply = async (body) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await change(body);
      updateInfo?.refresh?.();
      if (result?.started) selfUpdate?.trackUpdate({ toVersion: result.toVersion });
      else if (result?.reason === "no_beta") setNotice(t("updateChannelNoBeta"));
      else if (result?.reason) setNotice(t("updateChannelNeedsOneClick"));
    } catch (e) {
      setNotice(t(ERROR_KEYS[e?.message] || "updateChannelErr"));
    } finally {
      setBusy(false);
    }
  };

  const pick = (channel) => {
    if (channel === info.channel) return;
    if (channel === "beta") {
      showGenericConfirm({
        title: t("enterBetaTitle"),
        message: t("enterBetaMessage"),
        confirmText: t("enterBetaConfirm"),
        cancelText: t("cancel"),
        onConfirm: () => apply({ channel: "beta" }),
      });
    } else if (info.build.beta) {
      setLeaving(true);
    } else {
      apply({ channel: "stable" });
    }
  };

  const locked = busy || !!selfUpdate?.isActive;

  return (
    <div className="mb-3">
      <div className="text-sm font-medium mb-2">{t("updateChannelTitle")}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label={t("updateChannelTitle")}>
        {CHANNELS.map((channel) => {
          const isSel = channel.id === info.channel;
          return (
            <button
              key={channel.id}
              type="button"
              role="radio"
              aria-checked={isSel}
              disabled={locked}
              onClick={() => pick(channel.id)}
              className={`rounded-xl border px-3 py-2 text-left transition-all active:scale-[0.99] disabled:opacity-60 ${
                isSel
                  ? "border-[var(--gk-chrome-accent)] ring-2 ring-[var(--gk-chrome-accent)]"
                  : "border-[var(--border-light)] hover:border-[var(--gk-accent-soft-border)]"
              }`}
            >
              <span className="flex items-center justify-between gap-1">
                <span className="text-sm font-medium">{t(channel.titleKey)}</span>
                {isSel && <TI.Check className="tabler-icon w-4 h-4 shrink-0 text-[var(--gk-chrome-accent)]" />}
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">{t(channel.descKey)}</span>
            </button>
          );
        })}
      </div>
      {info.channel === "stable" && info.build.beta && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("updateChannelWaiting")}</p>
      )}
      {notice && <p className="text-xs text-amber-700 dark:text-amber-300 mt-2" role="status">{notice}</p>}
      {leaving && (
        <LeaveBetaDialog
          info={info}
          onCancel={() => setLeaving(false)}
          onConfirm={(action) => {
            setLeaving(false);
            apply({ channel: "stable", action });
          }}
        />
      )}
    </div>
  );
}
