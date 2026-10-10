import { t } from "../i18n";
import {
  getAllNotes as idbGetAllNotes,
  getNote as idbGetNote,
  putNote as idbPutNote,
  deleteNote as idbDeleteNote,
} from "../sync/localDb.js";
import { mdForDownload } from "../utils/markdown.jsx";
import { uid, sanitizeFilename, downloadText, triggerBlobDownload, fileToCompressedDataURL } from "../utils/helpers.js";
import { sortNotesByRecency, computeRestoredPosition, sortByPositionDesc } from "../utils/noteList.js";
import { textToChecklistItems, checklistItemsToText } from "../utils/noteConversion.js";
import { isRichContent, contentToPlain, serializeRichContent, legacyMarkdownToRichDoc } from "../utils/richText.js";
import { parseAudioContent, isAudioContentEmpty, extensionForMime } from "../utils/audioNote.js";
import { dataUrlToBlob } from "../utils/audioConvert.js";

/**
 * What can be done to the note open in a note pane: close it (flushing
 * pending edits, and trashing a note left empty), save, delete in its
 * several flavours, restore, archive, pin, set a reminder, convert
 * text/checklist, duplicate, download.
 *
 * All local-first, like the autosave: React state and IndexedDB first,
 * then a queued sync action under a lease.
 *
 * Both panes run it, each with its own modal state and editor.
 * finishClose ends every closeModal once the edits are flushed: the
 * primary modal animates out, the side-by-side right pane hands over to
 * the shell. The last options keep the points where the right pane has
 * always behaved differently:
 *  - audioNotes: save and download know audio notes;
 *  - trashEmptyNoteOnClose: a note left empty is trashed on close;
 *  - restoreAtChronologicalPosition: a restored note gets a position
 *    among the active notes by its creation date;
 *  - leaveArchiveViewOnUnarchive: unarchiving from the Archive view goes
 *    back to all notes (needs setTagFilter);
 *  - duplicateKeepsIcon: a duplicate gets the note icon too (needs
 *    applyNoteIcon).
 */
export default function useNoteActions({
  modal,
  editor,
  notes,
  setNotes,
  currentUser,
  sessionId,
  tagFilter,
  setTagFilter,
  acquireLocalLease,
  releaseLocalLeaseWithPrune,
  addDeleteTombstone,
  enqueueAndSync,
  enqueueWithLease,
  showToast,
  showGenericConfirm,
  applyNoteIcon,
  finishClose,
  audioNotes = true,
  trashEmptyNoteOnClose = true,
  restoreAtChronologicalPosition = true,
  leaveArchiveViewOnUnarchive = true,
  duplicateKeepsIcon = true,
}) {
  const {
    activeId,
    mType, setMType, mTitle, mBody, setMBody,
    mItems, setMItems, mDrawingData,
    mTagList, mImages, mColor,
    setSavingModal, modalClosingTimerRef,
    activeNoteObj,
  } = modal;
  const {
    skipNextItemsAutosaveRef, prevItemsRef, prevDrawingRef,
    initialModalStateRef, committedBaselineRef,
    pendingDraftRef, freshlyCreatedNoteRef, materializeDraftIfNeeded,
    autoSaveTextNote, flushOpenNote,
  } = editor;

  /** -------- Download single note .md (or audio file for audio notes) -------- */
  const handleDownloadNote = async (note) => {
    if (audioNotes && note?.type === "audio") {
      const parsed = parseAudioContent(note.content);
      // Multi-clip notes still download from the kebab as a single file:
      // the first clip. The themed player offers per-clip downloads with
      // an explicit format choice (original / WAV); that's the richer UX.
      const clip = parsed.clips[0];
      if (clip?.audioDataUrl) {
        try {
          const blob = dataUrlToBlob(clip.audioDataUrl);
          const ext = extensionForMime(clip.mimeType || blob.type);
          const fname = sanitizeFilename(note.title || `audio-${note.id}`) + "." + ext;
          await triggerBlobDownload(fname, blob);
          return;
        } catch (e) {
          console.error("Audio download failed:", e);
        }
      }
      return;
    }
    const md = mdForDownload(note);
    const fname = sanitizeFilename(note.title || `note-${note.id}`) + ".md";
    downloadText(fname, md);
  };

  /** -------- Archive/Unarchive note -------- */
  const handleArchiveNote = async (noteId, archived) => {
    // Archiving a draft counts as a real action: materialise it first so the
    // create reaches the queue before the archive patch follows.
    if (pendingDraftRef.current && String(noteId) === String(pendingDraftRef.current.id)) {
      materializeDraftIfNeeded();
    }
    // Archiving is a durable commitment: clear the freshly-created marker
    // so the empty-on-close auto-trash doesn't undo it for an empty note.
    if (freshlyCreatedNoteRef.current === String(noteId)) {
      freshlyCreatedNoteRef.current = null;
    }
    const nid = String(noteId);
    const leaseId = acquireLocalLease(nid);
    const nowIso = new Date().toISOString();

    // Local-first: apply archive state immediately
    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) await idbPutNote({ ...existing, archived: !!archived, client_updated_at: nowIso }, currentUser?.id, sessionId);
    } catch (e) { console.error(e); }

    // Update UI: remove note from current view (it moved to another view)
    if (tagFilter === "ARCHIVED") {
      if (!archived) {
        setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
        if (leaveArchiveViewOnUnarchive) setTagFilter(null);
      }
    } else {
      if (archived) {
        setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      }
    }

    if (archived) {
      closeModal();
    }

    showToast(
      t(archived ? "noteArchived" : "noteUnarchived"),
      "success",
      undefined,
      archived ? "archive" : "archive-off",
    );

    await enqueueWithLease(nid, { type: "archive", noteId: nid, payload: { archived: !!archived, client_updated_at: nowIso } }, leaseId);
  };

  const addImagesToState = async (fileList, setter) => {
    const files = Array.from(fileList || []);
    const results = [];
    for (const f of files) {
      try {
        const src = await fileToCompressedDataURL(f);
        results.push({ id: uid(), src, name: f.name });
      } catch (e) {
        console.error("Image load failed", e);
      }
    }
    if (results.length) setter((prev) => [...prev, ...results]);
  };

  const closeModal = () => {
    // Prevent double-triggering while exit animation is running
    if (modalClosingTimerRef.current) return;

    // Unmaterialised draft: the user opened a blank note via the creation
    // buttons and never touched it, so nothing was ever persisted. Just run
    // the exit animation and drop the pending state: no IDB/queue work.
    // Defensive: also remove the draft id from `notes` in case some path
    // accidentally added it before closeModal fired (this should be a no-op
    // in the normal flow, but it covers any reproducer where the user
    // reports "empty note appeared in the list" without a materialise step
    // they can identify). Drawing notes additionally fire the empty-note
    // toast so the user gets feedback that the discard happened.
    if (pendingDraftRef.current && String(activeId) === String(pendingDraftRef.current.id)) {
      const draftId = String(pendingDraftRef.current.id);
      const draftType = pendingDraftRef.current.type;
      pendingDraftRef.current = null;
      freshlyCreatedNoteRef.current = null;
      setNotes((prev) => {
        const next = prev.filter((n) => String(n.id) !== draftId);
        return next.length === prev.length ? prev : next;
      });
      if (draftType === "draw") {
        showToast(t("emptyNoteDeleted"), "info", 3000, "trash");
      }
      finishClose();
      return;
    }

    // Auto-trash any note the user emptied before closing: fresh or not.
    // Body emptiness is checked through contentToPlain so the Tiptap JSON
    // envelope (which is never an empty STRING even when the doc is empty)
    // collapses to its actual user-visible text before the trim test.
    //
    // Tags don't count: a fresh note opened from inside a tag filter
    // auto-inherits the tag and would otherwise never qualify. Images
    // DO count as content though: a note that only carries pictures
    // (typical of Google Keep imports) is just as valid as a text-only
    // one and must NOT be auto-deleted on close.
    if (trashEmptyNoteOnClose && activeId) {
      const drawPaths = mType === "draw"
        ? (mDrawingData?.paths || (Array.isArray(mDrawingData) ? mDrawingData : []))
        : [];
      // A "real" stroke needs at least 2 points. A single tap on the
      // canvas (no drag) still commits a one-point path which the user
      // perceives as "I didn't draw anything": without filtering, the
      // auto-trash would skip the note because drawPaths.length is
      // non-zero, and an empty card would stick around in the list.
      // The combination titleEmpty + bodyEmpty + noImages is already
      // conservative enough that a deliberate dot-only drawing with no
      // title and no images is vanishingly rare; applying the filter
      // here lets accidental taps on the canvas resolve to "empty"
      // without keeping a junk card around.
      const meaningfulPaths = drawPaths.filter(
        (p) => Array.isArray(p?.points) && p.points.length >= 2,
      );
      // For each note type, "body" means what the user actually authored:
      // the rich-text doc for text notes, the items list for checklists,
      // the drawing strokes (+ optional inline text) for draw notes.
      // Draw notes' body is the Tiptap text caption envelope (an empty
      // editor still serialises to {"v":1,"format":"tiptap","doc":{...}})
      // so we must collapse it through contentToPlain before trimming:
      // a raw `!mBody?.trim()` would always be false on an empty draw
      // caption and would block the auto-trash entirely.
      const bodyEmpty = mType === "text"
        ? !contentToPlain(mBody).trim()
        : mType === "checklist"
          ? !Array.isArray(mItems) || mItems.length === 0
          : mType === "audio"
            ? isAudioContentEmpty(mBody)
            : !contentToPlain(mBody).trim() && meaningfulPaths.length === 0;
      const titleEmpty = !mTitle?.trim();
      const noImages = !Array.isArray(mImages) || mImages.length === 0;
      if (titleEmpty && bodyEmpty && noImages) {
        const nid = String(activeId);
        const nowIso = new Date().toISOString();
        // Server contract: a note must be trashed before it can be
        // permanently deleted (DELETE /notes/:id/permanent returns 400
        // otherwise). Locally we still want the note gone immediately
        // tombstone + idbDeleteNote handle the UI/storage side. The
        // queue then plays out in FIFO order: trash THEN permanent
        // delete, so the server walks through the legal transition
        // and the note doesn't end up stuck mid-pipeline.
        addDeleteTombstone(nid);
        setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
        showToast(t("emptyNoteDeleted"), "info", 3000, "trash");
        freshlyCreatedNoteRef.current = null;
        (async () => {
          try {
            await idbDeleteNote(nid, currentUser?.id, sessionId);
          } catch { /* IDB best-effort */ }
          const trashLease = acquireLocalLease(nid);
          await enqueueWithLease(
            nid,
            { type: "trash", noteId: nid, payload: { client_updated_at: nowIso } },
            trashLease,
          );
          const purgeLease = acquireLocalLease(nid);
          await enqueueWithLease(
            nid,
            { type: "permanentDelete", noteId: nid, payload: { client_updated_at: nowIso } },
            purgeLease,
          );
        })();

        finishClose();
        return;
      }
    }
    freshlyCreatedNoteRef.current = null;

    flushOpenNote();
    finishClose();
  };

  const saveModal = async () => {
    if (activeId == null) return;
    // Pressing save on a draft counts as committing it. materialize first so
    // the create carries the current state and patches below operate on an
    // existing note.
    if (pendingDraftRef.current && String(activeId) === String(pendingDraftRef.current.id)) {
      materializeDraftIfNeeded();
    }
    // Explicit save = user intent to keep this note even if it's empty.
    // Drop the freshly-created marker so closeModal's auto-trash branch
    // won't undo the commit.
    if (freshlyCreatedNoteRef.current === String(activeId)) {
      freshlyCreatedNoteRef.current = null;
    }
    setSavingModal(true);

    const noteId = String(activeId);
    const nowIso = new Date().toISOString();

    if (mType === "text" || (audioNotes && mType === "audio")) {
      // Text + audio notes: use targeted patch with only changed fields.
      // Use committedBaselineRef so a failed autosave is retried here.
      // Audio's mBody is the serialised {clips, text} JSON; same diff logic
      // applies: the JSON string changes when clips are added/removed.
      const patch = {};
      const baseline = committedBaselineRef.current;
      if (baseline) {
        if (baseline.title !== mTitle.trim()) patch.title = mTitle.trim();
        if (baseline.content !== mBody) patch.content = mBody;
        if (baseline.color !== mColor) patch.color = mColor;
        if (JSON.stringify(baseline.tags) !== JSON.stringify(mTagList)) patch.tags = mTagList;
        if (JSON.stringify(baseline.images) !== JSON.stringify(mImages)) patch.images = mImages;
      } else {
        // No initial state: send everything
        Object.assign(patch, { title: mTitle.trim(), content: mBody, color: mColor, tags: mTagList, images: mImages });
      }

      if (Object.keys(patch).length > 0) {
        autoSaveTextNote(activeId, patch, undefined, mType);
      }
    } else {
      // Checklist / Drawing: keep full update (they manage their own local-first flows)
      const base = {
        id: activeId,
        title: mTitle.trim(),
        tags: mTagList,
        images: mImages,
        color: mColor,
        pinned: !!notes.find((n) => String(n.id) === String(activeId))?.pinned,
      };
      const payload =
        mType === "checklist"
          ? { ...base, type: "checklist", content: "", items: mItems, client_updated_at: nowIso }
          : { ...base, type: "draw", content: JSON.stringify({ ...mDrawingData, text: mBody || "" }), items: [], client_updated_at: nowIso };

      const updatedFields = {
        ...payload,
        updated_at: nowIso,
        client_updated_at: nowIso,
        lastEditedBy: currentUser?.email || currentUser?.name,
        lastEditedAt: nowIso,
      };

      const leaseId = acquireLocalLease(noteId);
      try {
        const existing = await idbGetNote(noteId, currentUser?.id, sessionId);
        if (existing) {
          await idbPutNote({ ...existing, ...updatedFields }, currentUser?.id, sessionId);
        }
      } catch (e) {
        console.error("IndexedDB update failed:", e);
        // IDB failed: don't advance baselines
        setSavingModal(false);
        return;
      }

      setNotes((prev) =>
        prev.map((n) =>
          String(n.id) === noteId ? { ...n, ...updatedFields } : n,
        ),
      );
      const enqueued = await enqueueWithLease(noteId, { type: "update", noteId, payload }, leaseId);
      if (!enqueued) {
        // Enqueue failed: don't advance baselines so closeModal retry can detect diff
        setSavingModal(false);
        return;
      }

      // IDB + enqueue both succeeded: advance committed baselines
      prevItemsRef.current =
        mType === "checklist" ? (Array.isArray(mItems) ? mItems : []) : [];
      prevDrawingRef.current =
        mType === "draw"
          ? mDrawingData || { paths: [], dimensions: null }
          : { paths: [], dimensions: null };
    }

    setSavingModal(false);
  };
  const deleteModal = async (mode) => {
    if (activeId == null) return;
    // Draft that was never materialised: deleting it is identical to just
    // closing the modal (nothing has been persisted anywhere).
    if (pendingDraftRef.current && String(activeId) === String(pendingDraftRef.current.id)) {
      closeModal();
      return;
    }
    // The user is explicitly deleting: drop the freshly-created marker so
    // closeModal's auto-trash branch doesn't enqueue a redundant trash on
    // top of whatever delete-flow we're about to run.
    if (freshlyCreatedNoteRef.current === String(activeId)) {
      freshlyCreatedNoteRef.current = null;
    }
    const note = notes.find((n) => String(n.id) === String(activeId));
    const nid = String(activeId);
    const isOwner = !note || note.user_id === currentUser?.id;
    const isCollabNote = (note?.collaborators?.length || 0) > 0;

    if (tagFilter === "TRASHED") {
      // Local-first: permanent delete: tombstone prevents resurrection by loaders/SSE
      const leaseId = acquireLocalLease(nid);
      addDeleteTombstone(nid);
      try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("notePermanentlyDeleted"), "success", undefined, "trash-x");
      await enqueueWithLease(nid, { type: "permanentDelete", noteId: nid, payload: { client_updated_at: new Date().toISOString() } }, leaseId);
    } else if (isOwner && isCollabNote && mode === "delete_for_all") {
      // Owner chose to delete the shared note for everyone.
      // The note lands in the owner's trash (the server sets trashed=1 and
      // revokes collaborators); collaborators lose access via SSE note_deleted.
      const leaseId = acquireLocalLease(nid);
      const nowIso = new Date().toISOString();
      try {
        const existing = await idbGetNote(nid, currentUser?.id, sessionId);
        if (existing) await idbPutNote({ ...existing, trashed: true, collaborators: [], client_updated_at: nowIso }, currentUser?.id, sessionId);
      } catch (e) { console.error(e); }
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("noteDeletedForAll"), "success", undefined, "trash-x");
      await enqueueWithLease(nid, { type: "trash", noteId: nid, payload: { client_updated_at: nowIso, mode: "delete_for_all" } }, leaseId);
    } else if (isOwner && isCollabNote) {
      // Owner chose "remove for me" on a shared note. Server transfers
      // ownership to the first collaborator (note stays live for them) and
      // creates a trashed copy owned by the leaver so they can restore it.
      // The trashed copy has a new id; the next trash view fetches it from
      // the server.
      try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("noteMovedToTrash"), "success", undefined, "trash");
      const leaseId = acquireLocalLease(nid);
      await enqueueWithLease(nid, { type: "trash", noteId: nid, payload: { client_updated_at: new Date().toISOString(), mode: "remove_self" } }, leaseId);
    } else if (!isOwner) {
      // Collaborator "trash": symmetric with the owner-leaves-shared
      // case below: they get a personal copy in their corbeille so
      // the action is recoverable. Without this, the previous spec
      // ("leave the collaboration cleanly, no recovery") read like a
      // permanent delete from the user's POV. The trashed copy is
      // created server-side and the next /notes/trashed fetch picks
      // it up.
      try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("noteMovedToTrash"), "success", undefined, "trash");
      const leaseId = acquireLocalLease(nid);
      await enqueueWithLease(nid, { type: "trash", noteId: nid, payload: { client_updated_at: new Date().toISOString(), mode: "remove_self" } }, leaseId);
    } else {
      // Owner of non-collaborative note: local-first move to trash
      const leaseId = acquireLocalLease(nid);
      const nowIso = new Date().toISOString();
      try {
        const existing = await idbGetNote(nid, currentUser?.id, sessionId);
        if (existing) await idbPutNote({ ...existing, trashed: true, client_updated_at: nowIso }, currentUser?.id, sessionId);
      } catch (e) { console.error(e); }
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("noteMovedToTrash"), "success", undefined, "trash");
      await enqueueWithLease(nid, { type: "trash", noteId: nid, payload: { client_updated_at: nowIso } }, leaseId);
    }
  };

  const restoreFromTrash = async (noteId) => {
    const nid = String(noteId);
    const leaseId = acquireLocalLease(nid);
    const nowIso = new Date().toISOString();
    // Local-first: restore immediately, computing a position that places the note
    // among active notes at the right chronological spot (by creation timestamp).
    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) {
        let placement = {};
        if (restoreAtChronologicalPosition) {
          const activeNotes = await idbGetAllNotes(currentUser?.id, sessionId, "active");
          const sorted = sortByPositionDesc(activeNotes.filter((n) => String(n.id) !== nid));
          placement = { position: computeRestoredPosition(existing, sorted) };
        }
        await idbPutNote({ ...existing, trashed: false, ...placement, client_updated_at: nowIso }, currentUser?.id, sessionId);
      }
    } catch (e) { console.error(e); }
    setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
    closeModal();
    showToast(t("noteRestoredFromTrash"), "success", undefined, "restore");
    await enqueueWithLease(nid, { type: "restore", noteId: nid, payload: { client_updated_at: nowIso } }, leaseId);
  };
  const togglePin = async (id, toPinned) => {
    // Pinning a draft counts as a real action: materialise it first so the
    // create lands in the queue before the pin patch follows.
    if (pendingDraftRef.current && String(id) === String(pendingDraftRef.current.id)) {
      materializeDraftIfNeeded();
    }
    // Pinning is a durable commitment: clear the freshly-created marker so
    // the empty-on-close auto-trash doesn't undo a pinned empty note.
    if (freshlyCreatedNoteRef.current === String(id)) {
      freshlyCreatedNoteRef.current = null;
    }
    const nid = String(id);
    const leaseId = acquireLocalLease(nid);
    const nowIso = new Date().toISOString();

    // Update React state FIRST (synchronous, before any await) for instant UI.
    setNotes((prev) => {
      const updated = prev.map((n) => {
        if (String(n.id) !== nid) return n;
        if (toPinned) return { ...n, pinned: true };
        // When unpinning, just keep the note's existing position: it was
        // assigned when the note was originally in the "others" section and
        // is still valid. No need to recompute.
        return { ...n, pinned: false };
      });
      return sortNotesByRecency(updated);
    });

    // Then persist to IndexedDB and server
    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) await idbPutNote({ ...existing, pinned: !!toPinned, client_updated_at: nowIso }, currentUser?.id, sessionId);
    } catch (e) { console.error(e); }
    // Don't use enqueueWithLease here: it releases the lease immediately after
    // the server responds, but the server also sends an SSE note_updated event
    // that triggers patchSingleNote after a 300ms debounce. If the lease is
    // already released by then, patchSingleNote fetches the server note (which
    // may have a different position) and overwrites the optimistic state, causing
    // a visual flash in Masonry. Instead, release the lease with a delay that
    // covers the SSE debounce window.
    try {
      await enqueueAndSync({ type: "patch", noteId: nid, payload: { pinned: !!toPinned, client_updated_at: nowIso } });
    } catch {
      // On failure, lease stays active: SSE protection maintained
      return;
    }
    // Delay lease release past the SSE debounce (300ms) + patchSingleNote fetch time
    setTimeout(() => releaseLocalLeaseWithPrune(nid, leaseId), 1000);
  };

  /** -------- Set / update / clear a note's reminder -------- */
  // Offline-first like togglePin: optimistic React + IndexedDB update,
  // then a dedicated "reminder" sync op (POST /notes/:id/reminder). Pass
  // a null ISO to clear the reminder. Setting one always re-arms it
  // (clears reminderFiredAt) so a previously-fired reminder fires again.
  const setNoteReminder = async (id, reminderAtIso) => {
    // Reminding a draft counts as a real action: materialise it first so
    // the create lands in the queue before the reminder write follows.
    if (pendingDraftRef.current && String(id) === String(pendingDraftRef.current.id)) {
      materializeDraftIfNeeded();
    }
    // A reminder is a durable commitment: clear the freshly-created marker
    // so the empty-on-close auto-trash doesn't discard a reminded note.
    if (freshlyCreatedNoteRef.current === String(id)) {
      freshlyCreatedNoteRef.current = null;
    }
    const nid = String(id);
    const leaseId = acquireLocalLease(nid);
    const nowIso = new Date().toISOString();
    const reminderAt = reminderAtIso || null;
    console.log(`[reminders] setNoteReminder note=${nid} ->`, reminderAt || "(cleared)");

    // Optimistic state: the chip + the modal bell update instantly.
    setNotes((prev) =>
      prev.map((n) =>
        String(n.id) === nid ? { ...n, reminderAt, reminderFiredAt: null } : n,
      ),
    );

    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) {
        await idbPutNote(
          { ...existing, reminderAt, reminderFiredAt: null, client_updated_at: nowIso },
          currentUser?.id,
          sessionId,
        );
      }
    } catch (e) {
      console.error(e);
    }

    try {
      await enqueueAndSync({
        type: "reminder",
        noteId: nid,
        payload: { reminderAt, client_updated_at: nowIso },
      });
    } catch {
      // On failure the lease stays active so SSE patches can't clobber the
      // optimistic state; the queued op retries when connectivity returns.
      return;
    }
    setTimeout(() => releaseLocalLeaseWithPrune(nid, leaseId), 1000);

    try {
      if (reminderAt) {
        showToast(t("reminderSetToast"), "success", undefined, "reminder");
      } else {
        showToast(t("reminderRemovedToast"), "info", undefined, "reminder");
      }
    } catch {
      /* toast is best-effort feedback */
    }
  };

  /**
   * Convert a note between "text" and "checklist" in place.
   * Preserves content: text lines become items (one per line, checkbox
   * syntax honoured), items become markdown-like lines.
   *
   * Server-side `type` is immutable under PATCH: we persist via a full
   * PUT update, mirroring the checklist branch of `saveModal`.
   */
  const performConvertNoteType = async () => {
    if (!activeId) return;
    if (mType !== "text" && mType !== "checklist") return;
    if (tagFilter === "TRASHED") return;

    const isDraft = !!pendingDraftRef.current && String(activeId) === String(pendingDraftRef.current.id);
    const targetType = mType === "text" ? "checklist" : "text";
    const toastKey = targetType === "checklist" ? "convertedToChecklist" : "convertedToText";

    // Text → checklist: flatten rich JSON (or legacy Markdown) to plain lines
    // so textToChecklistItems can parse bullets / tasks / headings.
    // Checklist → text: wrap the generated Markdown in our rich envelope so
    // the resulting text note opens directly in rich mode (no second-edit
    // upgrade needed).
    const textForConversion =
      mType === "text" && isRichContent(mBody)
        ? contentToPlain(mBody)
        : mBody || "";
    const newItems = targetType === "checklist" ? textToChecklistItems(textForConversion) : [];
    const newBody = targetType === "text"
      ? serializeRichContent(legacyMarkdownToRichDoc(checklistItemsToText(mItems)))
      : "";

    // Local state first: keep the UI responsive even if the sync call lags.
    skipNextItemsAutosaveRef.current = true;
    setMBody(newBody);
    setMItems(newItems);
    setMType(targetType);
    prevItemsRef.current = newItems;
    if (initialModalStateRef.current) {
      initialModalStateRef.current = { ...initialModalStateRef.current, content: newBody };
    }
    if (committedBaselineRef.current) {
      committedBaselineRef.current = { ...committedBaselineRef.current, content: newBody };
    }

    // Draft note: fold the conversion into the pending create payload.
    if (isDraft) {
      pendingDraftRef.current = { ...pendingDraftRef.current, type: targetType };
      materializeDraftIfNeeded({ items: newItems, body: newBody });
      showToast(t(toastKey), "success");
      return;
    }

    // Persisted note: full update via PUT so `type` is actually written server-side.
    const noteId = String(activeId);
    const nowIso = new Date().toISOString();
    const existingNote = notes.find((n) => String(n.id) === noteId);
    const payload = {
      id: activeId,
      title: mTitle.trim(),
      tags: mTagList,
      images: mImages,
      color: mColor,
      pinned: !!existingNote?.pinned,
      type: targetType,
      content: newBody,
      items: newItems,
      client_updated_at: nowIso,
    };
    const updatedFields = {
      ...payload,
      updated_at: nowIso,
      lastEditedBy: currentUser?.email || currentUser?.name,
      lastEditedAt: nowIso,
    };

    const leaseId = acquireLocalLease(noteId);
    try {
      const existing = await idbGetNote(noteId, currentUser?.id, sessionId);
      if (existing) {
        await idbPutNote({ ...existing, ...updatedFields }, currentUser?.id, sessionId);
      }
    } catch (e) {
      console.error("IndexedDB convert failed:", e);
      return;
    }
    setNotes((prev) =>
      prev.map((n) => (String(n.id) === noteId ? { ...n, ...updatedFields } : n)),
    );
    const enqueued = await enqueueWithLease(
      noteId,
      { type: "update", noteId, payload },
      leaseId,
    );
    if (enqueued) showToast(t(toastKey), "success");
  };

  // Public wrapper: gate the conversion behind a confirmation dialog so
  // a misclick on the kebab entry doesn't silently rewrite the note.
  const convertNoteType = () => {
    if (!activeId) return;
    if (mType !== "text" && mType !== "checklist") return;
    if (tagFilter === "TRASHED") return;
    const targetType = mType === "text" ? "checklist" : "text";
    showGenericConfirm({
      title: t(targetType === "checklist" ? "convertToChecklist" : "convertToText"),
      message: t(targetType === "checklist" ? "convertToChecklistConfirm" : "convertToTextConfirm"),
      confirmText: t("convertConfirmAction"),
      onConfirm: () => performConvertNoteType(),
    });
  };

  /** -------- Duplicate the currently-open note --------
   *  Builds a fresh note from the modal's in-memory state (so unsaved
   *  edits are also captured), persists it via the standard create
   *  pipeline (IDB + setNotes + enqueue "create"), and closes the
   *  modal so the new card appears at the top of the grid. */
  const duplicateActiveNote = async () => {
    if (!activeId) return;
    if (tagFilter === "TRASHED") return;
    // If the modal still hosts an unmaterialised draft, materialise it
    // first so we don't end up with a duplicate of something that the
    // close flow would later drop as a never-persisted draft.
    if (pendingDraftRef.current && String(activeId) === String(pendingDraftRef.current.id)) {
      materializeDraftIfNeeded();
    }
    const newId = uid();
    const nowIso = new Date().toISOString();
    const baseTitle = (mTitle || "").trim();
    const newTitle = baseTitle
      ? `${baseTitle} ${t("duplicateSuffix")}`
      : t("duplicateSuffix");
    const items = Array.isArray(mItems)
      ? mItems.map((it) => ({ ...it, id: uid() }))
      : [];
    const isDraw = mType === "draw";
    const content = isDraw
      ? JSON.stringify({
          paths: mDrawingData?.paths || [],
          dimensions: mDrawingData?.dimensions || null,
          text: mBody || "",
        })
      : (mBody || "");
    const newNote = {
      id: newId,
      type: mType,
      title: newTitle,
      content,
      items,
      tags: Array.isArray(mTagList) ? [...mTagList] : [],
      images: Array.isArray(mImages) ? mImages.map((im) => ({ ...im, id: uid() })) : [],
      color: mColor || "default",
      pinned: false,
      position: Date.now(),
      timestamp: nowIso,
      updated_at: nowIso,
      client_updated_at: nowIso,
    };
    const localNote = {
      ...newNote,
      user_id: currentUser?.id,
      archived: false,
      trashed: false,
    };
    const leaseId = acquireLocalLease(newId);
    try {
      await idbPutNote(localNote, currentUser?.id, sessionId);
    } catch (e) {
      console.error("Duplicate note IDB put failed:", e);
    }
    setNotes((prev) =>
      sortNotesByRecency([localNote, ...(Array.isArray(prev) ? prev : [])]),
    );
    enqueueWithLease(newId, { type: "create", noteId: newId, payload: newNote }, leaseId);
    // The icon (logo badge) is per-user and lives outside the note payload
    // (its own table + endpoint: see applyNoteIcon), so it isn't carried by
    // the "create" enqueue above and must be copied over explicitly.
    if (duplicateKeepsIcon && activeNoteObj?.icon) {
      applyNoteIcon(newId, activeNoteObj.icon);
    }
    showToast(t("noteDuplicated"), "success", undefined, "copy");
    closeModal();
  };

  // Checklist drag-and-drop is handled by useChecklistDrag inside NoteModal

  return {
    closeModal,
    saveModal,
    deleteModal,
    restoreFromTrash,
    handleArchiveNote,
    togglePin,
    setNoteReminder,
    convertNoteType,
    duplicateActiveNote,
    handleDownloadNote,
    addImagesToState,
  };
}
