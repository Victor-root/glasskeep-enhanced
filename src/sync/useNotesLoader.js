import { useEffect, useRef, useState } from "react";
import { api } from "../utils/api.js";
import {
  getAllNotes as idbGetAllNotes,
  getNote as idbGetNote,
  putNotes as idbPutNotes,
  deleteNote as idbDeleteNote,
} from "./localDb.js";
import { sortNotesByRecency } from "../utils/noteList.js";

// The three lists the notes view can show.
const VIEWS = {
  active: {
    scope: "active",
    endpoint: "/notes",
    flags: { archived: false, trashed: false },
    keep: (n) => !n.archived && !n.trashed,
    errorLabel: "Error loading notes from server:",
    // Offline: the local copy already shown stays.
    fallback: "local",
  },
  archived: {
    filter: "ARCHIVED",
    scope: "archived",
    endpoint: "/notes/archived",
    flags: { archived: true, trashed: false },
    keep: (n) => !!n.archived && !n.trashed,
    errorLabel: "Error loading archived notes from server:",
    fallback: "none",
  },
  trashed: {
    filter: "TRASHED",
    scope: "trashed",
    endpoint: "/notes/trashed",
    flags: { archived: false, trashed: true },
    keep: (n) => !!n.trashed,
    errorLabel: "Error loading trashed notes from server:",
    // Offline with nothing local: an empty trash rather than a stale list.
    fallback: "localOrEmpty",
  },
};

const viewForFilter = (filter) =>
  filter === "ARCHIVED" ? "archived" : filter === "TRASHED" ? "trashed" : "active";

/**
 * Loads the list of the current view, local-first: IndexedDB first, then
 * the server, merged without overwriting the notes that hold an unsent
 * local change. Every await re-checks that the view didn't change in the
 * meantime.
 */
export default function useNotesLoader({
  token,
  userId,
  sessionId,
  tagFilter,
  tagFilterRef,
  setNotes,
  syncEngineRef,
  reloadCurrentViewRef,
  leases,
}) {
  const [notesLoading, setNotesLoading] = useState(!!token);
  // Whether `notes` holds the regular (non-archive/trash) list.
  const notesAreRegular = useRef(true);

  const loadView = async (kind) => {
    if (!token) return;
    const view = VIEWS[kind];
    let expectedFilter;
    if (view.filter) {
      expectedFilter = view.filter;
      if (tagFilterRef.current !== expectedFilter) return;
    } else {
      expectedFilter = tagFilterRef.current;
      if (expectedFilter === "ARCHIVED" || expectedFilter === "TRASHED") return;
    }
    notesAreRegular.current = kind === "active";
    setNotesLoading(true);
    const viewChanged = () => tagFilterRef.current !== expectedFilter;
    const isProtected = (nid) => leases.isProtectedFromServerOverwrite(nid, userId);

    try {
      // Local notes first, shown immediately.
      try {
        const localNotes = await idbGetAllNotes(userId, sessionId, view.scope);
        if (localNotes.length > 0) {
          if (viewChanged()) return;
          setNotes(sortNotesByRecency(localNotes));
        }
      } catch (e) {
        if (kind === "active") console.error("IndexedDB read failed:", e);
      }

      // Unknown server status: settle it with a quick health check first.
      if (syncEngineRef.current && syncEngineRef.current.serverReachable === null) {
        await syncEngineRef.current.healthCheck();
      }
      if (syncEngineRef.current?.serverReachable === false) throw new Error("Server offline (skip)");
      const data = await api(view.endpoint, { token });
      if (viewChanged()) return;
      const serverNotes = Array.isArray(data) ? data : [];

      // Protection snapshot, taken once: the queue runs concurrently and an
      // item could disappear between two checks.
      const pendingSet = new Set();
      for (const sn of serverNotes) {
        if (await isProtected(String(sn.id))) pendingSet.add(String(sn.id));
      }

      // Hydrate IndexedDB, re-checking each note: a mutation may have
      // started since the snapshot.
      const toWrite = [];
      for (const sn of serverNotes) {
        const nid = String(sn.id);
        if (pendingSet.has(nid) || await isProtected(nid)) continue;
        toWrite.push({ ...sn, id: nid, user_id: sn.user_id || userId, ...view.flags });
      }
      if (toWrite.length > 0) await idbPutNotes(toWrite, userId, sessionId);

      // Local-only notes stay while they still have a change to send; the
      // others no longer exist and are purged.
      const serverIds = new Set(serverNotes.map((n) => String(n.id)));
      const localOnly = [];
      const deadIds = [];
      try {
        const allLocal = await idbGetAllNotes(userId, sessionId, view.scope);
        for (const ln of allLocal) {
          if (!serverIds.has(String(ln.id))) {
            if (await isProtected(String(ln.id))) {
              localOnly.push(ln);
            } else {
              deadIds.push(String(ln.id));
            }
          }
        }
      } catch { /* IDB unavailable: keep the server notes only */ }
      if (deadIds.length > 0) {
        await Promise.allSettled(deadIds.map((id) => idbDeleteNote(id, userId, sessionId)));
      }

      // Merge, re-checking protection once more before inclusion.
      const merged = [];
      for (const sn of serverNotes) {
        const nid = String(sn.id);
        if (await isProtected(nid)) {
          const localVer = await idbGetNote(nid, userId, sessionId);
          if (localVer) merged.push(localVer);
        } else {
          merged.push(sn);
        }
      }

      // A local version with a pending change may carry other view flags.
      const final = [...merged, ...localOnly].filter(view.keep);
      if (viewChanged()) return;
      setNotes(sortNotesByRecency(final));
      return true; // server data fetched
    } catch (error) {
      console.error(view.errorLabel, error);
      // Lets the sync engine detect the offline state quickly.
      syncEngineRef.current?.healthCheck();
      if (view.fallback === "none") return;
      if (viewChanged()) return;
      try {
        const localNotes = await idbGetAllNotes(userId, sessionId, view.scope);
        if (localNotes.length > 0) {
          if (!viewChanged()) setNotes(sortNotesByRecency(localNotes));
        } else if (view.fallback === "localOrEmpty" && !viewChanged()) {
          setNotes([]);
        }
      } catch (e) {
        if (view.fallback === "localOrEmpty") {
          if (!viewChanged()) setNotes([]);
        } else {
          console.error("Fallback load failed:", e);
        }
      }
    } finally {
      setNotesLoading(false);
    }
  };

  const loadNotes = () => loadView("active");
  const loadArchivedNotes = () => loadView("archived");
  const loadTrashedNotes = () => loadView("trashed");

  // Resolves true when the server data was fetched, false/undefined when
  // only the local copy could be shown.
  // eslint-disable-next-line react-hooks/refs -- latest-value ref read by the sync recovery callbacks, outside render
  reloadCurrentViewRef.current = async () => {
    try {
      return await loadView(viewForFilter(tagFilterRef.current));
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (!token) return;
    // Updated first: the loaders compare against it after each await.
    tagFilterRef.current = tagFilter;
    const kind = viewForFilter(tagFilter);
    loadView(kind).catch((error) => {
      const what = kind === "active" ? "regular" : kind;
      console.error(`Failed to load ${what} notes:`, error);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the token or the view filter changes
  }, [token, tagFilter]);

  return { notesLoading, notesAreRegular, loadNotes, loadArchivedNotes, loadTrashedNotes };
}
