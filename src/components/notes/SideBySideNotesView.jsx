import React, { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../i18n";
import { CloseIcon } from "../../icons/index.jsx";
import { modalBgFor } from "../../utils/colors.js";
import { renderSafeMarkdown, linkifyContactsHTML } from "../../utils/markdown.jsx";
import { contentToHTML, isRichContent } from "../../utils/richText.js";

const PANE_ANIM_MS = 320;

function getNoteHTML(note) {
  if (!note) return "";
  const content = note.content || "";
  if (isRichContent(content)) {
    try {
      return contentToHTML(content);
    } catch {
      return "";
    }
  }
  try {
    return linkifyContactsHTML(renderSafeMarkdown(content));
  } catch {
    return "";
  }
}

function NotePane({
  note,
  dark,
  closing,
  soloMode,
  onClose,
  onOpenFull,
  onSavePatch,
}) {
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(note?.title || "");
  const [bodyDraft, setBodyDraft] = useState(note?.content || "");
  const debounceRef = useRef(null);
  const baselineRef = useRef({ title: note?.title || "", content: note?.content || "" });

  // Re-sync drafts when the note id changes or external updates arrive (and
  // the user is not actively editing — never clobber in-flight typing).
  useEffect(() => {
    if (editing) return;
    setTitleDraft(note?.title || "");
    setBodyDraft(note?.content || "");
    baselineRef.current = { title: note?.title || "", content: note?.content || "" };
  }, [note?.id, note?.title, note?.content, editing]);

  // Debounced auto-save while editing
  useEffect(() => {
    if (!editing || !note?.id) return;
    const titleChanged = titleDraft.trim() !== (baselineRef.current.title || "").trim();
    const bodyChanged =
      note.type === "text" && bodyDraft !== (baselineRef.current.content || "");
    if (!titleChanged && !bodyChanged) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const patch = {};
      if (titleChanged) patch.title = titleDraft.trim();
      if (bodyChanged) patch.content = bodyDraft;
      if (Object.keys(patch).length === 0) return;
      onSavePatch?.(String(note.id), patch, note.type || "text");
      baselineRef.current = {
        title: titleChanged ? titleDraft.trim() : baselineRef.current.title,
        content: bodyChanged ? bodyDraft : baselineRef.current.content,
      };
    }, 700);
    return () => clearTimeout(debounceRef.current);
  }, [titleDraft, bodyDraft, editing, note?.id, note?.type, onSavePatch]);

  // Flush pending edits when leaving edit mode
  const flushAndExitEdit = () => {
    clearTimeout(debounceRef.current);
    if (!note?.id) {
      setEditing(false);
      return;
    }
    const patch = {};
    if (titleDraft.trim() !== (baselineRef.current.title || "").trim()) {
      patch.title = titleDraft.trim();
    }
    if (note.type === "text" && bodyDraft !== (baselineRef.current.content || "")) {
      patch.content = bodyDraft;
    }
    if (Object.keys(patch).length > 0) {
      onSavePatch?.(String(note.id), patch, note.type || "text");
      baselineRef.current = {
        title: patch.title ?? baselineRef.current.title,
        content: patch.content ?? baselineRef.current.content,
      };
    }
    setEditing(false);
  };

  if (!note) return null;

  const bg = modalBgFor(note.color || "default", dark);
  const html = !editing ? getNoteHTML(note) : "";
  const isText = note.type === "text" || !note.type;
  const isChecklist = note.type === "checklist";
  const isDraw = note.type === "draw";

  return (
    <div
      data-sbs-pane
      data-closing={closing ? "true" : "false"}
      className={`sbs-pane glass-card rounded-2xl flex flex-col min-w-0 overflow-hidden ${
        closing ? "sbs-pane--closing" : ""
      } ${soloMode ? "sbs-pane--solo" : ""}`}
      style={{
        background: bg,
        flex: closing ? "0 0 0%" : "1 1 0%",
        opacity: closing ? 0 : 1,
        transform: closing ? "scale(0.92)" : "scale(1)",
        transition: `flex-basis ${PANE_ANIM_MS}ms ease, flex-grow ${PANE_ANIM_MS}ms ease, opacity ${PANE_ANIM_MS}ms ease, transform ${PANE_ANIM_MS}ms ease, max-width ${PANE_ANIM_MS}ms ease`,
        maxWidth: closing ? "0%" : "100%",
        margin: closing ? 0 : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-black/10 dark:border-white/10">
        {editing ? (
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            placeholder=""
            className="flex-1 min-w-0 bg-transparent outline-none text-base font-semibold"
          />
        ) : (
          <h3
            className="flex-1 min-w-0 text-base font-semibold truncate"
            title={note.title || ""}
          >
            {note.title || ""}
          </h3>
        )}
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 flex-shrink-0"
          aria-label={t("close")}
          data-tooltip={t("close")}
        >
          <CloseIcon />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto modal-scroll-themed">
        {isText && editing && (
          <textarea
            autoFocus
            value={bodyDraft}
            onChange={(e) => setBodyDraft(e.target.value)}
            onBlur={flushAndExitEdit}
            className="w-full h-full min-h-[60vh] resize-none bg-transparent outline-none px-4 py-3 text-sm leading-relaxed"
          />
        )}
        {isText && !editing && (
          <div
            onClick={() => setEditing(true)}
            className="px-4 py-3 cursor-text"
          >
            {html ? (
              <div
                className="note-content note-content--dense"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <p className="text-sm opacity-50 italic">—</p>
            )}
          </div>
        )}
        {isChecklist && (
          <div className="px-4 py-3 space-y-2">
            {Array.isArray(note.items) && note.items.length > 0 ? (
              note.items.map((it, i) => (
                <label
                  key={it.id ?? i}
                  className="flex items-start gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={!!it.checked}
                    className="mt-0.5"
                  />
                  <span
                    className={
                      it.checked ? "line-through opacity-60" : ""
                    }
                  >
                    {it.text || ""}
                  </span>
                </label>
              ))
            ) : (
              <p className="text-sm opacity-50 italic">—</p>
            )}
          </div>
        )}
        {isDraw && (
          <div className="px-4 py-3 text-sm opacity-70">—</div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-black/10 dark:border-white/10 text-xs">
        <div className="opacity-60 truncate">
          {note.tags && note.tags.length > 0 ? `#${note.tags.join("  #")}` : ""}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isText && (
            editing ? (
              <button
                type="button"
                onClick={flushAndExitEdit}
                className="px-2.5 py-1 rounded-md border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
              >
                {t("done")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="px-2.5 py-1 rounded-md border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
              >
                {t("edit")}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => {
              flushAndExitEdit();
              onOpenFull?.(String(note.id));
            }}
            className="px-2.5 py-1 rounded-md border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
          >
            {t("openInFullEditor")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SideBySideNotesView({
  pair,
  notes,
  dark,
  onRequestClose,
  onSavePatch,
  onHandoffToSingle,
}) {
  const [closingId, setClosingId] = useState(null);
  const [viewClosing, setViewClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  const closingTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(closingTimerRef.current), []);

  // Trigger enter animation on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const [idA, idB] = pair || [];
  const noteA = useMemo(
    () => (idA ? notes.find((n) => String(n.id) === String(idA)) : null),
    [notes, idA],
  );
  const noteB = useMemo(
    () => (idB ? notes.find((n) => String(n.id) === String(idB)) : null),
    [notes, idB],
  );

  // If a selected note disappears externally (deletion / un-share), bail.
  useEffect(() => {
    if (!pair) return;
    if (!noteA || !noteB) onRequestClose?.();
  }, [pair, noteA, noteB, onRequestClose]);

  const closePane = (idToClose) => {
    if (closingId) return;
    setClosingId(String(idToClose));
    clearTimeout(closingTimerRef.current);
    closingTimerRef.current = setTimeout(() => {
      const remaining = String(idToClose) === String(idA) ? idB : idA;
      // Hand off remaining note to the regular single-note modal so it
      // behaves exactly as if it had been opened alone from the start.
      onHandoffToSingle?.(String(remaining));
    }, PANE_ANIM_MS);
  };

  const closeAll = () => {
    if (viewClosing) return;
    setViewClosing(true);
    clearTimeout(closingTimerRef.current);
    closingTimerRef.current = setTimeout(() => {
      onRequestClose?.();
    }, PANE_ANIM_MS);
  };

  // Escape key closes the whole view
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeAll();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []); // eslint-disable-line

  if (!pair || !noteA || !noteB) return null;

  const onScrimMouseDown = (e) => {
    if (e.target === e.currentTarget) closeAll();
  };

  return (
    <div
      onMouseDown={onScrimMouseDown}
      className={`sbs-scrim fixed inset-0 z-40 bg-black/40 max-sm:bg-black flex items-center justify-center p-3 sm:p-6 overscroll-contain ${
        viewClosing ? "sbs-scrim--closing" : ""
      }`}
      style={{
        opacity: viewClosing ? 0 : entered ? 1 : 0,
        transition: `opacity ${PANE_ANIM_MS}ms ease`,
      }}
    >
      <div
        className="sbs-container w-full h-full max-w-[1600px] flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch justify-center"
        style={{
          transform: viewClosing
            ? "scale(0.97)"
            : entered
              ? "scale(1)"
              : "scale(0.96)",
          opacity: viewClosing ? 0 : entered ? 1 : 0,
          transition: `transform ${PANE_ANIM_MS}ms ease, opacity ${PANE_ANIM_MS}ms ease`,
        }}
      >
        <NotePane
          note={noteA}
          dark={dark}
          closing={closingId === String(idA)}
          soloMode={closingId === String(idB)}
          onClose={() => closePane(idA)}
          onOpenFull={(id) => {
            // Closing the SBS view, then opening the tapped note in full
            // modal — same shape as the handoff path.
            clearTimeout(closingTimerRef.current);
            setViewClosing(true);
            closingTimerRef.current = setTimeout(() => {
              onHandoffToSingle?.(String(id));
            }, PANE_ANIM_MS);
          }}
          onSavePatch={onSavePatch}
        />
        <NotePane
          note={noteB}
          dark={dark}
          closing={closingId === String(idB)}
          soloMode={closingId === String(idA)}
          onClose={() => closePane(idB)}
          onOpenFull={(id) => {
            clearTimeout(closingTimerRef.current);
            setViewClosing(true);
            closingTimerRef.current = setTimeout(() => {
              onHandoffToSingle?.(String(id));
            }, PANE_ANIM_MS);
          }}
          onSavePatch={onSavePatch}
        />
      </div>
    </div>
  );
}
