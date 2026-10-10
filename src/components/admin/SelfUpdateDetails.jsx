import React from "react";
import { t } from "../../i18n";
import { formatDuration, modeLabel, stepLabel } from "./selfUpdateHelpers.js";

// Renders a single label/value row for the expert details panel.
// Hidden when the value is empty so the panel stays compact for
// runs that did not produce certain fields (no error, no rollback).
function DetailRow({ label, value, monoValue = true, hideIfEmpty = false }) {
    if (hideIfEmpty && (value === null || value === undefined || value === "")) {
        return null;
    }
    const v =
        value === null || value === undefined || value === ""
            ? t("selfUpdateEmpty")
            : value;
    return (
        <div className="grid grid-cols-[max-content_1fr] gap-x-3 items-baseline">
            <span className="opacity-60">{label}:</span>
            <span className={monoValue ? "font-mono break-all" : "break-words"}>
                {v}
            </span>
        </div>
    );
}

// Expert details panel of the self-update modal.
export default function SelfUpdateDetails({ status, mode, phase, failed, step, totalSteps, startError }) {
    return (
        <div className="mt-2 rounded-lg border border-[var(--border-light)] bg-gray-50 dark:bg-black/30 p-3 text-xs font-mono text-gray-700 dark:text-gray-200 space-y-1">
            <DetailRow
                label={t("selfUpdateDetailMode")}
                value={modeLabel(status?.mode || mode)}
            />
            <DetailRow
                label={t("selfUpdateDetailState")}
                value={stepLabel(status?.state) || (status?.state || phase)}
            />
            <DetailRow
                label={
                    failed
                        ? t("selfUpdateDetailFailedAtStep")
                        : t("selfUpdateDetailStep")
                }
                value={`${step} / ${totalSteps}`}
            />
            <DetailRow
                label={t("selfUpdateDetailFromVersion")}
                value={status?.fromVersion ? `v${status.fromVersion}` : null}
            />
            <DetailRow
                label={t("selfUpdateDetailToVersion")}
                value={status?.toVersion ? `v${status.toVersion}` : null}
            />
            <DetailRow
                label={t("selfUpdateDetailMessage")}
                value={status?.message}
                monoValue={false}
                hideIfEmpty
            />
            <DetailRow
                label={t("selfUpdateDetailStartedAt")}
                value={status?.startedAt}
            />
            <DetailRow
                label={t("selfUpdateDetailEndedAt")}
                value={status?.endedAt}
            />
            <DetailRow
                label={t("selfUpdateDetailDuration")}
                value={formatDuration(status?.startedAt, status?.endedAt)}
                hideIfEmpty
            />
            <DetailRow
                label={t("selfUpdateDetailAcknowledgedAt")}
                value={status?.acknowledgedAt}
                hideIfEmpty
            />
            <DetailRow
                label={t("selfUpdateDetailError")}
                value={status?.error || startError}
                monoValue={false}
                hideIfEmpty
            />
            <DetailRow
                label={t("selfUpdateDetailRolledBack")}
                value={
                    status?.rolledBack
                        ? t("selfUpdateYes")
                        : t("selfUpdateNo")
                }
                hideIfEmpty={!status?.rolledBack && status?.state !== "rolled_back"}
            />
        </div>
    );
}
