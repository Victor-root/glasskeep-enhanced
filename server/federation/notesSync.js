// server/federation/notesSync.js
//
// Pushing federated notes to their peers (see the SYNC section of
// federation/notes.js): one note's content and roster, the teardown of a
// share that ended, and the reconcile that picks between the two for a
// given (note, link) mapping.

// The note fields a peer receives, for a share as for every later push.
function contentFromNote(note) {
  return {
    id: note.id,
    type: note.type,
    title: note.title ?? "",
    content: note.content ?? "",
    items_json: note.items_json ?? "[]",
    images_json: note.images_json ?? "[]",
    color: note.color ?? "default",
    timestamp: note.timestamp,
    client_updated_at: note.client_updated_at,
    // Carry the "last edited by / at" so the peer's mirror shows who really
    // made the latest edit and when, instead of freezing on whoever last
    // touched their own local copy. Older peers simply ignore these fields.
    last_edited_by: note.last_edited_by ?? null,
    last_edited_at: note.last_edited_at ?? null,
  };
}

function createNoteSync({ q, store, peer, deps, log }) {
  // Push one note's current content to its peer (LWW on the other side).
  async function pushNoteContent(link, note) {
    const body = {
      linkId: link.id,
      note: contentFromNote(note),
      // Keep the peer's participant list in sync with ours (the authority).
      roster: deps.getNoteRoster?.(note.id, note.user_id) || null,
    };
    const resp = await peer.postSigned(link, "/api/federation/notes/apply", body);
    if (resp.ok && resp.json && resp.json.ok === true) {
      q.setPushed.run(note.client_updated_at, note.id, link.id);
      return true;
    }
    // 413 is the one failure here that will NEVER come good on its own: the
    // same bytes get refused every time, so the tick would re-send this note
    // on every pass, forever, in complete silence: the note simply never
    // arrives and the link stays green, because the health probe that keeps
    // it green is a few bytes. It is a reverse proxy in front of the peer
    // refusing the body, not GlassKeep (which accepts up to 160 MB): images
    // travel inline as base64, so one photo already dwarfs nginx's 1 MB
    // default. Say it once per attempt, naming the fix: this is what an
    // operator greps for when a note "just doesn't sync".
    if (resp.status === 413) {
      const kb = Math.round(JSON.stringify(body).length / 1024);
      log.warn?.(
        `[federation/notes] ${peer.hostOf(link.peer_base_url)} refused note ${note.id} ` +
        `as too large (HTTP 413, ~${kb} KB). This is its reverse proxy, not GlassKeep: ` +
        `raise client_max_body_size (nginx) or the equivalent, then it syncs on the next tick.`,
      );
    }
    return false;
  }

  // Tell the peer to tear down its mirror of a note we no longer share.
  // keepCopies carries the "…but leave each recipient their content"
  // intent recorded on the mapping (see the teardown column in notesSchema.js).
  async function pushRemoval(link, noteId, keepCopies = false) {
    const resp = await peer.postSigned(link, "/api/federation/notes/remove", { linkId: link.id, noteId, keepCopies });
    return !!(resp.ok && resp.json && resp.json.ok === true);
  }

  // Has a HOME note's share been revoked locally? (the note was deleted,
  // trashed, or the remote participant removed) → the mirror must go.
  // An explicitly recorded teardown always wins: it knows WHICH kind of
  // ending this is, where the checks below can only guess "destroy".
  function homeShareRevoked(m, note) {
    if (m.teardown) return true;
    if (!note) return true;
    if (note.trashed) return true;
    return !q.hasShadowCollab.get(m.note_id, `${m.link_id}|%`);
  }

  // Teardown pushes in flight, keyed by note|link. A single delete can
  // legitimately reach reconcile twice (the intent is recorded, then the
  // route broadcasts), and the tick can overlap either; without this the
  // same mirror gets torn down twice over the wire. Only the teardown
  // branch is guarded: a duplicate content push is already a no-op via
  // last_pushed_cua.
  const teardownsInFlight = new Set();

  async function reconcileMapping(m) {
    const link = store.getById(m.link_id);
    if (!link || link.status !== "active" || link.peer_reachable !== 1) return;
    const note = deps.getNoteById.get(m.note_id);

    // Revoked home share → remove this peer's mirror, then forget only
    // THIS link's mapping (other peers sharing the same note are untouched).
    // Until that push succeeds the mapping (and its teardown intent) stays
    // put, so an offline peer simply gets it on a later tick.
    if (m.role === "home" && homeShareRevoked(m, note)) {
      const key = `${m.note_id}|${m.link_id}`;
      if (teardownsInFlight.has(key)) return;
      teardownsInFlight.add(key);
      try {
        if (await pushRemoval(link, m.note_id, m.teardown === "keep_copies")) {
          q.deleteMappingForLink.run(m.note_id, m.link_id);
        }
      } finally {
        teardownsInFlight.delete(key);
      }
      return;
    }
    if (!note) return;
    if (note.client_updated_at && note.client_updated_at === m.last_pushed_cua) return; // unchanged
    await pushNoteContent(link, note);
  }

  // Instant path: an edit just landed on a federated note → push it now
  // (the tick stays the retry/safety net). Fire-and-forget; loop-safe via
  // last_pushed_cua (an applied incoming write records its version first).
  function onNoteChangedLocally(noteId) {
    if (deps.isLocked?.()) return;
    // A note may be shared with several peers: reconcile every mapping so
    // the edit fans out to all of them, not just the first one.
    const mappings = q.listByNote.all(noteId);
    if (!mappings.length) return;
    for (const m of mappings) {
      Promise.resolve()
        .then(() => reconcileMapping(m))
        .catch((e) => log.warn?.("[federation/notes] instant push:", e?.message));
    }
  }

  // The participant list changed on a HOME note (collaborator added/removed
  // or an access toggle) without necessarily touching the body. Push the
  // current content + roster to every peer so their displayed roster updates
  // even when the LWW content is unchanged (a same-cua apply is a content
  // no-op on the peer, but the roster is always applied).
  function onParticipantsChangedLocally(noteId) {
    if (deps.isLocked?.()) return;
    const note = deps.getNoteById.get(noteId);
    if (!note) return;
    for (const m of q.listByNote.all(noteId)) {
      if (m.role !== "home") continue;
      // A roster change (collaborator added/removed, access toggled, or a
      // whole user deleted) does NOT bump the note's client_updated_at, so the
      // reconcile tick's "content unchanged" guard (client_updated_at ===
      // last_pushed_cua) would skip re-pushing it. Clear this peer's push
      // watermark FIRST so the change is guaranteed to be delivered: the
      // instant push below restores the watermark on success, but if the peer
      // is unreachable right now (or the push fails) the watermark stays empty
      // and the tick keeps retrying until it lands, making roster changes
      // self-healing across reconnects, exactly like content edits already are.
      // Without this, a roster change pushed while the peer is down (or made
      // before the peer ran this code) is lost forever, leaving a deleted
      // collaborator stuck on the peer's mirror.
      try { q.setPushed.run(null, m.note_id, m.link_id); } catch { /* best-effort */ }
      const link = store.getById(m.link_id);
      if (!link || link.status !== "active" || link.peer_reachable !== 1) continue;
      Promise.resolve()
        .then(() => pushNoteContent(link, note))
        .catch((e) => log.warn?.("[federation/notes] roster push:", e?.message));
    }
  }

  return { reconcileMapping, onNoteChangedLocally, onParticipantsChangedLocally };
}

module.exports = { contentFromNote, createNoteSync };
