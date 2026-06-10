// src/components/admin/federation/FederationInviteWatcher.jsx
//
// A headless (renders nothing) admin-only watcher for cross-server
// federation events. Two jobs:
//
//   1. Pairing requests, as ACTIONABLE notifications — the admin can
//      Accept or Decline straight from the toast, without opening the
//      admin panel (the panel keeps its own accept/decline too):
//        - durable catch-up: on mount / login it fetches the current
//          links once and raises a request for anything already waiting,
//          so an invitation that arrived while this admin was offline is
//          still actionable next time they sign in;
//        - live: it raises the notification the moment a new invitation
//          arrives.
//      The Accept / Decline buttons carry a `kind` + `linkId`; the API
//      call is dispatched centrally by App.jsx's handleNotificationAction
//      (mirroring the existing pending-user approve/reject toasts).
//
//   2. Connectivity changes — when an active link flips (peer goes
//      offline / comes back / gets locked / falls out of date), the
//      server pushes a federation_link_state event and we toast it, so
//      admins learn fast without staring at the panel.
//
// Both arrive via the `federation-event` window bus (App.jsx forwards the
// server's SSE federation_* events there), keeping this decoupled.

import { useEffect, useRef } from "react";
import { t } from "../../../i18n";
import { api } from "../../../utils/api";
import { useNotifications } from "../../notifications/NotificationProvider.jsx";

function hostOf(url) {
  return String(url || "").replace(/^https?:\/\//i, "");
}

export default function FederationInviteWatcher({ token }) {
  const { notify } = useNotifications();
  const seen = useRef(new Set());
  // Collapse duplicate connectivity toasts (e.g. two links to the same
  // peer, or a re-delivered event) within a short window.
  const stateSeen = useRef(new Map());

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;

    const raiseRequest = (linkId, peerBaseUrl, peerLabel) => {
      if (linkId && seen.current.has(linkId)) return;
      if (linkId) seen.current.add(linkId);
      const who = peerLabel || hostOf(peerBaseUrl);
      console.info("[federation] pairing request received:", {
        linkId,
        peer: peerBaseUrl,
      });
      notify({
        type: "toast",
        variant: "info",
        title: t("fedInviteReceivedTitle"),
        message: t("fedInviteReceived").replace("{peer}", who),
        // Stay until the admin decides (or dismisses) — a pairing
        // request shouldn't auto-vanish like a transient toast.
        persistent: true,
        dismissible: true,
        actionLayout: "below",
        actions: [
          { label: t("fedAccept"), kind: "federation_accept", linkId },
          { label: t("fedRefuse"), kind: "federation_refuse", linkId },
        ],
      });
    };

    // Durable catch-up: anything already pending when we sign in.
    (async () => {
      try {
        const data = await api("/admin/federation/links", { token });
        if (cancelled) return;
        const pending = (data?.links || []).filter(
          (l) => l.status === "incoming_pending",
        );
        console.info(
          `[federation] ${pending.length} pending pairing request(s) at login`,
        );
        for (const l of pending) raiseRequest(l.id, l.peerBaseUrl, l.peerLabel);
      } catch (e) {
        console.warn("[federation] could not load pending requests:", e?.message);
      }
    })();

    // A connectivity flip on an active link → a brief status toast.
    const announceState = (msg) => {
      const who = msg.peerLabel || hostOf(msg.peerBaseUrl);
      // Dedup: same peer + state within 8 s shows once (covers duplicate
      // links to one peer and any re-delivered event).
      const sig = `${who}|${msg.state}`;
      const now = Date.now();
      if ((stateSeen.current.get(sig) || 0) > now - 8000) return;
      stateSeen.current.set(sig, now);
      const base = { type: "toast", title: t("fedConnTitle") };
      if (msg.state === "offline") {
        notify({ ...base, variant: "warning", message: t("fedPeerOffline").replace("{peer}", who) });
      } else if (msg.state === "online" && msg.previousState === "offline") {
        notify({ ...base, variant: "success", message: t("fedPeerOnline").replace("{peer}", who) });
      } else if (msg.state === "locked") {
        notify({ ...base, variant: "warning", message: t("fedPeerLocked").replace("{peer}", who) });
      } else if (msg.state === "incompatible") {
        notify({ ...base, variant: "warning", message: t("fedPeerIncompatible").replace("{peer}", who) });
      }
      console.info(
        `[federation] state change: ${who} ${msg.previousState} → ${msg.state}`,
      );
    };

    // Live arrivals.
    const onEvent = (e) => {
      const msg = e?.detail;
      if (!msg) return;
      if (msg.type === "federation_invitation") {
        raiseRequest(msg.linkId, msg.peerBaseUrl, msg.peerLabel);
      } else if (msg.type === "federation_link_state") {
        announceState(msg);
      }
    };
    window.addEventListener("federation-event", onEvent);

    return () => {
      cancelled = true;
      window.removeEventListener("federation-event", onEvent);
    };
  }, [token, notify]);

  return null;
}
