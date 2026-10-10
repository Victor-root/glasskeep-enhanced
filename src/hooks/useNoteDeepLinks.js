import { useEffect, useRef } from "react";

/**
 * Opening a note from outside the app:
 * - a tapped Web Push reminder: the service worker focuses the app and
 *   posts { type: "gk-open-note", noteId };
 * - a tapped native reminder in the Android app, which calls
 *   window.__glasskeepOpenNote(noteId). On a cold start the notes may not
 *   be loaded yet, so the id waits until the note shows up.
 */
export default function useNoteDeepLinks({ notes, openModal }) {
  // Re-attached on each render so it always calls the latest openModal.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event) => {
      const data = event.data;
      if (data && data.type === "gk-open-note" && data.noteId) {
        try { openModal(String(data.noteId)); } catch { /* opening the note is best-effort */ }
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [openModal]);

  const openModalRef = useRef(openModal);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref read by the native deep-link handler, outside render
  openModalRef.current = openModal;
  const pendingOpenNoteIdRef = useRef(null);
  useEffect(() => {
    const tryOpen = (id) => {
      const sid = String(id);
      if (notes.some((n) => String(n.id) === sid)) {
        try { openModalRef.current?.(sid); } catch { /* opening the note is best-effort */ }
        return true;
      }
      return false;
    };
    window.__glasskeepOpenNote = (id) => {
      if (id == null || id === "") return;
      if (!tryOpen(id)) pendingOpenNoteIdRef.current = String(id);
    };
    // A deep link that arrived before the notes: retried on each change.
    if (pendingOpenNoteIdRef.current && tryOpen(pendingOpenNoteIdRef.current)) {
      pendingOpenNoteIdRef.current = null;
    }
    return () => { delete window.__glasskeepOpenNote; };
  }, [notes]);
}
