import React, { useEffect, useRef, useState, useCallback } from "react";
import { t } from "../../i18n";
import NoteModal from "./NoteModal.jsx";
import useModalState from "../../hooks/useModalState.js";
import useCollaboration from "../../hooks/useCollaboration.js";
import useNoteAiChat from "../../hooks/useNoteAiChat.js";
import { uid, fileToCompressedDataURL, sanitizeFilename, downloadText } from "../../utils/helpers.js";
import {
  isRichContent,
  contentToPlain,
  serializeRichContent,
  legacyMarkdownToRichDoc,
} from "../../utils/richText.js";
import { textToChecklistItems, checklistItemsToText } from "../../utils/noteConversion.js";
import { api } from "../../utils/api.js";
import { mdForDownload } from "../../utils/markdown.jsx";
import { sortNotesByRecency } from "../../utils/noteList.js";

/**
 * SecondaryNoteInstance — self-contained per-note modal controller used as
 * the right-hand pane in side-by-side mode. Maintains feature parity with
 * the primary App.jsx-hosted modal: full edit, autosave (text / checklist
 * / draw / metadata), AI chat, collaboration modal, image viewer, archive,
 * trash, restore, duplicate, convert, pin, color, tags. The primary pane
 * stays driven by App.jsx so the single-note flow is untouched.
 *
 * The two panes coexist visually as siblings under the same shared scrim
 * via NoteModal's splitMode/splitSide props (split-mode CSS positions
 * them at left/right halves and animates a pane closing while the
 * survivor recenters).
 */
export default function SecondaryNoteInstance({
  noteId,                       // requested id (null/undefined = closed)
  splitSide = "right",
  splitClosing,
  forceClosing = false,         // shell-driven close-both signal — OR-s into NoteModal's isModalClosing
  // shell callbacks
  onRequestClosing,             // close animation just started → tell shell to flip recenter flag
  onRequestClose,               // pane animation done → unmount + parent state cleanup
  // SBS AI coordination — shell passes the side ("left" for the right pane in
  // SBS, mirroring the active note) and a flag that hides this pane while the
  // OPPOSITE pane's AI panel takes over its slot. AI open/close callbacks let
  // the shell drive sbsAiActiveSide.
  aiPanelSide,
  sbsOppositeHidden = false,
  onAiOpen,
  onAiClose,
  // shared state & helpers (all owned by App.jsx)
  notes, setNotes,
  currentUser, sessionId, token,
  dark, windowWidth, isLandscapeMobile, isWebView, edgeToEdgeLandscape,
  tagFilter, tagsWithCounts,
  logoLibrary, addLogoToLibrary, deleteLogoFromLibrary,
  editorToolbarMode, pasteMode, checklistInsertPosition, checklistRemoveSectionBehavior,
  aiAssistantEnabled,
  syncState,
  // Persistence
  acquireLocalLease, releaseLocalLease, releaseLocalLeaseWithPrune,
  enqueueAndSync, enqueueWithLease,
  idbGetNote, idbPutNote, idbDeleteNote,
  addDeleteTombstone,
  // UI helpers
  showToast,
  showGenericConfirm,
  isCollaborativeNote,
  readModeEnabled = true,
}) {
  // ─── Modal state (own instance) ────────────────────────────────────────
  const closeModalRef = useRef(null);
  const {
    open, setOpen,
    activeId, setActiveId,
    mType, setMType,
    mTitle, setMTitle,
    mBody, setMBody,
    mTagList, setMTagList,
    tagInput, setTagInput,
    modalTagFocused, setModalTagFocused,
    mColor, setMColor,
    viewMode, setViewMode,
    mImages, setMImages,
    savingModal, setSavingModal,
    confirmDeleteOpen, setConfirmDeleteOpen,
    isModalClosing, setIsModalClosing,
    modalClosingTimerRef,
    mItems, setMItems,
    mDrawingData, setMDrawingData,
    showModalFmt, setShowModalFmt,
    showModalColorPop, setShowModalColorPop,
    modalKebabOpen, setModalKebabOpen,
    imageMenuOpen, setImageMenuOpen,
    logoPickerOpen, setLogoPickerOpen,
    imgViewOpen, imgViewIndex,
    mobileNavVisible,
    modalScrollable,
    modalTagInputRef, modalTagBtnRef, suppressTagBlurRef,
    mBodyRef, modalFileRef, modalIconFileRef, modalFmtBtnRef, modalColorBtnRef,
    scrimClickStartRef,
    noteViewRef, modalScrollRef, savedModalScrollRatioRef,
    activeNoteObj, editedStamp, modalHasChanges,
    addTags, handleTagKeyDown, handleTagBlur, handleTagPaste,
    openImageViewer, closeImageViewer, nextImage, prevImage, resetMobileNav,
    onModalBodyClick,
  } = useModalState({ notes, currentUser, closeModalRef });

  // ─── Collaboration (own instance) ──────────────────────────────────────
  const {
    collaborationModalOpen, setCollaborationModalOpen,
    addModalCollaborators,
    removeCollaborator,
    loadCollaboratorsForAddModal,
    addCollaboratorsBatch,
    setCollaboratorAccess,
    availableUsers,
    availableLoading,
  } = useCollaboration(token, {
    currentUser, activeId,
    showToast,
  });

  // ─── Note-AI chat (own instance) ───────────────────────────────────────
  const noteAi = useNoteAiChat({
    open,
    activeId,
    note: { mTitle, mType, mTagList, mItems, mDrawingData, mBody },
    onOpen: onAiOpen,
    onClose: onAiClose,
    onModalClose: onAiClose,
    errorLabel: "Note AI error (secondary):",
  });
  const { restoreSavedNoteAi } = noteAi;

  // ─── Initial / committed baseline tracking ─────────────────────────────
  const initialModalStateRef = useRef(null);
  const committedBaselineRef = useRef(null);

  // Drawing autosave bookkeeping
  const skipNextItemsAutosave = useRef(false);
  const prevItemsRef = useRef([]);
  const skipNextDrawingAutosave = useRef(false);
  const prevDrawingRef = useRef({ paths: [], dimensions: null });
  const pendingDrawingSaveRef = useRef(null);
  const drawingDebounceTimerRef = useRef(null);
  const drawNoteBodyRef = useRef("");

  // Initial draw mode (always null in SBS — opening from a card opens in view)
  const [initialDrawMode, setInitialDrawMode] = useState(null);

  // ─── Generic auto-save for text content, used by every flow below ──────
  const currentUserId = currentUser?.id;
  const autoSaveTextNote = useCallback(
    async (id, fields, existingLeaseId, noteType = "text") => {
      const nId = String(id);
      const lid = existingLeaseId || acquireLocalLease(nId);
      const nowIso = new Date().toISOString();

      setNotes((prev) =>
        prev.map((n) =>
          String(n.id) === nId
            ? { ...n, ...fields, updated_at: nowIso, client_updated_at: nowIso }
            : n,
        ),
      );

      try {
        const existing = await idbGetNote(nId, currentUserId, sessionId);
        if (existing) {
          await idbPutNote(
            { ...existing, ...fields, updated_at: nowIso, client_updated_at: nowIso },
            currentUserId,
            sessionId,
          );
        }
      } catch (e) {
        console.error("[SBS] IDB text auto-save failed:", e);
        return false;
      }

      try {
        await enqueueAndSync({
          type: "patch",
          noteId: nId,
          payload: { ...fields, type: noteType, client_updated_at: nowIso },
        });
      } catch (e) {
        console.error("[SBS] Text enqueue failed:", e);
        return false;
      }
      releaseLocalLeaseWithPrune(nId, lid);
      return true;
    },
    [
      acquireLocalLease, releaseLocalLeaseWithPrune,
      enqueueAndSync, idbGetNote, idbPutNote,
      setNotes,
      currentUserId, sessionId,
    ],
  );

  // ─── openModal: load the passed-in note id into modal state ────────────
  const openNoteIntoModal = useCallback((id) => {
    const n = notes.find((x) => String(x.id) === String(id));
    if (!n) return;
    setActiveId(String(id));
    setMType(n.type || "text");
    setMTitle(n.title || "");
    let drawNoteText = "";
    if (n.type === "draw") {
      try {
        const drawingData = JSON.parse(n.content || "[]");
        const normalizedData = Array.isArray(drawingData)
          ? { paths: drawingData, dimensions: null }
          : drawingData;
        drawNoteText = normalizedData.text || "";
        const { text: _discardText, ...cleanDrawingData } = normalizedData;
        setMDrawingData(cleanDrawingData);
        prevDrawingRef.current = cleanDrawingData;
        setMBody(drawNoteText);
      } catch {
        setMDrawingData({ paths: [], dimensions: null });
        prevDrawingRef.current = { paths: [], dimensions: null };
        setMBody("");
      }
      skipNextDrawingAutosave.current = true;
    } else {
      setMBody(n.content || "");
      setMDrawingData({ paths: [], dimensions: null });
      prevDrawingRef.current = { paths: [], dimensions: null };
    }
    skipNextItemsAutosave.current = true;
    setMItems(Array.isArray(n.items) ? n.items : []);
    prevItemsRef.current = Array.isArray(n.items) ? n.items : [];
    setMTagList(Array.isArray(n.tags) ? n.tags : []);
    setMImages(Array.isArray(n.images) ? n.images : []);
    setTagInput("");
    setMColor(n.color || "default");

    const baselineState = {
      title: n.title || "",
      content: n.type === "draw" ? drawNoteText : (n.content || ""),
      tags: Array.isArray(n.tags) ? n.tags : [],
      images: Array.isArray(n.images) ? n.images : [],
      color: n.color || "default",
    };
    initialModalStateRef.current = baselineState;
    committedBaselineRef.current = { ...baselineState };

    setViewMode(n.type !== "audio" && readModeEnabled);
    setOpen(true);

    restoreSavedNoteAi(id);
  }, [notes, setActiveId, setMType, setMTitle, setMDrawingData, setMBody, setMItems, setMTagList, setMImages, setTagInput, setMColor, setViewMode, setOpen, readModeEnabled, restoreSavedNoteAi]);

  // Open whenever the controlled noteId prop changes
  useEffect(() => {
    if (noteId && (!open || String(activeId) !== String(noteId))) {
      openNoteIntoModal(noteId);
    } else if (!noteId && open) {
      // External request to drop without animation
      setOpen(false);
      setActiveId(null);
    }
  }, [noteId]); // eslint-disable-line react-hooks/exhaustive-deps -- reacts to the requested note only, not to its own open state

  // ─── Auto-save metadata (color/tags/images) ────────────────────────────
  useEffect(() => {
    if (!open || !activeId) return;
    const initial = initialModalStateRef.current;
    if (!initial) return;
    const colorChanged = initial.color !== mColor;
    const tagsChanged = JSON.stringify(initial.tags) !== JSON.stringify(mTagList);
    const imagesChanged = JSON.stringify(initial.images) !== JSON.stringify(mImages);
    if (!colorChanged && !tagsChanged && !imagesChanged) return;

    const leaseId = acquireLocalLease(String(activeId));
    const metaPatch = {};
    if (colorChanged) metaPatch.color = mColor;
    if (tagsChanged) metaPatch.tags = mTagList;
    if (imagesChanged) metaPatch.images = mImages;

    const committedFields = {
      ...(colorChanged ? { color: mColor } : {}),
      ...(tagsChanged ? { tags: mTagList } : {}),
      ...(imagesChanged ? { images: mImages } : {}),
    };
    initialModalStateRef.current = { ...initial, ...committedFields };

    const noteType = mType || "text";
    autoSaveTextNote(activeId, metaPatch, leaseId, noteType).then((ok) => {
      if (ok && committedBaselineRef.current) {
        committedBaselineRef.current = { ...committedBaselineRef.current, ...committedFields };
      }
    });
  }, [mColor, mTagList, mImages, open, activeId, mType, autoSaveTextNote, acquireLocalLease]);

  // ─── Auto-save text content (title + body) for text & checklist ────────
  useEffect(() => {
    if (!open || !activeId) return;
    if (mType !== "text" && mType !== "checklist") return;
    const initial = initialModalStateRef.current;
    if (!initial) return;
    const titleChanged = initial.title !== mTitle.trim();
    const bodyAppliesToType = mType === "text";
    const contentChanged = bodyAppliesToType && initial.content !== mBody;
    if (!titleChanged && !contentChanged) return;

    const nId = String(activeId);
    const leaseId = acquireLocalLease(nId);
    let transferred = false;
    const timeoutId = setTimeout(() => {
      transferred = true;
      const contentPatch = {};
      if (titleChanged) contentPatch.title = mTitle.trim();
      if (contentChanged) contentPatch.content = mBody;
      const committedFields = {
        ...(titleChanged ? { title: mTitle.trim() } : {}),
        ...(contentChanged ? { content: mBody } : {}),
      };
      if (initialModalStateRef.current) {
        initialModalStateRef.current = { ...initialModalStateRef.current, ...committedFields };
      }
      autoSaveTextNote(activeId, contentPatch, leaseId, mType).then((ok) => {
        if (ok && committedBaselineRef.current) {
          committedBaselineRef.current = { ...committedBaselineRef.current, ...committedFields };
        }
      });
    }, 1000);

    return () => {
      clearTimeout(timeoutId);
      if (!transferred) releaseLocalLease(nId, leaseId);
    };
  }, [mBody, mTitle, open, activeId, mType, autoSaveTextNote, acquireLocalLease, releaseLocalLease]);

  // ─── Drawing autosave (debounced) ──────────────────────────────────────
  useEffect(() => { drawNoteBodyRef.current = mBody; }, [mBody]);

  const flushPendingDrawingSave = useCallback(async () => {
    const pending = pendingDrawingSaveRef.current;
    if (!pending) return;
    pendingDrawingSaveRef.current = null;
    if (drawingDebounceTimerRef.current) {
      clearTimeout(drawingDebounceTimerRef.current);
      drawingDebounceTimerRef.current = null;
    }
    const { noteId: nid, drawingData, leaseId } = pending;
    const nowIso = new Date().toISOString();
    const textBody = drawNoteBodyRef.current || "";
    const drawingContent = JSON.stringify({ ...drawingData, text: textBody });

    setNotes((prev) =>
      prev.map((n) =>
        String(n.id) === nid
          ? { ...n, content: drawingContent, updated_at: nowIso, client_updated_at: nowIso }
          : n,
      ),
    );
    try {
      const existing = await idbGetNote(nid, currentUserId, sessionId);
      if (existing) {
        await idbPutNote(
          { ...existing, content: drawingContent, updated_at: nowIso, client_updated_at: nowIso },
          currentUserId, sessionId,
        );
      }
    } catch (e) {
      console.error("[SBS] IDB drawing flush failed:", e);
      pendingDrawingSaveRef.current = pending;
      return;
    }
    try {
      await enqueueAndSync({
        type: "patch",
        noteId: nid,
        payload: { content: drawingContent, type: "draw", client_updated_at: nowIso },
      });
    } catch (e) {
      console.error("[SBS] Drawing enqueue failed:", e);
      pendingDrawingSaveRef.current = pending;
      return;
    }
    prevDrawingRef.current = drawingData;
    releaseLocalLeaseWithPrune(nid, leaseId);
  }, [
    currentUserId, sessionId, enqueueAndSync,
    idbGetNote, idbPutNote, setNotes,
    releaseLocalLeaseWithPrune,
  ]);

  useEffect(() => {
    if (!open || !activeId || mType !== "draw") return;
    if (skipNextDrawingAutosave.current) {
      skipNextDrawingAutosave.current = false;
      return;
    }
    const prevJson = JSON.stringify(prevDrawingRef.current || { paths: [], dimensions: null });
    const currentJson = JSON.stringify(mDrawingData || { paths: [], dimensions: null });
    if (prevJson === currentJson) return;
    const dirtyNoteId = String(activeId);
    const prev = pendingDrawingSaveRef.current;
    if (prev && prev.leaseId) releaseLocalLease(prev.noteId, prev.leaseId);
    const leaseId = acquireLocalLease(dirtyNoteId);
    pendingDrawingSaveRef.current = { noteId: dirtyNoteId, drawingData: mDrawingData, leaseId };
    const timeoutId = setTimeout(() => {
      drawingDebounceTimerRef.current = null;
      flushPendingDrawingSave();
    }, 500);
    drawingDebounceTimerRef.current = timeoutId;
    return () => {
      clearTimeout(timeoutId);
      drawingDebounceTimerRef.current = null;
    };
  }, [mDrawingData, open, activeId, mType, flushPendingDrawingSave, acquireLocalLease, releaseLocalLease]);

  useEffect(() => {
    if (!open || !activeId || mType !== "draw") flushPendingDrawingSave();
  }, [open, activeId, mType, flushPendingDrawingSave]);

  // Auto-save draw note title + text body
  useEffect(() => {
    if (!open || !activeId || mType !== "draw") return;
    const initial = initialModalStateRef.current;
    if (!initial) return;
    const titleChanged = initial.title !== mTitle.trim();
    const textChanged = initial.content !== mBody;
    if (!titleChanged && !textChanged) return;
    const nId = String(activeId);
    const leaseId = acquireLocalLease(nId);
    let transferred = false;
    const timeoutId = setTimeout(() => {
      transferred = true;
      const patch = {};
      if (titleChanged) patch.title = mTitle.trim();
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
  }, [mBody, mTitle, open, activeId, mType, mDrawingData, autoSaveTextNote, acquireLocalLease, releaseLocalLease]);

  // ─── Live-sync from notes array ────────────────────────────────────────
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

  useEffect(() => {
    if (!open || !activeId) return;
    const n = notes.find((x) => String(x.id) === String(activeId));
    if (!n || n.type !== "draw") return;
    try {
      const serverDrawingData = JSON.parse(n.content || "[]");
      const normalizedData = Array.isArray(serverDrawingData)
        ? { paths: serverDrawingData, dimensions: null }
        : serverDrawingData;
      const { text: _serverText, ...serverCleanData } = normalizedData;
      const prevJson = JSON.stringify(prevDrawingRef.current || []);
      const serverJson = JSON.stringify(serverCleanData);
      if (serverJson !== prevJson) {
        setMDrawingData(serverCleanData);
        prevDrawingRef.current = serverCleanData;
      }
    } catch {
      // ignore
    }
  }, [notes, open, activeId, setMDrawingData]);

  // ─── Modal exit animation + close ──────────────────────────────────────
  const startModalExitAnimation = (afterClose) => {
    const PANEL_CLOSE_DURATION = 640;
    const MODAL_FADE_DURATION = 180;
    const beginFade = () => {
      setIsModalClosing(true);
      modalClosingTimerRef.current = setTimeout(() => {
        modalClosingTimerRef.current = null;
        setOpen(false);
        setActiveId(null);
        setViewMode(true);
        setConfirmDeleteOpen(false);
        setShowModalFmt(false);
        setIsModalClosing(false);
        noteAi.resetNoteAiAfterClose();
        if (typeof afterClose === "function") afterClose();
      }, MODAL_FADE_DURATION);
    };
    if (noteAi.noteAiOpen) {
      noteAi.setNoteAiOpen(false);
      noteAi.stopNoteAi();
      modalClosingTimerRef.current = setTimeout(() => {
        modalClosingTimerRef.current = null;
        beginFade();
      }, PANEL_CLOSE_DURATION);
    } else {
      beginFade();
    }
  };

  const flushBeforeClose = () => {
    if (!activeId) return;
    if (mType === "draw") flushPendingDrawingSave();
    if (mType === "draw") {
      const baseline = committedBaselineRef.current;
      if (baseline) {
        const patch = {};
        if (baseline.title !== mTitle.trim()) patch.title = mTitle.trim();
        if (baseline.color !== mColor) patch.color = mColor;
        if (JSON.stringify(baseline.tags) !== JSON.stringify(mTagList)) patch.tags = mTagList;
        if (JSON.stringify(baseline.images) !== JSON.stringify(mImages)) patch.images = mImages;
        const textChanged = baseline.content !== mBody;
        if (textChanged) {
          patch.content = JSON.stringify({
            ...(mDrawingData || { paths: [], dimensions: null }),
            text: mBody || "",
          });
        }
        if (Object.keys(patch).length > 0) autoSaveTextNote(activeId, patch, null, "draw");
      }
    }
    if (mType === "checklist" && Array.isArray(mItems)) {
      const prevJson = JSON.stringify(prevItemsRef.current || []);
      const currentJson = JSON.stringify(mItems);
      if (prevJson !== currentJson) {
        // checklist sync helper inline (no draft materialization in SBS)
        syncChecklistItems(mItems);
      }
    }
    if (mType === "checklist") {
      const baseline = committedBaselineRef.current;
      if (baseline) {
        const patch = {};
        if (baseline.title !== mTitle.trim()) patch.title = mTitle.trim();
        if (baseline.color !== mColor) patch.color = mColor;
        if (JSON.stringify(baseline.tags) !== JSON.stringify(mTagList)) patch.tags = mTagList;
        if (JSON.stringify(baseline.images) !== JSON.stringify(mImages)) patch.images = mImages;
        if (Object.keys(patch).length > 0) autoSaveTextNote(activeId, patch, null, "checklist");
      }
    }
    if (mType === "text") {
      const baseline = committedBaselineRef.current;
      if (baseline) {
        const patch = {};
        if (baseline.title !== mTitle.trim()) patch.title = mTitle.trim();
        if (baseline.content !== mBody) patch.content = mBody;
        if (baseline.color !== mColor) patch.color = mColor;
        if (JSON.stringify(baseline.tags) !== JSON.stringify(mTagList)) patch.tags = mTagList;
        if (JSON.stringify(baseline.images) !== JSON.stringify(mImages)) patch.images = mImages;
        if (Object.keys(patch).length > 0) autoSaveTextNote(activeId, patch);
      }
    }
  };

  const closeModal = () => {
    if (modalClosingTimerRef.current) return;
    flushBeforeClose();
    if (onRequestClosing) {
      // SBS path: shell drives the timeline in lockstep with the LEFT
      // pane's recenter animation. We just signal "closing started"; the
      // shell will unmount us via the noteId prop when it's done. No
      // local exit animation here — the splitClosing CSS rule on the
      // scrim drives the visible fade-out.
      onRequestClosing();
      return;
    }
    startModalExitAnimation(() => {
      onRequestClose?.();
    });
  };
  // eslint-disable-next-line react-hooks/refs -- keeps the ref given to useModalState pointing at the latest closeModal
  closeModalRef.current = closeModal;

  // ─── saveModal ─────────────────────────────────────────────────────────
  const saveModal = async () => {
    if (activeId == null) return;
    setSavingModal(true);
    const noteId = String(activeId);
    const nowIso = new Date().toISOString();

    if (mType === "text") {
      const patch = {};
      const baseline = committedBaselineRef.current;
      if (baseline) {
        if (baseline.title !== mTitle.trim()) patch.title = mTitle.trim();
        if (baseline.content !== mBody) patch.content = mBody;
        if (baseline.color !== mColor) patch.color = mColor;
        if (JSON.stringify(baseline.tags) !== JSON.stringify(mTagList)) patch.tags = mTagList;
        if (JSON.stringify(baseline.images) !== JSON.stringify(mImages)) patch.images = mImages;
      } else {
        Object.assign(patch, {
          title: mTitle.trim(), content: mBody, color: mColor,
          tags: mTagList, images: mImages,
        });
      }
      if (Object.keys(patch).length > 0) autoSaveTextNote(activeId, patch);
    } else {
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
          : {
              ...base, type: "draw",
              content: JSON.stringify({ ...mDrawingData, text: mBody || "" }),
              items: [], client_updated_at: nowIso,
            };
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
        console.error("[SBS] IDB update failed:", e);
        setSavingModal(false);
        return;
      }
      setNotes((prev) =>
        prev.map((n) => (String(n.id) === noteId ? { ...n, ...updatedFields } : n)),
      );
      const enqueued = await enqueueWithLease(noteId, { type: "update", noteId, payload }, leaseId);
      if (!enqueued) {
        setSavingModal(false);
        return;
      }
      prevItemsRef.current = mType === "checklist" ? (Array.isArray(mItems) ? mItems : []) : [];
      prevDrawingRef.current = mType === "draw" ? mDrawingData || { paths: [], dimensions: null } : { paths: [], dimensions: null };
    }
    setSavingModal(false);
  };

  // ─── deleteModal ───────────────────────────────────────────────────────
  const deleteModal = async (mode) => {
    if (activeId == null) return;
    const note = notes.find((n) => String(n.id) === String(activeId));
    const nid = String(activeId);
    const isOwner = !note || note.user_id === currentUser?.id;
    const isCollabNote = (note?.collaborators?.length || 0) > 0;
    const nowIso = new Date().toISOString();

    if (tagFilter === "TRASHED") {
      const leaseId = acquireLocalLease(nid);
      addDeleteTombstone(nid);
      try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("notePermanentlyDeleted"), "success", undefined, "trash-x");
      await enqueueWithLease(nid, { type: "permanentDelete", noteId: nid, payload: { client_updated_at: nowIso } }, leaseId);
    } else if (isOwner && isCollabNote && mode === "delete_for_all") {
      const leaseId = acquireLocalLease(nid);
      try {
        const existing = await idbGetNote(nid, currentUser?.id, sessionId);
        if (existing) await idbPutNote({ ...existing, trashed: true, collaborators: [], client_updated_at: nowIso }, currentUser?.id, sessionId);
      } catch (e) { console.error(e); }
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("noteDeletedForAll"), "success", undefined, "trash-x");
      await enqueueWithLease(nid, { type: "trash", noteId: nid, payload: { client_updated_at: nowIso, mode: "delete_for_all" } }, leaseId);
    } else if (isOwner && isCollabNote) {
      try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("noteMovedToTrash"), "success", undefined, "trash");
      const leaseId = acquireLocalLease(nid);
      await enqueueWithLease(nid, { type: "trash", noteId: nid, payload: { client_updated_at: nowIso, mode: "remove_self" } }, leaseId);
    } else if (!isOwner) {
      try { await idbDeleteNote(nid, currentUser?.id, sessionId); } catch (e) { console.error(e); }
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
      closeModal();
      showToast(t("noteMovedToTrash"), "success", undefined, "trash");
      const leaseId = acquireLocalLease(nid);
      await enqueueWithLease(nid, { type: "trash", noteId: nid, payload: { client_updated_at: nowIso, mode: "remove_self" } }, leaseId);
    } else {
      const leaseId = acquireLocalLease(nid);
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

  // ─── restoreFromTrash, archive, pin ────────────────────────────────────
  const restoreFromTrash = async (id) => {
    const nid = String(id);
    const leaseId = acquireLocalLease(nid);
    const nowIso = new Date().toISOString();
    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) {
        await idbPutNote({ ...existing, trashed: false, client_updated_at: nowIso }, currentUser?.id, sessionId);
      }
    } catch (e) { console.error(e); }
    setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
    closeModal();
    showToast(t("noteRestoredFromTrash"), "success", undefined, "restore");
    await enqueueWithLease(nid, { type: "restore", noteId: nid, payload: { client_updated_at: nowIso } }, leaseId);
  };

  const handleArchiveNote = async (id, archived) => {
    const nid = String(id);
    const leaseId = acquireLocalLease(nid);
    const nowIso = new Date().toISOString();
    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) await idbPutNote({ ...existing, archived: !!archived, client_updated_at: nowIso }, currentUser?.id, sessionId);
    } catch (e) { console.error(e); }
    if (tagFilter === "ARCHIVED") {
      if (!archived) setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
    } else if (archived) {
      setNotes((prev) => prev.filter((n) => String(n.id) !== nid));
    }
    if (archived) closeModal();
    showToast(
      t(archived ? "noteArchived" : "noteUnarchived"),
      "success",
      undefined,
      archived ? "archive" : "archive-off",
    );
    await enqueueWithLease(nid, { type: "archive", noteId: nid, payload: { archived: !!archived, client_updated_at: nowIso } }, leaseId);
  };

  const togglePin = async (id, toPinned) => {
    const nid = String(id);
    const leaseId = acquireLocalLease(nid);
    const nowIso = new Date().toISOString();
    setNotes((prev) => {
      const updated = prev.map((n) => (String(n.id) !== nid ? n : ({ ...n, pinned: !!toPinned })));
      return sortNotesByRecency(updated);
    });
    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) await idbPutNote({ ...existing, pinned: !!toPinned, client_updated_at: nowIso }, currentUser?.id, sessionId);
    } catch (e) { console.error(e); }
    try {
      await enqueueAndSync({ type: "patch", noteId: nid, payload: { pinned: !!toPinned, client_updated_at: nowIso } });
    } catch {
      return;
    }
    setTimeout(() => releaseLocalLeaseWithPrune(nid, leaseId), 1000);
  };

  // ─── Checklist sync (no draft materialization for SBS) ─────────────────
  const syncChecklistItems = async (newItems) => {
    if (!activeId) return;
    const noteId = String(activeId);
    const nowIso = new Date().toISOString();
    const leaseId = acquireLocalLease(noteId);
    setNotes((prev) =>
      prev.map((n) =>
        String(n.id) === noteId
          ? { ...n, items: newItems, updated_at: nowIso, client_updated_at: nowIso }
          : n,
      ),
    );
    try {
      const existing = await idbGetNote(noteId, currentUser?.id, sessionId);
      if (existing) {
        await idbPutNote({ ...existing, items: newItems, updated_at: nowIso, client_updated_at: nowIso }, currentUser?.id, sessionId);
      }
    } catch (e) {
      console.error("[SBS] IDB checklist update failed:", e);
      return;
    }
    try {
      await enqueueAndSync({
        type: "patch",
        noteId,
        payload: { items: newItems, type: "checklist", content: "", client_updated_at: nowIso },
      });
    } catch (e) {
      console.error("[SBS] Checklist enqueue failed:", e);
      return;
    }
    prevItemsRef.current = newItems;
    releaseLocalLeaseWithPrune(noteId, leaseId);
  };

  // ─── handleDownloadNote ────────────────────────────────────────────────
  const handleDownloadNote = (note) => {
    const md = mdForDownload(note);
    const fname = sanitizeFilename(note.title || `note-${note.id}`) + ".md";
    downloadText(fname, md);
  };

  // ─── addImagesToState ──────────────────────────────────────────────────
  const addImagesToState = async (fileList, setter) => {
    const files = Array.from(fileList || []);
    const results = [];
    for (const f of files) {
      try {
        const src = await fileToCompressedDataURL(f);
        results.push({ id: uid(), src, name: f.name });
      } catch (e) { console.error("[SBS] image load failed", e); }
    }
    if (results.length) setter((prev) => [...prev, ...results]);
  };

  // ─── Note icon (PER-USER, never synced) ────────────────────────────────
  // Persisted via the dedicated per-user endpoint and stored on note.icon,
  // not in the shared images_json — mirrors App.jsx's applyNoteIcon.
  const applyNoteIcon = useCallback(async (icon) => {
    if (!activeId) return;
    const nid = String(activeId);
    setNotes((prev) => prev.map((n) => (String(n.id) === nid ? { ...n, icon: icon || null } : n)));
    try {
      const existing = await idbGetNote(nid, currentUser?.id, sessionId);
      if (existing) await idbPutNote({ ...existing, icon: icon || null }, currentUser?.id, sessionId);
    } catch { /* IDB best-effort */ }
    try {
      if (icon) await api(`/notes/${nid}/icon`, { method: "PUT", token, body: { icon } });
      else await api(`/notes/${nid}/icon`, { method: "DELETE", token });
    } catch (e) { console.error("[SBS] icon save failed", e); }
  }, [activeId, setNotes, currentUser, sessionId, token, idbGetNote, idbPutNote]);

  const setNoteIconFromFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const src = await fileToCompressedDataURL(file);
      await applyNoteIcon({ id: uid(), src, name: file.name });
      addLogoToLibrary?.({ src, name: file.name });
    } catch (e) { console.error("[SBS] icon load failed", e); }
  }, [applyNoteIcon, addLogoToLibrary]);

  const removeNoteIconCb = useCallback(() => { applyNoteIcon(null); }, [applyNoteIcon]);
  const pickNoteIconCb = useCallback((logo) => {
    if (logo?.src) applyNoteIcon({ id: uid(), src: logo.src, name: logo.name });
  }, [applyNoteIcon]);

  // ─── Convert note type ─────────────────────────────────────────────────
  const performConvertNoteType = async () => {
    if (!activeId) return;
    if (mType !== "text" && mType !== "checklist") return;
    if (tagFilter === "TRASHED") return;
    const targetType = mType === "text" ? "checklist" : "text";
    const toastKey = targetType === "checklist" ? "convertedToChecklist" : "convertedToText";

    const textForConversion =
      mType === "text" && isRichContent(mBody) ? contentToPlain(mBody) : mBody || "";
    const newItems = targetType === "checklist" ? textToChecklistItems(textForConversion) : [];
    const newBody = targetType === "text"
      ? serializeRichContent(legacyMarkdownToRichDoc(checklistItemsToText(mItems)))
      : "";

    skipNextItemsAutosave.current = true;
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

    const noteId = String(activeId);
    const nowIso = new Date().toISOString();
    const existingNote = notes.find((n) => String(n.id) === noteId);
    const payload = {
      id: activeId, title: mTitle.trim(), tags: mTagList, images: mImages, color: mColor,
      pinned: !!existingNote?.pinned, type: targetType, content: newBody, items: newItems,
      client_updated_at: nowIso,
    };
    const updatedFields = {
      ...payload, updated_at: nowIso,
      lastEditedBy: currentUser?.email || currentUser?.name, lastEditedAt: nowIso,
    };
    const leaseId = acquireLocalLease(noteId);
    try {
      const existing = await idbGetNote(noteId, currentUser?.id, sessionId);
      if (existing) await idbPutNote({ ...existing, ...updatedFields }, currentUser?.id, sessionId);
    } catch (e) {
      console.error("[SBS] convert IDB failed:", e);
      return;
    }
    setNotes((prev) =>
      prev.map((n) => (String(n.id) === noteId ? { ...n, ...updatedFields } : n)),
    );
    const enqueued = await enqueueWithLease(noteId, { type: "update", noteId, payload }, leaseId);
    if (enqueued) showToast(t(toastKey), "success");
  };

  const convertNoteType = () => {
    if (!activeId) return;
    if (mType !== "text" && mType !== "checklist") return;
    if (tagFilter === "TRASHED") return;
    const targetType = mType === "text" ? "checklist" : "text";
    showGenericConfirm?.({
      title: t(targetType === "checklist" ? "convertToChecklist" : "convertToText"),
      message: t(targetType === "checklist" ? "convertToChecklistConfirm" : "convertToTextConfirm"),
      confirmText: t("convertConfirmAction"),
      onConfirm: () => performConvertNoteType(),
    });
  };

  // ─── Duplicate active note ─────────────────────────────────────────────
  const duplicateActiveNote = async () => {
    if (!activeId || tagFilter === "TRASHED") return;
    const newId = uid();
    const nowIso = new Date().toISOString();
    const baseTitle = (mTitle || "").trim();
    const newTitle = baseTitle ? `${baseTitle} ${t("duplicateSuffix")}` : t("duplicateSuffix");
    const items = Array.isArray(mItems) ? mItems.map((it) => ({ ...it, id: uid() })) : [];
    const isDraw = mType === "draw";
    const content = isDraw
      ? JSON.stringify({
          paths: mDrawingData?.paths || [],
          dimensions: mDrawingData?.dimensions || null,
          text: mBody || "",
        })
      : (mBody || "");
    const newNote = {
      id: newId, type: mType, title: newTitle, content, items,
      tags: Array.isArray(mTagList) ? [...mTagList] : [],
      images: Array.isArray(mImages) ? mImages.map((im) => ({ ...im, id: uid() })) : [],
      color: mColor || "default", pinned: false,
      position: Date.now(), timestamp: nowIso,
      updated_at: nowIso, client_updated_at: nowIso,
    };
    const localNote = { ...newNote, user_id: currentUser?.id, archived: false, trashed: false };
    const leaseId = acquireLocalLease(newId);
    try {
      await idbPutNote(localNote, currentUser?.id, sessionId);
    } catch (e) { console.error("[SBS] dup IDB failed:", e); }
    setNotes((prev) => sortNotesByRecency([localNote, ...(Array.isArray(prev) ? prev : [])]));
    enqueueWithLease(newId, { type: "create", noteId: newId, payload: newNote }, leaseId);
    showToast(t("noteDuplicated"), "success", undefined, "copy");
    closeModal();
  };

  if (!noteId) return null;

  return (
    <NoteModal
      open={open}
      isModalClosing={isModalClosing || forceClosing}
      splitMode
      splitSide={splitSide}
      splitClosing={splitClosing}
      aiPanelSide={aiPanelSide}
      sbsOppositeHidden={sbsOppositeHidden}
      dark={dark}
      windowWidth={windowWidth}
      isLandscapeMobile={isLandscapeMobile}
      isWebView={isWebView}
      edgeToEdgeLandscape={edgeToEdgeLandscape}
      activeId={activeId}
      mType={mType}
      mTitle={mTitle}
      setMTitle={setMTitle}
      mBody={mBody}
      setMBody={setMBody}
      mColor={mColor}
      setMColor={setMColor}
      viewMode={viewMode}
      setViewMode={setViewMode}
      readModeEnabled={readModeEnabled}
      mImages={mImages}
      setMImages={setMImages}
      mItems={mItems}
      setMItems={setMItems}
      mDrawingData={mDrawingData}
      setMDrawingData={setMDrawingData}
      mTagList={mTagList}
      setMTagList={setMTagList}
      tagInput={tagInput}
      setTagInput={setTagInput}
      modalTagFocused={modalTagFocused}
      setModalTagFocused={setModalTagFocused}
      modalScrollRef={modalScrollRef}
      mBodyRef={mBodyRef}
      noteViewRef={noteViewRef}
      modalFileRef={modalFileRef}
      modalIconFileRef={modalIconFileRef}
      modalFmtBtnRef={modalFmtBtnRef}
      modalTagInputRef={modalTagInputRef}
      modalTagBtnRef={modalTagBtnRef}
      suppressTagBlurRef={suppressTagBlurRef}
      modalColorBtnRef={modalColorBtnRef}
      scrimClickStartRef={scrimClickStartRef}
      savedModalScrollRatioRef={savedModalScrollRatioRef}
      activeNoteObj={activeNoteObj}
      editedStamp={editedStamp}
      modalHasChanges={modalHasChanges}
      modalScrollable={modalScrollable}
      tagsWithCounts={tagsWithCounts}
      addTags={addTags}
      handleTagKeyDown={handleTagKeyDown}
      handleTagBlur={handleTagBlur}
      handleTagPaste={handleTagPaste}
      showModalFmt={showModalFmt}
      setShowModalFmt={setShowModalFmt}
      showModalColorPop={showModalColorPop}
      setShowModalColorPop={setShowModalColorPop}
      modalKebabOpen={modalKebabOpen}
      setModalKebabOpen={setModalKebabOpen}
      imageMenuOpen={imageMenuOpen}
      setImageMenuOpen={setImageMenuOpen}
      logoPickerOpen={logoPickerOpen}
      setLogoPickerOpen={setLogoPickerOpen}
      confirmDeleteOpen={confirmDeleteOpen}
      setConfirmDeleteOpen={setConfirmDeleteOpen}
      savingModal={savingModal}
      collaborationModalOpen={collaborationModalOpen}
      setCollaborationModalOpen={setCollaborationModalOpen}
      addModalCollaborators={addModalCollaborators}
      addCollaboratorsBatch={addCollaboratorsBatch}
      availableUsers={availableUsers}
      availableLoading={availableLoading}
      removeCollaborator={removeCollaborator}
      setCollaboratorAccess={setCollaboratorAccess}
      loadCollaboratorsForAddModal={loadCollaboratorsForAddModal}
      imgViewOpen={imgViewOpen}
      imgViewIndex={imgViewIndex}
      mobileNavVisible={mobileNavVisible}
      openImageViewer={openImageViewer}
      closeImageViewer={closeImageViewer}
      nextImage={nextImage}
      prevImage={prevImage}
      resetMobileNav={resetMobileNav}
      notes={notes}
      currentUser={currentUser}
      tagFilter={tagFilter}
      closeModal={closeModal}
      saveModal={saveModal}
      deleteModal={deleteModal}
      restoreFromTrash={restoreFromTrash}
      handleArchiveNote={handleArchiveNote}
      handleDownloadNote={handleDownloadNote}
      togglePin={togglePin}
      addImagesToState={addImagesToState}
      setNoteIconFromFile={setNoteIconFromFile}
      removeNoteIcon={removeNoteIconCb}
      noteIcon={activeNoteObj?.icon || null}
      onPickIcon={pickNoteIconCb}
      logoLibrary={logoLibrary}
      deleteLogoFromLibrary={deleteLogoFromLibrary}
      isCollaborativeNote={isCollaborativeNote}
      syncState={syncState}
      onModalBodyClick={onModalBodyClick}
      syncChecklistItems={syncChecklistItems}
      checklistInsertPosition={checklistInsertPosition}
      checklistRemoveSectionBehavior={checklistRemoveSectionBehavior}
      editorToolbarMode={editorToolbarMode}
      pasteMode={pasteMode}
      onConvertNoteType={convertNoteType}
      onDuplicateNote={duplicateActiveNote}
      initialDrawMode={initialDrawMode}
      onConsumeInitialDrawMode={() => setInitialDrawMode(null)}
      aiAssistantEnabled={aiAssistantEnabled}
      {...noteAi.modalProps}
    />
  );
}
