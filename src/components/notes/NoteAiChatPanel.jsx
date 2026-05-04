import React, { useEffect, useRef } from "react";
import { t } from "../../i18n";
import { CloseIcon } from "../../icons/index.jsx";
import TI from "../../icons/editor/index.jsx";
import { modalBgFor, scrollColorsFor } from "../../utils/colors.js";
import { renderSafeMarkdown } from "../../utils/markdown.jsx";

/**
 * Per-note AI chat panel — sits attached to the right side of NoteModal.
 * The conversation is purely temporary: state lives in the parent (App),
 * is reset when the panel or the note closes, and is never persisted or
 * synced. This component is presentational + minimal local state for the
 * input draft only.
 */
export default function NoteAiChatPanel({
  dark,
  mColor,
  open,
  messages,
  loading,
  error,
  onSend,
  onClose,
  // Computed by the parent so the panel can absorb whatever horizontal
  // space is left over once the modal has its full 4xl width. Falls
  // back to a sensible default when not provided.
  width,
}) {
  const [draft, setDraft] = React.useState("");
  const messagesEndRef = useRef(null);
  const messagesScrollRef = useRef(null);
  const inputRef = useRef(null);
  // Whether new chunks should yank the view to the bottom. Flips off
  // the moment the user scrolls up, flips back on when they return to
  // the bottom — gives them free read-up control while a stream is in
  // flight without sacrificing the "follow the answer" default.
  const stickToBottomRef = useRef(true);

  // Auto-scroll to the latest message ONLY when the user is already
  // pinned to the bottom. If they scrolled up to re-read something
  // mid-stream, we leave their view alone.
  useEffect(() => {
    if (!open) return;
    if (!stickToBottomRef.current) return;
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, loading, open]);

  // Track scroll position so we can decide whether the next chunk
  // should auto-scroll. A 32 px slack means tiny rubber-banding from
  // smooth scrolls doesn't immediately disable stick-to-bottom.
  const onScroll = () => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 32;
  };

  // Re-arm stick-to-bottom whenever the user fires a new turn — they
  // clearly want to see the new answer, even if they had scrolled up
  // earlier.
  const submit = () => {
    const q = draft.trim();
    if (!q || loading) return;
    setDraft("");
    stickToBottomRef.current = true;
    onSend?.(q);
  };

  const sendQuick = (prompt) => {
    if (loading) return;
    stickToBottomRef.current = true;
    onSend?.(prompt);
  };

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open && inputRef.current) {
      const id = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (e) => {
    // Enter sends, Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const stopBubbling = (e) => e.stopPropagation();

  // Same scrollbar palette the note modal uses, so the chat scrollbar
  // reads as a continuation of the note's themed scrollbar.
  const sc = scrollColorsFor(mColor, dark);

  // Effective panel width — prefer the parent-computed value (which
  // sizes to the leftover viewport space), fall back to a sane min/max
  // pair if the prop is missing for any reason.
  const panelWidth =
    typeof width === "number" && Number.isFinite(width) && width > 0
      ? width
      : 520;

  return (
    <aside
      className={`note-ai-panel glass-card rounded-xl shadow-lg flex flex-col overflow-hidden border ${
        dark ? "border-white/10" : "border-[var(--border-light)]"
      }`}
      style={{
        width: `${panelWidth}px`,
        height: "95vh",
        flexShrink: 0,
        // Match the note modal's exact background — same colour key,
        // same opacity treatment via modalBgFor — so the panel reads as
        // an extension of the modal rather than a translucent overlay.
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
            {t("noteAiChatSubtitle")}
          </p>
        </div>
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

      {/* Messages area */}
      <div
        ref={messagesScrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-4 py-3 modal-scroll-themed"
        style={{ minHeight: 0, "--sb-thumb": sc.thumb, "--sb-track": sc.track }}
      >
        {messages.length === 0 && !loading && !error && (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-gray-500 dark:text-gray-200 leading-relaxed">
              {t("noteAiChatEmpty")}
            </div>
            {/* Quick actions — only visible while the conversation is
                empty. Clicking sends the corresponding prompt, after
                which the chips disappear so they don't clutter the
                follow-up turns. */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => sendQuick(t("noteAiChatQuickSummarizePrompt"))}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("noteAiChatQuickSummarize")}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => sendQuick(t("noteAiChatQuickExplainPrompt"))}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("noteAiChatQuickExplain")}
              </button>
            </div>
          </div>
        )}

        <ul className="flex flex-col gap-3">
          {messages.map((m, i) => {
            // Brand-gradient separators frame the user's prompt so it
            // stands out between assistant turns. Skip the top rule on
            // the very first message (there's nothing above) and the
            // bottom rule on the last message (we add it once the AI
            // has actually replied — i.e. another message follows).
            const isUser = m.role === "user";
            const showTop = isUser && i > 0;
            const showBottom = isUser && i < messages.length - 1;
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
          <button
            type="button"
            onClick={submit}
            disabled={loading || !draft.trim()}
            className="shrink-0 px-3 py-2 rounded-lg font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("noteAiChatSend")}
          </button>
        </div>
      </div>
    </aside>
  );
}
