// src/components/admin/federation/federationStatus.js
//
// Single source of truth for how a federation link's state is presented:
// which icon, which colour tone, and which i18n keys (short label +
// longer explanation). Kept separate from the components so the link
// card, the section header badge and any future on-note banner all read
// a link identically — the design goal being that nobody is ever left
// guessing WHY a shared note is (or isn't) editable.
//
// THEMING: the "pending/checking" tone is painted from the active shell
// theme's accent CSS variables, so it follows whichever theme the user
// picked. The ok / warn / down tones stay semantic (green = healthy,
// amber = needs attention, red = down) — those meanings are universal
// and should read the same under every theme.

import TI from "../../../icons/editor/index.jsx";

// Mirrors server/federation/protocol.js LINK_STATE.
export const FED_STATE = Object.freeze({
  ONLINE: "online",
  OFFLINE: "offline",
  INCOMPATIBLE: "incompatible",
  LOCKED: "locked",
  UNKNOWN: "unknown",
  OUTGOING_PENDING: "outgoing_pending",
  INCOMING_PENDING: "incoming_pending",
  ACCEPTING: "accepting",
  REFUSED: "refused",
  CANCELLED: "cancelled",
  REVOKED: "revoked",
});

const META = {
  [FED_STATE.ONLINE]: { tone: "ok", icon: TI.CircleCheck, labelKey: "fedStateOnline", descKey: "fedStateOnlineDesc" },
  [FED_STATE.OFFLINE]: { tone: "down", icon: TI.AlertTriangle, labelKey: "fedStateOffline", descKey: "fedStateOfflineDesc" },
  [FED_STATE.INCOMPATIBLE]: { tone: "warn", icon: TI.AlertTriangle, labelKey: "fedStateIncompatible", descKey: "fedStateIncompatibleDesc" },
  [FED_STATE.LOCKED]: { tone: "warn", icon: TI.ShieldLock, labelKey: "fedStateLocked", descKey: "fedStateLockedDesc" },
  [FED_STATE.UNKNOWN]: { tone: "pending", icon: TI.Clock, labelKey: "fedStateChecking", descKey: "fedStateCheckingDesc" },
  [FED_STATE.OUTGOING_PENDING]: { tone: "pending", icon: TI.Clock, labelKey: "fedStateOutgoing", descKey: "fedStateOutgoingDesc" },
  [FED_STATE.INCOMING_PENDING]: { tone: "pending", icon: TI.UserPlus, labelKey: "fedStateIncoming", descKey: "fedStateIncomingDesc" },
  [FED_STATE.ACCEPTING]: { tone: "pending", icon: TI.Clock, labelKey: "fedStateAccepting", descKey: "fedStateAcceptingDesc" },
  [FED_STATE.REFUSED]: { tone: "neutral", icon: TI.X, labelKey: "fedStateRefused", descKey: "fedStateRefusedDesc" },
  [FED_STATE.CANCELLED]: { tone: "neutral", icon: TI.X, labelKey: "fedStateCancelled", descKey: "fedStateCancelledDesc" },
  [FED_STATE.REVOKED]: { tone: "neutral", icon: TI.X, labelKey: "fedStateRevoked", descKey: "fedStateRevokedDesc" },
};

const FALLBACK = { tone: "neutral", icon: TI.World, labelKey: "fedStateChecking", descKey: "fedStateCheckingDesc" };

export function getFederationStateMeta(state) {
  return META[state] || FALLBACK;
}

// Tailwind classes for a small status pill, by tone. `pending` is the
// theme-accent tone; the rest are semantic.
export function fedToneClasses(tone) {
  switch (tone) {
    case "ok":
      return "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25";
    case "warn":
      return "bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25";
    case "down":
      return "bg-rose-500/12 text-rose-700 dark:text-rose-300 border border-rose-500/25";
    case "pending":
      return "bg-[var(--gk-accent-soft-bg)] text-[var(--gk-chrome-accent)] border border-[var(--gk-accent-soft-border)]";
    default:
      return "bg-gray-500/10 text-gray-600 dark:text-gray-300 border border-gray-500/20";
  }
}
