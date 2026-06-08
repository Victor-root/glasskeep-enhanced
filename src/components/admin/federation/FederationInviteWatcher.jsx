// src/components/admin/federation/FederationInviteWatcher.jsx
//
// A headless (renders nothing) admin-only watcher that makes incoming
// pairing requests impossible to miss WITHOUT having to open the admin
// panel:
//
//   - on mount / login it fetches the current links once and, if any
//     invitation is already waiting, raises a toast. This is the durable
//     half: an invitation that arrived while this admin was offline is
//     still surfaced the next time they sign in.
//   - it then listens to the `federation-event` window bus (App.jsx
//     forwards the server's SSE federation_* events there) and toasts
//     live the moment a new invitation lands.
//
// All it needs from the app is the auth token and showToast, so it stays
// completely decoupled from the rest of App.jsx.

import { useEffect, useRef } from "react";
import { t } from "../../../i18n";
import { api } from "../../../utils/api";

export default function FederationInviteWatcher({ token, showToast }) {
  const seen = useRef(new Set());

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;

    const toastInvite = (peer) => {
      const where = peer ? String(peer).replace(/^https?:\/\//i, "") : "";
      showToast?.(t("fedInviteReceived").replace("{peer}", where), "info");
    };

    // Durable catch-up: anything already pending when we sign in.
    (async () => {
      try {
        const data = await api("/admin/federation/links", { token });
        if (cancelled) return;
        const pending = (data?.links || []).filter(
          (l) => l.status === "incoming_pending",
        );
        for (const l of pending) seen.current.add(l.id);
        if (pending.length === 1) {
          toastInvite(pending[0].peerBaseUrl);
        } else if (pending.length > 1) {
          showToast?.(
            t("fedInvitesPending").replace("{count}", String(pending.length)),
            "info",
          );
        }
      } catch {
        /* best-effort: the panel still lists invitations */
      }
    })();

    // Live arrivals.
    const onEvent = (e) => {
      const msg = e?.detail;
      if (!msg || msg.type !== "federation_invitation") return;
      if (msg.linkId && seen.current.has(msg.linkId)) return;
      if (msg.linkId) seen.current.add(msg.linkId);
      toastInvite(msg.peerBaseUrl);
    };
    window.addEventListener("federation-event", onEvent);

    return () => {
      cancelled = true;
      window.removeEventListener("federation-event", onEvent);
    };
  }, [token, showToast]);

  return null;
}
