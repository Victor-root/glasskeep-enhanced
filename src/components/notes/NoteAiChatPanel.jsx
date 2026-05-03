import React, { useEffect, useRef } from "react";
import { t } from "../../i18n";
import { Sparkles, CloseIcon } from "../../icons/index.jsx";

/**
 * Per-note AI chat panel — sits attached to the right side of NoteModal.
 * The conversation is purely temporary: state lives in the parent (App),
 * is reset when the panel or the note closes, and is never persisted or
 * synced. This component is presentational + minimal local state for the
 * input draft only.
 */
export default function NoteAiChatPanel({
  dark,
  open,
  messages,
  loading,
  error,
  onSend,
  onClose,
}) {
  const [draft, setDraft] = React.useState("");
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to the latest message when the list grows or a new
  // assistant turn is appended.
  useEffect(() => {
    if (!open) return;
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, loading, open]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open && inputRef.current) {
      const id = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const q = draft.trim();
    if (!q || loading) return;
    setDraft("");
    onSend?.(q);
  };

  const handleKeyDown = (e) => {
    // Enter sends, Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const stopBubbling = (e) => e.stopPropagation();

  return (
    <aside
      className={`note-ai-panel glass-card rounded-xl shadow-lg flex flex-col overflow-hidden border ${
        dark
          ? "border-white/10 bg-[rgba(34,34,34,0.95)]"
          : "border-[var(--border-light)] bg-white"
      }`}
      style={{
        width: "min(420px, 32vw)",
        maxWidth: "420px",
        height: "95vh",
        flexShrink: 0,
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
        <Sparkles className="text-indigo-600 dark:text-indigo-400" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 truncate">
            {t("noteAiChatTitle")}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
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
        className="flex-1 overflow-y-auto px-4 py-3 mobile-hide-scrollbar"
        style={{ minHeight: 0 }}
      >
        {messages.length === 0 && !loading && !error && (
          <div className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            {t("noteAiChatEmpty")}
          </div>
        )}

        <ul className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <li
              key={i}
              className={`flex ${
                m.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white"
                    : dark
                    ? "bg-white/10 text-gray-100"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {m.content}
              </div>
            </li>
          ))}
          {loading && (
            <li className="flex justify-start">
              <div
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  dark ? "bg-white/10 text-gray-300" : "bg-gray-100 text-gray-600"
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
        <div className="flex items-end gap-2">
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
            className="shrink-0 px-3 py-2 rounded-lg font-semibold text-sm bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("noteAiChatSend")}
          </button>
        </div>
      </div>
    </aside>
  );
}
