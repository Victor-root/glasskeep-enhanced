import React, { useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../../i18n";

// Leaving the beta: the ways back the server allows. Going back now
// keeps everything when the stable release reads this beta's data;
// otherwise it means restoring the backup taken before the beta. Waiting
// for the next stable release is always possible and loses nothing.
function waysBack(info) {
  const stable = info?.stable;
  if (!stable) return ["wait"];
  if (stable.readsThisDatabase) return ["now", "wait"];
  return info.preBetaBackup ? ["restore", "wait"] : ["wait"];
}

function describe(way, info) {
  const version = info.stable?.version || "";
  if (way === "now") {
    return { title: t("leaveBetaNow"), desc: t("leaveBetaNowDesc").replace(/\{version\}/g, version) };
  }
  if (way === "restore") {
    const date = new Date(info.preBetaBackup.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    return {
      title: t("leaveBetaRestore"),
      desc: t("leaveBetaRestoreDesc").replace(/\{version\}/g, version).replace("{date}", date),
    };
  }
  return { title: t("leaveBetaWait"), desc: t("leaveBetaWaitDesc") };
}

// Why only waiting is offered, when it is.
function onlyWaitReason(info) {
  if (!info.stable) return t("leaveBetaNoGithub");
  if (!info.stable.readsThisDatabase && !info.preBetaBackup) {
    return t("leaveBetaNoBackup").replace(/\{version\}/g, info.stable.version);
  }
  return null;
}

export default function LeaveBetaDialog({ info, onCancel, onConfirm }) {
  const ways = waysBack(info);
  // Restoring loses data: it is offered, never picked in advance.
  const [choice, setChoice] = useState(ways.includes("restore") ? "wait" : ways[0]);
  const reason = ways.length === 1 ? onlyWaitReason(info) : null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div
        className="rounded-xl shadow-2xl w-[90%] max-w-md p-6 relative bg-white dark:bg-[#282828] border border-[var(--border-light)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-beta-title"
      >
        <h3 id="leave-beta-title" className="text-lg font-semibold mb-2">{t("leaveBetaTitle")}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          {t("leaveBetaIntro").replace("{version}", info.build.label)}
        </p>
        {reason && <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">{reason}</p>}
        <div className="space-y-2" role="radiogroup" aria-labelledby="leave-beta-title">
          {ways.map((way) => {
            const { title, desc } = describe(way, info);
            const isSel = way === choice;
            return (
              <button
                key={way}
                type="button"
                role="radio"
                aria-checked={isSel}
                onClick={() => setChoice(way)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition-all active:scale-[0.99] ${
                  isSel
                    ? "border-[var(--gk-chrome-accent)] ring-2 ring-[var(--gk-chrome-accent)]"
                    : "border-[var(--border-light)] hover:border-[var(--gk-accent-soft-border)]"
                }`}
              >
                <span className="block text-sm font-medium">{title}</span>
                <span className={`block text-xs mt-0.5 ${way === "restore" ? "text-amber-700 dark:text-amber-300" : "text-gray-500"}`}>
                  {desc}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(choice)}
            className="px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 btn-gradient"
          >
            {t("leaveBetaConfirm")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
