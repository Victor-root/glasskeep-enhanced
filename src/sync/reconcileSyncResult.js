// Converges the local cache with the server's answer to a synced queue
// item. Only acts when the server returned useful canonical data.
import {
  hasPendingChanges,
  putNote as idbPutNote,
  deleteNote as idbDeleteNote,
} from "./localDb.js";
import { sortNotesByRecency, noteBelongsInView } from "../utils/noteList.js";

const DROPPABLE_TYPES = new Set(["update", "patch", "archive", "trash", "restore"]);

/**
 * ctx: {
 *   userId, sessionId,
 *   viewFilter,              // the list currently shown (tag filter)
 *   setNotes,
 *   leases,                  // from useLocalLeases
 *   onNoteGone(noteId),      // the note no longer exists for this user
 *   reloadCurrentView(),
 * }
 */
export async function reconcileSyncResult(item, result, ctx) {
  const { userId: uid, sessionId: sid, setNotes, leases } = ctx;
  if (!uid || !sid) return;

  // Stale write ({ ok, stale: true, note }): ours was older than what the
  // server stores. Take the canonical note so the client converges at once.
  if (result && result.stale && result.note) {
    const canonical = result.note;
    const nid = String(canonical.id || item.noteId);
    const pending = await hasPendingChanges(nid, uid);
    if (!pending && !leases.isNoteLocallyProtected(nid)) {
      await idbPutNote(canonical, uid, sid);
      const belongsInView = noteBelongsInView(canonical, ctx.viewFilter());
      setNotes((prev) => {
        const idx = prev.findIndex((n) => String(n.id) === nid);
        if (belongsInView) {
          if (idx !== -1) {
            const updated = prev.slice();
            updated[idx] = canonical;
            return updated;
          }
          return sortNotesByRecency([...prev, canonical]);
        }
        if (idx !== -1) return prev.filter((n) => String(n.id) !== nid);
        return prev;
      });
    }
    return;
  }

  // Dropped mutation (404): the note is gone on the server. Purge the
  // local ghost so the UI converges without a full reload.
  if (result?.dropped && DROPPABLE_TYPES.has(item.type) && item.noteId) {
    const nid = String(item.noteId);
    console.warn(`[Sync] ${item.type} dropped (404) for note ${nid}, purging locally`);
    setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
    try { await idbDeleteNote(nid, uid, sid); } catch { /* IDB best-effort */ }
    leases.forgetNote(nid);
    ctx.onNoteGone(nid);
    return;
  }

  // Normal case: the server accepted the write and returns { ok, note }.
  const serverNote = result?.note || (result?.id ? result : null);

  if (item.type === "create" && serverNote && serverNote.id) {
    const nid = String(serverNote.id);
    const pending = await hasPendingChanges(nid, uid);
    if (!pending) {
      await idbPutNote(serverNote, uid, sid);
      const belongsInView = noteBelongsInView(serverNote, ctx.viewFilter());
      setNotes((prev) => {
        const idx = prev.findIndex((n) => String(n.id) === nid);
        if (idx !== -1) {
          const updated = prev.slice();
          updated[idx] = { ...prev[idx], ...serverNote };
          return updated;
        }
        // Not in state (e.g. cleared by a refresh while the item was
        // queued): insert it if it belongs in the current view.
        if (belongsInView) {
          return sortNotesByRecency([...prev, serverNote]);
        }
        return prev;
      });
    }
  } else if (serverNote && item.noteId) {
    // update / patch / archive / trash / restore: the note may also have
    // changed view (archived from the active view, restored from trash).
    const nid = String(item.noteId);
    const pending = await hasPendingChanges(nid, uid);
    if (!pending && !leases.isNoteLocallyProtected(nid)) {
      const canonical = { ...serverNote, id: nid };
      await idbPutNote(canonical, uid, sid);
      const belongsInView = noteBelongsInView(canonical, ctx.viewFilter());
      setNotes((prev) => {
        const idx = prev.findIndex((n) => String(n.id) === nid);
        if (belongsInView) {
          if (idx !== -1) {
            const updated = prev.slice();
            updated[idx] = canonical;
            return sortNotesByRecency(updated);
          }
          return sortNotesByRecency([...prev, canonical]);
        }
        if (idx !== -1) return prev.filter((n) => String(n.id) !== nid);
        return prev;
      });
    }
  } else if (item.type === "permanentDelete" && item.noteId) {
    const nid = String(item.noteId);
    leases.removeDeleteTombstone(nid);
    if (result?.stale && result?.note) {
      // Refused: another device restored the note. Bring it back.
      console.warn(`[Sync] permanentDelete stale for ${nid}, note was restored, re-adding`);
      const canonical = result.note;
      await idbPutNote(canonical, uid, sid);
      setNotes((prev) => {
        if (prev.some((n) => String(n.id) === nid)) return prev;
        return sortNotesByRecency([...prev, canonical]);
      });
    } else {
      try { await idbDeleteNote(nid, uid, sid); } catch { /* IDB best-effort */ }
    }
  } else if (item.type === "reorder" && item.payload?._reorderToken) {
    leases.releaseReorderLeases(item.payload._reorderToken);
    // Stale or dropped reorder: reload the canonical positions.
    if (result?.stale || result?.dropped) {
      console.warn("[Sync] Reorder not applied (stale/dropped), reloading notes for canonical order");
      ctx.reloadCurrentView();
    }
  }
}
