import { useCallback, useEffect, useState } from "react";
import { api, getAuth } from "../utils/api.js";
import { getNote as idbGetNote, putNote as idbPutNote } from "../sync/localDb.js";
import { uid, fileToCompressedDataURL } from "../utils/helpers.js";
import { fetchLogoLibrary, createLogo, deleteLogo as apiDeleteLogo } from "../utils/logoLibrary.js";

/**
 * The user's logo library and the note icons taken from it.
 *
 * The library is server-backed (the same list on every device of the
 * user) and independent of any note: uploading a logo adds it, deleting
 * one removes it from the library only, notes that use it keep their
 * embedded copy.
 */
export default function useLogoLibrary({ token, currentUser, sessionId, setNotes, activeId }) {
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
    // Optimistic remove — restore on failure.
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

  // Note icon (logo badge) — PER-USER and never synced to collaborators.
  // It lives on note.icon and persists through its own endpoint, NOT in the
  // shared images_json. applyNoteIcon updates local state optimistically,
  // mirrors to IndexedDB, then saves to the per-user endpoint (best-effort).
  const applyNoteIcon = useCallback(async (noteId, icon) => {
    if (!noteId) return;
    const nid = String(noteId);
    setNotes((prev) => prev.map((n) => (String(n.id) === nid ? { ...n, icon: icon || null } : n)));
    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) await idbPutNote({ ...existing, icon: icon || null }, currentUser?.id, sessionId);
    } catch { /* IDB best-effort */ }
    try {
      if (icon) {
        await api(`/notes/${nid}/icon`, { method: "PUT", token, body: { icon } });
      } else {
        await api(`/notes/${nid}/icon`, { method: "DELETE", token });
      }
    } catch (e) {
      console.error("Note icon save failed", e);
    }
  }, [token, currentUser, sessionId, setNotes]);

  const setNoteIconFromFile = useCallback(async (file) => {
    if (!file || !activeId) return;
    try {
      const src = await fileToCompressedDataURL(file);
      const iconEntry = { id: uid(), src, name: file.name };
      await applyNoteIcon(activeId, iconEntry);
      addLogoToLibrary({ src, name: file.name });
    } catch (e) {
      console.error("Note icon load failed", e);
    }
  }, [activeId, applyNoteIcon, addLogoToLibrary]);

  const removeNoteIcon = useCallback(() => {
    if (activeId) applyNoteIcon(activeId, null);
  }, [activeId, applyNoteIcon]);

  // Pick an existing logo from the library as the active note's icon.
  const pickNoteIcon = useCallback((logo) => {
    if (!activeId || !logo?.src) return;
    applyNoteIcon(activeId, { id: uid(), src: logo.src, name: logo.name });
  }, [activeId, applyNoteIcon]);

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
