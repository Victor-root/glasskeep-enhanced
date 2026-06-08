// src/hooks/useFederation.js
//
// Data + actions for the Federation admin section. Owns the list of
// links, the pairing actions, light polling while the section is open,
// and a subscription to the `federation-event` window bus (App.jsx
// forwards the server's SSE federation_* events there) so the panel
// refreshes the instant a peer accepts, an invitation arrives, etc.
//
// `localBaseUrl` is simply window.location.origin — the public address
// the admin's browser is currently reaching this server at. We hand it
// to the server when inviting/accepting so it can advertise itself to
// the peer without guessing its own URL behind a reverse proxy.

import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../utils/api";

const POLL_INTERVAL_MS = 12000;

export function useFederation({ token, enabled = false } = {}) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const inFlight = useRef(false);

  const localBaseUrl =
    typeof window !== "undefined" && window.location ? window.location.origin : "";

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!token) return;
      if (inFlight.current) return;
      inFlight.current = true;
      if (!silent) setLoading(true);
      try {
        const data = await api("/admin/federation/links", { token });
        setLinks(Array.isArray(data?.links) ? data.links : []);
        setError(null);
        setLoaded(true);
      } catch (e) {
        setError(e?.message || "error");
      } finally {
        inFlight.current = false;
        if (!silent) setLoading(false);
      }
    },
    [token],
  );

  // Run one mutating action, then refresh. Returns the parsed response
  // (or throws) so callers can surface a precise toast.
  const run = useCallback(
    async (id, fn) => {
      setBusyId(id ?? "__global__");
      try {
        const res = await fn();
        await load({ silent: true });
        return res;
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const invite = useCallback(
    ({ peerBaseUrl, label }) =>
      run(null, () =>
        api("/admin/federation/invite", {
          method: "POST",
          token,
          body: { peerBaseUrl, localBaseUrl, label },
        }),
      ),
    [run, token, localBaseUrl],
  );

  const accept = useCallback(
    (id, { label } = {}) =>
      run(id, () =>
        api(`/admin/federation/links/${id}/accept`, {
          method: "POST",
          token,
          body: { localBaseUrl, label },
        }),
      ),
    [run, token, localBaseUrl],
  );

  const refuse = useCallback(
    (id) =>
      run(id, () =>
        api(`/admin/federation/links/${id}/refuse`, { method: "POST", token }),
      ),
    [run, token],
  );

  const updateAddress = useCallback(
    (id, peerBaseUrl) =>
      run(id, () =>
        api(`/admin/federation/links/${id}/address`, {
          method: "POST",
          token,
          body: { peerBaseUrl },
        }),
      ),
    [run, token],
  );

  const rename = useCallback(
    (id, label) =>
      run(id, () =>
        api(`/admin/federation/links/${id}`, {
          method: "PATCH",
          token,
          body: { label },
        }),
      ),
    [run, token],
  );

  const unpair = useCallback(
    (id) =>
      run(id, () =>
        api(`/admin/federation/links/${id}`, { method: "DELETE", token }),
      ),
    [run, token],
  );

  const recheck = useCallback(
    (id) =>
      run(id, () =>
        api(`/admin/federation/links/${id}/recheck`, {
          method: "POST",
          token,
          // a recheck awaits a network round trip on the server
          timeoutMs: 15000,
        }),
      ),
    [run, token],
  );

  // Initial load + light polling while the section is open.
  useEffect(() => {
    if (!enabled || !token) return undefined;
    load();
    const id = setInterval(() => load({ silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, token, load]);

  // Live refresh from the SSE bus, regardless of polling.
  useEffect(() => {
    if (!token) return undefined;
    const onEvent = () => load({ silent: true });
    window.addEventListener("federation-event", onEvent);
    return () => window.removeEventListener("federation-event", onEvent);
  }, [token, load]);

  const incoming = links.filter((l) => l.status === "incoming_pending");

  return {
    links,
    incoming,
    loading,
    loaded,
    error,
    busyId,
    localBaseUrl,
    load,
    invite,
    accept,
    refuse,
    updateAddress,
    rename,
    unpair,
    recheck,
  };
}
