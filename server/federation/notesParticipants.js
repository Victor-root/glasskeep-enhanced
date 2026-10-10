// server/federation/notesParticipants.js
//
// Who takes part in a federated note, on each side of a link (see
// federation/notes.js): the non-loginable shadow users that stand in for
// remote participants, the mirror's copy of the authority's roster, and
// the notice a mirror sends when one of its own users leaves.

const crypto = require("crypto");

function createNoteParticipants({ q, store, peer, deps, log }) {
  // A real local account by the reference a peer knows it by (its email,
  // or its name). Never a shadow row, even one that shares the name.
  function findRealUser(ref) {
    return deps.getRealUserByEmail?.get(ref) || deps.getRealUserByName?.get(ref);
  }

  // Find-or-create the non-loginable shadow user that represents a remote
  // participant. `ref` is the participant's stable identity on the peer
  // (their email or username); the synthetic local email keeps the row
  // unique without ever colliding with a real account that could log in
  // (the login path refuses any row with federated_origin set).
  // `avatarUrl` (when provided) is carried over so the cross-server
  // collaborator shows their real avatar, and is refreshed on re-share.
  function ensureShadowUser(linkId, ref, displayName, peerHost, avatarUrl) {
    const origin = `${linkId}|${ref}`;
    const existing = q.getShadowByOrigin.get(origin);
    if (existing) {
      // Refresh the display name / avatar if they changed on the peer.
      const nextName = displayName || existing.name;
      const nextAvatar = avatarUrl !== undefined ? avatarUrl || null : existing.avatar_url;
      if (nextName !== existing.name || nextAvatar !== existing.avatar_url) {
        try {
          q.updateShadow.run(nextName, nextAvatar, existing.id);
        } catch { /* best-effort */ }
      }
      return q.getShadowByOrigin.get(origin);
    }
    const email = `${ref}@${peerHost}`;
    // An unusable password hash (random, not derived from any input) so
    // even if the login guard were bypassed the row could never match.
    const junk = crypto.randomBytes(24).toString("base64");
    try {
      q.insertShadow.run(displayName || ref, email, junk, deps.nowISO(), origin, avatarUrl || null);
    } catch {
      // email clash with an unrelated row → fall back to an origin-tagged
      // address that cannot collide.
      q.insertShadow.run(displayName || ref, `${origin}@federated.invalid`, junk, deps.nowISO(), origin, avatarUrl || null);
    }
    return q.getShadowByOrigin.get(origin);
  }

  // ── Mirror: reconcile the displayed participant list ────────────────
  // The home server (the authority) sends the full roster of a note's
  // participants alongside every share/apply. We mirror it locally as
  // display-only stand-ins so this peer's user sees EVERY active
  // collaborator: the owner, this server's own collaborators, and people
  // who live on a third server we aren't directly linked to. Edits still
  // hub through the home server; these rows are purely for visibility.
  //
  // Stand-ins are keyed under the home link (federated_origin
  // "<homeLinkId>|<ref>"), so they badge as "via the home server" and are
  // pruned here the moment the roster no longer lists them (someone left).
  // The owner is the note's user_id (not a collaborator row) and real
  // local users (this server's own recipients) are left untouched.
  function applyRoster(noteId, linkId, roster) {
    if (!Array.isArray(roster) || roster.length === 0) return;
    const link = store.getById(linkId);
    const peerHost = link ? peer.hostOf(link.peer_base_url) : "";
    // The mirror's own name for the home server, used to badge participants
    // who live on the home (the owner and home-local collaborators).
    const homeLabel = link ? (link.peer_label || peer.hostOf(link.peer_base_url)) : null;
    // Heal the shadow owner's badge to our name for the home link. applyRoster
    // skips owner entries, so this is where a stale label (left by older
    // versions where two same-named participants shared the owner row) gets
    // corrected on the next sync, no re-share required.
    try {
      const note = deps.getNoteById.get(noteId);
      const ownerRow = note ? deps.getUserById?.get(note.user_id) : null;
      if (ownerRow?.federated_origin && homeLabel) {
        q.setShadowServerLabel.run(homeLabel, ownerRow.id);
      }
    } catch { /* best-effort */ }
    // Origins of the display stand-ins the roster says should exist on this
    // link. We reconcile ONLY shadow stand-ins here, never real local users.
    // Real recipients are managed exclusively by share / unshare messages, so
    // a roster quirk (e.g. two people sharing a name) can never strip a real
    // collaborator and make their note vanish.
    const expectedShadowOrigins = new Set();
    for (const p of roster) {
      if (!p || !p.ref) continue;
      if (p.isOwner) continue; // owner is the mirror's note owner, not a collab row
      // Is this entry one of OUR OWN recipients (owned by the share /
      // unshare flow, so the display roster must leave it alone)? Decide it
      // from the uid, NEVER by matching the name or address against our
      // accounts: a roster entry's ref lives in whatever server that person
      // is on, and two independent servers can each have a "Victor", with
      // the same email address, even, since nothing is unique across
      // servers. Looking it up locally made us mistake the authority's
      // Victor for our own and silently drop them from the note.
      //
      // The authority represents someone living on OUR side of THIS link as
      // a shadow whose origin is `<thisLinkId>|<their ref here>`, and the
      // link id is the same on both ends (agreed once at pairing, see
      // federation/store.js). So that exact shape, and only it, means
      // "this person is ours". `local:<id>` means they live on the
      // authority, and any other link id means a third server; both of
      // those are remote to us and need a display stand-in.
      const isOneOfOurs = p.uid
        ? p.uid === `${linkId}|${p.ref}`
        // A peer too old to send uid gives us nothing better than the old
        // heuristic, still better than duplicating our own user's row.
        : !!findRealUser(p.ref);
      if (isOneOfOurs) {
        // WHO our own recipients are belongs to the share / unshare
        // messages, but WHAT THEY MAY DO is the authority's call, and the
        // direct permission push is fire-once: when it fails because this
        // server was down at the moment the owner flipped it, nothing else
        // ever corrected it and the user kept editing a note the owner had
        // set to read-only. The roster is re-pushed until it lands (see
        // onParticipantsChangedLocally in notesSync.js), so heal the access from here.
        //
        // Only on the precise uid path, and only when the entry actually
        // carries an access: on the legacy fallback above the match is
        // itself a name/address guess, and a wrong guess would change the
        // wrong person's access, while an older peer sending no access at
        // all must not silently demote everyone to read-only.
        // Only act on someone we can positively identify. An unresolvable
        // ref is ambiguous: the account may be gone, but it may equally
        // have just changed address, and cross-server identity IS the
        // address. Reading that as a departure would quietly revoke a
        // renamed user everywhere; deletions are reported explicitly by the
        // route that performs them instead.
        const mine = p.uid ? findRealUser(p.ref) : null;
        if (mine) {
          const collaborators = deps.getNoteCollaborators?.all(noteId) || [];
          if (!collaborators.some((c) => c.id === mine.id)) {
            // The authority still counts them in. Our notice never reached
            // it (it was down at the time, or the departure predates that
            // message existing): say it again. The roster is re-pushed
            // until it lands, so this is what makes a departure survive the
            // authority being unreachable.
            pushLeave(linkId, noteId, p.ref);
          } else if (p.canWrite != null) {
            // WHO our recipients are belongs to the share / unshare flow,
            // but WHAT THEY MAY DO is the authority's call, and the direct
            // permission push is fire-once: heal it from the roster, which
            // is retried until delivered.
            try {
              deps.setCollaboratorCanWrite.run(p.canWrite ? 1 : 0, noteId, mine.id);
            } catch { /* best-effort */ }
          }
        }
        continue;
      }
      // Remote participant → display stand-in. Key it by the participant's
      // globally-unique uid (not their name) so two different people who share
      // a name never collapse into one row, nor collide with the shadow owner.
      const key = p.uid || p.ref;
      const shadow = ensureShadowUser(linkId, key, p.name || p.ref, peerHost, p.avatar_url ?? null);
      expectedShadowOrigins.add(`${linkId}|${key}`);
      // Explicit badge: the authority's name for a third server, or the home
      // label for a home-local participant. Always set, so display never
      // depends on fragile origin-link resolution.
      try { q.setShadowServerLabel.run(p.serverLabel || homeLabel || null, shadow.id); } catch { /* best-effort */ }
      try {
        deps.addCollaborator.run(noteId, shadow.id, shadow.id, deps.nowISO());
      } catch (e) {
        if (e.code !== "SQLITE_CONSTRAINT_UNIQUE") throw e;
      }
      try { deps.setCollaboratorCanWrite.run(p.canWrite ? 1 : 0, noteId, shadow.id); } catch { /* best-effort */ }
    }
    // Prune ONLY shadow stand-ins on this link that are no longer in the
    // roster (e.g. a participant left, or a stale ref-keyed stand-in from an
    // older version). The shadow owner is the note's user_id, not a collab
    // row, so it is never returned here; real recipients are never touched.
    try {
      for (const row of q.listShadowCollabsForNote.all(noteId, `${linkId}|%`)) {
        if (!expectedShadowOrigins.has(row.federated_origin)) {
          deps.removeCollaborator?.run(noteId, row.id);
        }
      }
    } catch (e) {
      log.warn?.("[federation/notes] roster prune:", e?.message);
    }
  }

  // Tell the authority one of OUR users left a note we mirror (see
  // onLocalParticipantLeft in federation/notes.js).
  function pushLeave(linkId, noteId, ref) {
    const link = store.getById(linkId);
    if (!link || link.status !== "active") return;
    Promise.resolve()
      .then(() => peer.postSigned(link, "/api/federation/notes/leave", { linkId: link.id, noteId, ref }))
      .catch((e) => log.warn?.("[federation/notes] leave push:", e?.message));
  }

  return { findRealUser, ensureShadowUser, applyRoster, pushLeave };
}

module.exports = { createNoteParticipants };
