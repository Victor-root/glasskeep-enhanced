import { useCallback, useEffect, useState } from "react";
import { getAuth } from "../utils/api.js";
import { patchNote as idbPatchNote } from "../sync/localDb.js";
import { fetchLogoLibrary, createLogo, deleteLogo as apiDeleteLogo } from "../utils/logoLibrary.js";
import useNoteIconActions from "./useNoteIconActions.js";

/**
 * The user's logo library and the note icons taken from it.
 *
 * The library is server-backed (the same list on every device of the
 * user) and independent of any note: uploading a logo adds it, deleting
 * one removes it from the library only, notes that use it keep their
 * embedded copy.
 */
export default function useLogoLibrary({ currentUser, sessionId, setNotes, activeId, enqueueAndSync }) {
  const [logoLibrary, setLogoLibrary] = useState([]);
  useEffect(() => {
    const token = getAuth()?.token;
    if (!currentUser?.id || !token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- signed out: the library empties with the session
      setLogoLibrary([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchLogoLibrary(token);
        if (!cancelled) setLogoLibrary(rows);
      } catch (e) {
        console.error("[logoLibrary] load failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  const addLogoToLibrary = useCallback(async ({ src, name }) => {
    const token = getAuth()?.token;
    if (!token || !src) return null;
    try {
      const saved = await createLogo(token, { src, name });
      if (saved) {
        setLogoLibrary((prev) => {
          if (prev.some((l) => l.id === saved.id)) return prev;
          return [...prev, saved];
        });
      }
      return saved;
    } catch (e) {
      console.error("[logoLibrary] create failed", e);
      return null;
    }
  }, []);

  const deleteLogoFromLibrary = useCallback(async (id) => {
    const token = getAuth()?.token;
    if (!token || !id) return;
    // Optimistic remove: restore on failure.
    let removed = null;
    setLogoLibrary((prev) => {
      removed = prev.find((l) => l.id === id) || null;
      return prev.filter((l) => l.id !== id);
    });
    try {
      await apiDeleteLogo(token, id);
    } catch (e) {
      console.error("[logoLibrary] delete failed", e);
      if (removed) setLogoLibrary((prev) => [...prev, removed]);
    }
  }, []);

  // Note icon (logo badge): PER-USER and never synced to collaborators.
  // It lives on note.icon and persists through its own endpoint, NOT in the
  // shared images_json. applyNoteIcon updates local state optimistically,
  // mirrors to IndexedDB, then queues the per-user endpoint's write like
  // any note change: offline it waits for the server, and on a note just
  // created (a duplicate, a fresh note) it plays after the note's create.
  const applyNoteIcon = useCallback(async (noteId, icon) => {
    if (!noteId) return;
    const nid = String(noteId);
    setNotes((prev) => prev.map((n) => (String(n.id) === nid ? { ...n, icon: icon || null } : n)));
    try {
      await idbPatchNote(nid, { icon: icon || null }, currentUser?.id, sessionId);
    } catch { /* IDB best-effort */ }
    try {
      await enqueueAndSync({ type: "icon", noteId: nid, payload: { icon: icon || null } });
    } catch (e) {
      console.error("Note icon save failed", e);
    }
  }, [currentUser, sessionId, setNotes, enqueueAndSync]);

  const { setNoteIconFromFile, removeNoteIcon, pickNoteIcon } = useNoteIconActions({
    noteId: activeId, applyNoteIcon, addLogoToLibrary,
  });

  return {
    logoLibrary,
    setLogoLibrary,
    addLogoToLibrary,
    deleteLogoFromLibrary,
    applyNoteIcon,
    setNoteIconFromFile,
    removeNoteIcon,
    pickNoteIcon,
  };
}
