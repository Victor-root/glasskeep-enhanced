import { useCallback, useEffect, useRef, useState } from "react";
import {
  getNote as idbGetNote,
  putNote as idbPutNote,
} from "../sync/localDb.js";
import useDraftNote from "./useDraftNote.js";
import { parseDrawingContent } from "../utils/drawingContent.js";

/**
 * Local-first persistence of the note open in the primary modal:
 * deferred creation of drafts, debounced autosave of every note type
 * (text, checklist, drawing, audio, and the metadata of all), live sync
 * of remote changes into the editor while the user hasn't edited.
 *
 * Every save writes IndexedDB then queues a sync action, under a lease
 * that keeps remote updates from overwriting the edit meanwhile.
 * Two baselines of the open note:
 *  - initialModalStateRef advances eagerly, so an effect doesn't re-run
 *    for an edit already handled;
 *  - committedBaselineRef only advances once a save succeeded, so a
 *    failed autosave still shows up as a difference on close and is
 *    retried there.
 */
export default function useNoteEditor({
  modal,
  notes,
  setNotes,
  currentUser,
  sessionId,
  setSidebarOpen,
  getInitialTags,
  acquireLocalLease,
  releaseLocalLease,
  releaseLocalLeaseWithPrune,
  isNoteLocallyProtected,
  enqueueAndSync,
  enqueueWithLease,
}) {
  const {
    open, activeId, setActiveId, setOpen, setViewMode, setTagInput,
    mType, setMType,
    mTitle, setMTitle,
    mBody, setMBody,
    mItems, setMItems,
    mDrawingData, setMDrawingData,
    mTagList, setMTagList,
    mImages, setMImages,
    mColor, setMColor,
  } = modal;

  // Autosave bookkeeping of the open note.
  const skipNextItemsAutosaveRef = useRef(false);
  const prevItemsRef = useRef([]);
  const skipNextDrawingAutosaveRef = useRef(false);
  const prevDrawingRef = useRef({ paths: [], dimensions: null });
  const pendingDrawingSaveRef = useRef(null);
  const drawingDebounceTimerRef = useRef(null);
  // Tracks latest mBody for draw notes so flushPendingDrawingSave can include text
  const drawNoteBodyRef = useRef("");

  // Initial draw mode for the modal (null = default "view", "draw" = open in edit mode)
  const [initialDrawMode, setInitialDrawMode] = useState(null);

  // Baseline of the open note, to detect whether the user actually edited it.
  const initialModalStateRef = useRef(null);
  // Committed baseline: only advances when autoSaveTextNote actually succeeds
  // (IDB write + enqueue). closeModal uses this to detect unsaved diffs, so a
  // failed autosave still gets retried on close. initialModalStateRef may advance
  // eagerly to prevent effect re-triggers: this ref is the safety net.
  const committedBaselineRef = useRef(null);

  // Deferred creation of the notes opened from the creation buttons (see
  // useDraftNote). The autosave effects below materialise the draft on the
  // first real edit.
  const {
    pendingDraftRef,
    freshlyCreatedNoteRef,
    materializeDraftIfNeeded,
    handleDirectText,
    handleDirectChecklist,
    handleDirectDraw,
    handleDirectAudio,
  } = useDraftNote({
    activeId,
    currentUser,
    sessionId,
    mTitle, mBody, mItems, mDrawingData, mTagList, mImages, mColor,
    setSidebarOpen, setActiveId, setOpen,
    setMType, setMTitle, setMBody, setMItems, setMTagList, setMImages,
    setMColor, setMDrawingData, setTagInput,
    setInitialDrawMode, setViewMode, setNotes,
    skipNextDrawingAutosaveRef, skipNextItemsAutosaveRef,
    prevDrawingRef, prevItemsRef,
    initialModalStateRef, committedBaselineRef,
    acquireLocalLease, enqueueWithLease,
    idbPutNote,
    getInitialTags,
  });

  // Live-sync checklist items in open modal when remote updates arrive
  useEffect(() => {
    if (!open || !activeId) return;
    const n = notes.find((x) => String(x.id) === String(activeId));
    if (!n) return;
    if ((mType || n.type) !== "checklist") return;
    const serverItems = Array.isArray(n.items) ? n.items : [];
    const prevJson = JSON.stringify(prevItemsRef.current || []);
    const serverJson = JSON.stringify(serverItems);
    if (serverJson !== prevJson) {
      setMItems(serverItems);
      prevItemsRef.current = serverItems;
    }
  }, [notes, open, activeId, mType, setMItems]);

  // Flush any pending drawing debounce: shared persist logic used by both
  // the debounce timeout and the flush-on-close path.
  // Async: dirty flag stays active until queue write completes, closing the
  // micro-window where SSE patchSingleNote could slip through.
  const flushPendingDrawingSave = useCallback(async () => {
    const pending = pendingDrawingSaveRef.current;
    if (!pending) return;
    // Clear pending ref eagerly to prevent double-flush from concurrent callers,
    // but restore it on failure so closeModal retry can still pick it up.
    pendingDrawingSaveRef.current = null;

    if (drawingDebounceTimerRef.current) {
      clearTimeout(drawingDebounceTimerRef.current);
      drawingDebounceTimerRef.current = null;
    }

    const { noteId, drawingData, leaseId } = pending;
    const nowIso = new Date().toISOString();
    // Include text body alongside drawing data so it's not lost on draw saves
    const textBody = drawNoteBodyRef.current || "";
    const drawingContent = JSON.stringify({ ...drawingData, text: textBody });

    setNotes((prev) =>
      prev.map((n) =>
        String(n.id) === noteId
          ? { ...n, content: drawingContent, updated_at: nowIso, client_updated_at: nowIso }
          : n,
      ),
    );

    // Persist to IDB first: hasPendingChanges() reads from this store
    try {
      const existing = await idbGetNote(noteId, currentUser?.id, sessionId);
      if (existing) {
        await idbPutNote({ ...existing, content: drawingContent, updated_at: nowIso, client_updated_at: nowIso }, currentUser?.id, sessionId);
      }
    } catch (e) {
      console.error("IndexedDB drawing flush failed:", e);
      // IDB failed: restore pending ref so closeModal can retry
      pendingDrawingSaveRef.current = pending;
      return;
    }

    // Write queue item: after this, hasPendingChanges() returns true for noteId
    try {
      await enqueueAndSync({
        type: "patch",
        noteId,
        payload: { content: drawingContent, type: "draw", client_updated_at: nowIso },
      });
    } catch (e) {
      console.error("Drawing enqueue failed:", e);
      // Enqueue failed: restore pending ref so closeModal can retry.
      // Don't release lease on failure: keep SSE guard active.
      pendingDrawingSaveRef.current = pending;
      return;
    }

    // IDB + enqueue both succeeded: advance committed baseline
    prevDrawingRef.current = drawingData;
    // Queue item exists: release this lease + prune older zombies for this note
    releaseLocalLeaseWithPrune(noteId, leaseId);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the lease helpers only touch refs
  }, [currentUser?.id, sessionId, enqueueAndSync]);

  // Keep drawNoteBodyRef in sync with mBody for draw notes
  useEffect(() => { drawNoteBodyRef.current = mBody; }, [mBody]);

  // Auto-save drawing changes (local-first)
  useEffect(() => {
    if (!open || !activeId || mType !== "draw") return;
    if (skipNextDrawingAutosaveRef.current) {
      skipNextDrawingAutosaveRef.current = false;
      return;
    }

    const prevJson = JSON.stringify(
      prevDrawingRef.current || { paths: [], dimensions: null },
    );
    const currentJson = JSON.stringify(
      mDrawingData || { paths: [], dimensions: null },
    );
    if (prevJson === currentJson) return;

    // A real draw stroke reached us: materialise the draft before we save
    // against it. The create payload will carry the new drawing, and the
    // effect returns because baselines are realigned to the current state.
    if (materializeDraftIfNeeded({ drawing: mDrawingData })) return;
    // If materialise was rejected because the draft is still empty (no
    // strokes, no caption, no metadata), keep the draft pending and skip
    // the autosave: there's nothing to patch, and acquiring a lease /
    // scheduling a flush for a non-existent server row destabilises
    // subsequent modal opens (the user reported a flaky "modal opens
    // then closes immediately" after closing an empty drawing draft).
    if (
        pendingDraftRef.current &&
      String(activeId) === String(pendingDraftRef.current.id)
    ) {
      return;
    }

    const dirtyNoteId = String(activeId);

    // Release the lease from the previous superseded debounce (if it didn't fire yet).
    // If it DID fire, flush already consumed pendingDrawingSaveRef (set to null).
    const prev = pendingDrawingSaveRef.current;
    if (prev && prev.leaseId) {
      releaseLocalLease(prev.noteId, prev.leaseId);
    }

    // Acquire a fresh lease BEFORE debounce fires: prevents SSE patchSingleNote()
    // from overwriting local drawing state during the 500ms debounce window.
    const leaseId = acquireLocalLease(dirtyNoteId);

    // Store pending payload + lease so flush can pick it up if modal closes mid-debounce
    pendingDrawingSaveRef.current = { noteId: dirtyNoteId, drawingData: mDrawingData, leaseId };

    // Debounce local-first save by 500ms: timeout calls flush which consumes
    // and clears pendingDrawingSaveRef, so no double-execute is possible.
    const timeoutId = setTimeout(() => {
      drawingDebounceTimerRef.current = null;
      flushPendingDrawingSave();
    }, 500);
    drawingDebounceTimerRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
      drawingDebounceTimerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- materializeDraftIfNeeded is recreated each render; autosave runs only on drawing edits
  }, [mDrawingData, open, activeId, mType, flushPendingDrawingSave]);

  // Flush pending drawing save when modal closes or active note changes
  useEffect(() => {
    if (!open || !activeId || mType !== "draw") {
      flushPendingDrawingSave();
    }
  }, [open, activeId, mType, flushPendingDrawingSave]);

  // Live-sync drawing data in open modal when remote updates arrive
  useEffect(() => {
    if (!open || !activeId) return;
    const n = notes.find((x) => String(x.id) === String(activeId));
    if (!n || n.type !== "draw") return;

    try {
      const { drawing: serverCleanData } = parseDrawingContent(n.content);
      const prevJson = JSON.stringify(prevDrawingRef.current || []);
      const serverJson = JSON.stringify(serverCleanData);
      if (serverJson !== prevJson) {
        setMDrawingData(serverCleanData);
        prevDrawingRef.current = serverCleanData;
      }
    } catch {
      // Invalid JSON, ignore
    }
  }, [notes, open, activeId, setMDrawingData]);

  // Check if the note has been modified from initial state
  const hasNoteBeenModified = useCallback(() => {
    if (!initialModalStateRef.current || !activeId) return false;
    const initial = initialModalStateRef.current;
    const current = {
      title: mTitle.trim(),
      content: mBody,
      tags: mTagList,
      images: mImages,
      color: mColor,
    };
    // Compare all fields
    return (
      initial.title !== current.title ||
      initial.content !== current.content ||
      JSON.stringify(initial.tags) !== JSON.stringify(current.tags) ||
      JSON.stringify(initial.images) !== JSON.stringify(current.images) ||
      initial.color !== current.color
    );
  }, [activeId, mTitle, mBody, mTagList, mImages, mColor]);


  // Local-first auto-save for text notes: persist to IndexedDB + enqueue patch
  // Works for ALL text notes (not just collaborative): mirrors drawing/checklist pattern
  // If existingLeaseId is provided, this function owns that lease and releases it on
  // success. Otherwise acquires its own (used when called directly from closeModal).
  // Returns true if IDB + enqueue both succeeded, false otherwise.
  // Callers use this to decide whether to advance committedBaselineRef.
  const autoSaveTextNote = useCallback(async (noteId, fields, existingLeaseId, noteType = "text") => {
    const nId = String(noteId);
    const lid = existingLeaseId || acquireLocalLease(nId);
    const nowIso = new Date().toISOString();

    // Update notes state with only provided fields
    setNotes((prev) =>
      prev.map((n) =>
        String(n.id) === nId
          ? { ...n, ...fields, updated_at: nowIso, client_updated_at: nowIso }
          : n,
      ),
    );

    // Persist to IndexedDB
    try {
      const existing = await idbGetNote(nId, currentUser?.id, sessionId);
      if (existing) {
        await idbPutNote({ ...existing, ...fields, updated_at: nowIso, client_updated_at: nowIso }, currentUser?.id, sessionId);
      }
    } catch (e) {
      console.error("IndexedDB text auto-save failed:", e);
      // IDB failed: don't enqueue, keep lease, signal failure
      return false;
    }

    // Enqueue targeted patch (only the changed fields)
    try {
      await enqueueAndSync({
        type: "patch",
        noteId: nId,
        payload: { ...fields, type: noteType, client_updated_at: nowIso },
      });
    } catch (e) {
      console.error("Text enqueue failed:", e);
      // Don't release lease on failure: keep SSE guard active
      return false;
    }
    // hasPendingChanges() now returns true → SSE protection via queue takes over
    releaseLocalLeaseWithPrune(nId, lid);
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the lease helpers only touch refs
  }, [enqueueAndSync, currentUser?.id, sessionId]);

  // Local-first auto-save for metadata (color, tags, images): immediate, no debounce
  // Works for text, checklist, AND draw notes (metadata fields are independent of content).
  useEffect(() => {
    if (!open || !activeId) return;
    const initial = initialModalStateRef.current;
    if (!initial) return;

    const colorChanged = initial.color !== mColor;
    const tagsChanged = JSON.stringify(initial.tags) !== JSON.stringify(mTagList);
    const imagesChanged = JSON.stringify(initial.images) !== JSON.stringify(mImages);

    if (!colorChanged && !tagsChanged && !imagesChanged) return;

    // A real metadata change reached us: materialise the draft before saving.
    // The create payload carries the new metadata so the subsequent patch is
    // redundant and the effect exits.
    if (materializeDraftIfNeeded()) return;

    // Acquire lease before async enqueue (prevents SSE overwrite)
    const leaseId = acquireLocalLease(String(activeId));

    // Build patch with only changed metadata fields
    const metaPatch = {};
    if (colorChanged) metaPatch.color = mColor;
    if (tagsChanged) metaPatch.tags = mTagList;
    if (imagesChanged) metaPatch.images = mImages;

    // Advance initialModalStateRef eagerly to prevent effect re-trigger,
    // but only advance committedBaselineRef after confirmed persistence.
    const committedFields = { ...(colorChanged ? { color: mColor } : {}), ...(tagsChanged ? { tags: mTagList } : {}), ...(imagesChanged ? { images: mImages } : {}) };
    initialModalStateRef.current = { ...initial, ...committedFields };

    const noteType = mType || "text";
    autoSaveTextNote(activeId, metaPatch, leaseId, noteType).then((ok) => {
      if (ok && committedBaselineRef.current) {
        committedBaselineRef.current = { ...committedBaselineRef.current, ...committedFields };
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- materializeDraftIfNeeded is recreated each render; autosave runs only on edits
  }, [mColor, mTagList, mImages, open, activeId, mType, autoSaveTextNote]);

  // Auto-save text content (title + body): debounced local-first persist + patch sync.
  // Checklists share this effect for title changes (their body is always "").
  // NOTE: runs in BOTH view and edit mode. Toggling to view mode after a pending
  // edit used to cancel the debounce and leak the change (only a manual save or
  // closing from edit-mode would catch it). Read/write mode is a pure display
  // concern: the underlying mBody/mTitle state is equally dirty either way.
  useEffect(() => {
    if (!open || !activeId) return;
    if (mType !== "text" && mType !== "checklist" && mType !== "audio") return;
    const initial = initialModalStateRef.current;
    if (!initial) return;

    const titleChanged = initial.title !== mTitle.trim();
    // Audio notes piggyback on the text autosave path: their `content` field
    // is the serialised {clips, text} JSON stored in mBody. Treat it like
    // text-note content so PATCH carries the JSON when clips are added or
    // removed, materialising the draft on first recording.
    const bodyAppliesToType = mType === "text" || mType === "audio";
    const contentChanged = bodyAppliesToType && initial.content !== mBody;
    if (!titleChanged && !contentChanged) return;

    // Real keystroke reached us: materialise the draft. The create carries
    // the typed content and baselines are aligned, so the effect exits.
    if (materializeDraftIfNeeded()) return;

    // Acquire lease IMMEDIATELY (before debounce fires).
    // Prevents SSE overwriting IDB during the debounce window.
    const nId = String(activeId);
    const leaseId = acquireLocalLease(nId);
    let transferred = false;

    const timeoutId = setTimeout(() => {
      transferred = true;
      // Build patch with only changed content fields
      const contentPatch = {};
      if (titleChanged) contentPatch.title = mTitle.trim();
      if (contentChanged) contentPatch.content = mBody;

      // Transfer lease ownership to autoSaveTextNote: it will release after enqueue.
      // Advance initialModalStateRef eagerly (prevent re-trigger), but only advance
      // committedBaselineRef after confirmed IDB + enqueue success.
      const committedFields = { ...(titleChanged ? { title: mTitle.trim() } : {}), ...(contentChanged ? { content: mBody } : {}) };
      if (initialModalStateRef.current) {
        initialModalStateRef.current = { ...initialModalStateRef.current, ...committedFields };
      }

      autoSaveTextNote(activeId, contentPatch, leaseId, mType).then((ok) => {
        if (ok && committedBaselineRef.current) {
          committedBaselineRef.current = { ...committedBaselineRef.current, ...committedFields };
        }
      });
    }, 1000); // 1 second debounce

    return () => {
      clearTimeout(timeoutId);
      // If debounce was cancelled (new keystroke / modal close), release this lease.
      // If it fired, autoSaveTextNote owns the lease and will release it.
      if (!transferred) releaseLocalLease(nId, leaseId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- materializeDraftIfNeeded is recreated each render; autosave runs only on edits
  }, [mBody, mTitle, open, activeId, mType, autoSaveTextNote]);

  // Auto-save draw note title + text body: debounced local-first persist + patch sync.
  // Drawing data changes are handled by the drawing autosave effect above.
  // This effect handles title and text body changes only.
  useEffect(() => {
    if (!open || !activeId || mType !== "draw") return;
    const initial = initialModalStateRef.current;
    if (!initial) return;

    const titleChanged = initial.title !== mTitle.trim();
    const textChanged = initial.content !== mBody;
    if (!titleChanged && !textChanged) return;

    if (materializeDraftIfNeeded()) return;
    // Empty-draft rejection: keep pending, skip the patch enqueue.
    if (
      pendingDraftRef.current &&
      String(activeId) === String(pendingDraftRef.current.id)
    ) {
      return;
    }

    const nId = String(activeId);
    const leaseId = acquireLocalLease(nId);
    let transferred = false;

    const timeoutId = setTimeout(() => {
      transferred = true;
      const patch = {};
      if (titleChanged) patch.title = mTitle.trim();
      // For text body changes, re-serialize full drawing content (paths + dimensions + text)
      if (textChanged) {
        patch.content = JSON.stringify({
          ...(mDrawingData || { paths: [], dimensions: null }),
          text: mBody || "",
        });
      }

      const committedFields = {};
      if (titleChanged) committedFields.title = mTitle.trim();
      if (textChanged) committedFields.content = mBody;

      if (initialModalStateRef.current) {
        initialModalStateRef.current = { ...initialModalStateRef.current, ...committedFields };
      }

      autoSaveTextNote(activeId, patch, leaseId, "draw").then((ok) => {
        if (ok && committedBaselineRef.current) {
          committedBaselineRef.current = { ...committedBaselineRef.current, ...committedFields };
        }
      });
    }, 1000);

    return () => {
      clearTimeout(timeoutId);
      if (!transferred) releaseLocalLease(nId, leaseId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- materializeDraftIfNeeded is recreated each render; autosave runs only on edits
  }, [mBody, mTitle, open, activeId, mType, mDrawingData, autoSaveTextNote]);

  // Update initial state reference when note is updated from server (for collaborative notes)
  // This prevents overwriting server changes when user hasn't edited locally
  // Must be after hasNoteBeenModified is defined
  useEffect(() => {
    if (!open || !activeId || !initialModalStateRef.current) return;
    const n = notes.find((x) => String(x.id) === String(activeId));
    if (!n || n.type === "draw") return;

    // Check if server version is different from our initial state
    const serverState = {
      title: n.title || "",
      content: n.type === "draw" ? "" : n.content || "",
      tags: Array.isArray(n.tags) ? n.tags : [],
      images: Array.isArray(n.images) ? n.images : [],
      color: n.color || "default",
    };

    const initial = initialModalStateRef.current;
    const serverChanged =
      initial.title !== serverState.title ||
      initial.content !== serverState.content ||
      JSON.stringify(initial.tags) !== JSON.stringify(serverState.tags) ||
      JSON.stringify(initial.images) !== JSON.stringify(serverState.images) ||
      initial.color !== serverState.color;

    // If server changed and user hasn't edited locally, update initial state to server state
    // This prevents overwriting server changes when user closes without editing.
    // Skip if the note has an active local lease: a local save (auto-save metadata,
    // auto-save text, drawing save) is in flight and the `notes` state hasn't caught up
    // yet with the optimistic setNotes. Without this guard, the stale `notes` value
    // would briefly reset modal state, causing a visible flicker (e.g. deleted image
    // reappearing then disappearing).
    if (serverChanged && !hasNoteBeenModified() && !isNoteLocallyProtected(String(activeId))) {
      initialModalStateRef.current = serverState;
      committedBaselineRef.current = { ...serverState };
      // Only update fields that actually changed to avoid re-rendering
      // (re-render kills text selection in view mode)
      if (serverState.title !== mTitle) setMTitle(serverState.title);
      if (serverState.content !== mBody) setMBody(serverState.content);
      if (JSON.stringify(serverState.tags) !== JSON.stringify(mTagList)) setMTagList(serverState.tags);
      if (JSON.stringify(serverState.images) !== JSON.stringify(mImages)) setMImages(serverState.images);
      if (serverState.color !== mColor) setMColor(serverState.color);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only on server note changes, the edited fields must not re-run it on each keystroke
  }, [notes, open, activeId, hasNoteBeenModified]);

  // Local-first helper: persist checklist changes to IndexedDB + sync queue
  const syncChecklistItems = async (newItems) => {
    if (!activeId) return;
    // A checklist edit is the first real action on a pending draft: materialise
    // the note first so the create payload already contains newItems and we
    // don't enqueue a patch for a note the server has never seen. mItems in
    // closure is still the previous value here (setMItems hasn't committed
    // yet), so hand newItems in explicitly.
    if (materializeDraftIfNeeded({ items: newItems })) return;
    const noteId = String(activeId);
    const nowIso = new Date().toISOString();

    // Acquire lease BEFORE any async work: prevents SSE patchSingleNote() from
    // overwriting local checklist state during the IDB write + enqueue window.
    const leaseId = acquireLocalLease(noteId);

    // Update notes state
    setNotes((prev) =>
      prev.map((n) =>
        String(n.id) === noteId
          ? { ...n, items: newItems, updated_at: nowIso, client_updated_at: nowIso }
          : n,
      ),
    );
    // Persist to IndexedDB
    try {
      const existing = await idbGetNote(noteId, currentUser?.id, sessionId);
      if (existing) {
        await idbPutNote({ ...existing, items: newItems, updated_at: nowIso, client_updated_at: nowIso }, currentUser?.id, sessionId);
      }
    } catch (e) {
      console.error("IndexedDB checklist update failed:", e);
      // IDB failed: don't advance baseline, keep lease, signal failure
      return;
    }
    // Enqueue for server sync: after this, hasPendingChanges() protects the note
    try {
      await enqueueAndSync({
        type: "patch",
        noteId,
        payload: { items: newItems, type: "checklist", content: "", client_updated_at: nowIso },
      });
    } catch (e) {
      console.error("Checklist enqueue failed:", e);
      // Don't release lease on failure: keep SSE guard active.
      // Don't advance prevItemsRef: closeModal retry can still detect the diff.
      return;
    }
    // IDB + enqueue both succeeded: advance committed baseline
    prevItemsRef.current = newItems;
    // Queue item exists: release this lease + prune older zombies for this note
    releaseLocalLeaseWithPrune(noteId, leaseId);
  };

  return {
    skipNextItemsAutosaveRef,
    prevItemsRef,
    skipNextDrawingAutosaveRef,
    prevDrawingRef,
    pendingDrawingSaveRef,
    drawingDebounceTimerRef,
    initialModalStateRef,
    committedBaselineRef,
    initialDrawMode,
    setInitialDrawMode,
    pendingDraftRef,
    freshlyCreatedNoteRef,
    materializeDraftIfNeeded,
    handleDirectText,
    handleDirectChecklist,
    handleDirectDraw,
    handleDirectAudio,
    flushPendingDrawingSave,
    autoSaveTextNote,
    syncChecklistItems,
  };
}
