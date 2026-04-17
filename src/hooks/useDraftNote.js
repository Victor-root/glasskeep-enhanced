import { useRef } from "react";
import { uid } from "../utils/helpers.js";

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
 * The autosave effects in App.jsx call `materializeDraftIfNeeded()` _after_
 * their own diff check, so the create runs synchronously and lands in the
 * FIFO queue before any follow-up patch. The effect then exits because
 * materialise aligns baselines to the current state.
 *
 * This hook owns:
 *  - `pendingDraftRef` (the pending-draft marker)
 *  - `materializeDraftIfNeeded` (the create-on-first-edit routine)
 *  - `handleDirectText/Checklist/Draw` (the button entry points)
 *  - `isDraftId` (convenience predicate for the App guards)
 *
 * It does NOT own the intercept calls inside autosave effects nor the guards
 * in togglePin/handleArchiveNote/saveModal/deleteModal/closeModal — those
 * remain in App.jsx as part of the existing note-lifecycle orchestration.
 */
export default function useDraftNote(ctx) {
  const pendingDraftRef = useRef(null); // { id, type } | null

  const materializeDraftIfNeeded = (overrides = {}) => {
    const draft = pendingDraftRef.current;
    if (!draft) return false;
    // Only materialise when the open modal is actually this draft. Protects
    // against a stale ref matching state from a different note.
    if (String(ctx.activeId) !== String(draft.id)) return false;
    // Clear the ref synchronously so concurrent effects don't re-enter.
    pendingDraftRef.current = null;

    // Callers may pass the not-yet-committed state (e.g. syncChecklistItems is
    // invoked right after setMItems so mItems from closure is still stale).
    const items = Array.isArray(overrides.items)
      ? overrides.items
      : (Array.isArray(ctx.mItems) ? ctx.mItems : []);
    const drawing = overrides.drawing ?? ctx.mDrawingData;

    const { id, type } = draft;
    const nowIso = new Date().toISOString();
    const isDraw = type === "draw";
    const newNote = {
      id,
      type,
      title: (ctx.mTitle || "").trim(),
      content: isDraw
        ? JSON.stringify({
            paths: drawing?.paths || [],
            dimensions: drawing?.dimensions || null,
            text: ctx.mBody || "",
          })
        : (ctx.mBody || ""),
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
      ctx.sortNotesByRecency([localNote, ...(Array.isArray(prev) ? prev : [])]),
    );
    ctx.invalidateNotesCache();
    ctx.enqueueWithLease(
      String(id),
      { type: "create", noteId: id, payload: newNote },
      leaseId,
    );

    // Align baselines with what we just persisted so subsequent autosave diffs
    // don't enqueue a redundant patch for content already in the create payload.
    const newBaseline = {
      title: newNote.title,
      content: isDraw ? (ctx.mBody || "") : newNote.content,
      tags: newNote.tags,
      images: newNote.images,
      color: newNote.color,
    };
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

    // Reset composer state (mobile composer uses these)
    ctx.setTitle("");
    ctx.setContent("");
    ctx.setComposerTagList([]);
    ctx.setComposerTagInput("");
    ctx.setComposerTagFocused(false);
    ctx.setComposerImages([]);
    ctx.setComposerColor("default");
    ctx.setComposerDrawingData({ paths: [], dimensions: null });
    ctx.setComposerType("text");
    ctx.setComposerCollapsed(true);

    // Open the modal in edit mode on a blank state. No IDB/state/enqueue work
    // happens here — materializeDraftIfNeeded() will do it on first real edit.
    ctx.setSidebarOpen(false);
    ctx.setActiveId(tempId);
    ctx.setMType(type);
    ctx.setMTitle("");
    ctx.setMDrawingData({ paths: [], dimensions: null });
    ctx.prevDrawingRef.current = { paths: [], dimensions: null };
    ctx.setMBody("");
    ctx.skipNextDrawingAutosave.current = true;
    ctx.skipNextItemsAutosave.current = true;
    ctx.setMItems([]);
    ctx.prevItemsRef.current = [];
    ctx.setMTagList([]);
    ctx.setMImages([]);
    ctx.setTagInput("");
    ctx.setMColor("default");
    const baselineState = { title: "", content: "", tags: [], images: [], color: "default" };
    ctx.initialModalStateRef.current = baselineState;
    ctx.committedBaselineRef.current = { ...baselineState };
    if (isDraw) ctx.setInitialDrawMode("draw");
    ctx.setViewMode(false);
    ctx.setModalMenuOpen(false);
    pendingDraftRef.current = { id: tempId, type };
    ctx.setOpen(true);
  };

  const isDraftId = (id) =>
    !!pendingDraftRef.current && String(id) === String(pendingDraftRef.current.id);

  return {
    pendingDraftRef,
    materializeDraftIfNeeded,
    handleDirectText: () => createAndOpenBlankNote("text"),
    handleDirectChecklist: () => createAndOpenBlankNote("checklist"),
    handleDirectDraw: () => createAndOpenBlankNote("draw"),
    isDraftId,
  };
}
