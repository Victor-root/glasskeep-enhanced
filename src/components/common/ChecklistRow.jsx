import React from "react";
import { t } from "../../i18n";
import { linkifyPhoneNumbers } from "../../utils/markdown.jsx";

export default function ChecklistRow({
  item,
  onToggle,
  onChange,
  onRemove,
  readOnly,
  disableToggle = false,
  showRemove = false,
  size = "md", // "sm" | "md" | "lg"
  preview = false,
  initialEditing = false,
}) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 700;
  const [editing, setEditing] = React.useState(initialEditing);
  const clickOffsetRef = React.useRef(null);
  const textareaRef = React.useRef(null);

  React.useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
      el.focus();
      const pos = clickOffsetRef.current ?? el.value.length;
      el.setSelectionRange(pos, pos);
      clickOffsetRef.current = null;
    }
  }, [editing]);

  const boxSize =
    size === "lg"
      ? "h-4 w-4"
      : size === "sm"
        ? "h-4 w-4 md:h-3.5 md:w-3.5"
        : "h-3.5 w-3.5 sm:h-5 sm:w-5 md:h-4 md:w-4";

  const removeSize =
    size === "lg"
      ? "w-6 h-6 text-lg font-semibold"
      : size === "sm"
        ? "w-5 h-5 text-xs md:w-4 md:h-4"
        : "w-6 h-6 text-sm md:w-5 md:h-5";

  const removeVisibility = showRemove
    ? "opacity-80 hover:opacity-100"
    : "opacity-0 group-hover:opacity-100";

  return (
    <div className="flex items-center gap-1.5 sm:gap-3 md:gap-2 group min-w-0">
      <input
        type="checkbox"
        className={`shrink-0 ${boxSize} ${preview ? "pointer-events-none" : "cursor-pointer"}`}
        checked={!!item.done}
        onChange={(e) => {
          e.stopPropagation();
          onToggle?.(e.target.checked, e);
        }}
        onClick={(e) => e.stopPropagation()}
        disabled={!!disableToggle || preview}
      />
      {readOnly || (!editing && !readOnly) ? (
        <span
          className={`flex-1 text-sm break-words min-w-0 ${preview ? "line-clamp-3" : ""} ${!readOnly ? "cursor-pointer" : ""} ${item.done ? "line-through text-gray-500 dark:text-gray-400" : ""}`}
          onClick={!readOnly ? (e) => {
            e.stopPropagation();
            let offset = item.text.length;
            const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
            if (range) offset = range.startOffset;
            clickOffsetRef.current = offset;
            setEditing(true);
          } : undefined}
        >
          {isMobile && !preview ? linkifyPhoneNumbers(item.text) : item.text}
        </span>
      ) : (
        <textarea
          rows={1}
          className={`flex-1 bg-transparent text-sm focus:outline-none border-0 border-b border-transparent focus:border-[var(--border-light)] m-0 p-0 pb-0.5 resize-none overflow-hidden break-words min-w-0 ${item.done ? "line-through text-gray-500 dark:text-gray-400" : ""}`}
          value={item.text}
          onChange={(e) => {
            onChange?.(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          onBlur={() => {
            setEditing(false);
            if (!item.text.trim()) onRemove?.();
          }}
          ref={textareaRef}
          placeholder={t("listItem")}
        />
      )}

      {(showRemove || !readOnly) && (
        <button
          className={`${removeVisibility} transition-opacity text-gray-500 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 rounded-full border border-[var(--border-light)] flex items-center justify-center cursor-pointer ${removeSize}`}
          data-tooltip={t("removeItem")}
          onClick={onRemove}
        >
          ✕
        </button>
      )}
    </div>
  );
}
