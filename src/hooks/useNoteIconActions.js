import { useCallback } from "react";
import { uid } from "../utils/ids.js";
import { fileToCompressedDataURL } from "../utils/images.js";

/**
 * The note icon actions of one open note (upload, remove, pick from the
 * library), bound to `noteId`. Shared by the primary modal (through
 * useLogoLibrary) and the side-by-side right pane; applyNoteIcon
 * (useLogoLibrary) persists the icon.
 */
export default function useNoteIconActions({ noteId, applyNoteIcon, addLogoToLibrary }) {
  const setNoteIconFromFile = useCallback(async (file) => {
    if (!file || !noteId) return;
    try {
      const src = await fileToCompressedDataURL(file);
      const iconEntry = { id: uid(), src, name: file.name };
      await applyNoteIcon(noteId, iconEntry);
      addLogoToLibrary({ src, name: file.name });
    } catch (e) {
      console.error("Note icon load failed", e);
    }
  }, [noteId, applyNoteIcon, addLogoToLibrary]);

  const removeNoteIcon = useCallback(() => {
    if (noteId) applyNoteIcon(noteId, null);
  }, [noteId, applyNoteIcon]);

  // Pick an existing logo from the library as the note's icon.
  const pickNoteIcon = useCallback((logo) => {
    if (!noteId || !logo?.src) return;
    applyNoteIcon(noteId, { id: uid(), src: logo.src, name: logo.name });
  }, [noteId, applyNoteIcon]);

  return { setNoteIconFromFile, removeNoteIcon, pickNoteIcon };
}
