import { t } from "../../i18n";
import { API_BASE } from "../../utils/api.js";

// Labels, durations and log scanning for the self-update modal, and the
// fetch its live gauges and technical log poll with.

const STEP_LABEL_KEYS = {
    queued: "selfUpdateStepQueued",
    preparing: "selfUpdateStepPreparing",
    stopping_service: "selfUpdateStepStopping",
    fetching: "selfUpdateStepFetching",
    renaming: "selfUpdateStepRenaming",
    creating: "selfUpdateStepCreating",
    upgrading_runtime: "selfUpdateStepRuntime",
    installing: "selfUpdateStepInstalling",
    building: "selfUpdateStepBuilding",
    starting_service: "selfUpdateStepStarting",
    rolling_back: "selfUpdateStepRollingBack",
    success: "selfUpdateStepSuccess",
    error: "selfUpdateStepError",
    rolled_back: "selfUpdateStepRolledBack",
    cancelled: "selfUpdateStepCancelled",
};

export function stepLabel(state) {
    const key = STEP_LABEL_KEYS[state];
    return key ? t(key) : state || "";
}

// Scan the technical log for known failure patterns and map them to
// a category. The category drives a friendlier subtext / hint in the
// header so the admin sees "out of memory during build" instead of
// just the generic "exit 134". Categories are intentionally
// conservative — when in doubt, return null and we fall back to the
// default rolled_back / error messaging.
export function detectFailureHint(logText) {
    if (!logText) return null;
    if (
        /Reached heap limit|JavaScript heap out of memory|Allocation failed/i.test(
            logText
        )
    ) {
        return "oom";
    }
    if (
        /Could not resolve host|Connection refused|ENETUNREACH|Network is unreachable|fatal: unable to access/i.test(
            logText
        )
    ) {
        return "network";
    }
    if (/Permission denied|EACCES/i.test(logText)) {
        return "permissions";
    }
    if (/ENOSPC|No space left on device/i.test(logText)) {
        return "disk";
    }
    return null;
}

export function modeLabel(mode) {
    if (mode === "native") return t("selfUpdateDetailModeNative");
    if (mode === "docker") return t("selfUpdateDetailModeDocker");
    return mode || t("selfUpdateEmpty");
}

export function formatDuration(startISO, endISO) {
    if (!startISO || !endISO) return t("selfUpdateEmpty");
    const s = Date.parse(startISO);
    const e = Date.parse(endISO);
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return t("selfUpdateEmpty");
    const ms = e - s;
    if (ms < 1000) return `${ms} ms`;
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s2 = totalSec % 60;
    return m > 0 ? `${m}m ${s2}s` : `${s2}s`;
}

// One poll of a live self-update endpoint ("system", "log"). cache:no-store
// + a fresh _t every call guarantee the browser hits the network instead of
// returning the same response from its HTTP cache. Without this the gauges
// look frozen because every poll resolves to the very first reading.
export function fetchSelfUpdateLive(path, token, signal) {
    return fetch(`${API_BASE}/admin/self-update/${path}?_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal,
    });
}
