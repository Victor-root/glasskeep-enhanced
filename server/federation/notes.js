// server/federation/notes.js
//
// Note-level federation: sharing a note with a user on a PAIRED peer
// server, and keeping the two copies in sync.
//
// MODEL (primary-replica, authority = the owner's server)
//   - The note's canonical copy lives on its owner's server ("home").
//   - The peer keeps a local mirror so its user sees the note and can
//     edit it. The mirror note is owned by a non-loginable "shadow user"
//     standing in for the remote owner; the real local user is added as
//     a collaborator — so ALL the existing collaboration machinery
//     (lists, permissions, per-user tags/positions, notifications) keeps
//     working unchanged on both sides.
//
// SYNC — deliberately NOT hooked into the hot note write path. Each
// server's federation tick pushes any federated note whose
// client_updated_at moved since we last pushed it to the peer's
// /api/federation/notes/apply, which applies it under the SAME
// last-write-wins rule the rest of the app uses. This keeps normal note
// editing completely untouched, makes the sync self-healing across
// reconnects (a push that failed while the peer was down simply retries
// on the next tick), and avoids any echo loop (an applied incoming write
// updates last_pushed_cua so it is never bounced back).
//
// ENCRYPTION — federated note content travels as plaintext over the
// verified-TLS link and is re-encrypted on each side under that side's
// own key, via the host app's encryption-aware write helpers (passed in
// as deps). Nothing decryptable to the peer's key ever leaves a server.
//
// This file wires the pieces together and handles the share itself; the
// rest lives beside it: notesSchema.js (storage), notesParticipants.js
// (shadow users and the roster), notesSync.js (pushes), notesProfiles.js
// (names and avatars) and notesTeardown.js (how a share ends).

const protocol = require("./protocol");
const { createNoteFederationQueries } = require("./notesSchema");
const { createNoteParticipants } = require("./notesParticipants");
const { contentFromNote, createNoteSync } = require("./notesSync");
const { createProfileSync } = require("./notesProfiles");
const { createNoteTeardown } = require("./notesTeardown");

const CONTENT_FIELDS = ["type", "title", "content", "items_json", "images_json", "color", "timestamp"];

function createNoteFederation(ctx) {
  const { db, store, peer, deps, log = console } = ctx;
  const q = createNoteFederationQueries(db, log);
  const shared = { q, store, peer, deps, log };
  const { findRealUser, ensureShadowUser, applyRoster, pushLeave } = createNoteParticipants(shared);
  const { reconcileMapping, onNoteChangedLocally, onParticipantsChangedLocally } = createNoteSync(shared);
  const { applyRemoteProfile, broadcastProfileToPeers, pushProfilesToLink } = createProfileSync(shared);

  // ── Helpers ─────────────────────────────────────────────────────────
  function activeLinkForHost(host) {
    return store
      .listActive()
      .find((l) => peer.hostOf(l.peer_base_url) === host) || null;
  }

  // A shadow's federated_origin is "<linkId>|<their ref on the peer>".
  function splitOrigin(shadow) {
    const origin = shadow?.federated_origin || "";
    const sep = origin.indexOf("|");
    if (sep < 0) return null;
    return { linkId: origin.slice(0, sep), ref: origin.slice(sep + 1) };
  }

  function unreachable(e) {
    return peer.tlsAwareMessage ? peer.tlsAwareMessage(e) : "unreachable";
  }

  const {
    handleIncomingRemove,
    handleIncomingUnshareRecipient,
    onLinkRemoved,
    sweepOrphanedMappings,
    markShareEnding,
    onRemoteRecipientRemoved,
  } = createNoteTeardown({ ...shared, findRealUser, splitOrigin, unreachable, onNoteChangedLocally });

  // Seed a collaborator's per-user position so a freshly shared note
  // lands at the top of their list (mirrors the local share flow).
  function seedPosition(noteId, userId) {
    try {
      const { max_pos } = deps.getMaxUserEffectivePosition.get(userId, userId, userId, userId);
      deps.upsertUserPosition.run({
        note_id: noteId,
        user_id: userId,
        position: (typeof max_pos === "number" ? max_pos : 0) + 1,
        pinned: 0,
      });
    } catch (e) {
      log.warn?.("[federation/notes] seedPosition:", e?.message);
    }
  }

  // ── Outbound: share a local note with a remote user ─────────────────
  // Returns { ok, error?, collaborator? }. Called by the host's
  // /collaborate route when the target looks like user@peer-host.
  async function shareWithRemote({ note, owner, targetRef, peerHost, canWrite = 1 }) {
    const link = activeLinkForHost(peerHost);
    if (!link) return { ok: false, error: "peer_not_paired" };

    let resp;
    try {
      resp = await peer.postSigned(link, "/api/federation/notes/share", {
        linkId: link.id,
        targetRef,                         // who on the peer to share with
        ownerRef: owner.email || owner.name, // who we are (the note owner)
        ownerName: owner.name || owner.email,
        ownerAvatar: owner.avatar_url || null, // so the peer shows our avatar
        canWrite: canWrite ? 1 : 0,        // read-only vs read-write share
        note: contentFromNote(note),
        roster: deps.getNoteRoster?.(note.id, owner.id) || null,
      });
    } catch (e) {
      return { ok: false, error: unreachable(e) };
    }
    if (!resp.ok || !resp.json || resp.json.ok !== true) {
      // A body the peer's reverse proxy refuses (see pushNoteContent in notesSync.js): worth
      // naming, because "http 413" sends the owner looking at GlassKeep when
      // the limit is one hop in front of it.
      if (resp.status === 413) return { ok: false, error: "payload_too_large" };
      return { ok: false, error: resp.json?.error || `http ${resp.status}` };
    }

    // The peer accepted and told us the matched user's name + avatar.
    const remote = resp.json.user || {};
    const shadow = ensureShadowUser(
      link.id,
      targetRef,
      remote.name || targetRef,
      peerHost,
      remote.avatar_url ?? null,
    );
    try {
      deps.addCollaborator.run(note.id, shadow.id, owner.id, deps.nowISO());
    } catch (e) {
      if (e.code !== "SQLITE_CONSTRAINT_UNIQUE") throw e;
    }
    // Mirror the chosen access onto our shadow collaborator row so the
    // owner-side read-only enforcement + UI reflect it from the start.
    if (canWrite === 0) {
      try { deps.setCollaboratorCanWrite.run(0, note.id, shadow.id); } catch { /* best-effort */ }
    }
    q.insertMapping.run({
      note_id: note.id,
      link_id: link.id,
      role: "home",
      remote_owner_ref: null,
      last_pushed_cua: note.client_updated_at || null,
      created_at: deps.nowISO(),
    });
    return {
      ok: true,
      collaborator: {
        id: shadow.id,
        name: shadow.name,
        email: shadow.email,
        serverLabel: link.peer_label || peer.hostOf(link.peer_base_url),
      },
    };
  }

  // ── Inbound: a peer shares a note with one of our users ─────────────
  function handleIncomingShare({ linkId, targetRef, ownerRef, ownerName, ownerAvatar, note, canWrite = 1, roster = null }) {
    // Can't read/write encrypted note content while this instance is
    // locked. Tell the peer to retry once we're unlocked.
    if (deps.isLocked?.()) return { ok: false, error: "locked" };
    const link = store.getById(linkId);
    if (!link || link.status !== "active") return { ok: false, error: "unknown_link" };
    const peerHost = peer.hostOf(link.peer_base_url);

    // A share may only ever CREATE a mirror, or refresh the one this same
    // link already owns. The peer picks the id, so without this check it
    // could name any note that already lives here — one never shared with
    // it, or one whose share was revoked (it still remembers the id) — and
    // have it adopted as its mirror. From then on every local edit would be
    // pushed to that peer, and the note would go read-only for its real
    // owner whenever that peer went down. Checked before anything is
    // written, so a refused share leaves no trace.
    const existing = deps.getNoteById.get(note.id);
    if (existing && q.getMappingForLink.get(note.id, linkId)?.role !== "mirror") {
      return { ok: false, error: "note_id_conflict" };
    }

    // Resolve the local recipient. Real accounts only — never a shadow row,
    // even one that happens to share a name with the target.
    const target = findRealUser(targetRef);
    if (!target) {
      return { ok: false, error: "user_not_found" };
    }

    // The remote owner becomes a local shadow user that OWNS the mirror.
    const shadowOwner = ensureShadowUser(linkId, ownerRef, ownerName, peerHost, ownerAvatar);
    // Badge the owner with OUR name for the home link, authoritatively. This
    // also heals any stale label left on the owner row by older versions
    // (applyRoster skips owners, so it would otherwise never be corrected).
    try {
      const homeLabel = link.peer_label || peer.hostOf(link.peer_base_url);
      q.setShadowServerLabel.run(homeLabel, shadowOwner.id);
    } catch { /* best-effort */ }

    const cua = note.client_updated_at || deps.nowISO();
    const row = {
      id: note.id,
      user_id: shadowOwner.id,
      type: note.type || "text",
      title: String(note.title || ""),
      content: note.type === "checklist" ? "" : String(note.content || ""),
      items_json: typeof note.items_json === "string" ? note.items_json : "[]",
      tags_json: "[]",
      images_json: typeof note.images_json === "string" ? note.images_json : "[]",
      color: note.color || "default",
      pinned: 0,
      position: Date.now(),
      timestamp: note.timestamp || deps.nowISO(),
      client_updated_at: cua,
    };

    if (!existing) {
      deps.runInsertNote(row);
    } else {
      // Already mirrored — fold in via LWW like any other update.
      if (deps.isNewerOrEqual(deps.parseIsoTimestamp(cua)?.ms, existing.client_updated_at)) {
        deps.runUpdateNoteFullCollab({ ...row, position: existing.position }, shadowOwner.id);
      }
    }

    try {
      deps.addCollaborator.run(note.id, target.id, shadowOwner.id, deps.nowISO());
      seedPosition(note.id, target.id);
      // Honour the owner's chosen access: a read-only recipient can open
      // the mirror but not edit it (enforced locally like any read-only
      // collaborator).
      if (canWrite === 0) deps.setCollaboratorCanWrite.run(0, note.id, target.id);
    } catch (e) {
      if (e.code !== "SQLITE_CONSTRAINT_UNIQUE") {
        log.warn?.("[federation/notes] addCollaborator:", e?.message);
      }
    }

    q.insertMapping.run({
      note_id: note.id,
      link_id: linkId,
      role: "mirror",
      remote_owner_ref: ownerRef,
      last_pushed_cua: cua, // we just received this exact version; don't echo it
      created_at: deps.nowISO(),
    });

    // Mirror the full participant roster so the recipient sees every active
    // collaborator from the start. applyRoster only manages display stand-ins
    // for remote participants; the recipient we just added is a real local
    // user and is left untouched, so no special injection is needed.
    try { applyRoster(note.id, linkId, roster); } catch (e) { log.warn?.("[federation/notes] share roster:", e?.message); }

    try {
      // Seed the mirror's "Modifié le … par …" from the real last-edit info the
      // owner sent, falling back to owner + now for older peers that omit it.
      const shareStampAt = note.last_edited_at || note.client_updated_at || deps.nowISO();
      deps.updateNoteWithEditor.run(shareStampAt, note.last_edited_by || ownerName || ownerRef, shareStampAt, note.id);
      deps.createShareNotification({
        recipientId: target.id,
        senderId: shadowOwner.id,
        senderName: ownerName || ownerRef || "",
        noteId: note.id,
        noteTitle: note.title || "",
        readOnly: canWrite === 0,
      });
      deps.broadcastNoteUpdated(note.id);
    } catch (e) {
      log.warn?.("[federation/notes] post-share:", e?.message);
    }
    return {
      ok: true,
      user: { name: target.name, email: target.email, avatar_url: target.avatar_url || null },
    };
  }

  // ── Inbound: a peer pushes an updated copy of a federated note ──────
  function handleIncomingApply({ linkId, note, roster = null }) {
    if (deps.isLocked?.()) return { ok: false, error: "locked" };
    const mapping = q.getMappingForLink.get(note.id, linkId);
    if (!mapping) return { ok: false, error: "unknown_note" };
    const existing = deps.getNoteById.get(note.id);
    if (!existing) return { ok: false, error: "unknown_note" };

    // Sync the participant roster first, regardless of the content LWW
    // outcome below — a collaborator can be added/removed without the note
    // body changing, and a mirror only ever receives the roster here.
    if (mapping.role === "mirror") {
      try { applyRoster(note.id, linkId, roster); } catch (e) { log.warn?.("[federation/notes] apply roster:", e?.message); }
    }

    // Defense-in-depth: when WE are the authority (home), an incoming edit
    // is made on behalf of a remote recipient. If every remote recipient on
    // this link is read-only, refuse it — a read-only collaborator must
    // never change the note even if their server tried to push it. (The
    // mirror already blocks them locally; this guards a misbehaving peer.)
    // ok:true so the peer stops retrying; its divergent copy reconciles on
    // our next authoritative push.
    if (mapping.role === "home" &&
        !q.hasWritableShadowCollab.get(note.id, `${linkId}|%`)) {
      return { ok: true, readOnly: true };
    }

    const incomingMs = deps.parseIsoTimestamp(note.client_updated_at)?.ms;
    if (!deps.isNewerOrEqual(incomingMs, existing.client_updated_at)) {
      return { ok: true, stale: true }; // our copy is newer; nothing to do
    }
    const row = {
      id: note.id,
      user_id: existing.user_id,
      type: note.type || existing.type,
      title: String(note.title ?? existing.title ?? ""),
      content: note.type === "checklist" ? "" : String(note.content ?? existing.content ?? ""),
      items_json: typeof note.items_json === "string" ? note.items_json : existing.items_json,
      tags_json: "[]",
      images_json: typeof note.images_json === "string" ? note.images_json : existing.images_json,
      color: note.color || existing.color,
      pinned: existing.pinned,
      position: existing.position,
      timestamp: note.timestamp || existing.timestamp,
      client_updated_at: note.client_updated_at,
    };
    deps.runUpdateNoteFullCollab(row, existing.user_id);
    // Carry the authoritative "last edited by / at" from the peer so our
    // mirror's "Modifié le … par …" reflects who actually made this edit on
    // the owning side — not whoever last touched our local copy. The content
    // UPDATE above never writes these columns. Older peers omit the fields, so
    // we skip in that case rather than wiping a good local stamp with nulls.
    try {
      if (note.last_edited_by != null || note.last_edited_at != null) {
        const stampAt = note.last_edited_at || note.client_updated_at || deps.nowISO();
        deps.updateNoteWithEditor.run(stampAt, note.last_edited_by ?? null, stampAt, note.id);
      }
    } catch (e) { log.warn?.("[federation/notes] editor stamp:", e?.message); }
    // Mark this exact version as "already in sync" for THIS peer so our own
    // tick never bounces it straight back (echo-loop guard). Other peers
    // keep their own last_pushed_cua and still receive the update.
    q.setPushed.run(note.client_updated_at, note.id, linkId);
    try {
      deps.broadcastNoteUpdated(note.id);
    } catch { /* SSE best-effort */ }
    return { ok: true };
  }

  // ── Tick: reconcile every federated note with its peer ──────────────
  // While locked we can't decrypt our own notes to push them; resume
  // automatically once unlocked.
  async function syncTick() {
    if (deps.isLocked?.()) return;
    sweepOrphanedMappings();
    let rows;
    try {
      rows = q.listAll.all();
    } catch {
      return;
    }
    for (const m of rows) {
      try {
        await reconcileMapping(m);
      } catch (e) {
        log.warn?.(`[federation/notes] reconcile ${m.note_id} failed:`, e?.message);
      }
    }
  }

  // ── Outbound: one of OUR users left a note we mirror ────────────────
  // The authority owns the participant list, so it is the only side that
  // can drop the stand-in representing this person. Nothing else tells it:
  // the home→mirror direction has its own message (unshareFromRemote), but
  // a recipient leaving on their own — or having their account deleted —
  // is invisible from over there, leaving a collaborator the owner cannot
  // get rid of and a mirror nobody can see still receiving pushes.
  function onLocalParticipantLeft(noteId, ref) {
    if (!ref) return;
    const m = q.getMirrorMapping.get(noteId);
    if (!m) return; // a note of ours, not a mirror: nobody to tell
    pushLeave(m.link_id, noteId, ref);
  }

  // ── Inbound: a peer tells us one of ITS users left our note ─────────
  // Scoped twice over: only a note that rides THIS link, and only a
  // stand-in that belongs to it — so a peer can drop its own participants
  // and nothing else. Dropping the last one leaves no shadow collaborator
  // on the link, which is exactly what homeShareRevoked already reads as
  // "this share is over", so the mirror teardown follows on its own.
  function handleIncomingLeave({ linkId, noteId, ref }) {
    const m = q.getMappingForLink.get(noteId, linkId);
    if (!m || m.role !== "home") return { ok: false, error: "unknown_note" };
    const shadow = ref ? q.getShadowByOrigin.get(`${linkId}|${ref}`) : null;
    if (!shadow) return { ok: true }; // never here, or already gone
    try {
      deps.removeCollaborator?.run(noteId, shadow.id);
      q.deleteUserTags.run(noteId, shadow.id);
      q.deleteUserPosition.run(noteId, shadow.id);
      deps.broadcastNoteUpdated?.(noteId);
    } catch (e) {
      log.warn?.("[federation/notes] apply leave:", e?.message);
      return { ok: false, error: "apply_failed" };
    }
    onNoteChangedLocally(noteId);
    return { ok: true };
  }

  // ── Outbound: tell the peer a remote collaborator's access changed ───
  // The owner toggled a federated recipient between read-only / read-write;
  // push it so their mirror copy flips immediately. `shadow` is our local
  // stand-in for that recipient (federated_origin = `${linkId}|${ref}`).
  async function setRemotePermission({ note, shadow, canWrite }) {
    const origin = splitOrigin(shadow);
    if (!origin) return { ok: false, error: "not_federated" };
    const link = store.getById(origin.linkId);
    if (!link || link.status !== "active") return { ok: false, error: "peer_not_paired" };
    try {
      const resp = await peer.postSigned(link, "/api/federation/notes/permission", {
        linkId: link.id, noteId: note.id, targetRef: origin.ref, canWrite: canWrite ? 1 : 0,
      });
      return { ok: !!(resp.ok && resp.json && resp.json.ok === true) };
    } catch (e) {
      return { ok: false, error: unreachable(e) };
    }
  }

  // ── Inbound: the peer changed a recipient's access on a note we mirror ─
  // Flip the local recipient's read/write bit; no note content is touched,
  // so this works even while the instance is locked.
  function handleIncomingPermission({ linkId, noteId, targetRef, canWrite }) {
    const m = q.getMappingForLink.get(noteId, linkId);
    if (!m || m.role !== "mirror") {
      return { ok: false, error: "unknown_note" };
    }
    const target = findRealUser(targetRef);
    if (!target) return { ok: false, error: "user_not_found" };
    try {
      deps.setCollaboratorCanWrite.run(canWrite ? 1 : 0, noteId, target.id);
      // Re-broadcast for any non-open surfaces, plus a dedicated access
      // event that flips the recipient's OPEN editor instantly (the generic
      // patch is suppressed while they hold a local lease / pending edits).
      deps.broadcastNoteUpdated(noteId);
      deps.sendEventToUser?.(target.id, {
        type: "note_access_changed",
        noteId,
        access: canWrite ? "write" : "read",
      });
    } catch (e) {
      log.warn?.("[federation/notes] apply permission:", e?.message);
      return { ok: false, error: "apply_failed" };
    }
    return { ok: true };
  }

  // A federated MIRROR note is read-only while its home link can't be
  // trusted to accept the write (offline / locked / out of date). The
  // host write path consults this so an edit is refused server-side, and
  // the client shows the matching banner.
  function isReadOnly(noteId) {
    const m = q.getMirrorMapping.get(noteId);
    if (!m) return false;
    const link = store.getById(m.link_id);
    return !link || !protocol.isLinkWritable(link);
  }

  return {
    handleIncomingShare,
    handleIncomingApply,
    handleIncomingRemove,
    handleIncomingPermission,
    handleIncomingUnshareRecipient,
    handleIncomingLeave,
    onLocalParticipantLeft,
    onLinkRemoved,
    markShareEnding,
    onRemoteRecipientRemoved,
    applyRemoteProfile,
    broadcastProfileToPeers,
    pushProfilesToLink,
    shareWithRemote,
    setRemotePermission,
    syncTick,
    onNoteChangedLocally,
    onParticipantsChangedLocally,
    // A link's connectivity flipped → nudge every note riding it so each
    // participant's OPEN copy re-fetches and reflects the new state at
    // once (e.g. authority went offline → mirror goes read-only now, not
    // only once the user tries to type).
    onLinkStateChanged(linkId) {
      try {
        for (const m of q.listByLink.all(linkId)) {
          try {
            deps.broadcastNoteUpdated?.(m.note_id);
          } catch { /* per-note best-effort */ }
        }
      } catch { /* ignore */ }
    },
    isReadOnly,
    // Federation status of a note, for serialization to the client: the
    // role, the live link state, whether it's currently read-only (a
    // MIRROR whose authority link isn't writable), and the peer's name —
    // everything the note UI needs to show the right banner.
    noteFederationInfo(noteId) {
      // A note is either a mirror (one home) or a home shared to >=1 peers.
      // Prefer the mirror mapping (drives the read-only banner); otherwise
      // any home mapping reflects that the note is federated outward.
      const m = q.getMirrorMapping.get(noteId) || q.getAnyMapping.get(noteId);
      if (!m) return null;
      const link = store.getById(m.link_id);
      const writable = link ? protocol.isLinkWritable(link) : false;
      return {
        role: m.role,
        state: protocol.deriveLinkState(link),
        readOnly: m.role === "mirror" && !writable,
        peerLabel: link ? link.peer_label || peer.hostOf(link.peer_base_url) : null,
      };
    },
    isPeerHost: (host) => !!activeLinkForHost(host),
    getMapping: (noteId) => q.getAnyMapping.get(noteId),
    // Friendly name of the server a shadow user belongs to, for badges.
    // Resolves by the (stable) link id embedded in federated_origin, and
    // falls back to matching an active link by host — so a re-paired link
    // (new id) still resolves the name. `hostHint` is the peer host, e.g.
    // recovered from the shadow's synthetic email.
    serverLabelForOrigin(federatedOrigin, hostHint) {
      if (!federatedOrigin) return null;
      const linkId = String(federatedOrigin).split("|")[0];
      let link = store.getById(linkId);
      if (!link && hostHint) {
        link =
          store.listAll().find((l) => peer.hostOf(l.peer_base_url) === hostHint) || null;
      }
      if (!link) return null;
      return link.peer_label || peer.hostOf(link.peer_base_url);
    },
  };
}

module.exports = { createNoteFederation, CONTENT_FIELDS };
