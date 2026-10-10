import { useRef } from "react";
import { t } from "../i18n";
import { getNote as idbGetNote, putNote as idbPutNote } from "../sync/localDb.js";
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
  const dragId = useRef(null);
  const dragGroup = useRef(null);

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
        const existing = await idbGetNote(String(n.id), currentUser?.id, sessionId);
        if (existing) await idbPutNote({ ...existing, position: n.position }, currentUser?.id, sessionId);
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

  /** -------- Drag & Drop reorder (cards) -------- */
  const swapWithin = (arr, itemId, targetId) => {
    const a = arr.slice();
    const from = a.indexOf(itemId);
    const to = a.indexOf(targetId);
    if (from === -1 || to === -1) return arr;
    a[from] = targetId;
    a[to] = itemId;
    return a;
  };
  const onDragStart = (id, ev) => {
    dragId.current = String(id);
    const isPinned = !!notes.find((n) => String(n.id) === String(id))?.pinned;
    dragGroup.current = isPinned ? "pinned" : "others";
    ev.currentTarget.classList.add("dragging");
  };
  const onDragOver = (overId, group, ev) => {
    ev.preventDefault();
    if (!dragId.current) return;
    if (dragGroup.current !== group) return;
    ev.currentTarget.classList.add("drag-over");
  };
  const onDragLeave = (ev) => {
    ev.currentTarget.classList.remove("drag-over");
  };
  const onDrop = async (overId, group, ev) => {
    ev.preventDefault();
    ev.currentTarget.classList.remove("drag-over");
    const dragged = dragId.current;
    dragId.current = null;
    if (!dragged || String(dragged) === String(overId)) return;
    if (dragGroup.current !== group) return;

    // Reorder is stored per-user server-side, so shared notes can be moved
    // freely without affecting other participants' ordering.
    const pinnedIds = notes.filter((n) => n.pinned).map((n) => String(n.id));
    const otherIds = notes.filter((n) => !n.pinned).map((n) => String(n.id));
    let newPinned = pinnedIds,
      newOthers = otherIds;
    if (group === "pinned")
      newPinned = swapWithin(pinnedIds, String(dragged), String(overId));
    else
      newOthers = swapWithin(otherIds, String(dragged), String(overId));

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
        const existing = await idbGetNote(id, currentUser?.id, sessionId);
        if (existing) await idbPutNote({ ...existing, position: pos }, currentUser?.id, sessionId);
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
    dragGroup.current = null;
  };
  const onDragEnd = (ev) => {
    ev.currentTarget.classList.remove("dragging");
  };

  return { resetNoteOrder, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd };
}
