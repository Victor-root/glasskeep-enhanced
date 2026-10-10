import { useRef } from "react";
import { hasPendingChanges } from "./localDb.js";

/**
 * In-memory protection of notes with a local change in flight, so a
 * server update (loaders, live events) can't overwrite them.
 *
 * - Leases: each local mutation acquires one, with a monotonic sequence
 *   number; a note is protected while it holds at least one. After a
 *   successful enqueue the caller releases its lease AND prunes every
 *   older one for that note, clearing leases left by earlier failed
 *   attempts. Newer leases are never touched.
 * - Reorder leases: a reorder is queued under noteId "__reorder__", so
 *   the per-note leases are held until the server confirms it.
 * - Delete tombstones: notes permanently deleted locally but not yet
 *   confirmed. They can't reappear from server data meanwhile.
 *
 * The functions are recreated on each render, like the inline ones they
 * replace, so the memoized consumers keep their update timing.
 */
export default function useLocalLeases() {
  // Map<noteId, Map<leaseId, { seq }>>
  const localLeaseRef = useRef(new Map());
  const leaseSeqRef = useRef(0);
  // Map<reorderToken, Array<{ noteId, leaseId }>>
  const pendingReorderLeasesRef = useRef(new Map());
  const reorderTokenSeqRef = useRef(0);
  const localDeleteTombstoneRef = useRef(new Set());
  // Map<noteId, number>: leases ever acquired per note, i.e. local edits
  // started. Never decreases, so a change tells that an edit started in
  // between, even one already finished.
  const editVersionRef = useRef(new Map());

  const acquireLocalLease = (noteId) => {
    const seq = ++leaseSeqRef.current;
    const leaseId = `L${seq}`;
    const map = localLeaseRef.current;
    if (!map.has(noteId)) map.set(noteId, new Map());
    map.get(noteId).set(leaseId, { seq });
    const key = String(noteId);
    editVersionRef.current.set(key, (editVersionRef.current.get(key) || 0) + 1);
    return leaseId;
  };
  const editVersion = (noteId) => editVersionRef.current.get(String(noteId)) || 0;
  const releaseLocalLease = (noteId, leaseId) => {
    const map = localLeaseRef.current;
    const leases = map.get(noteId);
    if (!leases) return;
    leases.delete(leaseId);
    if (leases.size === 0) map.delete(noteId);
  };
  // Releases its own lease and prunes the older ones of the same note: a
  // newer mutation reached the queue safely, so they are superseded.
  const releaseLocalLeaseWithPrune = (noteId, leaseId) => {
    const map = localLeaseRef.current;
    const leases = map.get(noteId);
    if (!leases) return;
    const own = leases.get(leaseId);
    const maxSeq = own ? own.seq : -1;
    const toDelete = [];
    for (const [lid, meta] of leases) {
      if (meta.seq <= maxSeq) toDelete.push(lid);
    }
    for (const lid of toDelete) leases.delete(lid);
    if (leases.size === 0) map.delete(noteId);
  };
  const isNoteLocallyProtected = (noteId) => {
    const leases = localLeaseRef.current.get(noteId);
    return !!leases && leases.size > 0;
  };
  // The note no longer exists for this user: drop its leases.
  const forgetNote = (noteId) => {
    localLeaseRef.current.delete(noteId);
  };

  // Holds the given leases until the reorder sent with the returned token
  // is confirmed.
  const holdReorderLeases = (noteLeases) => {
    const reorderToken = `R${++reorderTokenSeqRef.current}`;
    pendingReorderLeasesRef.current.set(reorderToken, noteLeases);
    return reorderToken;
  };
  const releaseReorderLeases = (reorderToken) => {
    const held = pendingReorderLeasesRef.current.get(reorderToken);
    if (!held) return;
    for (const { noteId, leaseId } of held) {
      releaseLocalLeaseWithPrune(noteId, leaseId);
    }
    pendingReorderLeasesRef.current.delete(reorderToken);
  };

  const addDeleteTombstone = (noteId) => localDeleteTombstoneRef.current.add(String(noteId));
  const removeDeleteTombstone = (noteId) => localDeleteTombstoneRef.current.delete(String(noteId));
  const isDeleteTombstoned = (noteId) => localDeleteTombstoneRef.current.has(String(noteId));

  // Queue-based protection (pending changes in IndexedDB) on top of the
  // leases and tombstones. Called both as an early snapshot and as the
  // final guard before a write, closing check-then-write races.
  const isProtectedFromServerOverwrite = async (noteId, userId) => {
    if (isDeleteTombstoned(noteId)) return true;
    if (isNoteLocallyProtected(noteId)) return true;
    return hasPendingChanges(noteId, userId);
  };

  // Applying a server copy of a note takes several awaits (IndexedDB, the
  // network). Snapshot before them, check right before writing: false when
  // a local edit started meanwhile, so the server copy, older than that
  // edit, must not overwrite it.
  const snapshotEdits = (noteId) => {
    const version = editVersion(noteId);
    return () => editVersion(noteId) === version && !isNoteLocallyProtected(noteId);
  };
  // Same for every note at once (a whole list being reloaded): the check
  // takes the note id.
  const snapshotAllEdits = () => {
    const versions = new Map(editVersionRef.current);
    return (noteId) =>
      editVersion(noteId) === (versions.get(String(noteId)) || 0) && !isNoteLocallyProtected(noteId);
  };

  // Sign-out: nothing may survive into the next session.
  const clearAll = () => {
    localLeaseRef.current.clear();
    editVersionRef.current.clear();
    localDeleteTombstoneRef.current.clear();
    pendingReorderLeasesRef.current.clear();
  };

  return {
    acquireLocalLease,
    releaseLocalLease,
    releaseLocalLeaseWithPrune,
    isNoteLocallyProtected,
    forgetNote,
    holdReorderLeases,
    releaseReorderLeases,
    addDeleteTombstone,
    removeDeleteTombstone,
    isDeleteTombstoned,
    isProtectedFromServerOverwrite,
    snapshotEdits,
    snapshotAllEdits,
    clearAll,
  };
}
