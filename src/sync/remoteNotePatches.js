// Applies server-side note changes announced by live events, without
// overwriting a note that holds an unsent local change.
import { api } from "../utils/api.js";
import {
  hasPendingChanges,
  putNote as idbPutNote,
  deleteNote as idbDeleteNote,
} from "./localDb.js";
import { sortNotesByRecency, noteBelongsInView } from "../utils/noteList.js";

/**
 * ctx: { token, userId, sessionId, viewFilter(), setNotes, leases }
 */
export async function patchSingleNote(noteId, ctx) {
  if (!noteId) return;
  const { token, userId, sessionId, setNotes, leases } = ctx;
  const nid = String(noteId);

  // Permanently deleted locally: never resurrected from the server.
  if (leases.isDeleteTombstoned(nid)) return;
  // Already in the sync queue.
  const pending = await hasPendingChanges(nid, userId);
  if (pending) return;
  // Active local lease (debounce, pending IDB write, in-flight or failed enqueue).
  if (leases.isNoteLocallyProtected(nid)) return;

  try {
    const serverNote = await api(`/notes/${nid}`, { token });
    if (!serverNote || !serverNote.id) return;

    // Final guard: a local mutation may have started during the fetch.
    if (await leases.isProtectedFromServerOverwrite(nid, userId)) return;

    const belongsInView = noteBelongsInView(serverNote, ctx.viewFilter());

    try {
      await idbPutNote({
        ...serverNote,
        id: nid,
        user_id: serverNote.user_id || userId,
      }, userId, sessionId);
    } catch { /* IDB best-effort */ }

    if (belongsInView) {
      // Upsert and re-sort: position / pinned may have changed.
      setNotes((prev) => {
        const idx = prev.findIndex((n) => String(n.id) === nid);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = serverNote;
          return sortNotesByRecency(updated);
        }
        return sortNotesByRecency([...prev, serverNote]);
      });
    } else {
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
    }
  } catch (e) {
    // 404: the note was deleted. Other errors leave the state as is.
    if (e.status === 404) {
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      try { await idbDeleteNote(nid, userId, sessionId); } catch { /* IDB best-effort */ }
    }
  }
}

// Several notes at once: fetched in parallel, then ONE setNotes update,
// so the grid doesn't flicker through N re-renders.
export async function patchNotes(ids, ctx) {
  if (ids.length === 0) return;
  if (ids.length === 1) {
    await patchSingleNote(ids[0], ctx);
    return;
  }

  const { token, userId: uid, sessionId: sid, setNotes, leases } = ctx;
  const currentFilter = ctx.viewFilter();

  const toFetch = [];
  for (const nid of ids) {
    if (leases.isDeleteTombstoned(nid)) continue;
    if (leases.isNoteLocallyProtected(nid)) continue;
    if (await hasPendingChanges(nid, uid)) continue;
    toFetch.push(nid);
  }
  if (toFetch.length === 0) return;

  const results = await Promise.allSettled(
    toFetch.map(async (nid) => {
      try {
        const serverNote = await api(`/notes/${nid}`, { token });
        if (!serverNote || !serverNote.id) return null;
        if (await leases.isProtectedFromServerOverwrite(nid, uid)) return null;
        return serverNote;
      } catch (e) {
        return e.status === 404 ? { _deleted: true, _nid: nid } : null;
      }
    })
  );

  const upserts = new Map(); // nid → serverNote
  const removals = new Set(); // nids leaving the view
  const idbWrites = [];

  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const val = r.value;

    if (val._deleted) {
      removals.add(val._nid);
      idbWrites.push(idbDeleteNote(val._nid, uid, sid).catch(() => {}));
      continue;
    }

    const nid = String(val.id);
    idbWrites.push(
      idbPutNote({ ...val, id: nid, user_id: val.user_id || uid }, uid, sid).catch(() => {})
    );
    if (noteBelongsInView(val, currentFilter)) {
      upserts.set(nid, val);
    } else {
      removals.add(nid);
    }
  }

  await Promise.allSettled(idbWrites);

  if (upserts.size > 0 || removals.size > 0) {
    setNotes((prev) => {
      let next = prev;
      if (removals.size > 0) {
        next = next.filter((n) => !removals.has(String(n.id)));
      }
      if (upserts.size > 0) {
        const updated = next.map((n) => {
          const sn = upserts.get(String(n.id));
          return sn ? sn : n;
        });
        const existingIds = new Set(updated.map((n) => String(n.id)));
        const newNotes = [];
        for (const [nid, sn] of upserts) {
          if (!existingIds.has(nid)) newNotes.push(sn);
        }
        next = newNotes.length > 0
          ? sortNotesByRecency([...updated, ...newNotes])
          : sortNotesByRecency(updated);
      }
      return next;
    });
  }
}
