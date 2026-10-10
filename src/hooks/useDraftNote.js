import { useRef } from "react";
import { uid } from "../utils/helpers.js";
import { serializeAudioContent } from "../utils/audioNote.js";
import { contentToPlain } from "../utils/richText.js";
import { sortNotesByRecency } from "../utils/noteList.js";

/**
 * useDraftNote — Deferred creation lifecycle for blank notes opened via the
 * desktop creation buttons.
 *
 * Clicking a creation button opens the modal in edit mode over a _draft_ —
 * no IndexedDB write, no sync-queue enqueue, no entry in `notes`. The draft
 * only materialises (create in IDB + prepend to state + enqueue "create")
 * when the user takes a real action: typing, drawing, toggling a checklist
 * item, pinning, archiving, or pressing save. Closing the modal without
 * any such action simply discards the pending draft — no trash pollution.
 *
 * The autosave effects in useNoteEditor call `materializeDraftIfNeeded()` _after_
 * their own diff check, so the create runs synchronously and lands in the
 * FIFO queue before any follow-up patch. The effect then exits because
 * materialise aligns baselines to the current state.
 *
 * This hook owns:
 *  - `pendingDraftRef` (the pending-draft marker)
 *  - `materializeDraftIfNeeded` (the create-on-first-edit routine)
 *  - `handleDirectText/Checklist/Draw` (the button entry points)
 *
 * It does NOT own the intercept calls inside the autosave effects
 * (useNoteEditor) nor the guards in togglePin/handleArchiveNote/saveModal/
 * deleteModal/closeModal (useNoteActions).
 */
export default function useDraftNote(ctx) {
  const pendingDraftRef = useRef(null); // { id, type } | null
  // Stays set across the note's whole "first session" — from creation until
  // the modal closes. Lets closeModal (useNoteActions) auto-trash a freshly-created
  // note that the user emptied before closing (typed something, autosave
  // materialised the draft, then user erased everything). Cleared on close,
  // pin, archive or explicit delete — durable actions imply intent to keep.
  const freshlyCreatedNoteRef = useRef(null); // string id | null

  const materializeDraftIfNeeded = (overrides = {}) => {
    const draft = pendingDraftRef.current;
    if (!draft) return false;
    // Only materialise when the open modal is actually this draft. Protects
    // against a stale ref matching state from a different note.
    if (String(ctx.activeId) !== String(draft.id)) return false;

    // Callers may pass the not-yet-committed state (e.g. syncChecklistItems is
    // invoked right after setMItems so mItems from closure is still stale).
    const items = Array.isArray(overrides.items)
      ? overrides.items
      : (Array.isArray(ctx.mItems) ? ctx.mItems : []);
    const drawing = overrides.drawing ?? ctx.mDrawingData;
    const body = typeof overrides.body === "string" ? overrides.body : (ctx.mBody || "");

    const { id, type } = draft;
    const isDraw = type === "draw";

    // Bail out on a "fake" materialise for an entirely empty drawing draft.
    // We've seen reports of an empty drawing card appearing in the list after
    // the user opens the canvas, doesn't draw, and closes — implying some
    // path is calling this with `{paths: []}` even though no real user
    // action happened. Without this guard the draft becomes a real note
    // and closeModal's auto-trash doesn't always catch it (the user has
    // reported "single dash" cards that survive). Skipping the materialise
    // here keeps the draft pending, so the closeModal pendingDraft branch
    // discards it cleanly with the empty-note toast.
    if (isDraw) {
      const draftPaths = drawing?.paths || [];
      const meaningfulPaths = draftPaths.filter(
        (p) => Array.isArray(p?.points) && p.points.length >= 2,
      );
      const titleEmpty = !(ctx.mTitle || "").trim();
      // Body is the Tiptap text-caption envelope for draw notes; an empty
      // editor still serialises to a non-trivial JSON string, so collapse
      // through contentToPlain before checking emptiness.
      const bodyEmpty = !contentToPlain(body || "").trim();
      const noImages =
        !Array.isArray(ctx.mImages) || ctx.mImages.length === 0;
      const noTags =
        !Array.isArray(ctx.mTagList) || ctx.mTagList.length === 0;
      const noColor = !ctx.mColor || ctx.mColor === "default";
      if (
        titleEmpty &&
        bodyEmpty &&
        noImages &&
        noTags &&
        noColor &&
        meaningfulPaths.length === 0
      ) {
        return false;
      }
    }

    // Clear the ref synchronously so concurrent effects don't re-enter.
    pendingDraftRef.current = null;

    const nowIso = new Date().toISOString();
    const newNote = {
      id,
      type,
      title: (ctx.mTitle || "").trim(),
      content: isDraw
        ? JSON.stringify({
            paths: drawing?.paths || [],
            dimensions: drawing?.dimensions || null,
            text: body,
          })
        : body, // audio: body holds the serialized {clips, text} JSON
      items,
      tags: Array.isArray(ctx.mTagList) ? ctx.mTagList : [],
      images: Array.isArray(ctx.mImages) ? ctx.mImages : [],
      color: ctx.mColor || "default",
      pinned: false,
      position: Date.now(),
      timestamp: nowIso,
      updated_at: nowIso,
      client_updated_at: nowIso,
    };
    const localNote = {
      ...newNote,
      user_id: ctx.currentUser?.id,
      archived: false,
      trashed: false,
    };

    const leaseId = ctx.acquireLocalLease(String(id));
    ctx.idbPutNote(localNote, ctx.currentUser?.id, ctx.sessionId).catch((e) =>
      console.error("IndexedDB put failed:", e),
    );
    ctx.setNotes((prev) =>
      sortNotesByRecency([localNote, ...(Array.isArray(prev) ? prev : [])]),
    );
    ctx.enqueueWithLease(
      String(id),
      { type: "create", noteId: id, payload: newNote },
      leaseId,
    );

    // Align baselines with what we just persisted so subsequent autosave diffs
    // don't enqueue a redundant patch for content already in the create payload.
    const newBaseline = {
      title: newNote.title,
      content: isDraw ? body : newNote.content,
      tags: newNote.tags,
      images: newNote.images,
      color: newNote.color,
    };
    // eslint-disable-next-line react-hooks/immutability -- ctx carries App's refs; writing .current from this event-time helper is intended
    ctx.initialModalStateRef.current = newBaseline;
    ctx.committedBaselineRef.current = { ...newBaseline };
    if (isDraw) {
      ctx.prevDrawingRef.current = drawing || { paths: [], dimensions: null };
    }
    if (type === "checklist") {
      ctx.prevItemsRef.current = [...items];
    }
    return true;
  };

  const createAndOpenBlankNote = (type) => {
    const tempId = uid();
    const isDraw = type === "draw";
    const isAudio = type === "audio";

    // Inherit the current tag filter context so the new note stays visible
    // under whatever filter the user was browsing. Returns [] for special
    // filters or an empty filter (ARCHIVED / TRASHED / ALL_IMAGES / none).
    const initialTags = typeof ctx.getInitialTags === "function"
      ? (ctx.getInitialTags() || [])
      : [];

    // Audio notes seed mBody with an empty {clips, text} JSON so the
    // AudioNoteEditor can read/write directly to mBody without a special
    // initial-state branch. The autosave effect compares baseline.content
    // to mBody, so baseline.content must match this seed string exactly —
    // otherwise the modal would try to PATCH on open with no user action.
    const initialBody = isAudio ? serializeAudioContent({ clips: [], text: "" }) : "";

    // Open the modal in edit mode on a blank state. No IDB/state/enqueue work
    // happens here — materializeDraftIfNeeded() will do it on first real edit.
    ctx.setSidebarOpen(false);
    ctx.setActiveId(tempId);
    ctx.setMType(type);
    ctx.setMTitle("");
    ctx.setMDrawingData({ paths: [], dimensions: null });
    // eslint-disable-next-line react-hooks/immutability -- ctx carries App's refs; writing .current from this event-time helper is intended
    ctx.prevDrawingRef.current = { paths: [], dimensions: null };
    ctx.setMBody(initialBody);
    ctx.skipNextDrawingAutosaveRef.current = true;
    ctx.skipNextItemsAutosaveRef.current = true;
    ctx.setMItems([]);
    ctx.prevItemsRef.current = [];
    ctx.setMTagList(initialTags);
    ctx.setMImages([]);
    ctx.setTagInput("");
    ctx.setMColor("default");
    // Baseline tags MUST match what we just seeded, otherwise the metadata
    // autosave effect would immediately diff and try to patch a note that
    // hasn't been materialised yet.
    const baselineState = { title: "", content: initialBody, tags: initialTags, images: [], color: "default" };
    ctx.initialModalStateRef.current = baselineState;
    ctx.committedBaselineRef.current = { ...baselineState };
    if (isDraw) ctx.setInitialDrawMode("draw");
    ctx.setViewMode(false);
    pendingDraftRef.current = { id: tempId, type };
    freshlyCreatedNoteRef.current = tempId;
    ctx.setOpen(true);
  };

  return {
    pendingDraftRef,
    freshlyCreatedNoteRef,
    materializeDraftIfNeeded,
    handleDirectText: () => createAndOpenBlankNote("text"),
    handleDirectChecklist: () => createAndOpenBlankNote("checklist"),
    handleDirectDraw: () => createAndOpenBlankNote("draw"),
    handleDirectAudio: () => createAndOpenBlankNote("audio"),
  };
}
