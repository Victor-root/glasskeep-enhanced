import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { askNoteAIStream } from "../ai.js";
import { localizeServerError } from "../utils/serverErrors.js";

const noteAiStorageKey = (id) =>
  id != null && id !== "" ? `glass-keep-note-ai-${id}` : null;

function loadSavedNoteAiMessages(id) {
  const key = noteAiStorageKey(id);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    );
  } catch {
    return null;
  }
}

function persistNoteAiMessages(id, messages) {
  const key = noteAiStorageKey(id);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(messages));
  } catch { /* localStorage may be full or disabled: best-effort */ }
}

function removeSavedNoteAi(id) {
  const key = noteAiStorageKey(id);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch { /* storage unavailable: nothing to remove */ }
}

/**
 * Per-note AI chat panel of a note modal. The conversation is in-memory
 * and wiped on close by default; the save button opts a note into
 * persistence (mirrored to localStorage, restored on next open until the
 * user resets it).
 *
 * `note` is the editor state of the open note, so unsaved local edits are
 * part of the AI context. `onOpen` / `onClose` let a side-by-side shell
 * follow the panel; `onModalClose` runs when the hosting modal closes.
 */
export default function useNoteAiChat({
  open,
  activeId,
  note,
  onOpen,
  onClose,
  onModalClose,
  errorLabel = "Note AI error:",
}) {
  const [noteAiOpen, setNoteAiOpen] = useState(false);
  const [noteAiHasBeenOpened, setNoteAiHasBeenOpened] = useState(false);
  const [noteAiMessages, setNoteAiMessages] = useState([]);
  const [noteAiLoading, setNoteAiLoading] = useState(false);
  const [noteAiError, setNoteAiError] = useState(null);
  const [noteAiSaved, setNoteAiSaved] = useState(false);
  // AbortController of the in-flight streaming request. Stop aborts it;
  // the partial assistant message stays visible as it had streamed in.
  const noteAiAbortRef = useRef(null);

  // The conversation only exists in the context of an open note. Saved
  // conversations stay in memory so the next open of the same note
  // resumes instantly; throwaway ones are wiped.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the note AI panel when the note modal closes
      setNoteAiOpen(false);
      setNoteAiError(null);
      setNoteAiLoading(false);
      if (!noteAiSaved) setNoteAiMessages([]);
      onModalClose?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when the modal opens/closes or the save flag flips
  }, [open, noteAiSaved]);

  // Flush a saved conversation whenever a turn lands. Gated on the panel
  // being open so a mid-flight note switch can't write to the wrong key,
  // and skipped while streaming so the JSON isn't rewritten per chunk.
  useEffect(() => {
    if (!noteAiOpen) return;
    if (!noteAiSaved) return;
    if (!activeId) return;
    if (noteAiLoading) return;
    persistNoteAiMessages(activeId, noteAiMessages);
  }, [noteAiMessages, noteAiSaved, activeId, noteAiOpen, noteAiLoading]);

  const stopNoteAi = () => {
    const ctrl = noteAiAbortRef.current;
    if (ctrl) {
      try { ctrl.abort(); } catch { /* abort is best-effort */ }
    }
  };

  const openNoteAi = () => {
    setNoteAiOpen(true);
    setNoteAiHasBeenOpened(true);
    setNoteAiError(null);
    onOpen?.();
    // A conversation already in memory (re-opening after a mobile
    // "back to note" hide) is kept intact.
    if (noteAiMessages.length > 0) return;
    const saved = loadSavedNoteAiMessages(activeId);
    if (saved && saved.length > 0) {
      setNoteAiMessages(saved);
      setNoteAiSaved(true);
    } else {
      setNoteAiMessages([]);
      setNoteAiSaved(false);
    }
  };

  const closeNoteAi = () => {
    setNoteAiOpen(false);
    setNoteAiHasBeenOpened(false);
    setNoteAiError(null);
    setNoteAiLoading(false);
    onClose?.();
    if (!noteAiSaved) setNoteAiMessages([]);
  };

  // Mobile "back to note": hides the panel and keeps the conversation.
  const hideNoteAi = () => {
    setNoteAiOpen(false);
    setNoteAiError(null);
    onClose?.();
  };

  const saveNoteAi = () => {
    if (!activeId) return;
    setNoteAiSaved(true);
    persistNoteAiMessages(activeId, noteAiMessages);
  };

  const resetNoteAi = () => {
    setNoteAiSaved(false);
    setNoteAiMessages([]);
    setNoteAiError(null);
    if (activeId) removeSavedNoteAi(activeId);
  };

  // Opening a note with a saved conversation pre-loads it and shows the
  // header toggle straight away.
  const restoreSavedNoteAi = useCallback((id) => {
    const savedMsgs = loadSavedNoteAiMessages(id);
    if (savedMsgs && savedMsgs.length > 0) {
      setNoteAiMessages(savedMsgs);
      setNoteAiSaved(true);
      setNoteAiHasBeenOpened(true);
    }
  }, []);

  // Once the modal has fully closed: the header toggle must not reappear
  // on the next note. Saved conversations remain in localStorage.
  const resetNoteAiAfterClose = useCallback(() => {
    setNoteAiHasBeenOpened(false);
    setNoteAiMessages([]);
    setNoteAiSaved(false);
    setNoteAiError(null);
  }, []);

  const sendNoteAiMessage = async (question) => {
    const q = (question || "").trim();
    if (!q || noteAiLoading) return;

    const { mTitle, mType, mTagList, mItems, mDrawingData, mBody } = note;
    const noteSnapshot = {
      id: activeId,
      title: mTitle || "",
      type: mType,
      tags: Array.isArray(mTagList) ? mTagList : [],
      ...(mType === "checklist"
        ? { items: Array.isArray(mItems) ? mItems : [] }
        : mType === "draw"
        ? {
            content:
              typeof mDrawingData === "string"
                ? mDrawingData
                : JSON.stringify(mDrawingData || {}),
          }
        : { content: mBody || "" }),
    };

    const userMsg = { role: "user", content: q };
    const historyForRequest = noteAiMessages;
    setNoteAiMessages((prev) => [...prev, userMsg]);
    setNoteAiError(null);
    setNoteAiLoading(true);

    // The first delta seeds an assistant message, the next ones grow it in
    // place. Loading stays true for the whole stream so a second turn
    // can't race the live one.
    let firstChunkSeen = false;
    let assistantText = "";
    const ctrl = new AbortController();
    noteAiAbortRef.current = ctrl;
    try {
      await askNoteAIStream({
        note: noteSnapshot,
        messages: historyForRequest,
        question: q,
        signal: ctrl.signal,
        onChunk: (delta) => {
          assistantText += delta;
          if (!firstChunkSeen) {
            firstChunkSeen = true;
            setNoteAiMessages((prev) => [
              ...prev,
              { role: "assistant", content: assistantText },
            ]);
          } else {
            setNoteAiMessages((prev) => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              if (!last || last.role !== "assistant") return prev;
              const next = prev.slice(0, -1);
              next.push({ ...last, content: assistantText });
              return next;
            });
          }
        },
      });
      if (!firstChunkSeen) {
        setNoteAiError(t("noteAiChatGenericError"));
      }
    } catch (err) {
      // A Stop click aborts silently and keeps the partial answer.
      if (!(err?.name === "AbortError" || ctrl.signal.aborted)) {
        console.error(errorLabel, err);
        const fallback = t("noteAiChatGenericError");
        setNoteAiError(
          typeof err?.message === "string" && err.message
            ? localizeServerError(err.message, "noteAiChatGenericError")
            : fallback,
        );
      }
    } finally {
      if (noteAiAbortRef.current === ctrl) noteAiAbortRef.current = null;
      setNoteAiLoading(false);
    }
  };

  return {
    noteAiOpen,
    setNoteAiOpen,
    stopNoteAi,
    restoreSavedNoteAi,
    resetNoteAiAfterClose,
    // Props of NoteModal's AI panel.
    modalProps: {
      noteAiOpen,
      noteAiHasBeenOpened,
      noteAiMessages,
      noteAiLoading,
      noteAiError,
      noteAiSaved,
      noteAiCanSave: !!activeId,
      onOpenNoteAi: openNoteAi,
      onCloseNoteAi: closeNoteAi,
      onHideNoteAi: hideNoteAi,
      onSendNoteAiMessage: sendNoteAiMessage,
      onStopNoteAi: stopNoteAi,
      onSaveNoteAi: saveNoteAi,
      onResetNoteAi: resetNoteAi,
    },
  };
}
