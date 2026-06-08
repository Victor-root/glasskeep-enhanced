// server/federation/protocol.js
//
// Cross-server collaboration ("federation") — protocol versioning and
// link-state derivation. This module is deliberately tiny and pure (no
// DB, no network) so both the route layer and the tests can reason
// about compatibility without side effects.
//
// WHY a dedicated protocol number, separate from the GlassKeep app
// version (package.json):
//
//   Two self-hosted servers are administered independently and almost
//   never update in lock-step. Requiring an identical *app* version
//   would break every shared note the moment one side installs an
//   unrelated bug-fix release. Instead the federation wire format has
//   its OWN integer version that only changes when the cross-server
//   exchange itself changes. As long as a GlassKeep update does not
//   touch federation, PROTOCOL_VERSION stays put and the two servers
//   keep talking — exactly the "it just keeps working" behaviour we
//   want. When a release DOES change the format we bump it; the two
//   sides then detect the mismatch during the health handshake and the
//   shared notes go read-only with a clear "the other server is not up
//   to date" message until the lagging side updates.
//
// Think of it as the shape of a power plug: a newer appliance is fine
// as long as the plug shape is unchanged; only redesigning the plug
// forces both ends to match again.

// What this build speaks on the wire.
const PROTOCOL_VERSION = 1;
// Oldest wire version this build still understands. Today it equals the
// current version (v1 is the first), but keeping it explicit means a
// future build can advertise e.g. { min: 1, current: 2 } and stay
// backward-compatible with a v1 peer during a staggered upgrade.
const PROTOCOL_MIN_SUPPORTED = 1;

// Negotiate the highest wire version both sides can speak. Each server
// advertises the inclusive range [min, current] it supports; the link
// is compatible when the two ranges overlap, and we then talk the
// highest version in common.
//
//   peerCurrent — the protocol version the peer speaks (its "current")
//   peerMin     — the oldest version the peer still understands; when a
//                 peer is too old to even send a range we fall back to
//                 treating its single advertised version as both ends.
function negotiateProtocol(peerCurrent, peerMin) {
  if (!Number.isInteger(peerCurrent)) {
    return { compatible: false, agreed: null };
  }
  const theirMin = Number.isInteger(peerMin) ? peerMin : peerCurrent;
  const low = Math.max(PROTOCOL_MIN_SUPPORTED, theirMin);
  const high = Math.min(PROTOCOL_VERSION, peerCurrent);
  if (low > high) return { compatible: false, agreed: null };
  return { compatible: true, agreed: high };
}

// Link lifecycle statuses persisted in federation_links.status.
const STATUS = Object.freeze({
  OUTGOING_PENDING: "outgoing_pending", // we invited, waiting for the peer admin to accept
  INCOMING_PENDING: "incoming_pending", // peer invited us, waiting for OUR admin to accept
  ACCEPTING: "accepting",               // our admin accepted, delivering the acceptance to the peer
  ACTIVE: "active",                     // paired and operational
  REFUSED: "refused",                   // an admin declined the invitation
  REVOKED: "revoked",                   // an admin unpaired the link
});

// The live, user-facing state of a link. Statuses other than "active"
// surface as-is (the UI shows pairing progress). An active link is
// refined by what the last health handshake learned about the peer, in
// priority order: unreachable first (nothing else can be trusted), then
// protocol mismatch (we literally can't speak), then locked (reachable
// but its at-rest encryption is still locked), otherwise it's healthy.
//
// This is the single source of truth behind the status pill shown both
// on a shared note and in the admin Federation panel — the whole point
// (per the design) is that nobody is ever left guessing WHY editing is
// blocked.
const LINK_STATE = Object.freeze({
  // pairing lifecycle
  OUTGOING_PENDING: "outgoing_pending",
  INCOMING_PENDING: "incoming_pending",
  ACCEPTING: "accepting",
  REFUSED: "refused",
  REVOKED: "revoked",
  // active-link health
  ONLINE: "online",
  OFFLINE: "offline",
  INCOMPATIBLE: "incompatible",
  LOCKED: "locked",
  UNKNOWN: "unknown", // active but never successfully health-checked yet
});

function deriveLinkState(link) {
  if (!link) return LINK_STATE.UNKNOWN;
  if (link.status !== STATUS.ACTIVE) return link.status;
  if (link.peer_reachable === 0) return LINK_STATE.OFFLINE;
  if (link.peer_reachable == null) return LINK_STATE.UNKNOWN;
  if (link.protocol_compatible === 0) return LINK_STATE.INCOMPATIBLE;
  if (link.peer_locked === 1) return LINK_STATE.LOCKED;
  return LINK_STATE.ONLINE;
}

// Whether shared content carried by this link may currently be edited.
// Only a fully ONLINE active link is writable; every other state means
// the authority cannot be trusted to accept the write right now, so the
// UI falls back to read-only with the matching explanation.
function isLinkWritable(link) {
  return deriveLinkState(link) === LINK_STATE.ONLINE;
}

module.exports = {
  PROTOCOL_VERSION,
  PROTOCOL_MIN_SUPPORTED,
  negotiateProtocol,
  STATUS,
  LINK_STATE,
  deriveLinkState,
  isLinkWritable,
};
