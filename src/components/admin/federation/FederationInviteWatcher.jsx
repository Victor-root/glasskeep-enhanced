// src/components/admin/federation/FederationInviteWatcher.jsx
//
// A headless (renders nothing) admin-only watcher that surfaces incoming
// pairing requests as ACTIONABLE notifications — the admin can Accept or
// Decline straight from the toast, without opening the admin panel (the
// panel keeps its own accept/decline too). It works in two ways:
//
//   - durable catch-up: on mount / login it fetches the current links
//     once and raises a request notification for anything already
//     waiting — so an invitation that arrived while this admin was
//     offline is still actionable the next time they sign in.
//   - live: it listens to the `federation-event` window bus (App.jsx
//     forwards the server's SSE federation_* events there) and raises
//     the notification the moment a new invitation lands.
//
// The Accept / Decline buttons carry a `kind` + `linkId`; the actual API
// call is dispatched centrally by App.jsx's handleNotificationAction
// (mirroring the existing pending-user approve/reject toasts), keeping
// this component decoupled.

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

    // Live arrivals.
    const onEvent = (e) => {
      const msg = e?.detail;
      if (!msg || msg.type !== "federation_invitation") return;
      raiseRequest(msg.linkId, msg.peerBaseUrl, msg.peerLabel);
    };
    window.addEventListener("federation-event", onEvent);

    return () => {
      cancelled = true;
      window.removeEventListener("federation-event", onEvent);
    };
  }, [token, notify]);

  return null;
}
