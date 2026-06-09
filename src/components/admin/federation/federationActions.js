// src/components/admin/federation/federationActions.js
//
// Thin API wrappers for the federation actions that can be triggered
// from a notification toast (Accept / Decline a pairing request). Kept
// out of App.jsx so its notification dispatcher only does wiring —
// branch on the action kind and call one of these.

import { api } from "../../../utils/api";

// localBaseUrl defaults to this server's public origin (the address the
// peer should reach us at), exactly like the admin panel's accept flow.
export function acceptFederationLink({ token, linkId, localBaseUrl }) {
  return api(`/admin/federation/links/${linkId}/accept`, {
    method: "POST",
    token,
    body: {
      localBaseUrl:
        localBaseUrl ||
        (typeof window !== "undefined" ? window.location.origin : ""),
    },
  });
}

export function refuseFederationLink({ token, linkId }) {
  return api(`/admin/federation/links/${linkId}/refuse`, {
    method: "POST",
    token,
  });
}
