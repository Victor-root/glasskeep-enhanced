import React, { useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { CloseIcon } from "../../icons/index.jsx";
import TI from "../../icons/editor/index.jsx";
import { modalBgFor, scrollColorsFor, solid, bgFor } from "../../utils/colors.js";
import { renderSafeMarkdown } from "../../utils/markdown.jsx";

/**
 * Per-note AI chat panel — sits attached to the right side of NoteModal.
 * The conversation is throwaway by default: the parent (App) clears it
 * on close and never persists it. The user can opt in to keeping the
 * conversation across closes via the save button — that flips the
 * `saved` flag and the parent mirrors the messages to localStorage; a
 * reset button on the header tears the saved copy back down.
 */
export default function NoteAiChatPanel({
  dark,
  mColor,
  open,
  messages,
  loading,
  error,
  saved,
  canSave,
  onSend,
  onStop,
  onClose,
  onSave,
  onReset,
}) {
  const [draft, setDraft] = useState("");
  // Stick-to-bottom: while true, new messages auto-scroll the view
  // down. Flips off as soon as the user scrolls up; flips back on when
  // they return to the bottom or send a new turn. Mirrored into a ref
  // so the scroll-into-view effect (which only re-runs on messages /
  // loading changes) can read the latest value synchronously.
  const [stickToBottom, setStickToBottom] = useState(true);
  const stickToBottomRef = useRef(true);
  const messagesEndRef = useRef(null);
  const messagesScrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (!stickToBottomRef.current) return;
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, loading, open]);

  // 32 px slack so a smooth scroll's tiny rubber-banding doesn't flip
  // stick-to-bottom off by accident.
  const onScroll = () => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const stick = distanceFromBottom < 32;
    if (stickToBottomRef.current !== stick) {
      stickToBottomRef.current = stick;
      // During streaming, skip the state update so the scroll-to-bottom
      // button doesn't flicker as each new line nudges the scroll position.
      // The effect below syncs ref→state once streaming ends.
      if (!loading) setStickToBottom(stick);
    }
  };

  // Sync ref→state after streaming ends so the button appears/disappears.
  useEffect(() => {
    if (!loading) setStickToBottom(stickToBottomRef.current);
  }, [loading]);

  const reArmStickToBottom = () => {
    stickToBottomRef.current = true;
    setStickToBottom(true);
  };

  const submit = () => {
    const q = draft.trim();
    if (!q || loading) return;
    setDraft("");
    reArmStickToBottom();
    onSend?.(q);
  };

  const sendQuick = (prompt) => {
    if (loading) return;
    reArmStickToBottom();
    onSend?.(prompt);
  };

  const scrollToBottomNow = () => {
    reArmStickToBottom();
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open && inputRef.current) {
      const id = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [open]);

  const handleKeyDown = (e) => {
    // Enter sends, Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const stopBubbling = (e) => e.stopPropagation();

  // Same scrollbar palette the note modal uses.
  const sc = scrollColorsFor(mColor, dark);
  // Note's own colour, fully opaque — used as the background of the
  // floating "scroll to bottom" button so it visually belongs to the
  // current note.
  const noteSolid = solid(bgFor(mColor, dark));

  // The save / reset cluster only renders when the parent told us a
  // stable note ID exists (otherwise there's nowhere to persist) and
  // either the user has typed at least one message or the slot is
  // already saved (so they can wipe it).
  const showSaveCtrl = canSave && !saved && messages.length > 0;
  const showResetCtrl = canSave && saved;

  const showScrollBtn = !stickToBottom && messages.length > 0;

  return (
    <aside
      className={`note-ai-panel glass-card rounded-xl shadow-lg flex flex-col overflow-hidden border ${
        dark ? "border-white/10" : "border-[var(--border-light)]"
      }`}
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: modalBgFor(mColor, dark),
      }}
      onMouseDown={stopBubbling}
      onMouseUp={stopBubbling}
      onClick={stopBubbling}
    >
      {/* Header */}
      <div
        className={`flex items-center gap-2 px-4 py-3 border-b ${
          dark ? "border-white/10" : "border-[var(--border-light)]"
        }`}
      >
        <TI.MessageSearch className="tabler-icon text-indigo-600 dark:text-indigo-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 truncate">
            {t("noteAiChatTitle")}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-200 truncate">
            {saved ? t("noteAiChatSavedBadge") : t("noteAiChatSubtitle")}
          </p>
        </div>
        {showSaveCtrl && (
          <button
            type="button"
            onClick={onSave}
            aria-label={t("noteAiChatSave")}
            data-tooltip={t("noteAiChatSave")}
            className="note-ai-save-btn w-9 h-9 inline-flex items-center justify-center rounded-lg transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
          >
            <TI.Message2Down className="tabler-icon w-5 h-5" />
          </button>
        )}
        {showResetCtrl && (
          <button
            type="button"
            onClick={onReset}
            aria-label={t("noteAiChatReset")}
            data-tooltip={t("noteAiChatReset")}
            className="note-ai-save-btn w-9 h-9 inline-flex items-center justify-center rounded-lg transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
          >
            <TI.Message2X className="tabler-icon w-5 h-5" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("noteAiChatClose")}
          data-tooltip={t("noteAiChatClose")}
          className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Messages area + floating scroll-to-bottom shortcut */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={messagesScrollRef}
          onScroll={onScroll}
          className="absolute inset-0 overflow-y-auto px-4 py-3 modal-scroll-themed flex flex-col"
          style={{ "--sb-thumb": sc.thumb, "--sb-track": sc.track }}
        >
          {messages.length === 0 && !loading && !error && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 py-6">
              <p className="text-sm text-center text-gray-400 dark:text-gray-300 leading-relaxed max-w-[260px]">
                {t("noteAiChatEmpty")}
              </p>
              <div className="grid grid-cols-2 gap-3 w-1/2">
                <button
                  type="button"
                  onClick={() => sendQuick(t("noteAiChatQuickSummarizePrompt"))}
                  className="flex flex-col items-center gap-1 py-1.5 px-2 rounded-lg font-semibold text-xs transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                >
                  <TI.FileText className="tabler-icon" style={{ width: 14, height: 14 }} />
                  {t("noteAiChatQuickSummarize")}
                </button>
                <button
                  type="button"
                  onClick={() => sendQuick(t("noteAiChatQuickExplainPrompt"))}
                  className="flex flex-col items-center gap-1 py-1.5 px-2 rounded-lg font-semibold text-xs transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                >
                  <TI.Sparkles className="tabler-icon" style={{ width: 14, height: 14 }} />
                  {t("noteAiChatQuickExplain")}
                </button>
              </div>
            </div>
          )}

          <ul className="flex flex-col gap-3">
            {messages.map((m, i) => {
              const isUser = m.role === "user";
              const showTop = isUser && i > 0;
              const showBottom = isUser && i < messages.length - 1;
              // While streaming, keep the active assistant message as plain
              // text so React doesn't replace the DOM node on every chunk —
              // which would destroy any in-progress browser text selection.
              const isStreaming =
                loading && i === messages.length - 1 && m.role === "assistant";
              return (
                <li key={i} className="flex flex-col gap-2">
                  {showTop && (
                    <div className="h-px bg-gradient-to-r from-transparent via-indigo-500/70 to-transparent dark:via-indigo-400/70" />
                  )}
                  <div className={`flex ${isUser ? "justify-end" : "justify-stretch"}`}>
                    {isUser ? (
                      <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words bg-indigo-600 text-white">
                        {m.content}
                      </div>
                    ) : isStreaming ? (
                      <div
                        className={`w-full px-1 py-1 text-sm whitespace-pre-wrap break-words ${
                          dark ? "text-white" : "text-gray-800"
                        }`}
                      >
                        {m.content}
                      </div>
                    ) : (
                      <div
                        className={`note-content note-content--dense w-full px-1 py-1 text-sm break-words ${
                          dark ? "text-white" : "text-gray-800"
                        }`}
                        dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(m.content) }}
                      />
                    )}
                  </div>
                  {showBottom && (
                    <div className="h-px bg-gradient-to-r from-transparent via-violet-500/70 to-transparent dark:via-violet-400/70" />
                  )}
                </li>
              );
            })}
            {loading
              && (messages.length === 0
                || messages[messages.length - 1]?.role !== "assistant") && (
              <li className="flex justify-start">
                <div
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    dark ? "bg-white/10 text-white" : "bg-black/10 text-gray-700"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" />
                  {t("noteAiChatThinking")}
                </div>
              </li>
            )}
          </ul>

          <div ref={messagesEndRef} />
        </div>

        {/* Floating "back to bottom" shortcut. Sits over the scroll
            container so it's always reachable, themed in the note's
            own colour to feel like part of the current page. */}
        {showScrollBtn && (
          <button
            type="button"
            onClick={scrollToBottomNow}
            aria-label={t("noteAiChatScrollDown")}
            data-tooltip={t("noteAiChatScrollDown")}
            className="absolute bottom-3 right-3 w-9 h-9 rounded-full flex items-center justify-center shadow-md border border-black/10 dark:border-white/10 hover:scale-105 active:scale-95 transition-transform text-indigo-700 dark:text-indigo-200"
            style={{ backgroundColor: noteSolid }}
          >
            <TI.ArrowDown className="tabler-icon w-5 h-5" />
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 text-sm border-t border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Input */}
      <div
        className={`border-t px-3 py-3 ${
          dark ? "border-white/10" : "border-[var(--border-light)]"
        }`}
      >
        <div className="flex items-center gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("noteAiChatPlaceholder")}
            rows={2}
            disabled={loading}
            className={`flex-1 resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400 bg-transparent ${
              dark ? "border-white/15" : "border-[var(--border-light)]"
            } disabled:opacity-60`}
            style={{ maxHeight: "8rem" }}
          />
          {loading ? (
            <button
              type="button"
              onClick={onStop}
              aria-label={t("noteAiChatStop")}
              data-tooltip={t("noteAiChatStop")}
              className="shrink-0 px-3 py-2 rounded-lg font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient inline-flex items-center gap-1.5"
            >
              <TI.PlayerStopFilled className="tabler-icon w-4 h-4" />
              {t("noteAiChatStop")}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim()}
              className="shrink-0 px-3 py-2 rounded-lg font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("noteAiChatSend")}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
