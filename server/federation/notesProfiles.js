// server/federation/notesProfiles.js
//
// Keeping the shadow stand-ins of federated notes (see
// federation/notes.js) in step with the display profile (name, avatar,
// address) of the people they stand for, in both directions.

const PROFILE_PATH = "/api/federation/profile";

function createProfileSync({ q, store, peer, deps, log }) {
  // ── Inbound: a peer's user changed their display profile (name/avatar) ─
  // Refresh every local shadow stand-in for that user on THIS link so their
  // new avatar/name shows on already-shared notes at once, without waiting
  // for a note edit. Scoped to the calling link (a shadow's federated_origin
  // is "<linkId>|<ref>"), so a peer can only ever touch the stand-ins it is
  // the origin of. Touches only the `users` row, so it works while locked.
  function applyRemoteProfile({ linkId, ref, uid, name, avatarUrl, previousRef }) {
    const link = store.getById(linkId);
    if (!link) return { ok: false, error: "unknown_link" };
    // The remote user changed their address. Cross-server identity IS the
    // address (a stand-in is keyed "<linkId>|<their address>"), so leaving
    // the old key in place strands them: every later message the authority
    // sends about them (access changes, unshares, departures) carries the
    // new address and matches nothing. Re-point the row instead, which
    // keeps their notes, their access and their history intact.
    if (previousRef && ref && previousRef !== ref) {
      const stale = q.getShadowByOrigin.get(`${linkId}|${previousRef}`);
      if (stale && !q.getShadowByOrigin.get(`${linkId}|${ref}`)) {
        const origin = `${linkId}|${ref}`;
        try {
          try {
            q.rekeyShadow.run(origin, `${ref}@${peer.hostOf(link.peer_base_url)}`, stale.id);
          } catch {
            // Same collision fallback ensureShadowUser uses: an address
            // that cannot clash with a real account.
            q.rekeyShadow.run(origin, `${origin}@federated.invalid`, stale.id);
          }
          // Mirrors we hold of that user's notes point at them by address too.
          q.renameOwnerRef.run(ref, linkId, previousRef);
        } catch (e) {
          log.warn?.("[federation/notes] rekey stand-in:", e?.message);
        }
      }
    }
    // A stand-in may be keyed by the participant's clean ref (an owner or a
    // direct recipient) or by the home server's uid for them (a third-server
    // roster stand-in); try both so the refresh lands either way.
    const origins = [];
    if (ref) origins.push(`${linkId}|${ref}`);
    if (uid && uid !== ref) origins.push(`${linkId}|${uid}`);
    const touched = [];
    for (const origin of origins) {
      const shadow = q.getShadowByOrigin.get(origin);
      if (!shadow) continue;
      const nextName = name || shadow.name;
      // avatarUrl is sent as a string (new image) or null (cleared);
      // undefined means "unknown" and leaves the stored value untouched.
      const nextAvatar = avatarUrl === undefined ? shadow.avatar_url : (avatarUrl || null);
      if (nextName !== shadow.name || nextAvatar !== shadow.avatar_url) {
        try { q.updateShadow.run(nextName, nextAvatar, shadow.id); } catch { /* best-effort */ }
      }
      touched.push(shadow.id);
    }
    if (touched.length === 0) return { ok: true };
    // Repaint every note these stand-ins appear on so open footers /
    // collaborator lists re-fetch and show the new avatar immediately.
    try {
      const seen = new Set();
      for (const sid of touched) {
        for (const row of q.notesForUser.all(sid, sid)) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          try { deps.broadcastNoteUpdated?.(row.id); } catch { /* per-note best-effort */ }
        }
      }
    } catch { /* ignore */ }
    return { ok: true };
  }

  // ── Outbound: tell every paired peer OUR user changed their profile ──
  // Fire-and-forget; a peer that's momentarily down just misses this live
  // refresh and re-learns the avatar on the next share. `ref` is our user's
  // identity as the peers know them (email||name) and `uid` our local key
  // for them, so the peer can match a stand-in keyed either way.
  // `previousRef` is set only when the address itself changed, and is what
  // lets the peer find the stand-in it still has under the old one.
  function broadcastProfileToPeers({ ref, uid, name, avatarUrl, previousRef }) {
    if (!ref && !uid) return;
    let links;
    try { links = store.listActive(); } catch { return; }
    for (const link of links) {
      Promise.resolve()
        .then(() =>
          peer.postSigned(link, PROFILE_PATH, {
            linkId: link.id,
            ref: ref || null,
            uid: uid || null,
            name: name || null,
            avatar_url: avatarUrl ?? null,
            previousRef: previousRef || null,
          }),
        )
        .catch((e) => log.warn?.("[federation/notes] profile push:", e?.message));
    }
  }

  // ── Reconnect heal: push all local profiles to a single link ────────
  // Called when a peer that was offline comes back. Sends every real
  // local user's current name + avatar so the peer's shadow stand-ins
  // catch up on any changes that were missed while it was down.
  // Scoped to ONE link so we don't spam every peer on each reconnect.
  function pushProfilesToLink(link) {
    if (!link) return;
    let users;
    try { users = q.allRealUsers.all(); } catch { return; }
    for (const u of users) {
      const ref = u.email || u.name;
      if (!ref) continue;
      Promise.resolve()
        .then(() =>
          peer.postSigned(link, PROFILE_PATH, {
            linkId: link.id,
            ref,
            uid: `local:${u.id}`,
            name: u.name || null,
            avatar_url: u.avatar_url ?? null,
          }),
        )
        .catch((e) => log.warn?.("[federation/notes] profile reconnect:", e?.message));
    }
  }

  return { applyRemoteProfile, broadcastProfileToPeers, pushProfilesToLink };
}

module.exports = { createProfileSync };
