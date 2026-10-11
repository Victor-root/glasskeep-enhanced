import { useCallback } from "react";
import { uid } from "../utils/ids.js";
import { fileToCompressedDataURL } from "../utils/images.js";

/**
 * The note icon actions of one open note (upload, remove, pick from the
 * library), bound to `noteId`. Shared by the primary modal (through
 * useLogoLibrary) and the side-by-side right pane; applyNoteIcon
 * (useLogoLibrary) persists the icon.
 *
 * Setting an icon on a draft counts as a real action, like pinning it:
 * materializeDraftIfNeeded (the pane's editor) creates the note first, so
 * its create is queued before the icon.
 */
export default function useNoteIconActions({ noteId, applyNoteIcon, addLogoToLibrary, materializeDraftIfNeeded }) {
  const setNoteIconFromFile = useCallback(async (file) => {
    if (!file || !noteId) return;
    try {
      const src = await fileToCompressedDataURL(file);
      const iconEntry = { id: uid(), src, name: file.name };
      materializeDraftIfNeeded();
      await applyNoteIcon(noteId, iconEntry);
      addLogoToLibrary({ src, name: file.name });
    } catch (e) {
      console.error("Note icon load failed", e);
    }
  }, [noteId, applyNoteIcon, addLogoToLibrary, materializeDraftIfNeeded]);

  const removeNoteIcon = useCallback(() => {
    if (noteId) applyNoteIcon(noteId, null);
  }, [noteId, applyNoteIcon]);

  // Pick an existing logo from the library as the note's icon.
  const pickNoteIcon = useCallback((logo) => {
    if (!noteId || !logo?.src) return;
    materializeDraftIfNeeded();
    applyNoteIcon(noteId, { id: uid(), src: logo.src, name: logo.name });
  }, [noteId, applyNoteIcon, materializeDraftIfNeeded]);

  return { setNoteIconFromFile, removeNoteIcon, pickNoteIcon };
}
