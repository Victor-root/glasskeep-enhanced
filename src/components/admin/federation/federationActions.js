// src/components/admin/federation/federationActions.js
//
// Thin API wrappers for the federation actions that can be triggered
// from a notification toast (Accept / Decline a pairing request). Kept
// out of App.jsx so its notification dispatcher only does wiring —
// branch on the action kind and call one of these.

import { api } from "../../../utils/api";
import { t } from "../../../i18n";

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

// Maps a federation action's server error code (api() throws it as
// err.message -- see utils/api.js) to a localized, honest reason. Shared
// by every admin-triggered federation action (the invite form here in
// the panel, and the accept/decline quick actions fired straight from a
// notification toast) so a failure says WHY instead of a generic
// "try again" that hides e.g. a missing self-name.
export function federationErrorMessage(err, fallbackKey = "fedActionFailed") {
  const code = err?.message || "";
  const map = {
    invalid_peer_url: "fedErrInvalidPeerUrl",
    invalid_local_url: "fedErrInvalidLocalUrl",
    cannot_pair_with_self: "fedErrSelf",
    already_linked_or_pending: "fedErrAlready",
    self_name_required: "fedSelfNameRequired",
    not_found: "fedErrLinkGone",
    not_pending: "fedErrNotPending",
  };
  return t(map[code] || fallbackKey);
}
