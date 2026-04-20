import React from "react";
import { t } from "../../i18n";

/**
 * Inline-editable section header. Reads as a plain bold title, turns
 * into a one-line input on click. Onblur with empty title is treated as
 * a rename to "Untitled" — deletion is handled by a dedicated button
 * next to the section to avoid data-loss surprises.
 */
export default function SectionHeader({ section, onRename, onRemove, onEnter }) {
  const [editing, setEditing] = React.useState(!section.title);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = (value) => {
    const next = (value ?? "").trim();
    onRename(next);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 group pt-2">
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          defaultValue={section.title}
          className="flex-1 bg-transparent text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200 focus:outline-none border-0 border-b border-[var(--border-light)] px-0 py-1"
          placeholder={t("sectionTitlePlaceholder")}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(e.currentTarget.value);
              onEnter?.();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
        />
      ) : (
        <h4
          className="flex-1 text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200 cursor-text py-1"
          onClick={() => setEditing(true)}
        >
          {section.title || t("sectionTitlePlaceholder")}
        </h4>
      )}
      <button
        onClick={onRemove}
        data-tooltip={t("removeSection")}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 rounded-full border border-[var(--border-light)] flex items-center justify-center cursor-pointer w-6 h-6 text-sm"
      >
        ✕
      </button>
    </div>
  );
}
