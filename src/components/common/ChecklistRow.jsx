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
}) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 700;
  const [editing, setEditing] = React.useState(false);

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
          className={`text-sm break-words min-w-0 ${!readOnly ? "cursor-pointer" : ""} ${item.done ? "line-through text-gray-500 dark:text-gray-400" : ""}`}
          onClick={!readOnly ? (e) => { e.stopPropagation(); setEditing(true); } : undefined}
        >
          {isMobile && !preview ? linkifyPhoneNumbers(item.text) : item.text}
        </span>
      ) : (
        <textarea
          rows={1}
          className={`flex-1 bg-transparent text-sm focus:outline-none border-b border-transparent focus:border-[var(--border-light)] pb-0.5 resize-none overflow-hidden ${item.done ? "line-through text-gray-500 dark:text-gray-400" : ""}`}
          value={item.text}
          onChange={(e) => {
            onChange?.(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          onBlur={() => setEditing(false)}
          autoFocus
          ref={(el) => {
            if (el) {
              el.style.height = "auto";
              el.style.height = el.scrollHeight + "px";
            }
          }}
          placeholder={t("listItem")}
        />
      )}

      {(showRemove || !readOnly) && (
        <button
          className={`${removeVisibility} transition-opacity text-gray-500 hover:text-red-600 rounded-full border border-[var(--border-light)] flex items-center justify-center cursor-pointer ${removeSize}`}
          data-tooltip={t("removeItem")}
          onClick={onRemove}
        >
          ✕
        </button>
      )}
    </div>
  );
}
