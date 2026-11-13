import { t } from "../i18n";
import { patchNote as idbPatchNote } from "../sync/localDb.js";
import { sortNotesForOrderReset } from "../utils/noteList.js";

/**
 * Manual note order: drag & drop of the cards (within the pinned or the
 * other group) and the "reset note order" setting. The order is stored
 * per user server-side, so shared notes can be moved freely. The leases
 * of the moved notes are held until the server confirms the reorder.
 */
export default function useNoteReorder({
  notes,
  setNotes,
  currentUser,
  sessionId,
  acquireLocalLease,
  holdReorderLeases,
  enqueueAndSync,
  showToast,
}) {
  /** -------- Reset note order -------- */
  const resetNoteOrder = async (overridePositions = true) => {
    // Reorder is per-user on the server (note_user_positions), so shared
    // notes are fine to include: each participant keeps their own order.
    const sorted = sortNotesForOrderReset(notes);

    // Acquire a lease per note BEFORE any local write: protects positions
    // from being overwritten by loaders / SSE until server confirms reorder.
    const noteLeases = sorted.map((n) => {
      const nid = String(n.id);
      return { noteId: nid, leaseId: acquireLocalLease(nid) };
    });

    // Assign new position values so the order persists across reloads
    if (overridePositions) {
      const now = Date.now();
      sorted.forEach((n, i) => {
        n.position = now - i;
      });
    }

    setNotes(sorted);

    // Local-first: update IndexedDB positions
    for (const n of sorted) {
      try {
        await idbPatchNote(String(n.id), { position: n.position }, currentUser?.id, sessionId);
      } catch { /* IDB best-effort */ }
    }

    const pinnedIds = sorted.filter((n) => n.pinned).map((n) => String(n.id));
    const otherIds = sorted.filter((n) => !n.pinned).map((n) => String(n.id));
    // Hold leases until onSyncComplete confirms server-side
    const reorderToken = holdReorderLeases(noteLeases);
    try {
      await enqueueAndSync({ type: "reorder", noteId: "__reorder__", payload: { pinnedIds, otherIds, _reorderToken: reorderToken, client_reordered_at: new Date().toISOString() } });
    } catch {
      // enqueue failed: leases stay active
    }
    showToast?.(t("noteOrderReset"));
  };

  /** -------- Drag & drop reorder (cards) -------- */
  // `visibleIds`: the cards of one group (pinned or others) as they were
  // dropped. A filter may hide some notes of the group: they keep their
  // places, the shown ones take the shown ones' places in the new order.
  const reorderGroup = async (group, visibleIds) => {
    const pinnedIds = notes.filter((n) => n.pinned).map((n) => String(n.id));
    const otherIds = notes.filter((n) => !n.pinned).map((n) => String(n.id));
    const groupIds = group === "pinned" ? pinnedIds : otherIds;
    const shown = new Set(visibleIds);
    const queue = visibleIds.filter((id) => groupIds.includes(id));
    if (queue.length !== shown.size) return;
    const reorderedGroup = groupIds.map((id) => (shown.has(id) ? queue.shift() : id));
    const newPinned = group === "pinned" ? reorderedGroup : pinnedIds;
    const newOthers = group === "pinned" ? otherIds : reorderedGroup;

    // Reorder is stored per-user server-side, so shared notes can be moved
    // freely without affecting other participants' ordering.
    // Assign position values so order survives reload (higher = earlier)
    const now = Date.now();
    const orderedIds = [...newPinned, ...newOthers];
    const positionMap = new Map();
    orderedIds.forEach((id, i) => positionMap.set(id, now - i));

    // Acquire a lease per affected note BEFORE any local write
    const noteLeases = orderedIds.map((id) => ({
      noteId: id,
      leaseId: acquireLocalLease(id),
    }));

    // Optimistic update with positions baked in
    const byId = new Map(notes.map((n) => [String(n.id), n]));
    const reordered = orderedIds.map((id) => {
      const n = byId.get(id);
      return n ? { ...n, position: positionMap.get(id) } : n;
    });
    setNotes(reordered);

    // Persist new positions to IndexedDB (local-first)
    for (const id of orderedIds) {
      const pos = positionMap.get(id);
      try {
        await idbPatchNote(id, { position: pos }, currentUser?.id, sessionId);
      } catch { /* IDB best-effort */ }
    }

    // Enqueue reorder: leases are held until onSyncComplete confirms server-side.
    // Tag payload with token so onSyncComplete can find and release the leases.
    const reorderToken = holdReorderLeases(noteLeases);
    try {
      await enqueueAndSync({ type: "reorder", noteId: "__reorder__", payload: { pinnedIds: newPinned, otherIds: newOthers, _reorderToken: reorderToken, client_reordered_at: new Date().toISOString() } });
    } catch {
      // enqueue failed: leases stay active (SSE protection maintained)
    }
  };

  return { resetNoteOrder, reorderGroup };
}
